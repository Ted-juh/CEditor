import { writable } from 'svelte/store';
import { emptyMeters, applyMeterFrame, advanceMeters, clearMeterPeaks } from '../utils/mixerMeters.js';

export const hostMeters = writable(emptyMeters());
export const resetHostMeters = () => hostMeters.set(emptyMeters());
const clock = () => globalThis.performance?.now?.() ?? Date.now();
export const receiveHostMeters = payload => hostMeters.update(state => applyMeterFrame(state, payload, clock()));
export const advanceHostMeters = () => hostMeters.update(state => advanceMeters(state, clock()));
export const resetHostMeterPeaks = id => hostMeters.update(state => clearMeterPeaks(state, id, clock()));
