import { buildSceneryRenderPlan } from './sceneryRenderPlan.js';
import { bakeSceneryControl } from './sceneryMarkupCache.js';
import { bakeStaticPartEntries, whyControlNotBakeable } from './staticPartBaking.js';
import { resolveInteractiveControl } from './interactionRuntime.js';
import { getChildControls } from './containment.js';
import { scheduleIdlePreparation } from './idlePreparation.js';
import { controlSetForPanel } from '../models/controlSets.js';
import { resolveControlForSet } from '../models/controlSetFamilies.js';

function* controlsIn(controls) {
  for (const control of controls) {
    yield control;
    yield* controlsIn(getChildControls(control));
  }
}

export function preparePreviewInBackground(panel, { scale = 1, delay = 800, neverFold = null, host = globalThis, onComplete, onError } = {}) {
  return scheduleIdlePreparation(function* () {
    // Planning and SVG compilation happen after the quiet period too. Nothing
    // executes panel scripts, starts a preview session or sends MIDI here.
    const plan = buildSceneryRenderPlan(panel, { preview: true, fold: true, neverFold });
    const props = { allControls: panel.controls, panelControls: panel.controls,
      panelWidth: panel.width, panelHeight: panel.height, scale, annotate: true, controlSet: controlSetForPanel(panel) };
    for (const item of plan.items) {
      if (item.type !== 'ground') continue;
      for (const control of item.controls) yield () => bakeSceneryControl(control, props);
    }
    for (const control of controlsIn(panel.controls ?? [])) {
      if (whyControlNotBakeable(control)) continue;
      yield () => {
        // Resolve generated defaults and geometry exactly as CanvasControl does.
        // This pure resolver clones before materializing; the document is untouched.
        const resolved = resolveInteractiveControl(resolveControlForSet(control, props.controlSet), {}).control;
        const entries = Object.entries(resolved._children.Parts?._children ?? {}).filter(([, part]) => part?.visible !== false);
        const t = resolved._children.Transform ?? {};
        bakeStaticPartEntries(resolved, entries, t.width, t.height);
      };
    }
  }, { delay, host, onComplete, onError });
}
