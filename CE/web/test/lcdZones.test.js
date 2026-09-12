import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveZoneContent,
  fitToRegion,
  composeLayout,
  resolveActiveLayoutId,
  collectSourceIds,
  noteName,
  isActiveSource,
  activeFilterOf,
} from '../src/CE_Application/utils/lcdZones.js';

const slider = { present: true, name: 'Cutoff', value: 62, min: 0, max: 127 };

test('resolveZoneContent renders each show kind', () => {
  assert.equal(resolveZoneContent({ show: 'static', text: 'VOL' }, null, 4), 'VOL');
  assert.equal(resolveZoneContent({ show: 'name' }, slider, 12), 'Cutoff');
  assert.equal(resolveZoneContent({ show: 'value' }, slider, 6), '62');
  assert.equal(resolveZoneContent({ show: 'pct', suffix: '%' }, slider, 6), '49%');
  assert.equal(resolveZoneContent({ show: 'midiValue' }, slider, 4), '62');
  assert.equal(resolveZoneContent({ show: 'midiValue', radix: 'hex' }, slider, 4), '3E');
  assert.equal(resolveZoneContent({ show: 'note' }, { present: true, value: 60 }, 4), 'C4');
  assert.equal(resolveZoneContent({ show: 'text' }, { present: true, text: 'On' }, 4), 'On');
  assert.equal(resolveZoneContent({ show: 'value' }, { present: false }, 6), '');
});

test('bar zone fills to the value fraction across the region width', () => {
  assert.equal(resolveZoneContent({ show: 'bar' }, { present: true, value: 0, min: 0, max: 100 }, 8), '        ');
  assert.equal(resolveZoneContent({ show: 'bar' }, { present: true, value: 100, min: 0, max: 100 }, 8), '████████');
});

test('fitToRegion aligns and truncates', () => {
  assert.equal(fitToRegion('AB', 5, 'left'), 'AB   ');
  assert.equal(fitToRegion('AB', 5, 'right'), '   AB');
  assert.equal(fitToRegion('AB', 5, 'center'), ' AB  ');
  assert.equal(fitToRegion('ABCDEF', 4), 'ABCD');
});

test('composeLayout paints zones into a grid by region', () => {
  const getInfo = (id) => (id === 'S1' ? slider : null);
  const zones = [
    { row: 1, colStart: 1, colEnd: 5, show: 'static', text: 'COMP' },
    { row: 1, colStart: 6, colEnd: 12, show: 'name', sourceId: 'S1' },
    { row: 2, colStart: 8, colEnd: 12, show: 'value', sourceId: 'S1' },
    { row: 3, colStart: 6, colEnd: 8, show: 'midiValue', radix: 'hex', sourceId: 'S1' },
  ];
  const grid = composeLayout(zones, 3, 12, getInfo);
  assert.equal(grid[0], 'COMP Cutoff ');
  assert.equal(grid[1], '       62   ');
  assert.equal(grid[2], '     3E     ');
});

test('higher priority zones paint over lower ones', () => {
  const zones = [
    { row: 1, colStart: 1, colEnd: 6, show: 'static', text: 'AAAAAA', priority: 0 },
    { row: 1, colStart: 1, colEnd: 3, show: 'static', text: 'BBB', priority: 1 },
  ];
  assert.equal(composeLayout(zones, 1, 6, null)[0], 'BBBAAA');
});

test('resolveActiveLayoutId prefers overlay, then selector, then default', () => {
  const layouts = [{ id: 'main' }, { id: 'edit' }, { id: 'flash' }];
  const pages = { defaultLayoutId: 'main', selectorMap: [{ when: '1', layoutId: 'edit' }] };
  assert.equal(resolveActiveLayoutId(pages, layouts, {}), 'main');
  assert.equal(resolveActiveLayoutId(pages, layouts, { selectorValue: '1' }), 'edit');
  assert.equal(resolveActiveLayoutId(pages, layouts, { selectorValue: '9' }), 'main');
  assert.equal(resolveActiveLayoutId(pages, layouts, { selectorValue: '1', activeOverlayLayoutId: 'flash' }), 'flash');
});

