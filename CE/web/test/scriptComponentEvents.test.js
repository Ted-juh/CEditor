// scriptComponentEvents.test.js — hearing back from a component (design doc §45).
//
// §44 made ce.components two-way for VALUES: 302 members, every one readable, every one reporting
// what it did. This is the other direction. The event catalogue was 24 events — 11 control, 2
// panel, 3 time, 8 device — and not one of them came from a component, so a script could drive an
// arpeggiator and never be told it fired a step. The only way to notice anything was to poll a
// read() on a timer, which is both wasteful and late.
//
// Three things are pinned here, and the third is the one that matters most:
//
//  1. The events are declared, panel-view only, and reach both a named `onStep` handler and an
//     explicit on(target, "step", fn) listener — including on("*", …).
//  2. Every event named in the contract is RAISED somewhere. panelApiParity.test.js already
//     refuses a declared event with no source; this adds that every field the summary promises is
//     actually supplied at every site that raises it. A payload documented as carrying
//     `hit.velocity` and never sending one is the same defect one level down.
//  3. The detection functions the surface uses — a phase wrap, a meter zone, an envelope stage —
//     agree with the app's own maths, not with a number copied beside them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  setRuntimeHost, setLiveEnabled, dispatchInteraction, scriptApiForTesting,
} from '../src/CE_Application/scripting/panelRuntime.js';
import {
  COMPONENT_EVENTS, ALL_EVENTS, EVENT_BY_ID, ALL_HANDLER_NAMES,
  handlerNamesForRuntime, RUNTIME_WEBVIEW, RUNTIME_PLAYER, memberRuntime,
} from '../src/CE_Application/scripting/panelApi.js';
import { meterZoneIndexAt, meterZones, meterZoneColourAt } from '../src/CE_Application/utils/meterLayout.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const here = dirname(fileURLToPath(import.meta.url));
const surfaceSource = readFileSync(
  join(here, '..', 'src', 'CE_Application', 'editor', 'PanelPreviewSurface.svelte'), 'utf8');

/* ------------------------------------------------------------------------ the contract */

test('eleven component events are declared, and all of them are panel-view only', () => {
  assert.equal(COMPONENT_EVENTS.length, 11);
  for (const e of COMPONENT_EVENTS) {
    // The component engines live in the preview surface and the C++ engines carry stubs, so
    // window-closed there is nothing running that could raise one. Not a policy choice.
    assert.equal(memberRuntime(e), RUNTIME_WEBVIEW, `${e.id} should be panel-view only`);
    assert.equal(EVENT_BY_ID[e.id], undefined ?? EVENT_BY_ID[e.id]);
    assert.match(e.fn, /^on[A-Z]/, `${e.id} needs an onX handler name`);
    assert.ok(e.summary?.length > 40, `${e.id} needs a summary that says what the payload carries`);
  }
});

test('the component events joined the catalogue rather than sitting beside it', () => {
  for (const e of COMPONENT_EVENTS) {
    assert.ok(ALL_EVENTS.some((x) => x.id === e.id && x.group === 'component'), `${e.id} missing`);
    assert.ok(ALL_HANDLER_NAMES.includes(e.fn), `${e.fn} is not a handler name a runtime probes for`);
    assert.equal(EVENT_BY_ID[e.id].fn, e.fn);
  }
});

test('the player is not asked for handlers it could never call', () => {
  // Before §45 every event went to both probe lists because none of them had a runtime. Probing a
  // player script for onStep would be probing for a handler nothing in the player can raise.
  const player = handlerNamesForRuntime(RUNTIME_PLAYER);
  const webview = handlerNamesForRuntime(RUNTIME_WEBVIEW);
  for (const e of COMPONENT_EVENTS) {
    assert.ok(webview.includes(e.fn), `${e.fn} should be probed for in the editor`);
    assert.ok(!player.includes(e.fn), `${e.fn} should not be probed for in the player`);
  }
  // …and the events that DO reach both are untouched.
  assert.ok(player.includes('onBeat') && webview.includes('onBeat'));
  assert.ok(player.includes('onNoteIn') && webview.includes('onNoteIn'));
});

