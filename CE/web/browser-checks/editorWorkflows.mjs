import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function runDockOpener(page) {
  const props = page.locator('.properties-panel');
  await page.getByTitle('Search every component and saved package', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Search components', exact: true }).fill('StepSequencer');
  const label = await page.evaluate(() => window.__acceptance.catalog.flatMap(c => c.items).find(i => i.type === 'StepSequencer').label);
  await page.getByTitle(`Insert ${label} — or drag it onto the canvas`, { exact: true }).click();
  await props.locator('.tab-icon[title="Sequencer"]').click();
  const dock = page.locator('.display-panel-area');
  assert.equal(await dock.isVisible(), false, 'fresh dock is closed');
  await props.locator('.open-in-dock[data-open^="designer:"]').click();
  await page.waitForTimeout(250);
  assert.equal(await dock.isVisible(), true, 'properties opener must reveal the closed dock');
  assert.ok((await dock.boundingBox()).height > 100, 'dock has usable height');
  assert.ok((await page.locator('.tab-pane').innerText()).includes('Step Sequencer'));
  console.log('PASS actual properties opener reveals the closed display dock and arms the sequencer');
}

export async function runKeyboardGestures(page) {
  const props = page.locator('.properties-panel');
  await page.getByTitle('Search every component and saved package', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Search components', exact: true }).fill('Keyboard');
  const label = await page.evaluate(() => window.__acceptance.catalog.flatMap(c => c.items).find(i => i.type === 'Keyboard').label);
  await page.getByTitle(`Insert ${label} — or drag it onto the canvas`, { exact: true }).click();
  const [id] = await page.evaluate(() => window.__acceptance.selection());
  const node = page.locator(`.canvas-control[data-control-id="${id}"]`);
  const authored = await page.evaluate(() => JSON.stringify(window.__acceptance.panel().controls));
  const output = () => page.evaluate(() => window.__acceptance.noteOutput());
  const held = () => page.evaluate(id => window.__acceptance.previewSession(id)?.keyboardHeld ?? [], id);
  const point = async (index, black = false) => {
    const key = node.locator(`svg.keyboard rect[rx="${black ? '1.5' : '2'}"]`).nth(index);
    const b = await key.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height * 0.85 };
  };
  const down = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(70); };
  const up = async () => { await page.mouse.up(); await page.waitForTimeout(70); };
  await props.getByTitle('Enter Preview', { exact: true }).click();
  await down(await point(0));
  assert.deepEqual(await held(), [48]);
  assert.equal((await output()).events[0].kind, 'on');
  assert.equal((await output()).events[0].note, 48);
  const p = await point(1); await page.mouse.move(p.x, p.y, { steps: 4 }); await page.waitForTimeout(70);
  assert.deepEqual(await held(), [50]);
  assert.equal((await output()).events[0].note, 50);
  await up(); assert.deepEqual(await held(), []); assert.equal((await output()).events[0].kind, 'off');
  await down(await point(0, true)); assert.deepEqual(await held(), [49]); await up();
  await down(await point(0));
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
  await up(); assert.deepEqual(await held(), []); assert.equal((await output()).events[0].kind, 'off');
  await props.getByTitle('Exit Preview', { exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.stringify(window.__acceptance.panel().controls)), authored);

  // Configure the exposed options through the real property UI.
  await props.locator('.tab-icon[title="Keyboard"]').click();
  const collapsed = props.locator('.header-toggle[aria-expanded="false"]');
  while (await collapsed.count()) await collapsed.first().click();
  await props.locator('.property-cell').filter({ has: page.getByText('Latch', { exact: true }) }).getByRole('switch').click();
  await props.getByRole('textbox', { name: 'Channel', exact: true }).fill('4');
  await props.getByRole('textbox', { name: 'Channel', exact: true }).press('Enter');
  await props.getByRole('textbox', { name: 'Transpose', exact: true }).fill('2');
  await props.getByRole('textbox', { name: 'Transpose', exact: true }).press('Enter');
  await props.getByTitle('Enter Preview', { exact: true }).click();
  await down(await point(0)); await up(); assert.deepEqual(await held(), [48]);
  assert.equal((await output()).events[0].note, 50); assert.equal((await output()).events[0].channel, 4);
  await down(await point(2)); await up(); assert.deepEqual(await held(), [48, 52]);
  await down(await point(0)); await up(); assert.deepEqual(await held(), [52]);
  await props.getByTitle('Exit Preview', { exact: true }).click();
  assert.equal((await output()).events[0].kind, 'off');
  assert.equal((await output()).events[0].note, 54);
  await props.locator('.property-cell').filter({ has: page.getByText('Latch', { exact: true }) }).getByRole('switch').click();
  await props.getByRole('textbox', { name: 'Transpose', exact: true }).fill('0');
  await props.getByRole('textbox', { name: 'Transpose', exact: true }).press('Enter');
  await props.getByRole('combobox', { name: 'Keyboard key', exact: true }).selectOption('2');
  await props.getByRole('combobox', { name: 'Keyboard scale', exact: true }).selectOption('pentatonicMin');
  await props.locator('.property-cell').filter({ has: page.getByText('Out of key', { exact: true }) }).locator('select').selectOption('refuse');
  await props.getByTitle('Enter Preview', { exact: true }).click();
  const seq = (await output()).seq;
  await down(await point(2)); await up(); // E is outside D minor pentatonic.
  assert.equal((await output()).seq, seq); assert.deepEqual(await held(), []);
  await down(await point(0)); assert.deepEqual(await held(), [48]); await up();
  await props.getByTitle('Exit Preview', { exact: true }).click();
  await props.locator('.property-cell').filter({ has: page.getByText('Panel key', { exact: true }) }).getByRole('switch').click();
  await props.getByRole('combobox', { name: 'Panel root', exact: true }).selectOption('0');
  await props.getByRole('combobox', { name: 'Panel scale', exact: true }).selectOption('major');
  const keyboard = await page.evaluate(() => window.__acceptance.panel().controls[0]._children.Keyboard);
  assert.equal(keyboard.key, 0); assert.equal(keyboard.scale, 'major');
  await props.locator('.property-cell').filter({ has: page.getByText('Out of key', { exact: true }) }).locator('select').selectOption('quantize');
  await props.getByTitle('Enter Preview', { exact: true }).click();
  await down(await point(0, true)); assert.equal((await output()).events[0].note, 48); await up();
  await props.getByTitle('Exit Preview', { exact: true }).click();
  console.log('PASS Keyboard white/black keys, glissando, real note on/off, pointer cancellation, latch chords, transpose/channel and exit cleanup');
  console.log('PASS Keyboard local key/scale, pentatonic refusal, panel-key broadcast and quantized pitch');
}