test('collectSourceIds gathers zone + selector + overlay sources', () => {
  const display = {
    layouts: [{ zones: [{ sourceId: 'A' }, { sourceId: 'B' }, { sourceId: '' }] }],
    pages: { selectorSourceId: 'C', overlays: [{ sourceId: 'D' }] },
  };
  assert.deepEqual(collectSourceIds(display).sort(), ['A', 'B', 'C', 'D']);
});

test('isActiveSource / activeFilterOf parse @active kind filters', () => {
  assert.equal(isActiveSource('@active'), true);
  assert.equal(isActiveSource('@active#value'), true);
  assert.equal(isActiveSource('S1'), false);
  assert.equal(isActiveSource(''), false);
  assert.equal(activeFilterOf('@active'), '');
  assert.equal(activeFilterOf('@active#switch'), 'switch');
  assert.equal(activeFilterOf('S1'), '');
});

test('empty zones do not clobber overlapping zones (per-kind @active share a region)', () => {
  // Two zones share R1 C4-6: a slider-scoped value and a button-scoped state.
  // Only the active kind resolves to live info; the other is empty and must not
  // paint spaces over the one that did.
  const zones = [
    { row: 1, colStart: 1, colEnd: 3, show: 'static', text: 'ID' },
    { row: 1, colStart: 4, colEnd: 6, show: 'value', sourceId: '@active#value' },
    { row: 1, colStart: 4, colEnd: 6, show: 'state', sourceId: '@active#switch' },
  ];
  // Button active: only the switch source has info -> 'On' shows, value stays out.
  const btnActive = (id) => (id === '@active#switch' ? { present: true, on: true, value: 1 } : null);
  assert.equal(composeLayout(zones, 1, 6, btnActive)[0], 'ID On ');
  // Slider active: only the value source has info -> '62' shows.
  const sliderActive = (id) => (id === '@active#value' ? { present: true, value: 62, min: 0, max: 127 } : null);
  assert.equal(composeLayout(zones, 1, 6, sliderActive)[0], 'ID 62 ');
});

test('an absent bar zone leaves the region blank rather than a full-width gutter', () => {
  const zones = [
    { row: 1, colStart: 1, colEnd: 4, show: 'static', text: 'AAAA' },
    { row: 1, colStart: 1, colEnd: 4, show: 'bar', sourceId: 'S1' },
  ];
  assert.equal(composeLayout(zones, 1, 4, () => null)[0], 'AAAA');
});

test('edit zone shows the source string (caret is a renderer overlay)', () => {
  assert.equal(resolveZoneContent({ show: 'edit' }, { present: true, text: 'LEAD 1' }, 12), 'LEAD 1');
  assert.equal(resolveZoneContent({ show: 'edit', text: 'INIT' }, null, 8), 'INIT');
});

test('a scroll zone marquees overflowing content within its region', () => {
  const zones = [{ row: 1, colStart: 1, colEnd: 4, show: 'static', text: 'HELLO', scroll: true }];
  // width 4, track "HELLO   " (gap 3). elapsed 0 -> "HELL"; 1 -> "ELLO"; 2 -> "LLO ".
  assert.equal(composeLayout(zones, 1, 4, null, 0)[0], 'HELL');
  assert.equal(composeLayout(zones, 1, 4, null, 1)[0], 'ELLO');
  assert.equal(composeLayout(zones, 1, 4, null, 2)[0], 'LLO ');
  // wraps: period is 8, elapsed 8 -> back to the start.
  assert.equal(composeLayout(zones, 1, 4, null, 8)[0], 'HELL');
});

