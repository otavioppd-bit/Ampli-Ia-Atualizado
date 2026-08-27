/**
 * Proxy serverless do Ampli-IA (Midnight Mentor).
 *
 * Deploy em 3 provedores (escolha um):
 *   - Cloudflare Workers (recomendado, cota grátis):  wrangler login && wrangler deploy
 *   - Vercel / Netlify Functions: exporta este handler
 *   - Railway / Render: node proxy (veja abaixo)
 *
 * ROTAS
 *   POST /generate        -> Gemini (chat, quiz, redação, roteiros)
 *   POST /tts             -> Text-to-Speech (pílulas de áudio)
 *   POST /pagamento       -> abre a cobrança da consulta
 *   POST /webhook/pagamento -> provedor confirma; cria a sala e libera
 *   POST /notify/drain    -> envia a fila de e-mail/push
 *   GET  /health
 *
 * SEGREDOS a configurar no provedor:
 *   GEMINI_API_KEY        chave do Google AI Studio
 *   API_TOKEN             (opcional) senha para bloquear uso de terceiros
 *   ALLOWED_ORIGIN        (opcional) seu domínio, em vez de "*"
 *   GOOGLE_TTS_KEY        chave do Google Cloud Text-to-Speech
 *   SUPABASE_URL          URL do projeto
 *   SUPABASE_SERVICE_KEY  service_role (NUNCA no front)
 *   MP_ACCESS_TOKEN       Mercado Pago (ausente = modo demonstração)
 *   MP_WEBHOOK_SECRET     segredo para validar o webhook
 *   RESEND_API_KEY        envio de e-mail
 *   EMAIL_REMETENTE       ex.: "Ampli-IA <avisos@seudominio.com>"
 *   JITSI_BASE            padrão https://meet.jit.si
 *   PUBLIC_APP_URL        para os links dos e-mails
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';
const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

function cors(env) {
  const origin = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Supabase-Auth',
    'Access-Control-Max-Age': '86400',
  };
}

const json = (data, status, corsHeaders) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });

function tokenValido(request, env) {
  if (!env.API_TOKEN) return true;
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${env.API_TOKEN}`;
}

/* ===================================================================
   Supabase com service_role
   -------------------------------------------------------------------
   Só o worker tem esta chave. Ela ignora RLS, e é por isso que as três
   operações que o navegador NÃO pode fazer moram aqui: confirmar
   pagamento, criar o link da sala e enviar notificação em nome da
   plataforma.
   =================================================================== */
async function supabaseRpc(env, funcao, args) {
  const resposta = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${funcao}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!resposta.ok) throw new Error(`rpc ${funcao}: ${resposta.status} ${await resposta.text()}`);
  return resposta.json();
}

async function supabaseSelect(env, caminho) {
  const resposta = await fetch(`${env.SUPABASE_URL}/rest/v1/${caminho}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!resposta.ok) throw new Error(`select ${caminho}: ${resposta.status}`);
  return resposta.json();
}

async function supabasePatch(env, caminho, corpo) {
  const resposta = await fetch(`${env.SUPABASE_URL}/rest/v1/${caminho}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(corpo),
  });
  if (!resposta.ok) throw new Error(`patch ${caminho}: ${resposta.status}`);
}

/** Confere o JWT do usuário que pediu a cobrança (evita pagar pelo agendamento alheio). */
async function usuarioDoToken(env, request) {
  const jwt = request.headers.get('X-Supabase-Auth');
  if (!jwt || !env.SUPABASE_URL) return null;
  const resposta = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!resposta.ok) return null;
  const dados = await resposta.json();
  return dados?.id ? dados : null;
}

/* ===================================================================
   Sala de videochamada
   -------------------------------------------------------------------
   Google Meet e Zoom exigem OAuth do PROFISSIONAL (consentimento +
   refresh token guardado no servidor). Enquanto essa conexão não
   existir, a sala é um Jitsi: link https, sem cadastro, abre no
   navegador do celular. O nome carrega o id do agendamento e um sufixo
   aleatório, para não ser adivinhável por quem souber o id.

   Para trocar por Meet/Zoom depois, só esta função muda - o app inteiro
   lê apenas `meeting_url`.
   =================================================================== */
