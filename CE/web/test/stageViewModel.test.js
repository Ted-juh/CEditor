import test from 'node:test';
import assert from 'node:assert/strict';
import {
  changedSurfaceSlot,
  stageSetlistContext,
  stageSurfaceModel,
  surfaceSlotForMidiActivity,
  stageControllerContext,
} from '../src/CE_Application/utils/stageViewModel.js';

test('Stage distinguishes controller profiles, MIDI inputs and optional display integration', () => {
  const layout = { displayName: 'My fader controller' };
  const devices = { midiInputs: [{ name: 'USB MIDI', enabled: true }, { name: 'Other keyboard', enabled: false }] };
  const generic = stageControllerContext(layout, devices, { state: 'searching' });
  assert.equal(generic.profileName, 'My fader controller');
  assert.equal(generic.midiLabel, 'MIDI · USB MIDI');
  assert.equal(generic.midiEnabled, true);
  assert.equal(generic.displayLabel, '');
  const failedDisplay = stageControllerContext(layout, devices, { state: 'failed', device: 'CTRL49' });
  assert.equal(failedDisplay.midiEnabled, true);
  assert.equal(failedDisplay.displayWarning, true);
  assert.equal(failedDisplay.displayLabel, 'Hardware display · Unavailable · CTRL49');
  const profileOnly = stageControllerContext(layout, {}, { state: 'connected', device: 'CTRL49' });
  assert.equal(profileOnly.midiEnabled, false, 'profile or display connection cannot claim MIDI is enabled');
  assert.equal(profileOnly.midiLabel, 'MIDI · 0 inputs enabled');
  const plugin = stageControllerContext(layout, {}, { state: 'searching' }, false);
  assert.equal(plugin.midiLabel, 'MIDI · From host');
  assert.equal(plugin.midiEnabled, false, 'host routing is not a claim of incoming MIDI activity');
  assert.equal(stageControllerContext().profileName, '');
});

test('stage setlist context treats an unstarted list as ready for its first item', () => {
  const items = [{ itemId: 'a', name: 'First' }, { itemId: 'b', name: 'Second' }];
  const ready = stageSetlistContext({ setlist: { items, currentIndex: -1 } });
  assert.equal(ready.current, null);
  assert.equal(ready.next?.name, 'First');
  assert.equal(ready.canPrevious, false);
  assert.equal(ready.canNext, true);

  const playing = stageSetlistContext({ setlist: { items, currentIndex: 0 } });
  assert.equal(playing.current?.name, 'First');
  assert.equal(playing.next?.name, 'Second');
  assert.equal(playing.canNext, true);

  const last = stageSetlistContext({ setlist: { items, currentIndex: 1 } });
  assert.equal(last.previous?.name, 'First');
  assert.equal(last.next, null);
  assert.equal(last.canNext, false);
});

test('Stage next-song readiness follows the next rack ID and reports failures before loading completes', () => {
  const items = [{ name: 'First', rackRecordId: 'rack-a' }, { name: 'Second', rackRecordId: 'rack-b' }];
  const state = { setlist: { items, currentIndex: -1, preloads: [
    { recordId: 'rack-a', state: 'loading', total: 3, ready: 2, failed: 0 },
    { recordId: 'rack-b', state: 'ready', total: 0, ready: 0, failed: 0 },
  ] } };
  assert.equal(stageSetlistContext(state).nextReadiness.label, 'Loading rig… 2/3');
  state.setlist.preloads[0].failed = 1;
  state.setlist.preloads[0].error = 'Spire could not be loaded.';
  assert.deepEqual(stageSetlistContext(state).nextReadiness,
    { state: 'warning', label: 'Needs attention', detail: 'Spire could not be loaded.' });
  state.setlist.currentIndex = 0;
  assert.equal(stageSetlistContext(state).nextReadiness.label, 'Rig preloaded');
  state.setlist.preloads = [];
  assert.equal(stageSetlistContext(state).nextReadiness.label, 'Loads on selection');
  items[1] = { name: 'Scene in current rack', sceneId: 'scene' };
  assert.equal(stageSetlistContext(state).nextReadiness, null);
  items[1].missing = true;
  assert.equal(stageSetlistContext(state).nextReadiness.detail, 'The scene for this song is missing.');
  state.setlist.currentIndex = 1;
  assert.equal(stageSetlistContext(state).nextReadiness, null);
});

