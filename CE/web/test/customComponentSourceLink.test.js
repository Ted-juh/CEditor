// customComponentSourceLink.test.js — an instance against its library package: diff, update, detach.
//
// The Public API card used to compare fingerprints and could only say "edited since source package
// load" — which it said about nearly every instance on a real panel, because placing one gives it a
// position and a layer, and the fingerprint (rightly) hashes those. These tests pin the comparison
// that replaces it: placement and published values are this copy's own and never count as drift;
// design differences are split into what the library changed and what this copy changed; and an
// update keeps the copy's own values and REFUSES rather than discarding design edits it cannot keep.
//
// The components are the fourteen in CE/qa/QA-07-packages.cepanel, the same evidence
// customComponentFingerprint.test.js reads.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import {
  createCustomComponentExportEnvelope, customComponentPackageId, instantiateCustomComponentPackageControl,
} from '../src/CE_Application/utils/customComponentPackage.js';
import {
  compareVersions, describeSourceDiff, detachCustomComponentPatch, diffCustomComponentAgainstSource,
  findSourceEntries, flattenControl, isPanelRouteLink, packageFamily, rebaseCustomComponentOnSource,
} from '../src/CE_Application/utils/customComponentSourceLink.js';

const here = dirname(fileURLToPath(import.meta.url));
const sheet = resolve(here, '..', '..', 'qa', 'QA-07-packages.cepanel');
const customs = deserializePanel(readFileSync(sheet, 'utf8'), '', 'qa')
  .controls.filter((c) => c._children?.Core?.controlType === 'CustomComponent');

const clone = (value) => JSON.parse(JSON.stringify(value));

function entryFor(control, metadata = {}, savedAt = '2026-01-01T00:00:00.000Z') {
  const envelope = createCustomComponentExportEnvelope(control, metadata);
  return {
    id: customComponentPackageId(envelope),
    savedAt,
    name: envelope.metadata.name,
    version: envelope.metadata.version,
    fingerprint: envelope.fingerprint,
    component: envelope.component,
    envelope,
  };
}

/** What `addCustomComponentPackage` does to an instance: an id, a position, a layer. */
function place(entry, x = 412, y = 96) {
  const instance = instantiateCustomComponentPackageControl(entry.envelope, {
    id: `ctrl_${x}_${y}`,
    Transform: { x, y },
  });
  instance._children.Core.layer = 'Controls';
  return instance;
}

const slider = () => clone(customs.find((c) => c._children.Core.name === 'Circular Tick Slider'));

test('every component in the sheet, placed on a panel, reads as up to date', () => {
  const wrong = [];
  for (const control of customs) {
    const entry = entryFor(control, { version: '1.0.0' });
    const instance = place(entry);
    const report = diffCustomComponentAgainstSource(instance, [entry]);
    if (report.status !== 'current' || report.design.length) {
      wrong.push(`${control._children.Core.name}: ${report.status}, ${report.design.map((row) => row.path).join(', ')}`);
    }
  }
  assert.deepEqual(wrong, [], 'a position, a layer and an id are not edits');
});

test('a package whose author left the addressable name blank still places as up to date', () => {
  // Instantiation fills the blank in with the package id — a stamp, not an edit. Every component in
  // QA-07 has a name set, so the sheet alone never showed this; the library tab's own saves do.
  const control = slider();
  control._children.ExternalAPI.addressableName = '';
  const entry = entryFor(control, { version: '1.0.0' });
  const instance = place(entry);
  assert.notEqual(instance._children.ExternalAPI.addressableName, '');
  assert.equal(diffCustomComponentAgainstSource(instance, [entry]).status, 'current');
  const updated = rebaseCustomComponentOnSource(instance, entry, { report: diffCustomComponentAgainstSource(instance, [entry]) });
  assert.equal(updated.control._children.ExternalAPI.addressableName, instance._children.ExternalAPI.addressableName);
});

test('moving, resizing and renaming a copy is still not drift', () => {
  const entry = entryFor(slider(), { version: '1.0.0' });
  const instance = place(entry);
  Object.assign(instance._children.Transform, { x: 5, y: 700, width: 333, height: 290 });
  instance._children.Core.name = 'CutoffDial';
  instance._children.Designer.selectedLayer = 'pointer';
  const report = diffCustomComponentAgainstSource(instance, [entry]);
  assert.equal(report.status, 'current');
  assert.equal(report.instance > 0, true, 'counted as instance differences, not hidden');
});

