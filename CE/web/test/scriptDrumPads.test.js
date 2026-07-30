// scriptDrumPads.test.js — the Drum Pads module, which described eight of a component's fields.
//
// `ce.components.drumpads` had verbs for map, baseNote, mode, gate, velocity, channel, rows and
// cols. The section has twenty-three fields, and the fifteen it did not name were not dead code —
// every one is read by the renderer or the preview surface. Two of them are what makes a drum grid
// a drum grid rather than a grid of buttons:
//
//   pads    the per-pad overrides. Sparse, index-aligned with rows x cols, and empty by default:
//           a pad with no entry takes its note, name and choke group from the generated map. So
//           CHOKE GROUPS — the open hat a closed hat cuts — were reachable from the inspector and
//           from nothing else, and `set()` could only reach them by hand-building the whole array,
//           which means reimplementing drumPads() in script to find out what is already there.
//   origin  which corner pad 1 sits in. `map` and `baseNote` were verbs and this was not, so a
//           script could re-map the grid and could not say how the grid is numbered.
//
// The tests below are behaviour against real controls, and everything they assert about what a pad
// PLAYS is asserted through the component's own resolver rather than against typed-out notes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import { COMPONENT_FAMILIES } from '../src/CE_Application/scripting/componentVerbs.js';
import { VERB_VALUES } from '../src/CE_Application/scripting/componentTables.js';
import {
  drumPads, drumPadCount, resolveDrumPads, padCell, strikeVelocity,
  PAD_ORIGINS, PAD_VELOCITY_SOURCES, GM_CHOKE,
} from '../src/CE_Application/utils/drumPadLayout.js';

const FAMILY = COMPONENT_FAMILIES.find((f) => f.id === 'drumpads');

function withKit(fn) {
  const kit = createControl('DrumPads', { name: 'Kit' });
  panels.set([{
    id: 'p', name: 'P', controls: [kit],
    scripting: { modules: ['ce.core', 'ce.components.drumpads'] },
  }]);
  activePanelId.set('p');
  try {
    const api = scriptApiForTesting('', 'drum-script');
    // The live control, re-read from the store each time: the verbs write through the panel store,
    // so a captured reference would be the version from before the write.
    const live = () => get(panels)[0].controls[0];
    return fn(api.ce.components.drumpads, live);
  } finally { panels.set([]); }
}

/* ------------------------------------------------------------------ what the module covers */

test('every field of the section has a verb, bar the styling the module deliberately leaves out', () => {
  // Asserted against the model rather than a list copied into the test, so a field added to
  // DrumPads later shows up here as a decision to make rather than as nothing at all.
  const written = new Set(FAMILY.verbs.map((v) => v.f).filter(Boolean));
  // The section's own colours. componentVerbs.js states the line at the top of the file — a verb
  // earns its place by being worth driving mid-song — and no family of the twenty-three exposes
  // styling. They stay reachable by set(), which addresses any model path.
  const styling = ['fieldColour', 'padColour', 'accentColour', 'hitColour', 'labelColour', 'echoColour'];
  const fields = Object.keys(SECTION_DEFAULTS.DrumPads).filter((k) => !k.startsWith('_'));

  assert.deepEqual(
    fields.filter((f) => !written.has(f) && !styling.includes(f)), [],
    'a DrumPads field with no verb and no reason to have none',
  );
  // …and the exclusion list has to stay honest too: a name left here after the field went away
  // would quietly excuse the next real gap.
  assert.deepEqual(styling.filter((f) => !fields.includes(f)), []);
});

test('the two new enums offer exactly what the layout code accepts', () => {
  assert.equal(VERB_VALUES['drumpads.origin'], PAD_ORIGINS);
  assert.equal(VERB_VALUES['drumpads.velocityFrom'], PAD_VELOCITY_SOURCES);

  // And the tables are the switch, not a copy of it: padCell must lay the grid out differently for
  // each origin it offers, and identically for anything it does not.
  const laid = PAD_ORIGINS.map((o) => JSON.stringify(padCell(0, 4, 4, o)));
  assert.equal(new Set(laid).size, PAD_ORIGINS.length, 'two origins that place pad 1 in the same cell');
  assert.deepEqual(padCell(0, 4, 4, 'sideways'), padCell(0, 4, 4, 'bottomLeft'), 'an unknown origin must fall back');

  const kit = createControl('DrumPads', { name: 'K' });
  kit._children.DrumPads.velocityFrom = 'position';
  assert.notEqual(strikeVelocity(kit, 1), strikeVelocity(kit, 0), '"position" must read the strike');
  kit._children.DrumPads.velocityFrom = 'fixed';
  assert.equal(strikeVelocity(kit, 1), strikeVelocity(kit, 0), '"fixed" must not');
});

/* ------------------------------------------------------------------------- the new scalars */

test('the scalars the module skipped now set, toggle and read back', () => {
  withKit((d, live) => {
    assert.equal(d.origin('Kit', 'topLeft'), true);
    assert.equal(d.velocityFrom('Kit', 'position'), true);
    assert.equal(d.echoChannel('Kit', 10), true);
    // A bare boolean toggles, which is what lets one footswitch do both jobs.
    assert.equal(d.echo('Kit'), true);
    assert.equal(d.editable('Kit'), true);
    assert.equal(d.showHeader('Kit'), true);

    const cfg = live()._children.DrumPads;
    assert.equal(cfg.origin, 'topLeft');
    assert.equal(cfg.velocityFrom, 'position');
    assert.equal(cfg.echoChannel, 10);
    assert.equal(cfg.echo, true, 'echo defaults false, so a bare call turns it on');
    assert.equal(cfg.editable, false, 'editable defaults true, so a bare call turns it off');
    assert.equal(cfg.showHeader, false);

    const read = d.read('Kit');
    assert.equal(read.origin, 'topLeft');
    assert.equal(read.echo, true);
    assert.equal(read.showLabels, true, 'read must report the ones nothing touched too');
  });
});

