import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../../../tools/scripts/qa/roland-gaia/make-gaia-profile.mjs';
import { buildGaiaPanel } from '../../../tools/scripts/gaia-panel/make-gaia-panel.mjs';
import { localCompileParameter, localCompilePresetRecall, localParseDumpMessage } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import { controlPanelRect, flatControls, getChildControls } from '../src/CE_Application/utils/containment.js';
import { tabPages, isChildOnActivePage } from '../src/CE_Application/utils/tabContainerLayout.js';
import { mountPanel } from './support/gaiaScriptHarness.mjs';
import { get } from 'svelte/store';
import { syncDeviceParameterToPanelPreview } from '../src/CE_Application/utils/deviceBindingSync.js';
import { panelPreviewSessions, commitPanelPreviewSelectAction } from '../src/CE_Application/stores/interactionPreview.js';
import { formatRangeValue, parseRangeInputValue } from '../src/CE_Application/utils/rangeBehavior.js';

const profile = buildProfile();
const panel = buildGaiaPanel();
const controls = flatControls(panel.controls);
// Looked up by the parameter id, which is what these tests think in. A control is named after its
// parameter with the dots made underscores (utils/controlNames.js), so the id is converted here.
const byName = name => controls.find(c => c._children.Core.name === name.replace(/\./g, '_'));
const system = profile.parameters.filter(p => p.id.startsWith('system.'));
function dt1(data) {
  const body = [1, 0, 0, 0, ...data];
  return [0xf0, 0x41, 0x10, 0, 0, 0x41, 0x12, ...body, (128 - body.reduce((a,b)=>a+b,0)%128)%128, 0xf7].map(n=>n.toString(16).padStart(2,'0')).join(' ');
}
test('all 89 named System parameters are bound, and reserved offsets remain absent', () => {
  assert.equal(system.length, 89);
  const reserved = new Set(Array.from({length:14}, (_,i)=>0x1d+i).concat([0x6c,0x6d]));
  for (const parameter of system) {
    assert.match(parameter.address, /^01 00 00 /);
    assert.ok(!reserved.has(parseInt(parameter.address.split(' ')[3],16)));
    assert.equal(controls.flatMap(c=>c._children.DeviceBindings?.bindings??[]).filter(b=>b.parameterId===parameter.id).length,1,parameter.id);
  }
  assert.equal(system.filter(p=>p.id.startsWith('system.writeProtect')).length,64);
  assert.equal(system.find(p=>p.id==='system.writeProtectA1').address,'01 00 00 2B');
  assert.equal(system.find(p=>p.id==='system.writeProtectH8').address,'01 00 00 6A');
});
test('System tuning and tempo encode the documented nibble widths and checksum', () => {
  const tune = localCompileParameter(profile,{parameterId:'system.masterTune',value:1024});
  assert.ok(tune.ok,tune.error);
  assert.equal(tune.hex,'F0 41 10 00 00 41 12 01 00 00 04 00 04 00 00 77 F7');
  assert.equal(localCompileParameter(profile,{parameterId:'system.tempo',value:120}).hex,'F0 41 10 00 00 41 12 01 00 00 0A 00 07 08 66 F7');
  const req = profile.requests.find(r=>r.id==='requestSystem');
  assert.equal(req.address,'01 00 00 00');
  assert.equal(req.size,'00 00 00 6E');
  assert.ok(profile.startup.sync.some(r=>r.request==='requestSystem'));
});
test('System block readback preserves nibble values and both ends of write protection', () => {
  const data = Array(110).fill(0);
  data.splice(4,4,0,4,0,0);
  data.splice(10,3,0,7,8);
  data[0x2b]=1; data[0x6a]=1; data[0x6b]=7;
  const parsed = localParseDumpMessage(profile,dt1(data));
  assert.ok(parsed.ok,parsed.error);
  assert.equal(parsed.dumpId,'system');
  assert.equal(parsed.values['system.masterTune'],1024);
  assert.equal(parsed.values['system.tempo'],120);
  assert.equal(parsed.values['system.writeProtectA1'],'on');
  assert.equal(parsed.values['system.writeProtectH8'],'on');
});
test('1920 by 1000 panel keeps a vertical effects column beside three horizontal tone rows', () => {
  assert.deepEqual([panel.width,panel.height],[1920,1000]);
  assert.equal(byName('top_pages'),undefined);
  assert.deepEqual(tabPages(byName('bottom_pages')).map(p=>p.id),['status','banks','arpeggiator','system']);
  const bottom=byName('bottom_pages');
  const pattern=byName('arp_arpeggio_pattern');
  assert.ok(getChildControls(bottom).includes(pattern) && isChildOnActivePage(pattern,bottom));
  assert.ok(getChildControls(pattern).some(c=>c._children.Core.name==='arp_pattern_grid'));
  // Positions on the PANEL: the sections are containers, so a control's own x/y is relative to its
  // section and says nothing about the column it sits in.
  const at=name=>controlPanelRect(panel.controls,byName(name)._children.Core.id);
  for(const name of ['effects_distortion','effects_flanger','effects_delay','effects_reverb','effects_output','master.volume']) {
    assert.ok(byName(name),name);
    assert.ok(at(name).x>=1594,name);
  }
  const fx=['distortion','flanger','delay','reverb'].map(n=>at(`effects_${n}`));
  assert.ok(fx.every((r,i)=>r.x===fx[0].x && (!i || r.y>=fx[i-1].y+fx[i-1].h)));
  for(const tone of [1,2,3]) {
    assert.equal(byName(`tone${tone}.signalFlow`),undefined);
    assert.equal(byName(`tone${tone}.lamp`),undefined);
    const row=['lfo.rate','osc.pitch','filter.cutoff','amp.level','modLfo.rate'].map(n=>at(`tone${tone}.${n}`));
    assert.ok(row.every((r,i)=>r.x+r.w<fx[0].x && (!i || r.x>row[i-1].x)));
    assert.ok(row.slice(1,4).every(r=>r.y===row[1].y),'the three tone faders share their baseline');
    assert.equal(row[0].y,row[4].y,'the two compact rate knobs share their higher row');
  }
  // The System fields live in their sections; the section is what sits on the (hidden) page.
  assert.ok(!isChildOnActivePage(byName('system_master_clock'),bottom));
  assert.ok(getChildControls(byName('system_master_clock')).includes(byName('system.masterTune')));
  for(const tone of [1,2,3]) assert.ok(byName(`tone${tone}.osc.wave`));
});
test('all 200 patch buttons recall only on click, using the existing bank/PC compiler', () => {
  const scripts=panel.scripts.filter(s=>s.id.startsWith('recall_'));
  assert.equal(scripts.length,200);
  const seen=new Set();
  for(const script of scripts) {
    assert.equal(script.event,'onClick');
    assert.ok(byName(script.target));
    const calls=[];
    const click=new Function('run',`${script.source}; return onClick;`)((...args)=>calls.push(args));
    assert.equal(calls.length,0,'loading a script must not recall anything');
    click();
    assert.equal(calls.length,1);
    const [action,slot]=calls[0];
    assert.equal(action,'gaiaNamesRecall');
    const compiled=localCompilePresetRecall(profile,{slot});
    assert.ok(compiled.ok,compiled.error);
    assert.equal(compiled.messages.length,3);
    seen.add(slot);
  }
  assert.equal(seen.size,200);
});