test('a scroll zone that fits its region does not scroll', () => {
  const zones = [{ row: 1, colStart: 1, colEnd: 6, show: 'static', text: 'HI', scroll: true }];
  assert.equal(composeLayout(zones, 1, 6, null, 5)[0], 'HI    ');
});

test('widget kinds have character-mode fallbacks', () => {
  const half = { present: true, value: 50, min: 0, max: 100 };
  assert.equal(resolveZoneContent({ show: 'hbar' }, half, 4), '██  ');
  assert.equal(resolveZoneContent({ show: 'vbar' }, half, 3), '▄▄▄');
  assert.equal(resolveZoneContent({ show: 'needle' }, half, 5), '50%');
  assert.equal(resolveZoneContent({ show: 'hslider' }, { present: false }, 4), '');
});

test('noteName maps MIDI note numbers', () => {
  assert.equal(noteName(60), 'C4');
  assert.equal(noteName(69), 'A4');
});

test('selectorRuleMatches supports comparison operators', async () => {
  const { selectorRuleMatches, resolveActiveLayoutId } = await import('../src/CE_Application/utils/lcdZones.js');
  // eq / ne (string equality)
  assert.equal(selectorRuleMatches({ when: 'A' }, 'A'), true);
  assert.equal(selectorRuleMatches({ op: 'eq', when: '2' }, 2), true);
  assert.equal(selectorRuleMatches({ op: 'ne', when: 'A' }, 'B'), true);
  // numeric comparisons
  assert.equal(selectorRuleMatches({ op: 'ge', when: 64 }, 80), true);
  assert.equal(selectorRuleMatches({ op: 'ge', when: 64 }, 40), false);
  assert.equal(selectorRuleMatches({ op: 'lt', when: 10 }, 5), true);
  assert.equal(selectorRuleMatches({ op: 'between', when: 20, when2: 40 }, 30), true);
  assert.equal(selectorRuleMatches({ op: 'between', when: 40, when2: 20 }, 10), false);
  // non-numeric selector never matches a numeric op
  assert.equal(selectorRuleMatches({ op: 'gt', when: 5 }, 'hi'), false);

  // resolver picks the first matching rule in order
  const layouts = [{ id: 'lo' }, { id: 'hi' }];
  const pages = {
    defaultLayoutId: 'lo',
    selectorMap: [
      { op: 'ge', when: 64, layoutId: 'hi' },
      { op: 'lt', when: 64, layoutId: 'lo' },
    ],
  };
  assert.equal(resolveActiveLayoutId(pages, layouts, { selectorValue: '100' }), 'hi');
  assert.equal(resolveActiveLayoutId(pages, layouts, { selectorValue: '10' }), 'lo');
});

test('regionStartOffset agrees with fitToRegion placement (caret alignment)', async () => {
  const { regionStartOffset, fitToRegion } = await import('../src/CE_Application/utils/lcdZones.js');
  // The offset must equal the count of leading spaces fitToRegion adds.
  for (const width of [8, 10, 16]) {
    for (const text of ['A', 'HELLO', 'PATCH01', 'ABCDEFGHIJKL']) {
      for (const align of ['left', 'center', 'right']) {
        const rendered = fitToRegion(text, width, align);
        const leading = rendered.length - rendered.replace(/^ +/, '').length;
        const expected = text.length >= width ? 0 : leading;
        assert.equal(regionStartOffset(width, text.length, align), expected, `${width}/${text}/${align}`);
      }
    }
  }
  // Overflow: offset is 0 (content is sliced, no padding).
  assert.equal(regionStartOffset(4, 10, 'right'), 0);
});

/* ------------------------------------------------------- pressable zones (soft keys) */

const ZONES = await import('../src/CE_Application/utils/lcdZones.js');

const softKey = (id, colStart, colEnd, press) => ({
  id, show: 'static', text: `[${id}]`, row: 4, colStart, colEnd, press,
});

