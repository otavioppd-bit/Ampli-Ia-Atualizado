import { ChatPersona } from '../types';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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
  if (Array.isArray(content?.parts) && typeof content.parts[0]?.text === 'string') return content.parts[0].text;
  if (Array.isArray(data?.content?.parts) && typeof data.content.parts[0]?.text === 'string') return data.content.parts[0].text;
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
  signal?: AbortSignal
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

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 1024,
        topP: 0.85,
        topK: 20,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 403 || res.status === 400) {
      throw new Error('API key inválida ou sem permissão. Verifique sua chave do Google AI Studio.');
    }
    if (res.status === 429) {
      throw new Error('Limite de requisições excedido. Aguarde um momento e tente novamente.');
    }
    throw new Error(`Erro na API: ${err}`);
  }

  const data = await res.json();
  const text = extractGeminiText(data) || 'Desculpe, não consegui gerar uma resposta.';
  return text;
}

export async function generateQuizQuestions(
  subject: string,
  topic: string,
  apiKey: string,
  count: number = 10,
): Promise<string> {
  const systemInstruction = `Você é um professor pesquisador especialista em ${subject} para o ENEM. Crie exatamente ${count} questões de múltipla escolha inéditas, com nível ENEM, clareza conceitual e contexto pedagógico.`;
  const prompt = topic === 'geral'
    ? `Gere ${count} questões de ${subject} abrangendo tópicos essenciais e representativos da matéria para o ENEM. Inclua alternativas rotuladas A, B, C, D e marque a resposta correta como "Resposta: <letra>".`
    : `Gere ${count} questões de ${subject} focadas no tema "${topic}" para o ENEM. Mantenha o nível acadêmico e explique brevemente a justificativa da resposta correta.`;

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.45, maxOutputTokens: 4096, topP: 0.9, topK: 20 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao gerar questões: ${err}`);
  }

  const data = await res.json();
  return extractGeminiText(data) || 'Erro ao gerar questões.';
}

export async function correctEssayWithAI(
  text: string,
  apiKey: string,
  tema?: string,
): Promise<string> {
  const temaInst = tema
    ? `Tema da redação: "${tema}". Avalie se o texto aborda o tema proposto de forma consistente.`
    : 'Avalie a competência 2 (Compreensão do tema) com base no que o texto parece abordar.';

  const prompt = `Você é um corretor de redações do ENEM com perfil de pesquisador acadêmico. Analise a redação abaixo e atribua notas de 0 a 200 para cada uma das 5 competências. Responda APENAS com um objeto JSON válido, sem markdown, sem explicações adicionais.

Competências:
1. "competencia1" — Domínio da norma culta: domínio da modalidade escrita formal da língua portuguesa.
2. "competencia2" — Compreensão do tema: compreensão da proposta de redação e desenvolvimento do tema dentro dos limites do texto dissertativo-argumentativo.
3. "competencia3" — Argumentação: seleção, relação, organização e interpretação de informações, fatos, opiniões e argumentos em defesa de um ponto de vista.
4. "competencia4" — Coesão: uso de mecanismos linguísticos para organizar as ideias e manter a progressão textual.
5. "competencia5" — Proposta de intervenção: elaboração de uma proposta de intervenção para o problema abordado, com agente, ação, meio e finalidade.

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
  "analise": "<breve análise geral do texto, 2-3 frases>"
}

Redação:
${text}`;

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'Você é um corretor experiente de redações ENEM. Responda apenas com JSON.' }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048, topP: 0.9, topK: 20 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro na correção: ${err}`);
  }

  const data = await res.json();
  return extractGeminiText(data);
}

export async function analyzeMoodWithAI(text: string, apiKey: string): Promise<string> {
  const prompt = `Analise o texto abaixo e identifique o estado emocional dominante do autor. Leve em conta o tom, a estrutura das frases, a intensidade do vocabulário, a pontuação e padrões linguísticos que indicam estresse, cansaço, ansiedade, desmotivação, foco, motivação, alegria ou energia.

Responda APENAS com um JSON sem formatação adicional:
{
  "mood": "stress" | "anxiety" | "sadness" | "tired" | "demotivated" | "focused" | "motivated" | "happy" | "energetic" | "neutral",
  "confidence": <0.0-1.0>,
  "reason": "<breve justificativa de 1 frase>",
  "messageAdaptada": "<frase curta de apoio empático com base no humor detectado>"
}

Texto:
${text}`;

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'Você é um analista emocional especializado em detectar estados psicológicos através da escrita. Responda apenas com JSON.' }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 512, topP: 0.9, topK: 20 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Erro na análise de humor: ${await res.text()}`);
  }

  const data = await res.json();
  return extractGeminiText(data);
}

export const QUIZ_TOPICS_CACHE_KEY = 'mm_quiz_topics_cache';
