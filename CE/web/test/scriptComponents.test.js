// scriptComponents.test.js — ce.components: reading one, and hearing back from it (design doc §44).
//
// The module was 229 members and every one of them was a WRITE that returned `undefined`. Three
// consequences, and this file pins the fix for each:
//
//  1. A script could set the arpeggiator's pattern and could not ask what it was, so "next pattern"
//     needed a shadow copy in `state` — which desyncs the moment somebody touches the control.
//  2. Success, "already that way", an unknown value, an index past the end of a list and a control
//     of the wrong type were all the same answer: nothing.
//  3. An `item` verb could edit element N of a list, nothing said how many there were, and nothing
//     could add or remove one — the canvas could grow these lists and a script could not.
//
// componentEnums.test.js covers the other half of the phase (the values a verb may offer). This one
// is behaviour, driven against real controls built by the app's own createControl.

import test from 'node:test';
import assert from 'node:assert/strict';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import {
  COMPONENT_FAMILIES, COMPONENT_VERBS, LIST_KINDS,
} from '../src/CE_Application/scripting/componentVerbs.js';
import { MEMBER_BY_ID, memberPath } from '../src/CE_Application/scripting/panelApi.js';
import {
  componentListWithElement, componentListWithoutElement, uniqueElementId,
} from '../src/CE_Application/utils/componentElements.js';
import { envelopePointAdded, envelopePointRemoved } from '../src/CE_Application/utils/envelopeLayout.js';
import { toggleMute } from '../src/CE_Application/utils/arpLayout.js';

/** The component type each family drives, so a test can build one. */
const TYPE_FOR_SECTION = {
  Arp: 'Arp', ChordPad: 'ChordPad', NoteRibbon: 'NoteRibbon', DrumPads: 'DrumPads',
  Turing: 'Turing', Looper: 'Looper', Orbit: 'Orbit', Kinetic: 'Kinetic',
  Constellation: 'Constellation', Timbre: 'Timbre', Router: 'Router', Macro: 'Macro',
  Matrix: 'Matrix', Constraint: 'Constraint', Envelope: 'Envelope', Ribbon: 'Ribbon',
  Crossfader: 'Crossfader', Joystick: 'VectorJoystick', Meter: 'Meter', Transport: 'Transport',
  Panic: 'Panic', Display: 'LcdDisplay', Pixel: 'PixelDisplay',
};

/** A panel carrying one control per family, and an api with every component module declared. */
function withEveryComponent(fn) {
  const controls = COMPONENT_FAMILIES.map((fam) =>
    createControl(TYPE_FOR_SECTION[fam.section], { name: fam.id }));
  panels.set([{
    id: 'p', name: 'P', controls,
    scripting: { modules: ['ce.core', ...COMPONENT_FAMILIES.map((f) => `ce.components.${f.id}`)] },
  }]);
  activePanelId.set('p');
  try { return fn(scriptApiForTesting('', 'component-script'), controls); } finally {
    panels.set([]);
  }
}

const verbId = (family, name) =>
  COMPONENT_VERBS.find((v) => v.family === family && v.v === name)?.id;

/* ------------------------------------------------------------------------ the contract */

test('every family gained a read, and the list families the other four', () => {
  for (const fam of COMPONENT_FAMILIES) {
    const read = verbId(fam.id, 'read');
    assert.ok(read, `${fam.id} has no read`);
    assert.equal(memberPath(read), `ce.components.${fam.id}.read`);
    assert.ok(MEMBER_BY_ID[read], `${read} is not declared`);

    const hasList = fam.verbs.some((v) => LIST_KINDS.includes(v.k) && !v.clear);
    for (const name of ['size', 'fill']) {
      assert.equal(Boolean(verbId(fam.id, name)), hasList,
        `${fam.id}.${name} should exist iff the family has a list`);
    }
    // insert/remove need an element TEMPLATE, so they only apply to `item` lists. A `cell` or
    // `line` list is fixed-length and sized by a verb of its own — and an `item` list can be in
    // that position too and say so with `fixed`: the Drum Pads' overrides are sized by rows x cols.
    const growable = fam.verbs.some((v) => v.k === 'item' && !v.fixed);
    for (const name of ['insert', 'remove']) {
      assert.equal(Boolean(verbId(fam.id, name)), growable,
        `${fam.id}.${name} should exist iff the family has an item list`);
    }
  }
});

