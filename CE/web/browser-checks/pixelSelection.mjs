import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const server=await createServer({root,configFile:join(root,'vite.config.js'),server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({channel:'msedge'}),page=await browser.newPage({viewport:{width:1700,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const settle=()=>page.waitForTimeout(100);
try{
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);await page.locator('.app').waitFor();
 const id=await page.evaluate(async()=>{
  const p=await import('/src/CE_Application/stores/panels.js'),c=await import('/src/CE_Application/stores/controls.js');p.addPanel();
  const id=c.addControl('PixelDisplay')._children.Core.id;
  c.applyControlPatch(id,{'Core.name':'Pixel selection example','Transform.x':50,'Transform.y':40,'Transform.width':400,'Transform.height':240,
   'Pixel.pixelsW':128,'Pixel.pixelsH':64,'Pixel.padding':8,'Pixel.showGrid':true,'Pixel.snapGrid':1,
   'Pixel.elements':[{id:'title',kind:'static',text:'CUTOFF',x:4,y:4,w:80,h:8},{id:'bar',name:'meter',kind:'hbar',x:4,y:24,w:20,h:12,extension:{keep:true}},
     {id:'auto',kind:'static',text:'AUTO',x:4,y:44,w:0,h:8}]});
  p.selectComponent(id);(await import('/src/CE_Application/stores/panelVisibility.js')).showDisplayPanel.set(true);
  (await import('/src/CE_Application/stores/displayTab.js')).displayTabRequest.set({tab:'screen'});return id;
 });
 const dock=page.locator('.screen-dock'),canvas=page.locator(`[data-control-id="${id}"]`);
 await dock.waitFor();await dock.locator('.groups').getByRole('button',{name:'Content',exact:true}).click();
 assert.match(await dock.locator('.grid-units').innerText(),/128 × 64 dots/);
 const rows=dock.locator('.el-row');
 await dock.getByRole('button',{name:'Select element 2',exact:true}).click();await settle();
 const bar=canvas.locator('.el-handle[data-element-id="bar"]');
 assert.match(await bar.getAttribute('class'),/selected/);assert.match(await rows.nth(1).getAttribute('class'),/element-selected/);
 const original=await bar.boundingBox();assert.ok(Math.abs(original.width-60)<1,'20 dot columns at 384/128 = 3 CSS pixels per dot');
 const widthField=rows.nth(1).locator('[title^="Width in dot columns"] input');await widthField.fill('40');await widthField.press('Enter');await settle();
 assert.ok(Math.abs((await bar.boundingBox()).width-120)<1,'outline updates with W');
 assert.match(await bar.innerText(),/40 × 12 dots/);
 await canvas.locator('.el-handle[data-element-id="title"]').click({position:{x:10,y:10}});await settle();
 assert.equal(await dock.getByRole('button',{name:'Select element 1',exact:true}).getAttribute('aria-pressed'),'true');
 await dock.getByRole('button',{name:'Select element 3',exact:true}).click();await settle();
 assert.match(await canvas.locator('.el-handle.selected').innerText(),/auto 23 × 8 dots/);
 console.log('ok row/canvas selection, explicit dot dimensions and automatic text width');
 // Drag the selected rectangle by 10 internal dots in X.
 await dock.getByRole('button',{name:'Select element 2',exact:true}).click();const b=await bar.boundingBox();
 await page.mouse.move(b.x+10,b.y+10);await page.mouse.down();await page.mouse.move(b.x+40,b.y+10,{steps:5});await page.mouse.up();await settle();
 assert.equal(await rows.nth(1).locator('[title^="X: dot columns"] input').inputValue(),'14');
 const moved=await page.evaluate(async id=>{
   const {get}=await import('/node_modules/svelte/src/store/index-client.js');
   const {panels}=await import('/src/CE_Application/stores/panels.js');
   return get(panels).flatMap(p=>p.controls).find(c=>c._children.Core.id===id)._children.Pixel.elements.find(e=>e.id==='bar');
 },id);
 assert.equal(moved.name,'meter');assert.deepEqual(moved.extension,{keep:true});
 await rows.nth(1).locator('button[title="More element settings"]').click();
 await dock.locator('.el-extra button[title="Move up (paints earlier)"]').click();await settle();
 assert.match(await rows.first().getAttribute('class'),/element-selected/);assert.match(await bar.getAttribute('class'),/selected/);
 await rows.first().locator('button[title="Duplicate element"]').click();await settle();
 assert.equal(await canvas.locator('.el-handle.selected').count(),1);assert.equal(await rows.nth(1).locator('.element-select').getAttribute('aria-pressed'),'true');
 await rows.nth(1).locator('button[title="Remove element"]').click();await settle();assert.equal(await canvas.locator('.el-handle.selected').count(),1);
 await dock.getByRole('button',{name:'+ Element',exact:true}).click();await settle();assert.equal(await rows.last().locator('.element-select').getAttribute('aria-pressed'),'true');
 console.log('ok dragging writes dots, selection survives reorder and follows add/duplicate/delete');
 await dock.getByRole('button',{name:'Select element 1',exact:true}).click();
 if(process.env.CE_PIXEL_SELECTION_SHOT)await page.screenshot({path:process.env.CE_PIXEL_SELECTION_SHOT});
 await page.evaluate(async id=>{
  (await import('/src/CE_Application/stores/controls.js')).applyControlPatch(id,{'Pixel.layouts':[
    {id:'page-a',name:'Page A',elements:[{id:'same-id',kind:'static',text:'A',x:4,y:4,w:20,h:8}]},
    {id:'page-b',name:'Page B',elements:[{id:'same-id',kind:'static',text:'B',x:40,y:4,w:30,h:8}]}],
    'Pixel.pages.defaultLayoutId':'page-b'});
 },id);await settle();
 await dock.getByRole('button',{name:'Select element 1',exact:true}).click();await settle();
 assert.equal(await dock.getByLabel('Active screen layout').inputValue(),'page-a');
 assert.match(await canvas.locator('.el-handle.selected').innerText(),/20 × 8 dots/);
 await dock.getByLabel('Active screen layout').selectOption('page-b');await settle();
 assert.equal(await canvas.locator('.el-handle.selected').count(),0,'same element ID on another page is a separate selection');
 await dock.getByRole('button',{name:'Select element 1',exact:true}).click();await settle();
 assert.match(await canvas.locator('.el-handle.selected').innerText(),/30 × 8 dots/);
 await dock.getByLabel('Active screen layout').selectOption('page-a');await settle();
 assert.match(await canvas.locator('.el-handle.selected').innerText(),/20 × 8 dots/);
 console.log('ok layout selection aligns canvas and table, with independent selections per page');
 await page.evaluate(async()=>(await import('/src/CE_Application/stores/interactionPreview.js')).previewModeEnabled.set(true));await settle();
 assert.equal(await page.locator('.el-handle').count(),0,'selection guides absent in Preview');
 assert.deepEqual(errors,[]);console.log('ok guides are editor-only; no browser errors');
}finally{await browser.close();await server.close();}
