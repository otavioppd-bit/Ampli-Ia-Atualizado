/**
 * Proxy serverless GRÁTIS para a IA do Midnight Mentor.
 *
 * Deploy em 3 provedores (escolha um):
 *   - Cloudflare Workers (recomendado, cota grátis):  wrangler login && wrangler deploy
 *   - Vercel / Netlify Functions: exporta este handler
 *   - Railway / Render: node proxy (veja abaixo)
 *
 * SEGREDOS a configurar no provedor:
 *   GEMINI_API_KEY   -> sua chave grátis do Google AI Studio
 *   API_TOKEN        -> (opcional) senha para bloquear uso de terceiros na sua cota
 *   ALLOWED_ORIGIN   -> (opcional) seu domínio, em vez de "*"
 *
 * O app envia POST /generate com { provider?, model?, contents, generationConfig, systemInstruction? }
 * e o worker retorna a resposta do Gemini (mantém o formato para o front parsear).
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';

function cors(env) {
  const origin = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

const json = (data, status, corsHeaders) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = cors(env);

    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check (sem token)
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ status: 'ok', model: DEFAULT_MODEL }, 200, corsHeaders);
    }

    if (url.pathname !== '/generate' || request.method !== 'POST') {
      return json({ error: 'not_found' }, 404, corsHeaders);
    }

    // Auth opcional: protege sua cota grátis contra abuso
    if (env.API_TOKEN) {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${env.API_TOKEN}`) {
        return json({ error: 'Unauthorized', message: 'API_TOKEN inválido' }, 401, corsHeaders);
      }
    }

    if (!env.GEMINI_API_KEY) {
      return json(
        { error: 'misconfigured', message: 'Defina o secret GEMINI_API_KEY no Worker.' },
        500,
        corsHeaders,
      );
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'invalid_json' }, 400, corsHeaders);
    }

    // Evita que o usuário final escolha modelo pago/indesejado
    const model = (payload.model === 'gemini-2.0-flash' || payload.model === 'gemini-2.0-flash-lite')
      ? payload.model
      : DEFAULT_MODEL;

    const geminiUrl = `${GEMINI_BASE}/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
    const body = {
      systemInstruction: payload.systemInstruction,
      contents: payload.contents,
      generationConfig: payload.generationConfig,
    };

    try {
      const upstream = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      });
    } catch (err) {
      return json({ error: 'upstream_failed', message: String(err && err.message) }, 502, corsHeaders);
    }
  },
};

/**
 * Variante para servidores Node (Express/Next API route) — se preferir não usar Workers:
 *   import MascotProxy from './worker.js'
 *   app.all('/generate', (req, res) => { ... adapta fetch/headless ... })
 */