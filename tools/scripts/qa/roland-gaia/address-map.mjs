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

// The four effect blocks share a shape: a Type selector, then a bank of 4-nibble parameters whose
// MEANING depends on the type selected. The MIDI implementation gives the addresses and the ranges
// and stops there — "Distortion Parameter 3" is what the manual calls it, and which front-panel
// knob that is (EFFECTS has SELECT CONTROL, CONTROL 1/2/3 and LEVEL) is documented in the owner's
// manual, not this one. So the names here are the manual's names. Anything better would be a guess
// wearing a label.

/** Patch Distortion — OFF / DIST / FUZZ / BIT CRASH, then 32 type-dependent parameters. */
export const PATCH_DISTORTION = [
  {"offset":"00 00","name":"Distortion Type","min":0,"max":3,"labels":["OFF","DIST","FUZZ","BIT CRASH"]},
  {"offset":"00 01","name":"MFX Parameter 1","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 05","name":"MFX Parameter 2","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 09","name":"MFX Parameter 3","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 0D","name":"MFX Parameter 4","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 11","name":"MFX Parameter 5","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 15","name":"MFX Parameter 6","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 19","name":"MFX Parameter 7","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 1D","name":"MFX Parameter 8","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 21","name":"MFX Parameter 9","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 25","name":"MFX Parameter 10","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 29","name":"MFX Parameter 11","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 2D","name":"MFX Parameter 12","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 31","name":"MFX Parameter 13","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 35","name":"MFX Parameter 14","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 39","name":"MFX Parameter 15","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 3D","name":"MFX Parameter 16","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 41","name":"MFX Parameter 17","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 45","name":"MFX Parameter 18","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 49","name":"MFX Parameter 19","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 4D","name":"MFX Parameter 20","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 51","name":"MFX Parameter 21","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 55","name":"MFX Parameter 22","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 59","name":"MFX Parameter 23","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 5D","name":"MFX Parameter 24","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 61","name":"MFX Parameter 25","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 65","name":"MFX Parameter 26","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 69","name":"MFX Parameter 27","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 6D","name":"MFX Parameter 28","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 71","name":"MFX Parameter 29","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 75","name":"MFX Parameter 30","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 79","name":"MFX Parameter 31","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 7D","name":"MFX Parameter 32","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4}
];

/** Patch Flanger — OFF / FLANGER / PHASER / PITCH SHIFTER, then 20 type-dependent parameters. */
export const PATCH_FLANGER = [
  {"offset":"00 00","name":"Flanger Type","min":0,"max":3,"labels":["OFF","FLANGER","PHASER","PITCH SHIFTER"]},
  {"offset":"00 01","name":"Flanger Parameter 1","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 05","name":"Flanger Parameter 2","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 09","name":"Flanger Parameter 3","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 0D","name":"Flanger Parameter 4","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 11","name":"Flanger Parameter 5","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 15","name":"Flanger Parameter 6","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 19","name":"Flanger Parameter 7","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 1D","name":"Flanger Parameter 8","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 21","name":"Flanger Parameter 9","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 25","name":"Flanger Parameter 10","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 29","name":"Flanger Parameter 11","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 2D","name":"Flanger Parameter 12","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 31","name":"Flanger Parameter 13","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 35","name":"Flanger Parameter 14","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 39","name":"Flanger Parameter 15","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 3D","name":"Flanger Parameter 16","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 41","name":"Flanger Parameter 17","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 45","name":"Flanger Parameter 18","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 49","name":"Flanger Parameter 19","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 4D","name":"Flanger Parameter 20","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4}
];

/** Patch Delay — OFF / DELAY / PANNING DELAY, then 20 type-dependent parameters. */
export const PATCH_DELAY = [
  {"offset":"00 00","name":"Delay Type","min":0,"max":2,"labels":["OFF","DELAY","PANNING DELAY"]},
  {"offset":"00 01","name":"Delay Parameter 1","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 05","name":"Delay Parameter 2","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 09","name":"Delay Parameter 3","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 0D","name":"Delay Parameter 4","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 11","name":"Delay Parameter 5","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 15","name":"Delay Parameter 6","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 19","name":"Delay Parameter 7","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 1D","name":"Delay Parameter 8","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 21","name":"Delay Parameter 9","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 25","name":"Delay Parameter 10","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 29","name":"Delay Parameter 11","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 2D","name":"Delay Parameter 12","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 31","name":"Delay Parameter 13","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 35","name":"Delay Parameter 14","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 39","name":"Delay Parameter 15","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 3D","name":"Delay Parameter 16","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 41","name":"Delay Parameter 17","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 45","name":"Delay Parameter 18","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 49","name":"Delay Parameter 19","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 4D","name":"Delay Parameter 20","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4}
];

/** Patch Reverb — OFF / REVERB, then 20 type-dependent parameters. */
export const PATCH_REVERB = [
  {"offset":"00 00","name":"Reverb Type","min":0,"max":1,"labels":["OFF","REVERB"]},
  {"offset":"00 01","name":"Reverb Parameter 1","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 05","name":"Reverb Parameter 2","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 09","name":"Reverb Parameter 3","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 0D","name":"Reverb Parameter 4","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 11","name":"Reverb Parameter 5","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 15","name":"Reverb Parameter 6","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 19","name":"Reverb Parameter 7","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 1D","name":"Reverb Parameter 8","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 21","name":"Reverb Parameter 9","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 25","name":"Reverb Parameter 10","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 29","name":"Reverb Parameter 11","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 2D","name":"Reverb Parameter 12","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 31","name":"Reverb Parameter 13","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 35","name":"Reverb Parameter 14","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 39","name":"Reverb Parameter 15","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 3D","name":"Reverb Parameter 16","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 41","name":"Reverb Parameter 17","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 45","name":"Reverb Parameter 18","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 49","name":"Reverb Parameter 19","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4},
  {"offset":"00 4D","name":"Reverb Parameter 20","min":12768,"max":52768,"displayMin":-20000,"displayMax":20000,"nibbles":4}
];

/** Patch Arpeggio Common — grid, duration, motif, octave range, accent, velocity, end step. */
export const PATCH_ARPEGGIO_COMMON = [
  {"offset":"00 00","name":"Arpeggio Grid","min":0,"max":8,"labels":["04_","08_","08L","08H","08t","16_","16L","16H","16t"]},
  {"offset":"00 01","name":"Arpeggio Duration","min":0,"max":9,"labels":["30","40","50","60","70","80","90","100","120","FUL"]},
  {"offset":"00 02","name":"Arpeggio Motif","min":0,"max":11,"labels":["UP/L","UP/L&H","UP/_","DOWN/L","DOWN/L&H","DOWN/_","UP&DOWN/L","UP&DOWN/L&H","UP&DOWN/_","RANDOM/L","RANDOM/_","PHRASE"]},
  {"offset":"00 03","name":"Arpeggio Octave Range","min":61,"max":67,"displayMin":-3,"displayMax":3},
  {"offset":"00 04","name":"Arpeggio Accent Rate","min":0,"max":100},
  {"offset":"00 05","name":"Arpeggio Velocity","min":0,"max":127,"note":"0 = REAL (played velocity); 1-127 = fixed"},
  {"offset":"00 06","name":"End Step","min":1,"max":32,"nibbles":2}
];

/**
 * Patch Arpeggio Pattern — one block per note, sixteen of them, and the reason the GAIA's
 * arpeggiator is a step sequencer rather than a chord shuffler.
 *
 * Each block is one horizontal lane: an Original Note, then thirty-two step slots. A step holds
 * 0 for a rest and 1..127 for a velocity, so "drawing a block" on a grid is literally writing a
 * velocity into one of these 512 addresses. Every value is two nibbles, at a two-byte stride —
 * Original Note at 00 00, Step 1 at 00 02, Step 32 at 00 40, total size 00 00 00 42.
 *
 * Generated rather than pasted: thirty-three rows written out sixteen times is thirty-three
 * chances to typo an offset, and the manual's own table is this loop.
 */
export const PATCH_ARPEGGIO_PATTERN = [
  { offset: '00 00', name: 'Original Note', min: 0, max: 128, nibbles: 2, note: '128 = OFF (lane unused)' },
  ...Array.from({ length: 32 }, (unused, index) => {
    const offset = (index + 1) * 2;
    return {
      offset: `00 ${offset.toString(16).toUpperCase().padStart(2, '0')}`,
      name: `Step ${index + 1} Data`,
      min: 0,
      max: 128,
      nibbles: 2,
      note: '0 = rest, 1-127 = velocity, 128 = tie to the previous step',
    };
  }),
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
  // Note 1 at 00 0D 00 through Note 16 at 00 1C 00 — a 00 01 00 stride, the same trick the three
  // tone blocks play one level up.
  ...Object.fromEntries(Array.from({ length: 16 }, (unused, index) => [
    `arpeggioPattern${index + 1}`,
    `00 ${(0x0d + index).toString(16).toUpperCase().padStart(2, '0')} 00`,
  ])),
};

/** The edit buffer. User patches live at 20 nn 00 00, one per slot A-1 .. H-8. */
export const TEMPORARY_PATCH = '10 00 00 00';

/** First user patch slot (A-1). A-2 is 20 01 00 00, and so on to H-8 at 20 3F 00 00. */
export const USER_PATCH_A1 = '20 00 00 00';

/**
 * Each block's Total Size, exactly as the manual prints it at the foot of its table.
 *
 * These are what an RQ1 asks for, and they are transcribed rather than derived: the first draft
 * computed Distortion's from its last offset and got 01 11, where the manual says 01 01. A size
 * that is too large is not a rounding error — the synth answers a different question or does not
 * answer at all.
 */
export const BLOCK_SIZES = {
  system: '00 00 00 6E',
  common: '00 00 00 3D',
  tone: '00 00 00 3E',
  distortion: '00 00 01 01',
  flanger: '00 00 00 51',
  delay: '00 00 00 51',
  reverb: '00 00 00 51',
  arpeggioCommon: '00 00 00 08',
  arpeggioPattern: '00 00 00 42',
};

/** Roland DT1/RQ1 envelope bytes for this model. Model ID is three bytes: 00 00 41. */
export const MODEL = { manufacturer: '41', modelId: ['00', '00', '41'], dt1: '12', rq1: '11' };
