// scriptPicker.test.js — the Commands tab: module grouping, the spelling toggle, and the module
// filtering added in slice 4.
//
// The picker is the surface a user learns the API from, so what it hides matters as much as what
// it shows. These server-render it against real panel documents rather than testing the helpers in
// isolation, because the interesting rule — filter on manual, never on auto — lives in the
// component and would otherwise be asserted nowhere.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';
import ScriptPicker from '../src/CE_Application/editor/ScriptPicker.svelte';
import {
  membersByModule, namespacedSnippet, insertSnippet, memberPath, ALL_MEMBERS, MODULES,
  MEMBER_BY_ID,
} from '../src/CE_Application/scripting/panelApi.js';

const html = (props) => render(ScriptPicker, { props }).body;

/* ------------------------------------------------------------------------- the grouping */

test('every non-lifecycle member lands in exactly one module group', () => {
  const groups = membersByModule();
  const seen = new Map();
  for (const g of groups) {
    for (const m of g.members) {
      assert.ok(!seen.has(m.id), `${m.id} appears in two groups`);
      seen.set(m.id, g);
    }
  }
  assert.equal(seen.size, ALL_MEMBERS.length, 'every member is reachable from some group');

  const lifecycle = groups[0];
  assert.equal(lifecycle.module, null, 'Lifecycle comes first and belongs to no module');
  assert.ok(lifecycle.members.every((m) => m.kind === 'lifecycle'));
  for (const g of groups.slice(1)) {
    assert.ok(g.members.every((m) => m.kind !== 'lifecycle'), `${g.module.id} holds no lifecycle hooks`);
  }
});

test('groups follow manifest order, so the picker and the Export tab list the same way', () => {
  const ids = membersByModule().slice(1).map((g) => g.module.id);
  const manifest = MODULES.map((m) => m.id).filter((id) => ids.includes(id));
  assert.deepEqual(ids, manifest);
});

/* ------------------------------------------------------------------- the spelling toggle */

