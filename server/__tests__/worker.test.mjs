import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../worker.js';

/**
 * Testes do worker.
 *
 * Ele e um modulo estilo Cloudflare - export default { fetch(req, env) } -
 * entao roda igual dentro do Vitest: Requests reais, `env` de mentira e
 * todo fetch de saida interceptado.
 *
 * O que se prova aqui e o que nenhum teste de front alcanca: quem pode
 * pagar, quem pode confirmar pagamento, o que e repassado ao Google e o
 * que acontece quando falta um segredo. Sao as tres operacoes que o
 * navegador NAO pode fazer.
 */

const AGENDAMENTO = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USUARIO = '11111111-2222-3333-4444-555555555555';

const ENV = {
  GEMINI_API_KEY: 'chave-gemini',
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_SERVICE_KEY: 'service-role-secreta',
  JITSI_BASE: 'https://meet.jit.si',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

let saidas = [];

/** Respostas do "mundo externo", sobrescreviveis por teste. */
function mundo({ agendamento = {}, usuario = { id: USUARIO }, pagamento } = {}) {
  return [
    ['/auth/v1/user', () => (usuario ? json(usuario) : json({}, 401))],
    ['/rest/v1/agendamentos', () =>
      json([{ id: AGENDAMENTO, aluno_id: USUARIO, responsavel_id: null,
              valor_centavos: 15000, status_pagamento: 'pendente', ...agendamento }])],
    ['/rest/v1/rpc/confirmar_pagamento_consulta', () => json({})],
    ['/rest/v1/notificacoes', () => json([{ id: 'n1', user_id: USUARIO, titulo: 'Alerta', corpo: 'texto' }])],
    ['/rest/v1/perfis', () => json([{ email: 'mae@test.br' }])],
    ['generativelanguage', () => json({ candidates: [{ content: { parts: [{ text: 'oi' }] } }] })],
    ['texttospeech', () => json({ audioContent: 'QUJD' })],
    ['api.mercadopago.com/checkout/preferences', () => json({ init_point: 'https://mp/checkout/xyz', id: 'pref-1' })],
    ['api.mercadopago.com/v1/payments', () =>
      json(pagamento ?? { status: 'approved', external_reference: AGENDAMENTO, id: 'pay-9' })],
    ['api.resend.com', () => json({ id: 'email-1' })],
  ];
}

async function chamar(caminho, { metodo = 'POST', corpo, cabecalhos = {}, env = ENV, respostas } = {}) {
  saidas = [];
  const rotas = respostas ?? mundo();
  vi.stubGlobal('fetch', async (url, init = {}) => {
    const u = String(url);
    saidas.push({ url: u, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    for (const [padrao, resposta] of rotas) if (u.includes(padrao)) return resposta();
    return json({});
  });

  const resposta = await worker.fetch(
    new Request('https://worker.dev' + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...cabecalhos },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    }),
    env,
  );

  let dados = null;
  try { dados = JSON.parse(await resposta.clone().text()); } catch { /* nao-json */ }
  return { status: resposta.status, dados, headers: resposta.headers, saidas };
}

const saidaPara = (r, trecho) => r.saidas.find((s) => s.url.includes(trecho));

beforeEach(() => vi.unstubAllGlobals());

describe('rotas basicas', () => {
  it('health informa em que modo o worker esta', async () => {
    const r = await chamar('/health', { metodo: 'GET' });
    expect(r.status).toBe(200);
    // "simulado" = sem chave de pagamento. Publicar assim e dar consulta
    // de graca, por isso o modo aparece no health.
    expect(r.dados.pagamento).toBe('simulado');
    expect(r.dados.tts).toBe(false);

    const comMp = await chamar('/health', { metodo: 'GET', env: { ...ENV, MP_ACCESS_TOKEN: 'x' } });
    expect(comMp.dados.pagamento).toBe('mercadopago');
  });

  it('responde ao preflight liberando o cabecalho de sessao', async () => {
    const r = await chamar('/generate', { metodo: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Headers')).toContain('X-Supabase-Auth');
  });

  it('rota desconhecida da 404', async () => {
    expect((await chamar('/inexistente')).status).toBe(404);
  });
});

describe('/generate', () => {
  it('encaminha ao Gemini com a chave do servidor', async () => {
    const r = await chamar('/generate', { corpo: { contents: [{ parts: [{ text: 'oi' }] }] } });
    expect(r.status).toBe(200);
    expect(saidaPara(r, 'generativelanguage').url).toContain('key=chave-gemini');
  });

  it('nao deixa o cliente escolher um modelo fora da lista', async () => {
    const r = await chamar('/generate', { corpo: { model: 'gemini-1.5-pro-caro', contents: [] } });
    expect(saidaPara(r, 'generativelanguage').url).toContain('gemini-2.0-flash');
  });

  it('sem GEMINI_API_KEY responde 500 em vez de chamar o Google', async () => {
    const r = await chamar('/generate', { corpo: {}, env: { ...ENV, GEMINI_API_KEY: '' } });
    expect(r.status).toBe(500);
    expect(saidaPara(r, 'generativelanguage')).toBeUndefined();
  });

  it('respeita o API_TOKEN quando configurado', async () => {
    const env = { ...ENV, API_TOKEN: 'segredo' };
    expect((await chamar('/generate', { corpo: {}, env, cabecalhos: { Authorization: 'Bearer errado' } })).status).toBe(401);
    expect((await chamar('/generate', { corpo: { contents: [] }, env, cabecalhos: { Authorization: 'Bearer segredo' } })).status).toBe(200);
  });

  it('corpo invalido responde 400', async () => {
    expect((await chamar('/generate', { corpo: undefined })).status).toBe(400);
  });
});

describe('/tts', () => {
  const envTts = { ...ENV, GOOGLE_TTS_KEY: 'chave-tts' };

  it('sem chave responde 503 - o app cai na voz do sistema', async () => {
    expect((await chamar('/tts', { corpo: { texto: 'ola' } })).status).toBe(503);
  });

  it('texto vazio ou so com espacos nao vai para a API paga', async () => {
    expect((await chamar('/tts', { corpo: { texto: '   ' }, env: envTts })).status).toBe(400);
  });

  it('sintetiza com a voz pedida e perfil de fone', async () => {
    const r = await chamar('/tts', {
      corpo: { texto: 'Roteiro', voz: 'pt-BR-Neural2-A', velocidade: 1.1 }, env: envTts,
    });
    expect(r.dados).toEqual({ audioBase64: 'QUJD', mime: 'audio/mpeg' });

    const enviado = saidaPara(r, 'texttospeech').body;
    expect(enviado.voice).toEqual({ languageCode: 'pt-BR', name: 'pt-BR-Neural2-A' });
    expect(enviado.audioConfig.effectsProfileId).toEqual(['headphone-class-device']);
  });

  it('sanitiza voz, velocidade e tamanho do texto', async () => {
    const vozRuim = await chamar('/tts', { corpo: { texto: 'x', voz: 'en-US-Hacker; drop' }, env: envTts });
    expect(saidaPara(vozRuim, 'texttospeech').body.voice.name).toBe('pt-BR-Neural2-B');

    const rapido = await chamar('/tts', { corpo: { texto: 'x', velocidade: 99 }, env: envTts });
    expect(saidaPara(rapido, 'texttospeech').body.audioConfig.speakingRate).toBe(1.6);

    const longo = await chamar('/tts', { corpo: { texto: 'a'.repeat(9000) }, env: envTts });
    expect(saidaPara(longo, 'texttospeech').body.input.text).toHaveLength(4800);
  });
});

describe('/pagamento', () => {
  const comSessao = { 'X-Supabase-Auth': 'jwt' };

  it('exige sessao do Supabase', async () => {
    const r = await chamar('/pagamento', { corpo: { agendamentoId: AGENDAMENTO }, respostas: mundo({ usuario: null }) });
    expect(r.status).toBe(401);
  });

  it('nao deixa pagar consulta de terceiro', async () => {
    const r = await chamar('/pagamento', {
      corpo: { agendamentoId: AGENDAMENTO }, cabecalhos: comSessao,
      respostas: mundo({ agendamento: { aluno_id: 'outro', responsavel_id: 'outro-ainda' } }),
    });
    expect(r.status).toBe(403);
  });

  it('nao cobra duas vezes a mesma consulta', async () => {
    const r = await chamar('/pagamento', {
      corpo: { agendamentoId: AGENDAMENTO }, cabecalhos: comSessao,
      respostas: mundo({ agendamento: { status_pagamento: 'pago' } }),
    });
    expect(r.status).toBe(409);
  });

  it('modo demonstracao confirma na hora e cria a sala', async () => {
    const r = await chamar('/pagamento', { corpo: { agendamentoId: AGENDAMENTO }, cabecalhos: comSessao });
    expect(r.dados.confirmadoNaHora).toBe(true);
    expect(r.dados.meetingUrl).toMatch(/^https:\/\//);

    const rpc = saidaPara(r, 'confirmar_pagamento_consulta');
    expect(rpc.body.p_agendamento).toBe(AGENDAMENTO);
    // A sala carrega o id do agendamento + sufixo aleatorio (nao adivinhavel).
    expect(rpc.body.p_meeting_url).toContain('ampli-aaaaaaaabbbb');
  });

  it('modo real devolve checkout e NAO confirma nada', async () => {
    const r = await chamar('/pagamento', {
      corpo: { agendamentoId: AGENDAMENTO, valorCentavos: 15000, emailPagador: 'mae@test.br' },
      cabecalhos: comSessao, env: { ...ENV, MP_ACCESS_TOKEN: 'mp-token' },
    });

    expect(r.dados.checkoutUrl).toBe('https://mp/checkout/xyz');
    expect(saidaPara(r, 'confirmar_pagamento_consulta')).toBeUndefined();

    const pref = saidaPara(r, 'preferences').body;
    expect(pref.external_reference).toBe(AGENDAMENTO);
    expect(pref.items[0].unit_price).toBe(150); // centavos -> reais
    expect(pref.notification_url).toMatch(/\/webhook\/pagamento$/);
  });
});

describe('/webhook/pagamento', () => {
  const env = { ...ENV, MP_ACCESS_TOKEN: 'mp-token', MP_WEBHOOK_SECRET: 'sh' };

  it('recusa webhook sem o segredo', async () => {
    const r = await chamar('/webhook/pagamento', { corpo: { data: { id: 'pay-9' } }, env });
    expect(r.status).toBe(401);
  });

  it('confere o pagamento na origem antes de liberar a sala', async () => {
    const r = await chamar('/webhook/pagamento?secret=sh', { corpo: { data: { id: 'pay-9' } }, env });
    expect(r.status).toBe(200);
    expect(saidaPara(r, '/v1/payments/pay-9')).toBeDefined();

    const rpc = saidaPara(r, 'confirmar_pagamento_consulta');
    expect(rpc.body.p_agendamento).toBe(AGENDAMENTO);
    expect(rpc.body.p_ref).toBe('pay-9');
  });

  it('pagamento pendente nao libera a sala', async () => {
    const r = await chamar('/webhook/pagamento?secret=sh', {
      corpo: { data: { id: 'pay-9' } }, env,
      respostas: mundo({ pagamento: { status: 'pending', external_reference: AGENDAMENTO } }),
    });
    expect(r.status).toBe(200);
    expect(saidaPara(r, 'confirmar_pagamento_consulta')).toBeUndefined();
  });
});

describe('/notify/drain', () => {
  it('envia a fila e marca como enviada', async () => {
    const env = { ...ENV, RESEND_API_KEY: 'resend', EMAIL_REMETENTE: 'Ampli <a@b.c>' };
    const r = await chamar('/notify/drain', { env });

    expect(r.dados.enviadas).toBe(1);
    expect(saidaPara(r, 'resend').body.to).toEqual(['mae@test.br']);
    expect(saidaPara(r, 'notificacoes?id=eq.n1').method).toBe('PATCH');
  });

  it('sem provedor de e-mail nao quebra a fila', async () => {
    const r = await chamar('/notify/drain');
    expect(r.status).toBe(200);
    expect(r.dados.enviadas).toBe(0);
  });
});
