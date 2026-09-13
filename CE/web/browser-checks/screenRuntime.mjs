/** Integration: main's soft-key/menu runtime in the merged editor. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const server=await createServer({root,configFile:join(root,'vite.config.js'),server:{host:'127.0.0.1',port:5174,strictPort:false}});
await server.listen();
const browser=await chromium.launch({channel:'msedge'});
const page=await browser.newPage({viewport:{width:1500,height:950}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);await page.locator('.app').waitFor();
 const [lcd,knob]=await page.evaluate(async()=>{
  const p=await import('/src/CE_Application/stores/panels.js'),c=await import('/src/CE_Application/stores/controls.js');p.addPanel();
  const lcd=c.addControl('LcdDisplay')._children.Core.id,knob=c.addControl('Knob')._children.Core.id;
  c.applyControlPatch(lcd,{'Transform.x':40,'Transform.y':40,'Transform.width':420,'Transform.height':150,
   'Display.cols':16,'Display.rows':2,'Display.pages.defaultLayoutId':'home','Display.layouts':[
    {id:'home',name:'Home',cursorMax:5,timeoutMs:500,timeoutTo:'menu',zones:[
     {id:'open',row:1,colStart:1,colEnd:8,show:'static',text:'[OPEN]',press:{layout:'menu'}},
     {id:'inert',row:1,colStart:1,colEnd:8,show:'value',sourceId:'@active'},
     {id:'home-name',row:1,colStart:10,colEnd:16,show:'static',text:'HOME'},
     {id:'idle-key',row:2,colStart:1,colEnd:8,show:'static',text:'[IDLE]',press:{cursor:1}}]},
    {id:'menu',name:'Menu',cursorMax:5,timeoutMs:1500,timeoutTo:'home',zones:[
     {id:'next',row:1,colStart:1,colEnd:8,show:'static',text:'[NEXT]',press:{cursor:1}},
     {id:'state',row:1,colStart:10,colEnd:16,show:'value',sourceId:'@state:cursor'},
     {id:'set',row:2,colStart:1,colEnd:8,show:'static',text:'[SET]',press:{set:knob,to:0.5}}]}]});
  (await import('/src/CE_Application/stores/interactionPreview.js')).previewModeEnabled.set(true);
  return[lcd,knob];
 });
 const control=page.locator(`[data-control-id="${lcd}"]`),cells=control.locator('.lcd-cell');
 await cells.first().waitFor();
 const text=()=>control.locator('.lcd-char').allTextContents().then(a=>a.join(''));
 assert.match(await text(),/\[OPEN\]/);
 await cells.nth(1).click();await page.waitForTimeout(100);
 assert.match(await text(),/\[NEXT\]/,'empty inert zone must not swallow the visible soft key');
 await cells.nth(17).click();await page.waitForTimeout(100);
 const value=await page.evaluate(async id=>{
  const {get}=await import('/node_modules/svelte/src/store/index-client.js');
  const {panelPreviewSessions}=await import('/src/CE_Application/stores/interactionPreview.js');
  return get(panelPreviewSessions)[id];
 },knob);
 assert.equal(value.valueOverride,0.5);
 for(let i=0;i<2;i++){await page.waitForTimeout(1000);await cells.nth(1).click();}
 await page.waitForTimeout(300);assert.match(await text(),/\[NEXT\]/,'menu timeout restarts after each interaction');
 await page.waitForTimeout(1600);assert.match(await text(),/HOME/,'menu returns after idle');
 await cells.nth(17).click();await page.waitForTimeout(700);
 assert.match(await text(),/HOME/,'a cursor press after auto-return must not start a chained timeout');
 // A PixelDisplay resolves a direct device parameter without a proxy knob.
 const pixel=await page.evaluate(async()=>{
  const c=await import('/src/CE_Application/stores/controls.js');
  const profiles=await import('/src/CE_Application/stores/deviceProfileStores.js');
  profiles.profileParameters.set({'integration-profile':[{id:'cutoff',name:'Cutoff',type:'number',range:{min:0,max:127},default:63}]});
  profiles.profileParameterPages.set({'integration-profile':{hasMore:false}});
  profiles.deviceRoleMappings.update(m=>({...m,mainSynth:{...m.mainSynth,profileId:'integration-profile'}}));
  const id=c.addControl('PixelDisplay')._children.Core.id;
  c.applyControlPatch(id,{'Transform.x':40,'Transform.y':240,'Transform.width':320,'Transform.height':140,
   'Pixel.elements':[{id:'readout',kind:'value',sourceId:'@param:cutoff',x:4,y:4,w:60,h:8}]});
  return id;
 });
 await page.waitForTimeout(250);
 const pixelCanvas=page.locator(`[data-control-id="${pixel}"] canvas`).first();
 const paramImage=await pixelCanvas.evaluate(c=>c.toDataURL());
 await page.evaluate(async id=>{
  const c=await import('/src/CE_Application/stores/controls.js');
  c.applyControlPatch(id,{'Pixel.elements':[{id:'readout',kind:'static',text:'63',x:4,y:4,w:60,h:8}]});
 },pixel);await page.waitForTimeout(250);
 assert.equal(paramImage,await pixelCanvas.evaluate(c=>c.toDataURL()),'direct parameter paints the same value as authored text');
 await page.evaluate(async id=>{
  const profiles=await import('/src/CE_Application/stores/deviceProfileStores.js');
  profiles.profileParameters.set({'integration-profile':[{id:'cutoff',type:'choice',default:'unknown',choices:[{id:'a',value:0,label:'A'},{id:'b',value:1,label:'B'}]}]});
  const c=await import('/src/CE_Application/stores/controls.js');
  c.applyControlPatch(id,{'Pixel.elements':[{id:'readout',kind:'value',sourceId:'@param:cutoff',x:4,y:4,w:60,h:8}]});
 },pixel);await page.waitForTimeout(250);
 const unknownImage=await pixelCanvas.evaluate(c=>c.toDataURL());
 await page.evaluate(async id=>(await import('/src/CE_Application/stores/controls.js')).applyControlPatch(id,{'Pixel.elements':[]}),pixel);
 await page.waitForTimeout(250);
 assert.equal(unknownImage,await pixelCanvas.evaluate(c=>c.toDataURL()),'unknown choice is blank, not choice zero');
 // Absent sources must let the lower layer show through in both renderers.
 // Reload so @active has no previous soft-key/control interaction to resolve.
 await page.reload();await page.locator('.app').waitFor();
 const absentIds=await page.evaluate(async()=>{
  const p=await import('/src/CE_Application/stores/panels.js'),c=await import('/src/CE_Application/stores/controls.js');p.addPanel();
  const ids=['LcdDisplay','PixelDisplay'].map(t=>c.addControl(t)._children.Core.id);
  c.applyControlPatch(ids[0],{'Display.cols':16,'Display.rows':1,'Display.layouts':[
   {id:'home',zones:[{id:'base',row:1,colStart:1,colEnd:16,show:'static',text:'BASE'}]}]});
  c.applyControlPatch(ids[1],{'Transform.y':200,'Pixel.elements':[
   {id:'base',kind:'static',text:'BASE',x:4,y:4,w:60,h:8}]});
  return ids;
 });
 const absentLcd=page.locator(`[data-control-id="${absentIds[0]}"] .lcd-char`);
 const absentPixel=page.locator(`[data-control-id="${absentIds[1]}"] canvas`).first();
 await absentPixel.waitFor();await page.waitForTimeout(250);
 const baseImage=await absentPixel.evaluate(c=>c.toDataURL());
 for(const sourceId of ['deleted-control','@active'])for(const show of ['value','pct','bar','midiValue','note']){
  await page.evaluate(async({ids,sourceId,show})=>{
   const c=await import('/src/CE_Application/stores/controls.js');
   c.applyControlPatch(ids[0],{'Display.layouts':[{id:'home',zones:[
    {id:'base',row:1,colStart:1,colEnd:16,show:'static',text:'BASE'},
    {id:'absent',row:1,colStart:1,colEnd:16,show,sourceId}]}]});
   c.applyControlPatch(ids[1],{'Pixel.elements':[
    {id:'base',kind:'static',text:'BASE',x:4,y:4,w:60,h:8},
    {id:'absent',kind:show,sourceId,x:4,y:4,w:60,h:8}]});
  },{ids:absentIds,sourceId,show});await page.waitForTimeout(100);
  assert.match((await absentLcd.allTextContents()).join(''),/BASE/,`LCD absent ${sourceId}/${show}`);
  assert.equal(await absentPixel.evaluate(c=>c.toDataURL()),baseImage,`Pixel absent ${sourceId}/${show}`);
 }
 console.log('ok absent sources preserve underlying content for all five readout kinds in both renderers');
 assert.deepEqual(errors,[]);
 console.log('ok soft-key navigation through an empty overlay, control value, menu cursor, idle return and direct pixel parameter');
}finally{await browser.close();await server.close();}
