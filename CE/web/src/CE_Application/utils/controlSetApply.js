// controlSetApply.js — applying a control set to a panel, with a say in what changes.
//
// Applying a set switched `panel.controlSet` and nothing else, so everything changed at once: every
// control that follows the panel's set took the new one's look, and the panel its background and
// surface material. The owner asked to choose: the background or not, the material or not, which
// kinds of control, or only the selected ones.
//
// It is done with what the model already has, so nothing new has to be understood by the player:
//   - a control that is NOT to change is pinned to the set it was drawn with (Core.controlSetId,
//     what Control design › Set does by hand), and keeps its look;
//   - a control pinned to some other set is unpinned when asked to change too;
//   - the background is kept by writing the colour the panel shows now as its own, with
//     `bgFollowsSet: false` so the new set's colour does not replace it (utils/backgroundCSS.js);
//   - the material is kept by writing the old set's onto the panel as `surfaceMaterial`, which the
//     panel surfaces prefer to the set's.
// Pure: it returns the new panel; stores/controlSets.js writes it in one go, one undo step.

import { capitalised, identifierWords } from './authorWords.js';

const FAMILY_LABEL = {
  Knob: 'Knobs', Slider: 'Sliders', Button: 'Buttons', MomentaryButton: 'Buttons', TimedButton: 'Buttons',
  OneShotButton: 'Buttons', ToggleButton: 'Switches', Meter: 'Meters', ProgressBar: 'Meters', Label: 'Labels',
  DrumPads: 'Drum pads', StepSequencer: 'Steppers', LcdDisplay: 'Displays', PixelDisplay: 'Displays',
};

/** The kind of control a type is counted as in the Apply window. */
export function controlFamily(type) {
  const name = String(type ?? '');
  return FAMILY_LABEL[name] ?? `${capitalised(identifierWords(name) || 'control')}s`;
}

function childrenOf(control) {
  const map = control?._children?.Children?._children;
  return map && typeof map === 'object' ? Object.values(map) : [];
}

function eachControl(controls, visit) {
  for (const control of Array.isArray(controls) ? controls : []) {
    visit(control);
    eachControl(childrenOf(control), visit);
  }
}

function pinOf(control) {
  return String(control?._children?.Core?.controlSetId ?? '').trim();
}

/**
 * What the Apply window lists: the kinds of control that follow the panel's set, with how many,
 * and the controls pinned to another set.
 */
export function panelSetSummary(panel) {
  const counts = new Map();
  let pinned = 0;
  const pinnedSets = new Set();
  eachControl(panel?.controls, (control) => {
    const type = String(control?._children?.Core?.controlType ?? '');
    if (!type || type === 'Container' || type === 'CustomComponent') return;
    const pin = pinOf(control);
    if (pin) { pinned += 1; pinnedSets.add(pin); return; }
    const family = controlFamily(type);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  });
  return {
    families: [...counts.entries()].map(([label, count]) => ({ label, count })),
    pinned,
    pinnedSets: [...pinnedSets],
  };
}

function withCore(control, patch) {
  return { ...control, _children: { ...control._children, Core: { ...control._children.Core, ...patch } } };
}

function mapControls(controls, fn) {
  return (Array.isArray(controls) ? controls : []).map((control) => {
    let next = fn(control);
    const map = next?._children?.Children?._children;
    if (map && typeof map === 'object') {
      const mapped = Object.fromEntries(Object.entries(map).map(([key, child]) => [key, mapControls([child], fn)[0]]));
      next = { ...next, _children: { ...next._children, Children: { ...next._children.Children, _children: mapped } } };
    }
    return next;
  });
}

const bare = (colour) => String(colour ?? '').replace(/^#/, '').toUpperCase();

/**
 * The panel with `newSet` applied as chosen.
 *
 * choices: { background, material (booleans, default true), families (labels to change; null for
 * all), selected (control ids; null for any), includePinned (unpin controls pinned elsewhere) }.
 * context: { oldSetId, oldSet, newSet, defaultPanelColour }.
 */
export function applyControlSetChoices(panel, newSetRef, choices = {}, context = {}) {
  const { background = true, material = true, families = null, selected = null, includePinned = false } = choices;
  const { oldSetId = '', oldSet = null, defaultPanelColour = '' } = context;
  const wanted = (control) => {
    const family = controlFamily(control?._children?.Core?.controlType);
    if (families && !families.has(family)) return false;
    if (selected && !selected.has(String(control?._children?.Core?.id ?? ''))) return false;
    return true;
  };
  const controls = mapControls(panel?.controls, (control) => {
    const type = String(control?._children?.Core?.controlType ?? '');
    if (!control?._children?.Core || !type || type === 'Container' || type === 'CustomComponent') return control;
    const pin = pinOf(control);
    if (!pin) return wanted(control) ? control : withCore(control, { controlSetId: oldSetId });
    if (includePinned && pin !== newSetRef.id && wanted(control)) return withCore(control, { controlSetId: '' });
    return control;
  });

  const next = { ...panel, controls, controlSet: newSetRef };
  const authored = bare(panel?.bgColour || defaultPanelColour);
  const followed = panel?.bgFollowsSet !== false && authored === bare(defaultPanelColour);
  const shown = followed && oldSet?.panel?.colour ? bare(oldSet.panel.colour) : authored;
  if (background) {
    // The new set's background: back to following the set, from the default the set's colour replaces.
    next.bgColour = defaultPanelColour || panel?.bgColour;
    delete next.bgFollowsSet;
  } else {
    next.bgColour = shown;
    next.bgFollowsSet = false;
  }
  if (material) delete next.surfaceMaterial;
  else next.surfaceMaterial = panel?.surfaceMaterial ?? oldSet?.panel?.material ?? { enabled: false };
  return next;
}
