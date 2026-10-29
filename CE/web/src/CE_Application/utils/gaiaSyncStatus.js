import { blocksToLanes } from './gaiaArpPattern.js';
import { layoutFor } from './arpPatternLayouts.js';
import { SIMULATED_DEVICE } from './midiEndpoints.js';
import { getCustomArpeggiator } from './customComponentArpeggiator.js';
import { deviceFeedbackCounts, feedbackEndpointAvailable } from '../stores/deviceSyncFeedback.js';

export function gaiaPatternFingerprint(blocks) {
  // Selection, IDs, viewport and block ordering are editor details, not provenance changes.
  return JSON.stringify((blocks ?? []).map(({ note, step, length, velocity }) => [note, step, length, velocity])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2] || a[3] - b[3]));
}
export function gaiaExpectedArpValues(control, values = {}) {
  const arp = getCustomArpeggiator(control, values), layout = layoutFor(control);
  const source = values.__arpPatternSource;
  if (source?.raw && source.fingerprint === gaiaPatternFingerprint(arp.blocks)) {
    return { expected: { ...source.raw, [layout.endStep]: values.arpEndStep ?? layout.steps }, dropped: [] };
  }
  const built = blocksToLanes(arp.blocks, { lanes: layout.lanes, steps: layout.steps });
  const expected = { [layout.endStep]: values.arpEndStep ?? control?._children?.ValueChannels?._children?.arpEndStep?.defaultValue ?? layout.steps };
  built.lanes.forEach((lane, index) => {
    expected[layout.originalNote(index + 1)] = lane.originalNote;
    lane.steps.forEach((value, step) => { expected[layout.step(index + 1, step + 1)] = value; });
  });
  return { expected, dropped: built.dropped };
}

// Incoming filter/fader messages change feedback, not the arpeggio drawing.
// Compile its 529 expected values only when the immutable pattern inputs change.
const statusPatterns = new WeakMap();
function statusPattern(grid, values) {
  const input = values.__arpeggiator ?? values.arpeggiator ?? grid?._children?.Designer?.arpeggiator;
  const source = values.__arpPatternSource;
  const endStep = values.arpEndStep;
  const previous = grid && statusPatterns.get(grid);
  if (previous && previous.input === input && previous.source === source && previous.endStep === endStep) return previous;
  const { expected, dropped } = gaiaExpectedArpValues(grid, values);
  const fingerprint = gaiaPatternFingerprint(getCustomArpeggiator(grid, values).blocks);
  const result = { input, source, endStep, entries: Object.entries(expected), dropped, fingerprint,
    edited: fingerprint !== gaiaPatternFingerprint(grid?._children?.Designer?.arpeggiator?.blocks) };
  if (grid) statusPatterns.set(grid, result);
  return result;
}

export function gaiaSyncStatus({ grid, values = {}, feedback = {}, mapping, destinations = [], inputs = [], capabilities = {} }) {
  const output = capabilities.canSendSysex === true && feedbackEndpointAvailable(mapping?.midiDestination, destinations);
  // The simulated device answers on the role itself: its output is its input.
  const input = capabilities.canReceiveSysex === true && (mapping?.midiDestination?.type === SIMULATED_DEVICE
    ? output : feedbackEndpointAvailable(mapping?.midiInput, inputs));
  const synth = layoutFor(grid).synth;
  const connection = !mapping?.profileId ? 'NO DEVICE MAPPING' : !output ? 'MIDI OFFLINE' : !input ? 'NO MIDI INPUT' : 'MIDI PORTS READY';
  const counts = deviceFeedbackCounts(feedback);
  const reads = Object.values(feedback.reads ?? {});
  const reading = reads.some(r => r.state === 'reading');
  const readError = reads.find(r => r.state === 'error');
  const { entries, dropped, fingerprint, edited } = statusPattern(grid, values);
  let received = 0, matching = 0;
  for (const [id, value] of entries) {
    const rx = feedback.received?.[id], write = feedback.writes?.[id];
    if (rx) received++;
    if (rx && Number(rx.value) === Number(value) && (!write || rx.sequence > write.sequence)) matching++;
  }
  const verified = matching === entries.length && dropped.length === 0;
  // The read-pattern operation can attach this marker only when it actually replaces the grid.
  // Receiving unrelated parameter data or matching the starter pattern does not attach it.
  const source = values.__arpPatternSource;
  const origin = source?.kind === 'hardware'
    ? source.fingerprint === fingerprint ? `${synth}-READ PATTERN` : `EDITED ${synth} PATTERN`
    : edited ? 'EDITED IN EDITOR' : 'EDITOR PATTERN';
  const pattern = dropped.length ? `EXCEEDS 16 NOTE LANES (${dropped.length} NOT SENT)`
    : verified && output && input && !reading && !readError && !feedback.identityError ? 'SYNCED (READBACK)' : received ? `NOT VERIFIED (${received}/${entries.length} RECEIVED)` : `NOT READ FROM ${synth}`;
  const transfer = feedback.identityError ? 'DEVICE IDENTITY MISMATCH' : counts.failed ? `${counts.failed} SEND ERROR${counts.failed === 1 ? '' : 'S'}`
    : readError ? 'READ FAILED / TIMED OUT'
    : reading ? 'READING…'
    : counts.pending ? `${counts.pending} PENDING / UNVERIFIED`
    : counts.confirmed ? 'EDITS CONFIRMED' : feedback.lastReplyAt ? 'REPLY RECEIVED' : 'NO REPLY YET';
  const colour = counts.failed || readError || dropped.length || feedback.identityError ? 'FFFF8080'
    : !output || !input ? 'FFAFBAC4' : reading ? 'FF79CBEF'
      : counts.pending || !verified ? 'FFE6C66C' : 'FF8CD7A0';
  return { text: `${connection} · ${transfer}   |   ${origin} · ${pattern}`, colour,
    verified: verified && output && input && !reading && !counts.pending && !counts.failed && !readError && !feedback.identityError,
    detail: [feedback.reason, feedback.identityError, readError?.error, ...Object.values(feedback.writes ?? {}).map(w => w.error).filter(Boolean),
      feedback.lastReplyAt ? `Last hardware reply: ${feedback.lastReplyAt}` : 'No hardware reply observed in this session.',
      'Sent/queued values are not confirmation. Reading names does not load the arpeggio grid.'].filter(Boolean).join('\n'),
  };
}
