// midiLearnTap.js — the next thing that moves on the MIDI input, read as the MIDI tab's learn chips
// read it (utils/midiLearnChips.js), for something that wants one: the Values tab's Learn
// (editor/valueLearn.js). The chips' own component keeps its strip; this keeps nothing past the one
// chip it hands over.
//
// A message already on the input when the tap opens is not one that moved after it: the stores
// replay their current value on subscribing, and that value is passed over, as MidiLearnChips does.

import { get } from 'svelte/store';
import { latestMidiInputMessage, latestSysexInputMessage, profileSources } from './deviceProfileStores.js';
import { inboundIndexFor } from './inboundIndexCache.js';
import { EMPTY_CHIP_STATE, applyChipHex, chipList } from '../utils/midiLearnChips.js';

/**
 * Hand `onchip` the first chip `takes(chip)` accepts, read against `profileId`'s profile so a
 * parameter it names is named, and stop. Returns a function that stops it sooner.
 */
export function learnNext(takes, onchip, { profileId = '' } = {}) {
  let state = EMPTY_CHIP_STATE;
  let lastInbound = get(latestMidiInputMessage);
  let lastSysex = get(latestSysexInputMessage);
  let done = false;
  const indexed = () => inboundIndexFor(profileId, get(profileSources)?.[profileId]?.source);
  const fold = (payload) => {
    if (done) return;
    const index = indexed();
    state = applyChipHex(state, payload.hex, index?.index ?? null);
    const chip = chipList(state, { index: index?.index ?? null, parameterById: index?.parameterById ?? {} }).find(takes);
    if (!chip) return;
    stop();
    onchip(chip);
  };
  const offInbound = latestMidiInputMessage.subscribe((payload) => {
    if (!payload?.hex || payload === lastInbound) return;
    lastInbound = payload;
    fold(payload);
  });
  const offSysex = latestSysexInputMessage.subscribe((payload) => {
    if (!payload?.hex || payload === lastSysex) return;
    lastSysex = payload;
    fold(payload);
  });
  function stop() {
    if (done) return;
    done = true;
    offInbound();
    offSysex();
  }
  return stop;
}
