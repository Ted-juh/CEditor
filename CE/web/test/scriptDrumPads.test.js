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
  ROLL_MODES, padRolls, rollIntervalMs, rollDelayMs, rollVelocity,
  PAD_CORNERS, PAD_ZONE_ACTIONS, cornerField, cornerSize, cornerRect,
  zonesEnabled, strikeAction, flamMs, ghostVelocity, padStrikeX, padStrikeY,
} from '../src/CE_Application/utils/drumPadLayout.js';
import { beatsPerStep, DIVISION_IDS } from '../src/CE_Application/utils/transportLayout.js';

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
    assert.deepEqual(Object.keys(d.size('Kit')).sort(), ['choke', 'colour', 'label', 'note', 'roll']);
  });
});

/* -------------------------------------------------------------------------------- the roll */

test('roll resolves per pad, and only in a mode a pad can stay on in', () => {
  // A roll runs for as long as the pad is ON. A one-shot releases itself after its gate, so there
  // is no "while held" for a roll to fill — and saying so here is what stops the preview surface
  // from starting a clock nothing will ever stop.
  const cfg = { rows: 1, cols: 2, pads: [{ roll: true }, {}] };
  const [rolls, plain] = resolveDrumPads(cfg);
  assert.equal(rolls.roll, true);
  assert.equal(plain.roll, false, 'a pad with no entry does not roll');

  assert.deepEqual(ROLL_MODES, ['momentary', 'toggle']);
  for (const mode of ROLL_MODES) assert.equal(padRolls(cfg, rolls, mode), true, mode);
  assert.equal(padRolls(cfg, rolls, 'oneShot'), false, 'a one-shot cannot roll');
  assert.equal(padRolls(cfg, plain, 'momentary'), false);
});

test('the roll interval is musical, and follows the tempo', () => {
  // Derived from beatsPerStep — the same table the Arpeggiator and the Turing Machine step by — so
  // "1/16" here means what it means everywhere else in the panel.
  const at = (rate, bpm) => rollIntervalMs({ rollRate: rate, rollSync: true }, bpm);
  assert.equal(at('1/16', 120), Math.round(beatsPerStep('1/16') * (60000 / 120)));
  assert.equal(at('1/16', 120), 125);
  assert.equal(at('1/32', 120), 63);
  assert.equal(at('1/16', 60), 250, 'half the tempo is twice the interval');
  assert.equal(at('1/8T', 120), Math.round(beatsPerStep('1/8T') * 500), 'triplets too');

  // Unsynced, or synced with nothing to sync to: the free rate takes over rather than the roll
  // dying. A panel with no Transport control still has pads.
  assert.equal(rollIntervalMs({ rollSync: false, rollHz: 8 }, 120), 125);
  assert.equal(rollIntervalMs({ rollSync: false, rollHz: 20 }, 120), 50);
  assert.equal(rollIntervalMs({ rollSync: true, rollRate: '1/16' }, null), 125, 'falls back to rollHz');
  assert.equal(rollIntervalMs({ rollSync: false, rollHz: 9999 }, null), 20, 'and is clamped to something playable');
});

test('repeats sit under the strike that opened them', () => {
  // What makes a roll read as an accent followed by a buzz rather than as a machine gun.
  assert.equal(rollVelocity({ rollVelocity: 0.75 }, 100), 75);
  assert.equal(rollVelocity({ rollVelocity: 1 }, 100), 100, 'a scale of 1 is a flat roll');
  assert.equal(rollVelocity({ rollVelocity: 0 }, 100), 1, 'never silent — a note-on of 0 is a note-off');
  assert.equal(rollVelocity({}, 120), 90, 'the default leaves the roll clearly below the accent');
});