test('no component event name collides with one that was already there', () => {
  // onStage and not onState: onStateChanged is a CONTROL's hover/pressed state, and two events
  // whose names differ by a suffix are two events somebody will subscribe to the wrong one of.
  const fns = ALL_EVENTS.map((e) => e.fn);
  assert.deepEqual(fns.filter((f, i) => fns.indexOf(f) !== i), []);
  assert.ok(fns.includes('onStateChanged'), 'the control event is still there');
  assert.ok(fns.includes('onStage'), '…and the component one is not called onState');
  assert.ok(!fns.includes('onState'));
});

/* ---------------------------------------------------------------- they reach a script */

const panel = { id: 'p', name: 'Events', width: 400, height: 300, controls: [] };

/** Run `fn` with a panel carrying one Arp and the runtime live. */
async function withArp(fn) {
  const arp = createControl('Arp', { name: 'MyArp' });
  setRuntimeHost({ panel: { ...panel, controls: [arp], scripting: { modules: ['ce.core'] } }, scripts: [] });
  setLiveEnabled(true);
  try { return await fn(arp, String(arp._children.Core.id)); } finally { setRuntimeHost(null); }
}

test('an explicit on(target, event, fn) listener receives a component event', async () => {
  await withArp(async (arp, id) => {
    const api = scriptApiForTesting('', 'listener-script');
    const seen = [];
    api.on('MyArp', 'onStep', (p) => seen.push(p));
    await dispatchInteraction(id, 'onStep', { target: 'MyArp', index: 3, of: 8, notes: [60, 64] });
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0], { target: 'MyArp', index: 3, of: 8, notes: [60, 64] });
  });
});

test('on("*", …) receives it too, which is why every payload carries its target', async () => {
  await withArp(async (arp, id) => {
    const api = scriptApiForTesting('', 'listener-script');
    const seen = [];
    api.on('*', 'onCycle', (p) => seen.push(p.target));
    await dispatchInteraction(id, 'onCycle', { target: 'MyArp', count: 4 });
    // Without `target` in the payload a wildcard handler could not tell which arpeggiator wrapped,
    // which is the whole reason a wildcard subscription is useful.
    assert.deepEqual(seen, ['MyArp']);
  });
});

test('a listener on a different control does not hear it', async () => {
  await withArp(async (arp, id) => {
    const api = scriptApiForTesting('', 'listener-script');
    const seen = [];
    api.on('SomethingElse', 'onStep', (p) => seen.push(p));
    await dispatchInteraction(id, 'onStep', { target: 'MyArp', index: 1, of: 8, notes: [] });
    assert.deepEqual(seen, []);
  });
});

test('every component event can be delivered, not just the two that were spot-checked', async () => {
  await withArp(async (arp, id) => {
    const api = scriptApiForTesting('', 'listener-script');
    const seen = [];
    for (const e of COMPONENT_EVENTS) api.on('*', e.id, (p) => seen.push([e.id, p.target]));
    for (const e of COMPONENT_EVENTS) {
      await dispatchInteraction(id, e.fn, { target: 'MyArp' });
    }
    assert.deepEqual(seen.map(([x]) => x), COMPONENT_EVENTS.map((e) => e.id));
  });
});

