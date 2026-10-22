// rawMidiDraft.js — bytes handed to the Ports tab's Send raw MIDI box to be sent from there: the
// Values tab's Send on a sendMidi or sendSysex row (editor/valueLearn.js). The box takes the draft
// when it is shown, says where it came from, and sends it only when its own Send is pressed, through
// its own checks and the device it shows.
//
// Value: { hex, role, from } | null. DeviceWorkbenchTab takes it and sets it back to null.

import { writable } from 'svelte/store';

export const rawMidiDraft = writable(null);
