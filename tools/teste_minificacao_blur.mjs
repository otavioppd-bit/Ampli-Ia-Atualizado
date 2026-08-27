/**
 * O minificador quebrou o backdrop-filter?
 *
 * No fonte esta `blur(24px) saturate(1.2)`. No CSS publicado saiu
 * `blur(24px)saturate(1.2)`, sem o espaco. Se o navegador rejeitar a forma
 * sem espaco, a declaracao inteira e descartada e o vidro perde o desfoque
 * SO em producao, passando despercebido em desenvolvimento.
 *
 * Uso: node tools/teste_minificacao_blur.mjs
 */
import { chromium } from 'playwright';

const nav = await chromium.launch({ args: ['--use-gl=swiftshader'] });
const ctx = await nav.newContext({ viewport: { width: 375, height: 400 } });
const page = await ctx.newPage();

await page.setContent(`<style>
  .com-espaco  { backdrop-filter: blur(24px) saturate(1.2); }
  .sem-espaco  { backdrop-filter: blur(24px)saturate(1.2); }
  .so-blur     { backdrop-filter: blur(24px); }
</style>
<div class="com-espaco"></div>
<div class="sem-espaco"></div>
<div class="so-blur"></div>`);

const r = await page.evaluate(() => {
  const ler = (c) => getComputedStyle(document.querySelector(c)).backdropFilter;
  // O que sobreviveu ao parser, olhando a propria folha de estilo
  const regras = {};
  for (const folha of document.styleSheets) {
    try {
      for (const rr of folha.cssRules) regras[rr.selectorText] = rr.style.backdropFilter || '(descartada)';
    } catch { /* outra origem */ }
  }
  return {
    computado: { comEspaco: ler('.com-espaco'), semEspaco: ler('.sem-espaco'), soBlur: ler('.so-blur') },
    naFolha: regras,
    suportado: CSS.supports('backdrop-filter', 'blur(24px)'),
  };
});

console.log('\n  CSS.supports(backdrop-filter, blur(24px)) =', r.suportado);
console.log('\n=== o que o parser guardou na folha de estilo ===');
for (const [sel, v] of Object.entries(r.naFolha)) console.log(`  ${sel.padEnd(14)} ${v}`);
console.log('\n=== estilo computado no elemento ===');
for (const [k, v] of Object.entries(r.computado)) console.log(`  ${k.padEnd(14)} ${v}`);

const quebrou = r.naFolha['.sem-espaco'] === '(descartada)' || r.computado.semEspaco === 'none';
console.log(`\n  veredito: a forma sem espaco ${quebrou ? 'E DESCARTADA pelo navegador' : 'e aceita normalmente'}`);

await nav.close();