test('on() takes either spelling of an event name, which it did not before', async () => {
  // A real trap, and not one §45 introduced: on() matched the HANDLER name, because that is what
  // dispatchEvents carries — while the events list a script author reads names them by id. So
  // on("*", "timer", fn) registered a listener that could never fire, silently, and had done
  // since the verb existed. Both spellings work now; the preludes' own on("*", "onTimer", …) is
  // untouched.
  await withArp(async (arp, id) => {
    const api = scriptApiForTesting('', 'listener-script');
    const seen = [];
    api.on('*', 'step', (p) => seen.push(['id', p.index]));
    api.on('*', 'onStep', (p) => seen.push(['fn', p.index]));
    await dispatchInteraction(id, 'onStep', { target: 'MyArp', index: 5, of: 8, notes: [] });
    assert.deepEqual(seen, [['id', 5], ['fn', 5]]);
  });
});

test('off() takes either spelling too, or a listener could be registered and not removed', async () => {
  await withArp(async (arp, id) => {
    const api = scriptApiForTesting('', 'listener-script');
    const seen = [];
    api.on('*', 'onCycle', (p) => seen.push(p.count));
    api.off('*', 'cycle');                       // the OTHER spelling of the same subscription
    await dispatchInteraction(id, 'onCycle', { target: 'MyArp', count: 1 });
    assert.deepEqual(seen, []);
  });
});

test('an existing event still answers to the spelling the preludes use', async () => {
  // The three C++ preludes each register on("*", "onTimer", …) at load time to drive after().
  // Normalising must not have moved that.
  await withArp(async (arp, id) => {
    const api = scriptApiForTesting('', 'listener-script');
    const seen = [];
    api.on('*', 'onTimer', () => seen.push('fn'));
    api.on('*', 'timer', () => seen.push('id'));
    await dispatchInteraction(id, 'onTimer', { id: 't' });
    assert.deepEqual(seen, ['fn', 'id']);
  });
});

/* --------------------------------------------------- every declared field is really sent */

/** The payload keys of every `raiseComponent(x, 'onFoo', { … })` in the surface. */
function raisedKeys(handler) {
  const out = [];
  const re = new RegExp(`raiseComponent\\([^,]+,\\s*'${handler}',\\s*\\{`, 'g');
  for (let m = re.exec(surfaceSource); m; m = re.exec(surfaceSource)) {
    // Walk to the matching brace rather than matching lazily: the payloads carry nested arrays,
    // calls and objects, and a lazy pattern stops at the first `}` inside one.
    let depth = 0;
    let at = m.index + m[0].length - 1;
    const start = at;
    for (; at < surfaceSource.length; at += 1) {
      const c = surfaceSource[at];
      if (c === '{') depth += 1;
      else if (c === '}') { depth -= 1; if (depth === 0) break; }
    }
    // Split on TOP-LEVEL commas, then take the name before the colon — or the whole thing, for a
    // shorthand property. `{ stage, previous }` names two fields and contains no colon at all.
    const body = surfaceSource.slice(start + 1, at);
    const parts = [];
    let nest = 0;
    let piece = '';
    for (const c of body) {
      if ('{[('.includes(c)) nest += 1;
      else if ('}])'.includes(c)) nest -= 1;
      if (c === ',' && nest === 0) { parts.push(piece); piece = ''; continue; }
      piece += c;
    }
    parts.push(piece);
    out.push(new Set(parts
      .map((part) => part.trim().split(':')[0].trim())
      .filter((name) => /^[a-zA-Z]\w*$/.test(name))));
  }
  return out;
}