test('nested protection switches accept device readback and can be switched both ways', () => {
  mountPanel(panel);
  const id=byName('system.writeProtectH8')._children.Core.id;
  assert.equal(syncDeviceParameterToPanelPreview('Roland GAIA SH-01','system.writeProtectH8','on'),1);
  assert.equal(get(panelPreviewSessions)[id].checked,true);
  assert.equal(commitPanelPreviewSelectAction(id).checked,false);
  assert.equal(commitPanelPreviewSelectAction(id).checked,true);
  assert.equal(syncDeviceParameterToPanelPreview('Roland GAIA SH-01','system.writeProtectH8','off'),1);
  assert.equal(get(panelPreviewSessions)[id].checked,false);
  assert.equal(localCompileParameter(profile,{parameterId:'system.writeProtectH8',value:true}).hex,'F0 41 10 00 00 41 12 01 00 00 6A 01 14 F7');
});
test('System numbers display and edit human units, retaining wire units internally', () => {
  const tune=byName('system.masterTune')._children.Behavior;
  assert.equal(tune.defaultValue,1024);
  assert.equal(formatRangeValue(tune,1024),'0.0');
  assert.equal(formatRangeValue(tune,1025),'0.1');
  assert.equal(formatRangeValue(tune,24),'-100.0');
  assert.equal(formatRangeValue(tune,2024),'100.0');
  assert.equal(parseRangeInputValue(tune,'-12.3'),901);
  const channel=byName('system.rxTxChannel')._children.Behavior;
  assert.equal(formatRangeValue(channel,0),'1');
  assert.equal(parseRangeInputValue(channel,'16'),15);
});
