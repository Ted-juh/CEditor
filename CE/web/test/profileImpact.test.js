// profileImpact.test.js — who depends on a device profile, and what an edit to it breaks.
//
// A binding names a parameter by STRING id. Rename one and every control pointing at the old id
// keeps pointing at nothing — no error, no warning, the knob just stops moving the synth, and the
// fault looks like a cable. That is the break this whole module exists to make visible, and the
// reason a rename is treated exactly as harshly as a removal.
//
// The two subtler kinds are pinned hardest, because they are the ones a set-difference over ids
// would miss entirely: a retyped parameter whose bindings survive and start sending values the
// device does not accept, and a narrowed range whose bound controls now overshoot it.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SHARE_STRIPPED_KEYS, collectBindings, impactOfChange, profileConsumers, profileForSharing,
  shareManifest, shareReadiness,
} from '../src/CE_Application/utils/profileImpact.js';

function control(id, name, bindings) {
  return {
    _children: {
      Core: { id, name },
      Behavior: { min: 0, max: 127 },
      DeviceBindings: { bindings: bindings.map((b) => ({ kind: 'deviceParameter', port: 'value', deviceRole: 'main', ...b })) },
    },
  };
}

const PANELS = [
  {
    id: 'p1',
    name: 'Lead',
    controls: [
      control('c1', 'Cutoff', [{ parameterId: 'filter.cutoff' }]),
      control('c2', 'Cutoff 2', [{ parameterId: 'filter.cutoff' }]),
      control('c3', 'Wave', [{ parameterId: 'osc.wave' }]),
    ],
  },
  { id: 'p2', name: 'Pad', controls: [control('c4', 'Res', [{ parameterId: 'filter.res' }])] },
];

const ROLES = { main: 'gaia' };

const BEFORE = {
  label: 'GAIA', manufacturer: 'Roland', version: '1.0', identity: 'F0...',
  parameters: [
    { id: 'filter.cutoff', label: 'Cutoff', type: 'int', min: 0, max: 127, messageRecipe: 'cc74' },
    { id: 'filter.res', label: 'Resonance', type: 'int', min: 0, max: 127, messageRecipe: 'cc71' },
    { id: 'osc.wave', label: 'Waveform', type: 'choice', values: ['saw', 'square', 'sine'], messageRecipe: 'cc70' },
  ],
};

// --- who depends on it ---------------------------------------------------------------------------

test('bindings are collected across panels, with the control range they carry', () => {
  const bindings = collectBindings(PANELS, ROLES);
  assert.equal(bindings.length, 4);
  assert.equal(bindings[0].profileId, 'gaia');
  assert.equal(bindings[0].controlMax, 127, 'the control range is what makes a narrowed parameter real');
  assert.equal(bindings[0].panelName, 'Lead');
});

test('a binding whose role is unmapped is reported, not dropped', () => {
  // "You have bindings pointing at a device you have not chosen" is itself worth seeing.
  const bindings = collectBindings(PANELS, {});
  assert.equal(bindings.length, 4);
  assert.ok(bindings.every((binding) => binding.profileId === ''));
});

test('a disabled DeviceBindings section contributes nothing', () => {
  const off = [{ id: 'p', name: 'P', controls: [{
    _children: {
      Core: { id: 'c', name: 'C' },
      DeviceBindings: { enabled: false, bindings: [{ kind: 'deviceParameter', parameterId: 'x' }] },
    },
  }] }];
  assert.deepEqual(collectBindings(off, ROLES), []);
});

test('consumers are grouped by parameter and sorted by how many point at it', () => {
  // The parameter forty controls point at is the one to leave alone; it belongs at the top.
  const consumers = profileConsumers('gaia', PANELS, ROLES);
  assert.equal(consumers.total, 4);
  assert.deepEqual(consumers.panels, ['Lead', 'Pad']);
  assert.equal(consumers.parameters[0].parameterId, 'filter.cutoff');
  assert.equal(consumers.parameters[0].count, 2);
});

test('a profile nothing binds to reports zero rather than everything', () => {
  assert.equal(profileConsumers('some-other-synth', PANELS, ROLES).total, 0);
});

// --- what an edit breaks ---------------------------------------------------------------------------

