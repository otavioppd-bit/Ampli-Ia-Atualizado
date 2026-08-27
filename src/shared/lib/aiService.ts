import { ChatPersona } from '../types';
import { StudentMonthlyRecord } from './dropoutRisk';
import { promptRoteiroAudio, montarPedidoTTS } from './audioPills';
import { SYSTEM_PROMPT_DESCOMPRESSAO, promptDescompressao } from './decompressionReport';
import type { MetricasDescompressao } from '../types';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const MAX_RETRIES = 3;

/* ============================================================
 PROXY SERVERLESS (grátis - a chave fica no servidor)
 Defina no.env:
 VITE_AI_BASE_URL = URL do seu Worker/Function
 (ex.: https://midnight-mentor-ia.workers.dev)
 VITE_AI_PROXY_TOKEN = token opcional de autenticação
 Quando VITE_AI_BASE_URL está definido, o app usa o proxy e o
 usuário NÃO precisa informar chave. Caso contrário, cai no
 Gemini direto (chave do usuário).
 ============================================================ */
const PROXY_URL = ((import.meta.env.VITE_AI_BASE_URL as string) || '').replace(/\/+$/, '');
const PROXY_TOKEN = (import.meta.env.VITE_AI_PROXY_TOKEN as string) || '';
const PROXY_MODEL = (import.meta.env.VITE_AI_MODEL as string) || 'gemini-2.0-flash';

/** Proxy configurado? (modo "sem chave do usuário"). */
export const hasProxy = () => PROXY_URL.length > 0;

/** IA está disponível de alguma forma (chave do usuário OU proxy). */
export const aiAvailable = (apiKey: string) => Boolean(apiKey.trim()) || hasProxy();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RetryResult {
  ok: boolean;
  status: number;
  data: any;
  error: string | null;
}

// Garante que uma chamada ao Gemini não falhe por uma simples instabilidade
// de rede / resposta interrompida ("streaming response failed").
async function fetchGemini(url: string, init: RequestInit, signal?: AbortSignal): Promise<RetryResult> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal });
      if (res.ok) {
        return { ok: true, status: res.status, data: await res.json(), error: null };
      }
      // Erros 5xx e 429 (rate limit) são transitórios -> tenta de novo
      if (res.status === 429 || res.status >= 500) {
        if (attempt === MAX_RETRIES - 1) {
          const err = await res.text();
          return { ok: false, status: res.status, data: null, error: err };
        }
        await sleep(600 * (attempt + 1));
        continue;
      }
      // 400/403 = chave inválida, não adianta repetir
      const err = await res.text();
      return { ok: false, status: res.status, data: null, error: err };
    } catch (e) {
      // Falha de rede (fetch lança TypeError) - causa comum do "streaming response failed"if (attempt === MAX_RETRIES - 1) throw e;
      await sleep(700 * (attempt + 1));
    }
  }
  return { ok: false, status: 0, data: null, error: 'Falha na conexão com a IA' };
}

