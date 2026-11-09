// groups.mjs — how Sequential's parameter names group, shared by the layouts in synths/.
//
// Not a synth: make-profiles.mjs treats every file in synths/ as one, so this lives beside it.
// Names are matched with their words spaced out (`Osc2ShapeMod` as `Osc 2 Shape Mod`, `EnvVCAAmt`
// as `Env VCA Amt`), so the CamelCase tables of the Take 5 and Prophet X group like the rest. The
// first pattern that matches wins, `$1` in a group's name is the pattern's first capture, and a
// prefix the pattern matched is dropped from the parameter's id. Order matters where one prefix
// starts another: Filter Env before Filter, Osc Mix before Osc.

const ENV_STAGE = '(Attack|Atatck|Decay|Sustain|Release)';

export const SEQUENTIAL_GROUPS = [
  ['Mixer', /^(Osc(?:illator)? Mix|Noise(?: Level)?|Sub Osc(?:\.|illator)?(?: \d)?(?: Level)?|Osc 1 Sub Level|Slop|Osc Slop|Oscillator Slop|Feedback(?:\/External Audio)? (?:Volume|Gain|Level)|Feeback Volume|External Audio Input Level)$/i],
  ['Oscillator $1', /^(?:Osc(?:illator)?\.?|OSC) ?([1-4A-D])\b\s*/i],
  ['Instrument $1', /^Inst ?(\d)\s+/i],
  ['Oscillators', /^(Osc(?:illator)?s?\.?\s+|Sync|Osc 1 2 Sync|Osc 21 Sync|FM On\/Off|Oscillator Sync)/i],
  ['Glide', /^Glide\s*/i],
  ['Filter Envelope', new RegExp(`^(?:(?:Filter|Filt\\.?|LPF|VCF) ?Env(?:elope)?\\.?|F ?Env|Env ?Filter|ENV FILTER)\\s+|^${ENV_STAGE} FILTER$`, 'i')],
  ['Amp Envelope', new RegExp(`^(?:(?:VCA|Amp(?:lifier)?) ?Env(?:elope)?\\.?|Env ?(?:VCA|Amp))\\s+|^${ENV_STAGE} VCA$`, 'i')],
  ['Envelope $1', /^Env(?:elope)?\.? ?(\d)\s+/i],
  ['Low-pass Filter', /^(Low-?pass|LPF)\s+/i],
  ['High-pass Filter', /^(High-?pass|HPF)\s+/i],
  ['Filter', /^(Filter|Filt\.?|VCF|Cutoff|Resonance|Keyboard Tracking|Audio Mod|2 pole\/4 pole mode|Normal to Band-Pass)\b\s*/i],
  ['Amp', /^(VCA|Amp(?:lifier)?)\b\s*/i],
  ['LFO $1', /^LFO ?(\d)\s+/i],
  ['LFO', /^LFO\b\s*/i],
  ['Mod $1', /^Mod(?:ulation)? ?(\d+)\s+/i],
  ['Modulation', /^(Mod ?(?:Src|Dst)\b|Mod(?:\.)? Wheel|Pressure|Aftertouch|Breath|Velocity|VELOCTIY|Foot Cntrlr|Foot Control(?:ler)?|PolyMod|Poly Mod|POLY MOD|Touch)\s*/i],
  ['Character', /^(Air|Girth|Hack|Decimate|Drive|Vintage|VINTAGE)$/i],
  ['Effects', /^(FX|Delay|Distortion|Effect|Reverb|Overdrive)\s*/i],
  ['Arpeggiator', /^(Arp(?:eggiator)?\.?\b\s*|BPM|Clock Divide|Clock Div|Clock BPM)/i],
  ['Sequencer', /^(Gated Seq|Seq(?:uencer)?\.?|Sequence)\s*/i],
  ['Push It', /^Push It\s*/i],
  ['Voice', /^(Unison|UNISON|Key(?:board)? Mode|Key Assign Mode|Pitch ?Bend ?Range|Pitchbend Range|Pbend Range|PITCH WHEEL RANGE|Pitch Wheel Range|Voice Volume|Pan (?:Spread|Mode)|Output Spread|Split Point|A\/B Mode|Program Volume|Transpose|Env Retrig|Retrigger|RETRIGGER)/i],
];
