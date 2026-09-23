import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { buildGaiaPanel } from '../../../tools/scripts/gaia-panel/make-gaia-panel.mjs';
import { mountPanel, controlNamed } from './support/gaiaScriptHarness.mjs';
import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { localCompilePresetRecall } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import { panels } from '../src/CE_Application/stores/panels.js';

const profile = JSON.parse(readFileSync(new URL('../../profiles/test/roland-gaia-sh01.ceditor-device.json', import.meta.url), 'utf8'));
const built = buildGaiaPanel();
const source = built.scripts.find(s => s.id === 'gaia_preset_names').source;
const identity = [240,126,19,6,2,65,65,2,0,0,0,0,0,0,247];
const ascii = s => Array.from(s.padEnd(12).slice(0,12), c => c.charCodeAt(0));
function dt1(address, data, deviceId = 19) {
  const body = address.concat(data);
  return [240,65,deviceId,0,0,65,18,...body,(128-body.reduce((a,b)=>a+b,0)%128)%128,247];
}
function harness() {
  mountPanel(structuredClone(built));
  const api = scriptApiForTesting('', 'gaia_preset_names');
  const sent = [], recalled = [], timers = [], dialogs = [];
  let setCalls = 0;
  let clock = 0;
  let route = { id: profile.id, midiInput: 'GAIA IN', midiDestination: 'GAIA OUT', connected: true };
  let recallError = '';
  const scope = {
    ...api,
    set(...args) { setCalls++; return api.set(...args); },
    after(ms, fn) { timers.push({ at: clock + ms, fn }); },
    routeMidi(role, fn) { assert.equal(role, 'Roland GAIA SH-01'); fn(); },
    sendSysex(bytes) { sent.push(bytes); },
    recallPreset(slot, opts) {
      if (recallError) return { ok: false, error: recallError };
      assert.equal(opts.role, 'Roland GAIA SH-01');
      const compiled = localCompilePresetRecall(profile, { slot });
      assert.ok(compiled.ok, compiled.error);
      recalled.push(slot);
      return compiled;
    },
    ce: { ...api.ce, device: { ...api.ce.device, profile: () => route }, ui: { dialog: (opts, answer) => dialogs.push({opts,answer}) } },
  };
  const module = new Function(...Object.keys(scope), source + '\nreturn { onPanelLoad, onSysexIn };')(...Object.values(scope));
  module.onPanelLoad();
  const caller = scriptApiForTesting('', 'bank-button');
  return {
    sent, recalled, dialogs, module,
    route: patch => { route = { ...route, ...patch }; },
    setCalls: () => setCalls,
    resetSetCalls: () => { setCalls = 0; },
    failRecall: message => { recallError = message; },
    event: (name, payload) => api.emit(name, payload),
    control: name => controlNamed(get(panels)[0], name),
    action: (name, arg) => caller.run('gaiaNames' + name[0].toUpperCase() + name.slice(1), arg),
    reply: bytes => module.onSysexIn(bytes),
    text(name) { return controlNamed(get(panels)[0], name)._children.Text.content; },
    advance(ms) {
      const end = clock + ms;
      while (true) {
        timers.sort((a,b)=>a.at-b.at);
        if (!timers.length || timers[0].at > end) break;
        const timer = timers.shift(); clock = timer.at; timer.fn();
      }
      clock = end;
    },
  };
}

test('user names: 64 direct RQ1 reads, no program change or writes, real nested labels and persistent cache', () => {
  const h = harness();
  assert.equal(h.sent.length, 0, 'opening the panel sends nothing');
  assert.match(h.text('recall_user_A1'), /not read/);
  h.action('scan', 'user');
  assert.deepEqual(h.sent[0], [240,126,127,6,1,247]);
  h.reply(identity);
  assert.deepEqual(h.sent[1], [240,65,19,0,0,65,17,32,0,0,0,0,0,0,12,84,247]);
  for (let slot=0; slot<64; slot++) {
    const request = h.sent.at(-1);
    assert.deepEqual(request.slice(7,15), [32,slot,0,0,0,0,0,12]);
    assert.equal(request.slice(7,-1).reduce((a,b)=>a+b,0)%128,0);
    h.reply(dt1([32,slot,0,0],ascii('TEST '+slot)));
    h.advance(60);
  }
  assert.equal(h.text('recall_user_A1'), '● A-1  TEST 0');
  assert.equal(h.text('recall_user_H8'), '● H-8  TEST 63');
  assert.match(h.text('names_status_user'), /64 patch names read/);
  assert.deepEqual(h.recalled, []);
  assert.ok(h.sent.slice(1).every(bytes=>bytes[6]===17));
  h.module.onPanelLoad();
  assert.equal(h.text('recall_user_H8'), '○ H-8  TEST 63');
  h.advance(10000);
  assert.equal(h.sent.length,65,'expired timeout callbacks cannot restart completed scans');
});

