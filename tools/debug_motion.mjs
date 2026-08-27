import { chromium } from 'playwright';
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport:{width:375,height:812} });
const page = await ctx.newPage();
await page.emulateMedia({ reducedMotion:'reduce' });
await page.goto(process.argv[2]||'http://localhost:5178',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(2500);
const r = await page.evaluate(() => [...document.querySelectorAll('*')]
  .filter(el => { const s=getComputedStyle(el); return s.animationName!=='none' && s.animationDuration!=='0s'; })
  .map(el => ({ tag: el.tagName, cls: (el.className?.toString?.()||'').slice(0,110),
                anim: getComputedStyle(el).animationName, dur: getComputedStyle(el).animationDuration })));
console.log(JSON.stringify(r,null,2));
await nav.close();