test('a zone is only pressable when it declares an action it could perform', () => {
  const { isPressableZone } = ZONES;
  assert.equal(isPressableZone(softKey('k', 1, 5, { layout: 'edit' })), true);
  assert.equal(isPressableZone(softKey('k', 1, 5, { set: 'cutoff', to: 64 })), true);
  // No action, an empty one, or a shape that is not an object: all inert.
  assert.equal(isPressableZone(softKey('k', 1, 5, undefined)), false);
  assert.equal(isPressableZone(softKey('k', 1, 5, {})), false);
  assert.equal(isPressableZone(softKey('k', 1, 5, { layout: '' })), false);
  assert.equal(isPressableZone(softKey('k', 1, 5, 'edit')), false);
  // Hidden is not pressable — an invisible soft key would be a trap.
  assert.equal(isPressableZone({ ...softKey('k', 1, 5, { layout: 'x' }), visible: false }), false);
});

test('a press resolves to the zone the user can see, not the one underneath', () => {
  const { pressTargetAt } = ZONES;
  // Two zones over the same cells. composeLayout paints in priority order, so the
  // HIGHER priority is what the eye sees — and must be what the press hits.
  const under = { ...softKey('under', 1, 20, { layout: 'under' }), priority: 0 };
  const over = { ...softKey('over', 1, 5, { layout: 'over' }), priority: 5 };
  const hit = pressTargetAt([under, over], { row: 3, col: 2 }, 20);
  assert.equal(hit.id, 'over');
  // Outside the covering zone, the one beneath is reached normally.
  assert.equal(pressTargetAt([under, over], { row: 3, col: 9 }, 20).id, 'under');
});

test('an inert zone on top blocks the pressable one beneath it', () => {
  const { pressTargetAt } = ZONES;
  // The user pressed what they could see, and what they could see does nothing.
  // Falling through to a hidden soft key would fire an action from nowhere.
  const under = { ...softKey('under', 1, 20, { layout: 'under' }), priority: 0 };
  const cover = { id: 'cover', show: 'static', text: 'BUSY', row: 4, colStart: 1, colEnd: 20, priority: 9 };
  assert.equal(pressTargetAt([under, cover], { row: 3, col: 4 }, 20), null);
});

test('a press outside every zone is nothing at all', () => {
  const { pressTargetAt } = ZONES;
  const keys = [softKey('a', 1, 5, { layout: 'a' }), softKey('b', 6, 10, { layout: 'b' })];
  assert.equal(pressTargetAt(keys, { row: 3, col: 12 }, 20), null);  // past the keys
  assert.equal(pressTargetAt(keys, { row: 0, col: 2 }, 20), null);   // a different row
  assert.equal(pressTargetAt([], { row: 3, col: 2 }, 20), null);
  assert.equal(pressTargetAt(null, { row: 3, col: 2 }, 20), null);
});

test('the four-key row maps every column to exactly one key', () => {
  const { pressTargetAt } = ZONES;
  // The mockup's own layout: 20 columns, four keys of five. Every column must
  // land on one key and no column may fall between two of them.
  const keys = [
    softKey('OSC', 1, 5, { layout: 'osc' }), softKey('FLT', 6, 10, { layout: 'flt' }),
    softKey('ENV', 11, 15, { layout: 'env' }), softKey('FX', 16, 20, { layout: 'fx' }),
  ];
  const hits = [];
  for (let col = 0; col < 20; col += 1) hits.push(pressTargetAt(keys, { row: 3, col }, 20)?.id ?? null);
  assert.deepEqual(hits, [
    'OSC', 'OSC', 'OSC', 'OSC', 'OSC', 'FLT', 'FLT', 'FLT', 'FLT', 'FLT',
    'ENV', 'ENV', 'ENV', 'ENV', 'ENV', 'FX', 'FX', 'FX', 'FX', 'FX',
  ]);
});

