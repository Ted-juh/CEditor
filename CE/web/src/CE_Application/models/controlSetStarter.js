import { createControl } from './componentTypes.js';
import { getControlSet } from './controlSets.js';
import { resolveControlForSet } from './controlSetFamilies.js';
import { createPanel } from '../stores/panelModel.js';
import { starterDirection } from './controlSetCoverage.js';

// Gallery and starter share ordinary controls. Materialization exposes design values in the
// inspector; the pin keeps the design when the user copies a control to another panel.
export function createControlSetStarter(setId, { materialize = true } = {}) {
  const set = getControlSet(setId);
  if (!set) throw new Error(`Unknown control set: ${setId}`);
  const direction = starterDirection(setId);
  const controls = [];
  function place(type, x, y, width, height, extra = {}) {
    let c = createControl(type, { Core: { controlSetId: setId }, Transform: { x, y, width, height }, ...extra });
    if (materialize) c = resolveControlForSet(c, set);
    controls.push(c);
    return c;
  }
  function label(title, x, y, width = 250, size = 13) {
    place('Label', x, y, width, 26, { Background: { _children: { Fill: { colour: '00000000' }, Border: { enabled: false, thickness: 0 } } }, Text: { content: title, _children: { Font: { size } } } });
  }
  label(set.name.toUpperCase(), 26, 16, 650, 24);
  label(direction?.title ?? 'Control set', 26, 48, 650, 12);
  label('TURN / SLIDE', 26, 92);
  label('PRESS / SELECT', 540, 92);
  place('Knob', 26, 126, 120, 132, { Behavior: { defaultCurrentValue: 0.63 } });
  place('Knob', 164, 142, 92, 110, { Behavior: { defaultCurrentValue: 0.35 } });
  const slider = place('Slider', 288, 140, 214, 78, { Behavior: { defaultCurrentValue: 0.66 } });
  slider._children.Parts._children.labelTitle._children.Text.content = 'LEVEL';
  place('Crossfader', 288, 224, 214, 62);
  place('Button', 540, 128, 126, 42, { Text: { content: 'TRIGGER' } });
  place('ToggleButton', 692, 128, 160, 42, { Text: { content: 'HOLD' }, Behavior: { defaultValue: true } });
  place('CyclicButton', 540, 186, 126, 42, { Text: { content: 'CYCLE' } });
  place('Combobox', 692, 186, 160, 42);
  place('Number', 540, 246, 150, 38);
  place('TextInput', 710, 246, 142, 38, { Text: { content: 'Studio A' } });
  label('PLAY / SHAPE', 26, 310);
  label('MEASURE / ROUTE', 540, 310);
  place('DrumPads', 26, 348, 228, 214, { DrumPads: { rows: 2, cols: 2, showHeader: false, showNotes: false } });
  place('Envelope', 284, 348, 220, 120);
  place('Ribbon', 284, 484, 220, 76, { Ribbon: { orientation: 'horizontal', showValue: false } });
  place('Meter', 540, 354, 312, 48, { Meter: { orientation: 'horizontal', value: 0.7 } });
  place('Matrix', 540, 430, 166, 134, { Matrix: { rows: ['LFO', 'ENV', 'VEL'], cols: ['OSC', 'FLT', 'AMP'], amounts: [.6, 0, -.4, 0, .7, 0, 0, .4, .8] } });
  place('VectorJoystick', 728, 430, 124, 134);
  label('Copy a control into your panel. Its pinned design travels with it.', 26, 590, 820, 12);
  return { ...createPanel(), name: `${set.name} — starter`, width: 880, height: 636,
    description: direction?.detail ?? set.description, controls, controlSet: { id: setId }, modified: true };
}
