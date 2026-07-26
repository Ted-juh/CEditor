// Optional color/shape presets for the waveform-icon and envelope-path
// renderers (QA follow-up). A preset is a plain meta patch — applying one
// writes through the normal Parts.<name>.meta.* paths, so presets are a
// starting point, not a mode: every value stays hand-tunable afterwards.

export const RENDERER_COLOR_PRESETS = [
  { id: 'ice', label: 'Ice', stroke: 'FF7DC4F3', fill: '227DC4F3' },
  { id: 'ember', label: 'Ember', stroke: 'FFF3A15B', fill: '22F3A15B' },
  { id: 'lime', label: 'Lime', stroke: 'FF65E6A0', fill: '2265E6A0' },
  { id: 'violet', label: 'Violet', stroke: 'FFB78DF2', fill: '22B78DF2' },
  { id: 'rose', label: 'Rose', stroke: 'FFEC4899', fill: '22EC4899' },
  { id: 'mono', label: 'Mono', stroke: 'FFEAF0F6', fill: '1AEAF0F6' },
];

export const WAVEFORM_SHAPES = [
  { id: 'sine', label: 'Sine' },
  { id: 'saw', label: 'Saw' },
  { id: 'square', label: 'Square' },
  { id: 'noise', label: 'Noise' },
];

// Classic ADSR silhouettes, expressed in the renderer's normalized fields.
export const ENVELOPE_SHAPE_PRESETS = [
  { id: 'pluck', label: 'Pluck', attack: 0.02, decay: 0.35, sustain: 0.18, release: 0.3 },
  { id: 'pad', label: 'Pad', attack: 0.7, decay: 0.4, sustain: 0.8, release: 0.85 },
  { id: 'organ', label: 'Organ', attack: 0.03, decay: 0.05, sustain: 0.95, release: 0.12 },
  { id: 'stab', label: 'Stab', attack: 0.06, decay: 0.55, sustain: 0.4, release: 0.2 },
  { id: 'swell', label: 'Swell', attack: 0.9, decay: 0.2, sustain: 0.7, release: 0.5 },
];

/** Meta patch for a waveform-icon part: color preset and/or shape. */
export function waveformIconPresetPatch(partName, { colorPreset = null, shape = null } = {}) {
  const patch = {};
  if (!partName) return patch;
  if (colorPreset) {
    patch[`Parts.${partName}.meta.waveformIcon.stroke`] = colorPreset.stroke;
  }
  if (shape) {
    patch[`Parts.${partName}.meta.waveformIcon.type`] = shape.id ?? shape;
  }
  return patch;
}

/** Meta patch for an envelope-path part: color preset and/or ADSR shape. */
export function envelopePathPresetPatch(partName, { colorPreset = null, shape = null } = {}) {
  const patch = {};
  if (!partName) return patch;
  if (colorPreset) {
    patch[`Parts.${partName}.meta.envelopePath.stroke`] = colorPreset.stroke;
    patch[`Parts.${partName}.meta.envelopePath.fill`] = colorPreset.fill;
  }
  if (shape) {
    patch[`Parts.${partName}.meta.envelopePath.attack`] = shape.attack;
    patch[`Parts.${partName}.meta.envelopePath.decay`] = shape.decay;
    patch[`Parts.${partName}.meta.envelopePath.sustain`] = shape.sustain;
    patch[`Parts.${partName}.meta.envelopePath.release`] = shape.release;
    // ADSR fields only drive the path when explicit points are absent.
    patch[`Parts.${partName}.meta.envelopePath.points`] = [];
  }
  return patch;
}
