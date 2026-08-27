import { chromium } from 'playwright';
const nav=await chromium.launch(); const ctx=await nav.newContext({viewport:{width:375,height:812}});
const page=await ctx.newPage();
page.on('response', r=>{ if(r.status()>=400) console.log(`${r.status()}  ${r.url()}`); });
page.on('requestfailed', r=>console.log(`FALHOU  ${r.url()} :: ${r.failure()?.errorText}`));
await page.goto(process.argv[2],{waitUntil:'domcontentloaded'});
await page.waitForTimeout(5000);
await nav.close();