test('stage surface mirrors the selected CTRL49 control page as exactly eight slots', () => {
  const rack = { pages: [
    { pageId: 'p1', name: 'Filter', slots: [
      { slotId: 's1', displayName: 'Cutoff', assigned: true, resolved: true,
        value: 0.75, valueText: '7.5 kHz' },
    ] },
    { pageId: 'p2', name: 'Envelope', slots: [] },
  ] };
  const model = stageSurfaceModel(rack, {}, { pageIndex: 0, activeSlot: 3 });
  assert.equal(model.type, 'controls');
  assert.equal(model.name, 'Filter');
  assert.equal(model.pageCount, 3, 'two control pages plus the hardware Performance page');
  assert.equal(model.activeSlot, 3);
  assert.equal(model.entries.length, 8);
  assert.equal(model.entries[0].valueText, '7.5 kHz');
  assert.equal(model.entries[1].assigned, false);
});

test('stage movement feedback follows a real value change, not page redraws', () => {
  const before = [
    { slotId: 's1', assigned: true, value: 0.2, valueText: '20%' },
    { slotId: 's2', assigned: true, value: 0.4, valueText: '400 ms' },
  ];
  assert.equal(changedSurfaceSlot(before, before.map((entry) => ({ ...entry }))), -1);
  assert.equal(changedSurfaceSlot(before, [before[0], { ...before[1], value: 0.5, valueText: '500 ms' }]), 1);
  assert.equal(changedSurfaceSlot(before, [{ ...before[0], slotId: 'replacement' }, before[1]]), -1,
    'replacing an assignment is not presented as physical movement');
});

test('stage movement feedback also follows learned faders and pads by MIDI binding', () => {
  const entries = [
    { slotId: 's1', assigned: true, midiCc: 21, midiNote: -1, midiChannel: 0 },
    { slotId: 'pad-1', assigned: true, midiCc: -1, midiNote: 48, midiChannel: 2 },
  ];
  assert.equal(surfaceSlotForMidiActivity(entries, { cc: 21, note: -1, channel: 9 }), 0,
    'channel zero is omni');
  assert.equal(surfaceSlotForMidiActivity(entries, { cc: -1, note: 48, channel: 2 }), 1);
  assert.equal(surfaceSlotForMidiActivity(entries, { cc: -1, note: 48, channel: 1 }), -1,
    'a different explicit channel does not light the slot');
  assert.equal(surfaceSlotForMidiActivity(entries, { cc: 99, note: -1, channel: 1 }), -1);
});

test('the final CTRL49 page follows its pad bank between clips and scenes', () => {
  const rack = { pages: [{ pageId: 'p1', name: 'Filter', slots: [] }] };
  const performance = {
    clips: [{ clipId: 'c1', name: 'Pulse', active: true, phase: 0.4 }],
    scenes: [{ sceneId: 'sc1', name: 'Chorus' }],
  };

  const clips = stageSurfaceModel(rack, performance, { pageIndex: 1, padBank: 0 });
  assert.equal(clips.type, 'performance');
  assert.equal(clips.name, 'Clips');
  assert.equal(clips.entries[0].displayName, 'Pulse');
  assert.equal(clips.entries[0].value, 0.4);

  const scenes = stageSurfaceModel(rack, performance, { pageIndex: 1, padBank: 1 });
  assert.equal(scenes.name, 'Scenes');
  assert.equal(scenes.entries[0].displayName, 'Chorus');
});