test('a script can give one pad a roll and set the grid up to play it', () => {
  withKit((d, live) => {
    assert.equal(d.roll('Kit', 2, true), true);
    assert.equal(d.rollRate('Kit', '1/32'), true);
    assert.equal(d.rollDelay('Kit', 120), true);
    assert.equal(d.rollVelocity('Kit', 0.6), true);

    const pads = drumPads(live());
    assert.deepEqual(pads.map((p) => p.roll).filter(Boolean), [true], 'exactly one rolling pad');
    assert.equal(pads[1].roll, true);

    const cfg = live()._children.DrumPads;
    assert.equal(rollIntervalMs(cfg, 120), 63, '1/32 at 120');
    assert.equal(rollDelayMs(cfg), 120);
    assert.equal(rollVelocity(cfg, 100), 60);

    // …and it reads back by the same names it was written by.
    assert.deepEqual(d.read('Kit', 'roll'), pads.map((p) => p.roll));
    assert.equal(d.read('Kit').rollRate, '1/32');
  });
});

test('a rate the transport does not have is a no-op', () => {
  withKit((d, live) => {
    assert.equal(d.rollRate('Kit', '1/7'), false);
    assert.equal(live()._children.DrumPads.rollRate, '1/16');
    assert.equal(VERB_VALUES['drumpads.rollRate'], DIVISION_IDS, 'offered from the transport\'s own table');
  });
});

test('fill can set which pads roll in one call', () => {
  withKit((d) => {
    const which = [false, true, true, false, false, false, false, false,
                   false, false, false, false, false, false, false, false];
    assert.equal(d.fill('Kit', 'roll', which), true);
    assert.deepEqual(d.read('Kit', 'roll'), which);
  });
});

/* ------------------------------------------------------------------------ corner zones */

test('velocity can come from the middle of the pad, not just its height', () => {
  // The third reading of the same strike. Chebyshev rather than euclidean distance, because a pad
  // is a square: with euclidean distance a corner is further from the middle than the edge midpoint
  // beside it, so a corner strike would come out quieter than a rim strike, which is backwards.
  const kit = createControl('DrumPads', { name: 'K' });
  const cfg = kit._children.DrumPads;
  cfg.velocityFrom = 'centre';
  cfg.velocity = 100;

  assert.equal(strikeVelocity(kit, 0.5, 0.5), 100, 'dead centre is the full velocity');
  const edge = strikeVelocity(kit, 1, 0.5);
  const corner = strikeVelocity(kit, 1, 1);
  assert.ok(edge < 100, 'the rim is softer');
  assert.equal(edge, corner, 'and a corner is a rim, not somewhere further out');
  assert.ok(strikeVelocity(kit, 0.75, 0.5) > edge, 'halfway out is between the two');

  // The other two sources must not read the new axis at all.
  cfg.velocityFrom = 'fixed';
  assert.equal(strikeVelocity(kit, 0.9, 0.1), strikeVelocity(kit, 0.1, 0.9));
  cfg.velocityFrom = 'position';
  assert.equal(strikeVelocity(kit, 0.7, 0.1), strikeVelocity(kit, 0.7, 0.9), 'x is ignored');
});

test('a corner is a corner of the screen, and the rest of the pad is the face', () => {
  const cfg = { zones: true, cornerSize: 0.28, cornerTopRight: 'roll', cornerBottomLeft: 'flam' };
  const at = (x, y) => strikeAction(cfg, x, y);

  assert.deepEqual(at(0.5, 0.5), { corner: null, action: 'none' }, 'the middle');
  assert.deepEqual(at(0.5, 0.99), { corner: null, action: 'none' }, 'the top EDGE is not a corner');
  assert.deepEqual(at(0.95, 0.95), { corner: 'topRight', action: 'roll' });
  assert.deepEqual(at(0.02, 0.02), { corner: 'bottomLeft', action: 'flam' });
  // A corner with nothing assigned is still a corner, and still plays a plain hit.
  assert.deepEqual(at(0.02, 0.98), { corner: 'topLeft', action: 'none' });

  // Off by default, so a panel built before zones existed behaves as it always did.
  assert.equal(SECTION_DEFAULTS.DrumPads.zones, false);
  assert.deepEqual(strikeAction({ cornerTopRight: 'roll' }, 0.95, 0.95), { corner: null, action: 'none' });
});

