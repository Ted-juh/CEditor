// scriptControlSources.test.js — one control driving another, from a script.
//
// Nine fields hold the ID of a control that feeds this one: the Meter's level, the Envelope's
// playhead, the Router's input, the LCD's value/brightness/backlight, the Pixel display's two, and
// the Arpeggiator's Chord Pad. A script could not set any of them, and the reason is worth stating
// because it is not "nobody wrote the verb": the RULE for what may be named lived inside a Svelte
// component, as a `$derived` block computing a `<select>`'s options — copy-pasted five times under
// four different names for what turned out to be three distinct rules.
//
// So the fix had two halves. The rule moved to controlSources.js, which the pickers and the verbs
// both read; and the verb takes a NAME, because a script addresses controls by name and an opaque
// `ctl_…` id is not something it could ever have got hold of.
//
// The test that matters most here is the last one: a script may set exactly what the inspector
// offers. Everything else follows from that.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get } from 'svelte/store';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import {
  COMPONENT_FAMILIES, COMPONENT_VERBS, LINK_KIND, verbSignature, verbSummary,
} from '../src/CE_Application/scripting/componentVerbs.js';
import {
  SOURCE_KINDS, SOURCE_KIND_IDS, controlSources, sourceAccepts, sourceName,
} from '../src/CE_Application/utils/controlSources.js';

const here = dirname(fileURLToPath(import.meta.url));
const section = (file) =>
  readFileSync(join(here, '..', 'src', 'CE_Application', 'sections', file), 'utf8');

/** Every link verb in the surface, with the family it belongs to. */
const LINKS = COMPONENT_FAMILIES.flatMap((fam) =>
  fam.verbs.filter((verb) => verb.k === LINK_KIND).map((verb) => ({ fam, verb })));

/** A panel with a Meter, a knob to drive it, a Chord Pad, and a Label that drives nothing. */
function withPanel(fn) {
  const controls = [
    createControl('Meter', { name: 'Level' }),
    createControl('Knob', { name: 'Cutoff' }),
    createControl('ChordPad', { name: 'Chords' }),
    createControl('Arp', { name: 'Arp' }),
    createControl('Label', { name: 'Title' }),
  ];
  panels.set([{
    id: 'p', name: 'P', controls,
    scripting: { modules: ['ce.core', 'ce.components.meter', 'ce.components.arp'] },
  }]);
  activePanelId.set('p');
  clearScriptTrace();
  try {
    const api = scriptApiForTesting('', 'link-script');
    const live = (name) => get(panels)[0].controls.find((c) => c._children.Core.name === name);
    return fn(api.ce.components, live, () => get(panels)[0].controls);
  } finally { panels.set([]); }
}

const said = () => get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');

/* ------------------------------------------------------------------- naming a source */

test('a link is set by name, and reads back by name', () => {
  withPanel((c, live) => {
    assert.equal(c.meter.source('Level', 'Cutoff'), true);
    // Stored as the id — that is what the renderer resolves — and never shown as one.
    assert.equal(live('Level')._children.Meter.valueSourceId, live('Cutoff')._children.Core.id);
    assert.equal(c.meter.read('Level', 'source'), 'Cutoff');
    assert.equal(c.meter.read('Level').source, 'Cutoff', 'and in the whole-component read too');
  });
});

test('a name the panel does not have is refused, and says so', () => {
  withPanel((c, live) => {
    assert.equal(c.meter.source('Level', 'Resonance'), false);
    assert.equal(live('Level')._children.Meter.valueSourceId, '');
    assert.match(said(), /no control named "Resonance"/);
  });
});

test('a control of the wrong kind is refused, and says what would have been right', () => {
  // The failure this is really for: a link to a control that cannot produce a value looks exactly
  // like a working link until the meter fails to move.
  withPanel((c) => {
    assert.equal(c.meter.source('Level', 'Title'), false, 'a Label drives nothing');
    assert.match(said(), /not a knob, slider or other range control/);

    assert.equal(c.arp.link('Arp', 'Cutoff'), false, 'the arp takes notes, not values');
    assert.match(said(), /not a Chord Pad/);
    assert.equal(c.arp.link('Arp', 'Chords'), true);
  });
});

test('a control cannot drive itself', () => {
  withPanel((c) => {
    assert.equal(c.meter.source('Level', 'Level'), false);
    assert.match(said(), /cannot drive itself/);
  });
});

