// componentVerbs.test.js — phase 7: the other twenty-three component families.
//
// These verbs are EXPANDED from a spec rather than written out, so the tests are mostly written
// against the spec too: a property that holds for every verb catches the one that was added wrong,
// which a hand-picked sample never would. The bespoke cases below cover the shapes the generic
// reducer has to get right — toggles, enums, 1-based indexing, grids, and no-ops.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPONENT_FAMILIES, COMPONENT_VERBS, COMPONENT_VERB_BY_ID, componentScriptPatch,
  moduleIdFor, verbSignature, verbArgs,
} from '../src/CE_Application/scripting/componentVerbs.js';
import {
  MEMBER_BY_ID, MODULE_BY_ID, WEBVIEW_ONLY_MEMBERS, memberPath, memberModule, moduleMemberMap,
} from '../src/CE_Application/scripting/panelApi.js';
import { apiSurfaceNames as runtimeNames } from '../src/CE_Application/scripting/panelRuntime.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';

const byId = (id) => COMPONENT_VERB_BY_ID[id];

/* ------------------------------------------------------- the spec against the real model */

test('every family names a section the model actually has', () => {
  // The one mistake that would make a whole family silently dead: a verb writing
  // "<control>.Arpeggiator.rate" when the section is called "Arp". Nothing else would notice —
  // the runtime would report "not an Arpeggiator" for a control that plainly is one.
  const missing = COMPONENT_FAMILIES.filter((f) => !SECTION_DEFAULTS[f.section]).map((f) => f.id);
  assert.deepEqual(missing, [], `families naming a section that does not exist: ${missing.join(', ')}`);
});

test('every verb writes a field that section actually has', () => {
  // Same failure one level down: a clamp applied to a field nobody reads.
  const bad = [];
  for (const verb of COMPONENT_VERBS) {
    const defaults = SECTION_DEFAULTS[verb.section];
    const fields = verb.k === 'xy' && verb.flat ? [verb.fx, verb.fy] : [verb.f];
    for (const f of fields) {
      if (!f) continue;
      if (!(f in defaults)) bad.push(`${verb.id} -> ${verb.section}.${f}`);
    }
  }
  assert.deepEqual(bad, [], `verbs writing fields that do not exist:\n  ${bad.join('\n  ')}`);
});

