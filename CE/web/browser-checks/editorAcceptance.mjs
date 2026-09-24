import { chromium } from 'playwright-core';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import assert from 'node:assert/strict';
import { runEditorWorkflows, runOptionalFields, runCreationPresets, runValueGestures, runKeyboardGestures, runDockOpener } from './editorWorkflows.mjs';

const out = process.env.CEDITOR_ACCEPTANCE_OUT ?? '../../work/editor-acceptance';
await mkdir(out, { recursive: true });
const root = new URL('../dist-acceptance/', import.meta.url);
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const body = await readFile(new URL(`.${path}`, root));
    res.writeHead(200, { 'content-type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch(chromiumLaunchOptions({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' }));
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
const ledger = [];
page.on('pageerror', e => errors.push(String(e)));
page.setDefaultTimeout(5000);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/editorAcceptance.html`);
  await page.waitForFunction(() => !!window.__acceptance);
  await page.evaluate(() => window.__acceptance.blank());
  await page.waitForTimeout(600);
  if(process.env.CEDITOR_ACCEPTANCE_MODE==='dock-opener'){
    await runDockOpener(page);assert.deepEqual(errors,[]);
  } else if(process.env.CEDITOR_ACCEPTANCE_MODE==='tree-rename'){
    await page.getByTitle('Search every component and saved package',{exact:true}).click();
    await page.getByRole('textbox',{name:'Search components',exact:true}).fill('Label');
    await page.getByTitle('Insert Label — or drag it onto the canvas',{exact:true}).click();
    const [id]=await page.evaluate(()=>window.__acceptance.selection());
    const row=page.getByRole('tree',{name:'Components'}).locator(`[data-tree-id="${id}"]`);
    await row.focus();
    await row.press('F2');
    const input=row.locator('.rename-input');
    await input.waitFor();
    assert.equal(await input.evaluate(e=>document.activeElement===e),true,'F2 focuses the rename input');
    assert.equal(await input.evaluate(e=>e.selectionStart===0&&e.selectionEnd===e.value.length),true,'the old name is selected');
    await page.keyboard.type('RenamedLabel');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(id=>window.__acceptance.panel().controls.find(c=>c._children.Core.id===id)._children.Core.name,id),'RenamedLabel');
    assert.deepEqual(await page.evaluate(()=>window.__acceptance.selection()),[id]);
    assert.equal(await page.evaluate(()=>window.__acceptance.panel().controls.length),1);
    assert.deepEqual(errors,[]);
    console.log('PASS tree F2 focuses and selects name; typing and Enter rename without canvas shortcuts');
  } else if(process.env.CEDITOR_ACCEPTANCE_MODE==='border-unlink'){
    const insert=async type=>{
      const label=await page.evaluate(t=>window.__acceptance.catalog.flatMap(c=>c.items).find(i=>i.type===t).label,type);
      await page.getByTitle('Search every component and saved package',{exact:true}).click();
      await page.getByRole('textbox',{name:'Search components',exact:true}).fill(type);
      await page.getByTitle(`Insert ${label} — or drag it onto the canvas`,{exact:true}).click();
      return (await page.evaluate(()=>window.__acceptance.selection()))[0];
    };
    const buttonId=await insert('MomentaryButton');
    const toggleId=await insert('ToggleButton');
    const tree=page.getByRole('tree',{name:'Components'});
    await tree.locator(`[data-tree-id="${buttonId}"]`).click();
    const props=page.locator('.properties-panel');
    await props.locator('.tab-icon[title="Border"]').click();
    const radius=props.locator('.corner-cell[title="Top Left corner"] input');
    await radius.fill('20');await radius.press('Enter');
    await tree.locator(`[data-tree-id="${toggleId}"]`).click({modifiers:['Shift']});
    assert.deepEqual(new Set(await page.evaluate(()=>window.__acceptance.selection())),new Set([buttonId,toggleId]));
    await props.getByRole('button',{name:'Unlink',exact:true}).click();
    const corners=await page.evaluate(ids=>ids.map(id=>{
      const c=window.__acceptance.panel().controls.find(x=>x._children.Core.id===id);
      return c._children.Background._children.Corners;
    }),[buttonId,toggleId]);
    assert.equal(corners[0].topLeft.radius,20);
    assert.equal(corners[1].topLeft.radius,8);
    assert.equal(corners[0].linked,false);
    assert.equal(corners[1].linked,false);
    assert.deepEqual(errors,[]);
    console.log('PASS multi-selection unlink preserves each control’s linked radius');

    const labelId=await insert('Label');
    const labelBase=await page.evaluate(id=>JSON.stringify(window.__acceptance.panel().controls.find(c=>c._children.Core.id===id)._children.Background),labelId);
    await tree.locator(`[data-tree-id="${toggleId}"]`).click({modifiers:['Control']});
    assert.deepEqual(new Set(await page.evaluate(()=>window.__acceptance.selection())),new Set([labelId,toggleId]));
    await page.getByRole('button',{name:'Hover',exact:true}).click();
    await props.locator('.tab-icon[title="Background"]').click();
    await page.getByText('1 skipped',{exact:false}).waitFor();
    const colour=props.locator('.color-input input').first();
    await colour.fill('3060C0');await colour.press('Enter');
    assert.equal(await page.evaluate(id=>JSON.stringify(window.__acceptance.panel().controls.find(c=>c._children.Core.id===id)._children.Background),labelId),labelBase);
    const hoverPatch=await page.evaluate(id=>window.__acceptance.panel().controls.find(c=>c._children.Core.id===id)._children.States._children.Hover.patches.component['Background.Fill.colour'],toggleId);
    assert.equal(hoverPatch,'FF3060C0');
    assert.deepEqual(errors,[]);
    console.log('PASS mixed Hover edit skips controls without Hover and shows the skipped count');
  } else if(process.env.CEDITOR_ACCEPTANCE_MODE==='keyboard'){
    await runKeyboardGestures(page);assert.deepEqual(errors,[]);
  } else if(process.env.CEDITOR_ACCEPTANCE_MODE==='gestures'){
    await runValueGestures(page);assert.deepEqual(errors,[]);
  } else if(process.env.CEDITOR_ACCEPTANCE_MODE==='recovery'){
    const source=await page.evaluate(()=>{
      const panel=window.__acceptance.panel();
      return JSON.stringify({...panel,notepad:{activeNoteIndex:0,notes:[{name:'Storage limit fixture',content:'x'.repeat(6*1024*1024)}]}});
    });
    await page.evaluate(text=>window.__acceptance.load(text),source);
    await page.getByTitle('Search every component and saved package',{exact:true}).click();
    await page.getByRole('textbox',{name:'Search components',exact:true}).fill('Label');
    await page.getByTitle('Insert Label — or drag it onto the canvas',{exact:true}).click();
    await page.getByText('Automatic recovery could not save your latest changes. Save your open panels to files before closing CEditor.',{exact:true}).waitFor({timeout:30000});
    assert.ok(await page.evaluate(()=>window.__acceptance.panel().notepad.notes[0].content.length===6*1024*1024));
    console.log('PASS actual storage overflow reports a persistent recovery warning and keeps current work in memory');
  } else if(process.env.CEDITOR_ACCEPTANCE_MODE==='visual'){
    const source=await readFile(process.env.CEDITOR_ACCEPTANCE_PANEL,'utf8');
    await page.evaluate(text=>window.__acceptance.load(text),source);
    await page.waitForTimeout(1000);
    const viewport=page.locator('.canvas-viewport').last();
    const metrics=await viewport.evaluate(e=>({height:e.clientHeight,scrollHeight:e.scrollHeight,width:e.clientWidth,scrollWidth:e.scrollWidth}));
    const positions=[];
    for(let top=0;top<metrics.scrollHeight;top+=metrics.height-80){
      for(let left=0;left<metrics.scrollWidth;left+=metrics.width-80){
      await viewport.evaluate((e,{top,left})=>{e.scrollTop=top;e.scrollLeft=left;},{top,left});await page.waitForTimeout(160);
      await viewport.screenshot({path:join(out,`panel-${positions.length}.png`)});
      positions.push({top,left});
      }
    }
    await writeFile(join(out,'viewport-positions.json'),JSON.stringify(positions,null,2));
    assert.deepEqual(errors,[]);console.log(`PASS rendered panel across ${positions.length} viewport positions`);
  } else if(process.env.CEDITOR_ACCEPTANCE_MODE==='creation'){
    await runCreationPresets(page,out);assert.deepEqual(errors,[]);
  } else if(process.env.CEDITOR_ACCEPTANCE_MODE==='optional'){
    await runOptionalFields(page);assert.deepEqual(errors,[]);
  } else if(process.env.CEDITOR_ACCEPTANCE_MODE==='workflows'){
    await runEditorWorkflows(page,out);assert.deepEqual(errors,[]);
  } else if(process.env.CEDITOR_ACCEPTANCE_MODE==='numeric'){
    await page.getByTitle('Search every component and saved package',{exact:true}).click();
    await page.getByRole('textbox',{name:'Search components',exact:true}).fill('Knob');
    await page.getByTitle('Insert Knob — or drag it onto the canvas',{exact:true}).click();
    const props=page.locator('.properties-panel');
    await props.locator('.tab-icon[title="Transform"]').click();
    const read=()=>page.evaluate(()=>window.__acceptance.panel().controls[0]._children.Transform);
    const x=props.getByRole('textbox',{name:'X',exact:true});
    const old=(await read()).x;
    await x.fill('321');await x.press('Escape');
    console.log('Escape:',{before:old,after:(await read()).x});
    assert.equal((await read()).x,old,'Escape cancels a numeric draft');
    await props.locator('.tab-icon[title="Transform"]').click();
    await x.fill('400');await x.press('Enter');
    await x.fill('50');await x.press('ArrowUp');await x.press('Tab');
    console.log('Typed 50 + ArrowUp:',(await read()).x);
    assert.equal((await read()).x,51,'Up steps from the typed value and survives blur');
    await x.fill('1e309');await x.press('Enter');
    console.log('Nonfinite:',await read());
    assert.equal((await read()).x,51,'overflow must not corrupt a component coordinate');
    await props.getByRole('textbox',{name:'Opac value',exact:true}).fill('0.35');
    await props.getByRole('textbox',{name:'Opac value',exact:true}).press('Escape');
    console.log('Opacity Escape:',(await read()).opacity);
    assert.equal((await read()).opacity,1,'Escape cancels a scrub draft');
    const opacity=props.getByRole('textbox',{name:'Opac value',exact:true});
    await opacity.fill('0.35');await opacity.press('ArrowUp');await opacity.press('Tab');
    assert.equal((await read()).opacity,0.4);
    await opacity.fill('0.35');await opacity.press('Shift+ArrowUp');await opacity.press('Tab');
    assert.equal((await read()).opacity,0.85);
    await opacity.fill('0.123456789');await opacity.press('Enter');
    await opacity.focus();await opacity.press('Tab');
    assert.equal((await read()).opacity,0.123456789,'visiting a formatted value must not round the stored precision');
    await x.fill('23.125');await x.press('Enter');assert.equal((await read()).x,23.125);
    await x.fill('-42');await x.press('Tab');assert.equal((await read()).x,-42);
    await x.fill('nonsense');await x.press('Enter');assert.equal((await read()).x,-42);
    await page.evaluate(()=>window.__acceptance.flush());
    await x.fill('99');await x.press('Enter');
    await page.evaluate(()=>window.__acceptance.flush());
    await props.getByTitle('Undo',{exact:true}).click();assert.equal((await read()).x,-42);
    await props.getByTitle('Redo',{exact:true}).click();assert.equal((await read()).x,99);
    assert.deepEqual(errors,[]);
    console.log('PASS numeric cancel/commit, typed stepping, Shift stepping, finite values, precision and undo/redo');
    process.exitCode=0;
  } else {
  const catalogItems = await page.evaluate(()=>window.__acceptance.catalog.flatMap(c=>c.items));
  const only = process.env.CEDITOR_ACCEPTANCE_TYPES?.split(',');
  const items = only ? catalogItems.filter(item=>only.includes(item.type)) : catalogItems;
  const props=page.locator('.properties-panel');
  for (const [index,item] of items.entries()) {
    const record={type:item.type,tabs:[],errors:[]}; ledger.push(record);
    try {
      await page.keyboard.press('Escape');
      await page.getByTitle('Search every component and saved package',{exact:true}).click();
      await page.getByRole('textbox',{name:'Search components',exact:true}).fill(item.type);
      await page.getByTitle(`Insert ${item.label} — or drag it onto the canvas`,{exact:true}).click();
      await page.waitForFunction(t=>window.__acceptance.panel().controls.some(c=>c._children.Core.controlType===t),item.type);
      const selected=await page.evaluate(()=>window.__acceptance.selection());
      assert.equal(selected.length,1);
      const id=selected[0];record.id=id;
      await page.getByTitle('Component name',{exact:true}).fill(`Acceptance_${item.type}`);
      await page.getByTitle('Component name',{exact:true}).press('Enter');
      await props.locator('.tab-icon[title="Transform"]').click();
      await props.getByRole('textbox',{name:'X',exact:true}).fill(String((index%5)*270+20));
      await props.getByRole('textbox',{name:'X',exact:true}).press('Enter');
      await props.getByRole('textbox',{name:'Y',exact:true}).fill(String(Math.floor(index/5)*250+20));
      await props.getByRole('textbox',{name:'Y',exact:true}).press('Enter');
      const saved=await page.evaluate(id=>window.__acceptance.panel().controls.find(c=>c._children.Core.id===id),id);
      assert.equal(saved._children.Core.name,`Acceptance_${item.type}`);
      assert.equal(saved._children.Transform.x,(index%5)*270+20);
      assert.equal(saved._children.Transform.y,Math.floor(index/5)*250+20);
      record.insertRenameMove='passed';
      const tabs=await props.locator('.tab-icon').evaluateAll(es=>es.map(e=>e.title));
      for(const title of tabs){
        await props.locator(`.tab-icon[title="${title}"]`).click();
        await page.waitForTimeout(90);
        const collapsed=props.locator('.header-toggle[aria-expanded="false"]');
        for(let n=0;n<40&&await collapsed.count();n++) await collapsed.first().click();
        const content=await props.innerText();
        const tabRecord={title,content,fields:await props.locator('input,select,textarea').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label')||e.closest('.property-cell')?.querySelector('.property-label')?.textContent?.trim()||e.title||'',type:e.type,value:e.value,disabled:e.disabled}))),edits:[]};
        record.tabs.push(tabRecord);
        assert.ok(!/failed to load|something went wrong/i.test(content),`${item.type}/${title}`);
        if(process.env.CEDITOR_ACCEPTANCE_MODE==='properties'){
          const fields=props.locator('.content-scroll input,.content-scroll select,.content-scroll textarea');
          const count=await fields.count();
          for(let fieldIndex=0;fieldIndex<count;fieldIndex++){
            assert.deepEqual(await page.evaluate(()=>window.__acceptance.selection()),[id],'property edits and undo retain their selected component');
            const field=fields.nth(fieldIndex);
            if(!await field.count()||!await field.isVisible()||!await field.isEnabled())continue;
            const descriptor=await field.evaluate(e=>({tag:e.tagName,type:e.type,readOnly:e.readOnly,value:e.value,label:e.getAttribute('aria-label')||e.closest('.property-cell')?.querySelector('.property-label')?.textContent?.trim()||e.title||'',options:e.tagName==='SELECT'?[...e.options].filter(o=>!o.disabled).map(o=>o.value):[]}));
            if(descriptor.readOnly||['file','hidden','range','checkbox','radio','color'].includes(descriptor.type))continue;
            await page.evaluate(()=>window.__acceptance.flush());
            const before=await page.evaluate(id=>JSON.stringify(window.__acceptance.panel().controls.find(c=>c._children.Core.id===id)),id);
            const edit={fieldIndex,...descriptor};delete edit.options;tabRecord.edits.push(edit);
            try{
              if(descriptor.tag==='SELECT'){
                const next=descriptor.options.find(v=>v!==descriptor.value);if(next===undefined){edit.result='one choice';continue;}
                edit.attempt=next;await field.selectOption(next);
              }else{
                const old=descriptor.value.trim();
                const n=Number(old);const numeric=descriptor.type==='number'||(old!==''&&Number.isFinite(n));
                const next=/^#?[0-9a-f]{6,8}$/i.test(old)&&/[a-f#]/i.test(old)?'#FF2E8B57':numeric?String(n===0?1:n>0?n-1:n+1):'QA alpha <&> 123';
                edit.attempt=next;await field.fill(next);await field.press('Tab');
              }
              await page.waitForTimeout(25);
              const after=await page.evaluate(id=>JSON.stringify(window.__acceptance.panel().controls.find(c=>c._children.Core.id===id)),id);
              if(after===before){edit.result='unchanged; inspect constraint or non-document field';continue;}
              await page.evaluate(()=>window.__acceptance.flush());
              await props.getByTitle('Undo',{exact:true}).click();
              const restored=await page.evaluate(id=>JSON.stringify(window.__acceptance.panel().controls.find(c=>c._children.Core.id===id)),id);
              if(restored!==before){
                await writeFile(join(out,`${item.type}-${title.replaceAll(' ','_')}-${fieldIndex}-before.json`),before);
                await writeFile(join(out,`${item.type}-${title.replaceAll(' ','_')}-${fieldIndex}-restored.json`),restored);
              }
              assert.equal(restored,before,`${item.type}/${title}/${descriptor.label}: undo restores the full control`);
              edit.result='changed and undo restored';
            }catch(e){edit.result='failed';edit.error=String(e);throw e;}
          }
          console.log(`EDIT ${item.type}/${title}: ${tabRecord.edits.length} fields`);
        }
        if(process.env.CEDITOR_ACCEPTANCE_MODE==='booleans'){
          const switches=props.locator('.content-scroll .property-toggle,.content-scroll .flagstrip .flag,.content-scroll .toggle-val,.content-scroll input[type="checkbox"]');
          const count=await switches.count();
          for(let switchIndex=0;switchIndex<count;switchIndex++){
            const flag=switches.nth(switchIndex);if(!await flag.count()||!await flag.isVisible()||!await flag.isEnabled())continue;
            await page.evaluate(()=>window.__acceptance.flush());
            const before=await page.evaluate(id=>JSON.stringify(window.__acceptance.panel().controls.find(c=>c._children.Core.id===id)),id);
            const name=await flag.evaluate(e=>e.getAttribute('aria-label')||e.title||e.closest('.property-cell')?.querySelector('.property-label')?.textContent||e.textContent);
            await flag.click();await page.waitForTimeout(25);
            const after=await page.evaluate(id=>JSON.stringify(window.__acceptance.panel().controls.find(c=>c._children.Core.id===id)),id);
            const edit={switchIndex,label:name,result:'unchanged'};tabRecord.edits.push(edit);
            if(after!==before){
              await page.evaluate(()=>window.__acceptance.flush());await props.getByTitle('Undo',{exact:true}).click();
              assert.equal(await page.evaluate(id=>JSON.stringify(window.__acceptance.panel().controls.find(c=>c._children.Core.id===id)),id),before,`${item.type}/${title}/${name}: undo restores boolean edit`);
              assert.deepEqual(await page.evaluate(()=>window.__acceptance.selection()),[id]);
              edit.result='changed and undo restored';
            }
          }
          console.log(`FLAGS ${item.type}/${title}: ${tabRecord.edits.length} toggles`);
        }
        const sharedTabs=['Core','Transform','Background','Text','Effects','Mouse','Behavior','Parts','Bindings','Device Bindings','States','Animations','Scripts'];
        if(process.env.CEDITOR_ACCEPTANCE_MODE==='choices'&&(['Label','Knob'].includes(item.type)||!sharedTabs.includes(title))){
          const fields=props.locator('.content-scroll select:not(.preset-select)');
          const count=await fields.count();
          for(let fieldIndex=0;fieldIndex<count;fieldIndex++){
            const field=fields.nth(fieldIndex);if(!await field.isVisible()||!await field.isEnabled())continue;
            const descriptor=await field.evaluate(e=>({value:e.value,label:e.getAttribute('aria-label')||e.closest('.property-cell')?.querySelector('.property-label')?.textContent||'',options:[...e.options].filter(o=>!o.disabled).map(o=>o.value)}));
            for(const next of descriptor.options.filter(v=>v!==descriptor.value)){
              await page.evaluate(()=>window.__acceptance.flush());
              const before=await page.evaluate(id=>JSON.stringify(window.__acceptance.panel().controls.find(c=>c._children.Core.id===id)),id);
              await field.selectOption(next);await page.waitForTimeout(35);
              const after=await page.evaluate(id=>JSON.stringify(window.__acceptance.panel().controls.find(c=>c._children.Core.id===id)),id);
              const edit={fieldIndex,label:descriptor.label,attempt:next,result:after===before?'non-document choice':'changed and undo restored'};tabRecord.edits.push(edit);
              if(after!==before){
                await page.evaluate(()=>window.__acceptance.flush());await props.getByTitle('Undo',{exact:true}).click();
                assert.equal(await page.evaluate(id=>JSON.stringify(window.__acceptance.panel().controls.find(c=>c._children.Core.id===id)),id),before,`${item.type}/${title}/${descriptor.label}/${next}: undo restores option change`);
              }else await field.selectOption(descriptor.value);
            }
          }
          console.log(`CHOICES ${item.type}/${title}: ${tabRecord.edits.length} options`);
        }
      }
      console.log(`PASS ${item.type}: insert, rename, position and ${tabs.length} property tabs`);
    } catch(e){record.errors.push(String(e));console.log(`FAIL ${item.type}: ${e.message}`);await page.screenshot({path:join(out,`failure-${item.type}.png`)});}
    await writeFile(join(out,'component-ui-ledger.json'),JSON.stringify(ledger,null,2));
  }
  await writeFile(join(out,'Editor-acceptance-all-components.cepanel'),await page.evaluate(()=>window.__acceptance.snapshot()));
  await page.screenshot({ path: join(out,'editor-start.png') });
  assert.deepEqual(errors, []);
  assert.deepEqual(ledger.filter(r=>r.errors.length).map(r=>({type:r.type,errors:r.errors})),[]);
  }
} finally {
  await page.screenshot({ path: join(out,'editor-last.png') });
  await writeFile(join(out, 'page-errors.json'), JSON.stringify(errors,null,2));
  await browser.close(); await new Promise(r=>server.close(r));
}