test('the five hand-written families gained a read too', () => {
  for (const [id, path] of [
    ['splitRead', 'ce.components.split.read'], ['phraseRead', 'ce.components.phrase.read'],
    ['recorderRead', 'ce.components.recorder.read'], ['harmonyRead', 'ce.components.harmony.read'],
    ['setlistRead', 'ce.components.setlist.read'],
  ]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
  }
});

/* ------------------------------------------------------------------ what a verb reports */

test('a verb says whether the component now holds what was asked', () => {
  withEveryComponent((api) => {
    assert.equal(api.arpPattern('arp', 'downup'), true, 'written');
    assert.equal(api.arpPattern('arp', 'downup'), true, 'already that way is still success');
    assert.equal(api.arpPattern('arp', 'converge'), false, 'a pattern the component does not have');
    assert.equal(api.arpRead('arp', 'pattern'), 'downup', '…and it did not write it');
    assert.equal(api.arpPattern('arp', 'chord'), true, 'one it does have, and used to refuse');
  });
});

test('"already that way" is success, which is the distinction the return value exists for', () => {
  withEveryComponent((api) => {
    // The failure this prevents: `if not verb(...) then warn() end` firing because the component
    // was already correct. A clamp that lands on the current value is the same case.
    api.arpOctaves('arp', 6);
    assert.equal(api.arpOctaves('arp', 6), true);
    assert.equal(api.arpOctaves('arp', 99), true, 'clamped to 6, which it already was');
    assert.equal(api.arpOctaves('arp', 'banana'), false, 'not a number at all');
  });
});

test('an index past the end of a list is refused, not silently ignored', () => {
  withEveryComponent((api) => {
    const nodes = api.orbitSize('orbit', 'node');
    assert.ok(nodes > 0);
    assert.equal(api.orbitNode('orbit', nodes, false), true);
    assert.equal(api.orbitNode('orbit', nodes + 1, false), false);
    assert.equal(api.orbitNode('orbit', 0, false), false, '0 is not an index; these are 1-based');
  });
});

test('a target of the wrong type, or no target at all, is refused', () => {
  withEveryComponent((api) => {
    assert.equal(api.arpPattern('orbit', 'up'), false);
    assert.equal(api.arpPattern('nothing-here', 'up'), false);
    assert.equal(api.arpRead('orbit'), undefined);
  });
});

test('the five hand-written families report the same three outcomes', () => {
  withEveryComponent((api, controls) => {
    const set = createControl('Setlist', { name: 'set' });
    const harm = createControl('Harmoniser', { name: 'harm' });
    panels.update((all) => { all[0].controls = [...controls, set, harm]; return all; });
    panels.update((all) => {
      all[0].scripting.modules.push('ce.components.setlist', 'ce.components.harmony');
      return all;
    });
    const a = scriptApiForTesting('', 'component-script');
    assert.equal(a.setlistWrap('set', true), true);
    assert.equal(a.setlistWrap('set', true), true, 'already that way');
    assert.equal(a.setlistGoto('set', 'no-such-scene'), false);
    assert.equal(a.harmonyOutOfKey('harm', 'mute'), true, 'a value the engine has');
    assert.equal(a.harmonyOutOfKey('harm', 'skip'), false, 'the value the docs used to name');
  });
});

/* ------------------------------------------------------------------------ read */

test('read gives back what the verbs set, by the names the verbs use', () => {
  withEveryComponent((api) => {
    api.arpSync('arp', true);
    api.arpDivision('arp', '1/8D');
    // `sync`, not `syncToTransport`: the read is in the writers' vocabulary, which is the whole
    // reason it is not just ce.core.get on the section.
    assert.equal(api.arpRead('arp', 'sync'), true);
    assert.equal(api.arpRead('arp', 'division'), '1/8D');
    const all = api.arpRead('arp');
    assert.equal(all.sync, true);
    assert.equal(all.division, '1/8D');
    assert.equal(all.syncToTransport, undefined, 'the model field name is not the verb name');
  });
});

test('read of an indexed verb is the whole list, and of one element is one value', () => {
  withEveryComponent((api) => {
    const radii = api.orbitRead('orbit', 'nodeRadius');
    assert.ok(Array.isArray(radii) && radii.length > 1);
    assert.equal(api.orbitRead('orbit', 'nodeRadius', 1), radii[0], '1-based, as everywhere else');
    assert.equal(api.orbitRead('orbit', 'nodeRadius', 0), undefined);
    assert.equal(api.orbitRead('orbit', 'nodeRadius', radii.length + 1), undefined);
  });
});

test('read undoes the one-lower storage of a 1-based verb', () => {
  withEveryComponent((api) => {
    // `sustain` is written 1-based and stored one lower. A read that handed back the stored number
    // would be a different number from the one the script wrote.
    api.envelopeSustain('envelope', 3);
    assert.equal(api.envelopeRead('envelope', 'sustain'), 3);
  });
});