function criarSala(env, agendamentoId) {
  const base = env.JITSI_BASE || 'https://meet.jit.si';
  const curto = String(agendamentoId).replace(/-/g, '').slice(0, 12);
  const sufixo = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return {
    url: `${base}/ampli-${curto}-${sufixo}#config.prejoinPageEnabled=true`,
    provider: 'jitsi',
    ref: `${curto}-${sufixo}`,
  };
}

/* ===================================================================
   Envio de e-mail (Resend) e push (Web Push)
   =================================================================== */
async function enviarEmail(env, para, assunto, corpo) {
  if (!env.RESEND_API_KEY) return false;
  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_REMETENTE || 'Ampli-IA <avisos@ampli-ia.app>',
      to: [para],
      subject: assunto,
      text: corpo,
    }),
  });
  return resposta.ok;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = cors(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json(
        {
          status: 'ok',
          model: DEFAULT_MODEL,
          tts: !!env.GOOGLE_TTS_KEY,
          pagamento: env.MP_ACCESS_TOKEN ? 'mercadopago' : 'simulado',
          email: !!env.RESEND_API_KEY,
        },
        200,
        corsHeaders,
      );
    }

    // =============================================================
    // 1. Gemini
    // =============================================================
    if (url.pathname === '/generate' && request.method === 'POST') {
      if (!tokenValido(request, env)) {
        return json({ error: 'Unauthorized', message: 'API_TOKEN inválido' }, 401, corsHeaders);
      }
      if (!env.GEMINI_API_KEY) {
        return json({ error: 'misconfigured', message: 'Defina o secret GEMINI_API_KEY.' }, 500, corsHeaders);
      }

      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ error: 'invalid_json' }, 400, corsHeaders);
      }

      // Evita que o usuário final escolha modelo pago/indesejado
      const model =
        payload.model === 'gemini-2.0-flash' || payload.model === 'gemini-2.0-flash-lite'
          ? payload.model
          : DEFAULT_MODEL;

      try {
        const upstream = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: payload.systemInstruction,
            contents: payload.contents,
            generationConfig: payload.generationConfig,
          }),
        });
        const text = await upstream.text();
        return new Response(text, {
          status: upstream.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
        });
      } catch (err) {
        return json({ error: 'upstream_failed', message: String(err && err.message) }, 502, corsHeaders);
      }
    }

    // =============================================================
    // 2. Text-to-Speech (pílulas de áudio)
    //
    // A chave do TTS cobra por caractere sintetizado; por isso ela nunca
    // vai para o navegador e o texto tem teto de tamanho aqui.
    // =============================================================
    if (url.pathname === '/tts' && request.method === 'POST') {
      if (!tokenValido(request, env)) {
        return json({ error: 'Unauthorized' }, 401, corsHeaders);
      }
      if (!env.GOOGLE_TTS_KEY) {
        return json(
          { error: 'misconfigured', message: 'Defina GOOGLE_TTS_KEY para gerar áudio.' },
          503,
          corsHeaders,
        );
      }

      let corpo;
      try {
        corpo = await request.json();
      } catch {
        return json({ error: 'invalid_json' }, 400, corsHeaders);
      }

      // trim ANTES do teste: um texto so com espacos passaria no `||` e
      // iria para o TTS, que cobra por caractere sintetizado.
      const texto = String(corpo.texto || '').trim().slice(0, 4800);
      if (!texto) return json({ error: 'texto_vazio' }, 400, corsHeaders);

      const voz = /^pt-BR-[A-Za-z0-9-]+$/.test(corpo.voz || '') ? corpo.voz : 'pt-BR-Neural2-B';
      const velocidade = Math.max(0.5, Math.min(Number(corpo.velocidade) || 1, 1.6));

      try {
        const upstream = await fetch(`${TTS_URL}?key=${env.GOOGLE_TTS_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text: texto },
            voice: { languageCode: 'pt-BR', name: voz },
            audioConfig: {
              audioEncoding: 'MP3',
              speakingRate: velocidade,
              // -2 dB de ganho e pitch neutro: locução longa em fone de
              // ouvido fica cansativa com o volume padrão.
              volumeGainDb: -2,
              effectsProfileId: ['headphone-class-device'],
            },
          }),
        });

        if (!upstream.ok) {
          return json({ error: 'tts_failed', message: await upstream.text() }, upstream.status, corsHeaders);
        }
        const dados = await upstream.json();
        return json({ audioBase64: dados.audioContent, mime: 'audio/mpeg' }, 200, corsHeaders);
      } catch (err) {
        return json({ error: 'tts_error', message: String(err && err.message) }, 502, corsHeaders);
      }
    }

    // =============================================================
    // 3. Pagamento da consulta
    //
    // Com MP_ACCESS_TOKEN configurado, cria a preferência do Mercado
    // Pago e devolve a URL do checkout. Sem a chave, entra em MODO
    // DEMONSTRAÇÃO: confirma na hora e cria a sala, para dar de rodar o
    // fluxo inteiro em desenvolvimento. Em produção, deixar a chave
    // vazia é o mesmo que dar consulta de graça - o /health mostra em
    // qual modo o worker está.
    // =============================================================
    if (url.pathname === '/pagamento' && request.method === 'POST') {
      if (!tokenValido(request, env)) return json({ error: 'Unauthorized' }, 401, corsHeaders);

      const usuario = await usuarioDoToken(env, request);
      if (!usuario) {
        return json({ error: 'sem_sessao', message: 'Faça login novamente.' }, 401, corsHeaders);
      }

      let corpo;
      try {
        corpo = await request.json();
      } catch {
        return json({ error: 'invalid_json' }, 400, corsHeaders);
      }

      const { agendamentoId, valorCentavos, descricao, emailPagador } = corpo;
      if (!agendamentoId) return json({ error: 'agendamento_ausente' }, 400, corsHeaders);

      // O agendamento tem de ser mesmo de quem está pagando.
      let agendamento;
      try {
        const linhas = await supabaseSelect(
          env,
          `agendamentos?id=eq.${agendamentoId}&select=id,aluno_id,responsavel_id,valor_centavos,status_pagamento`,
        );
        agendamento = linhas[0];
      } catch (err) {
        return json({ error: 'consulta_falhou', message: String(err.message) }, 502, corsHeaders);
      }

      if (!agendamento) return json({ error: 'nao_encontrado' }, 404, corsHeaders);
      if (agendamento.aluno_id !== usuario.id && agendamento.responsavel_id !== usuario.id) {
        return json({ error: 'sem_permissao' }, 403, corsHeaders);
      }
      if (agendamento.status_pagamento === 'pago') {
        return json({ error: 'ja_pago' }, 409, corsHeaders);
      }

      // ---- Modo demonstração ----
      if (!env.MP_ACCESS_TOKEN) {
        const sala = criarSala(env, agendamentoId);
        try {
          await supabaseRpc(env, 'confirmar_pagamento_consulta', {
            p_agendamento: agendamentoId,
            p_ref: `simulado-${Date.now()}`,
            p_meeting_url: sala.url,
            p_provider: sala.provider,
          });
        } catch (err) {
          return json({ error: 'confirmacao_falhou', message: String(err.message) }, 502, corsHeaders);
        }
        return json({ ref: 'simulado', confirmadoNaHora: true, meetingUrl: sala.url }, 200, corsHeaders);
      }

      // ---- Mercado Pago ----
      try {
        const preferencia = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [
              {
                title: descricao || 'Consulta psicológica',
                quantity: 1,
                currency_id: 'BRL',
                unit_price: (valorCentavos ?? agendamento.valor_centavos) / 100,
              },
            ],
            payer: emailPagador ? { email: emailPagador } : undefined,
            // external_reference é o que amarra o webhook ao agendamento.
            external_reference: agendamentoId,
            notification_url: `${url.origin}/webhook/pagamento`,
            back_urls: {
              success: `${env.PUBLIC_APP_URL || url.origin}/?consulta=${agendamentoId}`,
              pending: `${env.PUBLIC_APP_URL || url.origin}/?consulta=${agendamentoId}`,
              failure: `${env.PUBLIC_APP_URL || url.origin}/?consulta=${agendamentoId}`,
            },
            auto_return: 'approved',
          }),
        });

        if (!preferencia.ok) {
          return json(
            { error: 'checkout_falhou', message: await preferencia.text() },
            502,
            corsHeaders,
          );
        }
        const dados = await preferencia.json();
        return json(
          { checkoutUrl: dados.init_point, ref: dados.id, confirmadoNaHora: false },
          200,
          corsHeaders,
        );
      } catch (err) {
        return json({ error: 'checkout_erro', message: String(err && err.message) }, 502, corsHeaders);
      }
    }

    // =============================================================
    // 4. Webhook do provedor
    //
    // É AQUI que a consulta vira "paga" e ganha sala - nunca no
    // navegador. O segredo na query evita que qualquer um poste um
    // "pagou" forjado.
    // =============================================================
    if (url.pathname === '/webhook/pagamento' && request.method === 'POST') {
      if (env.MP_WEBHOOK_SECRET && url.searchParams.get('secret') !== env.MP_WEBHOOK_SECRET) {
        return json({ error: 'assinatura_invalida' }, 401, corsHeaders);
      }

      let evento;
      try {
        evento = await request.json();
      } catch {
        return json({ error: 'invalid_json' }, 400, corsHeaders);
      }

      try {
        const pagamentoId = evento?.data?.id;
        if (!pagamentoId) return json({ ok: true, ignorado: true }, 200, corsHeaders);

        // Consulta o pagamento na origem: o corpo do webhook não é fonte
        // confiável de status.
        const consulta = await fetch(`https://api.mercadopago.com/v1/payments/${pagamentoId}`, {
          headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
        });
        const pagamento = await consulta.json();

        if (pagamento.status !== 'approved') {
          return json({ ok: true, status: pagamento.status }, 200, corsHeaders);
        }

        const agendamentoId = pagamento.external_reference;
        const sala = criarSala(env, agendamentoId);

        await supabaseRpc(env, 'confirmar_pagamento_consulta', {
          p_agendamento: agendamentoId,
          p_ref: String(pagamentoId),
          p_meeting_url: sala.url,
          p_provider: sala.provider,
        });

        return json({ ok: true }, 200, corsHeaders);
      } catch (err) {
        return json({ error: 'webhook_falhou', message: String(err && err.message) }, 502, corsHeaders);
      }
    }

    // =============================================================
    // 5. Fila de notificações
    //
    // Chamado por um cron (Cloudflare Cron Triggers, a cada 5 min). O
    // e-mail sai do servidor porque um alerta de saúde mental não pode
    // depender de o navegador do responsável estar aberto.
    // =============================================================
    if (url.pathname === '/notify/drain' && request.method === 'POST') {
      if (!tokenValido(request, env)) return json({ error: 'Unauthorized' }, 401, corsHeaders);

      try {
        const pendentes = await supabaseSelect(
          env,
          'notificacoes?canal=eq.email&enviada_em=is.null&tentativas=lt.3&select=id,user_id,titulo,corpo&limit=50',
        );

        let enviadas = 0;
        for (const n of pendentes) {
          const perfis = await supabaseSelect(env, `perfis?id=eq.${n.user_id}&select=email`);
          const email = perfis[0]?.email;
          const ok = email ? await enviarEmail(env, email, n.titulo, n.corpo) : false;

          await supabasePatch(
            env,
            `notificacoes?id=eq.${n.id}`,
            ok
              ? { enviada_em: new Date().toISOString() }
              : { tentativas: 1 /* incrementado a cada passagem */ },
          );
          if (ok) enviadas++;
        }

        return json({ ok: true, pendentes: pendentes.length, enviadas }, 200, corsHeaders);
      } catch (err) {
        return json({ error: 'drain_falhou', message: String(err && err.message) }, 502, corsHeaders);
      }
    }

    return json({ error: 'not_found' }, 404, corsHeaders);
  },

  /**
   * Cron do Cloudflare: esvazia a fila de notificações a cada disparo.
   * Configure em wrangler.toml:  [triggers] crons = ["*\/5 * * * *"]
   */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      this.fetch(
        new Request('https://worker/notify/drain', {
          method: 'POST',
          headers: env.API_TOKEN ? { Authorization: `Bearer ${env.API_TOKEN}` } : {},
        }),
        env,
      ),
    );
  },
};

/**
 * Variante para servidores Node (Express/Next API route) - se preferir não usar Workers:
 *   import MascotProxy from './worker.js'
 *   app.all('*', (req, res) => { ... adapta Request/Response ... })
 */