test('namespacedSnippet rewrites the leading name and leaves ce.core alone', () => {
  const sendCC = MEMBER_BY_ID.sendCC;
  assert.match(namespacedSnippet(sendCC, 'lua'), /^ce\.midi\.sendCC\(/);
  assert.match(insertSnippet(sendCC, 'lua'), /^sendCC\(/, 'the flat spelling is untouched and still available');

  // ce.core is global: true — its members are never namespaced, so both spellings are identical.
  const set = MEMBER_BY_ID.set;
  assert.equal(namespacedSnippet(set, 'lua'), insertSnippet(set, 'lua'));

  // A value member has no call parens, and its snippet mentions the name twice — both move, or
  // the inserted line would use two spellings of the same thing.
  const state = namespacedSnippet(MEMBER_BY_ID.state, 'lua');
  assert.ok(state.startsWith('ce.storage.state'));
  assert.ok(!/(?<![\w.])state\b/.test(state), `a flat "state" survived the rewrite: ${state}`);

  // A member the short name renamed keeps the module's spelling, not its own id.
  assert.equal(memberPath('setlistGoto'), 'ce.components.setlist.jump');
  assert.match(namespacedSnippet(MEMBER_BY_ID.setlistGoto, 'lua'), /^ce\.components\.setlist\.jump\(/);

  // Across the whole surface: the namespaced path is what gets inserted, and no bare spelling of
  // the member survives anywhere in the snippet. (Not every snippet STARTS with the call —
  // buildDump's is `local bytes = buildDump("patch")` — so this checks content, not position.)
  for (const m of ALL_MEMBERS) {
    if (m.kind === 'lifecycle') continue;
    const out = namespacedSnippet(m, 'lua');
    assert.ok(out.includes(memberPath(m.id)), `${m.id} -> ${out}`);
    const bare = new RegExp(`(?<![\\w.])${m.id}\\b`);
    assert.ok(!bare.test(out) || memberPath(m.id) === m.id, `a flat "${m.id}" survived: ${out}`);
  }
});

/* --------------------------------------------------------------------------- filtering */

const midiScript = { id: 's', source: 'function onX(){ sendCC(1, 74, 100) }' };

test('a panel pinning a manual list hides the rest of the API from the main list', () => {
  const body = html({ panel: { id: 'p', scripting: { modules: ['ce.math'] }, scripts: [midiScript] } });

  assert.ok(body.includes('ce.math'), 'the declared module is shown');
  assert.ok(body.includes('Not enabled'), 'and the rest is collapsed behind one heading');
  // The off section is collapsed, so ce.midi's members are not in the document at all.
  // Match the rendered ITEM, not a bare substring — "ce.midi.sendCC" also appears in the
  // spelling toggle's tooltip, which would make this assertion pass for the wrong reason.
  assert.ok(!body.includes('>ce.midi.sendCC<'), 'a member of an undeclared module is not offered');
});

test('a panel on auto is NOT filtered, because you cannot discover what you have not used', () => {
  // Auto derives the module list from the scripts. Filtering it would mean the picker only ever
  // shows verbs already in the source — the opposite of what a picker is for. Inserting the call
  // is what turns the module on.
  const body = html({ panel: { id: 'p', scripts: [midiScript] } });
  assert.ok(!body.includes('Not enabled'), 'nothing is held back on auto');
  assert.ok(body.includes('>ce.components.setlist.next<'),
    'including a module the scripts have never mentioned');
});

test('with no panel the picker shows everything rather than nothing', () => {
  const body = html({});
  assert.ok(!body.includes('Not enabled'));
  assert.ok(body.includes('>ce.midi.sendCC<'));
});

test('searching opens the not-enabled section, so a hit is never hidden behind a count', () => {
  const panel = { id: 'p', scripting: { modules: ['ce.math'] }, scripts: [midiScript] };
  const collapsed = html({ panel });
  assert.ok(!collapsed.includes('>ce.midi.sendCC<'), 'closed by default');

  const searched = html({ panel, initialQuery: 'sendCC' });
  assert.ok(searched.includes('>ce.midi.sendCC<'),
    'a search that matches a disabled module shows what it matched');
  assert.ok(searched.includes('pitem-off'), 'and marks it as not enabled rather than offering it');
});

test('the enable affordance only appears when something can act on it', () => {
  const panel = { id: 'p', scripting: { modules: ['ce.math'] }, scripts: [midiScript] };
  const without = html({ panel, initialQuery: 'sendCC' });
  assert.ok(!without.includes('penable'), 'no handler, no button — never shown-and-inert');

  const with_ = html({ panel, initialQuery: 'sendCC', onEnableModule: () => {} });
  assert.ok(with_.includes('penable'), 'with a handler, the module can be switched on from here');
});

test('search reaches a member by its module path, not just its flat name', () => {
  // Typing what you would write is the point: `ce.midi.send` has to find the send verbs.
  const groups = membersByModule();
  const q = 'ce.midi.sendnote';
  const hit = groups.flatMap((g) => g.members)
    .filter((m) => memberPath(m.id).toLowerCase().includes(q));
  assert.deepEqual(hit.map((m) => m.id), ['sendNote', 'sendNoteOff']);
});

/* ------------------------------------------------------- narrowing to the target control */
// The complaint this answers: the API is organised by module, so nothing ever told you which of
// it applied to the control you were on. `arpRate` was a name you could find in the tree, insert
// into a Slider's script, and only discover was meaningless by running it.

const slider = { name: 'cutoffslider', type: 'Slider', leaves: ['value', 'min', 'max'] };
const arp = { name: 'myarp', type: 'Arp', leaves: ['value'] };

test('a script on a Slider is not offered the Arpeggiator verbs', () => {
  const body = html({ controls: [slider, arp], target: 'cutoffslider' });

  assert.ok(!body.includes('>ce.components.arp.rate<'), 'a Slider has no Arp section');
  assert.ok(!body.includes('>ce.components.lcd.text<'), 'nor an Lcd one');
  assert.ok(body.includes('Not for a Slider'), 'and it says so, rather than silently thinning out');

  // The cross-cutting half is untouched: you can still send MIDI and draw from a Slider's script.
  assert.ok(body.includes('>ce.midi.sendCC<'));
  assert.ok(body.includes('>ce.draw.arc<'));
});

test('a script on an Arpeggiator IS offered them', () => {
  const body = html({ controls: [slider, arp], target: 'myarp' });
  assert.ok(body.includes('>ce.components.arp.rate<'), 'the family it actually has');
  assert.ok(!body.includes('>ce.components.lcd.text<'), 'and not the ones it has not');
});

test('the wildcard target narrows nothing, because it could run on anything', () => {
  for (const target of ['*', '', 'self']) {
    const body = html({ controls: [slider, arp], target });
    assert.ok(body.includes('>ce.components.arp.rate<'), `target "${target}" holds nothing back`);
    assert.ok(!body.includes('Not for a'), `target "${target}" shows no narrowing notice`);
  }
});

test('a target the control list does not know narrows nothing either', () => {
  // "We cannot tell what this is" must not render as "this can do nothing".
  const body = html({ controls: [slider], target: 'somethingElse' });
  assert.ok(body.includes('>ce.components.arp.rate<'));
  const untyped = html({ controls: [{ name: 'x', type: '' }], target: 'x' });
  assert.ok(untyped.includes('>ce.components.arp.rate<'), 'and neither does a control with no type');
});

test('the narrowing is a toggle, not a wall — the whole API is one click away', () => {
  const body = html({ controls: [slider], target: 'cutoffslider' });
  assert.ok(body.includes('picker-narrow'), 'the target chip is shown');
  assert.ok(body.includes('this control') && body.includes('>all<'),
    'with both sides of the toggle offered');
});

test('narrowing the Paths tab: only the target control, and already open', () => {
  const body = html({ controls: [slider, arp], target: 'cutoffslider', initialTab: 'paths' });
  assert.ok(!body.includes('myarp'), 'the other controls are out of the way');
  assert.ok(body.includes('cutoffslider.min'), 'and the target is expanded, not one dead collapsed row');
});
