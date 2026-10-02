import { mount, unmount } from 'svelte';
import ControlSetShotHarness from './ControlSetShotHarness.svelte';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { BUILT_IN_CONTROL_SETS, normalizeControlSet } from '../src/CE_Application/models/controlSets.js';
import { PANEL_SIZE_PRESETS, PANEL_TEMPLATES, buildPanelFromTemplate } from '../src/CE_Application/models/panelTemplates.js';
// The panel faces: a set's type block names them, and a picture in the fallback face proves nothing.
import '../src/assets/fonts/panelFonts.css';
import { createControlSetStarter } from '../src/CE_Application/models/controlSetStarter.js';
import { STARTER_CONTROL_SETS } from '../src/CE_Application/models/controlSetCoverage.js';
import ControlSetGallery from '../src/CE_Application/panels/ControlSetGallery.svelte';
import { panels, activePanel, addPanel } from '../src/CE_Application/stores/panels.js';
import { get } from 'svelte/store';

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
  starterIds: STARTER_CONTROL_SETS.map(s => s.id),
  showStarter(id, { disabled = false, original = false, materialize = true } = {}) {
    if (mounted) unmount(mounted);
    const panel = createControlSetStarter(id, { materialize });
    if (disabled || original) for (const control of panel.controls) {
      if (disabled) control._children.Core.enabled = false;
      if (original) control._children.Core.controlForm = 'original';
    }
    mounted = mount(ControlSetShotHarness, { target: document.getElementById('host'), props: { panel } });
    return { width: panel.width, height: panel.height, controls: panel.controls.length, faders: panel.controls.filter(c=>c._children.Core.controlType==='Slider').map(c=>c._children.Core.id) };
  },
  gallery() {
    if (mounted) unmount(mounted);
    if (!get(activePanel)) addPanel(createControlSetStarter('graphite'));
    mounted = mount(ControlSetGallery, { target: document.getElementById('host'), props: { onclose: () => { if (mounted) unmount(mounted); mounted = null; } } });
  },
  active() { const p = get(activePanel); return { count: get(panels).length, name: p?.name, set: p?.controlSet?.id, pins: p?.controls?.map(c => c._children.Core.controlSetId) }; },
  show(setId) {
    if (mounted) unmount(mounted);
    const panel = specimenPanel(setId);
    mounted = mount(ControlSetShotHarness, { target: document.getElementById('host'), props: { panel } });
    return { width: panel.width, height: panel.height, controls: panel.controls.length, set: panel.controlSet.id };
  },
  /**
   * A Macro beside a plain Knob under one set (macroSetKnob.mjs): the Macro's knob should be the
   * Knob's design. `knobDesign` is written into the Macro when given ('own', 'set').
   */
  showMacro(setId, { value = 0.62, knobDesign } = {}) {
    if (mounted) unmount(mounted);
    const macro = createControl('Macro', { Transform: { x: 20, y: 20, width: 300, height: 130 } });
    macro._children.Macro.value = value;
    if (knobDesign !== undefined) macro._children.Macro.knobDesign = knobDesign;
    const knob = createControl('Knob', { Transform: { x: 340, y: 20, width: 120, height: 120 }, Behavior: { defaultCurrentValue: value } });
    const panel = { ...createPanel(), id: 1, width: 480, height: 170, controls: [macro, knob], controlSet: normalizeControlSet(setId) };
    mounted = mount(ControlSetShotHarness, { target: document.getElementById('host'), props: { panel } });
    return { controls: panel.controls.length, macroId: macro._children.Core.id, knobId: knob._children.Core.id };
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
  templateIds: PANEL_TEMPLATES.map((t) => t.id),
  templateSizes: Object.fromEntries(PANEL_TEMPLATES.map((t) => [t.id, { width: t.width, height: t.height }])),
  sizePresets: PANEL_SIZE_PRESETS.map(({ id, width, height }) => ({ id, width, height })),
  builtInSetIds: BUILT_IN_CONTROL_SETS.map((s) => s.id),
  /**
   * A New Panel template, built the way the dialog builds it (so a smaller size scales it), under
   * one set. `firstLabelText` replaces the first Label's text: the check's proof that it can see a
   * caption that does not fit. Returns the Label ids, which is what the check measures.
   */
  showTemplate(templateId, setId, { width, height, firstLabelText = null } = {}) {
    if (mounted) unmount(mounted);
    const panel = { ...buildPanelFromTemplate({ templateId, width, height }), id: 1, controlSet: normalizeControlSet(setId) };
    const labels = panel.controls.filter((c) => c._children.Core.controlType === 'Label');
    if (firstLabelText != null && labels[0]) labels[0]._children.Text.content = firstLabelText;
    mounted = mount(ControlSetShotHarness, { target: document.getElementById('host'), props: { panel } });
    return { width: panel.width, height: panel.height, labels: labels.map((c) => ({ id: c._children.Core.id, text: c._children.Text.content })) };
  },
  /** Resolves once every face the page asked for has loaded (or failed), so a shot is in the real font. */
  fontsReady() {
    return document.fonts.ready.then(() => Array.from(document.fonts).filter((face) => face.status === 'loaded').map((face) => face.family));
  },
};
