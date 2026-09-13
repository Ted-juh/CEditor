import { derived, get } from 'svelte/store';
import { hostState, hostMidiActivity } from './instrumentHost.js';
import { hostPartIssues } from '../utils/hostPartIssues.js';

// One timer for the rack, active only while a reader is mounted. Ignore the monitor's
// initial cached event so opening a view never revives a stale filtering indication.
export function recentNoteStore(activity, focusedPart, duration = 2500) {
  return derived(activity, ($activity, set) => {
    if (!$activity || !$activity.seq || $activity.note < 0 || $activity.value <= 0) {
      set(null);
      return;
    }
    set({ ...$activity, partId: focusedPart() });
    const timer = setTimeout(() => set(null), duration);
    return () => clearTimeout(timer);
  }, null);
}

// Timestamp-less native activity is sampled, not an event ledger. Skip its cached
// value on each subscription; subsequent updates represent newly observed input.
const freshActivity = {
  subscribe(run) {
    let first = true;
    return hostMidiActivity.subscribe(value => {
      run(first ? null : value);
      first = false;
    });
  },
};
const recentNote = recentNoteStore(freshActivity, () => get(hostState).rack.focusedPartId);
export const hostRackIssues = derived([hostState, recentNote], ([$state, $note]) =>
  Object.fromEntries($state.rack.parts.map(part => [part.partId, hostPartIssues($state, part, $note)])));
