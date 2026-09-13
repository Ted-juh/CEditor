// Behavioral acceptance: assertions describe the user's visible/runtime result.
// Fixtures use real document loading. Property edits and gestures use the actual App UI.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = process.env.CEDITOR_BEHAVIOR_OUT ?? fileURLToPath(new URL('../../../work/component-behavior/', import.meta.url));
await mkdir(out, { recursive: true });
const server = await createServer({ root, configFile: join(root, 'vite.config.js'), server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
page.setDefaultTimeout(6000);
const errors = [], results = [];
page.on('pageerror', e => errors.push(String(e)));
const settle = () => page.waitForTimeout(120);
const props = page.locator('.properties-panel');
const node = id => page.locator('.canvas-viewport').last().locator(`.canvas-control[data-control-id="${id}"]:not(.scenery-ground *)`);
async function fixture(type, sections = {}, children = [], siblings = []) {
  await page.evaluate(()=>window.__JUCE__=undefined);
  if (await props.getByTitle('Exit Preview', { exact: true }).count()) await props.getByTitle('Exit Preview', { exact: true }).click();
  const id = await page.evaluate(async ({type, sections, children, siblings}) => {
    const { createControl } = await import('/src/CE_Application/models/componentTypes.js');
    const { createPanel, serializePanel, deserializePanel } = await import('/src/CE_Application/stores/panelModel.js');
    const stores = await import('/src/CE_Application/stores/panels.js');
    const p = createPanel(`Behavior ${type}`); p.width = 900; p.height = 600;
    const c = createControl(type);
    Object.assign(c._children.Transform, {x:50,y:50,width:300,height:160});
    for (const [key,value] of Object.entries(sections)) Object.assign(c._children[key] ??= {}, value);
    for (const [index,spec] of children.entries()) {
      const child=createControl(spec.type ?? 'Label'); child._children.Core.id += `_child_${index}`;
      child._children.Core.name=`Child_${index}`;
      for(const [key,value] of Object.entries(spec.sections ?? {})) Object.assign(child._children[key] ??= {},value);
      (c._children.Children._children ??= {})[child._children.Core.id]=child;
    }
    p.controls = [c];
    for (const spec of siblings) {
      const sibling=createControl(spec.type);
      for(const [key,value] of Object.entries(spec.sections ?? {})) Object.assign(sibling._children[key] ??= {},value);
      p.controls.push(sibling);
    }
    stores.addPanel(deserializePanel(serializePanel(p), 'Behavior.cepanel'));
    stores.selectedComponentIds.set(new Set([c._children.Core.id]));
    return c._children.Core.id;
  }, {type,sections,children,siblings});
  await settle(); return id;
}
async function tab(name) {
  await props.locator(`.tab-icon[title="${name}"]`).click();
  const collapsed = props.locator('.header-toggle[aria-expanded="false"]');
  while (await collapsed.count()) await collapsed.first().click();
}
async function number(label,value) { const f=props.getByRole('textbox',{name:label,exact:true}); await f.fill(String(value)); await f.press('Enter'); await settle(); }
const cell = label => props.locator('.property-cell').filter({has:page.getByText(label,{exact:true})});
async function choose(label,value) { await cell(label).locator('select').selectOption(value); await settle(); }
async function toggle(label) { await cell(label).getByRole('switch').click(); await settle(); }
async function reopen(id) {
  if (await props.getByTitle('Exit Preview',{exact:true}).count()) await props.getByTitle('Exit Preview',{exact:true}).click();
  const text = await page.evaluate(async () => {
    const get = store => {let value; store.subscribe(v=>value=v)(); return value;};
    const {activePanel} = await import('/src/CE_Application/stores/panels.js');
    const {serializePanel} = await import('/src/CE_Application/stores/panelModel.js');
    return serializePanel(get(activePanel));
  });
  await writeFile(join(out, `${id}.cepanel`), text);
  // A fresh browser document discards all in-memory runtime/renderer state.
  await page.reload(); await page.waitForSelector('.app');
  await page.evaluate(async ({text,id}) => {
    const {deserializePanel} = await import('/src/CE_Application/stores/panelModel.js');
    const {addPanel,selectedComponentIds} = await import('/src/CE_Application/stores/panels.js');
    addPanel(deserializePanel(text,'Reopened.cepanel')); selectedComponentIds.set(new Set([id]));
  },{text,id});
  await settle();
}
async function check(name,fn) {
  if (process.env.CEDITOR_BEHAVIOR_CASE && !name.includes(process.env.CEDITOR_BEHAVIOR_CASE)) return;
  const before=errors.length;
  try { await fn(); assert.deepEqual(errors.slice(before),[]); results.push({name,status:'pass'}); console.log('PASS',name); }
  catch(e) { results.push({name,status:'fail',error:String(e)}); console.error('FAIL',name,String(e)); await page.screenshot({path:join(out,`${name.replace(/[^a-z0-9]/gi,'-')}.png`)}); }
  finally { await page.mouse.up(); await page.keyboard.up('Space'); await page.evaluate(()=>window.__JUCE__=undefined); }
}
async function captureMidi() {
  await page.evaluate(()=>{
    window.__behaviorMidi=[];
    // Observe the actual frontend/native boundary; never send bytes to hardware.
    window.__JUCE__={backend:{addEventListener:()=>0,removeEventListener:()=>{},emitEvent:(name,payload)=>window.__behaviorMidi.push({name,payload})}};
  });
}
async function paintedPixels(id, points, padding = 0) {
  const bounds = padding ? await node(id).boundingBox() : null;
  const png = bounds ? await page.screenshot({clip:{x:bounds.x-padding,y:bounds.y-padding,width:bounds.width+padding*2,height:bounds.height+padding*2}}) : await node(id).screenshot();
  return page.evaluate(async ({data,points})=>{
    const img=new Image();img.src=`data:image/png;base64,${data}`;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
    return points.map(([x,y])=>Array.from(ctx.getImageData(x,y,1,1).data));
  },{data:png.toString('base64'),points});
}
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, {waitUntil:'networkidle',timeout:60000});
  await page.waitForSelector('.app');
  await check('Meter bar thickness controls the visible bar after reopening',async()=>{
    const id=await fixture('Meter',{Meter:{value:0.5}}); await tab('Meter'); await number('Thick',12);
    const verify=async()=>assert.ok(Math.abs((await node(id).locator('.meter-track').boundingBox()).height-12)<1,'horizontal bar must be 12px thick');
    await verify(); await reopen(id); await verify();
  });
  await check('Meter segmented readout shows configured precision prefix suffix after reopening',async()=>{
    const id=await fixture('Meter',{Meter:{value:0.5,showValue:true,valuePrecision:2,valuePrefix:'Level ',valueSuffix:' V'}});
    await tab('Meter'); await number('Seg',10);
    const verify=async()=>{
      assert.equal(await node(id).locator('.seg').count(),10);
      assert.equal(await node(id).locator('.seg.lit').count(),5);
      assert.equal(await node(id).locator('.meter-readout').innerText(),'Level 0.50 V');
    };
    await verify(); await reopen(id); await verify();
  });
  await check('TextInput Display value flow refuses editing and keyboard focus',async()=>{
    const id=await fixture('TextInput',{Behavior:{defaultValue:'Original'}}); await tab('Behavior');
    await props.getByRole('radio',{name:'Display',exact:true}).click();
    await props.getByTitle('Enter Preview',{exact:true}).click();
    const input=node(id).locator('input');
    assert.equal(await input.isEditable(),false,'Display promises read-only but text input still accepts edits');
    assert.equal(await input.evaluate(e=>e.tabIndex),-1,'Display must not be a tab stop');
    await reopen(id); await props.getByTitle('Enter Preview',{exact:true}).click();
    assert.equal(await node(id).locator('input').isEditable(),false);
  });
  await check('TextInput Editable Focusable commit and cancel obey their promises',async()=>{
    const id=await fixture('TextInput',{Behavior:{defaultValue:'Original'},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'text',deviceRole:'mainSynth',parameterId:'patchName',dryRun:true}]}});
    await tab('Behavior'); await toggle('Editable'); await toggle('Focusable');
    const verify=async()=>{
      await props.getByTitle('Enter Preview',{exact:true}).click();
      const input=node(id).locator('input'); assert.equal(await input.isEditable(),false,'Editable off must prevent text entry');
      assert.equal(await input.evaluate(e=>e.tabIndex),-1,'Focusable off removes the native input from tab order');
      await props.getByTitle('Exit Preview',{exact:true}).click();
    };
    await verify();await reopen(id);await verify();await tab('Behavior');await toggle('Editable');await toggle('Focusable');
    await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();
    const input=node(id).locator('input');await input.fill('Changed');await input.press('Enter');await settle();
    let output=await page.evaluate(()=>window.__behaviorMidi.filter(x=>x.name==='setDeviceParameter'));
    assert.equal(output.length,1,'Enter must commit once, not again on blur');assert.equal(output[0].payload.value,'Changed');
    await input.fill('Cancelled');await input.press('Escape');await settle();assert.equal(await input.inputValue(),'Changed');
    output=await page.evaluate(()=>window.__behaviorMidi.filter(x=>x.name==='setDeviceParameter'));assert.equal(output.length,1,'Escape must not send the cancelled or unchanged text');
  });
  await check('Meter orientations bounds segments ticks caption and scale retain their visible meaning',async()=>{
    const id=await fixture('Meter',{Meter:{value:25,valueMin:0,valueMax:100}}); await tab('Meter');
    const fraction=()=>node(id).locator('.meter-clip').evaluate(e=>parseFloat(e.style.width||e.style.height));
    assert.equal(await fraction(),25);
    await number('Min',20); await number('Max',40); assert.equal(await fraction(),25);
    await number('Val',30); assert.equal(await fraction(),50);
    await number('Val',80); assert.equal(await fraction(),100);
    await number('Val',10); assert.equal(await fraction(),0);
    await number('Val',30); await number('Thick',14); await choose('Orientation','vertical');
    assert.ok(Math.abs((await node(id).locator('.meter-track').boundingBox()).width-14)<1);
    assert.equal(await node(id).locator('.meter-clip').evaluate(e=>e.style.height),'50%');
    await toggle('Ticks'); await number('Ticks',5);
    assert.equal(await node(id).locator('.meter-tick').count(),6);
    await cell('Caption').locator('input').fill('Signal'); await cell('Caption').locator('input').press('Tab');
    await choose('Position','above'); assert.equal(await node(id).locator('.meter-label').innerText(),'Signal');
    await number('Seg',8); assert.equal(await node(id).locator('.seg.lit').count(),4);
    assert.equal(await node(id).locator('.meter-tick').count(),6,'segment mode retains scale ticks');
    await choose('Orientation','arc');
    assert.equal(await node(id).locator('.meter-arc .meter-tick').count(),6,'arc mode retains scale ticks');
    await reopen(id);
    assert.equal(await node(id).locator('.meter-label').innerText(),'Signal');
    assert.equal(await node(id).locator('.meter-arc .meter-tick').count(),6);
  });
  await check('Numpad digits offset refusal clear auto-commit and read-only behavior survive reopen',async()=>{
    const id=await fixture('Numpad'); await tab('Numpad'); await number('Min',10); await number('Max',20); await number('Offset',1); await number('Digits',2);
    const press=async label=>{const b=await node(id).locator('svg.numpad text').filter({hasText:new RegExp(`^${label}$`)}).last().boundingBox(); await page.mouse.click(b.x+b.width/2,b.y+b.height/2); await settle();};
    const state=()=>page.evaluate(async id=>{const {panelPreviewSessions}=await import('/src/CE_Application/stores/interactionPreview.js');let v;panelPreviewSessions.subscribe(x=>v=x)();return v[id];},id);
    const value=()=>page.evaluate(async id=>{const {activePanel}=await import('/src/CE_Application/stores/panels.js');let p;activePanel.subscribe(x=>p=x)();return p.controls.find(c=>c._children.Core.id===id)._children.Value.value;},id);
    const readout=()=>node(id).locator('svg.numpad text').first().textContent();
    const verify=async()=>{
      await props.getByTitle('Enter Preview',{exact:true}).click();
      await press('1'); await press('2'); assert.equal(await readout(),'12');
      await press('↵'); assert.equal(await value(),11,'12 displayed commits 11 with offset 1'); assert.equal(await readout(),'12');
      await press('9'); await press('9'); await press('↵'); assert.equal(await value(),11,'99 is refused, not clamped');
      assert.equal(await node(id).locator('svg.numpad text').first().getAttribute('fill'),'rgba(224,120,120,1)');
      await press('C'); assert.equal(await readout(),'12');
      await props.getByTitle('Exit Preview',{exact:true}).click();
    };
    await verify(); await reopen(id); await verify(); await tab('Numpad'); await toggle('Commit on length');
    await props.getByTitle('Enter Preview',{exact:true}).click(); await press('1'); await press('5'); assert.equal(await value(),14); assert.equal(await readout(),'15');
    await props.getByTitle('Exit Preview',{exact:true}).click(); await toggle('Editable');
    await props.getByTitle('Enter Preview',{exact:true}).click(); const before=await readout(); await press('1'); assert.equal(await readout(),before);
  });
  await check('Numpad sends exactly one mapped MIDI value on Enter and none for pending digits',async()=>{
    const id=await fixture('Numpad',{Numpad:{displayOffset:1},DeviceBindings:{enabled:true,bindings:[{kind:'midiControl',port:'value',deviceRole:'mainSynth',message:'cc',controller:74,channel:3,dryRun:true}]}});
    const verify=async()=>{
      await props.getByTitle('Enter Preview',{exact:true}).click(); await captureMidi();
      const press=async label=>{const b=await node(id).locator('svg.numpad text').filter({hasText:new RegExp(`^${label}$`)}).last().boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await settle();};
      const sent=()=>page.evaluate(()=>window.__behaviorMidi.filter(x=>x.name==='triggerRawMidiAction').map(x=>x.payload));
      await press('1'); await press('2'); assert.equal((await sent()).length,0);
      await press('↵'); const output=await sent();
      assert.equal(output.length,1,'committed Numpad must send once through its binding');
      assert.equal(output[0].message,'B2 4A 0B');
      await page.evaluate(()=>window.__JUCE__=undefined);
    };
    await verify(); await reopen(id); await verify();
  });
  await check('Momentary Fire On changes when MIDI fires and repeating keyboard stops on release',async()=>{
    const id=await fixture('MomentaryButton',{DeviceBindings:{enabled:true,bindings:[{kind:'midiControl',port:'trigger',deviceRole:'mainSynth',message:'cc',controller:20,channel:1,dryRun:true}]}});
    await tab('Behavior'); await props.getByRole('radio',{name:'onPressStart',exact:true}).click();
    const sent=()=>page.evaluate(()=>window.__behaviorMidi.filter(x=>x.name==='triggerRawMidiAction'));
    const verify=async()=>{
      await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();
      const b=await node(id).boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await settle();
      assert.equal((await sent()).length,1,'onPressStart must fire while still held');
      await page.mouse.up();await settle();assert.equal((await sent()).length,1,'onPressStart must not fire again on release');
      await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();
    };
    await verify();await reopen(id);await verify();
    await tab('Behavior');await choose('Subtype','repeating');await number('Delay',80);await number('Intvl',50);
    await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await node(id).focus();await page.keyboard.down('Space');await page.waitForTimeout(260);
    assert.ok((await sent()).length>=3,'keyboard hold must repeat');await page.keyboard.up('Space');await settle();const count=(await sent()).length;await page.waitForTimeout(200);assert.equal((await sent()).length,count,'release stops repeats');
  });
  await check('OneShot Disable and Lockout affect real clicks and recover after reopening',async()=>{
    const id=await fixture('OneShotButton',{DeviceBindings:{enabled:true,bindings:[{kind:'midiControl',port:'trigger',deviceRole:'mainSynth',message:'cc',controller:21,channel:1,dryRun:true}]}});
    const sent=()=>page.evaluate(()=>window.__behaviorMidi.filter(x=>x.name==='triggerRawMidiAction'));
    const click=async()=>{const b=await node(id).boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await settle();};
    const verify=async()=>{
      await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await click();await click();
      assert.equal((await sent()).length,1,'one shot must not fire a second time');
      assert.equal(await node(id).getAttribute('aria-disabled'),'true','used one-shot is visibly disabled');
      await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();
    };
    await verify();await reopen(id);await verify();await tab('Behavior');await number('Lock',300);
    await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await click();await page.waitForTimeout(340);await click();assert.equal((await sent()).length,2,'temporary lockout allows reuse after its duration');
  });
  await check('TabContainer clicking each strip selects only its page after reopening',async()=>{
    const id=await fixture('TabContainer',{TabContainer:{pages:[{id:'a',label:'Alpha'},{id:'b',label:'Beta'}],pageIndex:0}},[
      {sections:{Core:{tabPageId:'a'},Text:{content:'ALPHA CONTENT'},Transform:{x:5,y:40,width:200,height:35}}},
      {sections:{Core:{tabPageId:'b'},Text:{content:'BETA CONTENT'},Transform:{x:5,y:40,width:200,height:35}}},
    ]);
    const verify=async()=>{
      await props.getByTitle('Enter Preview',{exact:true}).click();
      assert.ok((await node(id).textContent()).includes('ALPHA CONTENT'));
      const b=await node(id).locator('svg.tabs text').filter({hasText:'Beta'}).boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await settle();
      assert.ok((await node(id).textContent()).includes('BETA CONTENT'),'clicking Beta must display its content');
      assert.ok(!(await node(id).textContent()).includes('ALPHA CONTENT'),'inactive page content must disappear');
      await props.getByTitle('Exit Preview',{exact:true}).click();
    };
    await verify();await reopen(id);await verify();
  });
  await check('ScrollArea wheel moves real children by configured line distance and clips overflow',async()=>{
    const id=await fixture('ScrollArea',{ScrollArea:{direction:'vertical',scrollMode:'line',lineHeight:40},Children:{clip:true}},[
      {sections:{Text:{content:'SCROLL TOP'},Transform:{x:5,y:5,width:180,height:35}}},
      {sections:{Text:{content:'SCROLL BOTTOM'},Transform:{x:5,y:400,width:180,height:35}}},
    ]);
    const child=()=>node(id).locator('.canvas-control').first();
    const verify=async()=>{
      await props.getByTitle('Enter Preview',{exact:true}).click();
      const before=await child().boundingBox();const b=await node(id).boundingBox();await page.mouse.move(b.x+b.width-20,b.y+b.height/2);await page.mouse.wheel(0,100);await settle();
      const after=await child().boundingBox();const parentAfter=await node(id).boundingBox();const moved=(before.y-b.y)-(after.y-parentAfter.y);assert.ok(Math.abs(moved-40)<1,`line wheel moves content 40px, observed ${moved}`);
      await props.getByTitle('Exit Preview',{exact:true}).click();
    };
    await verify();await reopen(id);await verify();
  });
  await check('Shape kind stroke fill rotation and conditional line settings render correctly',async()=>{
    const id=await fixture('Shape',{Shape:{fillColour:'FFFF0000',strokeColour:'FF00FF00'}});await tab('Shape');
    const path=()=>node(id).locator(':scope > .control-content > svg.shape > path');
    await number('Stroke width',8);await number('Corner radius',20);assert.ok((await path().getAttribute('d')).includes('A 20 20'));
    await number('Rotation',45);assert.equal(await path().getAttribute('transform'),'rotate(45 150 80)');
    assert.equal(await path().getAttribute('fill'),'rgba(255,0,0,1)');assert.equal(await path().getAttribute('stroke'),'rgba(0,255,0,1)');
    await choose('Stroke style','dashed');await number('Dash length',9);assert.equal(Number((await path().getAttribute('stroke-dasharray')).split(' ')[0]),9);
    await toggle('Fill');assert.equal(await path().getAttribute('fill'),'none');await toggle('Fill');
    await number('Rotation',0);
    for(const [kind,vertices] of Object.entries({triangle:3,righttriangle:3,parallelogram:4,trapezoid:4,diamond:4,pentagon:5,hexagon:6,star:10,chevron:6,arrow:7,plus:12})){
      await choose('Kind',kind);const d=await path().getAttribute('d');assert.equal((d.match(/L /g)??[]).length+1,vertices,`${kind} vertex count`);assert.ok(d.endsWith('Z'));
      const bounds=await path().evaluate(e=>{const b=e.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};});assert.ok(bounds.x>=3.99&&bounds.y>=3.99&&bounds.x+bounds.width<=296.01&&bounds.y+bounds.height<=156.01,`${kind} stroke stays inside box`);
    }
    await choose('Kind','ellipse');assert.equal((await path().getAttribute('d')).match(/A /g).length,2);
    await choose('Kind','line');assert.equal(await path().getAttribute('fill'),'none');await choose('Line ends','round');assert.equal(await path().getAttribute('stroke-linecap'),'round');
    await reopen(id);assert.equal(await path().getAttribute('fill'),'none');assert.equal(await path().getAttribute('stroke-linecap'),'round');assert.equal(await path().getAttribute('stroke-width'),'8');
  });
  await check('Combobox searchable mode filters actual choices and selects the filtered value after reopen',async()=>{
    const rows=[['day','Daylight'],['night','Nightfall'],['off','Disabled choice']].map(([value,label],i)=>({id:value,internalValue:value,displayText:label,enabled:i!==2,selectedByDefault:i===0}));
    const id=await fixture('Combobox',{Value:{rows}});await tab('Behavior');await props.getByRole('radio',{name:'searchable',exact:true}).click();
    const verify=async()=>{
      await props.getByTitle('Enter Preview',{exact:true}).click();const b=await node(id).boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await settle();
      const menu=page.locator('.panel-combobox-menu');assert.equal(await menu.locator('input').count(),1,'searchable mode must provide a search input');
      await menu.locator('input').fill('night');await settle();assert.deepEqual(await menu.getByRole('option').allTextContents(),['Nightfall']);
      await menu.getByRole('option',{name:'Nightfall',exact:true}).click();await settle();assert.ok((await node(id).textContent()).includes('Nightfall'));
      await props.getByTitle('Exit Preview',{exact:true}).click();
    };await verify();await reopen(id);await verify();
  });
  await check('TabContainer page content respects all strip edges and strip size',async()=>{
    for(const edge of ['top','bottom','left','right']){
      const id=await fixture('TabContainer',{TabContainer:{edge,stripSize:36},Children:{padding:0}},[{sections:{Transform:{x:0,y:0,width:90,height:35},Text:{content:'PAGE BODY'}}}]);
      const parent=await node(id).boundingBox(),child=await node(id).locator('.canvas-control').first().boundingBox();
      assert.equal(Math.round(child.x-parent.x),edge==='left'?36:0,`${edge} content X origin`);
      assert.equal(Math.round(child.y-parent.y),edge==='top'?36:0,`${edge} content Y origin`);
    }
  });
  await check('ScrollArea axis restrictions smooth deltas and scrollbar drag operate the content',async()=>{
    const id=await fixture('ScrollArea',{ScrollArea:{direction:'vertical',scrollMode:'smooth'},Children:{padding:0}},[
      {sections:{Transform:{x:0,y:0,width:80,height:30},Text:{content:'ORIGIN'}}},
      {sections:{Transform:{x:650,y:700,width:80,height:30},Text:{content:'FAR CORNER'}}},
    ]);
    await props.getByTitle('Enter Preview',{exact:true}).click();const child=node(id).locator('.canvas-control').first();
    const relative=async()=>{const p=await node(id).boundingBox(),c=await child.boundingBox();return{x:c.x-p.x,y:c.y-p.y};};
    const b=await node(id).boundingBox();await page.mouse.move(b.x+b.width-25,b.y+70);await page.mouse.wheel(100,0);await settle();assert.equal((await relative()).x,0,'vertical mode must ignore horizontal scrolling');
    await page.mouse.wheel(0,200);await settle();assert.equal((await relative()).y,-200,'smooth mode passes pixel delta through');
    const thumb=node(id).locator('svg.scroll rect').nth(1);const r=await thumb.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+r.height/2+30,{steps:5});await page.mouse.up();await settle();assert.ok((await relative()).y < -250,'dragging visible scrollbar moves content');
  });
  await check('Meter arc sweep fills a complete circle and stays within its visible viewport',async()=>{
    const id=await fixture('Meter',{Meter:{orientation:'arc',value:1,thickness:12,arcStart:0,arcSweep:360,segments:0}});
    const verify=async()=>{
      const svg=node(id).locator('svg.meter-arc');
      const geometry=await svg.evaluate(e=>{const p=e.querySelector('path');const b=p.getBBox();return{length:p.getTotalLength(),x:b.x,y:b.y,w:b.width,h:b.height,view:e.viewBox.baseVal.width,height:e.viewBox.baseVal.height};});
      assert.ok(geometry.length>300,'a 360 degree track must be a circle, not an empty coincident-endpoint arc');
      assert.ok(geometry.x>=6&&geometry.y>=6&&geometry.x+geometry.w<=geometry.view-6&&geometry.y+geometry.h<=geometry.height-6,'arc and stroke must fit in the viewport');
    };await verify();await reopen(id);await verify();
  });
  await check('Meter segmented gradient blends zone colours and arc mode retains discrete LEDs',async()=>{
    const id=await fixture('Meter',{Meter:{value:1,segments:4,gradient:true,zones:[{from:0,colour:'FFFF0000'},{from:1,colour:'FF0000FF'}]}});
    const verify=async()=>{
      const colours=await node(id).locator('.seg').evaluateAll(es=>es.map(e=>getComputedStyle(e).backgroundColor));
      assert.equal(new Set(colours).size,4,'four segments must sample four distinct gradient colours');
      assert.ok(colours.every(c=>c!=='rgb(255, 0, 0)'&&c!=='rgb(0, 0, 255)'),'segment centres lie between zone endpoints');
    };await verify();await reopen(id);await verify();await tab('Meter');await choose('Orientation','arc');
    assert.equal(await node(id).locator('svg .meter-arc-segment').count(),4,'arc mode must honour the configured discrete segment count');
  });
  await check('Button scripts fire at the configured press or confirmation edge',async()=>{
    const listen=async()=>page.evaluate(async()=>{
      window.__clickEvents=[];
      const runtime=await import('/src/CE_Application/scripting/panelRuntime.js');
      runtime.scriptApiForTesting('', 'behavior-click-consumer').on('*','onClick',value=>window.__clickEvents.push(value));
    });
    const count=()=>page.evaluate(()=>window.__clickEvents.length);
    let id=await fixture('MomentaryButton',{Behavior:{fireOn:'onPressStart'}});
    await props.getByTitle('Enter Preview',{exact:true}).click();await listen();
    let b=await node(id).boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await settle();
    assert.equal(await count(),1,'script must hear onPressStart while the pointer remains held');
    await page.mouse.up();await settle();assert.equal(await count(),1,'script must not hear a duplicate on release');
    id=await fixture('TimedButton',{Behavior:{holdDuration:400}});await props.getByTitle('Enter Preview',{exact:true}).click();await listen();
    b=await node(id).boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await settle();assert.equal(await count(),0,'unconfirmed short hold must not execute a script');
    await page.mouse.down();await page.waitForTimeout(480);assert.equal(await count(),1,'completed hold fires once');await page.mouse.up();await settle();assert.equal(await count(),1,'release after confirmation adds no second fire');
  });
  await check('Meter linked source peak holds then falls at the configured per-second speed',async()=>{
    const id=await fixture('Meter',{Meter:{valueSourceId:'behavior_source',peakHold:true,peakHoldMs:150,peakDecayPerSec:0.5,peakColour:'FFFF0000'}},[],[
      {type:'Slider',sections:{Core:{id:'behavior_source'},Transform:{x:50,y:300,width:300,height:60},Behavior:{defaultValue:1,defaultCurrentValue:1}}},
    ]);
    const verify=async()=>{
      await props.getByTitle('Enter Preview',{exact:true}).click();await settle();
      const peak=()=>node(id).evaluate(e=>{const marker=e.querySelector('.meter-peak');return marker?parseFloat(marker.style.left)/100:0;});
      assert.ok(await peak()>0.99,'linked source at maximum sets the peak');
      await node('behavior_source').focus();await page.keyboard.press('Home');
      await page.waitForTimeout(75);assert.ok(await peak()>0.99,'marker holds after source falls');
      await page.waitForTimeout(400);const value=await peak();assert.ok(value>0.70&&value<0.93,`0.5 per second must decay gradually, observed ${value}`);
      assert.equal(await node(id).locator('.meter-peak').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 0, 0)');
    };await verify();await reopen(id);await verify();
  });
  await check('Crossfader laws gains bipolar output labels detent and persisted pointer geometry agree',async()=>{
    const id=await fixture('Crossfader',{Crossfader:{showGains:true,labelA:'Dry',labelB:'Wet',detent:0.04},DeviceBindings:{enabled:true,bindings:['a','b','mix'].map(port=>({kind:'deviceParameter',port,deviceRole:'mainSynth',parameterId:port,dryRun:true}))}});
    const handle=()=>node(id).locator('svg.xfader > rect').last();
    const mixPosition=async()=>{const b=await handle().evaluate(e=>({x:Number(e.getAttribute('x')),w:Number(e.getAttribute('width'))}));return(b.x+b.w/2-10)/280;};
    for(const [law,gain]of [['linear',0.5],['equalPower',Math.SQRT1_2],['sharp',1]]){
      await tab('Crossfader');await choose('Law',law);await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();
      const b=await node(id).boundingBox();await page.mouse.click(b.x+150,b.y+80);await settle();
      const values=await page.evaluate(()=>Object.fromEntries(window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').map(e=>[e.payload.parameterId,e.payload.value])));
      assert.ok(Math.abs(values.a-gain)<0.0001&&Math.abs(values.b-gain)<0.0001,`${law} sends the promised A/B gains`);assert.equal(values.mix,0.5);
      const bars=await node(id).locator('svg.xfader > rect[height="3"]').evaluateAll(es=>es.map(e=>Number(e.getAttribute('width'))));assert.ok(bars.every(w=>Math.abs(w-136*gain)<0.01),'gain bars match output');
      await page.mouse.click(b.x+156,b.y+80);await settle();assert.ok(Math.abs(await mixPosition()-0.5)<0.0001,'detent catches nearby pointer');
      await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();
    }
    await tab('Crossfader');await toggle('Bipolar');await toggle('Labels');assert.equal(await node(id).locator('svg text').count(),0);await toggle('Labels');assert.deepEqual(await node(id).locator('svg text').allTextContents(),['Dry','Wet']);
    await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();const b=await node(id).boundingBox();await page.mouse.click(b.x+10,b.y+80);await settle();
    assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter'&&e.payload.parameterId==='mix').at(-1)?.payload.value),-1,'bipolar left edge sends -1');
    await reopen(id);await tab('Crossfader');await choose('Orientation','vertical');await number('Mix',0.75);
    const y=await handle().evaluate(e=>Number(e.getAttribute('y'))+Number(e.getAttribute('height'))/2);assert.equal(y,45,'vertical 0.75 is a quarter down from the top');
    await toggle('Editable');await props.getByTitle('Enter Preview',{exact:true}).click();const before=await handle().getAttribute('y');await node(id).click({position:{x:150,y:140}});assert.equal(await handle().getAttribute('y'),before,'non-editable crossfader ignores drag');
  });
  await check('Crossfader set-value return can be configured and reaches that value visibly and in output',async()=>{
    const id=await fixture('Crossfader',{DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'mix',deviceRole:'mainSynth',parameterId:'mix',dryRun:true}]}});await tab('Crossfader');await choose('On release','rest');
    assert.equal(await props.getByRole('textbox',{name:'Rest',exact:true}).count(),1,'A set value must expose a value to set');await number('Rest',0.25);await number('Time (ms)',0);
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await node(id).click({position:{x:280,y:80}});await settle();const handle=node(id).locator('svg.xfader > rect').last();
      const x=await handle.evaluate(e=>Number(e.getAttribute('x'))+Number(e.getAttribute('width'))/2);assert.equal(x,80,'return rests at configured 0.25');
      assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter'&&e.payload.parameterId==='mix').at(-1)?.payload.value),0.25,'return emits its target');};await verify();await reopen(id);await verify();
  });
  await check('Joystick geometry grid corners puck and six bound outputs follow real gestures',async()=>{
    const ports=['x','y','cornerTL','cornerTR','cornerBL','cornerBR'];
    const id=await fixture('VectorJoystick',{Joystick:{cornerLabels:['Top left','Top right','Bottom left','Bottom right'],puckColour:'FFFF0000',padColour:'FF000080',cornerColour:'FF00FF00'},DeviceBindings:{enabled:true,bindings:ports.map(port=>({kind:'deviceParameter',port,deviceRole:'mainSynth',parameterId:port,dryRun:true}))}});
    await tab('Joystick');await number('Div',5);await number('Puck',12);await number('X',0.25);await number('Y',0.75);
    const svg=()=>node(id).locator('svg.joystick'),puck=()=>svg().locator('circle[stroke]');
    assert.equal(await svg().locator('line').count(),10);assert.equal(await puck().getAttribute('r'),'12');assert.equal(await puck().getAttribute('cx'),'80');assert.equal(await puck().getAttribute('cy'),'45');assert.equal(await puck().getAttribute('fill'),'rgba(255,0,0,1)');
    await toggle('Grid');assert.equal(await svg().locator('line').count(),2);await toggle('Crosshair');assert.equal(await svg().locator('line').count(),0);await toggle('Show');assert.equal(await svg().locator('text').count(),0);await toggle('Show');assert.deepEqual(await svg().locator('text').allTextContents(),['Top left','Top right','Bottom left','Bottom right']);
    const verify=async()=>{
      await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await node(id).click({position:{x:80,y:45}});await settle();
      const values=await page.evaluate(()=>Object.fromEntries(window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').map(e=>[e.payload.parameterId,e.payload.value])));
      for(const[key,value]of Object.entries({x:-0.5,y:0.5,cornerTL:0.5625,cornerTR:0.1875,cornerBL:0.1875,cornerBR:0.0625}))assert.ok(Math.abs(values[key]-value)<0.00001,`${key} must emit ${value}, observed ${values[key]}`);
      await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();
    };await verify();await reopen(id);await verify();await tab('Joystick');await toggle('Bipolar');await choose('On release','rest');await number('Rest',0.2);await number('Time (ms)',0);await choose('Axes','x');
    await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await node(id).click({position:{x:234,y:38}});await settle();assert.equal(await puck().getAttribute('cx'),'66');assert.ok(Math.abs(Number(await puck().getAttribute('cy'))-38)<0.00001);
    const outputs=await page.evaluate(()=>Object.fromEntries(window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').map(e=>[e.payload.parameterId,e.payload.value])));assert.ok(Math.abs(outputs.x-0.2)<0.00001&&Math.abs(outputs.y-0.8)<0.00001,'only X returns and both outputs match visible position');
  });
  await check('Joystick duplicate corner captions remain valid and visible',async()=>{
    const id=await fixture('VectorJoystick',{Joystick:{cornerLabels:['Same','Same','Same','Same']}});
    assert.deepEqual(await node(id).locator('svg.joystick text').allTextContents(),['Same','Same','Same','Same']);await reopen(id);assert.equal(await node(id).locator('svg.joystick text').count(),4);
  });
  await check('Listbox type-ahead respects Enter confirmation and sends one confirmed choice',async()=>{
    const rows=['Alpha','Beta','Gamma'].map((displayText,i)=>({id:String(i),internalValue:displayText,displayText,enabled:true,selectedByDefault:i===0}));
    const id=await fixture('Listbox',{Value:{rows},Listbox:{confirmMode:'enter',typeAhead:'prefix'},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'selectedChoice',deviceRole:'mainSynth',parameterId:'patchName',dryRun:true}]}});
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await node(id).focus();await page.keyboard.type('b');await settle();
      const sent=()=>page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter'));
      assert.equal((await sent()).length,0,'typing to find a row must not bypass Enter confirmation');
      assert.equal(await node(id).locator('.listbox-row.pending .lb-label').textContent(),'Beta');
      await page.keyboard.press('Enter');await settle();assert.equal((await sent()).length,1,'confirmation must emit exactly once');assert.equal((await sent())[0].payload.value,'Beta');
      assert.equal(await node(id).locator('.listbox-row.selected .lb-label').textContent(),'Beta');
    };await verify();await reopen(id);await verify();
  });
  await check('Listbox filter highlight option controls visible matches and survives reopen',async()=>{
    const rows=['Alpha','Beta','Betamax'].map((displayText,i)=>({id:String(i),internalValue:displayText,displayText,enabled:true,selectedByDefault:i===0}));
    const id=await fixture('Listbox',{Value:{rows},Listbox:{filterBox:true,highlightMatch:false}});
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await node(id).locator('input.canvas-listbox-filter').fill('beta');await settle();
      assert.deepEqual(await node(id).locator('.lb-label').allTextContents(),['Beta','Betamax']);assert.equal(await node(id).locator('mark.lb-match').count(),0,'Highlight off must not mark matching text');
      await props.getByTitle('Exit Preview',{exact:true}).click();
    };await verify();await reopen(id);await verify();await tab('Listbox');await props.getByTitle('Highlight — highlight the matched substring',{exact:true}).click();await props.getByTitle('Enter Preview',{exact:true}).click();await node(id).locator('input.canvas-listbox-filter').fill('beta');await settle();assert.equal(await node(id).locator('mark.lb-match').count(),2);
  });
  await check('Listbox smooth momentum continues a flick then stops when grabbed again',async()=>{
    const rows=Array.from({length:40},(_,i)=>({id:String(i),internalValue:String(i),displayText:`Row ${i}`,enabled:true}));
    const id=await fixture('Listbox',{Value:{rows},Listbox:{dragScroll:true,scrollMode:'smooth',momentum:true,rowHeight:24}});
    const offset=()=>node(id).locator('.listbox-scroll').evaluate(e=>-parseFloat(e.style.transform.match(/translateY\(([^p]+)/)[1]));
    await props.getByTitle('Enter Preview',{exact:true}).click();const b=await node(id).boundingBox();await page.mouse.move(b.x+120,b.y+135);await page.mouse.down();await page.mouse.move(b.x+120,b.y+50,{steps:6});const atRelease=await offset();await page.mouse.up();await page.waitForTimeout(180);
    assert.ok(await offset()>atRelease+20,'momentum must continue moving content after a flick is released');
    await page.mouse.down();const grabbed=await offset();await page.waitForTimeout(220);assert.ok(Math.abs(await offset()-grabbed)<1,'a new grab stops inertia');await page.mouse.up();
  });
  await check('Listbox search field accepts ordinary keyboard editing without selecting rows',async()=>{
    const rows=['Alpha','Beta','Betamax'].map((displayText,i)=>({id:String(i),internalValue:displayText,displayText,enabled:true}));
    const id=await fixture('Listbox',{Value:{rows},Listbox:{filterBox:true,typeAhead:'prefix'},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'selectedChoice',deviceRole:'mainSynth',parameterId:'patchName',dryRun:true}]}});
    await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();const input=node(id).locator('input.canvas-listbox-filter');await input.focus();await page.keyboard.type('beta');await settle();assert.equal(await input.inputValue(),'beta');assert.deepEqual(await node(id).locator('.lb-label').allTextContents(),['Beta','Betamax']);
    assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').length),0,'searching is not a committed selection');
  });
  await check('Momentary pointer cancellation stops repeat output immediately',async()=>{
    const id=await fixture('MomentaryButton',{Behavior:{subtype:'repeating',repeatEnabled:true,repeatDelay:60,repeatInterval:40},DeviceBindings:{enabled:true,bindings:[{kind:'midiControl',port:'trigger',deviceRole:'mainSynth',message:'cc',controller:20,channel:1,dryRun:true}]}});
    await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();const b=await node(id).boundingBox();await page.mouse.move(b.x+150,b.y+80);await page.mouse.down();await page.waitForTimeout(180);
    const count=()=>page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='triggerRawMidiAction').length);
    assert.ok(await count()>=2);await node(id).dispatchEvent('pointercancel',{pointerId:1,bubbles:true});const cancelled=await count();await page.waitForTimeout(180);assert.equal(await count(),cancelled,'cancelled pointer must not leave the repeat timer running');
  });
  await check('Ribbon text stays visible and wheel styles honour Touch glow off',async()=>{
    const id=await fixture('Ribbon',{Ribbon:{label:'Pitch',showValue:true,value:0.75,bipolar:true,showGlow:false,glowColour:'FFFF0000'}});
    const texts=await node(id).locator('svg.ribbon text').evaluateAll(es=>es.map(e=>{const b=e.getBBox();return {text:e.textContent,x:b.x,y:b.y,w:b.width,h:b.height};}));
    assert.deepEqual(texts.map(t=>t.text),['Pitch','0.50']);assert.ok(texts.every(t=>t.y>=0&&t.y+t.h<=160),'caption and readout must fit inside the component clip');
    for(const style of ['wheel','wheel3d']){
      await tab('Ribbon');await choose('Style',style);await props.getByTitle('Enter Preview',{exact:true}).click();const b=await node(id).boundingBox();await page.mouse.move(b.x+150,b.y+80);await page.mouse.down();await settle();
      assert.equal(await node(id).locator('svg.ribbon [stroke="rgba(255,0,0,1)"]').count(),0,`${style} must honour Touch glow off`);await page.mouse.up();await props.getByTitle('Exit Preview',{exact:true}).click();
    }
  });
  await check('Ribbon wheels emit snapped bipolar value touch gate and final return after reopen',async()=>{
    for(const type of ['Ribbon','PitchWheel','ModWheel']){
      const id=await fixture(type,{Ribbon:{orientation:'horizontal',snap:0.25,bipolar:true,returnMode:'center',returnTime:0},DeviceBindings:{enabled:true,bindings:['value','touch'].map(port=>({kind:'deviceParameter',port,deviceRole:'mainSynth',parameterId:port,dryRun:true}))}});
      const verify=async()=>{
        await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();const b=await node(id).boundingBox();await page.mouse.move(b.x+221,b.y+80);await page.mouse.down();await settle();
        const output=()=>page.evaluate(()=>Object.fromEntries(window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').map(e=>[e.payload.parameterId,e.payload.value])));
        let values=await output();assert.equal(values.value,0.5,`${type} 0.75 emits bipolar 0.5`);assert.ok(values.touch===1||values.touch===true,'touch gate is high while held');
        await page.mouse.up();await settle();values=await output();assert.equal(values.value,0,'return sends bipolar centre');assert.ok(values.touch===0||values.touch===false,'touch gate clears on release');
        await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();
      };await verify();await reopen(id);await verify();
    }
  });
  await check('Realistic wheel shows its configured position indicator and moves it with the value',async()=>{
    const id=await fixture('Ribbon',{Ribbon:{style:'wheel3d',orientation:'horizontal',value:0.25,indicatorColour:'FFFF00FF'}});
    const indicator=()=>node(id).locator('svg.ribbon rect[fill="rgba(255,0,255,1)"]');
    assert.equal(await indicator().count(),1,'realistic wheel must render its position-indicator property');
    const centre=()=>indicator().evaluate(e=>Number(e.getAttribute('x'))+Number(e.getAttribute('width'))/2);assert.equal(await centre(),79);
    await tab('Ribbon');await number('Val',0.75);assert.equal(await centre(),221);await reopen(id);assert.equal(await centre(),221);
  });
  await check('Numeric components obey keyboard disable and individual navigation switches',async()=>{
    for(const type of ['Number','Slider','Knob','Range']){
      const id=await fixture(type,{Behavior:{keyboardEnabled:false,min:0,max:100,step:5,defaultValue:40,defaultCurrentValue:40,defaultStartValue:20,defaultEndValue:80},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
      await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();const before=await node(id).getAttribute('aria-valuenow');await node(id).focus();await page.keyboard.press('End');await settle();assert.equal(await node(id).getAttribute('aria-valuenow'),before,`${type} keyboard off must block End`);assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').length),0,`${type} keyboard off sends nothing`);
    }
    for(const [flag,key]of [['arrowKeyAdjust','ArrowRight'],['homeEndAdjust','End'],['pageKeyAdjust','PageUp']]){
      const id=await fixture('Slider',{Behavior:{[flag]:false,defaultValue:0.4,defaultCurrentValue:0.4}});await props.getByTitle('Enter Preview',{exact:true}).click();const before=await node(id).getAttribute('aria-valuenow');await node(id).focus();await page.keyboard.press(key);await settle();assert.equal(await node(id).getAttribute('aria-valuenow'),before,`${flag} off blocks ${key}`);
    }
  });
  await check('Toggle Allow Off prevents unchecking and default state survives reopening',async()=>{
    const id=await fixture('ToggleButton',{Behavior:{defaultValue:true,allowUncheck:false},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'state',deviceRole:'mainSynth',parameterId:'state',dryRun:true}]}});
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();assert.equal(await node(id).getAttribute('aria-checked'),'true');await node(id).click();await settle();assert.equal(await node(id).getAttribute('aria-checked'),'true','Allow Off off keeps an active toggle on');assert.ok(!(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter'))).some(e=>e.payload.value===false),'cannot emit an off value');await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();await tab('Behavior');await toggle('Allow Off');await props.getByTitle('Enter Preview',{exact:true}).click();await node(id).click();assert.equal(await node(id).getAttribute('aria-checked'),'false');
  });
  await check('Radio group multi-select and deselect change visible items and emitted value sets',async()=>{
    const rows=['Alpha','Beta','Gamma'].map((label,i)=>({id:label,displayText:label,internalValue:label,enabled:true,selectedByDefault:i===0}));
    const id=await fixture('RadioButtonGroup',{Behavior:{selectionMode:'multi',allowDeselect:true,defaultValue:'Alpha'},Value:{rows},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'selectedChoice',deviceRole:'mainSynth',parameterId:'choices',dryRun:true}]}});
    const selected=()=>node(id).locator('.radio-group-item.selected .radio-group-label').allTextContents();
    const click=async label=>{const b=await node(id).locator('.radio-group-label').filter({hasText:new RegExp(`^${label}$`)}).boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await settle();};
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await click('Beta');assert.deepEqual((await selected()).sort(),['Alpha','Beta'],'multi-select retains the earlier active choice');let output=await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value);assert.deepEqual(output,['Alpha','Beta']);await click('Alpha');assert.deepEqual(await selected(),['Beta']);await click('Beta');assert.deepEqual(await selected(),[],'deselecting the last choice must not restore a default visually');await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
  });
  await check('ScrollArea reaches children above the origin and reports its actual child count',async()=>{
    const id=await fixture('ScrollArea',{ScrollArea:{direction:'vertical',scrollMode:'smooth'},Children:{padding:0}},[
      {sections:{Text:{content:'ABOVE ORIGIN'},Transform:{x:5,y:-80,width:180,height:35}}},
      {sections:{Text:{content:'BELOW ORIGIN'},Transform:{x:5,y:300,width:180,height:35}}},
    ]);
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();const b=await node(id).boundingBox();await page.mouse.move(b.x+250,b.y+80);await page.mouse.wheel(0,-1000);await settle();const first=await node(id).locator('.canvas-control').first().boundingBox();const parent=await node(id).boundingBox();assert.ok(first.y>=parent.y&&first.y+first.height<=parent.y+parent.height,'scrolling upward must reveal the child at y=-80');assert.equal(await node(id).locator('svg.scroll rect').last().getAttribute('y'),'0','thumb reaches the top at the negative limit');await props.getByTitle('Exit Preview',{exact:true}).click();await tab('Scroll');assert.match(await props.locator('.extent').textContent(),/2 children/,'content summary must count real model children');};await verify();await reopen(id);await verify();
  });
  await check('Number bounds step direct entry cancellation and emitted value agree after reopen',async()=>{
    const id=await fixture('Number',{Behavior:{min:10,max:20,step:2,defaultValue:14},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
    await tab('Behavior');await number('Size',20);
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();const input=node(id).locator('input');assert.equal(await input.inputValue(),'14');await input.focus();await page.keyboard.press('ArrowUp');await settle();assert.equal(await input.inputValue(),'16');assert.equal(await node(id).getAttribute('aria-valuenow'),'16');await input.fill('99');await input.press('Enter');await settle();assert.equal(await input.inputValue(),'20','direct entry clamps to maximum');assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),20);await input.fill('12');await input.press('Escape');await settle();assert.equal(await input.inputValue(),'20','Escape restores the committed value');await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
  });
  await check('Range spinner low and high fields enforce their bounds and show both values after reopen',async()=>{
    const id=await fixture('Range',{Behavior:{min:0,max:100,step:5,defaultStartValue:20,defaultEndValue:80}});
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();const inputs=node(id).locator('input');assert.deepEqual(await inputs.evaluateAll(es=>es.map(e=>e.value)),['20','80']);await inputs.first().fill('95');await inputs.first().press('Enter');await settle();assert.deepEqual(await inputs.evaluateAll(es=>es.map(e=>e.value)),['80','80'],'low cannot cross high');await inputs.last().fill('120');await inputs.last().press('Enter');await settle();assert.deepEqual(await inputs.evaluateAll(es=>es.map(e=>e.value)),['80','100'],'high clamps at maximum');await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
  });
  await check('Slider and Knob readout accessible value and output match authored defaults and navigation',async()=>{
    for(const type of ['Slider','Knob']){
      const id=await fixture(type,{Behavior:{min:-10,max:10,step:0.5,precision:1,defaultCurrentValue:2.5,showValueReadout:true},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
      const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();assert.equal(Number(await node(id).locator('.slider-readout').textContent()),2.5);assert.equal(Number(await node(id).getAttribute('aria-valuenow')),2.5,'accessible value must match the displayed default');await node(id).focus();await page.keyboard.press('ArrowUp');await settle();assert.equal(Number(await node(id).locator('.slider-readout').textContent()),3);assert.equal(Number(await node(id).getAttribute('aria-valuenow')),3);assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),3);await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
    }
  });
  await check('Macro curves depth range and lanes match the bound outputs and persisted gesture',async()=>{
    const slots=[['linear',1,0,1,0.75],['exp',1,0,1,0.5625],['log',1,0,1,0.9375],['scurve',-0.5,0.2,0.8,0.246875]].map(([curve,depth,min,max,expected],i)=>({id:`m${i}`,label:curve,curve,depth,min,max,expected,colour:'FFFF0000',enabled:true}));
    const id=await fixture('Macro',{Macro:{value:0.25,slots},DeviceBindings:{enabled:true,bindings:slots.map((s,i)=>({kind:'deviceParameter',port:`slot_${i}`,deviceRole:'mainSynth',parameterId:`macro${i}`,dryRun:true}))}});
    const exercise=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();const b=await node(id).boundingBox();await page.mouse.move(b.x+80,b.y+110);await page.mouse.down();await page.mouse.move(b.x+80,b.y+35,{steps:10});await page.mouse.up();await settle();
    const values=await page.evaluate(()=>Object.fromEntries(window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').map(e=>[e.payload.parameterId,e.payload.value])));
    const verifyLanes=async()=>{const bars=await node(id).locator('svg.macro > rect[height="8"]').evaluateAll(es=>es.map(e=>Number(e.getAttribute('width'))));for(let i=0;i<slots.length;i++)assert.ok(Math.abs(bars[i*2+1]/bars[i*2]-slots[i].expected)<0.0001,`${slots[i].curve} lane matches mapped value`);assert.ok((await node(id).locator('svg.macro text').allTextContents()).includes('75'));};
    for(let i=0;i<slots.length;i++)assert.ok(Math.abs(values[`macro${i}`]-slots[i].expected)<0.0001,`${slots[i].curve} emitted mapped output`);await verifyLanes();await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await exercise();await reopen(id);assert.ok((await node(id).locator('svg.macro text').allTextContents()).includes('25'),'preview rehearsal preserves the authored value');await exercise();await tab('Macro');await toggle('Lanes');assert.equal(await node(id).locator('svg.macro > rect[height="8"]').count(),0);await toggle('Values');assert.equal(await node(id).locator('svg.macro text').count(),1);await toggle('Editable');await props.getByTitle('Enter Preview',{exact:true}).click();const before=await node(id).locator('svg.macro > line').getAttribute('x2');await node(id).click({position:{x:150,y:60}});assert.equal(await node(id).locator('svg.macro > line').getAttribute('x2'),before);
  });
  await check('Multiple Macro instances use their own label clips at different sizes',async()=>{
    const id=await fixture('Macro',{},[],[{type:'Macro',sections:{Core:{id:'other_macro'},Transform:{x:400,y:60,width:400,height:240}}}]);
    const verify=async()=>{for(const controlId of [id,'other_macro']){const refs=await node(controlId).locator('svg.macro text[clip-path]').evaluateAll(es=>es.map(e=>{const id=e.getAttribute('clip-path').slice(5,-1),target=document.getElementById(id);return {own:target?.closest('svg')===e.closest('svg'),text:e.textContent};}));assert.ok(refs.length>0&&refs.every(r=>r.own),`Macro ${controlId} must clip labels against its own geometry`);}};await verify();await reopen(id);await verify();
  });
  await check('PixelDisplay grid dimensions bar width brightness gamma and live source paint the expected dots',async()=>{
    const id=await fixture('PixelDisplay',{Pixel:{pixelsW:30,pixelsH:16,padding:0,showGhost:false,showGlass:false,showScanlines:false,backlightOn:false,brightness:100,gamma:1,glow:0,dotShape:'square',litColour:'FFFFFFFF',layouts:[],elements:[{id:'bar',kind:'hbar',sourceId:'pixel_source',x:4,y:4,w:12,h:6}]}},[],[{type:'Number',sections:{Core:{id:'pixel_source'},Transform:{x:450,y:50,width:140,height:50},Behavior:{min:0,max:1,step:0.25,valueType:'float',defaultValue:0.5}}}]);
    const pixel=async(x,y)=>node(id).locator('canvas.lcd-graphic').evaluate((c,{x,y})=>Array.from(c.getContext('2d').getImageData(Math.floor((x+0.5)*c.width/30),Math.floor((y+0.5)*c.height/16),1,1).data),{x,y});
    const verify=async()=>{assert.deepEqual(await pixel(9,6),[255,255,255,255],'half of a 12-dot bar lights six columns');assert.equal((await pixel(10,6))[3],0,'seventh column remains unlit');assert.equal((await pixel(3,6))[3],0,'X=4 starts at grid column four');await props.getByTitle('Enter Preview',{exact:true}).click();await node('pixel_source').focus();await page.keyboard.press('ArrowUp');await settle();assert.equal((await pixel(12,6))[3],255,'0.75 lights nine columns');assert.equal((await pixel(13,6))[3],0);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();await tab('Pixels');let input=cell('Brightness').locator('input.scrub-value');await input.fill('25');await input.press('Enter');await settle();assert.ok(Math.abs((await pixel(5,6))[3]-83)<=1,'25% brightness changes actual dot alpha');input=cell('Gamma').locator('input.scrub-value');await input.fill('2');await input.press('Enter');await settle();assert.ok(Math.abs((await pixel(5,6))[3]-140)<=1,'gamma 2 lifts the quarter-bright dot to half response');await reopen(id);assert.ok(Math.abs((await pixel(5,6))[3]-140)<=1,'lighting survives reopen');
  });
  await check('LCD tokens dimensions and seven-segment glyphs render their configured content after reopen',async()=>{
    const id=await fixture('LcdDisplay',{Display:{cols:24,rows:2,layouts:[],lines:['V {value}','{pct}% {bar:8}'],value:5,valueMin:0,valueMax:20,valuePrecision:1,valuePrefix:'+',valueSuffix:'dB',showGhost:false}});
    const lines=()=>node(id).locator('.lcd-line').evaluateAll(es=>es.map(e=>Array.from(e.querySelectorAll('.lcd-char')).map(c=>c.textContent).join('')));
    const verify=async()=>{assert.equal(await node(id).locator('.lcd-cell').count(),48);const text=await lines();assert.ok(text[0].startsWith('V +5.0dB'));assert.ok(text[1].startsWith('25% ██'));};await verify();await reopen(id);await verify();await tab('Display');await number('Cols',12);await number('Rows',1);assert.equal(await node(id).locator('.lcd-cell').count(),12);assert.equal((await lines())[0].trim(),'V +5.0dB');
    const segmentId=await fixture('LcdDisplay',{Display:{panelType:'segment',segmentType:'7',cols:2,rows:1,layouts:[],lines:['18'],showGhost:false}});const segments=()=>node(segmentId).locator('svg.lcd-seg > polygon');assert.equal(await segments().count(),9,'1 lights two segments; 8 lights all seven');await reopen(segmentId);assert.equal(await segments().count(),9);
  });
  await check('Number and Range Keyboard off also blocks typing into their inline value fields',async()=>{
    for(const type of ['Number','Range']){
      const id=await fixture(type,{Behavior:{keyboardEnabled:false,min:0,max:100,defaultValue:40,defaultStartValue:20,defaultEndValue:80}});await props.getByTitle('Enter Preview',{exact:true}).click();const inputs=node(id).locator('input');const before=await inputs.evaluateAll(es=>es.map(e=>e.value));await inputs.first().focus();await page.keyboard.press('Control+a');await page.keyboard.type('33');await page.keyboard.press('Enter');await settle();assert.deepEqual(await inputs.evaluateAll(es=>es.map(e=>e.value)),before,`${type} keyboard off must cover the actual field, not only the outer wrapper`);
    }
  });
  await check('Image contain fit flips and opacity change actual painted pixels and survive reopening',async()=>{
    const imageSrc='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><path fill="red" d="M0 0h50v25H0z"/><path fill="lime" d="M50 0h50v25H50z"/><path fill="blue" d="M0 25h50v25H0z"/><path fill="yellow" d="M50 25h50v25H50z"/></svg>').toString('base64');
    const id=await fixture('Image',{Background:{_children:{Fill:{solidEnabled:true,colour:'FF101010',imageEnabled:true,imageSrc,imageFit:'contain',imageOpacity:100},Border:{enabled:false},Corners:{radius:0}}}});
    let pixels=await paintedPixels(id,[[75,40],[225,40],[75,120],[225,120],[75,2]]);assert.deepEqual(pixels.slice(0,4).map(p=>p.slice(0,3)),[[255,0,0],[0,255,0],[0,0,255],[255,255,0]]);assert.deepEqual(pixels[4].slice(0,3),[16,16,16],'contain fits the whole image with a 5px letterbox');await tab('Background');await toggle('Flip H');assert.deepEqual((await paintedPixels(id,[[75,40]]))[0].slice(0,3),[0,255,0]);await toggle('Flip V');assert.deepEqual((await paintedPixels(id,[[75,40]]))[0].slice(0,3),[255,255,0]);await number('Opac',50);const verify=async()=>{const p=(await paintedPixels(id,[[75,40]]))[0];assert.ok(Math.abs(p[0]-136)<=1&&Math.abs(p[1]-136)<=1&&Math.abs(p[2]-8)<=1,'50% image opacity composites over the authored solid');};await verify();await reopen(id);await verify();
  });
  await check('Image rotation covers every corner throughout all four quadrants',async()=>{
    const imageSrc='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="red" d="M0 0h100v100H0z"/></svg>').toString('base64');
    const id=await fixture('Image',{Background:{_children:{Fill:{solidEnabled:true,colour:'FF101010',imageEnabled:true,imageSrc,imageFit:'fill',imageRotation:135},Border:{enabled:false},Corners:{radius:0}}}});
    const verify=async angle=>{const pixels=await paintedPixels(id,[[20,20],[280,20],[20,140],[280,140]]);assert.ok(pixels.every(p=>p[0]>250&&p[1]<5&&p[2]<5),`rotation ${angle} must cover the corners: ${JSON.stringify(pixels)}`);};await verify(135);await tab('Background');for(const angle of [45,225,315,-135]){await number('Angle',angle);await verify(angle);}await reopen(id);await verify(-135);
  });
  await check('Slider return to rest moves the visible handle and emits its final value on release',async()=>{
    const id=await fixture('Slider',{Behavior:{returnMode:'center',returnTime:0,defaultCurrentValue:0.25},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await node(id).click({position:{x:275,y:80}});await settle();assert.equal(Number(await node(id).locator('.slider-readout').textContent()),0.5,'release returns the handle to centre');assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),0.5,'final output matches the resting handle');await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
  });
  await check('Numeric wrapper typing commits only on Enter and Escape keeps the previous output',async()=>{
    for(const type of ['Number','Slider','Knob']){
      const id=await fixture(type,{Behavior:{min:0,max:100,step:1,precision:0,defaultValue:40,defaultCurrentValue:40},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
      const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await node(id).focus();await page.keyboard.type('23');await settle();assert.equal(Number(await node(id).getAttribute('aria-valuenow')),40,`${type} draft must not change the committed handle`);assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').length),0,'uncommitted typing must not reach the device');await page.keyboard.press('Escape');assert.equal(Number(await node(id).getAttribute('aria-valuenow')),40);await page.keyboard.type('26');await page.keyboard.press('Enter');await settle();assert.equal(Number(await node(id).getAttribute('aria-valuenow')),26);assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),26);await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
    }
  });
  await check('Slider timed returns follow their curve and a new grab interrupts the spring',async()=>{
    for(const curve of ['linear','exp','ease']){
      const id=await fixture('Slider',{Behavior:{returnMode:'min',returnTime:800,returnCurve:curve,defaultCurrentValue:0.25,step:0.001,precision:3},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
      const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();const b=await node(id).boundingBox();await page.mouse.move(b.x+275,b.y+80);await page.mouse.down();const from=Number(await node(id).getAttribute('aria-valuenow'));await page.mouse.up();const started=Date.now();await page.waitForTimeout(240);const actual=Number(await node(id).getAttribute('aria-valuenow'));const t=Math.min(1,(Date.now()-started)/800);const shaped=curve==='exp'?1-(1-t)**3:curve==='ease'?(t<.5?2*t*t:1-(-2*t+2)**2/2):t;assert.ok(Math.abs(actual-from*(1-shaped))<.1,`${curve} follows its timed trajectory: ${actual}`);await page.mouse.down();const grabbed=Number(await node(id).getAttribute('aria-valuenow'));await page.waitForTimeout(850);assert.equal(Number(await node(id).getAttribute('aria-valuenow')),grabbed,'a new grab cancels the earlier spring');await page.mouse.up();await page.waitForTimeout(950);assert.equal(Number(await node(id).getAttribute('aria-valuenow')),0);assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),0);await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
    }
  });
  await check('Slider and Knob typed display values map back to the correct wire value',async()=>{
    for(const type of ['Slider','Knob']){
      const id=await fixture(type,{Behavior:{min:61,max:67,step:1,precision:0,displayMin:-3,displayMax:3,defaultCurrentValue:64},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'octave',dryRun:true}]}});
      const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();assert.equal(Number(await node(id).locator('.slider-readout').textContent()),0);await node(id).focus();await page.keyboard.type('-2');await page.keyboard.press('Enter');await settle();assert.equal(Number(await node(id).locator('.slider-readout').textContent()),-2,'typed display value must survive commit');assert.equal(Number(await node(id).getAttribute('aria-valuenow')),62);assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),62);await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
    }
  });
  await check('ProgressBar shows its reading and changing progress changes the actual fill after reopen',async()=>{
    const id=await fixture('ProgressBar',{Meter:{value:35,valueMin:0,valueMax:100,valuePrecision:0,valueSuffix:'%'}});
    const verify=async expected=>{assert.equal(await node(id).locator('.meter-readout').textContent(),`${expected}%`);const track=await node(id).locator('.meter-track').boundingBox();const fill=await node(id).locator('.meter-clip').boundingBox();assert.ok(Math.abs(fill.width/track.width-expected/100)<.01);};await verify(35);await tab('Meter');await number('Val',75);await verify(75);await reopen(id);await verify(75);
  });
  await check('CyclicButton skips disabled choices obeys wrap and sends the displayed choice',async()=>{
    for(const wrapBehavior of [false,true]){
      const rows=[{id:'a',internalValue:10,displayText:'Alpha',enabled:true},{id:'b',internalValue:20,displayText:'Blocked',enabled:false},{id:'c',internalValue:30,displayText:'Gamma',enabled:true}];
      const id=await fixture('CyclicButton',{Behavior:{defaultValue:10,wrapBehavior},Value:{rows},Text:{content:'{valueDisplay}'},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'selectedChoice',deviceRole:'mainSynth',parameterId:'choice',dryRun:true}]}});
      const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await node(id).click();await settle();assert.match(await node(id).textContent(),/Gamma/);assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),30);await node(id).click();await settle();assert.match(await node(id).textContent(),wrapBehavior?/Alpha/:/Gamma/);assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),wrapBehavior?10:30);await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
    }
  });
  await check('Leaving Preview cancels an unfinished numeric return and stops its output',async()=>{
    const id=await fixture('Slider',{Behavior:{returnMode:'min',returnTime:2500,returnCurve:'linear'},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
    await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await node(id).click({position:{x:275,y:80}});await page.waitForTimeout(150);await props.getByTitle('Exit Preview',{exact:true}).click();await settle();const count=await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').length);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').length),count,'closing rehearsal must stop its return output');
  });
  await check('Number and Range Display mode blocks native input edits and outbound values',async()=>{
    for(const type of ['Number','Range']){
      const id=await fixture(type,{Behavior:{valueFlow:'display',min:0,max:100,defaultValue:40,defaultStartValue:20,defaultEndValue:80},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
      const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();const input=node(id).locator('input').first();const before=await input.inputValue();await input.focus();await page.keyboard.press('Control+A');await page.keyboard.type('33');await page.keyboard.press('Enter');await page.keyboard.press('ArrowUp');await settle();assert.equal(await input.inputValue(),before,`${type} Display is read-only through its real inline field`);assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').length),0);await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
    }
  });
  await check('Container and Group fit contents padding and minimum size match their actual child geometry',async()=>{
    for(const type of ['Container','Group']){
      const id=await fixture(type,{Children:{fitWidth:'contents',fitHeight:'contents',padding:10,minWidth:0,minHeight:0}},[{sections:{Transform:{x:20,y:30,width:100,height:40},Text:{content:'FITTED CHILD'}}}]);
      const verify=async(w,h,left,top)=>{const parent=await node(id).boundingBox();const child=await node(id).locator('.canvas-control').first().boundingBox();assert.ok(Math.abs(parent.width-w)<1&&Math.abs(parent.height-h)<1,`${type} expected ${w}x${h}, got ${parent.width}x${parent.height}`);assert.ok(Math.abs(child.x-parent.x-left)<1&&Math.abs(child.y-parent.y-top)<1,'padding positions the actual child inside the fitted box');};await verify(140,90,30,40);await tab('Children');await toggle('Per side');const edit=async(label,v)=>{const f=cell(label).getByRole('textbox');await f.fill(String(v));await f.press('Enter');await settle();};await edit('Left',25);await edit('Top',15);await verify(155,95,45,45);await edit('Min W',240);await edit('Min H',180);await verify(240,180,45,45);await reopen(id);await verify(240,180,45,45);
    }
  });
  await check('Range Home and End never send a value beyond the other handle',async()=>{
    const id=await fixture('Range',{Behavior:{min:0,max:100,step:1,defaultStartValue:20,defaultEndValue:80},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();const inputs=node(id).locator('input');await inputs.last().focus();await inputs.last().press('Home');await settle();assert.deepEqual(await inputs.evaluateAll(es=>es.map(e=>e.value)),['20','20'],'high Home clamps to low');assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),20,'outbound must equal the clamped visible high handle');await inputs.first().focus();await inputs.first().press('End');await settle();assert.deepEqual(await inputs.evaluateAll(es=>es.map(e=>e.value)),['20','20']);assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),20);await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
  });
  await check('Container and Group clipping actually hides overflowing child pixels and can be turned off',async()=>{
    for(const type of ['Container','Group']){
      const id=await fixture(type,{Transform:{width:150,height:100},Children:{padding:0,clip:false}},[{sections:{Transform:{x:120,y:30,width:60,height:40},Text:{content:''},Background:{_children:{Fill:{solidEnabled:true,colour:'FFFF0000'},Border:{enabled:false},Corners:{radius:0}}}}}]);
      const isRed=async()=>{const p=(await paintedPixels(id,[[200,80]],40))[0];return p[0]>245&&p[1]<10&&p[2]<10;};assert.equal(await isRed(),true,'child beyond x=150 is visible with clipping off');await tab('Children');await toggle('Clip');assert.equal(await isRed(),false,'clipping hides the same outside pixel');await reopen(id);assert.equal(await isRed(),false);await tab('Children');await toggle('Clip');assert.equal(await isRed(),true);
    }
  });
  await check('Label font size letter spacing case and baseline move the actual rendered text after reopen',async()=>{
    const id=await fixture('Label',{Text:{content:'abcd',_children:{Font:{family:'Arial',size:20,letterSpacing:0},Position:{justification:'centred'},Fill:{colour:'FFFFFFFF'}}}});
    const glyph=()=>node(id).locator('.text-glyphs');const width=()=>glyph().evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);return r.getBoundingClientRect().width;});const initial=await width();await tab('Text');await number('Size',40);const larger=await width();assert.ok(Math.abs(larger/initial-2)<.05,`doubling font size doubles this four-letter word: ${initial} to ${larger}`);await number('Letter',5);assert.ok(Math.abs((await width())-larger-20)<1,'letter spacing adds 5px per glyph');await choose('Case','uppercase');assert.equal((await glyph().textContent()).trim(),'ABCD');const top=(await glyph().boundingBox()).y;await number('Base',10);assert.ok(Math.abs((await glyph().boundingBox()).y-top+10)<1,'positive baseline raises glyphs by 10px');const before=await glyph().boundingBox();await reopen(id);assert.equal((await glyph().textContent()).trim(),'ABCD');const after=await glyph().boundingBox();assert.ok(Math.abs(after.width-before.width)<1&&Math.abs(after.y-before.y)<1,'fresh reopen preserves actual text geometry');
  });
  await check('Editor resize honours minimum and maximum dimensions and rotation survives reopening',async()=>{
    const id=await fixture('Label',{Transform:{width:200,height:100,minWidth:120,minHeight:60,maxWidth:260,maxHeight:140},Text:{content:'RESIZE'}});
    const resize=async(dx,dy)=>{const boxes=await node(id).locator('.resize-handle').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};}));const br=boxes.sort((a,b)=>b.x+b.y-a.x-a.y)[0];assert.ok(br,'selected component exposes resize handles');await page.mouse.move(br.x,br.y);await page.mouse.down();await page.mouse.move(br.x+dx,br.y+dy,{steps:8});await page.mouse.up();await settle();};
    await resize(-150,-70);let b=await node(id).boundingBox();assert.ok(Math.abs(b.width-120)<1&&Math.abs(b.height-60)<1,`minimum is 120x60, got ${b.width}x${b.height}`);await resize(250,180);b=await node(id).boundingBox();assert.ok(Math.abs(b.width-260)<1&&Math.abs(b.height-140)<1);await tab('Transform');await number('Rot',90);b=await node(id).boundingBox();assert.ok(Math.abs(b.width-140)<1&&Math.abs(b.height-260)<1,'90 degree rotation swaps visible bounds');await reopen(id);b=await node(id).boundingBox();assert.ok(Math.abs(b.width-140)<1&&Math.abs(b.height-260)<1);
  });
  await check('Nested bottom-right anchors follow the padded parent when it is resized',async()=>{
    const id=await fixture('Container',{Transform:{width:200,height:120},Children:{padding:10}},[{sections:{Transform:{anchor:'bottomRight',x:15,y:12,width:40,height:30},Text:{content:'ANCHOR'}}}]);
    const verify=async()=>{const p=await node(id).boundingBox();const c=await node(id).locator('.canvas-control').first().boundingBox();assert.ok(Math.abs(p.x+p.width-c.x-c.width-25)<1,'right inset includes 10 padding + 15 anchor');assert.ok(Math.abs(p.y+p.height-c.y-c.height-22)<1,'bottom inset includes 10 padding + 12 anchor');};await verify();await tab('Transform');await number('W',300);await number('H',200);await verify();await reopen(id);await verify();
  });
  await check('Slider band handles enforce neighbours for keyboard entry and show the value they send',async()=>{
    const id=await fixture('Slider',{Behavior:{valueMode:'band',min:0,max:100,step:1,precision:0,defaultStartValue:20,defaultCurrentValue:50,defaultEndValue:80,showHandleLabels:true,allowHandleCross:false},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();const handles=node(id).locator('.slider-svg > circle[fill="none"]');assert.equal(await handles.count(),3);const pick=async index=>{const b=await handles.nth(index).boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);};await pick(0);await page.keyboard.press('End');await settle();assert.equal((await node(id).locator('.slider-readout').textContent()).trim(),'50 | 50 | 80');assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),50);await pick(2);await page.keyboard.press('Home');await settle();assert.equal((await node(id).locator('.slider-readout').textContent()).trim(),'50 | 50 | 50');await page.keyboard.type('5');await page.keyboard.press('Enter');await settle();assert.equal((await node(id).locator('.slider-readout').textContent()).trim(),'50 | 50 | 50','typing into end cannot cross current');assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),50);await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
  });
  await check('Background glow follows a rounded silhouette instead of the rectangular component bounds',async()=>{
    const id=await fixture('Label',{Transform:{width:160,height:160},Text:{content:''},Background:{_children:{Fill:{solidEnabled:true,colour:'FF804010'},Border:{enabled:false},Corners:{radius:80},Effects:{_children:{Shadows:{items:[{enabled:true,type:'outer-glow',colour:'FF00FF00',blur:8,spread:0}]}}}}}});
    const verify=async()=>{const [edge,corner]=await paintedPixels(id,[[110,25],[30,30]],30);assert.ok(edge[1]-edge[0]>20&&edge[1]-edge[2]>20,`green glow should extend above the curved edge: ${edge}`);assert.ok(corner[1]-Math.max(corner[0],corner[2])<10,`far square corner must not get rectangular glow: ${corner}`);};await verify();await reopen(id);await verify();
  });
  await check('Whole-component and background filters paint correctly with complete or partial saved settings',async()=>{
    for(const complete of [false,true])for(const surface of ['component','background'])for(const [filter,value,want]of [['invert',100,[127,191,223]],['brightness',50,[64,32,16]],['grayscale',100,[75,75,75]]]){
      const effects={_children:{Filters:{...(complete?{blur:0,brightness:100,contrast:100,saturation:100,hueRotate:0,grayscale:0,sepia:0,invert:0}:{}),[filter]:value}}};const bg={_children:{Fill:{solidEnabled:true,colour:'FF804020'},Border:{enabled:false},Corners:{radius:0},...(surface==='background'?{Effects:effects}:{})}};
      const id=await fixture('Label',{Text:{content:''},Background:bg,...(surface==='component'?{Effects:effects}:{})});const verify=async()=>{const p=(await paintedPixels(id,[[150,80]]))[0];assert.ok(want.every((v,i)=>Math.abs(p[i]-v)<=2),`${surface}/${filter} expected ${want}, got ${p}`);};await verify();await reopen(id);await verify();
    }
  });
  await check('Numeric return onSettled scripts receive the clamped value shown by the active handle',async()=>{
    const id=await fixture('Slider',{Behavior:{valueMode:'band',min:0,max:100,step:1,precision:0,defaultStartValue:20,defaultCurrentValue:50,defaultEndValue:80,returnMode:'min',returnTime:0}});
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await page.evaluate(async()=>{window.__settled=[];(await import('/src/CE_Application/scripting/panelRuntime.js')).scriptApiForTesting('','behavior-settled-consumer').on('*','onSettled',v=>window.__settled.push(v));});const end=await node(id).locator('.slider-svg > circle[fill="none"]').last().boundingBox();await page.mouse.click(end.x+end.width/2,end.y+end.height/2);await settle();assert.equal((await node(id).locator('.slider-readout').textContent()).trim(),'20 | 50 | 50');const events=await page.evaluate(()=>window.__settled);assert.equal(events.length,1);assert.equal(events[0].value,50,'script event must describe the actual resting handle rather than the out-of-bounds requested target');await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
  });
  await check('PixelDisplay marquee moves overflowing text without requiring another animation',async()=>{
    await page.emulateMedia({reducedMotion:'no-preference'});
    const id=await fixture('PixelDisplay',{Transform:{width:320,height:160},Pixel:{pixelsW:64,pixelsH:32,padding:0,showGhost:false,showGlass:false,animMode:'off',elements:[{id:'scroll',kind:'static',text:'ABCDEFGH',x:2,y:2,w:18,h:8,scroll:true}]}});
    const verify=async()=>{const canvas=node(id).locator('canvas').first();const initial=await canvas.evaluate(c=>c.toDataURL());await page.waitForTimeout(850);const later=await canvas.evaluate(c=>c.toDataURL());assert.notEqual(later,initial,'overflowing text must move when Scroll is enabled on an otherwise static display');};await verify();await reopen(id);await verify();
  });
  await check('PixelDisplay Blink hides and restores text bitmap widgets and animation elements',async()=>{
    await page.emulateMedia({reducedMotion:'no-preference'});
    for(const kind of ['static','bitmap','hbar','vbar','hslider','vslider','needle','wave','scope','adsr','anim']){
      const id=await fixture('PixelDisplay',{Transform:{width:320,height:160},Pixel:{pixelsW:64,pixelsH:32,padding:0,showGhost:false,showGlass:false,animMode:'off',elements:[{id:'blink',kind,text:'HELLO',bits:'1'.repeat(128),x:2,y:2,w:16,h:8,blink:true,frame:true,animMode:'preset',animPreset:'wave'}]}});
      const verify=async()=>{const counts=await node(id).locator('canvas').first().evaluate(async c=>{const counts=[];for(let t=0;t<14;t++){const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let i=3;i<d.length;i+=4)if(d[i])count++;counts.push(count);await new Promise(r=>setTimeout(r,100));}return counts;});assert.ok(Math.max(...counts)>0,`${kind} must paint during its on phase`);assert.equal(Math.min(...counts),0,`${kind} must disappear during its off phase: ${counts}`);};await verify();await reopen(id);await verify();
    }
  });
  await check('PixelDisplay source formatting paints the exact requested text after reopening',async()=>{
    const cfg={pixelsW:128,pixelsH:16,padding:0,showGhost:false,showGlass:false,animMode:'off'};
    for(const [kind,extra,want] of [['name',{},'[Cutoff]'],['value',{precision:2},'[64.00]'],['pct',{},'[50]'],['midiValue',{radix:'hex'},'[40]'],['note',{},'[E4]'],['text',{},'[Tune]'],['state',{},'[On]'],['edit',{sourceId:'@edit'},'[Preset]'],['static',{text:'Caption'},'[Caption]']]){
      const el={id:'formatted',kind,sourceId:'format_source',prefix:'[',suffix:']',x:2,y:2,w:120,h:8,...extra};
      const id=await fixture('PixelDisplay',{Transform:{width:512,height:64},Pixel:{...cfg,editText:'Preset',elements:[el]}},[],[{type:'Number',sections:{Core:{id:'format_source',name:'Cutoff'},Transform:{x:50,y:300,width:100,height:50},Behavior:{min:0,max:127,defaultValue:64},Text:{content:'Tune'}}},{type:'PixelDisplay',sections:{Core:{id:'format_reference'},Transform:{x:50,y:200,width:512,height:64},Pixel:{...cfg,elements:[{id:'reference',kind:'static',text:want,x:2,y:2,w:120,h:8}]}}}]);
      const verify=async()=>{const image=el=>el.locator('canvas').first().evaluate(c=>c.toDataURL());assert.ok((await image(node(id)))===(await image(node('format_reference'))),`${kind} must paint exactly ${want}`);};await verify();await reopen(id);await verify();
    }
  });
  await check('PixelDisplay custom-font wrapping preserves every glyph using the chosen font dimensions',async()=>{
    const src=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=3;c.height=4;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,3,4);return c.toDataURL();});
    const id=await fixture('PixelDisplay',{Transform:{width:320,height:160},Pixel:{pixelsW:64,pixelsH:32,padding:0,showGhost:false,showGlass:false,animMode:'off',customFont:{src,glyphW:3,glyphH:4,cols:1,first:65},elements:[{id:'custom',kind:'static',text:'AAAAA',font:'custom',x:2,y:2,w:24,h:8,wrap:true}]}});
    const expected=[];for(const [count,y]of [[3,2],[2,11]])for(let glyph=0;glyph<count;glyph++)for(let yy=y;yy<y+8;yy++)for(let x=2+glyph*8;x<8+glyph*8;x++)expected.push(`${x},${yy}`);expected.sort();
    const verify=async()=>{await page.waitForTimeout(250);const lit=await node(id).locator('canvas').first().evaluate(c=>{const ctx=c.getContext('2d'),out=[];for(let y=0;y<32;y++)for(let x=0;x<64;x++)if(ctx.getImageData(Math.floor((x+.5)*c.width/64),Math.floor((y+.5)*c.height/32),1,1).data[3])out.push(`${x},${y}`);return out.sort();});assert.deepEqual(lit,expected,'five 3x4 glyphs at scale 2 must wrap three then two, with a one-dot line gap');};await verify();await reopen(id);await verify();
  });
  await check('PixelDisplay custom-font clicks insert at the glyph boundary shown on screen',async()=>{
    const src=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=6;c.height=4;const ctx=c.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,6,4);ctx.fillStyle='white';ctx.fillRect(0,0,3,4);ctx.fillRect(3,0,1,4);return c.toDataURL();});
    const cfg={pixelsW:64,pixelsH:32,padding:0,showGhost:false,showGlass:false,animMode:'off',customFont:{src,glyphW:3,glyphH:4,cols:2,first:65}};
    const id=await fixture('PixelDisplay',{Transform:{width:320,height:160},Pixel:{...cfg,editText:'AAAAA',elements:[{id:'edit',kind:'edit',sourceId:'@edit',font:'custom',x:2,y:2,w:50,h:8}]}},[],[{type:'PixelDisplay',sections:{Core:{id:'caret_reference'},Transform:{x:450,y:50,width:320,height:160},Pixel:{...cfg,elements:[{id:'expected',kind:'static',text:'AABAAA',font:'custom',x:2,y:2,w:50,h:8}]}}}]);
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await page.waitForTimeout(250);const b=await node(id).boundingBox();await page.mouse.click(b.x+90,b.y+30);await page.keyboard.type('B');await page.keyboard.press('Enter');await settle();const image=el=>el.locator('canvas').first().evaluate(c=>c.toDataURL());assert.ok((await image(node(id)))===(await image(node('caret_reference'))),'clicking after the second custom glyph must insert B after two As');await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
  });
  await check('Slider settings: all eight presets draw their handles and retain functional output after reopening',async()=>{
    for(const geometry of ['Linear','Circular'])for(const preset of ['Single','Bipolar','Range','Band']){
      const id=await fixture('Slider',{Behavior:{min:0,max:100,step:1,precision:0,rangeSeparator:' - ',bandSeparator:' | '},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});await tab('Slider');await cell(geometry).getByRole('button',{name:preset,exact:true}).click();await settle();
      const index=['Single','Bipolar','Range','Band'].indexOf(preset),dimensions=geometry==='Linear'?[[220,48],[240,56],[240,56],[260,64]][index]:[[180,180],[200,200],[200,200],[220,220]][index];
      const verify=async()=>{const box=await node(id).boundingBox();assert.ok(Math.abs(box.width-dimensions[0])<1&&Math.abs(box.height-dimensions[1])<1,`${geometry}/${preset} dimensions`);assert.equal(await node(id).locator('.slider-svg > circle[fill="none"]').count(),[1,1,2,3][index]);assert.equal((await node(id).locator('.slider-readout').textContent()).trim(),['50','0.00','25 - 75','25 | 50 | 75'][index]);await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await node(id).focus();await page.keyboard.press('End');await settle();const expected=[100,1,75,75][index];assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),expected,`${geometry}/${preset} emits its reachable endpoint`);await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
    }
  });
  await check('Slider settings: Snap to ticks aligns pointer keyboard and output with displayed stops',async()=>{
    for (const config of [
      {majorTickCount:5,minorTickCount:0,snapToTicks:true},
      {majorTickCount:3,minorTickCount:1,snapToTicks:true,snapToStep:false},
      {majorTickCount:5,minorTickCount:0,snapToTicks:false},
    ]) {
      const id=await fixture('Slider',{Behavior:{min:0,max:100,step:1,precision:0,defaultCurrentValue:50,showCenterMarker:false,...config},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
      const verify=async()=>{
        const ticks=await node(id).locator('.slider-svg > line').evaluateAll(es=>es.map(e=>Number(e.getAttribute('x1'))).sort((a,b)=>a-b));
        assert.equal(ticks.length,5,'major and minor counts must produce five visible stops');
        await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();
        const box=await node(id).boundingBox();await page.mouse.click(box.x+box.width*.37,box.y+box.height/2);await settle();
        const wanted=config.snapToTicks?25:37;
        assert.equal((await node(id).locator('.slider-readout').textContent()).trim(),String(wanted),'37% pointer position snaps only when the option is enabled');
        assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),wanted);
        if(config.snapToTicks)assert.ok(Math.abs(Number(await node(id).locator('.slider-svg > circle[fill="none"]').first().getAttribute('cx'))-ticks[1])<.1,'the handle sits on the drawn quarter tick');
        await page.keyboard.press('ArrowRight');await settle();
        assert.equal((await node(id).locator('.slider-readout').textContent()).trim(),config.snapToTicks?'50':'38','keyboard advances by the enabled stop spacing');
        await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();
      };
      await verify();await reopen(id);await verify();
    }
  });
  await check('Slider settings: fractional steps below one hundredth remain usable and emit the shown value',async()=>{
    for(const type of ['Slider','Knob']){
      const id=await fixture(type,{Behavior:{min:0,max:1,step:.001,precision:3,defaultCurrentValue:.5},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
      const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await node(id).focus();await page.keyboard.press('ArrowRight');await settle();assert.equal((await node(id).locator('.slider-readout').textContent()).trim(),'0.501',`${type} honours step 0.001`);assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),.501);await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
    }
  });
  await check('Slider settings: reversed mouse changes drag and wheel direction without mirroring the artwork',async()=>{
    for(const type of ['Slider','Knob']){
      const id=await fixture(type,{Behavior:{min:0,max:1,step:.01,precision:2,defaultCurrentValue:.5,reverseMouseDirection:true,wheelEnabled:true,circularDragMode:'knob',circularDragSensitivity:1},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
      const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();const pointer=node(id).locator('.slider-svg > circle[fill="none"]').first(),start=await pointer.boundingBox();if(type==='Slider'){const b=await node(id).boundingBox();await page.mouse.click(b.x+b.width*.75,b.y+b.height/2);}else{await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await page.mouse.move(start.x+start.width/2,start.y+start.height/2-50,{steps:8});await page.mouse.up();}await settle();assert.equal((await node(id).locator('.slider-readout').textContent()).trim(),type==='Slider'?'0.25':'0.30',`${type} reversed drag decreases its value`);if(type==='Slider')assert.ok((await pointer.boundingBox()).x<start.x,'lower value still draws on the normal left-hand side');await node(id).hover();await page.mouse.wheel(0,-100);await settle();assert.equal((await node(id).locator('.slider-readout').textContent()).trim(),type==='Slider'?'0.24':'0.29',`${type} wheel follows the reversed direction too`);assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),type==='Slider'?.24:.29);await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
    }
  });
  await check('Slider rotary and knob drag modes honour direction sensitivity and painted handle position',async()=>{
    for(const config of [
      {mode:'knob',sensitivity:.5,direction:'cw',reverse:false,want:.6},
      {mode:'knob',sensitivity:2,direction:'cw',reverse:false,want:.9},
      ...['cw','ccw'].flatMap(direction=>[false,true].map(reverse=>({mode:'rotary',sensitivity:1,direction,reverse,want:(direction==='cw')!==reverse?.75:.25}))),
    ]){
      const id=await fixture('Knob',{Transform:{width:240,height:240},Behavior:{min:0,max:1,step:.001,precision:3,defaultCurrentValue:.5,startAngle:0,sweepAngle:360,circularDiameter:120,showValueReadout:false,circularDragMode:config.mode,circularDragSensitivity:config.sensitivity,direction:config.direction,reverseMouseDirection:config.reverse},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
      const verify=async()=>{
        await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();
        const b=await node(id).boundingBox(),pointer=node(id).locator('.slider-svg > circle[fill="none"]').first(),p=await pointer.boundingBox();
        const cx=b.x+b.width/2,cy=b.y+b.height/2,px=p.x+p.width/2,py=p.y+p.height/2,radius=Math.hypot(px-cx,py-cy);
        await page.mouse.move(px,py);await page.mouse.down();
        await page.mouse.move(config.mode==='knob'?px:cx-(py-cy),config.mode==='knob'?py-50:cy+(px-cx),{steps:12});await page.mouse.up();await settle();
        assert.ok(Math.abs(Number(await node(id).getAttribute('aria-valuenow'))-config.want)<.001,JSON.stringify(config));
        assert.ok(Math.abs(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value)-config.want)<.001,'emitted value agrees with the drag');
        const after=await pointer.boundingBox(),angle=(config.direction==='cw'?1:-1)*config.want*Math.PI*2;
        assert.ok(Math.hypot(after.x+after.width/2-(cx+Math.cos(angle)*radius),after.y+after.height/2-(cy+Math.sin(angle)*radius))<1,'handle paints at the corresponding authored angle');
        assert.equal(await node(id).locator('.slider-readout').count(),0,'the disabled readout stays hidden');
        await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();
      };
      await verify();await reopen(id);await verify();
    }
  });
  await check('Screen text editing enforces charset and length and correctly commits cancels and reopens',async()=>{
    for(const type of ['LcdDisplay','PixelDisplay'])for(const [charset,maxLength,initial,input,want] of [
      ['digits',3,'12','A34','123'],['upper',5,'AB','cdeF','ABCDE'],['alnum',0,'x','Y9','xY9'],['ascii',0,'ABC','0123456789!?xyz','ABC0123456789!?xyz'],
    ]){
      const pixelBase={pixelsW:128,pixelsH:24,padding:0,showGhost:false,showGlass:false,animMode:'off'};
      const section={editText:initial,editCharset:charset,editMaxLength:maxLength};
      const cfg=type==='PixelDisplay'?{Pixel:{...pixelBase,...section,elements:[{id:'edit',kind:'edit',sourceId:'@edit',prefix:'[',suffix:']',x:2,y:2,w:124,h:8}]}}:{Display:{...section,cols:24,rows:1,cursorMode:'off',layouts:[{id:'home',zones:[{id:'edit',show:'edit',sourceId:'@edit',prefix:'[',suffix:']',row:1,colStart:1,colEnd:24}]}]}};
      const id=await fixture(type,{Transform:{width:512,height:96},...cfg},[],type==='PixelDisplay'?[{type:'PixelDisplay',sections:{Core:{id:'edit_reference'},Transform:{x:50,y:230,width:512,height:96},Pixel:{...pixelBase,elements:[{id:'reference',kind:'static',text:`[${want}]`,x:2,y:2,w:124,h:8}]}}}]:[]);
      const verify=async()=>{
        await props.getByTitle('Enter Preview',{exact:true}).click();
        const clickEnd=async()=>{const b=await node(id).boundingBox();await page.mouse.click(b.x+b.width-20,b.y+b.height/2);};
        const verifyText=async()=>{if(type==='LcdDisplay')assert.equal((await node(id).locator('.lcd-char').allTextContents()).join('').trim(),`[${want}]`);else{const png=el=>el.locator('canvas').first().evaluate(c=>c.toDataURL());assert.ok((await png(node(id)))===(await png(node('edit_reference'))),`${charset}/${maxLength} must paint [${want}]`);}};
        await clickEnd();await page.keyboard.type(input);await page.keyboard.press('Enter');await settle();await verifyText();
        await clickEnd();await page.keyboard.press('Backspace');await page.keyboard.press('Escape');await settle();await verifyText();
        await props.getByTitle('Exit Preview',{exact:true}).click();
      };
      await verify();await reopen(id);await verify();
    }
  });
  await check('LCD aligned edit fields place the caret in the painted text and retain authored alignment after reopen',async()=>{
    for(const align of ['left','center','right']){
      const id=await fixture('LcdDisplay',{Transform:{width:512,height:96},Display:{cols:16,rows:1,editText:'AB',editCharset:'upper',editMaxLength:8,cursorMode:'off',layouts:[{id:'home',zones:[{id:'edit',show:'edit',sourceId:'@edit',prefix:'[',suffix:']',align,row:1,colStart:1,colEnd:16}]}]}});
      const verify=async()=>{
        await props.getByTitle('Enter Preview',{exact:true}).click();
        const chars=node(id).locator('.lcd-char');const before=await chars.allTextContents();const bIndex=before.findIndex(c=>c==='B');assert.ok(bIndex>=0);
        const box=await chars.nth(bIndex).locator('..').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.keyboard.type('X');await page.keyboard.press('Enter');await settle();
        assert.equal((await chars.allTextContents()).join('').trim(),'[AXB]',`${align}: click on B inserts before B`);
        await props.getByTitle('Exit Preview',{exact:true}).click();
      };await verify();await reopen(id);await verify();
    }
  });
  await check('LCD bound editing changes the source label and choice with visible output and Tab navigation',async()=>{
    const rows=['Alpha','Disabled','Beta'].map((displayText,i)=>({id:String(i),internalValue:displayText,displayText,enabled:i!==1,selectedByDefault:i===0}));
    const id=await fixture('LcdDisplay',{Transform:{width:512,height:160},Display:{cols:16,rows:2,editCharset:'upper',editMaxLength:8,cursorMode:'off',layouts:[{id:'home',zones:[{id:'name',show:'edit',sourceId:'edit_label',row:1,colStart:1,colEnd:16},{id:'choice',show:'edit',sourceId:'edit_choice',row:2,colStart:1,colEnd:16}]}]}},[],[
      {type:'Label',sections:{Core:{id:'edit_label'},Transform:{x:50,y:240,width:220,height:60},Text:{content:'AB',editable:true}}},
      {type:'Combobox',sections:{Core:{id:'edit_choice'},Transform:{x:320,y:240,width:220,height:60},Value:{rows},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'selectedChoice',deviceRole:'mainSynth',parameterId:'patchName',dryRun:true}]}}},
    ]);
    const verify=async()=>{
      await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();
      const b=await node(id).locator('.lcd-line').first().boundingBox();await page.mouse.click(b.x+b.width-15,b.y+b.height/2);await page.keyboard.type('X');await page.keyboard.press('Tab');await page.keyboard.press('ArrowRight');await settle();
      const lines=await node(id).locator('.lcd-line').evaluateAll(es=>es.map(e=>[...e.querySelectorAll('.lcd-char')].map(c=>c.textContent).join('').trim()));assert.deepEqual(lines,['ABX','Beta']);
      const label=page.locator('.canvas-viewport').last().locator('.canvas-control[data-control-id="edit_label"]').last();
      assert.ok((await label.textContent()).includes('ABX'),'bound Label paints the edited string');assert.ok((await node('edit_choice').textContent()).includes('Beta'),'bound Combobox paints the selected option');
      assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),'Beta','screen choice skips disabled row and sends the source output');
      await page.keyboard.press('Shift+Tab');await page.keyboard.press('Backspace');await page.keyboard.press('Escape');await settle();assert.ok((await label.textContent()).includes('ABX'),'Escape restores the value at re-entry');
      await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();
    };await verify();await reopen(id);await verify();
  });
  await check('Slider multiple handles respect active policy crossing and circular wrap in painted values and output',async()=>{
    const cases=[
      {policy:'startFirst',key:'ArrowRight',want:'21 | 50 | 80',out:21},
      {policy:'currentFirst',key:'ArrowRight',want:'20 | 51 | 80',out:51},
      {policy:'endFirst',key:'ArrowRight',want:'20 | 50 | 81',out:81},
      {policy:'startFirst',key:'End',want:'50 | 50 | 80',out:50},
      {policy:'startFirst',key:'End',cross:true,want:'100 | 50 | 80',out:100},
      {policy:'startFirst',key:'End',geometry:'circular',wrap:true,want:'100 | 50 | 80',out:100},
    ];
    for(const c of cases){
      const id=await fixture('Slider',{Behavior:{valueMode:'band',geometry:c.geometry??'linear',min:0,max:100,step:1,precision:0,defaultStartValue:20,defaultCurrentValue:50,defaultEndValue:80,activeHandlePolicy:c.policy,allowHandleCross:c.cross===true,allowWrapAround:c.wrap===true,bandSeparator:' | '},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'value',deviceRole:'mainSynth',parameterId:'cutoff',dryRun:true}]}});
      const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await node(id).focus();await page.keyboard.press(c.key);await settle();assert.equal((await node(id).locator('.slider-readout').textContent()).trim(),c.want,JSON.stringify(c));assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),c.out);await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
    }
  });
  await check('LCD scrolling direction gap bounce and finite repeats produce the expected moving windows',async()=>{
    for(const scroll of ['left','right'])for(const scrollMode of ['loop','bounce']){
      const id=await fixture('LcdDisplay',{Display:{cols:4,rows:1,lines:['ABCDEFGH'],layouts:[],scroll,scrollMode,scrollSpeed:12,scrollGap:2,scrollRepeat:1,cursor:'off'}});
      const verify=async()=>{
        const read=async()=>(await node(id).locator('.lcd-char').allTextContents()).join('');
        const seen=[];for(let i=0;i<9;i++){seen.push(await read());await page.waitForTimeout(90);}
        assert.ok(new Set(seen).size>=3,`${scroll}/${scrollMode} visibly advances`);
        const allowed=scrollMode==='bounce'?['ABCD','BCDE','CDEF','DEFG','EFGH']:Array.from({length:10},(_,i)=>('ABCDEFGH  ABCDEFGH  ').slice(i,i+4));
        assert.ok(seen.every(v=>allowed.includes(v)),`${scroll}/${scrollMode}: ${JSON.stringify(seen)}`);
        if(scrollMode==='loop'){
          const steps=seen.slice(1).map((v,i)=>(allowed.indexOf(v)-allowed.indexOf(seen[i])+10)%10).filter(n=>n!==0);
          assert.ok(steps.filter(n=>scroll==='left'?n<=3:n>=7).length>steps.length/2,`${scroll}: windows advance in the requested direction: ${steps}`);
        }
        await page.waitForTimeout(450);const settled=await read();await page.waitForTimeout(250);assert.equal(await read(),settled,'finite repeat stays settled');assert.equal(settled,scrollMode==='bounce'&&scroll==='right'?'EFGH':'ABCD');
      };await verify();await reopen(id);await verify();
    }
  });
  await check('LCD cursor row column style and blink affect the actual displayed cell',async()=>{
    for(const cursor of ['underline','block']){
      const id=await fixture('LcdDisplay',{Display:{cols:4,rows:2,lines:['ABCD','EFGH'],layouts:[],cursor,cursorRow:1,cursorCol:2,cursorBlink:false,blink:false}});
      const verify=async()=>{const marker=node(id).locator(`.lcd-cursor-${cursor}`);assert.equal(await marker.count(),1);const index=await marker.evaluate(e=>[...e.closest('.lcd-screen').querySelectorAll('.lcd-cell')].indexOf(e.parentElement));assert.equal(index,6,'row 1 col 2 is the G cell');assert.ok(await marker.isVisible());await page.waitForTimeout(600);assert.equal(await marker.count(),1,'nonblinking cursor stays painted');};await verify();await reopen(id);await verify();
    }
    const id=await fixture('LcdDisplay',{Display:{cols:4,rows:1,lines:['ABCD'],layouts:[],cursor:'off',blink:true,blinkRate:180}});
    const verify=async()=>{const counts=[];for(let i=0;i<9;i++){counts.push(await node(id).locator('.lcd-char').count());await page.waitForTimeout(80);}assert.ok(counts.includes(0)&&counts.includes(4),'blink alternates between visible text and no lit glyphs');};await verify();await reopen(id);await verify();
  });
  await check('Pixel appearance paints round or square dots glow and ghost intensity with saved properties',async()=>{
    const id=await fixture('PixelDisplay',{Transform:{width:160,height:160},Pixel:{pixelsW:8,pixelsH:8,padding:0,litColour:'FFFFFFFF',unlitColour:'FFFF0000',brightness:100,contrast:100,showGhost:false,showGlass:false,dotShape:'round',glow:0,elements:[{id:'dot',kind:'bitmap',x:2,y:2,w:1,h:1,bits:'1'}]}});
    const pixel=(x,y)=>node(id).locator('canvas').first().evaluate((c,{x,y})=>Array.from(c.getContext('2d').getImageData(x,y,1,1).data),{x,y});
    assert.deepEqual(await pixel(50,50),[255,255,255,255]);assert.equal((await pixel(43,43))[3],0,'round dot has an empty corner');
    await tab('Pixels');await props.getByRole('radio',{name:'Square',exact:true}).click();await settle();assert.equal((await pixel(43,43))[3],255,'square dot fills its corner');await reopen(id);assert.equal((await pixel(43,43))[3],255);
    await tab('Pixels');let input=cell('Glow').locator('input.scrub-value');await input.fill('1');await input.press('Enter');await settle();assert.ok((await pixel(61,50))[3]>40,'glow paints beyond the crisp dot');
    await props.getByTitle('Ghost dots — faint unlit dots (realism cue)',{exact:true}).click();await settle();assert.deepEqual(await pixel(10,10),[255,0,0,128],'contrast 100 paints half-opacity red ghosts');await reopen(id);assert.ok((await pixel(61,50))[3]>40);assert.deepEqual(await pixel(10,10),[255,0,0,128]);
  });
  await check('Pixel Reset appearance restores the painted default while preserving element content',async()=>{
    const content={pixelsW:16,pixelsH:16,elements:[{id:'bar',kind:'bitmap',x:4,y:4,w:6,h:2,bits:'111111111111'}]};
    const id=await fixture('PixelDisplay',{Transform:{width:160,height:160},Pixel:{...content,glow:1,gamma:3,brightness:25,dotShape:'square',litColour:'FFFF0000'}},[],[{type:'PixelDisplay',sections:{Core:{id:'default_pixel'},Transform:{x:300,y:50,width:160,height:160},Pixel:content}}]);
    const png=el=>el.locator('canvas').first().evaluate(c=>c.toDataURL());
    await tab('Pixels');await props.getByRole('button',{name:'↺ Reset appearance',exact:true}).click();await settle();assert.ok((await png(node(id)))===(await png(node('default_pixel'))),'reset restores default dot rendering');await reopen(id);assert.ok((await png(node(id)))===(await png(node('default_pixel'))));
    await tab('Pixels');const brightness=cell('Brightness').locator('input.scrub-value');await brightness.fill('25');await brightness.press('Enter');await settle();
    const alpha=()=>node(id).locator('canvas').first().evaluate(c=>c.getContext('2d').getImageData(40,40,1,1).data[3]);assert.ok(Math.abs(await alpha()-83)<=1,'reset gamma yields the default quarter-brightness response');await reopen(id);assert.ok(Math.abs(await alpha()-83)<=1);
  });

  await check('Dependent selectors keep visible choices selected state and child output in sync after parent changes',async()=>{
    for(const parentType of ['Combobox','RadioButtonGroup','CyclicButton'])for(const type of ['Combobox','Listbox','RadioButtonGroup'])for(const reset of [true,false]){
      const rows=[['A1','A'],['A2','A'],['B1','B'],['B2','B'],['Shared','']].map(([value,parentValue],i)=>({id:value,internalValue:value,displayText:value,parentValue,enabled:true,selectedByDefault:i===0}));
      const id=await fixture(type,{Behavior:{defaultValue:'A1'},Value:{rows,dependsOn:'bank_parent',dependsResetOnChange:reset},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'selectedChoice',deviceRole:'mainSynth',parameterId:'childChoice',dryRun:true}]}},[],[{type:parentType,sections:{Core:{id:'bank_parent'},Transform:{x:50,y:300,width:260,height:48},Behavior:{defaultValue:'A'},Value:{rows:['A','B'].map((v,i)=>({id:v,internalValue:v,displayText:v,enabled:true,selectedByDefault:i===0}))},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'selectedChoice',deviceRole:'mainSynth',parameterId:'bankChoice',dryRun:true}]}}}]);
      const clickChoice=async(controlId,controlType,label)=>{
        if(controlType==='Combobox'){await node(controlId).click();await page.locator('.panel-combobox-menu').getByRole('option',{name:label,exact:true}).click();}
        else if(controlType==='CyclicButton')await node(controlId).click();
        else{const target=node(controlId).locator(controlType==='Listbox'?'.lb-label':'.radio-group-label').getByText(label,{exact:true});const b=await target.boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);}
        await settle();
      };
      const verify=async()=>{
        await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await clickChoice(id,type,'Shared');
        const sent=()=>page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter'&&e.payload.parameterId==='childChoice'));
        const before=await sent();assert.equal(before.at(-1)?.payload.value,'Shared');const sendCount=await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').length);await clickChoice('bank_parent',parentType,'B');
        const want=reset?'B1':'Shared';
        if(type==='Combobox'){assert.ok((await node(id).textContent()).includes(want));await node(id).click();assert.deepEqual(await page.locator('.panel-combobox-menu').getByRole('option').allTextContents(),['B1','B2','Shared']);await page.keyboard.press('Escape');}
        else{const labelClass=type==='Listbox'?'.lb-label':'.radio-group-label';assert.deepEqual(await node(id).locator(labelClass).allTextContents(),['B1','B2','Shared']);assert.deepEqual(await node(id).locator(type==='Listbox'?'.listbox-row.selected .lb-label':'.radio-group-item.selected .radio-group-label').allTextContents(),[want]);}
        const after=await sent();assert.equal(after.at(-1)?.payload.value,want,`${type}/reset=${reset}: output agrees with visible selection`);assert.equal(after.length,before.length+(reset?1:0),'automatic reset emits once; retaining a valid value emits nothing');
        const ordered=await page.evaluate(n=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').slice(n).map(e=>[e.payload.parameterId,e.payload.value]),sendCount);assert.deepEqual(ordered,reset?[['bankChoice','B'],['childChoice','B1']]:[['bankChoice','B']],'parent output precedes dependent output');
        await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();
      };await verify();await reopen(id);await verify();
    }
  });
  await check('Inbound bank changes update dependent choices without echoing values back to the device',async()=>{
    const id=await fixture('Combobox',{Behavior:{defaultValue:'A1'},Value:{dependsOn:'inbound_bank',rows:[{id:'A1',internalValue:'A1',displayText:'Alpha preset',parentValue:'0',enabled:true},{id:'B1',internalValue:'B1',displayText:'Beta preset',parentValue:'127',enabled:true}]},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'selectedChoice',deviceRole:'mainSynth',parameterId:'childChoice',dryRun:true}]}},[],[{type:'Combobox',sections:{Core:{id:'inbound_bank'},Transform:{x:50,y:300,width:260,height:48},Behavior:{defaultValue:'0'},Value:{rows:[{id:'0',internalValue:'0',displayText:'Bank A',enabled:true},{id:'127',internalValue:'127',displayText:'Bank B',enabled:true}]},DeviceBindings:{enabled:true,bindings:[{kind:'midiControl',message:'cc',port:'selectedChoice',channel:1,controller:16,deviceRole:'mainSynth',feedback:{receiveUpdates:true},dryRun:true}]}}}]);
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await page.evaluate(async()=>{const {latestMidiInputMessage}=await import('/src/CE_Application/stores/deviceProfileStores.js');latestMidiInputMessage.set({hex:'B0107F',messageType:'midi',at:Date.now()});});await settle();assert.ok((await node('inbound_bank').textContent()).includes('Bank B'));assert.ok((await node(id).textContent()).includes('Beta preset'));assert.equal(await page.evaluate(()=>window.__behaviorMidi.length),0,'inbound feedback must update both controls without outbound echo');await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
  });
  await check('Nested dependent selectors send bank before program even when canvas order puts the program first',async()=>{
    const rows=(prefix,parents)=>['A','B'].map((s,i)=>({id:prefix+s,internalValue:prefix+s,displayText:prefix+s,enabled:true,selectedByDefault:i===0,...(parents?{parentValue:parents+s}:{})}));
    const binding=parameterId=>({enabled:true,bindings:[{kind:'deviceParameter',port:'selectedChoice',deviceRole:'mainSynth',parameterId,dryRun:true}]});
    const id=await fixture('Combobox',{Behavior:{defaultValue:'ProgramA'},Value:{dependsOn:'chain_bank',rows:rows('Program','Bank')},DeviceBindings:binding('program')},[],[
      {type:'Combobox',sections:{Core:{id:'chain_bank'},Transform:{x:50,y:250,width:260,height:48},Behavior:{defaultValue:'BankA'},Value:{dependsOn:'chain_family',rows:rows('Bank','Family')},DeviceBindings:binding('bank')}},
      {type:'Combobox',sections:{Core:{id:'chain_family'},Transform:{x:50,y:400,width:260,height:48},Behavior:{defaultValue:'FamilyA'},Value:{rows:rows('Family')},DeviceBindings:binding('family')}},
    ]);
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();await node('chain_family').click();await page.locator('.panel-combobox-menu').getByRole('option',{name:'FamilyB',exact:true}).click();await settle();assert.ok((await node('chain_bank').textContent()).includes('BankB'));assert.ok((await node(id).textContent()).includes('ProgramB'));const sent=await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').map(e=>[e.payload.parameterId,e.payload.value]));assert.deepEqual(sent,[['family','FamilyB'],['bank','BankB'],['program','ProgramB']]);await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
  });
  await check('Listbox multi-select respects its authored default and pointer and keyboard toggles after reopen',async()=>{
    const rows=['Alpha','Beta','Gamma'].map((v,i)=>({id:v,internalValue:v,displayText:v,enabled:true,selectedByDefault:i===0}));
    const id=await fixture('Listbox',{Behavior:{defaultValue:'Alpha'},Value:{rows},Listbox:{multiSelect:true,selectionStyle:'check',rowHeight:40},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'selectedChoice',deviceRole:'mainSynth',parameterId:'choice',dryRun:true}]}});
    const selected=()=>node(id).locator('.listbox-row.selected .lb-label').allTextContents();
    const click=async label=>{const b=await node(id).locator('.lb-label').filter({hasText:new RegExp(`^${label}$`)}).boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await settle();};
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();assert.deepEqual(await selected(),['Alpha'],'authored default is selected on entry');await click('Beta');assert.deepEqual(await selected(),['Alpha','Beta']);assert.equal(await node(id).locator('.lb-checkbox.on').count(),2);assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),'Beta');await click('Alpha');assert.deepEqual(await selected(),['Beta']);await page.keyboard.press('Home');await page.keyboard.press('Space');await settle();assert.deepEqual(await selected(),['Alpha','Beta'],'keyboard toggles the focused row without dropping other selections');await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
    await tab('Value');const defaults=props.locator('.row-card').getByRole('switch',{name:'Default',exact:true});await defaults.nth(1).click();await settle();assert.equal(await defaults.nth(0).getAttribute('aria-checked'),'true','adding a second multi-select default retains the first');assert.equal(await defaults.nth(1).getAttribute('aria-checked'),'true');await reopen(id);await props.getByTitle('Enter Preview',{exact:true}).click();assert.deepEqual(await selected(),['Alpha','Beta'],'both defaults remain selected after saving and reopening');
  });
  await check('Listbox row height selection styles rich content and empty text change the visible rows',async()=>{
    const rows=['Alpha','Beta','Gamma'].map((v,i)=>({id:v,internalValue:v,displayText:v,enabled:i!==2,selectedByDefault:i===0,subtitle:`About ${v}`,badge:'NEW',icon:'★',swatch:'FFFF0000'}));
    const id=await fixture('Listbox',{Value:{rows},Listbox:{rowHeight:40,accentColour:'FF00FF00',showSwatch:true,showIcons:true,showBadges:true,twoLine:true}});
    const verifyContent=async()=>{assert.deepEqual(await node(id).locator('.lb-subtitle').allTextContents(),['About Alpha','About Beta','About Gamma']);assert.equal(await node(id).locator('.lb-icon-glyph').count(),3);assert.equal(await node(id).locator('.lb-badge').count(),3);assert.equal(await node(id).locator('.lb-swatch').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 0, 0)');assert.equal((await node(id).locator('.listbox-row').first().boundingBox()).height,40);assert.equal(await node(id).locator('.listbox-row.disabled').evaluate(e=>getComputedStyle(e).opacity),'0.4');};await verifyContent();await reopen(id);await verifyContent();
    for(const style of ['bar','stripe','outline','check','bold']){
      await tab('Listbox');await choose('Style',style);
      const verify=async()=>{await page.waitForTimeout(180);const row=node(id).locator('.listbox-row.selected');assert.equal(await row.count(),1);if(style==='bar')assert.equal(await row.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 255, 0)');if(style==='stripe')assert.equal(await row.evaluate(e=>getComputedStyle(e,'::before').width),'4px');if(style==='outline')assert.match(await row.evaluate(e=>getComputedStyle(e).boxShadow),/rgb\(0, 255, 0\).*1\.5px/);if(style==='check')assert.equal(await row.locator('.lb-check').textContent(),'✓');if(style==='bold')assert.equal(await row.evaluate(e=>getComputedStyle(e).fontWeight),'700');};await verify();await reopen(id);await verify();
    }
    const empty=await fixture('Listbox',{Value:{rows:[]},Listbox:{emptyText:'Choose a source first'}});assert.equal(await node(empty).locator('.listbox-empty').textContent(),'Choose a source first');await reopen(empty);assert.equal(await node(empty).locator('.listbox-empty').textContent(),'Choose a source first');
  });
  await check('Dependent multi-select Listbox visibly selects the first matching row when Reset pick is enabled',async()=>{
    const id=await fixture('Listbox',{Listbox:{multiSelect:true},Value:{dependsOn:'multi_parent',dependsResetOnChange:true,rows:[{id:'Alpha',internalValue:'Alpha',displayText:'Alpha',parentValue:'A',enabled:true,selectedByDefault:true},{id:'Beta',internalValue:'Beta',displayText:'Beta',parentValue:'B',enabled:true}]}},[],[{type:'Combobox',sections:{Core:{id:'multi_parent'},Transform:{x:50,y:300,width:260,height:48},Behavior:{defaultValue:'A'},Value:{rows:['A','B'].map((v,i)=>({id:v,internalValue:v,displayText:v,enabled:true,selectedByDefault:i===0}))}}}]);
    const selected=()=>node(id).locator('.listbox-row.selected .lb-label').allTextContents();
    const verify=async()=>{await props.getByTitle('Enter Preview',{exact:true}).click();assert.deepEqual(await selected(),['Alpha']);await node('multi_parent').click();await page.locator('.panel-combobox-menu').getByRole('option',{name:'B',exact:true}).click();await settle();assert.deepEqual(await selected(),['Beta'],'Reset pick must visibly select the matching row in multi-select too');await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
  });
  await check('Dependent choices show the correct default group in design view and keep it in Preview after reopening',async()=>{
    for(const type of ['Listbox','RadioButtonGroup']){
      const rows=['A','B'].map(s=>({id:s+'1',internalValue:s+'1',displayText:s+'1',parentValue:s,enabled:true,selectedByDefault:s==='A'}));
      const id=await fixture(type,{Behavior:{defaultValue:'A1'},Value:{rows,dependsOn:'design_parent'}},[],[{type:'Combobox',sections:{Core:{id:'design_parent'},Transform:{x:50,y:300,width:260,height:48},Behavior:{defaultValue:'B'},Value:{rows:['A','B'].map(s=>({id:s,internalValue:s,displayText:s,enabled:true,selectedByDefault:s==='B'}))}}}]);
      const verify=async()=>{
        if(type==='Combobox')assert.ok((await node(id).textContent()).includes('B1'),'design canvas shows the choice from default parent B');
        else assert.deepEqual(await node(id).locator(type==='Listbox'?'.lb-label':'.radio-group-label').allTextContents(),['B1'],'design canvas filters to the default parent group');
        await props.getByTitle('Enter Preview',{exact:true}).click();await settle();assert.ok((await node(id).textContent()).includes('B1'));await props.getByTitle('Exit Preview',{exact:true}).click();
      };await verify();await reopen(id);await verify();
    }
  });
  await check('Listbox default selection and keyboard navigation skip section headers and disabled rows',async()=>{
    const rows=[{id:'header',displayText:'SECTION',isHeader:true,enabled:true},{id:'disabled',internalValue:'disabled',displayText:'Unavailable',enabled:false},...['Alpha','Beta','Gamma'].map(v=>({id:v,internalValue:v,displayText:v,enabled:true}))];
    const id=await fixture('Listbox',{Transform:{height:96},Behavior:{defaultValue:'missing'},Value:{rows},Listbox:{rowHeight:32,keyboardNav:true,scrollIntoView:true},DeviceBindings:{enabled:true,bindings:[{kind:'deviceParameter',port:'selectedChoice',deviceRole:'mainSynth',parameterId:'choice',dryRun:true}]}});
    const selected=()=>node(id).locator('.listbox-row.selected .lb-label').allTextContents();
    const verify=async()=>{assert.deepEqual(await selected(),['Alpha'],'design default is the first enabled option, never a header');await props.getByTitle('Enter Preview',{exact:true}).click();await captureMidi();assert.deepEqual(await selected(),['Alpha']);await node(id).focus();await page.keyboard.press('End');await settle();assert.deepEqual(await selected(),['Gamma']);const b=await node(id).boundingBox();const row=await node(id).locator('.listbox-row.selected').boundingBox();assert.ok(row.y>=b.y&&row.y+row.height<=b.y+b.height,'End scrolls the selected row into view');assert.equal(await page.evaluate(()=>window.__behaviorMidi.filter(e=>e.name==='setDeviceParameter').at(-1)?.payload.value),'Gamma');await page.keyboard.press('Home');await settle();assert.deepEqual(await selected(),['Alpha']);await page.keyboard.press('ArrowDown');await settle();assert.deepEqual(await selected(),['Beta']);await page.evaluate(()=>window.__JUCE__=undefined);await props.getByTitle('Exit Preview',{exact:true}).click();};await verify();await reopen(id);await verify();
  });
} finally {
  await writeFile(join(out,'results.json'),JSON.stringify({results,errors},null,2));
  await browser.close(); await server.close();
}
if(results.some(r=>r.status==='fail')) process.exitCode=1;
