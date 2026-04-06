import { writable } from 'svelte/store';

/** Show rulers along canvas edges */
export const showRulers = writable(true);

/** Show guide lines on the canvas */
export const showGuides = writable(true);

/** Show distance measurements during drag */
export const showDistances = writable(true);
