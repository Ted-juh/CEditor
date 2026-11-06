// scene3dGltf.js — a glTF model (Blender's File › Export › glTF 2.0, or any 3D program's) as a 3D part
// (docs/design/import-formats.md, 4): its objects become the part's objects, each moving by the words of
// its name as everywhere else in CEditor (pointer turns, lamp lights), its material read from the file
// and changeable; its shape stays the file's. Read with three.js's GLTFLoader (MIT).
//
// glTF is y up, in metres; the renderer (utils/scene3dRender.js) is z up and draws in pixels. The model
// is turned so that what was up is towards the camera, put with the knob's axis at the origin (an object
// named pivot, axis or centre; else the first object that turns, about its own origin; else the middle),
// and scaled so that what is farthest from the axis, across or down, is 1: the renderer scales it to
// the part.

import { normalizeScene3d } from './scene3dModel.js';

const words = (name) => String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const has = (name, list) => words(name).some((word) => list.includes(word));
const TURN_WORDS = ['pointer', 'indicator', 'needle', 'rotor', 'marker', 'turns', 'rotate', 'rotates'];
const LAMP_WORDS = ['lamp', 'led', 'light', 'lit', 'glow', 'on'];
const PIVOT_WORDS = ['pivot', 'axis', 'centre', 'center'];
const PANEL_WORDS = ['panel', 'ground', 'floor', 'backdrop'];

let modules = null;
function loadThree() {
  modules ??= Promise.all([import('three'), import('three/examples/jsm/loaders/GLTFLoader.js')])
    .then(([THREE, { GLTFLoader }]) => ({ THREE, GLTFLoader }));
  return modules;
}

