/**
 * transitionCss.js — a transition bucket as a CSS `transition` declaration, for every renderer.
 *
 * There used to be three of these and they disagreed. The part renderer listed each property
 * with its own timing. The slider renderer wrote `transition: all <one timing>`, choosing
 * transform's, else size's, else opacity's — so on a slider every property (colour included) moved
 * with whichever came first, and a colour animation the editor called dead worked there and
 * nowhere else. The control's own root wrote transform and opacity only. One document, three
 * motions, depending on which component drew it.
 *
 * Now each bucket lists the CSS properties it covers, once, for each kind of element: a part, the
 * control's own box, and an SVG shape (coloured with fill and stroke, not background and color).
 */

export const BUCKET_PROPERTIES = {
  // A part is placed with left/top, so its x, y and offsets — which the editor has always listed
  // as "transform" — only glide if left and top are in the list. They were not, so moving a part
  // never animated however the target was set.
  part: {
    transform: ['transform', 'translate', 'rotate', 'scale', 'left', 'top'],
    opacity: ['opacity'],
    size: ['width', 'height'],
    colour: ['background-color', 'color', 'border-color', 'fill', 'stroke'],
    // Showing and hiding: opacity eases, and `visibility` — which interpolates as "visible" whenever
    // either end is — keeps the part visible for the whole fade out and makes it visible at the start
    // of a fade in. Listed after opacity, so a part with both buckets fades on this one's timing.
    visibility: ['opacity', 'visibility'],
  },
  // The control's own box. Its left/top are where it sits on the panel, which no animation moves,
  // so they stay out: a transition there would make dragging a control in the editor lag.
  root: {
    transform: ['transform', 'translate', 'rotate', 'scale'],
    opacity: ['opacity'],
    size: ['width', 'height'],
    colour: ['background-color', 'color', 'border-color', 'fill', 'stroke'],
    // The control itself is shown and hidden by its layer and its own switch, never by a state.
    visibility: [],
  },
  svg: {
    transform: ['transform', 'translate', 'rotate', 'scale'],
    opacity: ['opacity', 'fill-opacity', 'stroke-opacity'],
    // SVG geometry is attributes, which CSS cannot transition; a size bucket on an SVG part
    // has nothing to act on. utils/animationModel.js says so on the target row.
    size: [],
    colour: ['fill', 'stroke', 'stop-color', 'color'],
    visibility: ['opacity', 'visibility'],
  },
};

/** The bucket order the declaration is written in, so equal buckets give an equal string. */
const ORDER = ['transform', 'opacity', 'size', 'colour', 'visibility'];

/**
 * `transition:…;` for one bucket object `{ transform, opacity, size, colour }` (each a timing
 * string or null), or '' when nothing in it animates.
 */
export function transitionDeclaration(bucket, { target = 'part' } = {}) {
  if (!bucket) return '';
  const table = BUCKET_PROPERTIES[target] ?? BUCKET_PROPERTIES.part;
  const rules = [];
  for (const name of ORDER) {
    const timing = bucket[name];
    if (!timing) continue;
    for (const property of table[name]) rules.push(`${property} ${timing}`);
  }
  return rules.length ? `transition:${rules.join(', ')};` : '';
}

/** The same for the control's root, whose transitions arrive as a Map of bucket → timing. */
export function rootTransitionDeclaration(rootTransitions) {
  if (!rootTransitions || typeof rootTransitions.get !== 'function') return '';
  return transitionDeclaration({
    transform: rootTransitions.get('transform') ?? null,
    opacity: rootTransitions.get('opacity') ?? null,
    size: null,
    colour: rootTransitions.get('colour') ?? null,
  }, { target: 'root' });
}

/**
 * The colour timing as a custom property, for the elements INSIDE a control or part that actually
 * paint: a fill layer, a text block, a border. `transition` does not inherit; a custom property
 * does, and those elements read it with `transition: var(--ce-colour-transition, none)` (the
 * `ce-colour-anim` class). Every control and every part sets it — to `none` when it has no colour
 * timing — so a part never borrows its parent's.
 */
export function colourTransitionVar(timing, { svg = false } = {}) {
  if (!timing) return '--ce-colour-transition:none;';
  const properties = svg ? BUCKET_PROPERTIES.svg.colour : BUCKET_PROPERTIES.part.colour;
  return `--ce-colour-transition:${properties.map((property) => `${property} ${timing}`).join(', ')};`;
}