test('a zone region is clamped to the screen, so a wide colEnd cannot swallow the row', () => {
  const { zoneCoversCell } = ZONES;
  // colStart/colEnd are 1-BASED in the data and the cell is 0-based, so colStart 18 is
  // column index 17 — the zone's own first column, not the one before it.
  const wide = softKey('wide', 18, 99, { layout: 'x' });
  assert.equal(zoneCoversCell(wide, { row: 3, col: 19 }, 20), true);   // clamped to the last column
  assert.equal(zoneCoversCell(wide, { row: 3, col: 17 }, 20), true);   // its first column
  assert.equal(zoneCoversCell(wide, { row: 3, col: 16 }, 20), false);  // one before it
  // colStart past the end collapses onto the last column rather than matching nothing.
  assert.equal(zoneCoversCell(softKey('past', 99, 99, { layout: 'x' }), { row: 3, col: 19 }, 20), true);
});

/* -------------------------------------------------- a layout that does not stay (timeout) */

test('a layout declares its own auto-return, or stays put', () => {
  const { layoutTimeout } = ZONES;
  assert.deepEqual(layoutTimeout({ id: 'edit', timeoutMs: 5000, timeoutTo: 'home' }),
    { ms: 5000, to: 'home' });
  // An empty target means "stop overriding" — back to the selector or the default.
  assert.deepEqual(layoutTimeout({ id: 'edit', timeoutMs: 800 }), { ms: 800, to: '' });
  // The ordinary case: no timeout at all.
  assert.equal(layoutTimeout({ id: 'home' }), null);
  assert.equal(layoutTimeout(null), null);
});

test('0 and nonsense mean no timeout, never an instant one', () => {
  const { layoutTimeout } = ZONES;
  // The alternative reading strands a user on a screen that vanishes before they see it.
  assert.equal(layoutTimeout({ timeoutMs: 0 }), null);
  assert.equal(layoutTimeout({ timeoutMs: -1000 }), null);
  assert.equal(layoutTimeout({ timeoutMs: 'soon' }), null);
  assert.equal(layoutTimeout({ timeoutMs: NaN }), null);
  // Too short to read is refused rather than honoured.
  assert.equal(layoutTimeout({ timeoutMs: 99 }), null);
  assert.deepEqual(layoutTimeout({ timeoutMs: 100 }), { ms: 100, to: '' });
});

test('a fractional timeout rounds rather than being refused', () => {
  const { layoutTimeout } = ZONES;
  assert.deepEqual(layoutTimeout({ timeoutMs: 1500.6, timeoutTo: 'home' }), { ms: 1501, to: 'home' });
});

/* ------------------------------------------------- a zone that names a device parameter */

const CUTOFF = {
  id: 'filter.cutoff', name: 'Filter Cutoff', type: 'bipolar',
  range: { min: 0, max: 127 }, default: 64, display: { unit: 'Hz' },
};
const FILTER_ON = {
  id: 'filter.enabled', name: 'Filter Enabled', type: 'boolean',
  default: true, falseValue: 0, trueValue: 127,
};

test('a parameter source parses, with and without a role', () => {
  const { isParamSource, parseParamSource } = ZONES;
  assert.equal(isParamSource('@param:filter.cutoff'), true);
  assert.equal(isParamSource('ctrl_123'), false);
  assert.equal(isParamSource('@active'), false);

  // No role: the caller's default. A parameter id is dotted, a role is not, which is what makes
  // the one-colon form unambiguous.
  assert.deepEqual(parseParamSource('@param:filter.cutoff', 'synth'),
    { role: 'synth', parameterId: 'filter.cutoff' });
  assert.deepEqual(parseParamSource('@param:pad:filter.cutoff', 'synth'),
    { role: 'pad', parameterId: 'filter.cutoff' });
  // Nothing after the prefix is not a source.
  assert.equal(parseParamSource('@param:', 'synth'), null);
  assert.equal(parseParamSource('ctrl_123', 'synth'), null);
});