test('a published value set on the copy is an override, not an edit', () => {
  const entry = entryFor(slider(), { version: '1.0.0' });
  const instance = place(entry);
  instance._children.Parts._children.label._children.Text.content = 'CUTOFF';
  const report = diffCustomComponentAgainstSource(instance, [entry]);
  assert.equal(report.status, 'current');
  assert.deepEqual(report.overrides.map((row) => row.path), ['Parts.label.Text.content']);
  assert.match(describeSourceDiff(report), /1 published value/);
});

test('a design edit on the copy is reported as the copy\'s own', () => {
  const entry = entryFor(slider(), { version: '1.0.0' });
  const instance = place(entry);
  instance._children.Parts._children.pointer.Transform = { ...(instance._children.Parts._children.pointer.Transform ?? {}), width: 99 };
  const report = diffCustomComponentAgainstSource(instance, [entry]);
  assert.equal(report.status, 'edited');
  assert.equal(report.localEdits, 1);
  assert.equal(report.design[0].origin, 'local');
  assert.equal(report.design[0].group, 'Parts › pointer');
});

/** One design change in the library: a new key on a part's renderer meta. */
function tint(control) {
  control._children.Parts._children.dialTrack.meta.tint = 'FFFF0000';
}

function newerVersion(mutate) {
  const v1Control = slider();
  const v1 = entryFor(v1Control, { version: '1.0.0' }, '2026-01-01T00:00:00.000Z');
  const v2Control = clone(v1Control);
  mutate(v2Control);
  const v2 = entryFor(v2Control, { version: '1.1.0' }, '2026-02-01T00:00:00.000Z');
  return { v1, v2 };
}

test('a newer library version is an update, and says what it changes', () => {
  const { v1, v2 } = newerVersion((c) => { tint(c); });
  const instance = place(v1);
  const report = diffCustomComponentAgainstSource(instance, [v2, v1]);
  assert.equal(report.status, 'update');
  assert.equal(report.baseKnown, true);
  assert.equal(report.latest.version, '1.1.0');
  assert.equal(report.base.version, '1.0.0');
  assert.equal(report.libraryChanges, 1);
  assert.equal(report.design[0].origin, 'library');
  assert.match(describeSourceDiff(report), /Library 1\.1\.0 changes 1 thing in Parts/);
});

test('an update takes the new design and keeps position, name, routes, bindings and overrides', () => {
  const { v1, v2 } = newerVersion((c) => { tint(c); });
  const instance = place(v1, 40, 50);
  instance._children.Core.name = 'CutoffDial';
  instance._children.Transform.width = 222;
  instance._children.Parts._children.label._children.Text.content = 'CUTOFF';
  instance._children.ValueChannels._children.mainValue.currentValue = 12;
  instance._children.DeviceBindings = { _type: 'DeviceBindings', bindings: [{ kind: 'deviceParameter', parameterId: 'cutoff' }] };
  instance._children.Links._children.toMeter = {
    _type: 'Link', name: 'toMeter', type: 'external-output', source: 'mainValue', targetControlId: 'ctrl_meter', targetPort: 'level',
  };
  const report = diffCustomComponentAgainstSource(instance, [v2, v1]);
  assert.equal(report.status, 'update');

  const result = rebaseCustomComponentOnSource(instance, v2, { report, importedAt: '2026-03-01T00:00:00.000Z' });
  assert.equal(result.refused, undefined);
  const next = result.control._children;
  assert.equal(next.Parts._children.dialTrack.meta.tint, 'FFFF0000', 'the library change arrived');
  assert.equal(next.Core.id, instance._children.Core.id);
  assert.equal(next.Core.name, 'CutoffDial');
  assert.equal(next.Core.layer, 'Controls');
  assert.equal(next.Transform.x, 40);
  assert.equal(next.Transform.width, 222);
  assert.equal(next.Parts._children.label._children.Text.content, 'CUTOFF');
  assert.equal(next.ValueChannels._children.mainValue.currentValue, 12);
  assert.equal(next.DeviceBindings.bindings[0].parameterId, 'cutoff');
  assert.equal(isPanelRouteLink(next.Links._children.toMeter), true);
  assert.equal(next.Designer.packageVersion, '1.1.0');
  assert.equal(next.Designer.sourcePackage.fingerprint, v2.fingerprint);
  // mainValue is a published input, so the value this copy moved it to is an override too.
  assert.deepEqual(result.carried.sort(), ['Parts.label.Text.content', 'ValueChannels.mainValue.currentValue']);

  const after = diffCustomComponentAgainstSource(result.control, [v2, v1]);
  assert.equal(after.status, 'current', 'an updated copy reads as up to date');
  assert.deepEqual(after.overrides.map((row) => row.path).sort(), ['Parts.label.Text.content', 'ValueChannels.mainValue.currentValue']);
});

