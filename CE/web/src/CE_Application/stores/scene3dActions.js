// scene3dActions.js — a 3D part in the Component Designer (docs/design/import-formats.md, 3): placed,
// rendered, kept in step with its box, and its recipe changed.
//
//   utils/scene3dModel.js    the recipe. Pure.
//   utils/scene3dRender.js   three.js: the recipe into the add-on's layers. In a browser, loaded when used.
//   utils/scene3dLayers.js   the layers as a Photoshop file in memory, read by utils/psdComponentImport.js.
//   utils/scene3dMerge.js    the import's result into the component. Pure.
//   here                     the commands and what the designer shows of a render (scene3dRenders).
//
// A render takes from half a second on a graphics card to several seconds without one, so the layers
// already there stay until the new ones are ready, and a render asked for while one runs is done after
// it, once, with the recipe as it is then. A colour is changed at once without one: the colour layer it
// made is worked out again in the new colour, as a Blender knob's is (utils/pictureRecolour.js).

import { get, writable } from 'svelte/store';
import { panels, resolvedActivePanelId } from './panels.js';
import { applyControlPatch, replaceControlsById, standaloneComponentControl, updateControlProperty } from './controls.js';
import { activeControlSet } from './controlSets.js';
import { cerror, cinfo } from './console.js';
import { notify } from './scriptUi.js';
import { flatControls } from '../utils/containment.js';
import { partFrame } from '../utils/customDesignSurfaceGeometry.js';
import { numberOr } from '../utils/primitives.js';
import { layerNameOf, normalizeObject, normalizeScene3d, scene3dKey, starterKnob } from '../utils/scene3dModel.js';
import { createScene3dPart, isScene3dPart, mergeScene3d, SEPARATOR } from '../utils/scene3dMerge.js';

/** What the designer shows of each 3D part's render, by `${controlId}:${part}`: { status, milliseconds, layers, message }. */
export const scene3dRenders = writable({});
/** The object the dock's 3D tab edits: { controlId, part, index }. */
export const scene3dSelection = writable(null);

const keyOf = (controlId, part) => `${controlId}:${part}`;
const setRender = (controlId, part, value) => scene3dRenders.update((all) => ({ ...all, [keyOf(controlId, part)]: { ...(all[keyOf(controlId, part)] ?? {}), ...value } }));

/** The control as it is now, wherever it is: a panel's, or the component open on its own. */
export function findControl(controlId) {
  const standalone = get(standaloneComponentControl);
  if (standalone?._children?.Core?.id === controlId) return standalone;
  const panel = get(panels).find((entry) => entry.id === get(resolvedActivePanelId));
  return flatControls(panel?.controls ?? []).find((control) => control?._children?.Core?.id === controlId) ?? null;
}

/** A part's box in the component's pixels, as { x, y, width, height }. */
function frameOf(part, artboard) {
  const frame = partFrame(part, artboard.width, artboard.height);
  return { x: frame.left, y: frame.top, width: frame.width, height: frame.height };
}

function artboardOf(control) {
  const transform = control?._children?.Transform ?? {};
  return { width: Math.max(1, numberOr(transform.width, 220)), height: Math.max(1, numberOr(transform.height, 120)) };
}

/** A name for a new 3D part: "knob", "knob_2", ... */
function freeName(control, base = 'knob') {
  const taken = new Set(Object.keys(control?._children?.Parts?._children ?? {}));
  let name = base;
  for (let n = 2; taken.has(name) || [...taken].some((each) => each.startsWith(`${name}${SEPARATOR}`)); n += 1) name = `${base}_${n}`;
  return name;
}

/** Add a 3D part, a knob to start from, in `frame` (the component's pixels), select it and render it. Returns its name. */
export function addScene3dPart(controlId, frame, { recipe = starterKnob(), select = null } = {}) {
  const control = findControl(controlId);
  if (!control) return '';
  const name = freeName(control);
  const part = createScene3dPart(name, frame, recipe);
  part.zIndex = Object.keys(control._children?.Parts?._children ?? {}).length + 1;
  select?.(part);
  updateControlProperty(controlId, `Parts.${name}`, part);
  scene3dSelection.set({ controlId, part: name, index: 0 });
  renderScene3dPart(controlId, name);
  return name;
}

/**
 * The 3D tool's frame, drawn on the canvas (`rect`: left, top, width, height), as a 3D part: placed,
 * selected and rendered. A click without a drag places a knob 64 pixels across where it was clicked.
 */