test('read of an xy verb answers under the names it takes', () => {
  withEveryComponent((api) => {
    api.joystickMove('joystick', 0.25, 0.75);
    assert.deepEqual(api.joystickRead('joystick', 'move'), { x: 0.25, y: 0.75 });
  });
});

test('a grid reads back as rows of columns, the shape it is addressed in', () => {
  withEveryComponent((api) => {
    api.matrixClear('matrix');
    api.matrixCell('matrix', 2, 3, 0.5);
    const grid = api.matrixRead('matrix', 'cell');
    const { rows, cols } = api.matrixSize('matrix', 'cell');
    assert.equal(grid.length, rows);
    assert.equal(grid[0].length, cols);
    assert.equal(grid[1][2], 0.5);
    assert.equal(api.matrixRead('matrix', 'cell', 2, 3), 0.5);
  });
});

test('read names the verbs it knows when given one it does not', () => {
  withEveryComponent((api) => {
    assert.equal(api.arpRead('arp', 'syncToTransport'), undefined,
      'the model field name is deliberately not accepted — that would be two vocabularies');
  });
});

/* ------------------------------------------------------------------------ size */

test('size answers how many elements an indexed verb can address', () => {
  withEveryComponent((api) => {
    const all = api.orbitSize('orbit');
    assert.equal(typeof all.node, 'number');
    assert.equal(api.orbitSize('orbit', 'node'), all.node);
    assert.equal(api.orbitRead('orbit', 'nodeRadius').length, all.node);
    assert.equal(api.orbitSize('orbit', 'rate'), undefined, 'rate does not address a list');
  });
});

test('a grid answers with its shape, because a crosspoint takes two indices', () => {
  withEveryComponent((api) => {
    const size = api.matrixSize('matrix', 'cell');
    assert.equal(typeof size.rows, 'number');
    assert.equal(typeof size.cols, 'number');
  });
});

/* ------------------------------------------------------------------------ fill */

test('fill writes a whole list in one call', () => {
  withEveryComponent((api) => {
    const n = api.turingSize('turing', 'step');
    const wanted = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 0 : 1));
    assert.equal(api.turingFill('turing', 'step', wanted), true);
    assert.deepEqual(api.turingRead('turing', 'step'), wanted);
  });
});

test('fill writes a partial list from the front, leaving the rest alone', () => {
  withEveryComponent((api) => {
    const before = api.turingRead('turing', 'step');
    assert.equal(api.turingFill('turing', 'step', [0.125, 0.25]), true);
    const after = api.turingRead('turing', 'step');
    assert.deepEqual(after.slice(0, 2), [0.125, 0.25]);
    assert.deepEqual(after.slice(2), before.slice(2));
  });
});

test('fill refuses a list longer than the component has, rather than truncating', () => {
  withEveryComponent((api) => {
    const n = api.turingSize('turing', 'step');
    const before = api.turingRead('turing', 'step');
    // Silently dropping half a pattern is worse than not writing it, and size() is right there.
    assert.equal(api.turingFill('turing', 'step', new Array(n + 1).fill(0)), false);
    assert.deepEqual(api.turingRead('turing', 'step'), before);
  });
});

test('fill of a grid honours the shape of what it was given', () => {
  withEveryComponent((api) => {
    api.matrixClear('matrix');
    // The bug this pins: flattening first put a short second row inside the first one, so a 2x2
    // fill landed as four cells along the top.
    assert.equal(api.matrixFill('matrix', 'cell', [[0.5, 0.25], [1, -1]]), true);
    const grid = api.matrixRead('matrix', 'cell');
    assert.deepEqual(grid[0].slice(0, 2), [0.5, 0.25]);
    assert.deepEqual(grid[1].slice(0, 2), [1, -1]);
    const { rows, cols } = api.matrixSize('matrix', 'cell');
    assert.equal(api.matrixFill('matrix', 'cell', new Array(rows + 1).fill([0])), false);
    assert.equal(api.matrixFill('matrix', 'cell', [new Array(cols + 1).fill(0)]), false);
  });
});

test('fill clamps and refuses each element exactly as one call would', () => {
  withEveryComponent((api) => {
    // Same reducer, so a value written in bulk cannot land somewhere a single write could not.
    api.turingFill('turing', 'step', [-5, 5]);
    assert.deepEqual(api.turingRead('turing', 'step').slice(0, 2), [0, 1]);
  });
});

