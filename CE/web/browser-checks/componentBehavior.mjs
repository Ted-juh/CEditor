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
} finally {
  await writeFile(join(out,'results.json'),JSON.stringify({results,errors},null,2));
  await browser.close(); await server.close();
}
if(results.some(r=>r.status==='fail')) process.exitCode=1;