test('an unchanged profile breaks nothing, and says so as a state rather than an empty list', () => {
  const impact = impactOfChange(BEFORE, BEFORE, collectBindings(PANELS, ROLES));
  assert.equal(impact.safe, true);
  assert.equal(impact.affectedBindings, 0);
  assert.deepEqual(impact.findings, []);
});

test('a removed parameter is reported with the bindings it kills', () => {
  const after = { ...BEFORE, parameters: BEFORE.parameters.filter((p) => p.id !== 'filter.cutoff') };
  const impact = impactOfChange(BEFORE, after, collectBindings(PANELS, ROLES));
  assert.equal(impact.safe, false);
  assert.equal(impact.findings[0].kind, 'removed');
  assert.equal(impact.findings[0].bindings.length, 2);
  assert.equal(impact.affectedBindings, 2);
});

test('a rename is as broken as a removal, and is caught even though the parameter is still there', () => {
  // The one that reads as harmless in a diff. Matched on label AND message shape, because the id is
  // the thing that changed so it cannot be the evidence.
  const after = {
    ...BEFORE,
    parameters: BEFORE.parameters.map((p) => (p.id === 'filter.cutoff' ? { ...p, id: 'flt.cut' } : p)),
  };
  const impact = impactOfChange(BEFORE, after, collectBindings(PANELS, ROLES));
  const finding = impact.findings.find((f) => f.parameterId === 'filter.cutoff');
  assert.equal(finding.kind, 'renamed');
  assert.equal(finding.newId, 'flt.cut');
  assert.equal(finding.bindings.length, 2);
  assert.equal(impact.added, 0, 'the renamed parameter is not also counted as a new one');
});

test('an ambiguous rename is reported as a removal rather than guessed', () => {
  // Two candidates with the same label and shape are genuinely ambiguous; picking one would report
  // a rename that never happened, which is worse than reporting a removal that was one.
  const before = { parameters: [{ id: 'a', label: 'Level', messageRecipe: 'cc7' }] };
  const after = {
    parameters: [
      { id: 'b', label: 'Level', messageRecipe: 'cc7' },
      { id: 'c', label: 'Level', messageRecipe: 'cc7' },
    ],
  };
  assert.equal(impactOfChange(before, after, []).findings[0].kind, 'removed');
});

test('a parameter with no label cannot be matched as a rename', () => {
  const before = { parameters: [{ id: 'a', messageRecipe: 'cc7' }] };
  const after = { parameters: [{ id: 'b', messageRecipe: 'cc7' }] };
  assert.equal(impactOfChange(before, after, []).findings[0].kind, 'removed');
});

test('a retyped parameter keeps its bindings and starts sending nonsense', () => {
  const after = {
    ...BEFORE,
    parameters: BEFORE.parameters.map((p) => (p.id === 'filter.cutoff' ? { ...p, type: 'choice', values: ['a', 'b'] } : p)),
  };
  const finding = impactOfChange(BEFORE, after, collectBindings(PANELS, ROLES)).findings[0];
  assert.equal(finding.kind, 'retyped');
  assert.match(finding.detail, /int became choice/);
  assert.equal(finding.bindings.length, 2);
});

test('losing a choice is a break even when the type did not change', () => {
  const after = {
    ...BEFORE,
    parameters: BEFORE.parameters.map((p) => (p.id === 'osc.wave' ? { ...p, values: ['saw', 'square'] } : p)),
  };
  const finding = impactOfChange(BEFORE, after, collectBindings(PANELS, ROLES)).findings[0];
  assert.equal(finding.kind, 'retyped');
  assert.match(finding.detail, /sine/);
});

test('adding a choice is not a break', () => {
  const after = {
    ...BEFORE,
    parameters: BEFORE.parameters.map((p) => (p.id === 'osc.wave' ? { ...p, values: ['saw', 'square', 'sine', 'tri'] } : p)),
  };
  assert.equal(impactOfChange(BEFORE, after, collectBindings(PANELS, ROLES)).safe, true);
});