test('malformed, wrong-device and out-of-order replies never label a slot; timeout stops cleanly', () => {
  const h=harness(); h.action('scan','user'); h.reply(identity);
  h.reply(dt1([32,1,0,0],ascii('WRONG SLOT')));
  h.reply(dt1([32,0,0,0],ascii('WRONG UNIT'),16));
  const bad=dt1([32,0,0,0],ascii('BAD CHECKSUM')); bad[11]++;
  h.reply(bad);
  h.reply(dt1([32,0,0,0],ascii('SHORT').slice(0,11)));
  assert.match(h.text('recall_user_A1'), /not read/);
  h.advance(1800);
  assert.match(h.text('names_status_user'), /no name reply/);
  h.reply(dt1([32,0,0,0],ascii('TOO LATE')));
  assert.match(h.text('recall_user_A1'), /not read/);
  assert.equal(h.sent.length,2);
});

test('LCD patch page follows selected names and never confuses cached names with confirmation',()=>{
  const h=harness();
  const lcd=id=>h.control('gaia_status_screen')._children.Display.layouts[0].zones.find(z=>z.id===id).text;
  h.action('scan','user');h.reply(identity);h.reply(dt1([32,0,0,0],ascii('FRESH NAME')));h.action('stop');
  h.action('recall',0);
  assert.match(lcd('patch_selection'),/Requested User Patch A-1/);
  assert.equal(lcd('patch_name'),'NAME: FRESH NAME');
  assert.match(lcd('patch_source'),/READ THIS SESSION/);
  h.action('check');h.reply(identity);h.reply(dt1([1,0,0,0],[87,0,0]));
  assert.match(lcd('patch_selection'),/Confirmed User Patch A-1/);
  h.module.onPanelLoad();h.action('recall',0);
  assert.match(lcd('patch_source'),/CACHED/);
  assert.match(lcd('patch_selection'),/Requested/);
  h.route({connected:false});h.advance(1000);
  assert.match(lcd('patch_selection'),/unknown/);
});

test('factory scan asks first, verifies each selected patch, reads names and restores the original slot', () => {
  const h=harness(); h.action('scan','preset');
  assert.equal(h.sent.length,0);
  assert.match(h.dialogs[0].opts.message,/unsaved/);
  h.dialogs[0].answer('Cancel'); assert.equal(h.sent.length,0);
  h.action('scan','preset'); h.dialogs[1].answer('Read names'); h.reply(identity);
  assert.deepEqual(h.sent.at(-1).slice(7,15),[1,0,0,0,0,0,0,3]);
  h.reply(dt1([1,0,0,0],[87,0,7])); // preserve User A-8
  for (let slot=128;slot<192;slot++) {
    assert.equal(h.recalled.at(-1),slot);
    h.advance(350);
    h.reply(dt1([1,0,0,0],[87,64,slot-128]));
    assert.deepEqual(h.sent.at(-1).slice(7,15),[16,0,0,0,0,0,0,12]);
    h.reply(dt1([16,0,0,0],ascii('ROM TEST '+(slot-128)))); h.advance(60);
  }
  assert.equal(h.text('recall_preset_H8'),'● H-8  ROM TEST 63');
  assert.equal(h.recalled.at(-1),7);
  assert.equal(h.recalled.length,65);
});

test('disabled bank reception cannot silently copy the same name into every factory slot', () => {
  const h=harness(); h.action('scan','preset'); h.dialogs[0].answer('Read names'); h.reply(identity);
  h.reply(dt1([1,0,0,0],[87,0,2])); h.advance(350);
  h.reply(dt1([1,0,0,0],[87,0,2]));
  assert.match(h.text('names_status_preset'),/did not match/);
  assert.match(h.text('recall_preset_A1'),/not read/);
  assert.deepEqual(h.recalled,[128,2]);
});

test('stop cancels deferred reads, preserves cached names and blocks competing recalls during scans', () => {
  const h=harness(); h.action('scan','usb'); h.dialogs[0].answer('Read names'); h.reply(identity);
  h.reply(dt1([1,0,0,0],[87,64,63]));
  h.action('recall',2); assert.deepEqual(h.recalled,[64]);
  h.action('stop'); assert.deepEqual(h.recalled,[64,191]);
  const count=h.sent.length; h.advance(10000); assert.equal(h.sent.length,count);
  h.action('recall',2); assert.equal(h.recalled.at(-1),2);
});

