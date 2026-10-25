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
  componentRequestLegal, moduleIdFor, verbSignature, verbArgs, verbArgOptional, itemCurrent, componentRefusalReason, componentClampWarning, familyVerbNamed, familyVerbRefusal, verbExample, verbNotes, verbParamSummary, verbArgKinds } from '../src/CE_Application/scripting/componentVerbs.js';
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

test('an xy verb given an axis that is not a number refuses the call, and moves neither', () => {
  // timbre.move(t, "x", 0.8) moved y and dropped the "x" without a word, and returned true.
  const verb = byId('timbreMove');
  const cfg = cfgFor('Timbre');
  assert.deepEqual(componentScriptPatch(verb, cfg, ['x', 0.8]), {});
  assert.equal(componentRequestLegal(verb, cfg, ['x', 0.8]), false);
  assert.equal(componentRefusalReason(verb, cfg, ['x', 0.8]), '"x" is not a number.');
  assert.equal(componentRefusalReason(verb, cfg, []), 'No number was given.');
  assert.equal(componentRequestLegal(verb, cfg, [undefined, 0.8]), true, 'one left out is still a move');
  assert.deepEqual(verbArgOptional(verb), [true, true]);
  assert.equal(MEMBER_BY_ID.timbreMove.signature, 'timbreMove(target [, x] [, y]) -> boolean');
});

