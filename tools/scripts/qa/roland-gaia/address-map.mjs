// address-map.mjs — the Roland GAIA SH-01 parameter address map, transcribed from
// "SH-01 MIDI Implementation", Roland Corporation, version 1.01 (Sep 1, 2010).
//
// Factual interface data — the same map any SH-01 editor has to encode. Offsets are relative to
// their block, so a full address is:
//
//     Temporary Patch (10 00 00 00) + block offset + parameter offset
//
// TONE IS ONE TABLE, NOT THREE. The three tones are the same 62-byte block at a 0x0100 stride
// (00 01 00 / 00 02 00 / 00 03 00), which is the whole reason a panel can show all three at once
// without three times the profile: it is one parameter list emitted three times against a
// different base address.
//
// Reserved bytes are dropped. They exist in the manual to account for the block's total size; a
// profile that exposed them would put 17 unnamed sliders in front of a user.
//
// min/max are WIRE values. displayMin/displayMax, where present, are what the synth's own front
// panel shows for those wire values — the two differ for every bipolar parameter on the machine
// (OSC Pitch is 40..88 on the wire and -24..+24 to a human; AMP Pan is 0..127 and L64..63R).
//
// Regenerate/verify against the manual with tools/scripts/qa/roland-gaia/README.md.

/** Patch Common — per-patch settings: name, level, tempo, the tone switches, effect routing. */
export const PATCH_COMMON = [
  {"offset":"00 00","name":"Patch Name 1","min":32,"max":127,"displayMin":32,"displayMax":127,"unit":"ASCII"},
  {"offset":"00 01","name":"Patch Name 2","min":32,"max":127,"displayMin":32,"displayMax":127,"unit":"ASCII"},
  {"offset":"00 02","name":"Patch Name 3","min":32,"max":127,"displayMin":32,"displayMax":127,"unit":"ASCII"},
  {"offset":"00 03","name":"Patch Name 4","min":32,"max":127,"displayMin":32,"displayMax":127,"unit":"ASCII"},
  {"offset":"00 04","name":"Patch Name 5","min":32,"max":127,"displayMin":32,"displayMax":127,"unit":"ASCII"},
  {"offset":"00 05","name":"Patch Name 6","min":32,"max":127,"displayMin":32,"displayMax":127,"unit":"ASCII"},
  {"offset":"00 06","name":"Patch Name 7","min":32,"max":127,"displayMin":32,"displayMax":127,"unit":"ASCII"},
  {"offset":"00 07","name":"Patch Name 8","min":32,"max":127,"displayMin":32,"displayMax":127,"unit":"ASCII"},
  {"offset":"00 08","name":"Patch Name 9","min":32,"max":127,"displayMin":32,"displayMax":127,"unit":"ASCII"},
  {"offset":"00 09","name":"Patch Name 10","min":32,"max":127,"displayMin":32,"displayMax":127,"unit":"ASCII"},
  {"offset":"00 0A","name":"Patch Name 11","min":32,"max":127,"displayMin":32,"displayMax":127,"unit":"ASCII"},
  {"offset":"00 0B","name":"Patch Name 12","min":32,"max":127,"displayMin":32,"displayMax":127,"unit":"ASCII"},
  {"offset":"00 0C","name":"Patch Level","min":0,"max":127},
  {"offset":"00 0D","name":"Patch Tempo","min":5,"max":300,"displayMin":5,"displayMax":300,"unit":"BPM","nibbles":3},
  {"offset":"00 10","name":"Arpeggio Switch","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 12","name":"Portamento Switch","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 13","name":"Portamento Time","min":0,"max":127},
  {"offset":"00 14","name":"Mono Switch","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 15","name":"Octave Shift","min":61,"max":67,"displayMin":-3,"displayMax":3},
  {"offset":"00 16","name":"Pitch Bend Range Up","min":0,"max":24},
  {"offset":"00 17","name":"Pitch Bend Range Down","min":0,"max":24},
  {"offset":"00 19","name":"Tone1 Switch","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 1A","name":"Tone1 Select","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 1B","name":"Tone2 Switch","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 1C","name":"Tone2 Select","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 1D","name":"Tone3 Switch","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 1E","name":"Tone3 Select","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 1F","name":"SYNC/RING Select","min":0,"max":2,"labels":["OFF","SYNC","RING"]},
  {"offset":"00 20","name":"Effects Master Switch","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 22","name":"Delay Tempo Sync Switch","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 23","name":"Low Boost Switch","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 24","name":"D Beam Assign","min":0,"max":29,"labels":["LFO-RATE","LFO-FADE-TIME","LFO-PITCH-MOD","LFO-FILTER-MOD","LFO-AMP-MOD","OSC-PITCH","OSC-DETUNE","OSC-PWM","OSC-PW","OSC-ENV-A","OSC-ENV-D","OSC-ENV-MOD","FILTER-CUTOFF","FILTER-RESONANCE","FILTER-ENV-A","FILTER-ENV-D","FILTER-ENV-S","FILTER-ENV-R","FILTER-ENV-MOD","AMP-LEVEL","AMP-ENV-A","AMP-ENV-D","AMP-ENV-S","AMP-ENV-R","EFX-CTRL","PORT-TIME","BENDER","MODULATION","FILTER-CUTOFF-KF","EFX-LEVEL"]},
  {"offset":"00 29","name":"D Beam Polarity","min":0,"max":1,"labels":["NORMAL","REVERSE"]},
  {"offset":"00 2A","name":"Effects Distortion Select","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 2B","name":"Effects Flanger Select","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 2C","name":"Effects Delay Select","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 2D","name":"Effects Reverb Select","min":0,"max":1,"labels":["OFF","ON"]}
];