test('a parameter renders through every show kind a control would', () => {
  const { parameterInfo } = ZONES;
  const info = parameterInfo(CUTOFF, 96);
  assert.equal(resolveZoneContent({ show: 'name' }, info, 14), 'Filter Cutoff');
  assert.equal(resolveZoneContent({ show: 'value' }, info, 6), '96');
  assert.equal(resolveZoneContent({ show: 'pct', suffix: '%' }, info, 6), '76%');
  assert.equal(resolveZoneContent({ show: 'midiValue', radix: 'hex' }, info, 4), '60');
  // `address` answers the parameter's own id — the same thing the kind showed when it had to
  // reach through a control's binding to find one.
  assert.equal(resolveZoneContent({ show: 'address' }, info, 16), 'filter.cutoff');
});

test('an unset parameter falls back to the profile default, not to zero', () => {
  const { parameterInfo } = ZONES;
  // Nothing has moved it yet: a screen should open reading what the device is meant to be at.
  assert.equal(parameterInfo(CUTOFF, undefined).value, 64);
  assert.equal(parameterInfo(CUTOFF, null).value, 64);
  assert.equal(parameterInfo(CUTOFF, 0).value, 0, 'but a real zero is a value, not "unset"');
});

test('a boolean parameter reports 0..1, not its wire values', () => {
  const { parameterInfo } = ZONES;
  // Reporting the raw 0/127 would make `pct` say 100% for "on" — true of the wire, useless on
  // a screen next to a bargraph.
  const on = parameterInfo(FILTER_ON, 127);
  assert.equal(on.max, 1);
  assert.equal(on.on, true);
  assert.equal(resolveZoneContent({ show: 'state' }, on, 4), 'On');
  assert.equal(resolveZoneContent({ show: 'pct', suffix: '%' }, on, 5), '100%');

  const off = parameterInfo(FILTER_ON, 0);
  assert.equal(off.on, false);
  assert.equal(resolveZoneContent({ show: 'state' }, off, 4), 'Off');
  assert.equal(resolveZoneContent({ show: 'pct', suffix: '%' }, off, 5), '0%');
});

test('no parameter is no info, so the zone paints nothing', () => {
  // An invented value would be worse than a blank: whatever sits under the zone survives instead.
  assert.equal(ZONES.parameterInfo(null, 5), null);
  assert.equal(ZONES.parameterInfo(undefined, 5), null);
});

test('collectSourceIds gathers parameter sources like any other', () => {
  // The preview has to know to fetch them, and it walks this list to find out.
  const display = { layouts: [{ zones: [{ sourceId: '@param:filter.cutoff' }, { sourceId: 'ctrl_1' }] }] };
  assert.deepEqual(collectSourceIds(display).sort(), ['@param:filter.cutoff', 'ctrl_1']);
});

/* ------------------------------------------------------ the menu cursor (@state) */

test('a cursor wraps at both ends rather than sticking', () => {
  const { moveCursor } = ZONES;
  // Three items, max index 2.
  assert.equal(moveCursor(0, 1, 2), 1);
  assert.equal(moveCursor(2, 1, 2), 0, 'past the end comes back to the top');
  assert.equal(moveCursor(0, -1, 2), 2, 'and up from the top goes to the bottom');
  // A page with no list has nowhere to go.
  assert.equal(moveCursor(0, 1, 0), 0);
  assert.equal(moveCursor(5, 3, 0), 0);
  // Nonsense in, a valid index out.
  assert.equal(moveCursor(NaN, NaN, 2), 0);
  assert.equal(moveCursor(9, 0, 2), 0, 'an out-of-range cursor is brought back in range');
});

