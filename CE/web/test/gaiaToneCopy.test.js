import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { buildGaiaPanel } from '../../../tools/scripts/gaia-panel/make-gaia-panel.mjs';
import { PATCH_TONE } from '../../../tools/scripts/qa/roland-gaia/address-map.mjs';
import { mountPanel, controlNamed } from './support/gaiaScriptHarness.mjs';
import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { panels } from '../src/CE_Application/stores/panels.js';

const built = buildGaiaPanel();
const source = built.scripts.find(s => s.id === 'gaia_tone_copy').source;
const identity = [240,126,19,6,2,65,65,2,0,0,0,0,0,0,247];
const fields = PATCH_TONE.map(p => ({ ...p, offset: parseInt(p.offset.split(' ')[1],16) }));
const data = Array(62).fill(0);
for (const p of fields) data[p.offset] = Math.floor((p.min+p.max)/2);
function dt1(tone, values=data, device=19) {
  const body=[16,0,tone,0,...values];
  return [240,65,device,0,0,65,18,...body,(128-body.reduce((a,b)=>a+b,0)%128)%128,247];
}
function harness() {
  mountPanel(structuredClone(built));
  const api=scriptApiForTesting('', 'gaia_tone_copy');
  const sent=[], writes=[], timers=[], dialogs=[];
  let clock=0, route={id:'roland-gaia-sh01',midiInput:'IN',midiDestination:'OUT',connected:true};
  const scope={...api,
    after(ms,fn){timers.push({at:clock+ms,fn});},
    routeMidi(role,fn){assert.equal(role,'Roland GAIA SH-01');fn();},
    sendSysex(bytes){sent.push(bytes);},
    ce:{...api.ce,device:{...api.ce.device,profile:()=>route,write:(...args)=>writes.push(args)},ui:{dialog:(opts,answer)=>dialogs.push({opts,answer})}},
  };
  const module=new Function(...Object.keys(scope),source+'\nreturn {onPanelLoad,onSysexIn};')(...Object.values(scope));
  module.onPanelLoad();
  return {sent,writes,dialogs,reply:module.onSysexIn,
    choose:(from,to)=>{api.run('gaiaToneCopy',from); if(to) dialogs.at(-1).answer('Tone '+to);},
    event:(name,event)=>api.emit(name,event),
    route:patch=>{route={...route,...patch};},
    text:t=>controlNamed(get(panels)[0],`tone${t}_copy_status`)._children.Text.content,
    advance(ms){const end=clock+ms;for(;;){timers.sort((a,b)=>a.at-b.at);if(!timers.length||timers[0].at>end)break;const t=timers.shift();clock=t.at;t.fn();}clock=end;},
  };
}

test('Tone Copy offers only other tones; cancel and panel load send nothing',()=>{
  const h=harness();assert.equal(h.sent.length,0);
  for(const from of [1,2,3]){h.choose(from);assert.deepEqual(h.dialogs.at(-1).opts.buttons,[1,2,3].filter(t=>t!==from).map(t=>'Tone '+t).concat('Cancel'));h.dialogs.at(-1).answer('Cancel');}
  assert.equal(h.sent.length,0);
});

for(const from of [1,2,3]) for(const to of [1,2,3].filter(t=>t!==from)) {
  test(`Tone Copy ${from} to ${to}: fresh read, reserved bytes preserved, verified before select`,()=>{
    const h=harness();h.choose(from,to);assert.deepEqual(h.sent[0],[240,126,127,6,1,247]);h.reply(identity);
    assert.deepEqual(h.sent[1].slice(7,15),[16,0,from,0,0,0,0,62]);
    h.reply(dt1(from));
    const copied=new Map();
    for(const packet of h.sent.filter(p=>p[6]===18)) {
      assert.deepEqual(packet.slice(7,10),[16,0,to]);assert.equal(packet.slice(7,-1).reduce((a,b)=>a+b,0)%128,0);
      packet.slice(11,-2).forEach((v,i)=>copied.set(packet[10]+i,v));
    }
    assert.deepEqual([...copied.keys()],fields.map(p=>p.offset));
    for(const [offset,value] of copied)assert.equal(value,data[offset]);
    assert.equal(h.writes.length,0);h.advance(100);
    assert.deepEqual(h.sent.at(-1).slice(7,15),[16,0,to,0,0,0,0,62]);
    const dest=data.slice();for(let i=0;i<62;i++)if(!copied.has(i))dest[i]=99;
    h.reply(dt1(to,dest));assert.equal(h.text(from),'Copied to Tone '+to);
    assert.deepEqual(h.writes,[1,2,3].map(t=>['common.tone'+t+'Select',t===to?'on':'off','Roland GAIA SH-01']));
    assert.deepEqual(h.sent.at(-1).slice(7,15),[16,0,0,0,0,0,0,61]);
    const count=h.sent.length;h.reply(dt1(to,dest));h.advance(10000);assert.equal(h.sent.length,count);
  });
}

test('wrong address/device/checksum and missing replies cannot write a tone',()=>{
  const h=harness();h.choose(1,2);h.reply(identity);h.reply(dt1(3));h.reply(dt1(1,data,16));
  const bad=dt1(1);bad[11]++;h.reply(bad);h.reply(dt1(1,data.slice(1)));
  assert.equal(h.sent.length,2);h.advance(2500);assert.match(h.text(1),/No reply/);h.reply(dt1(1));assert.equal(h.sent.length,2);
});

test('invalid source and differing destination are failures, never successful selection',()=>{
  const h=harness();h.choose(1,2);h.reply(identity);const bad=data.slice();bad[0]=127;h.reply(dt1(1,bad));
  assert.match(h.text(1),/Invalid/);assert.equal(h.sent.length,2);
  h.choose(1,2);h.reply(identity);h.reply(dt1(1));h.advance(100);const different=data.slice();different[12]++;
  h.reply(dt1(2,different));assert.match(h.text(1),/Readback differs/);assert.equal(h.writes.length,0);
});

test('route change during deferred verification cancels and permits retry',()=>{
  const h=harness();h.choose(1,2);h.reply(identity);h.reply(dt1(1));const count=h.sent.length;
  h.route({midiDestination:'OTHER'});h.advance(100);assert.match(h.text(1),/Connection changed/);assert.equal(h.sent.length,count);
  h.choose(2,3);assert.equal(h.sent.length,count+1);
});

test('patch changes and disconnect stop pending copies before any write',()=>{
  for(const name of ['onPresetChange','onDeviceDisconnected']) {
    const h=harness();h.choose(1,2);h.reply(identity);h.event(name,{role:'Roland GAIA SH-01'});h.reply(dt1(1));h.advance(10000);
    assert.equal(h.sent.length,2);assert.equal(h.writes.length,0);assert.match(h.text(1),/stopped/i);
  }
});
