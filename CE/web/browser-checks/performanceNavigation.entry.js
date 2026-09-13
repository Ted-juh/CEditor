import { mount } from 'svelte';
import { get } from 'svelte/store';
import InstrumentHostView from '../src/CE_Application/sections/InstrumentHostView.svelte';
import { hostState, normalizeHostState, mockHostState, applyMockCommand } from '../src/CE_Application/stores/instrumentHost.js';

window.performanceCommands = [];
hostState.set(mockHostState());
window.__JUCE__ = { backend: { addEventListener() { return 1; }, removeEventListener() {},
  emitEvent(event, command) {
    if (event !== 'instrumentHost') return;
    window.performanceCommands.push(command);
    if (['addMidiLfo','setMidiLfo'].includes(command.cmd)) hostState.update(s => applyMockCommand(s, command));
  },
} };
window.finishNavigationCapture = () => hostState.update(s => {
  const next = applyMockCommand(s, { cmd: 'addPattern' });
  next.performance.capture = { ...next.performance.capture, lastPatternId: next.performance.patterns.at(-1).patternId,
    lastNoteCount: 4, lastStepCount: 16 };
  return normalizeHostState(next);
});
window.getNavigationState = () => get(hostState);
window.setupSoundcheck = () => hostState.update(s => normalizeHostState({ ...s,
  performance: { ...s.performance, setlist: { ...s.performance.setlist, currentIndex: 0,
    items: ['Opening', 'Ballad', 'Finale'].map((name, index) => ({ itemId: `song${index}`, name })) } },
  soundcheck: { currentItemId: 'song0', blockedReason: '', entries: [] },
}));
window.pushSoundcheck = patch => hostState.update(s => normalizeHostState({ ...s, soundcheck: { ...s.soundcheck, ...patch } }));
mount(InstrumentHostView, { target: document.getElementById('host') });