test('a published default the library changed reaches copies that never set it', () => {
  const { v1, v2 } = newerVersion((c) => { c._children.Parts._children.label._children.Text.content = 'SWEEP'; });
  const untouched = place(v1);
  const customised = place(v1, 10, 10);
  customised._children.Parts._children.label._children.Text.content = 'CUTOFF';

  const a = rebaseCustomComponentOnSource(untouched, v2, { report: diffCustomComponentAgainstSource(untouched, [v2, v1]) });
  const b = rebaseCustomComponentOnSource(customised, v2, { report: diffCustomComponentAgainstSource(customised, [v2, v1]) });
  assert.equal(a.control._children.Parts._children.label._children.Text.content, 'SWEEP');
  assert.equal(b.control._children.Parts._children.label._children.Text.content, 'CUTOFF');
});

test('a new published default is an update for the copies that never set it, and nothing for the rest', () => {
  const { v1, v2 } = newerVersion((c) => { c._children.Parts._children.label._children.Text.content = 'SWEEP'; });
  const untouched = diffCustomComponentAgainstSource(place(v1), [v2, v1]);
  assert.equal(untouched.status, 'update', 'offered, not reported as this copy\'s own value');
  assert.deepEqual(untouched.design.map((row) => `${row.path}:${row.origin}`), ['Parts.label.Text.content:library']);
  assert.deepEqual(untouched.overrides, []);

  const customised = place(v1, 10, 10);
  customised._children.Parts._children.label._children.Text.content = 'CUTOFF';
  const report = diffCustomComponentAgainstSource(customised, [v2, v1]);
  assert.equal(report.status, 'current', 'the only change is to a value this copy sets itself');
  assert.match(describeSourceDiff(report), /only changes values this copy sets itself/);
});

test('a copy with its own design edits is not silently overwritten', () => {
  const { v1, v2 } = newerVersion((c) => { tint(c); });
  const instance = place(v1);
  instance._children.Parts._children.pointer.hidden = true;
  const report = diffCustomComponentAgainstSource(instance, [v2, v1]);
  assert.equal(report.status, 'diverged');
  assert.equal(report.localEdits, 1);
  assert.equal(report.libraryChanges, 1);

  const refused = rebaseCustomComponentOnSource(instance, v2, { report });
  assert.equal(refused.control, undefined);
  assert.match(refused.refused, /1 design edit/);

  const forced = rebaseCustomComponentOnSource(instance, v2, { report, discardLocalEdits: true });
  assert.equal(forced.discarded, 1);
  assert.equal(forced.control._children.Parts._children.pointer.hidden, undefined);
});

test('when the placed-from version is gone, differences have unknown origin and block an update', () => {
  const { v1, v2 } = newerVersion((c) => { tint(c); });
  const instance = place(v1);
  const report = diffCustomComponentAgainstSource(instance, [v2]);
  assert.equal(report.baseKnown, false);
  assert.equal(report.status, 'diverged');
  assert.equal(report.design.every((row) => row.origin === 'unknown'), true);
  assert.match(describeSourceDiff(report), /origin is unknown/);
  assert.ok(rebaseCustomComponentOnSource(instance, v2, { report }).refused);
});

test('a copy whose package is not in this library says so', () => {
  const entry = entryFor(slider(), { version: '1.0.0' });
  const report = diffCustomComponentAgainstSource(place(entry), []);
  assert.equal(report.status, 'missing');
  assert.equal(diffCustomComponentAgainstSource(slider(), [entry]).status, 'unlinked');
});