test('no name unlinks, and unlinking twice is success rather than an error', () => {
  // "— Static / bound level —" is a real setting, not the absence of one.
  withPanel((c, live) => {
    c.meter.source('Level', 'Cutoff');
    assert.equal(c.meter.source('Level'), true);
    assert.equal(live('Level')._children.Meter.valueSourceId, '');
    assert.equal(c.meter.read('Level', 'source'), '');
    assert.equal(c.meter.source('Level', ''), true, 'already unlinked is still success');
    assert.match(said(), /already unlinked/);
  });
});

test('a link to a control that no longer exists reads back as unlinked', () => {
  // Truthful about BEHAVIOUR: the meter is running on its static value either way, and answering
  // with a dangling `ctl_…` would be worse than useless to a script trying to decide anything.
  withPanel((c, live, all) => {
    c.meter.source('Level', 'Cutoff');
    assert.equal(c.meter.read('Level', 'source'), 'Cutoff');
    panels.update((list) => [{
      ...list[0], controls: all().filter((x) => x._children.Core.name !== 'Cutoff'),
    }]);
    assert.equal(c.meter.read('Level', 'source'), '');
    assert.equal(sourceName(all(), live('Level')._children.Meter.valueSourceId), '');
  });
});

/* ---------------------------------------------------- the picker and the verb are one rule */

test('every editor picker offers exactly what its verb accepts', () => {
  // The whole point of the phase. Each of these `<select>`s used to compute its own candidate list
  // inline; five copies of three rules is how the Meter ends up accepting something the Router
  // refuses. Now the editors call controlSources() and the verbs call sourceAccepts(), and this
  // asserts no editor kept a private copy.
  const EDITORS = [
    'MeterEditor.svelte', 'ArpEditor.svelte', 'RouterEditor.svelte',
    'EnvelopeEditor.svelte', 'DisplayEditor.svelte', 'PixelDisplayEditor.svelte',
  ];
  for (const file of EDITORS) {
    const source = section(file);
    assert.ok(source.includes("from '../utils/controlSources.js'"),
      `${file} does not import the shared rule`);
    assert.ok(!/_children\?\.Behavior\?\.family[^\n]*'range'/.test(source),
      `${file} still filters its own source list inline`);
  }

  // …and the kinds the verbs name are kinds that exist.
  for (const { fam, verb } of LINKS) {
    assert.ok(SOURCE_KINDS[verb.sourceKind],
      `${fam.id}.${verb.v} names source kind "${verb.sourceKind}", which is not one`);
  }
  assert.equal(LINKS.length, 9, 'nine fields wire one control to another');
});

test('the candidate list and the acceptance check agree, control by control', () => {
  withPanel((c, live, all) => {
    const controls = all();
    for (const kind of SOURCE_KIND_IDS) {
      const offered = new Set(controlSources(controls, kind, '').map((s) => s.id));
      for (const control of controls) {
        const id = String(control._children.Core.id);
        assert.equal(offered.has(id), sourceAccepts(kind, control, ''),
          `${kind}: the picker and the verb disagree about ${control._children.Core.name}`);
      }
    }
    // Self is excluded from the list the same way it is refused by the check.
    const selfId = String(live('Level')._children.Core.id);
    assert.ok(!controlSources(controls, 'any', selfId).some((s) => s.id === selfId));
    assert.equal(sourceAccepts('any', live('Level'), selfId), false);
  });
});

test('every link verb is declared the way the reference will describe it', () => {
  // The flat name is minted downstream, so this reads the flattened list rather than the families.
  const flat = COMPONENT_VERBS.filter((verb) => verb.k === LINK_KIND);
  assert.equal(flat.length, 9);
  for (const verb of flat) {
    assert.ok(verb.f.endsWith('Id'), `${verb.id} writes ${verb.f}, which is not an id field`);
    // Optional argument, boolean answer — a script has to be able to tell a refused link from a
    // successful one, which is the whole reason these report at all.
    assert.equal(verbSignature(verb), `${verb.id}(target [, name]) -> boolean`);
    // The reference text has to tell a reader it takes a name and that an empty one unlinks —
    // the two things that are not guessable from the signature alone.
    const summary = verbSummary(verb);
    assert.match(summary, /[Nn]ame/, `${verb.id}: its summary never mentions a name`);
    assert.match(summary, /unlink/, `${verb.id}: its summary never says how to clear it`);
  }
  // Nine distinct flat names: two families spell `brightnessSource`, so the prefix has to be doing
  // its job.
  assert.equal(new Set(flat.map((verb) => verb.id)).size, 9);
});