/* Envia o payload para o proxy (modo serverless) ou direto ao Gemini. */
async function sendToAI(
  body: {
    systemInstruction?: { parts: { text: string }[] };
    contents: { parts: any[] }[];
    generationConfig: Record<string, unknown>;
  },
  apiKey: string,
  signal?: AbortSignal,
): Promise<RetryResult> {
  if (hasProxy()) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (PROXY_TOKEN) headers['Authorization'] = `Bearer ${PROXY_TOKEN}`;
    return fetchGemini(
      `${PROXY_URL}/generate`,
      {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({ provider: 'gemini', model: PROXY_MODEL, ...body }),
      },
      signal,
    );
  }
  return fetchGemini(
    `${GEMINI_URL}?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(body),
    },
    signal,
  );
}

function extractGeminiText(data: any): string {
  if (!data) return '';
  const candidate = data?.candidates?.[0] || data;
  const content = candidate?.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (typeof item?.text === 'string') return item.text;
      if (Array.isArray(item?.parts) && typeof item.parts[0]?.text === 'string') return item.parts[0].text;
    }
  }
  if (typeof content?.text === 'string') return content.text;
  if (Array.isArray(content?.parts) && typeof content.parts[0]?.text === 'string')
    return content.parts[0].text;
  if (Array.isArray(data?.content?.parts) && typeof data.content.parts[0]?.text === 'string')
    return data.content.parts[0].text;
  return '';
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

export async function askGemini(
  message: string,
  persona: ChatPersona | null,
  apiKey: string,
  imageBase64?: string,
  signal?: AbortSignal,
): Promise<string> {
  const systemInstruction = persona
    ? `Você é ${persona.name}. ${persona.instruction} Responda em português brasileiro com rigor de pesquisador, estruturando a resposta em seções claras sempre que necessário e fundamentando-a em conceitos relevantes.`
    : 'Você é um mentor de estudos para o ENEM. Responda em português brasileiro com rigor acadêmico e estilo de pesquisador. Seja preciso, organizado e baseado em fundamentos.';

  const parts: any[] = [{ text: message }];
  if (imageBase64) {
    const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
    if (mimeMatch) {
      const mimeType = mimeMatch[1];
      const data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      parts.push({ inlineData: { mimeType, data } });
    }
  }

  const res = await sendToAI(
    {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 1024,
        topP: 0.85,
        topK: 20,
      },
    },
    apiKey,
    signal,
  );

  if (!res.ok) {
    if (hasProxy()) {
      throw new Error(`Erro na IA: ${res.error || 'falha do servidor'}`);
    }
    if (res.status === 403 || res.status === 400) {
      throw new Error('API key inválida ou sem permissão. Verifique sua chave do Google AI Studio.');
    }
    if (res.status === 429) {
      throw new Error('Limite de requisições excedido. Aguarde um momento e tente novamente.');
    }
    throw new Error(`Erro na API: ${res.error}`);
  }

  const text = extractGeminiText(res.data) || 'Desculpe, não consegui gerar uma resposta.';
  return text;
}

export async function generateQuizQuestions(
  subject: string,
  topic: string,
  apiKey: string,
  count: number = 10,
): Promise<string> {
  const systemInstruction = `Você é um professor pesquisador especialista em ${subject} para o ENEM. Crie exatamente ${count} questões de múltipla escolha inéditas, com nível ENEM, clareza conceitual e contexto pedagógico.`;
  const prompt =
    topic === 'geral'
      ? `Gere ${count} questões de ${subject} abrangendo tópicos essenciais e representativos da matéria para o ENEM. Inclua alternativas rotuladas A, B, C, D, marque a resposta correta como "Resposta: <letra>" e classifique cada questao com uma linha "Dificuldade: facil", "Dificuldade: media" ou "Dificuldade: dificil".`
      : `Gere ${count} questões de ${subject} focadas no tema "${topic}"para o ENEM. Mantenha o nível acadêmico, explique brevemente a justificativa da resposta correta e inclua em cada questao uma linha "Dificuldade: facil|media|dificil".`;

  const res = await sendToAI(
    {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.45, maxOutputTokens: 4096, topP: 0.9, topK: 20 },
    },
    apiKey,
  );

  if (!res.ok) {
    if (hasProxy()) throw new Error(`Erro ao gerar questões: ${res.error || 'falha do servidor'}`);
    throw new Error(`Erro ao gerar questões: ${res.error}`);
  }

  return extractGeminiText(res.data) || 'Erro ao gerar questões.';
}

export async function correctEssayWithAI(text: string, apiKey: string, tema?: string): Promise<string> {
  const temaInst = tema
    ? `Tema da redação: "${tema}". Avalie se o texto aborda o tema proposto de forma consistente.`
    : 'Avalie a competência 2 (Compreensão do tema) com base no que o texto parece abordar.';

  const prompt = `Você é um corretor de redações do ENEM com perfil de pesquisador acadêmico. Analise a redação abaixo e atribua notas de 0 a 200 para cada uma das 5 competências. Responda APENAS com um objeto JSON válido, sem markdown, sem explicações adicionais.

Competências:
1. "competencia1"- Domínio da norma culta: domínio da modalidade escrita formal da língua portuguesa.
2. "competencia2"- Compreensão do tema: compreensão da proposta de redação e desenvolvimento do tema dentro dos limites do texto dissertativo-argumentativo.
3. "competencia3"- Argumentação: seleção, relação, organização e interpretação de informações, fatos, opiniões e argumentos em defesa de um ponto de vista.
4. "competencia4"- Coesão: uso de mecanismos linguísticos para organizar as ideias e manter a progressão textual.
5. "competencia5"- Proposta de intervenção: elaboração de uma proposta de intervenção para o problema abordado, com agente, ação, meio e finalidade.

${temaInst}

Formato de resposta (apenas JSON):
{
 "competencia1": 0,
 "competencia2": 0,
 "competencia3": 0,
 "competencia4": 0,
 "competencia5": 0,
 "notaFinal": 0,
 "pontosFortes": ["...", "..."],
 "pontosMelhorar": ["...", "..."],
 "analise": "<breve análise geral do texto, 2-3 frases>"}

Redação:
${text}`;

  const res = await sendToAI(
    {
      systemInstruction: {
        parts: [{ text: 'Você é um corretor experiente de redações ENEM. Responda apenas com JSON.' }],
      },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048, topP: 0.9, topK: 20 },
    },
    apiKey,
  );

  if (!res.ok) {
    if (hasProxy()) throw new Error(`Erro na correção: ${res.error || 'falha do servidor'}`);
    throw new Error(`Erro na correção: ${res.error}`);
  }

  return extractGeminiText(res.data);
}

export async function analyzeMoodWithAI(text: string, apiKey: string): Promise<string> {
  const prompt = `Analise o texto abaixo e identifique o estado emocional dominante do autor. Leve em conta o tom, a estrutura das frases, a intensidade do vocabulário, a pontuação e padrões linguísticos que indicam estresse, cansaço, ansiedade, desmotivação, foco, motivação, alegria ou energia.

Responda APENAS com um JSON sem formatação adicional:
{
 "mood": "stress"| "anxiety"| "sadness"| "tired"| "demotivated"| "focused"| "motivated"| "happy"| "energetic"| "neutral",
 "confidence": <0.0-1.0>,
 "reason": "<breve justificativa de 1 frase>",
 "messageAdaptada": "<frase curta de apoio empático com base no humor detectado>"}

Texto:
${text}`;

  const res = await sendToAI(
    {
      systemInstruction: {
        parts: [
          {
            text: 'Você é um analista emocional especializado em detectar estados psicológicos através da escrita. Responda apenas com JSON.',
          },
        ],
      },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 512, topP: 0.9, topK: 20 },
    },
    apiKey,
  );

  if (!res.ok) {
    if (hasProxy()) throw new Error(`Erro na análise de humor: ${res.error || 'falha do servidor'}`);
    throw new Error(`Erro na análise de humor: ${res.error}`);
  }

  return extractGeminiText(res.data);
}

export const QUIZ_TOPICS_CACHE_KEY = 'mm_quiz_topics_cache';

/* ============================================================
 MENTOR CHAT - Sagui (personalidade padrão do assistente)
 ============================================================ */

const SAGUI_SYSTEM_PROMPT =
  'Você é o Sagui, um mentor educacional empático do projeto The Midnight Mentor. Seu objetivo é ajudar estudantes do ensino médio noturno do Brasil. Seja breve, motivador e use linguagem acessível. Responda em parágrafos curtos.';

export interface GeminiHistoryMessage {
  role: 'user' | 'model';
  text: string;
}

export interface SendMessageToGeminiOptions {
  apiKey: string;
  persona?: ChatPersona | null;
  history?: GeminiHistoryMessage[];
  imageBase64?: string;
  signal?: AbortSignal;
}

/**
 * Envia a mensagem do aluno para o Gemini com a personalidade do Sagui.
 * Suporta histórico recente (últimas 8 mensagens), persona ativa e imagens.
 * Lança erro amigável em pt-BR em caso de falha (o ChatPage trata o catch).
 */
export async function sendMessageToGemini(
  userMessage: string,
  { apiKey, persona = null, history = [], imageBase64, signal }: SendMessageToGeminiOptions,
): Promise<string> {
  const systemInstruction = persona
    ? `${SAGUI_SYSTEM_PROMPT} Sua especialidade atual: ${persona.name}. ${persona.instruction} Mantenha o tom acolhedor e direto do Sagui.`
    : SAGUI_SYSTEM_PROMPT;

  const contents: { role: 'user' | 'model'; parts: any[] }[] = [];
  for (const msg of history.slice(-8)) {
    const text = (msg.text || '').trim();
    if (!text) continue;
    contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text }] });
  }

  const parts: any[] = [{ text: userMessage || 'Olá!' }];
  if (imageBase64) {
    const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
    if (mimeMatch) {
      const mimeType = mimeMatch[1];
      const data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      parts.push({ inlineData: { mimeType, data } });
    }
  }
  contents.push({ role: 'user', parts });

  const res = await sendToAI(
    {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024, topP: 0.9, topK: 32 },
    },
    apiKey,
    signal,
  );

  if (!res.ok) {
    if (hasProxy()) throw new Error(`Erro na IA: ${res.error || 'falha do servidor'}`);
    if (res.status === 403 || res.status === 400) {
      throw new Error('API key inválida ou sem permissão. Verifique sua chave do Google AI Studio.');
    }
    if (res.status === 429) {
      throw new Error('Limite de requisições excedido. Aguarde um momento e tente novamente.');
    }
    throw new Error(`Erro na API: ${res.error}`);
  }

  const text = extractGeminiText(res.data);
  return text || 'Desculpe, não consegui gerar uma resposta agora. Tente me perguntar de novo! ';
}

/* ============================================================
 DASHBOARD PREDITIVO - análise de evasão com IA
 ============================================================ */

export type EvasionRisk = 'Baixo' | 'Médio' | 'Alto';
export type RiskCode = 'green' | 'yellow' | 'red';

export interface StudentRiskAnalysis {
  risk: EvasionRisk;
  riskCode: RiskCode;
  recommendation: string;
  raw: string;
}

/** Normaliza o texto do modelo para um dos valores válidos de risco. */
export function normalizeRisk(value: unknown): EvasionRisk {
  const text = String(value || '').toLowerCase();
  if (text.includes('alto')) return 'Alto';
  if (text.includes('baixo')) return 'Baixo';
  if (text.includes('med')) return 'Médio';
  return 'Médio';
}

/**
 * Converte a resposta do Gemini (JSON ou texto livre) em uma análise estruturada.
 * Função pura - não faz I/O, ideal para testes.
 */
export function parseRiskAnalysis(raw: string): {
  risk: EvasionRisk;
  riskCode: RiskCode;
  recommendation: string;
} {
  const text = (raw || '').trim();

  let obj: any = null;
  try {
    const json = extractJson(text);
    if (json) obj = JSON.parse(json);
  } catch {
    /* texto livre */
  }

  const risk = normalizeRisk(obj?.riscoEvasao ?? extractRiskFromText(text));
  const riskCode: RiskCode = risk === 'Baixo' ? 'green' : risk === 'Alto' ? 'red' : 'yellow';

  let recommendation = typeof obj?.recomendacao === 'string' ? obj.recomendacao.trim() : '';

  if (!recommendation) {
    // Fallback: tenta extrair frases completas do texto livre
    const sentences = text.match(/[^.!?]+[.!?]+/g);
    recommendation = sentences ? sentences.map((s) => s.trim()).join('') : text.slice(0, 240);
  }

  return { risk, riskCode, recommendation };
}

function extractRiskFromText(text: string): EvasionRisk {
  const match = text.match(/\b(Baixo|Médio|Medio|Alto)\b/i);
  return match ? normalizeRisk(match[1]) : 'Médio';
}

/**
 * Envia o histórico do aluno (notas + horas de uso) para o Gemini e
 * retorna a previsão de risco de evasão para os próximos 4 meses.
 */
export async function analyzeStudentData(
  historicalData: StudentMonthlyRecord[],
  { apiKey, signal }: { apiKey: string; signal?: AbortSignal },
): Promise<StudentRiskAnalysis> {
  const payload = historicalData.map((d, i) => ({
    mes: d.month,
    sequencial: i + 1,
    notaMedia: d.notaMedia,
    horasDeUso: d.tempoUso,
  }));

  const prompt = [
    'Analise os dados recentes de frequência e notas deste aluno do ensino médio noturno. Com base nesses dados, gere uma previsão de risco de evasão (Baixo, Médio, Alto) para os próximos 4 meses e escreva uma recomendação de apenas 2 frases para os pais.',
    '',
    'Responda APENAS com um objeto JSON válido, sem markdown e sem comentários, no formato:',
    '{ "riscoEvasao": "Baixo"| "Médio"| "Alto", "recomendacao": "<recomendação de 2 frases para os pais>"}',
    '',
    `Dados do aluno (últimos ${payload.length} meses):`,
    JSON.stringify(payload, null, 2),
  ].join('\n');

  const res = await sendToAI(
    {
      systemInstruction: {
        parts: [
          {
            text: 'Você é um cientista de dados educacional especializado em evasão escolar do ensino médio noturno brasileiro. Responda apenas com o JSON solicitado.',
          },
        ],
      },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 512, topP: 0.9, topK: 20 },
    },
    apiKey,
    signal,
  );

  if (!res.ok) {
    if (hasProxy()) throw new Error(`Erro na IA: ${res.error || 'falha do servidor'}`);
    if (res.status === 403 || res.status === 400) {
      throw new Error('API key inválida ou sem permissão. Verifique sua chave do Google AI Studio.');
    }
    if (res.status === 429) {
      throw new Error('Limite de requisições excedido. Aguarde um momento e tente novamente.');
    }
    throw new Error(`Erro na API: ${res.error}`);
  }

  const raw = extractGeminiText(res.data) || '';
  const parsed = parseRiskAnalysis(raw);
  return { ...parsed, raw };
}

/**
 * Testa a conexão de ponta a ponta (proxy OU chave direta).
 * Retorna a resposta do modelo (ex.: "OK") - lança erro se falhar.
 */
export async function testGeneration(apiKey: string): Promise<string> {
  const reply = await askGemini('Responda apenas com a palavra: OK.', null, apiKey);
  const clean = (reply || '').trim();
  return clean.length > 0 ? clean : 'OK';
}

export { fetchGemini };

/* ============================================================
 BEM-ESTAR - roteiros de audio, TTS, intervencao e relatorio
 ============================================================ */


/**
 * Roteiro de micro-podcast de 3 minutos.
 *
 * temperature 0.6: acima disso o modelo inventa exemplo errado de ENEM,
 * abaixo ele repete a mesma abertura em todos os temas - e a pessoa ouve
 * varios seguidos.
 */
export async function gerarRoteiroAudio(
  materia: string,
  topico: string,
  apiKey: string,
  contexto?: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await sendToAI(
    {
      systemInstruction: {
        parts: [
          {
            text: 'Voce escreve roteiros de audio educativo em portugues brasileiro para serem OUVIDOS, nunca lidos. Devolva apenas o texto corrido da locucao.',
          },
        ],
      },
      contents: [{ parts: [{ text: promptRoteiroAudio(materia, topico, contexto) }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 1200, topP: 0.9, topK: 32 },
    },
    apiKey,
    signal,
  );

  if (!res.ok) throw new Error(`Erro ao gerar o roteiro: ${res.error || 'falha do servidor'}`);
  return extractGeminiText(res.data).replace(/[*#_`]/g, '').trim();
}

