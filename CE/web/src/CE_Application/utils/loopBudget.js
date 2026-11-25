/**
 * loopBudget.js — how many things a panel keeps moving, against the owner's budget of ten (the
 * Animation Designer, step 3's measurement; docs/design/animation-designer.md).
 *
 * WHY A BUDGET. A loop costs nothing while it is still and something every frame while it moves:
 * the first one keeps the window drawing sixty frames a second, each one after it adds its own
 * share (tools/scripts/measure-loop-budget.mjs has the numbers). The owner chose ten a panel, with
 * the editor saying so above it, never refusing: the status bar, the Animation tab's chips and the
 * Export tab each say it, in their own words.
 *
 * WHAT COUNTS, and how much:
 *   - a pattern that moves (patternLayers.js), on the control's background or a part's: 1;
 *   - a keyframe animation that loops — set to loop, or left to its default, which loops for an
 *     always or a state trigger (keyframeAnimation.js defaultIterations): 1, or 2 when it turns or
 *     shifts a gradient, which is repainted every frame and measured at about twice a pattern;
 *   - a text effect set to loop: 1;
 *   - a sequence set to loop: 1;
 *   - a panel scene set to loop (sceneRuntime.js, step 5b): each of its clips, 1 each — 2 for one
 *     that turns or shifts a gradient — since each one moves again every time the scene does.
 * A loop that plays only while a state holds counts: it is what the panel can be doing. A transition,
 * a one-shot, a still pattern, a switched-off animation or Animations section, a scene that plays
 * once, and a scene a gesture drives (it moves only while the hand does), count nothing.
 */
import { flatControls } from './containment.js';
import { patternEntries, patternLabel, readPattern } from './patternLayers.js';
import { defaultIterations } from './keyframeAnimation.js';

/** The owner's number, 2026-11-24: ten moving loops a panel. */
export const LOOP_BUDGET = 10;

const controlName = (control) => String(control?._children?.Core?.name || control?._children?.Core?.id || 'Control');

/** Whether an animation node loops, and what it weighs: 0, 1 or 2. */
export function animationLoopWeight(node) {
  if (!node || typeof node !== 'object' || node.enabled === false) return 0;
  const kind = String(node.kind ?? 'transition');
  if (kind === 'sequence') return node.loop === true ? 1 : 0;
  if (kind === 'text') return node.iterations === 'infinite' ? 1 : 0;
  if (kind !== 'keyframes') return 0;
  const iterations = node.iterations === undefined || node.iterations === null || node.iterations === ''
    ? defaultIterations(String(node.trigger?.type ?? 'stateChange'))
    : node.iterations;
  if (iterations !== 'infinite' && iterations !== Infinity) return 0;
  const paintsGradient = (node.frames ?? []).some((frame) => frame && (frame.turn !== undefined || frame.shift !== undefined));
  return paintsGradient ? 2 : 1;
}

function movingPatterns(background, where) {
  return patternEntries(background)
    .filter(([, node]) => { const pattern = readPattern(node); return pattern.enabled && pattern.speed > 0; })
    .map(([name]) => ({ what: `${where}${patternLabel(name)}`, kind: 'pattern', pattern: name, weight: 1 }));
}

/**
 * Everything a panel keeps moving: `{ count, over, items: [{ controlId, control, what, kind, weight,
 * animation?, pattern? }] }`, `count` weighted, `over` when it passes the budget.
 */
export function panelLoops(controls, budget = LOOP_BUDGET, { scenes = [] } = {}) {
  const items = [];
  for (const control of flatControls(controls ?? [])) {
    const controlId = control?._children?.Core?.id ?? '';
    const name = controlName(control);
    const add = (entry) => items.push({ controlId, control: name, ...entry });
    for (const entry of movingPatterns(control?._children?.Background, '')) add(entry);
    for (const [partName, part] of Object.entries(control?._children?.Parts?._children ?? {})) {
      for (const entry of movingPatterns(part?._children?.Background, `${partName} › `)) add(entry);
    }
    const section = control?._children?.Animations;
    if (section && section.enabled !== false) {
      for (const [key, node] of Object.entries(section._children ?? {})) {
        const weight = animationLoopWeight(node);
        if (weight) add({ what: key, kind: String(node.kind ?? 'transition'), animation: key, weight });
      }
    }
  }
  const names = new Map(flatControls(controls ?? []).map((control) => [control?._children?.Core?.id, controlName(control)]));
  for (const scene of Array.isArray(scenes) ? scenes : []) {
    // A scene a gesture drives moves only while the hand does: it never loops (sceneClock.js).
    if (scene?.loop !== true || scene?.clock) continue;
    for (const clip of scene.clips ?? []) {
      const paintsGradient = clip.effect?.kind === 'keyframes'
        && (clip.effect.frames ?? []).some((frame) => frame && (frame.turn !== undefined || frame.shift !== undefined));
      items.push({
        controlId: clip.controlId,
        control: names.get(clip.controlId) ?? clip.controlId,
        what: `scene ${scene.name} › ${clip.label || clip.target}`,
        kind: 'scene',
        scene: scene.id,
        weight: paintsGradient ? 2 : 1,
      });
    }
  }
  const count = items.reduce((sum, item) => sum + item.weight, 0);
  return { count, over: count > budget, budget, items };
}

/** One line per loop, for a tooltip: "Wave › Pattern 1", "Chrome › sheen (counts 2)". */
export function loopLines(items) {
  return items.map((item) => `${item.control} › ${item.what}${item.weight > 1 ? ` (counts ${item.weight})` : ''}`);
}