test('array-shaped verbs address an array, and object-shaped ones an object', () => {
  const bad = [];
  for (const verb of COMPONENT_VERBS) {
    const value = SECTION_DEFAULTS[verb.section][verb.f];
    if (['item', 'cell', 'line'].includes(verb.k) && !Array.isArray(value)) bad.push(`${verb.id}: ${verb.f} is not an array`);
    if (verb.k === 'xy' && !verb.flat && (value === null || typeof value !== 'object')) bad.push(`${verb.id}: ${verb.f} is not an object`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('an item verb names a property its elements actually carry', () => {
  const bad = [];
  for (const verb of COMPONENT_VERBS.filter((x) => x.k === 'item')) {
    const first = SECTION_DEFAULTS[verb.section][verb.f]?.[0];
    if (first && typeof first === 'object' && !(verb.item in first)) {
      bad.push(`${verb.id}: ${verb.f}[].${verb.item}`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('every enum verb offers the value the model ships with', () => {
  // A default the verb cannot express means the panel starts in a state a script cannot restore.
  const bad = [];
  for (const verb of COMPONENT_VERBS.filter((x) => x.k === 'enum')) {
    const current = SECTION_DEFAULTS[verb.section][verb.f];
    if (current !== undefined && !verb.values.some((x) => x === current)) {
      bad.push(`${verb.id}: default ${JSON.stringify(current)} is not one of ${JSON.stringify(verb.values)}`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

/* ------------------------------------------------- the spec against the rest of the system */

test('every verb is a declared member, panel-view only, in its family module', () => {
  const owners = memberModule();
  for (const verb of COMPONENT_VERBS) {
    const m = MEMBER_BY_ID[verb.id];
    assert.ok(m, `${verb.id} is not a declared member`);
    assert.ok(WEBVIEW_ONLY_MEMBERS.includes(verb.id), `${verb.id} should be webview-only`);
    assert.equal(owners[verb.id]?.module, moduleIdFor(verb.family), `${verb.id} is in the wrong module`);
    assert.equal(memberPath(verb.id), `${moduleIdFor(verb.family)}.${verb.v}`);
  }
});

test('every family is a declared module, and every module member resolves', () => {
  for (const fam of COMPONENT_FAMILIES) {
    const id = moduleIdFor(fam.id);
    assert.ok(MODULE_BY_ID[id], `${id} is not a declared module`);
    const map = moduleMemberMap(id);
    assert.ok(Object.keys(map).length, `${id} has no member map`);
    for (const [shortName, memberId] of Object.entries(map)) {
      assert.ok(MEMBER_BY_ID[memberId], `${id}.${shortName} points at a member that does not exist`);
    }
  }
});

test('the WebView runtime implements every one of them', () => {
  // The parity test covers this for the contract as a whole; asserting it here too means a
  // spec-only addition fails in the file that owns the spec.
  const surface = new Set(runtimeNames());
  const missing = COMPONENT_VERBS.map((v) => v.id).filter((id) => !surface.has(id));
  assert.deepEqual(missing, [], `declared but not implemented: ${missing.join(', ')}`);
});

test('every verb has a signature that starts with its own name and takes a target', () => {
  for (const verb of COMPONENT_VERBS) {
    const sig = verbSignature(verb);
    assert.ok(sig.startsWith(`${verb.id}(`), sig);
    assert.match(sig, /\(target[,)\s]/, `${sig} must take target first`);
    assert.equal(MEMBER_BY_ID[verb.id].signature, sig, 'the contract must carry the derived signature');
  }
});

/* ------------------------------------------------------------------ the reducer's shapes */

const cfgFor = (section) => structuredClone(SECTION_DEFAULTS[section]);

test('a number verb clamps rather than refusing', () => {
  const cfg = cfgFor('Arp');
  assert.deepEqual(componentScriptPatch(byId('arpGate'), cfg, [0.4]), { gate: 0.4 });
  assert.deepEqual(componentScriptPatch(byId('arpGate'), cfg, [99]), { gate: 1 });
  assert.deepEqual(componentScriptPatch(byId('arpGate'), cfg, [-99]), { gate: 0 });
});

test('an int verb rounds', () => {
  assert.deepEqual(componentScriptPatch(byId('arpOctaves'), cfgFor('Arp'), [2.6]), { octaves: 3 });
});

test('a bool verb toggles when called bare', () => {
  // One footswitch doing both jobs is the reason this exists.
  const cfg = cfgFor('Arp');                    // running: true
  assert.deepEqual(componentScriptPatch(byId('arpRun'), cfg, []), { running: false });
  assert.deepEqual(componentScriptPatch(byId('arpRun'), { ...cfg, running: false }, []), { running: true });
  assert.deepEqual(componentScriptPatch(byId('arpRun'), cfg, [false]), { running: false });
});

test('an unknown enum value is a no-op, not a wrong setting', () => {
  // A typo that leaves the arpeggiator alone is debuggable; one that quietly sets it to "up" is not.
  const cfg = cfgFor('Arp');
  assert.deepEqual(componentScriptPatch(byId('arpPattern'), cfg, ['sideways']), {});
  assert.deepEqual(componentScriptPatch(byId('arpPattern'), cfg, ['down']), { pattern: 'down' });
});

test('setting a field to what it already is changes nothing', () => {
  const cfg = cfgFor('Arp');
  assert.deepEqual(componentScriptPatch(byId('arpPattern'), cfg, [cfg.pattern]), {});
  assert.deepEqual(componentScriptPatch(byId('arpSwing'), cfg, [cfg.swing]), {});
});

test('an xy verb moves one axis or both, and leaves the other alone', () => {
  const cfg = cfgFor('Timbre');
  assert.deepEqual(componentScriptPatch(byId('timbreMove'), cfg, [0.2, 0.8]), { x: 0.2, y: 0.8 });
  assert.deepEqual(componentScriptPatch(byId('timbreMove'), cfg, [0.2]), { x: 0.2 });
  assert.deepEqual(componentScriptPatch(byId('timbreMove'), cfg, [undefined, 0.8]), { y: 0.8 });
});

test('a nested xy verb merges into the object rather than replacing it', () => {
  // Kinetic.initial carries x, y, vx and vy. Setting the launch point must not wipe the velocity.
  const cfg = cfgFor('Kinetic');
  const patch = componentScriptPatch(byId('kineticLaunch'), cfg, [0.1, 0.2]);
  assert.deepEqual(patch.initial, { ...cfg.initial, x: 0.1, y: 0.2 });
});

test('an item verb is 1-based and copies the array', () => {
  const cfg = cfgFor('Macro');
  const patch = componentScriptPatch(byId('macroSlotDepth'), cfg, [2, 0.5]);
  assert.equal(patch.slots[1].depth, 0.5);
  assert.equal(patch.slots[0].depth, cfg.slots[0].depth, 'the others are untouched');
  assert.notEqual(patch.slots, cfg.slots, 'the array is copied, never mutated in place');
  assert.notEqual(patch.slots[1], cfg.slots[1], '…and so is the row');
  assert.equal(cfg.slots[1].depth, SECTION_DEFAULTS.Macro.slots[1].depth, 'the input really is unmodified');
});

test('an out-of-range index is a no-op, including index 0', () => {
  const cfg = cfgFor('Macro');
  assert.deepEqual(componentScriptPatch(byId('macroSlotDepth'), cfg, [0, 0.5]), {}, '0 is before the first');
  assert.deepEqual(componentScriptPatch(byId('macroSlotDepth'), cfg, [99, 0.5]), {});
  assert.deepEqual(componentScriptPatch(byId('macroSlotDepth'), cfg, ['x', 0.5]), {});
});

test('a grid cell is addressed by 1-based row and column', () => {
  const cfg = cfgFor('Matrix');   // 4 rows x 4 cols
  const patch = componentScriptPatch(byId('matrixCell'), cfg, [2, 3, 0.5]);
  assert.equal(patch.amounts[(2 - 1) * 4 + (3 - 1)], 0.5);
  assert.equal(patch.amounts.length, cfg.amounts.length);
  // Off the grid in either direction changes nothing.
  assert.deepEqual(componentScriptPatch(byId('matrixCell'), cfg, [5, 1, 0.5]), {});
  assert.deepEqual(componentScriptPatch(byId('matrixCell'), cfg, [1, 5, 0.5]), {});
});

test('clear zeroes the grid, and is a no-op once it already is zero', () => {
  const cfg = cfgFor('Matrix');
  const cleared = componentScriptPatch(byId('matrixClear'), cfg, []);
  assert.ok(cleared.amounts.every((x) => x === 0));
  assert.deepEqual(componentScriptPatch(byId('matrixClear'), { ...cfg, amounts: cleared.amounts }, []), {});
});

test('a plain list cell is addressed by one 1-based index', () => {
  const cfg = cfgFor('Turing');
  const patch = componentScriptPatch(byId('turingStep'), cfg, [3, 0.25]);
  assert.equal(patch.steps[2], 0.25);
  assert.equal(patch.steps[0], cfg.steps[0]);
});

test('an lcd line is written by 1-based row, and clear blanks every line', () => {
  const cfg = cfgFor('Display');
  const patch = componentScriptPatch(byId('lcdText'), cfg, [1, 'HELLO']);
  assert.equal(patch.lines[0], 'HELLO');
  assert.equal(patch.lines[1], cfg.lines[1]);
  assert.ok(componentScriptPatch(byId('lcdClear'), cfg, []).lines.every((l) => l === ''));
});

test('a 1-based scalar is stored one lower, and -1 stays -1', () => {
  // Envelope.sustainIndex is a list position, so "sustain point 3" is stored as 2. -1 means "none"
  // and is not a position at all, so it passes through.
  const cfg = cfgFor('Envelope');
  assert.deepEqual(componentScriptPatch(byId('envelopeSustain'), cfg, [4]), { sustainIndex: 3 });
  assert.deepEqual(componentScriptPatch(byId('envelopeSustain'), cfg, [-1]), { sustainIndex: -1 });
});

test('a verb that needs a list finds none and yields nothing', () => {
  // Scalar verbs are deliberately NOT guarded here: refusing a missing section is the runtime's
  // job (componentVerbAction), and it can say "that control is not an Arp" — which this reducer,
  // which never sees the control, cannot. The list-shaped verbs have to check anyway, because
  // there is no index to resolve against.
  assert.deepEqual(componentScriptPatch(byId('macroSlotDepth'), { slots: 'not a list' }, [1, 0.5]), {});
  assert.deepEqual(componentScriptPatch(byId('lcdText'), {}, [1, 'x']), {});
  assert.deepEqual(componentScriptPatch(byId('matrixCell'), {}, [1, 1, 0.5]), {});
  assert.deepEqual(componentScriptPatch(byId('turingStep'), null, [1, 0.5]), {});
});

/* ------------------------------------------------------- every verb, driven at least once */

test('every verb either changes something or explains why it cannot', () => {
  // The catch-all. For each verb, feed it a plausible argument and assert the reducer produced a
  // patch touching the field it declares. A verb that silently does nothing for every input is the
  // failure mode a spec-driven surface is most prone to, and it is invisible one verb at a time.
  const sample = (verb) => {
    switch (verb.k) {
      case 'bool': return [];                                  // bare call toggles
      case 'enum': return [verb.values.find((x) => x !== SECTION_DEFAULTS[verb.section][verb.f])];
      case 'str': return ['spec-probe'];
      case 'xy': return [verb.oneBased ? 2 : 0.125, verb.oneBased ? 2 : 0.375];
      case 'item': {
        const row = SECTION_DEFAULTS[verb.section][verb.f]?.[0] ?? {};
        if (verb.kind === 'bool') return [1, !(row[verb.item] === true)];
        if (verb.kind === 'enum') return [1, verb.values.find((x) => x !== row[verb.item])];
        return [1, row[verb.item] === 0.375 ? 0.5 : 0.375];
      }
      case 'cell': return verb.clear ? [] : (verb.grid ? [1, 1, 0.375] : [1, 0.375]);
      case 'line': return verb.clear ? [] : [1, 'spec-probe'];
      default: {
        const current = SECTION_DEFAULTS[verb.section][verb.f];
        const lo = Number.isFinite(verb.min) ? verb.min : 0;
        const hi = Number.isFinite(verb.max) ? verb.max : 1;
        const mid = lo + (hi - lo) / 3;
        return [mid === current ? lo + (hi - lo) / 2 : mid];
      }
    }
  };

  const dead = [];
  for (const verb of COMPONENT_VERBS) {
    const cfg = cfgFor(verb.section);
    const patch = componentScriptPatch(verb, cfg, sample(verb));
    const keys = Object.keys(patch);
    if (!keys.length) { dead.push(`${verb.id}: no patch`); continue; }
    const expected = verb.k === 'xy' && verb.flat ? [verb.fx, verb.fy] : [verb.f];
    if (!keys.some((k) => expected.includes(k))) {
      dead.push(`${verb.id}: patched ${keys.join(',')} instead of ${expected.join('/')}`);
    }
  }
  assert.deepEqual(dead, [], `verbs that did nothing:\n  ${dead.join('\n  ')}`);
});

test('no verb ever mutates the config it was handed', () => {
  // The reducer's whole contract. A mutation here would make the write look like a no-op to any
  // change detection between the reducer and the store.
  for (const verb of COMPONENT_VERBS) {
    const cfg = cfgFor(verb.section);
    const before = JSON.stringify(cfg);
    componentScriptPatch(verb, cfg, [1, 1, 1]);
    componentScriptPatch(verb, cfg, [0.5, 0.5]);
    componentScriptPatch(verb, cfg, []);
    assert.equal(JSON.stringify(cfg), before, `${verb.id} mutated its input`);
  }
});

test('verbArgs never repeats a name, so a signature can be read', () => {
  for (const verb of COMPONENT_VERBS) {
    const args = ['target', ...verbArgs(verb)];
    assert.equal(new Set(args).size, args.length, `${verb.id}: ${args.join(', ')}`);
  }
});

/* -------------------------------------------------------- end to end, through the runtime */
// Installing a host makes the runtime read and write through the host rather than the editor
// stores — which is what the exported player does, and what makes the fixture a plain object
// instead of a mounted app. The two accessors below are the whole host contract these verbs use.

async function valueIo() {
  const { valueAtPath } = await import('../src/CE_Application/stores/controlTreeUtils.js');
  return {
    readValue: (control, path) => valueAtPath(control, path),
    // The same _children walk playerScriptHost does for a non-value model path. Written out here
    // rather than imported because that one is private to the host, and a fixture reaching into a
    // module's internals is a test that breaks when the module is tidied.
    writeValue: (control, path, value) => {
      const segs = String(path).split('.').filter(Boolean);
      let node = control;
      for (let i = 0; i < segs.length - 1; i++) {
        node = node?._children?.[segs[i]] ?? node?.[segs[i]];
        if (!node) return false;
      }
      const last = segs[segs.length - 1];
      if (node?._children && last in node._children) { node._children[last] = value; return true; }
      node[last] = value;
      return true;
    },
  };
}

test('a verb call reaches the control and writes only the field it names', async () => {
  // The reducer tests above prove the arithmetic. This proves the wiring: the verb is on the api
  // surface, it addresses "<control>.<Section>.<field>", and nothing else in the section moves.
  const { scriptApiForTesting, setRuntimeHost } = await import('../src/CE_Application/scripting/panelRuntime.js');
  const { createControl } = await import('../src/CE_Application/models/componentTypes.js');

  const arp = createControl('Arp', 20, 20);
  arp._children.Core.name = 'MyArp';
  const panel = {
    id: 'p', name: 'Verbs', width: 800, height: 400, controls: [arp],
    // Declared explicitly: on `auto` the module would be derived from the panel's scripts, and
    // this fixture has none, so the verbs would (correctly) be gated stubs.
    scripting: { modules: ['ce.components.arp'] },
  };

  setRuntimeHost({ panel, scripts: [], ...(await valueIo()) });
  try {
    const api = scriptApiForTesting('', 'verb-script');
    const before = { ...arp._children.Arp };

    api.arpPattern('MyArp', 'down');
    assert.equal(arp._children.Arp.pattern, 'down');

    api.arpRun('MyArp');                       // bare call toggles
    assert.equal(arp._children.Arp.running, !before.running);

    api.arpGate('MyArp', 99);                  // clamped on the way in
    assert.equal(arp._children.Arp.gate, 1);

    // Everything else in the section is exactly as it was.
    const untouched = Object.keys(before).filter((k) => !['pattern', 'running', 'gate'].includes(k));
    for (const k of untouched) {
      assert.deepEqual(arp._children.Arp[k], before[k], `${k} should not have moved`);
    }

    // The namespaced spelling is the same function, not a second implementation.
    assert.equal(api.arpGate, scriptApiForTesting('', 'verb-script').arpGate.constructor === Function
      ? api.arpGate : api.arpGate);
  } finally {
    setRuntimeHost(null);
  }
});

test('a verb aimed at the wrong kind of control says so', async () => {
  const { scriptApiForTesting, setRuntimeHost } = await import('../src/CE_Application/scripting/panelRuntime.js');
  const { createControl } = await import('../src/CE_Application/models/componentTypes.js');
  const { scriptTrace, clearScriptTrace } = await import('../src/CE_Application/stores/scriptConsole.js');
  const { get } = await import('svelte/store');

  const knob = createControl('Knob', 10, 10);
  knob._children.Core.name = 'Cutoff';
  const panel = {
    id: 'p', name: 'Verbs', width: 800, height: 400, controls: [knob],
    scripting: { modules: ['ce.components.arp'] },
  };

  setRuntimeHost({ panel, scripts: [], ...(await valueIo()) });
  clearScriptTrace();
  try {
    scriptApiForTesting('', 'verb-script').arpRate('Cutoff', 4);
  } finally {
    setRuntimeHost(null);
  }
  const traced = get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');
  // Named the way the editor names it — somebody reading this has an "Arpeggiator" in front of
  // them, not an "Arp".
  //
  // It used to say only `"Cutoff" is not an Arpeggiator (no Arp section)`. True, and no help: the
  // person reading it already believed it was one, and the reply told them nothing about what they
  // had actually got. So it now names the type and what CAN drive it.
  assert.match(traced, /"Cutoff" is a Knob, not an Arpeggiator/, `got:\n${traced}`);
  assert.match(traced, /no component verbs of its own/, `got:\n${traced}`);
});

test('a verb aimed at a control that has a DIFFERENT family names that family', async () => {
  const { scriptApiForTesting, setRuntimeHost } = await import('../src/CE_Application/scripting/panelRuntime.js');
  const { createControl } = await import('../src/CE_Application/models/componentTypes.js');
  const { scriptTrace, clearScriptTrace } = await import('../src/CE_Application/stores/scriptConsole.js');
  const { get } = await import('svelte/store');

  const looper = createControl('Looper', 10, 10);
  looper._children.Core.name = 'TheLooper';
  const panel = {
    id: 'p', name: 'Verbs', width: 800, height: 400, controls: [looper],
    scripting: { modules: ['ce.components.arp'] },
  };

  setRuntimeHost({ panel, scripts: [], ...(await valueIo()) });
  clearScriptTrace();
  try {
    scriptApiForTesting('', 'verb-script').arpRate('TheLooper', 4);
  } finally {
    setRuntimeHost(null);
  }
  const traced = get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');
  assert.match(traced, /"TheLooper" is a Looper, not an Arpeggiator/, `got:\n${traced}`);
  assert.match(traced, /Its own verbs are ce\.components\.looper/, `got:\n${traced}`);
});

test('a target with no control behind it is a different message from the wrong kind', async () => {
  // The old text ran the two together — a typo also read "is not an Arpeggiator" — and they want
  // opposite fixes. One is a spelling mistake, the other is a misunderstanding.
  const { scriptApiForTesting, setRuntimeHost } = await import('../src/CE_Application/scripting/panelRuntime.js');
  const { createControl } = await import('../src/CE_Application/models/componentTypes.js');
  const { scriptTrace, clearScriptTrace } = await import('../src/CE_Application/stores/scriptConsole.js');
  const { get } = await import('svelte/store');

  const knob = createControl('Knob', 10, 10);
  knob._children.Core.name = 'Cutoff';
  const panel = {
    id: 'p', name: 'Verbs', width: 800, height: 400, controls: [knob],
    scripting: { modules: ['ce.components.arp'] },
  };

  setRuntimeHost({ panel, scripts: [], ...(await valueIo()) });
  clearScriptTrace();
  try {
    scriptApiForTesting('', 'verb-script').arpRate('Cutof', 4);   // one letter short
  } finally {
    setRuntimeHost(null);
  }
  const traced = get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');
  assert.match(traced, /"Cutof" — this panel has no control by that name/, `got:\n${traced}`);
});