test('versions compare numerically and the newest is the one offered', () => {
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
  assert.equal(compareVersions('2.0', '2.0.0'), 0);
  assert.equal(packageFamily('macro-knob@1-2-0'), 'macro-knob');
  const base = slider();
  const entries = ['1.9.0', '1.10.0', '1.2.0'].map((version) => entryFor(base, { version }));
  const found = findSourceEntries(place(entries[0]), entries);
  assert.deepEqual(found.versions.map((entry) => entry.version), ['1.10.0', '1.9.0', '1.2.0']);
  assert.equal(found.latest.version, '1.10.0');
});

test('detach drops the link and nothing else', () => {
  const patch = detachCustomComponentPatch();
  assert.equal(patch['Designer.sourcePackage'], null);
  assert.equal(Object.keys(patch).every((key) => key.startsWith('Designer.')), true);
});

test('flattening reads through _children the way valueAtPath does', () => {
  const flat = flattenControl(slider());
  assert.equal(flat.get('Parts.label.Text.content'), 'CIRCULAR');
  assert.equal(flat.has('ValueChannels.mainValue.defaultValue'), true);
});

// --- Push: this copy's design back to the library ---------------------------------------------------

import {
  nextPackageVersion, pushCustomComponentToSource, relinkCustomComponentPatch,
} from '../src/CE_Application/utils/customComponentSourceLink.js';

test('the next version is the next free minor', () => {
  assert.equal(nextPackageVersion([{ version: '1.0.0' }]), '1.1.0');
  assert.equal(nextPackageVersion([{ version: '1.0.0' }, { version: '1.1.0' }, { version: '1.2.0' }]), '1.3.0');
  assert.equal(nextPackageVersion([]), '1.1.0');
});

test('a push saves the copy\'s design, and keeps its placement, bindings and published values its own', () => {
  const v1 = entryFor(slider(), { version: '1.0.0' });
  const copy = place(v1, 300, 40);
  copy._children.Core.name = 'CutoffDial';
  copy._children.Parts._children.label._children.Text.content = 'CUTOFF';
  copy._children.DeviceBindings = { _type: 'DeviceBindings', bindings: [{ kind: 'deviceParameter', parameterId: 'cutoff' }] };
  tint(copy);                                              // the design edit worth sharing

  const report = diffCustomComponentAgainstSource(copy, [v1]);
  assert.equal(report.status, 'edited');
  const pushed = pushCustomComponentToSource(copy, report);
  assert.equal(pushed.refused, undefined);
  assert.equal(pushed.version, '1.1.0');
  const c = pushed.component._children;
  assert.equal(c.Parts._children.dialTrack.meta.tint, 'FFFF0000', 'the edit goes to the library');
  assert.equal(c.Parts._children.label._children.Text.content, v1.component._children.Parts._children.label._children.Text.content, 'this copy\'s legend does not become the default');
  assert.equal(c.Core.name, v1.component._children.Core.name);
  assert.equal(c.Transform.x, v1.component._children.Transform.x);
  assert.notEqual(c.DeviceBindings?.bindings?.[0]?.parameterId, 'cutoff', 'this copy\'s binding stays with it');
  assert.equal(c.Designer.sourcePackage, undefined);

  // Saved, the copy is re-pointed at it and reads as up to date, legend and all.
  const v2 = entryFor(pushed.component, pushed.metadata);
  assert.equal(v2.version, '1.1.0');
  const relinked = clone(copy);
  for (const [path, value] of Object.entries(relinkCustomComponentPatch(copy, v2))) {
    relinked._children.Designer[path.split('.')[1]] = value;
  }
  const after = diffCustomComponentAgainstSource(relinked, [v2, v1]);
  assert.equal(after.status, 'current');
  assert.deepEqual(after.overrides.map((row) => row.path), ['Parts.label.Text.content']);

  // Another copy from 1.0.0 is now offered the pushed edit.
  assert.equal(diffCustomComponentAgainstSource(place(v1, 10, 10), [v2, v1]).status, 'update');
});

test('a push is refused when the library has moved on, or when there is nothing to push', () => {
  const { v1, v2 } = newerVersion((c) => { tint(c); });
  const edited = place(v1);
  edited._children.Parts._children.pointer.hidden = true;
  assert.match(pushCustomComponentToSource(edited, diffCustomComponentAgainstSource(edited, [v2, v1])).refused, /newer version/);
  const clean = place(v1);
  assert.match(pushCustomComponentToSource(clean, diffCustomComponentAgainstSource(clean, [v1])).refused, /no design edits/);
});
