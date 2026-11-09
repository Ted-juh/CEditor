// MC-707. MIDI Implementation Chart, version 1.60, Sep. 25, 2020.
//
// Most of these are received only: the general controllers a track's sound answers to on the
// track's channel. The four knobs (FILTER, MOD, FX, SOUND) are also sent. Program Change on the
// control channel changes the scene, and on a track's channel its clip (chart notes), which is a
// different thing on each channel, so it is not modelled as a preset list here.

export default {
  id: 'roland-mc-707',
  name: 'Roland MC-707',
  family: 'MC',
  chart: 'mc-707',
  description: 'Roland MC-707 Groovebox, one track, from the control changes in its MIDI Implementation Chart.',
  groups: [
    ['Knobs', /\bKnob$/],
    ['Tone', /^(Resonance|Release Time|Attack time|Cutoff|Decay Time|Vibrato Rate|Vibrato Depth|Vibrato Delay)$/],
    ['Effects', /^General Purpose Effect/],
    ['Performance', /^(Modulation|Portamento Time|Volume|Panpot|Expression|Hold 1|Portamento|Sostenuto|Soft|Legato Foot Switch|Portamento control)$/],
  ],
};
