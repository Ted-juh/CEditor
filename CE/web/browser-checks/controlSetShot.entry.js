import { mount, unmount } from 'svelte';
import ControlSetShotHarness from './ControlSetShotHarness.svelte';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { normalizeControlSet } from '../src/CE_Application/models/controlSets.js';

window.__JUCE__ = undefined;

// The specimen every mockup board carried: knobs, a slider, buttons, a toggle, a combobox, a
// number — enough that a set's family patch and material have something of every kind to land on.
function specimenPanel(setId) {
  const place = (type, x, y, w, h, extra = {}) => createControl(type, { Transform: { x, y, width: w, height: h }, ...extra });
  const controls = [
    place('Knob', 30, 30, 120, 120, { Behavior: { defaultCurrentValue: 0.62 } }),
    place('Knob', 170, 30, 120, 120, { Behavior: { defaultCurrentValue: 0.35 } }),
    place('Knob', 310, 50, 80, 80, { Behavior: { defaultCurrentValue: 0.5 } }),
    place('Slider', 420, 40, 240, 48, { Behavior: { defaultCurrentValue: 0.7 } }),
    place('Slider', 420, 100, 240, 48, { Behavior: { defaultCurrentValue: 0.3 } }),
    place('Button', 690, 40, 132, 40, { Text: { content: 'PANIC' } }),
    // On, so a set's lamp shows lit.
    place('ToggleButton', 690, 92, 136, 40, { Text: { content: 'LEGATO' }, Behavior: { defaultValue: true } }),
    place('Combobox', 690, 144, 200, 36),
    place('Number', 420, 160, 160, 36),
  ];
  const panel = { ...createPanel(), id: 1, width: 920, height: 220, controls, controlSet: normalizeControlSet(setId) };
  return panel;
}

let mounted = null;
window.__controlSetShot = {
  show(setId) {
    if (mounted) unmount(mounted);
    const panel = specimenPanel(setId);
    mounted = mount(ControlSetShotHarness, { target: document.getElementById('host'), props: { panel } });
    return { width: panel.width, height: panel.height, controls: panel.controls.length, set: panel.controlSet.id };
  },
};