export async function runValueGestures(page){
  const props=page.locator('.properties-panel');
  for(const type of ['Knob','Slider','Number','Range','Crossfader','Ribbon','PitchWheel','CyclicButton','Combobox','ToggleButton']){
    await page.evaluate(()=>window.__acceptance.blank());
    const label=await page.evaluate(t=>window.__acceptance.catalog.flatMap(c=>c.items).find(i=>i.type===t).label,type);
    await page.getByTitle('Search every component and saved package',{exact:true}).click();
    await page.getByRole('textbox',{name:'Search components',exact:true}).fill(type);
    await page.getByTitle(`Insert ${label} — or drag it onto the canvas`,{exact:true}).click();
    const [id]=await page.evaluate(()=>window.__acceptance.selection());
    const node=page.locator(`.canvas-control[data-control-id="${id}"]`);
    const before=await page.evaluate(()=>JSON.stringify(window.__acceptance.panel().controls));
    await props.getByTitle('Enter Preview',{exact:true}).click();
    if(['Crossfader','Ribbon','PitchWheel'].includes(type)){
      const box=await node.boundingBox();
      const x=box.x+box.width*(type==='Crossfader'?0.8:0.5);
      const y=box.y+box.height*(type==='Crossfader'?0.5:0.2);
      await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(50);
      const live=await page.evaluate(id=>window.__acceptance.previewSession(id),id);
      assert.ok((type==='Crossfader'?live.xfadeMix:live.ribbonValue)>0.7,`${type} pointer moves the actual runtime value`);
      await page.mouse.up();await page.waitForTimeout(type==='PitchWheel'?900:60);
      if(type==='PitchWheel'){
        const result=await page.evaluate(()=>window.__acceptance.panel().controls[0]._children.Ribbon.value);
        assert.ok(Math.abs(result-0.5)<0.01,'pitch wheel springs back to centre');
      }
    }else if(type==='Range'){
      const low=node.getByRole('textbox',{name:'Low value',exact:true});
      const high=node.getByRole('textbox',{name:'High value',exact:true});
      await high.fill('80');await high.press('Enter');
      await low.fill('20');await low.press('Enter');
      assert.equal(Number(await low.inputValue()),20);assert.equal(Number(await high.inputValue()),80);
      await low.press('ArrowUp');assert.equal(Number(await low.inputValue()),21);
      await low.fill('90');await low.press('Enter');
      assert.ok(Number(await low.inputValue())<=Number(await high.inputValue()),'range endpoints cannot cross');
    }else if(type==='ToggleButton'){
      const initial=await node.getAttribute('aria-checked');await node.press('Space');
      assert.notEqual(await node.getAttribute('aria-checked'),initial);await node.press('Space');
      assert.equal(await node.getAttribute('aria-checked'),initial);
    }else if(type==='Combobox'){
      await node.click();assert.equal(await node.getAttribute('aria-expanded'),'true');
      await page.locator('.panel-combobox-menu').getByRole('option',{name:'Option 2',exact:true}).click();
      assert.equal(await node.getAttribute('aria-expanded'),'false');assert.ok((await node.innerText()).includes('Option 2'));
    }else if(type==='CyclicButton'){
      const initial=await node.innerText();await node.click();assert.notEqual(await node.innerText(),initial);
    }else{
      const min=Number(await node.getAttribute('aria-valuemin'));const max=Number(await node.getAttribute('aria-valuemax'));
      assert.ok(max>min,`${type} exposes its range`);
      await node.focus();await node.press('End');assert.equal(Number(await node.getAttribute('aria-valuenow')),max,`${type} End`);
      await node.press('Home');assert.equal(Number(await node.getAttribute('aria-valuenow')),min,`${type} Home`);
      await node.press('ArrowUp');assert.ok(Number(await node.getAttribute('aria-valuenow'))>min,`${type} increment`);
    }
    await props.getByTitle('Exit Preview',{exact:true}).click();
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__acceptance.panel().controls)),before,`${type} preview leaves authored controls intact`);
    console.log(`PASS ${type} actual preview gestures and author-state restoration`);
  }
}

