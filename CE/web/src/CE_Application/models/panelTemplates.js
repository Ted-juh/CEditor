/**
 * Starter content for the New Panel flow. A new document should be a
 * starting point, not a bare grey rectangle: size presets for common panel
 * shapes, and a few small templates whose controls demonstrate the core
 * component types in a sensible layout.
 *
 * Each template's `build()` mints fresh controls on every call (ids come
 * from createControl), so creating two panels from one template is safe.
 */
import { createControl } from './componentTypes.js';
import { createPanel } from '../stores/panelModel.js';

export const PANEL_SIZE_PRESETS = [
  { id: 'default', label: 'Default', width: 600, height: 400 },
  { id: 'wide', label: 'Wide editor', width: 900, height: 500 },
  { id: 'strip', label: 'Mixer strip', width: 320, height: 640 },
  { id: 'bar', label: 'Control bar', width: 800, height: 160 },
  { id: 'large', label: 'Large', width: 1024, height: 640 },
];

function knob(name, x, y, size = 64) {
  return createControl('Knob', { name, Transform: { x, y, width: size, height: size } });
}

function label(content, x, y, w = 80, h = 18) {
  return createControl('Label', {
    Transform: { x, y, width: w, height: h },
    Text: { content },
  });
}

function slider(name, x, y, w = 40, h = 160) {
  return createControl('Slider', { name, Transform: { x, y, width: w, height: h } });
}

function background(w, h) {
  return createControl('Background', { Transform: { x: 0, y: 0, width: w, height: h } });
}

export const PANEL_TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'An empty panel.',
    width: 600,
    height: 400,
    build: () => [],
  },
  {
    id: 'synth',
    name: 'Synth basics',
    description: 'Filter and envelope knobs, volume sliders, an init button.',
    width: 640,
    height: 360,
    build: () => {
      const controls = [background(640, 360), label('MY SYNTH', 24, 20, 160, 22)];
      const knobs = ['Cutoff', 'Resonance', 'Attack', 'Release'];
      knobs.forEach((name, i) => {
        const x = 32 + i * 110;
        controls.push(knob(name, x, 90));
        controls.push(label(name, x - 8, 162, 80, 16));
      });
      controls.push(slider('Volume', 500, 60, 40, 200));
      controls.push(slider('Mod', 560, 60, 40, 200));
      controls.push(label('VOL', 500, 268, 40, 16));
      controls.push(label('MOD', 560, 268, 40, 16));
      controls.push(createControl('MomentaryButton', {
        name: 'Init',
        Transform: { x: 32, y: 260, width: 110, height: 40 },
        Text: { content: 'Init Patch' },
      }));
      return controls;
    },
  },
  {
    id: 'performance',
    name: 'Performance pads',
    description: 'Drum pads, transport, and two macro knobs.',
    width: 620,
    height: 460,
    build: () => [
      background(620, 460),
      createControl('DrumPads', { name: 'Pads', Transform: { x: 24, y: 24, width: 320, height: 320 } }),
      createControl('Macro', { name: 'Macro A', Transform: { x: 400, y: 60, width: 84, height: 84 } }),
      createControl('Macro', { name: 'Macro B', Transform: { x: 510, y: 60, width: 84, height: 84 } }),
      label('MACRO A', 400, 152, 84, 16),
      label('MACRO B', 510, 152, 84, 16),
      createControl('Transport', { name: 'Transport', Transform: { x: 24, y: 372, width: 572, height: 64 } }),
    ],
  },
  {
    id: 'mixer',
    name: 'Mixer strip',
    description: 'Four channels: gain knob over fader, panic at the foot.',
    width: 320,
    height: 640,
    build: () => {
      const controls = [background(320, 640)];
      for (let i = 0; i < 4; i++) {
        const x = 24 + i * 72;
        controls.push(knob(`Gain ${i + 1}`, x, 40, 48));
        controls.push(slider(`Ch ${i + 1}`, x + 4, 110, 40, 380));
        controls.push(label(`CH ${i + 1}`, x, 500, 48, 16));
      }
      controls.push(createControl('Panic', {
        name: 'Panic',
        Transform: { x: 24, y: 560, width: 272, height: 48 },
      }));
      return controls;
    },
  },
];

/** Assemble a ready-to-open panel from the dialog's choices. */
export function buildPanelFromTemplate({ name, width, height, templateId }) {
  const template = PANEL_TEMPLATES.find((t) => t.id === templateId) ?? PANEL_TEMPLATES[0];
  const panel = createPanel(name || 'Untitled Panel');
  panel.width = Math.max(80, Math.round(width || template.width));
  panel.height = Math.max(80, Math.round(height || template.height));
  panel.controls = template.build();
  return panel;
}
