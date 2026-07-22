import { ChatPersona } from '../types';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function askGemini(
  message: string,
  persona: ChatPersona | null,
  apiKey: string,
  imageBase64?: string,
  signal?: AbortSignal
): Promise<string> {
  const systemInstruction = persona
    ? `Você é ${persona.name}. ${persona.instruction}. Responda em português brasileiro de forma completa e didática. Use markdown simples quando ajudar (negrito para destaque, emojis com moderação). Seja direto e prático.`
    : 'Você é um mentor de estudos para o ENEM. Responda em português brasileiro de forma completa e didática.';

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
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 40,
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
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Desculpe, não consegui gerar uma resposta.';
  return text;
}