export async function runCreationPresets(page,out){
  const panel=()=>page.evaluate(()=>window.__acceptance.panel());
  const flush=()=>page.evaluate(()=>window.__acceptance.flush());
  const props=page.locator('.properties-panel');
  await page.keyboard.press('Control+n');
  const dialog=page.getByRole('dialog',{name:'New Panel',exact:true});
  const templates=await dialog.locator('.template-card strong').allTextContents();
  const sizes=await dialog.locator('.size-chip').allTextContents();
  const count=await page.evaluate(()=>window.__acceptance.panels().length);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__acceptance.panels().length),count);
  const ledger=[];
  for(const template of templates){
    for(let size=0;size<sizes.length;size++){
      await page.keyboard.press('Control+n');
      await dialog.locator('.template-card').filter({has:page.getByText(template,{exact:true})}).click();
      await dialog.locator('.size-chip').nth(size).click();
      await dialog.getByPlaceholder('Untitled Panel').fill(`QA ${template} ${size}`);
      const width=Number(await dialog.getByRole('textbox',{name:'W',exact:true}).inputValue());
      const height=Number(await dialog.getByRole('textbox',{name:'H',exact:true}).inputValue());
      await dialog.getByRole('button',{name:'Create Panel',exact:true}).click();
      const result=await panel();assert.equal(result.width,width);assert.equal(result.height,height);
      const overflows=result.controls.filter(c=>{const t=c._children.Transform;return t.x<0||t.y<0||t.x+t.width>width+1e-6||t.y+t.height>height+1e-6;}).map(c=>c._children.Core.name);
      ledger.push({template,size:sizes[size].trim(),controls:result.controls.length,overflows});
    }
  }
  await writeFile(join(out,'new-panel-ledger.json'),JSON.stringify(ledger,null,2));
  console.log('Template bounds:',JSON.stringify(ledger.filter(x=>x.overflows.length)));
  assert.equal(ledger.filter(x=>x.overflows.length).length,0,'template controls fit the size chosen in New Panel');
  console.log(`PASS New Panel cancel and all ${ledger.length} template/size combinations`);
  await page.keyboard.press('Escape');
  await page.getByTitle('Search every component and saved package',{exact:true}).click();
  await page.getByRole('textbox',{name:'Search components',exact:true}).fill('Label');
  await page.getByTitle('Insert Label — or drag it onto the canvas',{exact:true}).click();
  const [id]=await page.evaluate(()=>window.__acceptance.selection());
  const text=async()=>(await panel()).controls.find(c=>c._children.Core.id===id)._children.Text;
  await props.locator('.tab-icon[title="Text"]').click();
  const collapsed=props.locator('.header-toggle[aria-expanded="false"]');
  for(let n=0;n<40&&await collapsed.count();n++)await collapsed.first().click();
  const font=props.getByRole('textbox',{name:'Size',exact:true});
  await font.fill('23');await font.press('Enter');await flush();
  const saved=await text();
  await props.getByPlaceholder('Preset name...').fill('QA text preset');
  await props.getByPlaceholder('Preset description or tips...').fill('Font and all text settings survive save, apply and reload.');
  await props.locator('.preset-action-btn').getByText('Save new',{exact:true}).click();
  const presetId=await props.locator('.preset-select').inputValue();assert.ok(presetId);
  await font.fill('41');await font.press('Enter');await flush();
  const edited=await text();
  await props.locator('.preset-action-btn').getByText('Apply',{exact:true}).click();await flush();
  assert.deepEqual(await text(),saved);
  await props.getByTitle('Undo',{exact:true}).click();assert.deepEqual(await text(),edited);
  await props.getByTitle('Redo',{exact:true}).click();assert.deepEqual(await text(),saved);
  console.log('Recovery load:',await page.evaluate(()=>({openPanels:window.__acceptance.panels().length,expandedBytes:JSON.stringify(window.__acceptance.panels()).length,storedBytes:localStorage.getItem('ce.unsavedPanels')?.length??0})));
  await page.reload();await page.waitForFunction(()=>!!window.__acceptance?.panel());
  await page.locator(`.canvas-control[data-control-id="${id}"]`).click({force:true});
  await props.locator('.tab-icon[title="Text"]').click();
  for(let n=0;n<40&&await collapsed.count();n++)await collapsed.first().click();
  await props.locator('.preset-select').selectOption(presetId);
  assert.equal(await props.getByPlaceholder('Preset name...').inputValue(),'QA text preset');
  await font.fill('32');await font.press('Enter');await flush();
  await props.locator('.preset-action-btn').getByText('Update',{exact:true}).click();
  await font.fill('45');await font.press('Enter');await flush();
  await props.locator('.preset-action-btn').getByText('Apply',{exact:true}).click();
  assert.equal((await text())._children.Font.size,32);
  await props.locator('.preset-action-btn').getByText('Delete',{exact:true}).click();
  assert.equal(await props.locator(`.preset-select option[value="${presetId}"]`).count(),0);
  console.log('PASS text preset save, apply, undo/redo, reload, update and delete');
}

