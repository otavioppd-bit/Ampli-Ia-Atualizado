/**
 * O Chrome aplica -webkit-backdrop-filter quando a propriedade padrao nao
 * esta presente? O minificador do build removeu a padrao e manteve so a
 * prefixada, entao a resposta define se o glassmorphism sobreviveu.
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

function contraste(png, x0, y0, w, h) {
  const v = [];
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const o = (y * png.width + x) * 4;
      v.push(0.299 * png.data[o] + 0.587 * png.data[o + 1] + 0.114 * png.data[o + 2]);
    }
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
}

const nav = await chromium.launch({ args: ['--use-gl=swiftshader'] });
const ctx = await nav.newContext({ viewport: { width: 375, height: 700 } });
const page = await ctx.newPage();
await page.setContent(`<style>
  body{margin:0;background:#0b1120}
  .listras{position:fixed;inset:0;background:repeating-linear-gradient(90deg,#f59e0b 0 6px,#0b1120 6px 12px)}
  .base{position:relative;margin:20px 40px;height:120px;background:rgba(17,24,39,0.75);border:1px solid #ffffff0d}
  .so-webkit{-webkit-backdrop-filter:blur(24px)saturate(1.2)}
  .so-padrao{backdrop-filter:blur(24px)saturate(1.2)}
  .nenhum{}
</style>
<div class="listras"></div>
<div class="base so-webkit"></div>
<div class="base so-padrao"></div>
<div class="base nenhum"></div>`);
await page.waitForTimeout(900);
const s = PNG.sync.read(await page.screenshot());
console.log('\n=== contraste dentro de cada painel (menor = mais borrado) ===');
console.log(`  so -webkit-backdrop-filter : ${contraste(s, 60, 40, 250, 80).toFixed(1)}`);
console.log(`  so backdrop-filter padrao  : ${contraste(s, 60, 180, 250, 80).toFixed(1)}`);
console.log(`  nenhum dos dois            : ${contraste(s, 60, 320, 250, 80).toFixed(1)}`);
await nav.close();
