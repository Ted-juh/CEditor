import { mount, unmount } from 'svelte';
import SceneryLayer from '../editor/SceneryLayer.svelte';
import { sceneryFingerprint } from './sceneryModel.js';

// Cache each caption/plate separately. Editing one caption must not mount every
// other caption again. Dimensions, zoom and accessibility annotations are part
// of the rendered output; MIDI sessions and device routing are not.
const cache = new Map();
const LIMIT = 2048;
const counts = { builds: 0, hits: 0 };
export function sceneryMarkupKey(control, props) {
  return JSON.stringify([props.panelWidth ?? 0, props.panelHeight ?? 0,
    props.scale ?? 1, props.annotate === true, props.controlSet ?? null, sceneryFingerprint([control])]);
}
export function sceneryGroundKey(controls, props) {
  return JSON.stringify([props.panelWidth ?? 0, props.panelHeight ?? 0,
    props.scale ?? 1, props.annotate === true, props.controlSet ?? null, sceneryFingerprint(controls)]);
}
export function bakeSceneryControl(control, props) {
  const key = sceneryMarkupKey(control, props);
  if (cache.has(key)) {
    const markup = cache.get(key);
    cache.delete(key);
    cache.set(key, markup);
    counts.hits++;
    return markup;
  }
  const scratch = document.createElement('div');
  const app = mount(SceneryLayer, { target: scratch, props: { ...props, controls: [control] } });
  let markup;
  try { markup = scratch.innerHTML; } finally { unmount(app); }
  cache.set(key, markup);
  counts.builds++;
  if (cache.size > LIMIT) cache.delete(cache.keys().next().value);
  return markup;
}
export const bakeSceneryGround = (controls, props) => controls.map(control => bakeSceneryControl(control, props)).join('');
export const sceneryMarkupStats = () => ({ ...counts, entries: cache.size });
export function clearSceneryMarkupCache() {
  cache.clear();
  counts.builds = counts.hits = 0;
}
