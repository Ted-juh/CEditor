import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const server=await createServer({configFile:fileURLToPath(new URL('./vite.config.mjs',import.meta.url)),server:{host:'127.0.0.1',port:0}});
await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
const page=await browser.newPage({viewport:{width:1920,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try {
  await page.route('**/gaia-panel.json',async route=>{
    const panel=JSON.parse(await readFile(process.env.GAIA_PANEL_PATH || new URL('../../panels/Roland GAIA SH-01.cepanel',import.meta.url),'utf8'));
    panel.scripting.settings ??= {};
    panel.scripting.settings['gaia.patchNames.v1:Simulated GAIA input:Simulated GAIA output']=Object.fromEntries(Array.from({length:64},(_,i)=>[i,`CACHED ${i+1}`]));
    await route.fulfill({contentType:'application/json',body:JSON.stringify(panel)});
  });
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(()=>!!window.__gaia,null,{timeout:90000});
  await page.evaluate(()=>window.__gaia.installFeedbackTestBackend());
  await page.evaluate(()=>window.__gaia.load('/gaia-panel.json'));
  await page.waitForTimeout(1200);
  await page.evaluate(()=>window.__gaia.feedbackConnect());
  await page.waitForTimeout(1300);
  async function ctl(name){const id=await page.evaluate(n=>window.__gaia.id(n),name);return page.locator(`[data-control-id="${id}"]`).first();}
  async function select(name,index,count){const b=await(await ctl(name)).boundingBox();await page.mouse.click(b.x+(index+0.5)*b.width/count,b.y+12);}
  async function has(name,text){for(let i=0;i<60;i++){if((await(await ctl(name)).textContent()).includes(text))return;await page.waitForTimeout(100);}assert.fail(`${name}: ${await(await ctl(name)).textContent()}`);}
  await select('bottom_pages',1,4); await select('patch_banks',1,4);
  await has('recall_user_A1','○ A-1  CACHED 1');
  await has('names_status_user','○ 64 cached');
  await(await ctl('recall_user_C3')).click();
  await has('patch_bank_header_user_C','BANK C · REQUESTED');
  assert.match(await(await ctl('recall_user_C3')).getAttribute('title'),/NOT confirmed/);
  await(await ctl('names_check_user')).click();
  await page.evaluate(()=>window.__gaia.receive([240,126,19,6,2,65,65,2,0,0,0,0,0,0,247]));
  const reply=async(address,data)=>page.evaluate(([address,data])=>{
    const body=[...address,...data];window.__gaia.receive([240,65,19,0,0,65,18,...body,(128-body.reduce((a,b)=>a+b,0)%128)%128,247]);
  },[address,data]);
  await reply([1,0,0,0],[87,0,18]);
  await has('patch_bank_header_user_C','BANK C · SELECTED');
  assert.match(await(await ctl('recall_user_C3')).getAttribute('title'),/confirmed by GAIA/);
  // Only one actual name reply: all other fixture names must remain explicitly cached.
  await(await ctl('names_read_user')).click();
  await page.evaluate(()=>window.__gaia.receive([240,126,19,6,2,65,65,2,0,0,0,0,0,0,247]));
  await reply([32,0,0,0],Array.from('TEST FRESH'.padEnd(12),c=>c.charCodeAt(0)));
  await(await ctl('names_stop_user')).click();
  await has('recall_user_A1','● A-1  TEST FRESH');
  await has('recall_user_A2','○ A-2  CACHED 2');
  await has('names_status_user','● 1 read · ○ 63 cached');
  await has('patch_bank_header_user_C','BANK C · SELECTED');
  await select('patch_banks',0,4); await select('patch_banks',1,4);
  await has('patch_bank_header_user_C','BANK C · SELECTED');
  if(process.env.GAIA_PAGES_OUT){await mkdir(process.env.GAIA_PAGES_OUT,{recursive:true});await page.mouse.move(1790,300);await page.screenshot({path:join(process.env.GAIA_PAGES_OUT,'GAIA-bank-feedback-SIMULATED.png'),clip:await(await ctl('bottom_pages')).boundingBox()});}
  // Route change clears selection/freshness rather than attributing this synth's data to another.
  await page.evaluate(()=>{window.__gaia.feedbackEvent('midiDestinationsListed',{destinations:[]});window.__gaia.feedbackEvent('deviceSessionState',{'Roland GAIA SH-01':{state:'ready'}});});
  await page.waitForTimeout(1100);
  await page.evaluate(()=>window.__gaia.feedbackEvent('deviceSessionState',{'Roland GAIA SH-01':{state:'disconnected'}}));
  await has('names_status_user','Selection unknown');
  await has('recall_user_A1','○ A-1  TEST FRESH');
  assert.deepEqual(errors,[]);
  console.log('Bank feedback: cached/fresh names, requested/confirmed patch and bank, read-only selection check, partial read, tab persistence and disconnect invalidation passed with simulated MIDI.');
}finally{await browser.close();await server.close();}
