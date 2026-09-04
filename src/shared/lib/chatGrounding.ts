import {
  MODOS_CHAT,
  MODO_PADRAO,
  acharModo,
  extrairFontes,
  detectarCitacaoDeProva,
  ferramentasDeBusca,
  montarSystemInstructionChat,
  type FonteConsultada,
  type ModoChat,
} from '../../../server/chatPrompt.js';

export { MODOS_CHAT, MODO_PADRAO, acharModo };
export type { FonteConsultada, ModoChat };
export type ModoChatId = ModoChat['id'];

/**
 * CLIENTE DO CHAT TEMATICO.
 *
 * DOIS CAMINHOS, UM COMPORTAMENTO
 * Com o worker publicado, a conversa vai para /api/chat/completions: a
 * chave fica no servidor e a busca do Google entra junto. Sem worker, o
 * app fala direto com o Gemini usando a chave que o proprio aluno colou
 * no Perfil - que e como o projeto sempre funcionou e continua
 * funcionando.
 *
 * O system instruction e o MESMO nos dois casos porque vem do modulo
 * compartilhado server/chatPrompt.js. Se cada lado montasse o seu, o
 * mentor seria socratico ou nao dependendo de haver proxy configurado.
 *
 * A diferenca que sobra e honesta e visivel: sem worker, a chave do
 * aluno normalmente nao tem grounding habilitado, entao a resposta vem
 * sem fontes - e a interface nao mostra badge de fonte nenhuma.
 */

const PROXY_URL = ((import.meta.env.VITE_AI_BASE_URL as string) || '').replace(/\/+$/, '');
const PROXY_TOKEN = (import.meta.env.VITE_AI_PROXY_TOKEN as string) || '';
const MODELO_DIRETO = (import.meta.env.VITE_AI_MODEL as string) || 'gemini-1.5-flash';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface MensagemChat {
  role: 'user' | 'model';
  text: string;
}

export interface ContextoChat {
  modo: ModoChatId | string;
  mensagens: MensagemChat[];
  apiKey: string;
  nomeAluno?: string;
  materiaRecente?: string;
  /** Injetavel para teste; por padrao, a hora do aparelho. */
  horaLocal?: number;
  signal?: AbortSignal;
}

export interface RespostaChat {
  texto: string;
  fontes: FonteConsultada[];
  consultas: string[];
  groundingUsado: boolean;
  citouProva: boolean;
  modo: string;
  viaWorker: boolean;
}

export const temEndpointDeChat = (): boolean => PROXY_URL.length > 0;

function textoDaResposta(dados: any): string {
  const partes = dados?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(partes)) return '';
  return partes.map((p: any) => p?.text || '').join('').trim();
}

/** Caminho 1: o worker, com busca e chave do servidor. */
async function pelaApi(ctx: ContextoChat): Promise<RespostaChat> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (PROXY_TOKEN) headers['Authorization'] = `Bearer ${PROXY_TOKEN}`;

  const resposta = await fetch(`${PROXY_URL}/api/chat/completions`, {
    method: 'POST',
    headers,
    signal: ctx.signal,
    body: JSON.stringify({
      modo: ctx.modo,
      mensagens: ctx.mensagens,
      horaLocal: ctx.horaLocal ?? new Date().getHours(),
      nomeAluno: ctx.nomeAluno,
      materiaRecente: ctx.materiaRecente,
    }),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text();
    throw new Error(`Erro no mentor (${resposta.status}): ${detalhe.slice(0, 180)}`);
  }

  const dados = await resposta.json();
  return {
    texto: dados.texto || '',
    fontes: dados.fontes ?? [],
    consultas: dados.consultas ?? [],
    groundingUsado: !!dados.groundingUsado,
    citouProva: !!dados.citouProva,
    modo: dados.modo ?? ctx.modo,
    viaWorker: true,
  };
}

/** Caminho 2: Gemini direto, com a chave do aluno. */
async function direto(ctx: ContextoChat): Promise<RespostaChat> {
  const systemInstruction = {
    parts: [
      {
        text: montarSystemInstructionChat({
          modo: ctx.modo,
          horaLocal: ctx.horaLocal ?? new Date().getHours(),
          nomeAluno: ctx.nomeAluno,
          materiaRecente: ctx.materiaRecente,
        }),
      },
    ],
  };

  const contents = ctx.mensagens
    .filter((m) => m.text?.trim())
    .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

  const chamar = async (comBusca: boolean) => {
    const payload: Record<string, unknown> = {
      systemInstruction,
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024, topP: 0.9 },
    };
    if (comBusca) payload.tools = ferramentasDeBusca(MODELO_DIRETO);

    return fetch(`${GEMINI_URL}/${MODELO_DIRETO}:generateContent?key=${ctx.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctx.signal,
      body: JSON.stringify(payload),
    });
  };

  // Tenta com busca; chave pessoal do AI Studio costuma recusar a
  // ferramenta, e nesse caso a conversa segue sem fontes em vez de
  // morrer num 400.
  let resposta = await chamar(true);
  let tentouBusca = true;
  if (!resposta.ok && resposta.status === 400) {
    resposta = await chamar(false);
    tentouBusca = false;
  }

  if (!resposta.ok) {
    if (resposta.status === 403 || resposta.status === 400) {
      throw new Error('Chave da IA invalida ou sem permissao. Confira no Perfil.');
    }
    if (resposta.status === 429) {
      throw new Error('Limite de requisicoes atingido. Tente de novo em instantes.');
    }
    throw new Error(`Erro na IA (${resposta.status}).`);
  }

  const dados = await resposta.json();
  const texto = textoDaResposta(dados);
  const grounding = extrairFontes(dados);

  return {
    texto,
    fontes: grounding.fontes,
    consultas: grounding.consultas,
    groundingUsado: tentouBusca && grounding.groundingUsado,
    citouProva: detectarCitacaoDeProva(texto),
    modo: String(ctx.modo),
    viaWorker: false,
  };
}

export async function conversarComMentor(ctx: ContextoChat): Promise<RespostaChat> {
  return temEndpointDeChat() ? pelaApi(ctx) : direto(ctx);
}