test('fill needs a list, and a name that addresses one', () => {
  withEveryComponent((api) => {
    assert.equal(api.turingFill('turing', 'step', 0.5), false);
    assert.equal(api.turingFill('turing', 'rate', [1]), false);
  });
});

/* ------------------------------------------------------------- insert and remove */

test('insert adds the element the canvas adds', () => {
  withEveryComponent((api) => {
    // Through the api, not through the control object the panel was built from: setValue writes a
    // new tree, so a snapshot taken before the insert is not what the document now holds.
    const before = api.get('orbit.Orbit.nodes');
    assert.equal(api.orbitInsert('orbit', 'node'), true);
    const after = api.get('orbit.Orbit.nodes');
    assert.equal(after.length, before.length + 1);
    // Against the app's own template, imported — not against a number copied out of it.
    const expected = componentListWithElement('Orbit', 'nodes', before, { nodes: before });
    assert.deepEqual(after.at(-1), expected.at(-1));
  });
});

test('insert can place an element before a 1-based index', () => {
  withEveryComponent((api) => {
    const before = api.orbitRead('orbit', 'nodeRadius');
    assert.equal(api.orbitInsert('orbit', 'node', 1), true);
    const after = api.orbitRead('orbit', 'nodeRadius');
    assert.equal(after.length, before.length + 1);
    assert.deepEqual(after.slice(1), before);
  });
});

test('remove takes the last when no index is given, and refuses one that is not there', () => {
  withEveryComponent((api) => {
    const before = api.orbitRead('orbit', 'nodeRadius');
    assert.equal(api.orbitRemove('orbit', 'node'), true);
    assert.deepEqual(api.orbitRead('orbit', 'nodeRadius'), before.slice(0, -1));
    assert.equal(api.orbitRemove('orbit', 'node', 99), false);
    assert.equal(api.orbitRemove('orbit', 'node', 0), false);
  });
});

test('the envelope keeps its endpoints, and its new point lands where the canvas puts it', () => {
  withEveryComponent((api, controls) => {
    const cfg = controls.find((c) => c._children?.Core?.name === 'envelope')._children.Envelope;
    const before = cfg.points.map((p) => p.x);
    assert.equal(api.envelopeInsert('envelope', 'pointX'), true);
    // The widest-gap placement, from the envelope's own function rather than a number copied here.
    assert.deepEqual(api.envelopeRead('envelope', 'pointX'),
      envelopePointAdded(before.map((x, i) => ({ id: `e${i}`, x, y: 0, curve: 'linear' }))).map((p) => p.x));

    const n = api.envelopeSize('envelope', 'pointX');
    assert.equal(api.envelopeRemove('envelope', 'pointX', 1), false, 'the first point is fixed');
    assert.equal(api.envelopeRemove('envelope', 'pointX', n), false, 'and so is the last');
    assert.equal(api.envelopeRemove('envelope', 'pointX', 2), true);
    assert.equal(api.envelopeSize('envelope', 'pointX'), n - 1);
  });
});

test('a list with no template cannot be grown, and says so', () => {
  withEveryComponent((api) => {
    // The Turing's step count is its `length` verb and the LCD's row count is the display's rows,
    // so growing either from here would fight the verb that owns it. Neither has an insert at all.
    assert.equal(api.turingInsert, undefined);
    assert.equal(api.lcdInsert, undefined);
  });
});

test('element ids are the lowest unused number, not a timestamp', () => {
  // They were `${prefix}${Date.now()}`, which collides when two are added inside a millisecond —
  // reachable from a script in a way it never was from a mouse.
  assert.equal(uniqueElementId('n', []), 'n0');
  assert.equal(uniqueElementId('n', [{ id: 'n0' }, { id: 'n1' }]), 'n2');
  assert.equal(uniqueElementId('n', [{ id: 'n1' }]), 'n0', 'the LOWEST unused, not the next');
  const grown = componentListWithElement('Orbit', 'nodes', [], {});
  const twice = componentListWithElement('Orbit', 'nodes', grown, {});
  assert.notEqual(twice[0].id, twice[1].id);
});

test('a list this build does not know how to grow yields nothing rather than a wrong element', () => {
  assert.equal(componentListWithElement('Arp', 'mutes', [], {}), null);
  assert.equal(componentListWithoutElement('Arp', 'mutes', [1], 0), null);
});

/* ------------------------------------------------- the fields the phase-7 spec skipped */