const toBuffer = (bytes) => (bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const dataUrlBytes = (url) => {
  const comma = String(url ?? '').indexOf(',');
  const binary = atob(String(url).slice(comma + 1));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};
const isGlb = (bytes) => bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;

/**
 * The files a .gltf names beside it (its buffers and pictures), as data URLs: { uri: dataUrl }.
 * `readSibling(uri)` reads one (the desktop app reads them from disk); without it, or for a .glb,
 * nothing. Throws, saying what to do, when one cannot be read.
 */
export async function gltfSiblings(bytes, readSibling = null) {
  if (isGlb(bytes)) return {};
  const json = JSON.parse(new TextDecoder().decode(bytes));
  const uris = [...(json.buffers ?? []), ...(json.images ?? [])].map((entry) => entry?.uri).filter((uri) => uri && !/^data:/i.test(uri));
  const out = {};
  for (const uri of uris) {
    const read = readSibling ? await readSibling(decodeURIComponent(uri)) : '';
    if (!read) throw new Error(`The file names ${uri} beside it, which could not be read. Export the model as glTF Binary (.glb), which carries everything in one file.`);
    out[uri] = read;
  }
  return out;
}

/** A glTF's scene: `source` { asset (the file as a data URL), siblings ({ uri: dataUrl }) }. */
export async function readGltf(source) {
  const { THREE, GLTFLoader } = await loadThree();
  const manager = new THREE.LoadingManager();
  const siblings = source.siblings ?? {};
  manager.setURLModifier((url) => siblings[url] ?? siblings[decodeURIComponent(url)] ?? url);
  const loader = new GLTFLoader(manager);
  const gltf = await loader.parseAsync(toBuffer(dataUrlBytes(source.asset)), '');
  return gltf.scene;
}

/** The objects a scene's top level holds, by kind: { objects, pivot, panel, unnamed }. */
function sortNodes(scene) {
  const out = { objects: [], pivot: null, panel: [], unnamed: [] };
  for (const node of scene.children) {
    let meshes = 0;
    node.traverse((each) => { if (each.isMesh) meshes += 1; });
    if (has(node.name, PIVOT_WORDS) && !meshes) { out.pivot = node; continue; }
    if (has(node.name, PIVOT_WORDS)) { out.pivot ??= node; continue; }
    if (!meshes) continue;
    if (has(node.name, PANEL_WORDS)) { out.panel.push(node.name); continue; }
    out.objects.push(node);
  }
  return out;
}

const DEFAULT_NAMES = /^(Cube|Cylinder|Sphere|Plane|Torus|Cone|Mesh|Object|Circle|Icosphere|Node)(\.\d+)?(_\d+)?$/i;

/**
 * A scene's objects as a recipe, and what the import says of them: { recipe, report }. `report`:
 * { objects: [{ name, motion }], panel, unnamed, textures }.
 */
export function gltfRecipe(scene, { fileName = '', source = null } = {}) {
  const sorted = sortNodes(scene);
  let textures = false;
  const objects = sorted.objects.map((node) => {
    let material = null;
    let triangles = 0;
    node.traverse((each) => {
      if (!each.isMesh) return;
      material ??= Array.isArray(each.material) ? each.material[0] : each.material;
      const geometry = each.geometry;
      triangles += Math.round((geometry.index?.count ?? geometry.attributes.position.count) / 3);
      const m = Array.isArray(each.material) ? each.material[0] : each.material;
      if (m?.map || m?.normalMap || m?.roughnessMap || m?.metalnessMap) textures = true;
    });
    const metalness = Math.round((material?.metalness ?? 0) * 100);
    const roughness = Math.round((material?.roughness ?? 0.5) * 100);
    const motion = has(node.name, TURN_WORDS) ? 'turns' : has(node.name, LAMP_WORDS) ? 'lamp' : 'stays';
    return {
      name: node.name || 'object',
      shape: { kind: 'mesh', node: node.name, triangles },
      material: {
        finish: metalness > 50 ? 'metal' : roughness < 45 ? 'gloss-plastic' : 'satin-plastic',
        colour: `FF${(material?.color?.getHexString?.() ?? '808080').toUpperCase()}`,
        roughness, metalness,
      },
      motion,
    };
  });
  const recipe = normalizeScene3d({ objects, ...(source ? { source: { fileName, ...source } } : {}) });
  return {
    recipe,
    report: {
      objects: recipe.objects.map((object) => ({ name: object.name, motion: object.motion })),
      panel: sorted.panel,
      unnamed: recipe.objects.filter((object) => DEFAULT_NAMES.test(object.name)).map((object) => object.name),
      textures,
    },
  };
}

/**
 * The scene's objects as the renderer takes them: name → an Object3D, turned z up, the knob's axis at
 * the origin, scaled so that the farthest point from the axis, across or down, is 1.
 */
export async function gltfMeshes(scene, recipe) {
  const { THREE } = await loadThree();
  const holder = new THREE.Group();
  // What was up (glTF's y) towards the camera (the renderer's z).
  holder.rotation.x = Math.PI / 2;
  const copy = scene.clone(true);
  holder.add(copy);
  holder.updateMatrixWorld(true);
  const sorted = sortNodes(copy);
  const wanted = new Set(recipe.objects.filter((object) => object.shape.kind === 'mesh').map((object) => object.shape.node));
  const nodes = sorted.objects.filter((node) => wanted.has(node.name));
  const centre = new THREE.Vector3();
  const turning = nodes.find((node) => has(node.name, TURN_WORDS));
  if (sorted.pivot) sorted.pivot.getWorldPosition(centre);
  else if (turning) turning.getWorldPosition(centre);
  else new THREE.Box3().setFromObject(holder).getCenter(centre);
  let reach = 0;
  for (const node of nodes) {
    node.traverse((each) => {
      if (!each.isMesh) return;
      const position = each.geometry.attributes.position;
      const point = new THREE.Vector3();
      for (let i = 0; i < position.count; i += 1) {
        point.fromBufferAttribute(position, i).applyMatrix4(each.matrixWorld);
        // Fitted to the part's square, not its circle: a lamp in a corner beside a knob keeps it large.
        reach = Math.max(reach, Math.abs(point.x - centre.x), Math.abs(point.y - centre.y));
      }
    });
  }
  const scale = reach > 0 ? 1 / reach : 1;
  const out = {};
  for (const node of nodes) {
    const group = new THREE.Group();
    node.traverse((each) => {
      if (!each.isMesh) return;
      const mesh = new THREE.Mesh(each.geometry, each.material);
      const matrix = new THREE.Matrix4().makeScale(scale, scale, scale)
        .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, 0))
        .multiply(each.matrixWorld);
      mesh.applyMatrix4(matrix);
      group.add(mesh);
    });
    out[node.name] = group;
  }
  return out;
}

const cache = new Map();
/** The meshes of a recipe's glTF, read once per file. */
export async function meshesForRecipe(recipe) {
  const source = recipe?.source;
  if (!source?.asset) return {};
  const key = `${source.asset.length}:${source.asset.slice(-64)}`;
  if (!cache.has(key)) {
    cache.set(key, readGltf(source));
    if (cache.size > 8) cache.delete(cache.keys().next().value);
  }
  return gltfMeshes(await cache.get(key), recipe);
}
