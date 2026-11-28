/**
 * optionStagger.js — an animation on every option of a choice group, each a little after the last
 * (`Parts.option`, `Parts.optionLabel`: choiceGroupLayout.js CHOICE_PARTS).
 *
 * The player writes one animation for all the options, and each option says where it stands: its
 * rank, counted forward, backward, or out from the option chosen (`--ce-rank-*`, set on it by
 * ChoiceGroup.svelte). The animation's delay is the delay it was given plus its rank times the
 * stagger, worked out by the browser (`calc()` over the variable), so one rule serves every option
 * and the player need not know how many there are. The Components showcase's Choice group, Appear.
 *
 * `optionStagger` (ms between one option and the next, 0 for none) and `optionOrder` ('forward',
 * 'reverse' or 'fromChosen') are fields of the animation, as the Animation tab writes them.
 */

// `scattered`: in an order that looks like none, the same each time (a meter's lamps sparkling). A
// meter's lamps use these too (MeterDeviceParts.svelte), the level standing for the option chosen.
export const OPTION_ORDERS = Object.freeze(['forward', 'reverse', 'fromChosen', 'scattered']);
export const OPTION_ORDER_LABELS = Object.freeze({ forward: 'In order', reverse: 'Last first', fromChosen: 'Out from the chosen', scattered: 'Scattered' });
/** The same orders as a meter's lamps are offered them. */
export const LAMP_ORDER_LABELS = Object.freeze({ forward: 'Along the row', reverse: 'From the top down', fromChosen: 'Out from the level', scattered: 'Scattered' });
const RANK_VARS = Object.freeze({ forward: '--ce-rank-forward', reverse: '--ce-rank-reverse', fromChosen: '--ce-rank-chosen', scattered: '--ce-rank-scattered' });
const MAX_STAGGER = 2000;

/** An animation's stagger over the options, `{ by, order }`, or null when it has none. */
export function readOptionStagger(animation, timeScale = 1) {
  const scale = Number(timeScale) > 0 ? Number(timeScale) : 1;
  const by = Math.min(MAX_STAGGER, Math.max(0, Number(animation?.optionStagger) || 0)) * scale;
  if (!(by > 0)) return null;
  return { by, order: OPTION_ORDERS.includes(animation?.optionOrder) ? animation.optionOrder : 'forward' };
}

/** An animation's delay as CSS: its own, and with a stagger, its rank's worth more on each option. */
export function staggeredDelay(delayMs, stagger = null) {
  const own = Math.round(Number(delayMs) || 0);
  if (!stagger) return `${own}ms`;
  return `calc(${own}ms + var(${RANK_VARS[stagger.order] ?? RANK_VARS.forward}, 0) * ${Math.round(stagger.by)}ms)`;
}

/**
 * Where one option stands, as the custom properties a staggered delay reads: its place counted
 * forward and backward, and how many places it is from the option chosen (forward, when none is).
 */
export function optionRankVars(index, count, chosenIndex = -1) {
  const fromChosen = chosenIndex >= 0 ? Math.abs(index - chosenIndex) : index;
  return `--ce-rank-forward:${index};--ce-rank-reverse:${Math.max(0, count - 1 - index)};--ce-rank-chosen:${fromChosen};--ce-rank-scattered:${scatteredRank(index, count)};`;
}

// Where `index` comes in a fixed shuffle of `count` places: each place once, in an order kept from one
// draw to the next, so the same lamps sparkle first every time.
const shuffles = new Map();
export function scatteredRank(index, count) {
  const n = Math.max(1, Math.round(count));
  if (!shuffles.has(n)) {
    const key = (i) => {
      let h = Math.imul(i + 1, 0x9e3779b1);
      h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
      return (h ^ (h >>> 16)) >>> 0;
    };
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => key(a) - key(b));
    const rank = new Array(n);
    order.forEach((place, at) => { rank[place] = at; });
    shuffles.set(n, rank);
  }
  return shuffles.get(n)[Math.max(0, Math.min(n - 1, Math.round(index)))];
}