test('phase reaches the Arpeggiator and the Turing, as it already did the Orbit', () => {
  withEveryComponent((api) => {
    for (const [family, verb] of [['arp', 'arpPhase'], ['turing', 'turingPhase'],
                                  ['looper', 'looperPhase'], ['orbit', 'orbitPhase']]) {
      assert.equal(api[verb](family, 0.25), true, `${verb} should write`);
      assert.equal(api[`${family}Read`](family, 'phase'), 0.25);
    }
  });
});

test('the arp’s per-step mutes agree with the grid’s own toggle', () => {
  withEveryComponent((api, controls) => {
    for (const step of [3, 5, 3]) {
      // The app's function, imported — the muted steps are a SET of indices, not a boolean per
      // step, so a script writing one and a click on the grid have to agree about the shape. Fed
      // the CURRENT mutes each time, because the third call toggles step 3 back off.
      const expected = toggleMute({ _children: { Arp: { mutes: api.arpRead('arp', 'mute') } } }, step - 1);
      assert.equal(api.arpMute('arp', step), true);
      assert.deepEqual(api.arpRead('arp', 'mute'), expected);
    }
    assert.equal(api.arpMute('arp', 2, true), true);
    assert.equal(api.arpMute('arp', 2, true), true, 'already muted is still success');
    assert.equal(api.arpMute('arp', 2, false), true);
    assert.equal(api.arpMute('arp', 0), false, '0 is not a step; these are 1-based');
  });
});

test('the meter’s own range is reachable, so `value` means something a script chose', () => {
  withEveryComponent((api) => {
    assert.equal(api.meterValueMin('meter', -60), true);
    assert.equal(api.meterValueMax('meter', 6), true);
    assert.equal(api.meterRead('meter', 'valueMin'), -60);
    assert.equal(api.meterRead('meter', 'valueMax'), 6);
  });
});

test('the arp listens where a script tells it to', () => {
  withEveryComponent((api) => {
    assert.equal(api.arpInputChannel('arp', 0), true, '0 is omni, not an absent value');
    assert.equal(api.arpSource('arp', 'input'), true);
    assert.equal(api.arpSource('arp', 'nonsense'), false);
    assert.equal(api.arpBaseOctave('arp', -1), true);
  });
});

/* --------------------------------------------------- the catch-all, for the new kinds */

test('every read, size, fill, insert and remove answers on a real control', () => {
  // The sibling of componentVerbs.test.js's catch-all, which covers the kinds that go through the
  // reducer. A verb that silently does nothing for every input is the failure mode a spec-driven
  // surface is most prone to, and it is invisible one verb at a time.
  withEveryComponent((api) => {
    const dead = [];
    for (const fam of COMPONENT_FAMILIES) {
      const list = fam.verbs.find((v) => LIST_KINDS.includes(v.k) && !v.clear);
      const item = fam.verbs.find((v) => v.k === 'item' && !v.fixed);

      const read = api[verbId(fam.id, 'read')](fam.id);
      if (!read || typeof read !== 'object' || !Object.keys(read).length) {
        dead.push(`${fam.id}.read: nothing back`);
      }
      if (!list) continue;

      const size = api[verbId(fam.id, 'size')](fam.id, list.v);
      if (size === undefined) dead.push(`${fam.id}.size("${list.v}"): nothing back`);

      const current = api[verbId(fam.id, 'read')](fam.id, list.v);
      if (!Array.isArray(current)) dead.push(`${fam.id}.read("${list.v}"): not a list`);
      else if (api[verbId(fam.id, 'fill')](fam.id, list.v, current) !== true) {
        dead.push(`${fam.id}.fill("${list.v}"): refused its own contents`);
      }
      if (!item) continue;

      const before = api[verbId(fam.id, 'size')](fam.id, item.v);
      if (api[verbId(fam.id, 'insert')](fam.id, item.v) !== true) {
        dead.push(`${fam.id}.insert("${item.v}"): refused`);
      } else if (api[verbId(fam.id, 'size')](fam.id, item.v) !== before + 1) {
        dead.push(`${fam.id}.insert("${item.v}"): did not grow`);
      }
      // A middle element: the Envelope's endpoints are deliberately not removable, so removing
      // "the last" is refused there by design and would not be testing anything.
      const n = api[verbId(fam.id, 'size')](fam.id, item.v);
      const at = n >= 3 ? 2 : n;
      if (api[verbId(fam.id, 'remove')](fam.id, item.v, at) !== true) {
        dead.push(`${fam.id}.remove("${item.v}", ${at}): refused`);
      }
    }
    assert.deepEqual(dead, [], `verbs that did nothing:\n  ${dead.join('\n  ')}`);
  });
});
