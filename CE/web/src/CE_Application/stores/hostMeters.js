import { writable } from 'svelte/store';
import { emptyMeters, applyMeterFrame, advanceMeters, clearMeterPeaks } from '../utils/mixerMeters.js';

export const hostMeters = writable(emptyMeters());
export const resetHostMeters = () => hostMeters.set(emptyMeters());
const clock = () => globalThis.performance?.now?.() ?? Date.now();
export const hardwareKeyboardNotes = writable([]);
let lastNotes = [];
export function receiveHostMeters(payload) {
  hostMeters.update(state => applyMeterFrame(state, payload, clock()));
  const notes = payload?.keyboardNotes ?? [];
  if (notes.length !== lastNotes.length || notes.some((note, i) => note !== lastNotes[i])) {
    lastNotes = notes;
    hardwareKeyboardNotes.set(notes);
  }
}
export const advanceHostMeters = () => hostMeters.update(state => advanceMeters(state, clock()));
export const resetHostMeterPeaks = id => hostMeters.update(state => clearMeterPeaks(state, id, clock()));