test('a state source parses and renders like any other value', () => {
  const { isStateSource, stateKeyOf, stateInfo } = ZONES;
  assert.equal(isStateSource('@state:cursor'), true);
  assert.equal(isStateSource('@param:filter.cutoff'), false);
  assert.equal(stateKeyOf('@state:cursor'), 'cursor');
  assert.equal(stateKeyOf('ctrl_1'), '');

  const info = stateInfo(1, 2);
  assert.equal(resolveZoneContent({ show: 'value' }, info, 4), '1');
  assert.equal(resolveZoneContent({ show: 'pct', suffix: '%' }, info, 5), '50%');
  // Out of range is clamped, not reported as nonsense.
  assert.equal(stateInfo(99, 2).value, 2);
});

test('visibleWhen shows a zone only on its own index — how a menu marks its selection', () => {
  const { zoneVisibleWith } = ZONES;
  const arrow = (row, index) => ({
    id: `a${index}`, show: 'static', text: '▶', row, colStart: 1, colEnd: 1,
    visibleWhen: { cursor: index },
  });
  assert.equal(zoneVisibleWith(arrow(2, 0), { cursor: 0 }), true);
  assert.equal(zoneVisibleWith(arrow(2, 0), { cursor: 1 }), false);
  // No condition means always, and an explicit visible:false still wins.
  assert.equal(zoneVisibleWith({ show: 'static', text: 'X' }, { cursor: 3 }), true);
  assert.equal(zoneVisibleWith({ show: 'static', visible: false, visibleWhen: { cursor: 0 } }, { cursor: 0 }), false);
  // Missing state reads as 0, so an unset display shows the first row's marker.
  assert.equal(zoneVisibleWith(arrow(2, 0), {}), true);
});

test('composeLayout paints only the zones state allows', () => {
  const rows = [
    { id: 'i0', show: 'static', text: 'ONE', row: 1, colStart: 3, colEnd: 5 },
    { id: 'i1', show: 'static', text: 'TWO', row: 2, colStart: 3, colEnd: 5 },
    { id: 'a0', show: 'static', text: '>', row: 1, colStart: 1, colEnd: 1, visibleWhen: { cursor: 0 } },
    { id: 'a1', show: 'static', text: '>', row: 2, colStart: 1, colEnd: 1, visibleWhen: { cursor: 1 } },
  ];
  assert.deepEqual(composeLayout(rows, 2, 6, null, 0, { cursor: 0 }), ['> ONE ', '  TWO ']);
  assert.deepEqual(composeLayout(rows, 2, 6, null, 0, { cursor: 1 }), ['  ONE ', '> TWO ']);
});

test('a zone hidden by state cannot be pressed either', () => {
  const { pressTargetAt } = ZONES;
  // A soft key you cannot see must not be hittable — otherwise a menu's hidden rows stay live.
  const key = {
    id: 'k', show: 'static', text: '[OK]', row: 1, colStart: 1, colEnd: 4,
    press: { layout: 'x' }, visibleWhen: { cursor: 1 },
  };
  assert.equal(pressTargetAt([key], { row: 0, col: 2 }, 20, { cursor: 1 }).id, 'k');
  assert.equal(pressTargetAt([key], { row: 0, col: 2 }, 20, { cursor: 0 }), null);
});

test('every press action counts as pressable, or the key silently does nothing', () => {
  const { isPressableZone } = ZONES;
  const z = (press) => ({ id: 'k', show: 'static', text: '[K]', row: 4, colStart: 1, colEnd: 3, press });
  // This is the guard that `{ cursor }` originally failed: the arithmetic and the gate both worked
  // in isolation, and the key did nothing because the zone was never a hit target.
  assert.equal(isPressableZone(z({ layout: 'edit' })), true);
  assert.equal(isPressableZone(z({ set: 'cutoff', to: 64 })), true);
  assert.equal(isPressableZone(z({ cursor: 1 })), true);
  assert.equal(isPressableZone(z({ cursor: -1 })), true);
  // A move of nothing is not an action.
  assert.equal(isPressableZone(z({ cursor: 0 })), false);
  assert.equal(isPressableZone(z({ cursor: 'down' })), false);
  assert.equal(isPressableZone(z({})), false);
});
