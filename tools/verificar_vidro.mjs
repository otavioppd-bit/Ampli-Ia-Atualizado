/**
 * O desfoque do vidro sobrevive ao build de producao?
 *
 * O CSS publicado perdeu a propriedade padrao `backdrop-filter` e ficou so
 * com `-webkit-backdrop-filter`. Isso pode ser inofensivo (o Chrome trata
 * a versao prefixada como sinonimo) ou pode significar que o glassmorphism
 * sumiu em producao sem ninguem notar, ja que em desenvolvimento o CSS nao
 * passa pelo minificador.
 *
 * Ler o estilo computado nao basta: a pergunta e se o PIXEL saiu borrado.
 * Entao o teste desenha listras de alto contraste atras de um painel de
 * vidro e mede a variacao da imagem dentro dele. Fundo borrado tem
 * variacao baixa; fundo nitido, alta.
 *
 * Uso: node tools/verificar_vidro.mjs http://localhost:4184
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const URL_APP = process.argv[2] || 'http://localhost:4184';

/** Desvio padrao do canal de luminancia: mede o quanto a area tem detalhe. */
function contraste(png, x0, y0, w, h) {
  const vals = [];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const o = (y * png.width + x) * 4;
      vals.push(0.299 * png.data[o] + 0.587 * png.data[o + 1] + 0.114 * png.data[o + 2]);
    }
  }
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
}

const nav = await chromium.launch({ args: ['--use-gl=swiftshader'] });
const ctx = await nav.newContext({ viewport: { width: 375, height: 600 } });
const page = await ctx.newPage();

// Usa a folha de estilo REAL do build, para testar o CSS que vai ao ar.
const css = await fetch(URL_APP).then((r) => r.text()).then((html) => {
  const m = html.match(/href="([^"]+\.css)"/);
  return m ? new URL(m[1], URL_APP).href : null;
});
if (!css) {
  console.log('nao encontrei o css do build');
  await nav.close();
  process.exit(1);
}
console.log(`folha de estilo do build: ${css}`);

await page.setContent(`<link rel="stylesheet" href="${css}">
<style>
  body { margin:0; background:#0b1120; }
  .listras { position:fixed; inset:0;
    background:repeating-linear-gradient(90deg,#f59e0b 0 6px,#0b1120 6px 12px); }
</style>
<div class="listras"></div>
<div class="glass" style="position:relative;margin:60px 40px;height:200px"></div>
<div class="glass-plano" style="position:relative;margin:60px 40px;height:200px"></div>`);
await page.waitForTimeout(900);

const shot = PNG.sync.read(await page.screenshot());

const lidos = await page.evaluate(() => {
  const ler = (sel) => {
    const cs = getComputedStyle(document.querySelector(sel));
    return {
      // As duas propriedades lidas SEPARADAMENTE: 'none' e truthy, entao
      // encadear com || esconde a versao prefixada.
      padrao: cs.getPropertyValue('backdrop-filter') || '(vazio)',
      webkit: cs.getPropertyValue('-webkit-backdrop-filter') || '(vazio)',
    };
  };
  return { glass: ler('.glass'), plano: ler('.glass-plano') };
});

console.log('\n=== estilo computado (lido corretamente, sem encadear) ===');
console.log(`  .glass        backdrop-filter: ${lidos.glass.padrao}   -webkit-: ${lidos.glass.webkit}`);
console.log(`  .glass-plano  backdrop-filter: ${lidos.plano.padrao}   -webkit-: ${lidos.plano.webkit}`);

// Amostra dentro de cada painel e nas listras cruas, para ter referencia.
const cruo = contraste(shot, 40, 20, 290, 30);
const cGlass = contraste(shot, 60, 100, 250, 120);
const cPlano = contraste(shot, 60, 360, 250, 120);

console.log('\n=== contraste medido no pixel (desvio padrao da luminancia) ===');
console.log(`  listras sem painel por cima : ${cruo.toFixed(1)}  (referencia: nitido)`);
console.log(`  dentro de .glass            : ${cGlass.toFixed(1)}`);
console.log(`  dentro de .glass-plano      : ${cPlano.toFixed(1)}`);

/*
 * O controle certo e .glass-plano, nao as listras cruas.
 *
 * Comparar com as listras so mostrava a queda causada pelo fundo a 75% de
 * opacidade, que acontece com ou sem desfoque: por isso a primeira versao
 * deste teste deu "esta borrando" quando nao estava. .glass-plano tem o
 * mesmo fundo e nenhum filtro, entao qualquer diferenca entre os dois vem
 * do desfoque e de mais nada.
 */
const borrou = cGlass < cPlano * 0.5;
console.log(
  `\n  controle .glass-plano (mesmo fundo, sem filtro): ${cPlano.toFixed(1)}` +
    `\n  veredito: o vidro ${borrou ? 'ESTA borrando o fundo' : 'NAO esta borrando (desfoque perdido no build)'}`,
);

await nav.close();