test('corner size decides how much of the pad the corners claim', () => {
  const wide = { zones: true, cornerSize: 0.45, cornerTopLeft: 'accent' };
  const tight = { zones: true, cornerSize: 0.05, cornerTopLeft: 'accent' };
  assert.equal(strikeAction(wide, 0.3, 0.7).action, 'accent');
  assert.equal(strikeAction(tight, 0.3, 0.7).action, 'none', 'the same point is the face on a tight map');

  // Clamped below a half, so there is always a face left between the four corners.
  assert.equal(cornerSize({ cornerSize: 5 }), 0.45);
  assert.equal(cornerSize({ cornerSize: -1 }), 0.05);
  assert.equal(strikeAction({ zones: true, cornerSize: 5, cornerTopLeft: 'accent' }, 0.5, 0.5).action,
    'none', 'the exact middle is never a corner');
});

test('the corner rectangle drawn is the region that was hit', () => {
  // The renderer and the hit test must agree, or the wedge is a lie about where to aim.
  const rect = { x: 100, y: 200, w: 80, h: 60 };
  const cfg = { zones: true, cornerSize: 0.25 };
  const r = cornerRect(rect, cfg, 'topLeft');
  assert.deepEqual(r, { x: 100, y: 200, w: 20, h: 15 });

  // A point inside that drawn rectangle, converted back the way the surface converts one.
  const px = r.x + r.w / 2, py = r.y + r.h / 2;
  assert.equal(strikeAction(cfg, padStrikeX(rect, px), padStrikeY(rect, py)).corner, 'topLeft');
  // …and one just outside it is not.
  assert.equal(strikeAction(cfg, padStrikeX(rect, r.x + r.w + 2), padStrikeY(rect, r.y + r.h + 2)).corner, null);
});

test('flam and ghost levels are derived from the hit they decorate', () => {
  assert.equal(flamMs({}), 22);
  assert.equal(flamMs({ flamMs: 0 }), 1, 'a flam with no lead is not a flam');
  assert.equal(ghostVelocity({ ghostVelocity: 0.35 }, 100), 35);
  assert.equal(ghostVelocity({}, 100), 35);
  assert.equal(ghostVelocity({ ghostVelocity: 0 }, 100), 1, 'never silent');
});

test('a script can lay out the corner vocabulary', () => {
  withKit((d, live) => {
    assert.equal(d.zones('Kit'), true, 'a bare call turns them on');
    assert.equal(d.cornerTopRight('Kit', 'roll'), true);
    assert.equal(d.cornerTopLeft('Kit', 'choke'), true);
    assert.equal(d.cornerBottomRight('Kit', 'flam'), true);
    assert.equal(d.cornerBottomLeft('Kit', 'ghost'), true);
    assert.equal(d.cornerSize('Kit', 0.3), true);
    assert.equal(d.flamMs('Kit', 30), true);

    const cfg = live()._children.DrumPads;
    assert.equal(zonesEnabled(cfg), true);
    assert.equal(strikeAction(cfg, 0.95, 0.95).action, 'roll');
    assert.equal(strikeAction(cfg, 0.05, 0.95).action, 'choke');
    assert.equal(strikeAction(cfg, 0.95, 0.05).action, 'flam');
    assert.equal(strikeAction(cfg, 0.05, 0.05).action, 'ghost');
    assert.equal(strikeAction(cfg, 0.5, 0.5).action, 'none');

    const read = d.read('Kit');
    assert.equal(read.cornerTopRight, 'roll');
    assert.equal(read.cornerSize, 0.3);
    assert.equal(read.flamMs, 30);
  });
});

test('an action the component does not have is a no-op, and all four corners offer the same set', () => {
  withKit((d, live) => {
    assert.equal(d.cornerTopLeft('Kit', 'rimshot'), false);
    assert.equal(live()._children.DrumPads.cornerTopLeft, 'none');
    for (const corner of PAD_CORNERS) {
      assert.equal(VERB_VALUES[`drumpads.${cornerField(corner)}`], PAD_ZONE_ACTIONS,
        `${corner} must offer the same vocabulary as its neighbours`);
    }
  });
});