test('a narrowed range counts only the controls that actually overshoot it', () => {
  // A control that never went that high was never going to send an out-of-range value, and
  // reporting it would bury the ones that will.
  const after = {
    ...BEFORE,
    parameters: BEFORE.parameters.map((p) => (p.id === 'filter.cutoff' ? { ...p, max: 100 } : p)),
  };
  const wide = impactOfChange(BEFORE, after, collectBindings(PANELS, ROLES));
  assert.equal(wide.findings[0].kind, 'narrowed');
  assert.equal(wide.findings[0].bindings.length, 2, 'both controls run to 127');

  const narrowPanels = [{ id: 'p', name: 'P', controls: [{
    _children: {
      Core: { id: 'c', name: 'Small' },
      Behavior: { min: 0, max: 64 },
      DeviceBindings: { bindings: [{ kind: 'deviceParameter', parameterId: 'filter.cutoff', deviceRole: 'main', port: 'value' }] },
    },
  }] }];
  const narrow = impactOfChange(BEFORE, after, collectBindings(narrowPanels, ROLES));
  assert.equal(narrow.findings[0].kind, 'narrowed', 'still listed — a shared profile breaks panels this machine cannot see');
  assert.equal(narrow.findings[0].bindings.length, 0, 'a control that only goes to 64 cannot overshoot 100');
  assert.equal(narrow.safe, true, 'safe is about THIS machine, and here nothing local breaks');
});

test('a widened range is not a break', () => {
  const after = {
    ...BEFORE,
    parameters: BEFORE.parameters.map((p) => (p.id === 'filter.cutoff' ? { ...p, max: 255 } : p)),
  };
  assert.equal(impactOfChange(BEFORE, after, collectBindings(PANELS, ROLES)).safe, true);
});

test('new parameters are counted and break nothing', () => {
  const after = { ...BEFORE, parameters: [...BEFORE.parameters, { id: 'amp.level', label: 'Level', type: 'int', min: 0, max: 127 }] };
  const impact = impactOfChange(BEFORE, after, collectBindings(PANELS, ROLES));
  assert.equal(impact.safe, true);
  assert.equal(impact.added, 1);
});

test('findings are ordered by how much damage they do', () => {
  const after = {
    ...BEFORE,
    parameters: [{ id: 'osc.wave', label: 'Waveform', type: 'choice', values: ['saw', 'square', 'sine'], messageRecipe: 'cc70' }],
  };
  const impact = impactOfChange(BEFORE, after, collectBindings(PANELS, ROLES));
  assert.equal(impact.findings[0].parameterId, 'filter.cutoff', 'two bindings beats one');
  assert.equal(impact.findings[0].bindings.length, 2);
});

// --- sharing ---------------------------------------------------------------------------------------

test('the machine-specific keys are stripped, and named', () => {
  // A profile describes an instrument; the ports a synth happened to be plugged into describe the
  // author's rig, which is noise at best and a leak at worst.
  const profile = { ...BEFORE, midiInput: 'UM-ONE', midiDestination: 'UM-ONE', filePath: '/home/me/gaia.json' };
  const manifest = shareManifest(profile);
  assert.deepEqual(manifest.stripped, ['filePath', 'midiDestination', 'midiInput']);
  assert.ok(manifest.carried.includes('parameters'));

  const shared = profileForSharing(profile);
  for (const key of SHARE_STRIPPED_KEYS) assert.equal(Object.hasOwn(shared, key), false, key);
  assert.equal(shared.parameters.length, 3);
});

test('a profile with nothing machine-specific strips nothing', () => {
  assert.deepEqual(shareManifest(BEFORE).stripped, []);
});

test('readiness is a softer question than validity', () => {
  // A profile can be perfectly valid and no use to anybody else.
  assert.equal(shareReadiness(BEFORE).ready, true);

  const bare = { parameters: [] };
  const readiness = shareReadiness(bare);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.missing.some((entry) => entry.includes('name')));
  assert.ok(readiness.missing.some((entry) => entry.includes('parameter')));
});

test('a missing identity is mentioned but does not block sharing', () => {
  // Plenty of useful profiles are for devices that never answer an identity request.
  const readiness = shareReadiness({ ...BEFORE, identity: null, deviceId: null });
  assert.equal(readiness.ready, true);
  assert.ok(readiness.missing.some((entry) => entry.startsWith('an identity')));
});
