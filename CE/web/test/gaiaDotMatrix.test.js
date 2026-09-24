import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGaiaPanel } from '../../../tools/scripts/gaia-panel/make-gaia-panel.mjs';
import { applyStatusDisplay, updateGaiaScreen } from '../../../tools/scripts/gaia-panel/status-display.mjs';
import { customLcdInfo, formatLcdInfo } from '../src/CE_Application/utils/customLcdInfo.js';
import { composeLayout } from '../src/CE_Application/utils/lcdZones.js';
import { mountPanel, controlNamed } from './support/gaiaScriptHarness.mjs';
import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';

const profile=JSON.parse(readFileSync(new URL('../../profiles/test/roland-gaia-sh01.ceditor-device.json',import.meta.url)));
test('dot-matrix uses four read-only menu pages and an idempotent layout migration',()=>{
  const p=buildGaiaPanel(), screen=controlNamed(p,'gaia_status_screen'), d=screen._children.Display;
  assert.equal(d.dotMatrix,true);
  assert.deepEqual(d.layouts.map(l=>l.id),['PATCH','PARAM','ARP','SYSTEM']);
  for(const layout of d.layouts) {
    assert.equal(layout.zones.filter(z=>z.press).length,4);
    assert.ok(layout.zones.every(z=>z.show!=='edit' && (!z.press || Object.keys(z.press).join()==='layout')));
    const rows=composeLayout(layout.zones,d.rows,d.cols,()=>null);
    assert.equal(rows.length,12); assert.ok(rows[11].includes(`[${layout.id}]`));
    assert.ok(rows[0].includes('ROLAND  GAIA  |  SYNTHESIZER SH-01'));
  }
  assert.ok(!d.activeScope.includes(controlNamed(p,'arp_pattern_grid')._children.Core.id));
  // Idempotence of the pass, on the flat layout it runs on; the finished panel is sectioned and renamed.
  const flat=buildGaiaPanel({sections:false}), before=JSON.stringify(flat); applyStatusDisplay(flat,profile); assert.equal(JSON.stringify(flat),before);
});
test('custom LCD sources report real channel values, LED labels, tone identity and special values',()=>{
  const p=buildGaiaPanel(); const info=(name,v)=>customLcdInfo(controlNamed(p,name),v);
  assert.equal(info('tone2.filter.cutoff',{value:97}).value,97);
  assert.match(info('tone2.filter.cutoff',{value:97}).name,/TONE 2/);
  assert.equal(info('tone1.osc.wave',{value:6}).text,'SUPER-SAW');
  assert.equal(info('tone1.osc.wave',{value:6}).kind,'choice');
  // VELOCITY and OCTAVE RANGE are step counters, so the native resolver reads them and hands its
  // raw range to formatLcdInfo with the same readout metadata.
  const native=(name,value)=>{const c=controlNamed(p,name);assert.equal(c._children.Core.controlType,'Number',name);
    return formatLcdInfo({present:true,value,min:c._children.Behavior.min??0,max:c._children.Behavior.max??127,text:''},c._children.Designer.lcdReadout);};
  assert.equal(native('arp.velocity',0).text,'REAL (played velocity)');
  assert.equal(native('arp.octaveRange',61).value,-3);
  assert.equal(info('tone1.osc.detune',{value:14}).text,'-50');
  assert.equal(info('tone1.osc.pitch',{value:64}).text,'0');
  assert.equal(info('arp_pattern_grid',{arpEndStep:12,arpCurrentStep:0}).value,12);
  assert.equal(info('system.tempo',{}),null,'native ranges keep native resolver');
});
test('real scripting runtime updates LCD static zones without replacing source bindings or sending MIDI',()=>{
  const p=buildGaiaPanel(), mounted=mountPanel(p), api=scriptApiForTesting('','lcd_test');
  const write=new Function('get','set',`return (${updateGaiaScreen.toString()});`)(api.get,api.set);
  write({patch_selection:'PATCH: Confirmed User C-3',patch_name:'NAME: TEST PATCH',patch_source:'NAME: CACHED'});
  const d=mounted.controls().find(c=>c._children.Core.name==='gaia_status_screen')._children.Display;
  assert.equal(d.layouts[0].zones.find(z=>z.id==='patch_name').text,'NAME: TEST PATCH');
  assert.equal(d.layouts[0].zones.find(z=>z.id==='patch_source').text,'NAME: CACHED');
  assert.equal(d.layouts[1].zones.find(z=>z.id==='param_name').sourceId,'@active');
  const timers=[];
  const source=p.scripts.find(s=>s.id==='gaia_status_display').source;
  let mapped=null;
  const mod=new Function('get','set','after','ce',source+'\nreturn {onPanelLoad};')(api.get,api.set,(ms,fn)=>timers.push(fn),{device:{profile:()=>mapped}});
  mod.onPanelLoad();
  const connection=()=>mounted.controls().find(c=>c._children.Core.name==='gaia_status_screen')._children.Display.layouts[0].zones.find(z=>z.id==='connection').text;
  assert.match(connection(),/NO PROFILE/);
  mapped={midiInput:'in',midiDestination:'out',connected:true};timers.shift()();
  assert.match(connection(),/VALUES NEED READBACK/);
  mapped={midiInput:'in',midiDestination:'out',connected:false};timers.shift()();
  assert.match(connection(),/NOT CONFIRMED/);
});