test('PCM scan uses its own MSB and eight slots; unknown original bank aborts before any recall', () => {
  const h=harness(); h.action('scan','preset-pcm'); h.dialogs[0].answer('Read names'); h.reply(identity);
  h.reply(dt1([1,0,0,0],[0,0,0]));
  assert.deepEqual(h.recalled,[]);
  assert.match(h.text('names_status_preset_pcm'),/before changing sounds/);
  h.action('scan','preset-pcm'); h.dialogs[1].answer('Read names'); h.reply(identity);
  h.reply(dt1([1,0,0,0],[87,0,0]));
  for(let i=0;i<8;i++) {
    h.advance(350); h.reply(dt1([1,0,0,0],[88,64,i]));
    h.reply(dt1([16,0,0,0],ascii('PCM TEST '+i))); h.advance(60);
  }
  assert.equal(h.text('recall_preset_pcm_A8'),'● PCM 8  PCM TEST 7');
  assert.deepEqual(h.recalled,[192,193,194,195,196,197,198,199,0]);
});

test('selection stays requested until a valid bank/program read confirms it; checking never recalls', () => {
  const h=harness(); h.action('recall',18);
  assert.match(h.text('patch_bank_header_user_C'),/REQUESTED/);
  assert.equal(h.control('recall_user_C3')._children.Background._children.Fill.colour,'FF59492B');
  assert.match(h.text('names_status_user'),/Requested.*C-3/);
  h.action('check'); h.reply(identity);
  assert.deepEqual(h.sent.at(-1).slice(7,15),[1,0,0,0,0,0,0,3]);
  const bad=dt1([1,0,0,0],[87,0,18]); bad[11]++;
  h.reply(bad); assert.doesNotMatch(h.text('patch_bank_header_user_C'),/SELECTED/);
  h.reply(dt1([1,0,0,0],[87,0,18]));
  assert.match(h.text('patch_bank_header_user_C'),/SELECTED/);
  assert.equal(h.control('recall_user_C3')._children.Background._children.Fill.colour,'FF24483C');
  assert.deepEqual(h.recalled,[18]);
  h.action('recall',19);
  assert.equal(h.control('recall_user_C3')._children.Background._children.Fill.colour,'FF333D46');
  h.failRecall('Disconnected'); h.action('recall',4);
  assert.match(h.text('names_status_user'),/Recall failed/);
  assert.equal(h.control('recall_user_A5')._children.Background._children.Fill.colour,'FF333D46');
});

test('partial name reads distinguish fresh/cached/unknown and disconnect invalidates confirmation',()=>{
  const h=harness(); h.action('scan','user'); h.reply(identity);
  h.reply(dt1([32,0,0,0],ascii('FRESH NAME'))); h.action('stop');
  assert.match(h.text('recall_user_A1'),/^●/); assert.match(h.text('recall_user_A2'),/^—/);
  assert.match(h.text('names_status_user'),/● 1 read · ○ 0 cached · — 63 unknown/);
  h.route({connected:false}); h.advance(1000);
  assert.match(h.text('recall_user_A1'),/^○/);
  assert.match(h.text('names_status_user'),/Selection unknown.*○ 1 cached/);
  h.resetSetCalls();
  h.route({midiInput:'OTHER IN',midiDestination:'OTHER OUT'}); h.advance(1000);
  assert.ok(h.setCalls() >= 1000 && h.setCalls() < 1100,
    `a route change should paint 200 slots once, not twice (saw ${h.setCalls()} set calls)`);
  assert.match(h.text('recall_user_A1'),/not read/);
  h.route({midiInput:'GAIA IN',midiDestination:'GAIA OUT',connected:true}); h.advance(1000);
  assert.match(h.text('recall_user_A1'),/^○ A-1  FRESH NAME/);
});

test('incoming bare program change does not guess the bank; selection check timeout stays unknown',()=>{
  const h=harness(); h.action('recall',130);
  h.event('onPresetChange',{role:'Roland GAIA SH-01',slot:2,source:'device'});
  assert.match(h.text('names_status_preset'),/Selection unknown/);
  assert.doesNotMatch(h.text('patch_bank_header_user_A'),/SELECTED/);
  h.action('check'); h.advance(1800);
  assert.match(h.text('names_status_user'),/no identity reply/);
  h.reply(identity); assert.equal(h.sent.length,1,'late identity cannot restart a timed-out check');
});