export async function runOptionalFields(page){
  const props=page.locator('.properties-panel');
  const flush=()=>page.evaluate(()=>window.__acceptance.flush());
  const read=()=>page.evaluate(()=>window.__acceptance.panel().controls.find(c=>c._children.Core.id===window.__acceptance.selection()[0])._children);
  async function insert(type){
    await page.keyboard.press('Escape');
    const label=await page.evaluate(t=>window.__acceptance.catalog.flatMap(c=>c.items).find(i=>i.type===t).label,type);
    await page.getByTitle('Search every component and saved package',{exact:true}).click();
    await page.getByRole('textbox',{name:'Search components',exact:true}).fill(type);
    await page.getByTitle(`Insert ${label} — or drag it onto the canvas`,{exact:true}).click();
    await props.locator(`.tab-icon[title="${type}"]`).click();
    const collapsed=props.locator('.header-toggle[aria-expanded="false"]');
    for(let n=0;n<40&&await collapsed.count();n++)await collapsed.first().click();
    await flush();
  }
  await insert('Setlist');
  for(const [label,key,next] of [['Program change','program',0],['Bank MSB','bankMsb',0],['Bank LSB','bankLsb',127],['Scene tempo','bpm',120]]){
    const field=props.getByRole('textbox',{name:label,exact:true}).first();
    const before=JSON.stringify(await read());
    assert.equal(await field.inputValue(),'');
    await field.focus();await field.press('Tab');await props.locator('.tab-icon[title="Setlist"]').click();
    assert.equal(JSON.stringify(await read()),before,`${label}: merely visiting a blank field does not edit the scene`);
    await field.fill(String(next));await field.press('Tab');await flush();
    assert.equal((await read()).Setlist.scenes[0][key],next,`${label}: explicit zero is preserved`);
    await props.getByTitle('Undo',{exact:true}).click();
    assert.equal(JSON.stringify(await read()),before,`${label}: one undo restores the edit without a phantom zero in the next field`);
    await props.getByTitle('Redo',{exact:true}).click();
    await field.fill('');await field.press('Enter');await flush();
    assert.equal((await read()).Setlist.scenes[0][key],null,`${label}: clearing means do not send`);
  }
  const back=props.getByRole('textbox',{name:'Back',exact:true});
  await back.fill('66');await back.press('Enter');await flush();
  assert.equal((await read()).Setlist.footBackCc,66);
  await back.fill('');await back.press('Enter');assert.equal((await read()).Setlist.footBackCc,null);
  console.log('PASS Setlist optional program, banks, tempo and back-CC: blanks, explicit zero, clear, undo and redo');
  await insert('Recorder');
  const sync=props.locator('.property-cell').filter({has:page.getByText('Sync to transport',{exact:true})}).locator('.property-toggle');
  const original=(await read()).Recorder.syncToTransport===true;
  await sync.click();await flush();
  assert.equal((await read()).Recorder.syncToTransport,!original);
  assert.equal(await props.getByRole('textbox',{name:'Bars',exact:true}).isVisible(),!original);
  assert.equal(await props.getByRole('textbox',{name:'Len',exact:true}).isVisible(),original);
  await props.getByTitle('Undo',{exact:true}).click();
  assert.equal((await read()).Recorder.syncToTransport===true,original);
  console.log('PASS Recorder sync toggle, conditional bars/seconds fields and undo');
}