test('an origin the component does not have is a no-op, not a wrong setting', () => {
  withKit((d, live) => {
    assert.equal(d.origin('Kit', 'northWest'), false);
    assert.equal(live()._children.DrumPads.origin, 'bottomLeft');
  });
});

/* ---------------------------------------------------------------------- the per-pad verbs */

test('a per-pad verb works on a fresh grid, where nothing is stored for any pad', () => {
  // The one that decides whether these verbs exist at all. `pads` starts as [], so an index bounded
  // by the stored array's length would put every pad out of range and every call would be a silent
  // no-op on the only control anybody starts from.
  withKit((d, live) => {
    assert.deepEqual(live()._children.DrumPads.pads, []);
    assert.equal(d.note('Kit', 3, 60), true);
    assert.equal(d.label('Kit', 3, 'Rim'), true);
    assert.equal(d.choke('Kit', 3, 4), true);

    // What the pad plays now, through the component's own resolver — the same call the renderer
    // makes, so this is the pad as drawn and as struck.
    const pad = drumPads(live())[2];
    assert.equal(pad.note, 60);
    assert.equal(pad.label, 'Rim');
    assert.equal(pad.choke, 4);
  });
});

test('a pad index outside the grid is refused, and the grid is what says how big it is', () => {
  withKit((d, live) => {
    assert.equal(d.size('Kit', 'note'), drumPadCount(live()._children.DrumPads));
    assert.equal(d.size('Kit', 'note'), 16, '4 x 4 by default');
    assert.equal(d.note('Kit', 17, 60), false, 'there is no pad 17');
    assert.equal(d.note('Kit', 0, 60), false, 'the verbs are 1-based');

    d.rows('Kit', 2);
    assert.equal(d.size('Kit', 'note'), 8, 'the size follows rows x cols, not the stored array');
    assert.equal(d.note('Kit', 9, 60), false);
  });
});

test('reading a pad answers what it plays, not the hole where no override is stored', () => {
  withKit((d, live) => {
    const notes = d.read('Kit', 'note');
    assert.equal(notes.length, 16);
    assert.deepEqual(notes, resolveDrumPads(live()._children.DrumPads).map((p) => p.note));
    assert.equal(d.read('Kit', 'note', 1), 36, 'pad 1 of a GM kit is the kick');

    // Choke is the case that matters: GM's three hi-hats are one instrument, and that grouping is
    // in the generated map rather than in anything stored.
    const chokes = d.read('Kit', 'choke');
    const hats = notes.map((n, i) => [n, chokes[i]]).filter(([n]) => GM_CHOKE[n]);
    assert.ok(hats.length > 0, 'a 16-pad GM kit reaches at least one hi-hat');
    assert.deepEqual(hats.map(([n, c]) => c), hats.map(([n]) => GM_CHOKE[n]));

    assert.deepEqual(d.read('Kit', 'label').slice(0, 2), ['Kick', 'Stick']);
  });
});

test('setting a pad to what it already plays leaves it following the map', () => {
  // Not a pedantic no-op. An override that pins a pad to the note it was going to take anyway looks
  // identical until baseNote moves, at which point fifteen pads transpose and that one does not.
  withKit((d, live) => {
    const before = d.read('Kit', 'note', 4);
    assert.equal(d.note('Kit', 4, before), true, '"already that way" is success');
    assert.deepEqual(live()._children.DrumPads.pads, [], 'nothing may be written for it');

    d.baseNote('Kit', 48);
    assert.equal(d.read('Kit', 'note', 4), before + 12, 'so it still follows baseNote');
  });
});

test('fill writes a whole kit in one call, and refuses one that does not fit', () => {
  withKit((d, live) => {
    const kit = [36, 38, 42, 46, 45, 50, 39, 51, 37, 40, 43, 47, 49, 52, 53, 54];
    assert.equal(d.fill('Kit', 'note', kit), true);
    assert.deepEqual(d.read('Kit', 'note'), kit);
    assert.deepEqual(drumPads(live()).map((p) => p.note), kit);

    assert.equal(d.fill('Kit', 'note', [...kit, 55]), false, '17 values for 16 pads is refused');
    assert.deepEqual(d.read('Kit', 'note'), kit, 'and refused means unchanged, not truncated');

    // Every element goes through the same reducer one call would, so bulk values are clamped too.
    assert.equal(d.fill('Kit', 'choke', new Array(16).fill(99)), true);
    assert.deepEqual(d.read('Kit', 'choke'), new Array(16).fill(8), 'choke groups stop at 8');
  });
});

test('the pad list is sized by rows and cols, so a script cannot grow it', () => {
  // insert/remove would fight the `rows` and `cols` verbs — the same reason `cell` and `line` lists
  // have never had them. A verb that answered "cannot be grown" every time it was called would read
  // as a capability and be none.
  assert.deepEqual(FAMILY.verbs.filter((v) => v.k === 'insert' || v.k === 'remove'), []);
  withKit((d) => {
    assert.equal(typeof d.insert, 'undefined');
    assert.equal(typeof d.remove, 'undefined');
    assert.deepEqual(Object.keys(d.size('Kit')).sort(), ['choke', 'colour', 'label', 'note']);
  });
});