test('the LCD cursor is held to the display, counted from 1, and whole', () => {
  // cursorAt(t, 40, 9) on a 2 x 16 display was stored as it was and drawn nowhere; 2.6 was stored
  // as 2.6, read back as 2.6 and drawn at 3.
  const verb = byId('lcdCursorAt');
  const display = { ...cfgFor('Display'), rows: 2, cols: 16, cursorCol: 0, cursorRow: 0 };
  assert.deepEqual(componentScriptPatch(verb, display, [40, 9]), { cursorCol: 15, cursorRow: 1 });
  assert.deepEqual(componentScriptPatch(verb, { ...display, cols: 20, rows: 4 }, [40, 9]), { cursorCol: 19, cursorRow: 3 });
  assert.deepEqual(componentScriptPatch(verb, display, [2.6, 2]), { cursorCol: 2, cursorRow: 1 });
  assert.deepEqual(componentScriptPatch(verb, display, [0, 1]), {}, '0 is column 1, where it is');
  assert.equal(componentClampWarning(verb, 'Screen', [40, 9], display),
    'lcd Screen: cursorAt(40, 9) — the col 40 is outside 1 to 16, so 16 was used.');
  assert.equal(componentClampWarning(verb, 'Screen', [40, 'x'], display), null, 'a refused call used nothing');
  assert.deepEqual(componentScriptPatch(verb, display, [5, 'x']), {});
  assert.equal(componentRequestLegal(verb, display, [5, 'x']), false);
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

// The five kinds every family gets (§44) address the whole component rather than one field, so
// they have no patch to make and are exercised in scriptComponents.test.js instead.
// …and `link`, which resolves a control NAME against the live panel — something the reducer is
// deliberately blind to. Driven end to end in scriptControlSources.test.js instead.
// …and `layout`, which shows a layout the preview keeps, not the panel (lcdPositions.test.js).
const REDUCERLESS_KINDS = ['read', 'size', 'fill', 'insert', 'remove', 'link', 'layout'];

test('every verb either changes something or explains why it cannot', () => {
  // The catch-all. For each verb, feed it a plausible argument and assert the reducer produced a
  // patch touching the field it declares. A verb that silently does nothing for every input is the
  // failure mode a spec-driven surface is most prone to, and it is invisible one verb at a time.
  // A name-addressed verb needs an element to land on, and a pixel display's scene is EMPTY by
  // default — that is what makes a blank screen blank, and it is the whole reason `elem` exists
  // rather than `item`. So the probe display is given one named element, in the flat list and in a
  // layout, which is also the two places a name resolves across. This is not the assertion being
  // relaxed: the verb still has to produce a patch, and it still has to touch `elements`.
  const PROBE_ELEMENT = {
    id: 'el_probe', name: 'probe', kind: 'static', text: '', label: '',
    x: 0, y: 0, w: 0, h: 0, visible: true, blink: false,
  };
  // An LCD's zones live only on its layouts, so its probe zone is on one.
  const PROBE_ZONE = {
    id: 'z_probe', name: 'probe', row: 1, colStart: 1, colEnd: 8,
    show: 'static', sourceId: '', text: '', label: '', align: 'left', radix: 'dec',
  };
  const probeCfg = (verb) => {
    const cfg = cfgFor(verb.section);
    if (verb.k !== 'elem') return cfg;
    if (verb.list === 'zones') {
      return { ...cfg, layouts: [{ id: 'lay_probe', name: 'Probe', zones: [{ ...PROBE_ZONE }] }] };
    }
    return {
      ...cfg,
      elements: [{ ...PROBE_ELEMENT }],
      layouts: [{ id: 'lay_probe', name: 'Probe', elements: [{ ...PROBE_ELEMENT, id: 'el_probe2' }] }],
    };
  };

  const sample = (verb) => {
    switch (verb.k) {
      case 'bool': return [];                                  // bare call toggles
      case 'enum': return [verb.values.find((x) => x !== SECTION_DEFAULTS[verb.section][verb.f])];
      case 'str': return ['spec-probe'];
      case 'xy': return [verb.oneBased ? 2 : 0.125, verb.oneBased ? 2 : 0.375];
      case 'item': {
        // What element 1 currently ANSWERS, through the verb's own resolver where it has one —
        // a probe that read the stored array directly would compare a sparse list's write against
        // a hole and call a correct no-op a dead verb.
        const current = itemCurrent(verb, cfgFor(verb.section), 0);
        if (verb.kind === 'bool') return [1, !(current === true)];
        if (verb.kind === 'enum') return [1, verb.values.find((x) => x !== current)];
        if (verb.kind === 'str') {
          // A verb that refuses what it cannot use (glyph takes only cells) is fed something it can.
          const [one, two] = verb.refuseValue ? ['#', '.#'] : ['spec-probe', 'spec-probe-2'];
          return [1, current === one ? two : one];
        }
        // A number inside the ITEM's own range rather than a fixed 0.375, which lands on the
        // default of any integer item whose range does not happen to start near it.
        const lo = Number.isFinite(verb.min) ? verb.min : 0;
        const hi = Number.isFinite(verb.max) ? verb.max : 1;
        const step = verb.kind === 'int' ? 1 : (hi - lo) / 3;
        const pick = lo + step;
        return [1, pick === current ? lo + step * 2 : pick];
      }
      case 'elem': {
        // Addressed by NAME, and the element the probe carries answers to "probe".
        if (verb.place) return ['probe', { row: 2, col: [3, 6] }];
        if (verb.kind === 'enum') return ['probe', verb.values.find((x) => x !== PROBE_ZONE[verb.item])];
        if (verb.list === 'zones' && verb.kind === 'bool') return ['probe', false];
        if (verb.kind === 'bool') return ['probe', !(PROBE_ELEMENT[verb.item] === true)];
        if (verb.kind === 'str') return ['probe', 'spec-probe'];
        const lo = Number.isFinite(verb.min) ? verb.min : 0;
        const hi = Number.isFinite(verb.max) ? verb.max : 1;
        const pick = lo + (verb.kind === 'int' ? 1 : (hi - lo) / 3);
        return ['probe', pick === PROBE_ELEMENT[verb.item] ? pick + 1 : pick];
      }
      case 'cell': return verb.clear ? [] : (verb.grid ? [1, 1, 0.375] : [1, 0.375]);
      // An index set is addressed 1-based and toggles with no second argument.
      case 'indexset': return [1];
      case 'line': return verb.clear ? [] : [1, 'spec-probe'];
      default: {
        const current = SECTION_DEFAULTS[verb.section][verb.f];
        const lo = Number.isFinite(verb.min) ? verb.min : 0;
        const hi = Number.isFinite(verb.max) ? verb.max : 1;
        const mid = lo + (hi - lo) / 3;
        // An integer verb rounds what it is given, and a third of a short range (1..3) rounds onto
        // the default — a no-op that says nothing about the verb. Offer whole numbers it can land on.
        if (verb.k === 'int') return [[Math.round(mid), hi, lo].find((n) => n !== Number(current)) ?? hi];
        return [mid === current ? lo + (hi - lo) / 2 : mid];
      }
    }
  };

  const dead = [];
  for (const verb of COMPONENT_VERBS) {
    // read/size/fill/insert/remove are not writes of a declared field, so they never reach this
    // reducer — they are driven end to end against a real control in scriptComponents.test.js,
    // which carries the same catch-all for them.
    if (REDUCERLESS_KINDS.includes(verb.k)) continue;
    const cfg = probeCfg(verb);
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

/* ------------------------------------------------ the scene, addressed by name (proposal 2) */

/** A pixel display with a named element in the flat scene and the same name on a layout. */
const pixelCfg = () => ({
  ...SECTION_DEFAULTS.Pixel,
  elements: [
    { id: 'el_0', name: 'title', kind: 'static', text: 'INIT', visible: true, x: 2, y: 2 },
    { id: 'el_1', name: '', kind: 'vbar', visible: true, x: 40, y: 0 },
  ],
  layouts: [{ id: 'lay_0', name: 'Page 1',
    elements: [{ id: 'el_2', name: 'title', kind: 'static', text: 'INIT', visible: true, x: 2, y: 2 }] }],
});

test('a pixel element is written by name, everywhere that name appears', () => {
  const cfg = pixelCfg();
  const patch = componentScriptPatch(byId('pixelText'), cfg, ['title', 'SATURN VB']);
  assert.equal(patch.elements[0].text, 'SATURN VB');
  assert.equal(patch.layouts[0].elements[0].text, 'SATURN VB', 'the same title on the page too');
  assert.equal(patch.elements[1].kind, 'vbar', 'and nothing else moved');
});

test('an unnamed element is still reachable by its id', () => {
  // Not the addressing anybody should write, but a name is optional and `read` hands ids back, so
  // an id from the document has to resolve or the answer would be unusable.
  const patch = componentScriptPatch(byId('pixelX'), pixelCfg(), ['el_1', 12]);
  assert.equal(patch.elements[1].x, 12);
  assert.equal(patch.elements[0].x, 2);
});

test('a name the display does not have is REFUSED, not silently ignored', () => {
  // This is the whole difference from the index-addressed attempt. "There is no element called
  // tempo" is something the console can print and a script can branch on; an index past the end of
  // an empty array said nothing, and looked exactly like success.
  const cfg = pixelCfg();
  assert.deepEqual(componentScriptPatch(byId('pixelText'), cfg, ['tempo', 'X']), {});
  assert.equal(componentRequestLegal(byId('pixelText'), cfg, ['tempo', 'X']), false);
  // …while a name it does have, already holding that value, is "already that way" — a success.
  assert.deepEqual(componentScriptPatch(byId('pixelText'), cfg, ['title', 'INIT']), {});
  assert.equal(componentRequestLegal(byId('pixelText'), cfg, ['title', 'INIT']), true);
});

test('a bare show toggles from the FIRST match, so two pages do not drift apart', () => {
  // Each element flipping from its own state is the bug: one `show(scr, "title")` with the flat
  // copy visible and the page copy hidden would leave them swapped rather than agreeing.
  const cfg = pixelCfg();
  cfg.layouts[0].elements[0].visible = false;
  const patch = componentScriptPatch(byId('pixelShow'), cfg, ['title']);
  assert.equal(patch.elements[0].visible, false, 'the first match was visible, so it hides');
  assert.deepEqual(Object.keys(patch), ['elements'],
    'and the page copy, already hidden, is not rewritten — they converge rather than swap');
});

test('a pixel display with no elements refuses every scene verb, which is the honest answer', () => {
  const blank = { ...SECTION_DEFAULTS.Pixel };
  for (const id of ['pixelText', 'pixelShow', 'pixelX', 'pixelW']) {
    assert.deepEqual(componentScriptPatch(byId(id), blank, ['title', 1]), {}, id);
    assert.equal(componentRequestLegal(byId(id), blank, ['title', 1]), false, id);
  }
});

test('every published argument agrees with the signature it is published beside', () => {
  // The two were derived separately and disagreed: the signature line showed `[, enabled]` and the
  // descriptor beside it marked the argument required, for every toggling verb in the surface.
  for (const verb of COMPONENT_VERBS) {
    const sig = verbSignature(verb);
    const optional = verbArgOptional(verb);
    verbArgs(verb).forEach((name, i) => {
      const inBrackets = new RegExp(`\\[,\\s*${name}\\b`).test(sig);
      assert.equal(optional[i], inBrackets,
        `${verb.id}: "${name}" is ${optional[i] ? 'optional' : 'required'} but the signature says `
        + `otherwise — ${sig}`);
    });
    // …and the descriptor the editor publishes carries the same answer.
    const params = (MEMBER_BY_ID[verb.id]?.params ?? []).filter((x) => x.name !== 'target');
    params.forEach((param, i) => assert.equal(param.required, !optional[i],
      `${verb.id}: the published "${param.name}" disagrees with ${sig}`));
  }
});

test('an addressed verb types its index or name separately from its value', () => {
  // drumPadsLabel published `index` as a STRING, because the label is a string and both arguments
  // were typed from the verb's one kind. The signature beside it was right, which is how it
  // survived — nothing compares the two, until the test above.
  const params = (id) => Object.fromEntries((MEMBER_BY_ID[id].params ?? []).map((p) => [p.name, p.type]));
  assert.equal(params('drumPadsLabel').index, 'number');
  assert.equal(params('drumPadsLabel').label, 'string');
  assert.equal(params('pixelText').name, 'string');
  assert.equal(params('pixelX').name, 'string');
  assert.equal(params('pixelX').x, 'number');
});

/* ------------------------------------------------------------------------- colours they write */
// Which verbs write a colour is said by the colour fields (scriptColours.colourFieldAt), not by any
// verb's name, and every verb built from the spec writes through one place that reads them by the
// rule set() follows. So a verb added later that reaches a colour field is read the same way.

test('the one verb whose value is a colour is found by the colour fields, not by its name', async () => {
  const { colourFieldAt } = await import('../src/CE_Application/scripting/scriptColours.js');
  const bare = { _children: {} };
  const valueIsColour = (verb) => {
    if (verb.k === 'item' || verb.k === 'elem') return colourFieldAt(bare, `${verb.section}.${verb.f}.0.${verb.item}`);
    return verb.f && ['num', 'int', 'bool', 'str', 'enum'].includes(verb.k) && colourFieldAt(bare, `${verb.section}.${verb.f}`);
  };
  assert.deepEqual(COMPONENT_VERBS.filter(valueIsColour).map((verb) => verb.id), ['drumPadsColour']);
});

test('a verb that rewrites a list of colours reads every colour in it, and names the one it cannot', async () => {
  // meter.zoneAt moves where one zone starts, and writes the zones list whole. A colour stored in it
  // before the rule is written out on the way through; one the panel cannot read refuses the call.
  const { scriptApiForTesting, setRuntimeHost } = await import('../src/CE_Application/scripting/panelRuntime.js');
  const { createControl } = await import('../src/CE_Application/models/componentTypes.js');
  const { scriptTrace, clearScriptTrace } = await import('../src/CE_Application/stores/scriptConsole.js');
  const { get } = await import('svelte/store');

  const meter = createControl('Meter', { name: 'M' });
  meter._children.Meter.zones = [{ from: 0, colour: 'lime' }, { from: 0.8, colour: 'FFFF0000' }];
  const panel = {
    id: 'p', name: 'Verbs', width: 800, height: 400, controls: [meter],
    scripting: { modules: ['ce.components.meter'] },
  };
  setRuntimeHost({ panel, scripts: [], ...(await valueIo()) });
  const lines = () => get(scriptTrace).map((t) => `${t.kind}: ${t.message}`);
  try {
    const api = scriptApiForTesting('', 'verb-script');
    clearScriptTrace();
    assert.equal(api.meterZoneAt('M', 2, 0.7), true);
    assert.deepEqual(meter._children.Meter.zones, [{ from: 0, colour: '#00FF00' }, { from: 0.7, colour: 'FFFF0000' }]);
    assert.deepEqual(lines(), ['log: meter M: zoneAt → zones']);

    meter._children.Meter.zones[1].colour = 'redd';
    clearScriptTrace();
    assert.equal(api.meterZoneAt('M', 1, 0.1), false);
    assert.deepEqual(lines(), ['error: ce.components.meter.zoneAt("M"): in zone 2, "redd" is not a colour the panel '
      + 'can read, so nothing was set. A colour is 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#", '
      + 'or "#RGB", a CSS colour name, rgb() or hsl().']);
    assert.equal(meter._children.Meter.zones[0].from, 0, 'nothing was written');
  } finally {
    setRuntimeHost(null);
  }
});

/* ------------------------------------------- the texts every component verb is described by */

test('every component verb has an example, notes and a text for each parameter, in the form the modules share', () => {
  // The texts are generated from the spec (verbSummary, verbExample, verbNotes, verbParamSummary),
  // with a verb's own doc, ex, notes and argDocs winning: one sentence, an example in code marks,
  // what the call returns, and one rule per line for each parameter.
  for (const verb of COMPONENT_VERBS) {
    const member = MEMBER_BY_ID[verb.id];
    assert.ok(member, `${verb.id} is not a member`);
    assert.match(member.summary, /\.$/, `${verb.id}: "${member.summary}" is not a sentence`);
    // The generated sentences, and the LCD's own: the other families' hand-written docs are the
    // modules still to be done (docs/design/api-descriptions-handoff.md).
    if (!verb.doc || verb.family === 'lcd') {
      assert.match(member.summary, /^[A-Z`][^.]*\.$/, `${verb.id}: "${member.summary}" is not one sentence`);
    }
    assert.match(member.example, /^`ce\.components\.[a-z]+\.[A-Za-z]+\("[^"]+"[^`]*\)` .+\.$/, `${verb.id}: "${member.example}" is not an example`);
    // …and one a script could run: an argument left out leaves no comma behind it.
    assert.doesNotMatch(member.example, /,\s*\)/, `${verb.id}: "${member.example}" has an argument missing`);
    assert.ok(Array.isArray(member.notes) && member.notes.length, `${verb.id} has no notes`);
    assert.ok(member.notes.some((n) => /Returns/.test(n)), `${verb.id}: no note says what it returns`);
    for (const param of member.params) {
      assert.ok(param.summary, `${verb.id}.${param.name} has no text`);
      for (const line of param.summary.split('\n')) {
        assert.match(line, /^(?:[A-Z0-9"`<≤≥]|true|false).*[.]$/, `${verb.id}.${param.name}: "${line}" is not a rule of its own`);
      }
    }
  }
});

test('the LCD\'s verbs say what each setting is, with its range and what is rejected', () => {
  const text = (id, name) => MEMBER_BY_ID[id].params.find((p) => p.name === name).summary;
  assert.equal(MEMBER_BY_ID.lcdBrightness.summary, 'Set the brightness of the lit segments or pixels.');
  assert.equal(text('lcdBrightness', 'brightness'), 'How bright the lit characters are.\nRange: 0 ↔ 100.\n0: the dimmest, still lit.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.');
  // Item 8: no LCD parameter's text is only its name ("Brightness.", "Value prefix."), except
  // valueMin and valueMax, kept as merged at the owner's word (item 5).
  const nameOnly = COMPONENT_VERBS.filter((v) => v.family === 'lcd')
    .flatMap((v) => MEMBER_BY_ID[v.id].params.map((p) => [v, p]))
    .filter(([v, p]) => p.name !== 'target' && !['valueMin', 'valueMax'].includes(v.v)
      && p.summary.split('\n')[0].toLowerCase().replace(/[^a-z]/g, '') === p.name.toLowerCase())
    .map(([v, p]) => `${v.v}.${p.name}`);
  assert.deepEqual(nameOnly, []);
  assert.deepEqual(MEMBER_BY_ID.lcdValue.notes[0], 'While `valueSource()` links a control, that control sets the value and its range.');
  assert.equal(text('lcdEditText', 'editText').split('\n')[1], 'Not held to the field\'s characters or length: those apply to typing.');
  // Item 9: the four overlays say what each is, and a plural takes "they" in every example.
  assert.equal(MEMBER_BY_ID.lcdShowGhost.summary, 'Show or hide the ghost: the faint unlit cells behind the text.');
  assert.equal(MEMBER_BY_ID.lcdShowGrid.summary, 'Show or hide the grid: faint lines between the cells or pixels.');
  assert.equal(MEMBER_BY_ID.lcdShowScanlines.example,
    '`ce.components.lcd.showScanlines("Screen")` shows the scanlines if they are hidden, and hides them if they are shown.');
  assert.equal(MEMBER_BY_ID.drumPadsZones.example,
    '`ce.components.drumpads.zones("DrumPads")` switches the zones on if they are off, and off if they are on.');
  assert.equal(MEMBER_BY_ID.lcdShowGlass.example,
    '`ce.components.lcd.showGlass("Screen")` shows the glass if it is hidden, and hides it if it is shown.');
  // Item 10: read's, size's and fill's texts name the component's own lists.
  assert.equal(MEMBER_BY_ID.lcdRead.notes[0], '`read(target)`: every setting as a table, by verb name. `read(target, "glyph")`: the whole list; `read(target, "glyph", 3)`: one glyph, counted from 1. `read(target, "zoneText")`: every zone\'s, by name; `read(target, "zoneText", "Title")`: one zone\'s.');
  assert.equal(MEMBER_BY_ID.lcdSize.notes[0], '`size(target)`: every list as a table, by verb name; `size(target, "glyph")`: one number.');
  assert.equal(MEMBER_BY_ID.lcdFill.example, '`ce.components.lcd.fill("Screen", "text", {"PATCH 12", "VOL 100"})` writes rows 1 and 2.');
  assert.equal(MEMBER_BY_ID.lcdFill.notes[0], 'One undo step for the whole list, instead of one per element.');
  assert.equal(MEMBER_BY_ID.transportRead.notes[0], '`read(target)`: every setting as a table, by verb name.', 'no lists: no list sentence');
  assert.equal(MEMBER_BY_ID.matrixSize.notes[0], '`size(target)`: every list as a table, by verb name; `size(target, "cell")`: { rows, cols }.');
  // Item 11: a source any control can be says so once, and when it lights the backlight.
  assert.equal(text('lcdBacklightSource', 'name'), 'The driving control\'s name.\nLeft out, or "": unlinked.\nOn while the control is on, or past halfway.\nNot on this panel: rejected with a console error.');
  assert.equal(MEMBER_BY_ID.lcdBacklightSource.example, '`ce.components.lcd.backlightSource("Screen", "Light")` makes the control called Light switch the backlight.');
  assert.match(text('lcdValueSource', 'name'), /Not on this panel, or not a knob, slider or other range control: rejected with a console error\.$/);
  // Item 14: the preset speed takes the inspector's range, 0.1 to 5, on both displays. 0 played at
  // normal speed and 0.02 at 0.05, neither of which the inspector could show.
  for (const id of ['lcdAnimSpeed', 'pixelAnimSpeed']) {
    const speed = COMPONENT_VERBS.find((v) => v.id === id);
    assert.deepEqual(componentScriptPatch(speed, { animSpeed: 1 }, [0]), { animSpeed: 0.1 }, id);
    assert.deepEqual(componentScriptPatch(speed, { animSpeed: 1 }, [8]), { animSpeed: 5 }, id);
    assert.match(componentClampWarning(speed, 'Screen', [8], {}), /is outside 0\.1 to 5, so 5 was used\.$/);
  }
  assert.equal(text('lcdAnimSpeed', 'animSpeed'), 'Speed factor.\nRange: 0.1 ↔ 5.\n1: normal.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.');
  for (const verb of COMPONENT_VERBS.filter((v) => v.k === 'fill')) {
    assert.doesNotMatch(MEMBER_BY_ID[verb.id].example, /, values\)/, `${verb.id}: a list written out`);
  }
  assert.equal(text('lcdScrollRepeat', 'scrollRepeat'), 'Number of times.\nRange: 0 ↔ 999, whole.\n0: forever.\nA fraction: rounded.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.');
  assert.equal(text('lcdScroll', 'scroll'), 'One of "off", "left" or "right". Case-insensitive.\nInvalid: rejected with a console error.');
  assert.equal(text('lcdBacklight', 'backlight'), 'Left out: toggles.\n0, "", "false", "off" or "0": false. Case-insensitive.\nAny other value: true.');
  assert.equal(text('lcdBacklight', 'target'), 'The LCD Display\'s control, by name.\nNot an LCD Display: rejected with a console error.');
  assert.equal(text('lcdCursorAt', 'col'), 'Column, counted from 1.\nRange: 1 ↔ the display\'s columns.\nA fraction: rounded.\nOutside the range: the nearest end.\nLeft out: unchanged.\nInvalid: rejected with a console error.\nBoth left out: rejected with a console error.');
  assert.equal(text('lcdCursorAt', 'row').split('\n')[1], 'Range: 1 ↔ the display\'s rows.');
  assert.equal(MEMBER_BY_ID.lcdCursorAt.params.find((p) => p.name === 'col').required, false);
  assert.equal(MEMBER_BY_ID.lcdCursorAt.notes[0], 'The cursor shows only when `cursor()` is set to "block" or "underline". Default: "off".');
  assert.equal(MEMBER_BY_ID.lcdBacklight.example, '`ce.components.lcd.backlight("Screen")` switches the backlight on if it is off, and off if it is on.');
  assert.equal(MEMBER_BY_ID.lcdShowGlass.example, '`ce.components.lcd.showGlass("Screen")` shows the glass if it is hidden, and hides it if it is shown.');
  assert.equal(MEMBER_BY_ID.lcdValueSource.example, '`ce.components.lcd.valueSource("Screen", "Cutoff")` makes the control called Cutoff drive the value.');
  assert.deepEqual(MEMBER_BY_ID.lcdValuePrefix.notes, ['Returns true. Already set: true, with a console line.', 'Rejected: false, with a console error. Nothing changes.']);
  assert.deepEqual(MEMBER_BY_ID.lcdRead.notes.slice(-2), ['Returns the value.', 'Rejected: no result, with a console error.']);
});

// The owner's review of ce.components.arp, one item at a time (docs/design/api-descriptions-handoff.md).
test('the Arpeggiator\'s verbs say what each setting does, as the owner approved them', () => {
  const text = (id, name) => MEMBER_BY_ID[id].params.find((p) => p.name === name).summary;
  // Item 1: pattern.
  assert.equal(MEMBER_BY_ID.arpPattern.summary, 'Set the order the notes are played in.');
  assert.equal(MEMBER_BY_ID.arpPattern.example, '`ce.components.arp.pattern("Arpeggiator", "updown")` plays the notes low to high, then back down.');
  assert.equal(text('arpPattern', 'pattern'), ['"up": low to high.', '"down": high to low.',
    '"updown": up, then down; the top and bottom notes once.', '"downup": down, then up; the same.',
    '"asPlayed": in the order the notes were pressed. Its own chord: as "up".', '"random": one note at random each step.',
    '"chord": every note at once, each step.', 'Case-insensitive.', 'Invalid: rejected with a console error.'].join('\n'));
  assert.equal(MEMBER_BY_ID.arpPattern.notes[0], 'Default: "up".');
  // Item 2: rate, the inspector's range.
  assert.equal(MEMBER_BY_ID.arpRate.summary, 'Set how many steps a second it plays, while not synced.');
  assert.equal(MEMBER_BY_ID.arpRate.example, '`ce.components.arp.rate("Arpeggiator", 8)` plays eight steps a second.');
  assert.equal(text('arpRate', 'rate'), 'Steps per second.\nRange: 0.1 ↔ 40.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.');
  assert.deepEqual(MEMBER_BY_ID.arpRate.notes.slice(0, 2), ['While synced to the Transport: no effect; `division()` sets the step.', 'Default: 6.']);
  const rate = COMPONENT_VERBS.find((verb) => verb.id === 'arpRate');
  assert.deepEqual([rate.min, rate.max], [0.1, 40]);
  assert.deepEqual(componentScriptPatch(rate, { rate: 6 }, [0.05]), { rate: 0.1 });
  assert.deepEqual(componentScriptPatch(rate, { rate: 6 }, [300]), { rate: 40 });
});

test('a number counted from 1 is rounded, and every such parameter says so', () => {
  // indexOf rounds: row 1.5 is row 2, slot 1.5 is slot 2. The texts said nothing of it.
  const lines = { lines: ['A', 'B'] };
  const text = COMPONENT_VERBS.find((v) => v.id === 'lcdText');
  assert.deepEqual(componentScriptPatch(text, lines, [1.5, 'X']), { lines: ['A', 'X'] });
  assert.deepEqual(componentScriptPatch(text, lines, [1.4, 'X']), { lines: ['X', 'B'] });
  assert.equal(componentRefusalReason(text, lines, [2.5, 'X']), 'There is no row 2.5: the rows are 1 to 2.');
  const glyph = COMPONENT_VERBS.find((v) => v.id === 'lcdGlyph');
  const slots = { glyphs: Array.from({ length: 8 }, () => ({ bits: '' })) };
  assert.equal(componentScriptPatch(glyph, slots, [1.5, '#']).glyphs[1].bits, '#');
  let counted = 0;
  for (const verb of COMPONENT_VERBS) {
    for (const param of MEMBER_BY_ID[verb.id].params) {
      const rules = param.summary.split('\n');
      if (!/counted from 1/.test(rules[0])) continue;
      counted += 1;
      assert.ok(rules.includes('A fraction: rounded.'), `${verb.id}.${param.name}: ${param.summary}`);
    }
  }
  assert.ok(counted > 40, `only ${counted} parameters count from 1`);
  assert.equal(MEMBER_BY_ID.lcdGlyph.params.find((p) => p.name === 'index').summary,
    'Glyph slot.\nRange: 1 ↔ 8.\nA fraction: rounded.\nOutside the range: rejected with a console error.');
});

test('a line\'s text left out is refused, as every text verb\'s is; "" still blanks it', () => {
  // text(t, 1) and text(t, 1, null) blanked the row and returned true.
  const text = COMPONENT_VERBS.find((v) => v.id === 'lcdText');
  const lines = { lines: ['A', 'B'] };
  for (const left of [[1], [1, undefined], [1, null]]) {
    assert.deepEqual(componentScriptPatch(text, lines, left), {});
    assert.equal(componentRequestLegal(text, lines, left), false);
    assert.equal(componentRefusalReason(text, lines, left), 'No text was given.');
  }
  assert.deepEqual(componentScriptPatch(text, lines, [1, '']), { lines: ['', 'B'] });
  assert.deepEqual(componentScriptPatch(text, lines, [2, 42]), { lines: ['A', '42'] });
  assert.match(MEMBER_BY_ID.lcdText.params.find((p) => p.name === 'text').summary, /\nLeft out: rejected with a console error\.$/);
  const at = MEMBER_BY_ID.lcdText.params.find((p) => p.name === 'at').summary.split('\n');
  assert.equal(at[0], 'Row, counted from 1, of the layout showing.');
  assert.ok(at.includes('A fraction: rounded.'));
});

test('the LCD\'s blink rate is the time on, then off, from 60 ms as the display draws it', () => {
  // The text said "Period" and "250 blinks four times a second"; the renderer lights the text for
  // blinkRate ms and darkens it for as long, and draws nothing faster than 60, where 50 was stored.
  const verb = byId('lcdBlinkRate');
  const display = cfgFor('Display');
  assert.deepEqual(componentScriptPatch(verb, display, [55]), { blinkRate: 60 });
  assert.equal(componentClampWarning(verb, 'Screen', [55]), 'lcd Screen: blinkRate(55) — the blinkRate 55 is outside 60 to 5000, so 60 was used.');
  const member = MEMBER_BY_ID.lcdBlinkRate;
  assert.equal(member.summary, 'Set how fast the text blinks.');
  assert.equal(member.example, '`ce.components.lcd.blinkRate("Screen", 250)` shows the text for 250 ms, then hides it for 250 ms: two blinks a second.');
  assert.equal(member.params.find((p) => p.name === 'blinkRate').summary,
    'Time on, then the same time off, in milliseconds.\nRange: 60 ↔ 5000.\nOutside the range: the nearest end.\nInvalid: rejected with a console error.');
  assert.deepEqual(member.notes.slice(0, 2), ['Has an effect only while `blink()` is on. Default: off.', 'The cursor blinks at its own fixed speed.']);
});

test('an on/off verb reads false, off and 0 as off, as words in any case too', () => {
  // Any text but "" was on, so blink(t, "false") and blink(t, "OFF") switched blinking on.
  const verb = byId('lcdBlink');
  const on = { ...cfgFor('Display'), blink: true };
  const off = { ...cfgFor('Display'), blink: false };
  for (const word of [false, 0, '', 'false', 'FALSE', 'False', 'off', 'OFF', ' Off ', '0']) {
    assert.deepEqual(componentScriptPatch(verb, on, [word]), { blink: false }, `${JSON.stringify(word)} is off`);
  }
  for (const word of [true, 1, -1, 'true', 'on', 'ON', 'x', '1']) {
    assert.deepEqual(componentScriptPatch(verb, off, [word]), { blink: true }, `${JSON.stringify(word)} is on`);
  }
  // The set of steps that are on reads its second argument the same way.
  const mute = COMPONENT_VERBS.find((v) => v.k === 'indexset');
  const muted = { ...cfgFor(COMPONENT_FAMILIES.find((f) => f.id === mute.family).section), [mute.f]: [0] };
  assert.deepEqual(componentScriptPatch(mute, muted, [1, 'Off']), { [mute.f]: [] });
  const member = MEMBER_BY_ID.lcdBlink;
  assert.equal(member.summary, 'Switch the text blinking on or off.');
  assert.equal(member.example, '`ce.components.lcd.blink("Screen", true)` makes the text blink.');
  assert.equal(member.params.find((p) => p.name === 'blink').summary,
    'true: the text blinks.\nfalse: the text is steady.\nLeft out: toggles.\n0, "", "false", "off" or "0": false. Case-insensitive.\nAny other value: true.');
  assert.deepEqual(member.notes.slice(0, 2), ['Only the text blinks: the backlight, the unlit segments, the cursor, images and animations stay.',
    'The speed is set by `blinkRate()`. Default: 500 ms on, then 500 ms off.']);
});

test('a word from a list is read in any case, and a preset animation is one of the six it draws', () => {
  // animPreset stored any word and the display drew nothing for one it did not know; every list of
  // words was case-sensitive, so scroll(t, "LEFT") was refused.
  const preset = byId('lcdAnimPreset');
  const display = cfgFor('Display');
  assert.deepEqual(preset.values, ['wave', 'scanner', 'rain', 'starfield', 'spinner', 'plasma']);
  assert.deepEqual(byId('pixelAnimPreset').values, preset.values);
  assert.deepEqual(componentScriptPatch(preset, display, ['PLASMA']), { animPreset: 'plasma' });
  assert.deepEqual(componentScriptPatch(preset, display, [' Starfield ']), { animPreset: 'starfield' });
  for (const bad of ['bogus', 5, undefined]) {
    assert.deepEqual(componentScriptPatch(preset, display, [bad]), {});
    assert.equal(componentRequestLegal(preset, display, [bad]), false, `${JSON.stringify(bad)} is refused`);
  }
  assert.deepEqual(componentScriptPatch(byId('lcdScroll'), display, ['LEFT']), { scroll: 'left' });
  assert.equal(MEMBER_BY_ID.lcdAnimPreset.params.find((p) => p.name === 'animPreset').summary,
    'One of "wave", "scanner", "rain", "starfield", "spinner" or "plasma". Case-insensitive.\nInvalid: rejected with a console error.');
  assert.equal(MEMBER_BY_ID.lcdAnimPreset.notes[0], 'Plays only on a graphic display, while `anim()` is "preset".');
  // …and the verb names read, size, fill, insert and remove take.
  assert.equal(familyVerbNamed('lcd', 'SCROLLSPEED')?.v, 'scrollSpeed');
  assert.equal(familyVerbNamed('lcd', 'toString'), null, 'never one of Object\'s own');
  assert.equal(familyVerbRefusal('lcd', 'size', 'GLYPH'), null);
});

test('text left out is refused, where it was written as ""', () => {
  // valuePrefix(t) and label(t) wrote "" in silence; a required value left out is rejected, as
  // every module's are. Text given, a number included, is still written as text.
  const prefix = COMPONENT_VERBS.find((v) => v.id === 'lcdValuePrefix');
  const cfg = { valuePrefix: 'Vol ' };
  assert.deepEqual(componentScriptPatch(prefix, cfg, [undefined]), {});
  assert.equal(componentRequestLegal(prefix, cfg, [undefined]), false);
  assert.equal(componentRefusalReason(prefix, cfg, [undefined]), 'No text was given.');
  assert.deepEqual(componentScriptPatch(prefix, cfg, ['']), { valuePrefix: '' }, 'an empty text is a text');
  assert.deepEqual(componentScriptPatch(prefix, cfg, [5]), { valuePrefix: '5' });
  const glyph = COMPONENT_VERBS.find((v) => v.id === 'lcdGlyph');
  const display = { glyphs: Array.from({ length: 8 }, () => ({ bits: '' })) };
  assert.equal(componentRequestLegal(glyph, display, [1, undefined]), false);
  assert.equal(componentRefusalReason(glyph, display, [1, undefined]), 'No text was given.');
});

test('glyph refuses what it cannot draw as written, and stores what it can', () => {
  // "abc" was stored and the slot drew nothing; a ninth row or a sixth cell was cut off. Both are
  // rejected with the reason. A short glyph is still drawn as far as it goes, and "" clears.
  const glyph = COMPONENT_VERBS.find((v) => v.id === 'lcdGlyph');
  const display = { glyphs: Array.from({ length: 8 }, () => ({ bits: '#####' })) };
  for (const [bits, why] of [
    ['abc', '"a", "b", "c" are not cells of a glyph: "#" or "1" is lit, "." or "0" unlit, and "|" ends a row.'],
    ['#|#|#|#|#|#|#|#|#', 'It has 9 rows, and a glyph has 8.'],
    ['######|#', 'Row 1 has 6 cells, and a row has 5.'],
  ]) {
    assert.deepEqual(componentScriptPatch(glyph, display, [1, bits]), {}, bits);
    assert.equal(componentRequestLegal(glyph, display, [1, bits]), false, bits);
    assert.equal(componentRefusalReason(glyph, display, [1, bits]), why);
  }
  for (const bits of ['#|#|#', '']) {
    assert.equal(componentScriptPatch(glyph, display, [1, bits]).glyphs[0].bits, bits);
    assert.equal(componentRequestLegal(glyph, display, [1, bits]), true);
    assert.equal(componentRefusalReason(glyph, display, [1, bits]), null);
  }
});