export async function runEditorWorkflows(page,out){
  const props=page.locator('.properties-panel');
  const panel=()=>page.evaluate(()=>window.__acceptance.panel());
  const selection=()=>page.evaluate(()=>window.__acceptance.selection());
  const flush=()=>page.evaluate(()=>window.__acceptance.flush());
  const node=id=>page.locator(`.canvas-control[data-control-id="${id}"]`);
  const control=async id=>(await panel()).controls.find(c=>c._children.Core.id===id);
  async function insert(type,x,y){
    await page.keyboard.press('Escape');
    const label=await page.evaluate(t=>window.__acceptance.catalog.flatMap(c=>c.items).find(i=>i.type===t).label,type);
    await page.getByTitle('Search every component and saved package',{exact:true}).click();
    await page.getByRole('textbox',{name:'Search components',exact:true}).fill(type);
    await page.getByTitle(`Insert ${label} — or drag it onto the canvas`,{exact:true}).click();
    const [id]=await selection();
    await props.locator('.tab-icon[title="Transform"]').click();
    for(const [name,value] of [['X',x],['Y',y]]){
      await props.getByRole('textbox',{name,exact:true}).fill(String(value));
      await props.getByRole('textbox',{name,exact:true}).press('Enter');
    }
    await flush();return id;
  }
  const label=await insert('Label',70,60);
  const knob=await insert('Knob',90,150);
  const slider=await insert('Slider',270,150);
  const toggle=await insert('ToggleButton',90,300);
  await node(knob).click();assert.deepEqual(await selection(),[knob]);
  const beforeMove=(await control(knob))._children.Transform;
  const box=await node(knob).boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+30,{steps:8});await page.mouse.up();
  const moved=(await control(knob))._children.Transform;
  assert.equal(moved.x-beforeMove.x,40);assert.equal(moved.y-beforeMove.y,30);
  await props.getByTitle('Undo',{exact:true}).click();assert.deepEqual((await control(knob))._children.Transform,beforeMove);
  await node(knob).click();await page.keyboard.press('ArrowRight');await flush();
  assert.equal((await control(knob))._children.Transform.x,beforeMove.x+1);
  await page.keyboard.press('Control+z');assert.equal((await control(knob))._children.Transform.x,beforeMove.x);
  console.log('PASS canvas drag, exact keyboard nudge and undo');

  await node(slider).click({modifiers:['Control']});assert.equal((await selection()).length,2);
  const count=(await panel()).controls.length;
  await page.keyboard.press('Control+d');await flush();assert.equal((await panel()).controls.length,count+2);
  assert.equal(new Set((await panel()).controls.map(c=>c._children.Core.id)).size,count+2);
  assert.equal(new Set((await panel()).controls.map(c=>c._children.Core.name)).size,count+2);
  await page.keyboard.press('Control+z');assert.equal((await panel()).controls.length,count);
  assert.equal((await selection()).length,2);
  await page.keyboard.press('Control+g');await flush();
  assert.equal((await panel()).controls.length,count-1);
  const grouped=(await panel()).controls.find(c=>c._children.Children&&Object.keys(c._children.Children._children??{}).length===2);
  assert.ok(grouped,'group contains both selected controls');
  await page.keyboard.press('Control+Shift+g');await flush();assert.equal((await panel()).controls.length,count);
  assert.deepEqual((await control(knob))._children.Transform,beforeMove);
  console.log('PASS multi-select, unique duplicate identities, group/ungroup and undo');

  await page.keyboard.press('Escape');await node(knob).click();await page.keyboard.press('Control+l');await flush();
  assert.equal((await control(knob))._children.Core.locked,true);
  await page.keyboard.press('ArrowRight');assert.equal((await control(knob))._children.Transform.x,beforeMove.x);
  await page.keyboard.press('Control+l');assert.equal((await control(knob))._children.Core.locked,false);
  await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');await flush();
  assert.equal((await panel()).controls.length,count+1);
  await page.keyboard.press('Delete');await flush();assert.equal((await panel()).controls.length,count);
  await page.keyboard.press('Control+z');assert.equal((await panel()).controls.length,count+1);
  await page.keyboard.press('Control+y');assert.equal((await panel()).controls.length,count);
  console.log('PASS lock protection, copy/paste, delete, undo and redo');

  await node(knob).click();await flush();
  const authoring=await page.evaluate(()=>JSON.stringify(window.__acceptance.panel().controls));
  await props.getByTitle('Enter Preview',{exact:true}).click();
  await node(toggle).click();assert.equal(await node(toggle).getAttribute('aria-checked'),'true');
  await node(toggle).click();assert.equal(await node(toggle).getAttribute('aria-checked'),'false');
  const value=Number(await node(knob).getAttribute('aria-valuenow'));
  await node(knob).focus();await page.keyboard.press('ArrowUp');
  assert.ok(Number(await node(knob).getAttribute('aria-valuenow'))>value,'preview keyboard changes knob value');
  await props.getByTitle('Exit Preview',{exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__acceptance.panel().controls)),authoring,'preview leaves authored controls unchanged');
  console.log('PASS real preview toggle/knob gestures and author-state restoration');

  await page.getByTitle('Display dock — colours, gradients, align, device, console',{exact:true}).click();
  const dockTabs=await page.locator('.studio-tab').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));
  const dockLedger=[];
  for(const title of dockTabs){
    await page.locator('.studio-tab').getByText(title,{exact:true}).click();
    await page.waitForTimeout(160);
    const text=await page.locator('.tab-pane').innerText();
    assert.ok(!/failed to load|something went wrong/i.test(text),title);
    dockLedger.push({title,text});
  }
  await writeFile(join(out,'dock-workflow-ledger.json'),JSON.stringify(dockLedger,null,2));
  await writeFile(join(out,'Editor-workflow-laboratory.cepanel'),await page.evaluate(()=>window.__acceptance.snapshot()));
  console.log(`PASS ${dockTabs.length} full-editor dock tabs`);
  const recoveredControls=JSON.stringify((await panel()).controls);
  await page.reload();await page.waitForFunction(()=>!!window.__acceptance?.panel());
  assert.equal(JSON.stringify((await panel()).controls),recoveredControls,'refresh restores unsaved authoring work');
  console.log('PASS unsaved session recovery through a full editor reload');
  await page.keyboard.press('Control+n');
  const dialog=page.getByRole('dialog',{name:'New Panel',exact:true});
  await dialog.getByPlaceholder('Untitled Panel').fill('Acceptance second document');
  await dialog.getByRole('button',{name:'Create Panel',exact:true}).click();
  assert.equal((await panel()).name,'Acceptance second document');
  assert.equal((await panel()).controls.length,0);
  const second=await insert('Label',35,45);
  await page.keyboard.press('Control+z');
  assert.equal((await panel()).controls.length,0);
  await page.keyboard.press('Control+y');
  assert.equal((await panel()).controls[0]._children.Core.id,second);
  console.log('PASS New Panel dialog and independent document undo/redo');
}
