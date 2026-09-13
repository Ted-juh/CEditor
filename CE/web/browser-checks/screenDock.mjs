/** Screen dock: property coverage, selection, document edits and history. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const server=await createServer({root,configFile:join(root,'vite.config.js'),server:{host:'127.0.0.1',port:0}});
await server.listen();
const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'msedge'});
const page=await browser.newPage({viewport:{width:1700,height:1000}});
const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
const dock=page.locator('.screen-dock'), side=page.locator('.properties-panel');
const settle=()=>page.waitForTimeout(100);
const select=async id=>{await page.evaluate(async id=>(await import('/src/CE_Application/stores/panels.js')).selectComponent(id),id);await settle();};
const group=async name=>{await dock.locator('.groups').getByRole('button',{name,exact:true}).click();await settle();};
const cell=label=>dock.locator('.property-cell').filter({has:page.locator('.property-label',{hasText:new RegExp(`^${label}$`,'i')})});
const number=async(label,value)=>{const input=cell(label).locator('input');await input.fill(String(value));await input.press('Enter');await settle();};
const patch=async(id,values)=>{await page.evaluate(async({id,values})=>(await import('/src/CE_Application/stores/controls.js')).applyControlPatch(id,values),{id,values});await settle();};
const read=(id,path)=>page.evaluate(async({id,path})=>{
 const {get}=await import('/node_modules/svelte/src/store/index-client.js');
 const {panels}=await import('/src/CE_Application/stores/panels.js');
 const {readSection}=await import('/src/CE_Application/utils/effectStack.js');
 return readSection(get(panels).flatMap(p=>p.controls).find(c=>c._children.Core.id===id),path);
},{id,path});
const signatures=loc=>loc.locator('[data-screen-section]').evaluateAll(es=>Object.fromEntries(es.map(e=>[e.dataset.screenSection,Array.from(e.querySelectorAll('.property-label,.nc-label')).map(n=>n.textContent.trim()).sort()])));
try {
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);await page.locator('.app').waitFor();
 const [lcd,pixel]=await page.evaluate(async()=>{
  const p=await import('/src/CE_Application/stores/panels.js'),c=await import('/src/CE_Application/stores/controls.js');p.addPanel();
  const ids=['LcdDisplay','PixelDisplay'].map(t=>c.addControl(t)._children.Core.id);
  c.applyControlPatch(ids[0],{'Core.name':'LCD screen','Transform.x':80,'Transform.y':70,'Transform.width':440,'Transform.height':160});
  c.applyControlPatch(ids[1],{'Core.name':'Pixel screen','Transform.x':550,'Transform.y':70,'Transform.width':440,'Transform.height':220});
  (await import('/src/CE_Application/stores/panelVisibility.js')).showDisplayPanel.set(true);p.selectComponent(ids[0]);
  (await import('/src/CE_Application/stores/editorTarget.js')).activateEditorTarget('typography',ids[0],'type');
  (await import('/src/CE_Application/stores/displayTab.js')).displayTabRequest.set({tab:'type'});return ids;
 });
 await page.locator('.text-dock').waitFor();await page.locator('.studio-rail').getByRole('button',{name:'Screen',exact:true}).click();await dock.waitFor();
 assert.equal(await dock.locator('.target-bar strong').innerText(),'LCD screen');
 assert.equal(await dock.locator('canvas,.screen-stage').count(),0);
 assert.equal(await dock.getByRole('button',{name:'Use selection',exact:true}).count(),0);
 await select(pixel);assert.equal(await dock.locator('.target-bar strong').innerText(),'Pixel screen');
 await dock.locator('.target-bar button').click();await select(lcd);assert.equal(await dock.locator('.target-bar strong').innerText(),'Pixel screen');
 await dock.locator('.target-bar button').click();assert.equal(await dock.locator('.target-bar strong').innerText(),'LCD screen');
 await page.evaluate(async()=>(await import('/src/CE_Application/stores/panels.js')).clearSelection());await settle();
 assert.equal(await dock.locator('.lcd-inspector').count(),0);await select(lcd);
 console.log('ok direct opening, follow selection, pin and deselection');
 for(const[id,tab,type]of[[lcd,'Display','character'],[lcd,'Display','segment'],[lcd,'Display','graphic'],[pixel,'Pixels',null]]){
  await select(id);if(type)await patch(id,{'Display.panelType':type});
  await side.locator(`button[title="${tab}"]`).click();await side.locator('[data-screen-section="Lighting"]').waitFor();
  const expected=await signatures(side),actual={};
  for(const name of ['Screen','Appearance','Content','Pages','Motion']){await group(name);Object.assign(actual,await signatures(dock));}
  assert.deepEqual(actual,expected,`${type??'pixel'}: all sidebar sections and fields available`);
 }
 console.log('ok LCD character, segment, graphic and Pixel property coverage');
 // Integration: main's programmable glyphs remain editable in the compact dock,
 // and their renderer updates in the actual component above the dock.
 await select(lcd);await patch(lcd,{'Display.panelType':'character','Display.line1':'A'});await group('Content');
 const glyphs=dock.locator('[data-screen-section="Glyphs"]');
 assert.equal(await glyphs.locator('.gl-slot').count(),8);
 await glyphs.getByRole('button',{name:'Clear all',exact:true}).click();
 await glyphs.getByRole('button',{name:'pixel 1,1',exact:true}).click();
 await glyphs.locator('.gl-claim-in').fill('A');await glyphs.locator('.gl-claim-in').press('Tab');await settle();
 assert.equal((await read(lcd,'Display.glyphs'))[0].for,'A');
 const renderedGlyph=page.locator(`[data-control-id="${lcd}"] .lcd-glyph path`).first();
 assert.equal(await renderedGlyph.getAttribute('d'),'M0 0h1v1h-1z');
 await glyphs.locator('button[title="Nudge right"]').click();await settle();
 assert.equal(await renderedGlyph.getAttribute('d'),'M1 0h1v1h-1z');
 await glyphs.getByRole('button',{name:'Bar set',exact:true}).click();await settle();
 assert.equal((await read(lcd,'Display.glyphs')).filter(g=>g.for).length,8);
 await group('Pages');assert.equal(await dock.locator('[data-screen-section="Glyphs"]').count(),0);
 console.log('ok merged glyph authoring, character claims and live component rendering');
 await select(lcd);await group('Appearance');
 await page.evaluate(async()=>(await import('/src/CE_Application/stores/propertyFilter.js')).propertyFilter.set('nothing-matches-this'));
 assert.equal(await cell('Brightness').isVisible(),true);
 await page.evaluate(async()=>(await import('/src/CE_Application/stores/propertyFilter.js')).propertyFilter.set(''));
 await page.evaluate(async()=>(await import('/src/CE_Application/stores/history.js')).flushHistory());
 await number('Brightness',63);assert.equal(await read(lcd,'Display.brightness'),63);
 await page.evaluate(async()=>(await import('/src/CE_Application/stores/history.js')).undo());await settle();assert.equal(await read(lcd,'Display.brightness'),100);
 await page.evaluate(async()=>(await import('/src/CE_Application/stores/history.js')).redo());await settle();assert.equal(await read(lcd,'Display.brightness'),63);
 await cell('Backlight').getByRole('switch').click();assert.equal(await read(lcd,'Display.backlightOn'),false);
 await cell('Dot Shape').getByRole('radio',{name:'Square'}).click();assert.equal(await read(lcd,'Display.dotShape'),'square');
 await select(pixel);await number('Glow',0.7);await number('Gamma',1.4);assert.equal(await read(pixel,'Pixel.glow'),0.7);assert.equal(await read(pixel,'Pixel.gamma'),1.4);
 await group('Screen');await cell('Palette').locator('select').selectOption({label:'Amber'});assert.equal(await read(pixel,'Pixel.palette'),'amber');
 console.log('ok lighting, gamma/glow, palette, search isolation, undo/redo');
 for(const[id,section]of[[lcd,'Display'],[pixel,'Pixel']]){
  await select(id);await group('Pages');await dock.getByRole('button',{name:'+ Enable',exact:true}).click();await settle();
  assert.equal((await read(id,`${section}.layouts`)).length,1);
  await dock.getByRole('button',{name:'+ Rule',exact:true}).click();await dock.getByRole('button',{name:'+ Rule',exact:true}).click();await settle();
  const rules=await read(id,`${section}.pages.selectorMap`);
  await patch(id,{[`${section}.pages.selectorMap`]:rules.map((r,i)=>({...r,when:String(i+1)}))});
  await dock.locator('button[title="Move rule down"]').first().click();await settle();assert.equal((await read(id,`${section}.pages.selectorMap`))[0].when,'2');
  if(section==='Display')await dock.getByRole('button',{name:'+ Zone',exact:true}).click();
  else{await group('Content');await dock.getByRole('button',{name:'+ Element',exact:true}).click();}await settle();
  assert.ok(((await read(id,`${section}.layouts`))[0][section==='Display'?'zones':'elements']??[]).length>0);
 }
 console.log('ok create layouts, reorder rules and add zones/elements');
 // Script-authored layout/zone fields are not represented by every inspector
 // input. Editing and duplicating through Content must round-trip them intact.
 const savedLayouts=await read(lcd,'Display.layouts');
 savedLayouts[0].cursorMax=5;savedLayouts[0].timeoutMs=2500;savedLayouts[0].timeoutTo='home';
 savedLayouts[0].zones[0].press={cursor:1};savedLayouts[0].zones[0].visibleWhen={cursor:2};
 savedLayouts[0].zones[0].sourceId='@state:cursor';
 await patch(lcd,{'Display.layouts':savedLayouts});await select(lcd);await group('Content');
 const zone=dock.locator('.zone-cell').first();
 await zone.locator('[title="Row"] input').fill('2');await zone.locator('[title="Row"] input').press('Enter');
 await zone.locator('button[title^="More zone settings"]').click();
 await dock.locator('button[title="Duplicate zone"]').click();await settle();
 const roundTrip=(await read(lcd,'Display.layouts'))[0];
 assert.equal(roundTrip.cursorMax,5);assert.equal(roundTrip.timeoutMs,2500);assert.equal(roundTrip.timeoutTo,'home');
 for(const z of roundTrip.zones){assert.deepEqual(z.press,{cursor:1});assert.deepEqual(z.visibleWhen,{cursor:2});assert.equal(z.sourceId,'@state:cursor');}
 console.log('ok Screen edits preserve script-authored layout and zone fields');
 await select(pixel);
 await group('Pages');await dock.locator('button[title="Add layout"]').click();await settle();
 const activeLayout=await dock.getByLabel('Active screen layout').inputValue();
 await group('Content');
 await page.locator('.studio-rail').getByRole('button',{name:'Colors',exact:true}).click();
 await page.locator('.studio-rail').getByRole('button',{name:'Screen',exact:true}).click();await dock.waitFor();
 assert.equal(await dock.getByLabel('Active screen layout').inputValue(),activeLayout);
 assert.equal(await dock.locator('.groups button.active').innerText(),'Content');
 console.log('ok chosen layout and group survive leaving Screen');
 await page.locator('.studio-rail').getByRole('button',{name:'Effects',exact:true}).click();const effects=page.locator('.effects-tab');await effects.waitFor();
 await effects.getByRole('tab',{name:'Screen',exact:true}).click();
 const backlight=effects.locator('.srow').filter({has:page.locator('.snm',{hasText:/^Backlight$/})});await backlight.click();
 await backlight.locator('button[title="Toggle Backlight"]').click();await settle();assert.equal(await read(pixel,'Pixel.backlightOn'),false);assert.equal(await read(pixel,'Pixel.backlight'),null);
 console.log('ok Pixel Effects Screen backlight routing');
 await page.locator('.studio-rail').getByRole('button',{name:'Screen',exact:true}).click();await dock.waitFor();await group('Appearance');
 await patch(lcd,{'Transform.x':25,'Transform.y':40,'Transform.width':255,'Transform.height':125});
 await patch(pixel,{'Transform.x':310,'Transform.y':40,'Transform.width':255,'Transform.height':160,'Pixel.backlightOn':true});
 if(process.env.CE_SCREEN_SHOT)await page.screenshot({path:process.env.CE_SCREEN_SHOT});
 for(const width of [700,520,340]){await dock.evaluate((el,width)=>el.style.width=`${width}px`,width);await settle();const b=await dock.evaluate(el=>({w:el.clientWidth,s:el.scrollWidth}));assert.ok(b.s<=b.w+1,`dock fits ${width}`);await group('Pages');await group('Appearance');}
 assert.deepEqual(errors,[]);console.log('ok responsive dock and no browser errors');
}finally{await browser.close();await server.close();}
