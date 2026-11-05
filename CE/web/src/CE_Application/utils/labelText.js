// labelText.js — the words a Label that shows something of another control reads
// (utils/labelShows.js says what it can show and of which control).
//
// Worked out from the control's live value where something runs (Preview, the player and the
// plug-in: PanelPreviewSurface's applyLabelShowsSource), and from the control as it is authored on
// the editor's canvas. It reads the interaction runtime for a control's printed value, which is why
// it is apart from labelShows.js: the model must stay loadable without the runtime.

import { formatSliderNumericValue, getSliderResolvedValues, isSliderBehavior } from './sliderBehavior.js';
import { resolveInteractionContext } from './interactionRuntime.js';
import { controlsById, labelShows, labelSourceId } from './labelShows.js';

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * The words a Label showing `shows` of `source` reads, `session` being the source's live session
 * (null where nothing runs: the editor's canvas, which reads the control as authored).
 */
export function shownText(source, shows, session = null) {
  if (!source || !shows) return '';
  const kids = source._children ?? {};
  const behavior = kids.Behavior ?? {};
  const type = String(kids.Core?.controlType ?? '');
  if (shows === 'name') return String(kids.Core?.name ?? '');
  if (shows === 'text') return String(kids.Text?.content ?? '');
  // A meter's value as its readout printed it: prefix, figures, suffix.
  if (kids.Meter && (type === 'Meter' || type === 'ProgressBar')) {
    const meter = kids.Meter;
    const places = Math.min(6, Math.max(0, Math.round(num(meter.valuePrecision, 0))));
    const print = (value) => `${meter.valuePrefix ?? ''}${num(value, 0).toFixed(places)}${meter.valueSuffix ?? ''}`;
    if (shows === 'value') {
      const live = session?.valueOverrideEnabled === true ? session.valueOverride : (meter.__value ?? meter.value);
      return print(live);
    }
    if (shows === 'min') return print(meter.valueMin ?? 0);
    if (shows === 'max') return print(meter.valueMax ?? 1);
    if (shows === 'unit') return String(meter.valueSuffix ?? '').trim();
    return '';
  }
  if (isSliderBehavior(behavior)) {
    if (shows === 'unit') return String(behavior.unit ?? '').trim();
    if (shows === 'min') return formatSliderNumericValue(behavior, num(behavior.min, 0));
    if (shows === 'max') return formatSliderNumericValue(behavior, num(behavior.max, 1));
    if (shows === 'start' || shows === 'end') {
      return formatSliderNumericValue(behavior, getSliderResolvedValues(behavior, session)[shows]);
    }
  }
  if (shows === 'unit') return String(behavior.unit ?? '').trim();
  if (shows === 'value' || shows === 'start' || shows === 'end') {
    const signals = resolveInteractionContext(source, session ?? {});
    const key = shows === 'start' ? 'startValueDisplay' : (shows === 'end' ? 'endValueDisplay' : 'valueDisplay');
    return String(signals?.[key] ?? signals?.valueDisplay ?? '');
  }
  if (shows === 'min' || shows === 'max') {
    const value = behavior[shows];
    return value === undefined || value === null ? '' : String(value);
  }
  return '';
}

// One index per panel tree: a store update replaces the array, so the old index goes with it.
const indexes = new WeakMap();
function indexOf(panelControls) {
  if (!Array.isArray(panelControls)) return new Map();
  let index = indexes.get(panelControls);
  if (!index) {
    index = controlsById(panelControls);
    indexes.set(panelControls, index);
  }
  return index;
}

/**
 * The words `label` reads on the editor's canvas, the control it shows found among `panelControls`;
 * null for its own words: when it shows nothing, or the control it shows is not on the panel (a Label
 * pasted into another panel, a control deleted by a script).
 */
export function authoredShownText(label, panelControls) {
  const shows = labelShows(label);
  if (!shows) return null;
  const id = labelSourceId(label);
  const source = id ? indexOf(panelControls).get(id) : null;
  return source ? shownText(source, shows, null) : null;
}
