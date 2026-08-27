import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    /*
     * Portas fixas e fora da faixa 8080: essa porta ja hospeda outra
     * aplicacao nesta maquina. O Vite nunca escolhe 8080 sozinho (o padrao
     * e 5173 aqui e 4173 no preview), mas deixar explicito evita que
     * qualquer ajuste futuro esbarre no servidor do lado.
     */
    port: 5180,
    /*
     * frame-ancestors so vale como CABECALHO HTTP: via <meta> o navegador
     * ignora e ainda loga erro. Aqui o dev server ja entrega a protecao
     * contra clickjacking; em producao, replique no host (Vercel, Nginx,
     * Cloudflare) porque o Vite nao participa do runtime publicado.
     */
    headers: {
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
    },
  },
  preview: {
    port: 4184,
  },
})