export interface AudioSintetizado {
  /** data: URL pronta para <audio src>. */
  url: string;
  formato: string;
}

/**
 * Text-to-Speech pelo worker.
 *
 * A chave do Google Cloud TTS NAO pode viajar para o navegador (ela
 * cobra por caractere sintetizado), entao esta chamada exige o proxy
 * configurado. Sem proxy a funcao lanca, e o player cai na voz nativa do
 * sistema - pior qualidade, mas funciona sem custo e sem rede.
 */
export async function sintetizarAudio(
  texto: string,
  opcoes: { voz?: string; velocidade?: number; signal?: AbortSignal } = {},
): Promise<AudioSintetizado> {
  if (!hasProxy()) {
    throw new Error('TTS indisponivel: configure VITE_AI_BASE_URL para usar as vozes neurais.');
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (PROXY_TOKEN) headers['Authorization'] = `Bearer ${PROXY_TOKEN}`;

  const resposta = await fetch(`${PROXY_URL}/tts`, {
    method: 'POST',
    headers,
    signal: opcoes.signal,
    body: JSON.stringify(montarPedidoTTS(texto, opcoes.voz, opcoes.velocidade)),
  });

  if (!resposta.ok) {
    throw new Error(`Falha ao gerar o audio (${resposta.status}).`);
  }

  const dados = await resposta.json();
  if (!dados?.audioBase64) throw new Error('Resposta de audio vazia.');
  return { url: `data:${dados.mime || 'audio/mpeg'};base64,${dados.audioBase64}`, formato: dados.mime || 'audio/mpeg' };
}

export interface IntervencaoEmpatica {
  titulo: string;
  convite: string;
  acao: string;
  materia: string;
}

/**
 * Intervencao de doomscrolling.
 *
 * O prompt e curto e cheio de proibicoes por um motivo: o modelo, solto,
 * escreve tres paragrafos motivacionais - o que, para alguem paralisado,
 * e mais uma tela para rolar. O formato JSON forca a saida a caber no
 * card (uma frase de acolhimento, um convite unico, um botao).
 */
export async function gerarIntervencaoDoomscroll(
  contexto: { materiaSugerida: string; segundosVagando: number; horaLocal: number; humor?: string },
  apiKey: string,
  signal?: AbortSignal,
): Promise<IntervencaoEmpatica> {
  const prompt = [
    'Um estudante do ensino medio noturno esta ha alguns minutos rolando os menus do app de estudos sem clicar em nada - sinal de duvida, cansaco ou paralisia por analise.',
    '',
    `Contexto: ${contexto.segundosVagando} segundos navegando sem escolher nada; agora sao ${contexto.horaLocal}h; materia sugerida pelo historico: ${contexto.materiaSugerida}.` +
      (contexto.humor ? ` Humor recente relatado: ${contexto.humor}.` : ''),
    '',
    'Escreva uma intervencao empatica com TRES campos e nada mais.',
    'Regras:',
    '- "titulo": no maximo 6 palavras, sem julgamento, reconhecendo o momento (ex: "Voce parece na duvida.").',
    '- "convite": UMA proposta pequena e concreta, no maximo 20 palavras, que termine em pergunta. Sempre uma tarefa minima com fim claro (ex: 3 questoes e parar por hoje).',
    '- "acao": texto do botao, no maximo 4 palavras, no infinitivo.',
    '- Nao use emoji, nao use exclamacao, nao motive, nao pergunte como a pessoa esta.',
    '- Nao ofereca mais de uma opcao: escolher e exatamente o que ela nao esta conseguindo fazer agora.',
    '',
    'Responda APENAS com JSON: {"titulo": "...", "convite": "...", "acao": "...", "materia": "..."}',
  ].join('\n');

  const res = await sendToAI(
    {
      systemInstruction: {
        parts: [
          {
            text: 'Voce e o Sagui, mentor empatico de um app de estudos brasileiro. Responda apenas com o JSON pedido, em portugues brasileiro.',
          },
        ],
      },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 300, topP: 0.9, topK: 20 },
    },
    apiKey,
    signal,
  );

  if (!res.ok) throw new Error(`Erro na intervencao: ${res.error || 'falha do servidor'}`);

  const bruto = extractGeminiText(res.data);
  const dados = JSON.parse(extractJson(bruto));
  return {
    titulo: String(dados.titulo || 'Voce parece na duvida.'),
    convite: String(dados.convite || `Vamos fazer 3 questoes de ${contexto.materiaSugerida} e parar por hoje?`),
    acao: String(dados.acao || 'Comecar 3 questoes'),
    materia: String(dados.materia || contexto.materiaSugerida),
  };
}

