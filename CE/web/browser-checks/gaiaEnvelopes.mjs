import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { readFile,mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const server=await createServer({configFile:fileURLToPath(new URL('./vite.config.mjs',import.meta.url)),server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
const page=await browser.newPage({viewport:{width:1920,height:2300}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
  await page.route('**/gaia-panel.json',async route=>route.fulfill({contentType:'application/json',body:await readFile(new URL('../../panels/Roland GAIA SH-01.cepanel',import.meta.url),'utf8')}));
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(()=>!!window.__gaia,null,{timeout:90000});
  await page.evaluate(()=>window.__gaia.installFeedbackTestBackend());
  await page.evaluate(()=>window.__gaia.load('/gaia-panel.json'));
  await page.waitForTimeout(1000);
  await page.evaluate(()=>window.__gaia.feedbackConnect());
  const ctl=async name=>page.locator(`[data-control-id="${await page.evaluate(n=>window.__gaia.id(n),name)}"]`).first();
  const value=name=>page.evaluate(n=>window.__gaia.session(n).customValues.value,name);
  const sends=()=>page.evaluate(()=>window.__gaia.feedbackSent().filter(e=>e.name==='setDeviceParameter'));
  const incoming=values=>page.evaluate(values=>window.__gaia.feedbackEvent('dumpMessageParsed',{ok:true,requestId:'incoming_envelope_test',deviceRole:'Roland GAIA SH-01',values}),values);
  async function until(fn){for(let i=0;i<40;i++){if(await fn())return;await page.waitForTimeout(100);}assert.fail('Timed out checking linked envelope');}
  async function view(tone,kind,mode){
    const before=(await sends()).length;
    const r=await(await ctl(`tone${tone}.${kind}.view`)).boundingBox();
    await page.mouse.click(r.x+r.width-(mode==='graph'?28:84),r.y+9);
    await until(async()=>await page.evaluate(n=>window.__gaia.session(n).sectionValues?.TabContainer?.pageIndex,`tone${tone}.${kind}.view`)===(mode==='graph'?1:0));
    assert.equal((await sends()).length,before,'changing envelope view sends no MIDI');
  }
  for(const tone of [1,2,3])for(const kind of ['osc.pitchEnv','filter.env','amp.env']){
    assert.equal(await(await ctl(`tone${tone}_${kind.replaceAll('.','_')}_graph`)).count(),0,'Fader is the default view');
    assert.ok(await(await ctl(`tone${tone}.${kind}AttackTime`)).isVisible());
  }
  // Other controls overlap the transparent view container and must stay reachable.
  for(const mode of ['fader','graph']){
    await view(1,'osc.pitchEnv',mode);
    const pitch='tone1.osc.pitch';await incoming({[pitch]:64});await until(async()=>await value(pitch)===64);
    const r=await(await ctl(pitch)).boundingBox();
    await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
    await page.mouse.move(r.x+r.width/2,r.y+r.height/2-12,{steps:3});await page.mouse.up();
    assert.ok(await value(pitch)>64,'pitch knob remains usable in both envelope views');
  }
  await view(1,'osc.pitchEnv','fader');
  if(process.env.GAIA_PAGES_OUT){
    await mkdir(process.env.GAIA_PAGES_OUT,{recursive:true});
    await page.screenshot({path:join(process.env.GAIA_PAGES_OUT,'GAIA-envelope-faders.png'),clip:{x:0,y:0,width:1920,height:1000}});
  }
  await view(1,'filter.env','graph');
  assert.ok(await(await ctl('tone1.osc.pitchEnvAttackTime')).isVisible(),'views switch independently');
  assert.ok(await(await ctl('tone2.filter.envAttackTime')).isVisible(),'other tones keep their view');
  const graph='tone1_filter_env_graph', attack='tone1.filter.envAttackTime';
  const g=await ctl(graph);
  await until(async()=>await g.locator('[data-envelope-stage]').count()===4);
  const pos=async stage=>{const r=await g.locator(`[data-envelope-stage="${stage}"]`).boundingBox();return{x:r.x+r.width/2,y:r.y+r.height/2};};
  const seed={'tone1.filter.envAttackTime':32,'tone1.filter.envDecayTime':50,'tone1.filter.envSustainLevel':70,'tone1.filter.envReleaseTime':90};
  const count=(await sends()).length;
  await incoming(seed);await until(async()=>await value(attack)===32);
  const p=await pos('attack');
  assert.equal((await sends()).length,count,'incoming updates do not echo MIDI');
  const tone2=await value('tone2.filter.envAttackTime');
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+14,p.y,{steps:6});await page.mouse.up();
  await until(async()=>await value(attack)>32);
  const emitted=(await sends()).slice(count);assert.ok(emitted.length>0);
  assert.ok(emitted.every(e=>e.payload.parameterId===attack),'only the grabbed stage sends');
  assert.equal(emitted.at(-1).payload.value,await value(attack));
  for(const [id,v] of Object.entries(seed))if(id!==attack)assert.equal(await value(id),v);
  assert.equal(await value('tone2.filter.envAttackTime'),tone2,'other tones stay untouched');
  // Fader -> graph, through actual pointer input.
  const before=(await pos('attack')).x;
  const sharedValue=await value(attack);
  await view(1,'filter.env','fader');
  assert.equal(await value(attack),sharedValue,'switching retains edited values');
  const f=await(await ctl(attack)).boundingBox();
  await page.mouse.move(f.x+f.width/2,f.y+f.height/2);await page.mouse.down();
  await page.mouse.move(f.x+f.width/2,f.y+f.height/2-20,{steps:5});await page.mouse.up();
  await view(1,'filter.env','graph');
  await until(async()=>Math.abs((await pos('attack')).x-before)>1);
  // Shift precision and Escape rollback (no stuck echo guard / no panic).
  await incoming({[attack]:32});await until(async()=>await value(attack)===32);
  const fine=await pos('attack');await page.keyboard.down('Shift');await page.mouse.move(fine.x,fine.y);await page.mouse.down();await page.mouse.move(fine.x+14,fine.y,{steps:4});await page.mouse.up();await page.keyboard.up('Shift');
  assert.ok((await value(attack))-32>=3 && (await value(attack))-32<=6);
  const original=await value(attack), cancel=await pos('attack');
  await page.mouse.move(cancel.x,cancel.y);await page.mouse.down();await page.mouse.move(cancel.x+18,cancel.y,{steps:3});await page.keyboard.press('Escape');await page.mouse.up();
  assert.equal(await value(attack),original);
  assert.equal(await page.evaluate(n=>window.__gaia.session(n).dragging,attack),false);
  // Every stage in every tone reaches its full independent range by keyboard.
  for(const tone of [1,2,3])for(const kind of ['osc.pitchEnv','filter.env','amp.env']){
    await view(tone,kind,'graph');
    const name=`tone${tone}_${kind.replaceAll('.','_')}_graph`, elem=await ctl(name);
    const stages=kind==='osc.pitchEnv'?{a:'AttackTime',d:'Decay'}:{a:'AttackTime',d:'DecayTime',s:'SustainLevel',r:'ReleaseTime'};
    await elem.focus();
    for(const [key,suffix]of Object.entries(stages)){
      if(key==='s') continue; // sustain LEVEL is D's vertical axis, not the S hold handle.
      await page.keyboard.press(key);await page.keyboard.press('End');
      assert.equal(await value(`tone${tone}.${kind}${suffix}`),127);
    }
    for(const [key,suffix]of Object.entries(stages)){
      if(key==='s') continue;
      await page.keyboard.press(key);await page.keyboard.press('Home');
      assert.equal(await value(`tone${tone}.${kind}${suffix}`),0);
    }
  }
  // D's vertical axis edits sustain level; S follows that level, moving horizontally only.
  await incoming(seed);await until(async()=>await value(attack)===32);
  const dec=await pos('decay');await page.mouse.move(dec.x,dec.y);await page.mouse.down();await page.mouse.move(dec.x,dec.y-10,{steps:4});await page.mouse.up();
  assert.ok(await value('tone1.filter.envSustainLevel')>70);
  assert.equal(await value('tone1.filter.envDecayTime'),50);assert.equal(await value('tone1.filter.envReleaseTime'),90);
  assert.ok(Math.abs((await pos('decay')).y-(await pos('sustain')).y)<1);
  const holdSends=(await sends()).length, level=await value('tone1.filter.envSustainLevel');
  const sus=await pos('sustain');await page.mouse.move(sus.x,sus.y);await page.mouse.down();await page.mouse.move(sus.x+15,sus.y-12,{steps:4});await page.mouse.up();
  assert.ok((await pos('sustain')).x>sus.x+10);
  assert.ok(Math.abs((await pos('sustain')).y-sus.y)<1,'S cannot move vertically');
  assert.equal(await value('tone1.filter.envSustainLevel'),level);
  assert.equal((await sends()).length,holdSends,'preview hold never sends a made-up sustain-time parameter');
  await g.focus();await page.keyboard.press('s');await page.keyboard.press('ArrowUp');
  assert.equal(await value('tone1.filter.envSustainLevel'),level);
  // Each fader must drive its matching geometry, including D and S height together.
  for(const [suffix,handle,axis] of [['AttackTime','attack','x'],['DecayTime','decay','x'],['SustainLevel','sustain','y'],['ReleaseTime','release','x']]) {
    const parameter=`tone1.filter.env${suffix}`;await incoming({[parameter]:50});
    await until(async()=>await value(parameter)===50);const start=await pos(handle);
    await view(1,'filter.env','fader');
    const r=await(await ctl(parameter)).boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+r.height/2-16,{steps:4});await page.mouse.up();
    await view(1,'filter.env','graph');
    await until(async()=>Math.abs((await pos(handle))[axis]-start[axis])>1);
  }
  const d=await pos('decay');await page.mouse.dblclick(d.x,d.y);
  assert.equal(await g.locator('[data-envelope-stage]').count(),4);
  // Incoming changes continue working after a cancelled or completed graph drag.
  const last=(await sends()).length;await incoming({[attack]:99});await until(async()=>await value(attack)===99);
  assert.equal((await sends()).length,last);
  // Real CanvasControl in design mode, with inspector/model edits and no preview wrapper.
  await page.evaluate(()=>window.__gaia.mountEnvelopeDesignCheck());
  const design=page.locator('#envelope-design-check');
  const modelPos=async stage=>{const n=design.locator(`[data-envelope-stage="${stage}"]`);return{x:Number(await n.getAttribute('cx')),y:Number(await n.getAttribute('cy'))};};
  const designStart=await modelPos('attack');
  await page.evaluate(()=>window.__gaia.editModelChannel('tone1.filter.envAttackTime',127));
  await until(async()=>(await modelPos('attack')).x>designStart.x+5);
  await page.evaluate(()=>window.__gaia.editModelChannel('tone1.filter.envSustainLevel',90));
  const graphHeight=await page.evaluate(()=>window.__gaia.controls.find(c=>c._children.Core.name==='tone1_filter_env_graph')._children.Transform.height);
  await until(async()=>Math.abs((await modelPos('sustain')).y-(10+(1-90/127)*(graphHeight-20)))<.1);
  assert.equal((await modelPos('decay')).y,(await modelPos('sustain')).y);
  if(process.env.GAIA_PAGES_OUT){
    await mkdir(process.env.GAIA_PAGES_OUT,{recursive:true});
    await incoming({'tone1.osc.pitchEnvAttackTime':36,'tone1.osc.pitchEnvDecay':90,'tone1.amp.envAttackTime':20,'tone1.amp.envDecayTime':55,'tone1.amp.envSustainLevel':86,'tone1.amp.envReleaseTime':70});
    await page.mouse.move(1590,20);await page.waitForTimeout(200);
    await page.screenshot({path:join(process.env.GAIA_PAGES_OUT,'GAIA-envelope-graphs-SIMULATED.png'),clip:{x:0,y:0,width:1920,height:1000}});
  }
  assert.deepEqual(errors,[]);
  console.log('Nine independent Fader/Graph views: default visibility, no MIDI on switching, retained values, fader/MIDI feedback, design-canvas edits, D two-axis / S horizontal-only hold, no hold MIDI writes, fine drag, Escape rollback and double-click safety passed.');
}catch(e){if(process.env.GAIA_PAGES_OUT)await page.screenshot({path:join(process.env.GAIA_PAGES_OUT,'GAIA-envelope-debug.png'),fullPage:true});throw e;}
finally{await browser.close();await server.close();}