export function placeScene3dPart(controlId, rect) {
  const small = rect.width < 16 || rect.height < 16;
  const frame = small
    ? { x: Math.round(rect.left - 32), y: Math.round(rect.top - 32), width: 64, height: 64 }
    : { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
  const name = addScene3dPart(controlId, frame);
  if (name) {
    applyControlPatch(controlId, {
      'Designer.selectedLayer': name, 'Designer.selectedLayers': [name], 'Designer.selectedSurfaceKind': 'layer', 'Designer.selectedHitZone': '',
    });
  }
  return name;
}

let followTimer = null;
let followed = '';
/**
 * The designer's parts as they are, after any change: a moment after a 3D part's box stops changing
 * (a drag is not followed pixel by pixel), what it made follows it (followScene3dFrame).
 */
export function followScene3dBoxes(controlId, parts) {
  const boxes = Object.entries(parts ?? {})
    .filter(([, part]) => isScene3dPart(part) && part?.meta?.scene3dRendered)
    .map(([name, part]) => `${name}:${JSON.stringify(part._children?.Layout ?? {})}`)
    .join('|');
  if (!controlId || !boxes || `${controlId}|${boxes}` === followed) return;
  followed = `${controlId}|${boxes}`;
  clearTimeout(followTimer);
  followTimer = setTimeout(() => {
    for (const [name, part] of Object.entries(parts ?? {})) if (isScene3dPart(part)) followScene3dFrame(controlId, name);
  }, 300);
}

const running = new Map();

/**
 * Render a 3D part and put what it makes in its component, replacing what it made before. Returns a
 * promise of the outcome ({ ok, milliseconds, layers } or { ok: false, error }).
 */
export function renderScene3dPart(controlId, part) {
  const key = keyOf(controlId, part);
  const now = running.get(key);
  if (now) {
    now.again = true;
    return now.promise;
  }
  const entry = { again: false, promise: null };
  entry.promise = (async () => {
    let outcome;
    do {
      entry.again = false;
      outcome = await renderOnce(controlId, part);
    } while (entry.again);
    running.delete(key);
    return outcome;
  })();
  running.set(key, entry);
  return entry.promise;
}

async function renderOnce(controlId, part) {
  const control = findControl(controlId);
  const marker = control?._children?.Parts?._children?.[part];
  if (!isScene3dPart(marker)) return { ok: false, error: 'not a 3D part' };
  const artboard = artboardOf(control);
  const frame = frameOf(marker, artboard);
  const recipe = normalizeScene3d(marker.meta?.scene3d ?? starterKnob());
  const lamp = get(activeControlSet)?.lamp ?? null;
  // Twice the component's pixels, for a component drawn larger or on a fine screen, up to 384 a side.
  const scale = Math.min(2, 384 / Math.max(1, frame.width, frame.height));
  const key = scene3dKey(recipe, { width: frame.width * scale, height: frame.height * scale, lamp });
  setRender(controlId, part, { status: 'rendering', message: '' });
  try {
    const [{ renderScene3d }, { scenePsdBytes }, { planPsdComponentImport }] = await Promise.all([
      import('../utils/scene3dRender.js'),
      import('../utils/scene3dLayers.js'),
      import('../utils/psdComponentImport.js'),
    ]);
    const built = await renderScene3d(recipe, { width: frame.width, height: frame.height, scale, lamp });
    const plan = planPsdComponentImport(scenePsdBytes(built), { fileName: `${part}.psd` });
    if (!plan.ok) throw new Error(plan.error);
    // The component as it is now: it may have changed while the render ran.
    const current = findControl(controlId);
    const currentMarker = current?._children?.Parts?._children?.[part];
    if (!isScene3dPart(currentMarker)) return { ok: false, error: 'the 3D part was removed' };
    const merged = mergeScene3d(current, part, plan.component, { frame, scale: built.width / frame.width, artboard: artboardOf(current) });
    const layers = Object.keys(plan.component._children.Parts._children).length;
    merged._children.Parts._children[part].meta.scene3dRendered = { key, frame: { ...frame }, milliseconds: built.milliseconds, layers };
    replaceControlsById(new Map([[controlId, merged]]));
    setRender(controlId, part, { status: 'ready', milliseconds: built.milliseconds, layers, message: '' });
    cinfo(`[3D] ${part}: rendered in ${(built.milliseconds / 1000).toFixed(1)} s, ${layers} layers`);
    return { ok: true, milliseconds: built.milliseconds, layers };
  } catch (error) {
    const message = /WebGL/.test(String(error?.message)) ? '3D parts need WebGL 2, which this window does not have.' : `The 3D part could not be rendered: ${error?.message ?? error}`;
    cerror(`[3D] ${part}:`, error);
    setRender(controlId, part, { status: 'failed', message });
    notify(message, { kind: 'error', duration: 0 });
    return { ok: false, error: message };
  }
}

/**
 * Keep what a 3D part made in step with its box: moved, its parts move with it; resized, it renders
 * again. The designer calls this when a part's box changes. Returns what it did: 'moved', 'render' or ''.
 */
export function followScene3dFrame(controlId, part) {
  const control = findControl(controlId);
  const marker = control?._children?.Parts?._children?.[part];
  const rendered = marker?.meta?.scene3dRendered;
  if (!isScene3dPart(marker) || !rendered?.frame) return '';
  const frame = frameOf(marker, artboardOf(control));
  const was = rendered.frame;
  const resized = Math.abs(frame.width - was.width) > 0.5 || Math.abs(frame.height - was.height) > 0.5;
  if (resized) {
    renderScene3dPart(controlId, part);
    return 'render';
  }
  const dx = frame.x - was.x;
  const dy = frame.y - was.y;
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return '';
  const next = structuredClone(control);
  for (const each of Object.values(next._children.Parts._children)) {
    if (each?.meta?.scene3dOf !== part) continue;
    const layout = each._children?.Layout;
    if (!layout) continue;
    layout.x = Math.round((numberOr(layout.x, 0) + dx) * 100) / 100;
    layout.y = Math.round((numberOr(layout.y, 0) + dy) * 100) / 100;
  }
  for (const zone of Object.values(next._children.HitZones?._children ?? {})) {
    if (!(marker.meta?.scene3dWired?.hitZones ?? []).includes(zone?.name)) continue;
    const artboard = artboardOf(control);
    zone.bounds = { ...zone.bounds, x: Math.round((frame.x / artboard.width) * 10000) / 100, y: Math.round((frame.y / artboard.height) * 10000) / 100 };
  }
  next._children.Parts._children[part].meta.scene3dRendered = { ...rendered, frame: { ...frame } };
  replaceControlsById(new Map([[controlId, next]]));
  return 'moved';
}

/** The recipe of a 3D part, as stored. */
export function scene3dRecipe(controlId, part) {
  const marker = findControl(controlId)?._children?.Parts?._children?.[part];
  return isScene3dPart(marker) ? normalizeScene3d(marker.meta?.scene3d ?? starterKnob()) : null;
}

function writeRecipe(controlId, part, recipe, { render = true } = {}) {
  updateControlProperty(controlId, `Parts.${part}.meta.scene3d`, normalizeScene3d(recipe));
  if (render) renderScene3dPart(controlId, part);
}

/** Change one object of a 3D part: `patch` merged into it, shape and material one level down. Renders again. */
export function setScene3dObject(controlId, part, index, patch) {
  const recipe = scene3dRecipe(controlId, part);
  const object = recipe?.objects?.[index];
  if (!object) return;
  const next = {
    ...object, ...patch,
    shape: { ...object.shape, ...(patch.shape ?? {}) },
    material: { ...object.material, ...(patch.material ?? {}) },
  };
  recipe.objects[index] = normalizeObject(next, index);
  writeRecipe(controlId, part, recipe);
}

/**
 * An object's colour, at once: the colour layer the last render made of it is worked out again in the
 * new colour (utils/pictureRecolour.js), and the recipe keeps it for the next render, which draws it
 * in that colour (and so as drawn).
 */
export function setScene3dColour(controlId, part, index, colour) {
  const recipe = scene3dRecipe(controlId, part);
  const object = recipe?.objects?.[index];
  if (!object) return;
  object.material.colour = colour;
  writeRecipe(controlId, part, recipe, { render: false });
  const control = findControl(controlId);
  const made = `${part}${SEPARATOR}${layerNameOf(object).replace(/[^A-Za-z0-9_]+/g, '_')}`;
  const parts = control?._children?.Parts?._children ?? {};
  if (parts[made]?._children?.Image) updateControlProperty(controlId, `Parts.${made}.Image.colour`, colour);
  else if (parts[made]) updateControlProperty(controlId, `Parts.${made}.Background.Fill.imageColour`, colour);
}

/** Add an object to a 3D part (a copy of the one selected, or a disc), select it and render. */
export function addScene3dObject(controlId, part, from = null) {
  const recipe = scene3dRecipe(controlId, part);
  if (!recipe) return;
  const base = from != null && recipe.objects[from]
    ? structuredClone(recipe.objects[from])
    : { name: 'disc', shape: { kind: 'turned', diameter: 40, base: 0, height: 20 }, material: { finish: 'satin-plastic', colour: 'FF5B5F66' }, motion: 'stays' };
  base.name = `${base.name} copy`;
  recipe.objects.push(base);
  writeRecipe(controlId, part, recipe);
  scene3dSelection.set({ controlId, part, index: recipe.objects.length - 1 });
}

/** Remove an object from a 3D part and render; the last one stays. */
export function removeScene3dObject(controlId, part, index) {
  const recipe = scene3dRecipe(controlId, part);
  if (!recipe || recipe.objects.length <= 1 || !recipe.objects[index]) return;
  recipe.objects.splice(index, 1);
  writeRecipe(controlId, part, recipe);
  scene3dSelection.set({ controlId, part, index: Math.max(0, index - 1) });
}