/**
 * Paragrafo do relatorio de descompressao.
 *
 * temperature 0.55 e maxOutputTokens 220: o teto de tokens e o que
 * garante o "curto e direto" mesmo quando o modelo se empolga - cortar
 * no meio de uma frase seria pior, entao o limite fica logo acima de
 * quatro frases.
 */
export async function gerarRelatorioDescompressao(
  metricas: MetricasDescompressao,
  apiKey: string,
  primeiroNome?: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await sendToAI(
    {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT_DESCOMPRESSAO }] },
      contents: [{ parts: [{ text: promptDescompressao(metricas, primeiroNome) }] }],
      generationConfig: { temperature: 0.55, maxOutputTokens: 220, topP: 0.9, topK: 32 },
    },
    apiKey,
    signal,
  );

  if (!res.ok) throw new Error(`Erro no relatorio: ${res.error || 'falha do servidor'}`);
  return extractGeminiText(res.data).replace(/[*#`]/g, '').trim();
}

/**
 * Texto do alerta enviado ao responsavel.
 *
 * O banco ja grava uma mensagem padrao (registrar_burnout); esta versao
 * troca por uma redacao que explica o SINAL sem entregar o conteudo
 * privado do filho. A fronteira e explicita no prompt porque e o ponto
 * em que um alerta util vira quebra de confianca.
 */
export async function gerarAlertaParaResponsavel(
  dados: { nomeAluno: string; score: number; motivos: string[] },
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const prompt = [
    `Escreva um aviso curto para o responsavel de ${dados.nomeAluno}, estudante do ensino medio noturno.`,
    `Indice de fadiga detectado pelo app: ${dados.score}/100. Sinais que pesaram: ${dados.motivos.join('; ') || 'padrao de estudo irregular'}.`,
    '',
    'Regras:',
    '- Duas ou tres frases, portugues brasileiro, tom calmo.',
    '- Explique o que foi observado em termos de PADRAO (horario, ritmo, cansaco), nunca de conteudo privado.',
    '- Sugira conversa antes de qualquer outra medida.',
    '- Mencione que o painel permite agendar um atendimento com psicologo se fizer sentido, sem pressionar.',
    '- Nao diagnostique, nao use termos clinicos, nao alarme.',
    '- Sem emoji, sem lista.',
  ].join('\n');

  const res = await sendToAI(
    {
      systemInstruction: {
        parts: [
          {
            text: 'Voce comunica sinais de bem-estar para responsaveis de estudantes. Nunca diagnostica e nunca revela conteudo escrito pelo aluno.',
          },
        ],
      },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 260, topP: 0.9, topK: 20 },
    },
    apiKey,
    signal,
  );

  if (!res.ok) throw new Error(`Erro ao redigir o alerta: ${res.error || 'falha do servidor'}`);
  return extractGeminiText(res.data).replace(/[*#`]/g, '').trim();
}