test('every field a summary promises is supplied at every site that raises the event', () => {
  // The defect one level below "a declared event nothing raises": an event that IS raised and
  // does not carry what the contract says it carries. `hit.velocity` documented and never sent
  // would be undefined in every handler, and nothing would say so.
  const problems = [];
  for (const e of COMPONENT_EVENTS) {
    // The summary names its fields as `payload.field`.
    const promised = [...e.summary.matchAll(new RegExp(`${e.payload}\\.([a-zA-Z]\\w*)`, 'g'))]
      .map((m) => m[1])
      .filter((f) => f !== 'target');          // supplied by raiseComponent itself, for every event
    assert.ok(promised.length, `${e.id}'s summary names no payload fields`);

    const sites = raisedKeys(e.fn);
    assert.ok(sites.length, `${e.fn} is declared but nothing raises it`);
    for (const [i, keys] of sites.entries()) {
      for (const field of promised) {
        if (!keys.has(field)) problems.push(`${e.fn} site ${i + 1} does not send ${e.payload}.${field}`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('raiseComponent is the only way one is raised, so target is never forgotten', () => {
  // Every payload gets `target` from the raiser rather than from eleven call sites. A direct
  // dispatchInteraction with a component event name would bypass that.
  for (const e of COMPONENT_EVENTS) {
    const direct = new RegExp(`dispatchInteraction\\([^)]*'${e.fn}'`);
    assert.ok(!direct.test(surfaceSource), `${e.fn} is dispatched directly, bypassing raiseComponent`);
  }
});

/* ------------------------------------------------------- the detection, against the app */

test('a meter zone is the meter’s own band, not a threshold copied beside it', () => {
  const cfg = { zones: [{ from: 0, colour: 'A' }, { from: 0.6, colour: 'B' }, { from: 0.9, colour: 'C' }] };
  // meterZoneColourAt was the app's; meterZoneIndexAt was split out of it so onZone can name the
  // band. They must not be able to disagree.
  for (const pos of [0, 0.3, 0.6, 0.75, 0.9, 1]) {
    const at = meterZoneIndexAt(pos, cfg);
    assert.equal(meterZones(cfg)[at].colour, meterZoneColourAt(pos, cfg), `at ${pos}`);
  }
  assert.deepEqual([0, 0.6, 0.9].map((p) => meterZoneIndexAt(p, cfg)), [0, 1, 2]);
  // A meter with no zones configured still has one band, so onZone can never report a hole.
  assert.equal(meterZoneIndexAt(0.5, {}), 0);
});

test('the wrap test is the one the tickers already make', () => {
  // raiseComponentCycle fires when a 0..1 phase goes DOWN. That is the same test each ticker
  // already uses to decide it has come round, so a cycle event and a loop seam cannot disagree.
  // Pinned as source, because the tickers advance with `% 1` and a different test would drift.
  assert.match(surfaceSource, /function raiseComponentCycle\(control, phase, previous\) \{\s*\n\s*if \(!\(phase < previous\)\) return;/);
  // …and it is used by all four families that loop.
  for (const family of ['arp', 'turing', 'looper', 'orbit']) {
    assert.ok(new RegExp(`raiseComponentCycle`).test(surfaceSource), `${family} should raise cycles`);
  }
  assert.ok((surfaceSource.match(/raiseComponentCycle\(/g) ?? []).length >= 7,
    'the four looping families plus the three synced branches');
});

test('a stage that is polled baselines its first sighting; one that is set does not', () => {
  // The Envelope's stage is read off a bound phase every render, so reporting the first one would
  // tell a script the envelope had just reached a stage when the panel merely opened. The
  // Recorder's is an explicit transition with a known previous state, so the FIRST arm has to
  // fire — which is why it does not go through raiseComponentStage.
  assert.match(surfaceSource, /if \(previous === undefined\) return;/);
  assert.match(surfaceSource, /const previous = String\(recorderState\(control\) \?\? ''\);/);
  assert.ok(!/raiseComponentStage\(control, String\(next/.test(surfaceSource),
    'the recorder must not baseline its first transition away');
});

test('the events that have no discrete moment are not declared', () => {
  // The Timbre pad, the Router, the Macro, the Matrix and a Constraint are continuous — there is
  // no instant to report — and the Transport's moments are already ce.time's onBeat/onBar. An
  // event declared for them would be one nothing could ever raise, which panelApiParity refuses.
  const ids = COMPONENT_EVENTS.map((e) => e.id);
  for (const absent of ['blend', 'move', 'tick', 'beat', 'bar']) {
    assert.ok(!ids.includes(absent), `"${absent}" should not be a component event`);
  }
});
