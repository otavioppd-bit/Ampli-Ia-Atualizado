import { chromium } from 'playwright';
const nav = await chromium.launch({ args: ['--use-gl=swiftshader'] });
const ctx = await nav.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();
await page.setContent(`<style>
  body{margin:0;background:#0b1120}
  .fundo{position:fixed;inset:0}
  .fundo i{position:absolute;width:6px;height:6px;background:#f59e0b;border-radius:50%}
  .glass{position:relative;margin:40px;height:300px;
    background:rgba(17,24,39,0.75);backdrop-filter:blur(24px) saturate(1.2);
    border:1px solid rgba(255,255,255,0.05)}
</style>
<div class="fundo">${Array.from({length:60},(_,i)=>`<i style="left:${(i*37)%360}px;top:${(i*53)%700}px"></i>`).join('')}</div>
<div class="glass"></div>`);
await page.waitForTimeout(300);
const antes = await page.screenshot();
const computado1 = await page.evaluate(() => getComputedStyle(document.querySelector('.glass')).backdropFilter);
await page.addStyleTag({ content: '.glass{backdrop-filter:none !important;-webkit-backdrop-filter:none !important}' });
await page.waitForTimeout(300);
const computado2 = await page.evaluate(() => getComputedStyle(document.querySelector('.glass')).backdropFilter);
const depois = await page.screenshot();
console.log('backdrop-filter computado ANTES :', computado1);
console.log('backdrop-filter computado DEPOIS:', computado2);
console.log('bytes iguais?', Buffer.compare(antes, depois) === 0 ? 'SIM (filtro nao teve efeito visivel)' : 'NAO (filtro muda a imagem)');
await nav.close();