/** Patch Tone — one tone layer, emitted three times. 45 named parameters. */
export const PATCH_TONE = [
  {"offset":"00 00","name":"OSC Wave","min":0,"max":6,"labels":["SAW","SQR","PW-SQR","TRI","SINE","NOISE","SUPER-SAW"]},
  {"offset":"00 01","name":"OSC Wave Variation","min":0,"max":2,"labels":["A","B","C"]},
  {"offset":"00 03","name":"OSC Pitch","min":40,"max":88,"displayMin":-24,"displayMax":24},
  {"offset":"00 04","name":"OSC Detune","min":14,"max":114,"displayMin":-50,"displayMax":50},
  {"offset":"00 05","name":"OSC Pulse Width Mod Depth","min":0,"max":127},
  {"offset":"00 06","name":"OSC Pulse Width","min":0,"max":127},
  {"offset":"00 07","name":"OSC Pitch Env Attack Time","min":0,"max":127},
  {"offset":"00 08","name":"OSC Pitch Env Decay","min":0,"max":127},
  {"offset":"00 09","name":"OSC Pitch Env Depth","min":1,"max":127,"displayMin":-63,"displayMax":63},
  {"offset":"00 0A","name":"FILTER Mode","min":0,"max":4,"labels":["BYPASS","LPF","HPF","BPF","PKG"]},
  {"offset":"00 0B","name":"FILTER Slope","min":0,"max":1,"labels":["-12 dB","-24 dB"]},
  {"offset":"00 0C","name":"FILTER Cutoff","min":0,"max":127},
  {"offset":"00 0D","name":"FILTER Cutoff Keyfollow","min":54,"max":74,"displayMin":-100,"displayMax":100},
  {"offset":"00 0E","name":"FILTER Env Velocity Sens","min":1,"max":127,"displayMin":-63,"displayMax":63},
  {"offset":"00 0F","name":"FILTER Resonance","min":0,"max":127},
  {"offset":"00 10","name":"FILTER Env Attack Time","min":0,"max":127},
  {"offset":"00 11","name":"FILTER Env Decay Time","min":0,"max":127},
  {"offset":"00 12","name":"FILTER Env Sustain Level","min":0,"max":127},
  {"offset":"00 13","name":"FILTER Env Release Time","min":0,"max":127},
  {"offset":"00 14","name":"FILTER Env Depth","min":1,"max":127,"displayMin":-63,"displayMax":63},
  {"offset":"00 15","name":"AMP Level","min":0,"max":127},
  {"offset":"00 16","name":"AMP Level Velocity Sens","min":1,"max":127,"displayMin":-63,"displayMax":63},
  {"offset":"00 17","name":"AMP Env Attack Time","min":0,"max":127},
  {"offset":"00 18","name":"AMP Env Decay Time","min":0,"max":127},
  {"offset":"00 19","name":"AMP Env Sustain Level","min":0,"max":127},
  {"offset":"00 1A","name":"AMP Env Release Time","min":0,"max":127},
  {"offset":"00 1B","name":"AMP Pan","min":0,"max":127,"displayMin":-64,"displayMax":63},
  {"offset":"00 1C","name":"LFO Shape","min":0,"max":5,"labels":["TRI","SIN","SAW","SQR","S&H","RND"]},
  {"offset":"00 1D","name":"LFO Rate","min":0,"max":127},
  {"offset":"00 1E","name":"LFO Tempo Sync Switch","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 1F","name":"LFO Tempo Sync Note","min":0,"max":19,"labels":["16","12","8","4","2","1","3/4","2/3","1/2","3/8","1/3","1/4","3/16","1/6","1/8","3/32","1/12","1/16","1/24","1/32"]},
  {"offset":"00 20","name":"LFO Fade Time","min":0,"max":127},
  {"offset":"00 21","name":"LFO Key Trigger","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 22","name":"LFO Pitch Depth","min":1,"max":127,"displayMin":-63,"displayMax":63},
  {"offset":"00 23","name":"LFO Filter Depth","min":1,"max":127,"displayMin":-63,"displayMax":63},
  {"offset":"00 24","name":"LFO Amp Depth","min":1,"max":127,"displayMin":-63,"displayMax":63},
  {"offset":"00 25","name":"LFO Pan Depth","min":1,"max":127,"displayMin":-63,"displayMax":63},
  {"offset":"00 26","name":"Modulation LFO Shape","min":0,"max":5,"labels":["TRI","SIN","SAW","SQR","S&H","RND"]},
  {"offset":"00 27","name":"Modulation LFO Rate","min":0,"max":127},
  {"offset":"00 28","name":"Modulation LFO Tempo Sync Switch","min":0,"max":1,"labels":["OFF","ON"]},
  {"offset":"00 29","name":"Modulation LFO Tempo Sync Note","min":0,"max":19,"labels":["16","12","8","4","2","1","3/4","2/3","1/2","3/8","1/3","1/4","3/16","1/6","1/8","3/32","1/12","1/16","1/24","1/32"]},
  {"offset":"00 2C","name":"Modulation LFO Pitch Depth","min":1,"max":127,"displayMin":-63,"displayMax":63},
  {"offset":"00 2D","name":"Modulation LFO Filter Depth","min":1,"max":127,"displayMin":-63,"displayMax":63},
  {"offset":"00 2E","name":"Modulation LFO Amp Depth","min":1,"max":127,"displayMin":-63,"displayMax":63},
  {"offset":"00 2F","name":"Modulation LFO Pan Depth","min":1,"max":127,"displayMin":-63,"displayMax":63}
];

/** Block offsets inside a Patch, from the manual's Patch table. */
export const BLOCKS = {
  common: '00 00 00',
  tone1: '00 01 00',
  tone2: '00 02 00',
  tone3: '00 03 00',
  distortion: '00 04 00',
  flanger: '00 06 00',
  delay: '00 08 00',
  reverb: '00 0A 00',
  arpeggioCommon: '00 0C 00',
};

/** The edit buffer. User patches live at 20 nn 00 00, one per slot A-1 .. H-8. */
export const TEMPORARY_PATCH = '10 00 00 00';

/** Roland DT1/RQ1 envelope bytes for this model. Model ID is three bytes: 00 00 41. */
export const MODEL = { manufacturer: '41', modelId: ['00', '00', '41'], dt1: '12', rq1: '11' };
