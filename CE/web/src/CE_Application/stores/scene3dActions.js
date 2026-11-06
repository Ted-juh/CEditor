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
import { browseImage, isJuceAvailable, onImageBrowsed } from '../bridge/bridge.js';
import { createComponentDocument } from './componentWorkspace.js';
import { setActiveEditorTab } from './panels.js';
import { displayTabRequest } from './displayTab.js';
import { linkedPicturePath, readFileAsDataUrl } from './artworkComponentActions.js';
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
    // A model's objects, read from its glTF (once a file).
    const meshes = recipe.source?.asset ? await (await import('../utils/scene3dGltf.js')).meshesForRecipe(recipe) : {};
    const built = await renderScene3d(recipe, { width: frame.width, height: frame.height, scale, lamp, meshes });
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

// --- 3D models (glTF) ---------------------------------------------------------------------------------

const MODEL_TYPES = /\.(glb|gltf)$/i;
let modelRequests = 0;
let pendingModel = null;
let modelListening = false;

const bytesOfDataUrl = (url) => {
  const comma = String(url ?? '').indexOf(',');
  return Uint8Array.from(atob(String(url).slice(comma + 1)), (c) => c.charCodeAt(0));
};
function dataUrlOf(bytes, type) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(binary)}`;
}

/**
 * Ask for a glTF model, then `handle(bytes, filePath, readSibling)`: the app's own dialog (and the
 * files a .gltf names beside it read from disk), or the browser's (which cannot read those).
 */
export function chooseModel(handle) {
  if (!isJuceAvailable()) {
    if (typeof window === 'undefined' || !window.document) return;
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = '.glb,.gltf,model/gltf-binary,model/gltf+json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) await handle(new Uint8Array(await file.arrayBuffer()), file.name, null);
    };
    input.click();
    return;
  }
  if (!modelListening) {
    modelListening = true;
    onImageBrowsed(async (payload) => {
      if (!pendingModel || payload?.requestId !== pendingModel.requestId) return;
      const { handle: then } = pendingModel;
      pendingModel = null;
      const filePath = String(payload?.filePath ?? '').trim();
      if (!filePath) return;
      if (!MODEL_TYPES.test(filePath)) { notify('Choose a .glb or .gltf file.', { kind: 'warn' }); return; }
      const url = await readFileAsDataUrl(filePath);
      if (!url) { notify('Could not read the model.', { kind: 'error', duration: 0 }); return; }
      await then(bytesOfDataUrl(url), filePath, (uri) => readFileAsDataUrl(linkedPicturePath(uri, filePath)));
    });
  }
  pendingModel = { requestId: `scene3dmodel_${++modelRequests}`, handle };
  browseImage(pendingModel.requestId, { patterns: '*.glb;*.gltf', title: '3D model (glTF)' });
}

/** A model's objects as a recipe, and what to say of them: { recipe, report, fileName } or null with the reason reported. */
export async function readModel(bytes, filePath, readSibling = null) {
  const fileName = String(filePath ?? '').split(/[\\/]/).pop() || 'Model.glb';
  try {
    const { gltfRecipe, gltfSiblings, readGltf } = await import('../utils/scene3dGltf.js');
    const siblings = await gltfSiblings(bytes, readSibling);
    const binary = bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
    const asset = dataUrlOf(bytes, binary ? 'model/gltf-binary' : 'model/gltf+json');
    const scene = await readGltf({ asset, siblings });
    const { recipe, report } = gltfRecipe(scene, { fileName, source: { asset, siblings } });
    if (!recipe.objects.length) throw new Error('The file has no objects to draw.');
    return { recipe, report, fileName };
  } catch (error) {
    const message = `${fileName} could not be read: ${error?.message ?? error}`;
    cerror('[3D model]', message);
    notify(message, { kind: 'error', duration: 0 });
    return null;
  }
}

const MOTION_WORDS = { turns: 'turns with the value', stays: 'stays put', lamp: 'lights with the Lamp value' };

/** What the import says of a model: the objects and what they do, and what was not used. */
export function describeModel(report, fileName) {
  const groups = new Map();
  for (const { name, motion } of report.objects) groups.set(motion, [...(groups.get(motion) ?? []), name]);
  const list = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]);
  const parts = ['turns', 'stays', 'lamp'].filter((motion) => groups.has(motion)).map((motion) => `${list(groups.get(motion))} (${MOTION_WORDS[motion]})`);
  const lines = [`A 3D part of ${report.objects.length} object${report.objects.length === 1 ? '' : 's'} from ${fileName}: ${parts.join('; ')}.`];
  if (report.panel.length) lines.push(`${list(report.panel)}, the surface it stands on, is the panel the control is placed on.`);
  if (report.unnamed.length) lines.push(`${list(report.unnamed)} ${report.unnamed.length === 1 ? 'has' : 'have'} no name CEditor reads, and stay${report.unnamed.length === 1 ? 's' : ''} put; rename ${report.unnamed.length === 1 ? 'it' : 'them'} in the 3D tab.`);
  if (report.textures) lines.push('Its textures are not drawn: each object takes its material\'s colour.');
  lines.push('The file\'s camera and lights are not used: CEditor looks straight down and lights with the set\'s lamp.');
  return lines;
}

/** File › New Component from 3D Model: a component whose 3D part is the model's objects. */
export function newComponentFrom3dModel() {
  chooseModel(async (bytes, filePath, readSibling) => importModelComponent(bytes, filePath, readSibling));
}

/** A model's bytes as a new component, opened in the Component Designer. Returns its 3D part's name, or ''. */
export async function importModelComponent(bytes, filePath, readSibling = null) {
  const read = await readModel(bytes, filePath, readSibling);
  if (!read) return '';
  const document = createComponentDocument({ name: read.fileName.replace(/\.(glb|gltf)$/i, '') });
  if (!document?.id) return '';
  setActiveEditorTab({ type: 'component', id: document.id });
  const artboard = artboardOf(document.control);
  const side = Math.min(artboard.width, artboard.height) - 20;
  const name = addScene3dPart(document.id, { x: Math.round((artboard.width - side) / 2), y: Math.round((artboard.height - side) / 2), width: side, height: side }, { recipe: read.recipe });
  if (name) {
    applyControlPatch(document.id, { 'Designer.selectedLayer': name, 'Designer.selectedLayers': [name], 'Designer.selectedSurfaceKind': 'layer' });
    displayTabRequest.set({ tab: 'scene3d' });
  }
  const lines = describeModel(read.report, read.fileName);
  cinfo(`[3D model] ${lines.join(' ')}`);
  notify(lines.join(' '), { kind: read.report.unnamed.length || read.report.textures ? 'warn' : 'info', duration: 0 });
  return name;
}

/**
 * A new version of a 3D part's model: its objects read again, what was set on an object kept where the
 * new file has one of that name (its material and motion), and rendered.
 */
export function replaceScene3dModel(controlId, part) {
  chooseModel(async (bytes, filePath, readSibling) => {
    const read = await readModel(bytes, filePath, readSibling);
    const recipe = scene3dRecipe(controlId, part);
    if (!read || !recipe) return;
    const before = new Map(recipe.objects.map((object) => [object.name, object]));
    read.recipe.objects = read.recipe.objects.map((object) => {
      const was = before.get(object.name);
      return was ? { ...object, material: was.material, motion: was.motion } : object;
    });
    writeRecipe(controlId, part, read.recipe);
    notify(`${part}: the model is now ${read.fileName}; ${read.recipe.objects.filter((o) => before.has(o.name)).length} of its ${read.recipe.objects.length} objects kept what was set on them.`, { kind: 'info', duration: 6000 });
  });
}
