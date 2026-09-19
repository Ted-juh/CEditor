import { mount, unmount } from 'svelte';
import ControlSetShotHarness from './ControlSetShotHarness.svelte';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { normalizeControlSet } from '../src/CE_Application/models/controlSets.js';
// The panel faces: a set's type block names them, and a picture in the fallback face proves nothing.
import '../src/assets/fonts/panelFonts.css';

window.__JUCE__ = undefined;

// The specimen every mockup board carried: knobs, a slider, buttons, a toggle, a combobox, a
// number, an LCD — enough that a set's family patch and material have something of every kind to land on.
function specimenPanel(setId) {
  const place = (type, x, y, w, h, extra = {}) => createControl(type, { Transform: { x, y, width: w, height: h }, ...extra });
  // A slider's title is its labelTitle part's text, not a Text section.
  const titled = (control, title) => {
    control._children.Parts._children.labelTitle._children.Text.content = title;
    return control;
  };
  const controls = [
    place('Knob', 30, 30, 120, 120, { Behavior: { defaultCurrentValue: 0.62 } }),
    place('Knob', 170, 30, 120, 120, { Behavior: { defaultCurrentValue: 0.35 } }),
    place('Knob', 310, 50, 80, 80, { Behavior: { defaultCurrentValue: 0.5 } }),
    // Titled, so the row above the track shows: the title at its left end, the value at its right.
    titled(place('Slider', 420, 40, 240, 48, { Behavior: { defaultCurrentValue: 0.7 } }), 'LEVEL'),
    titled(place('Slider', 420, 100, 240, 48, { Behavior: { defaultCurrentValue: 0.3 } }), 'DRIVE'),
    place('Button', 690, 40, 132, 40, { Text: { content: 'PANIC' } }),
    // On, so a set's lamp shows lit.
    place('ToggleButton', 690, 92, 136, 40, { Text: { content: 'LEGATO' }, Behavior: { defaultValue: true } }),
    place('Combobox', 690, 144, 200, 36),
    place('Number', 420, 160, 160, 36),
    // The glass follows the set (display.* tokens): a two-line LCD under the knobs.
    place('LcdDisplay', 30, 164, 360, 44),
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
  /** The same specimen under a set given as an object — a set file's contents, or a probe. */
  showSet(set) {
    if (mounted) unmount(mounted);
    // The panel carries it as a document set, which is how a set file travels in a .cepanel.
    const panel = specimenPanel(set.id ?? 'probe');
    panel.controlSets = [set];
    mounted = mount(ControlSetShotHarness, { target: document.getElementById('host'), props: { panel } });
    return { width: panel.width, height: panel.height, controls: panel.controls.length, set: panel.controlSet.id };
  },
  /** Resolves once every face the page asked for has loaded (or failed), so a shot is in the real font. */
  fontsReady() {
    return document.fonts.ready.then(() => Array.from(document.fonts).filter((face) => face.status === 'loaded').map((face) => face.family));
  },
};
