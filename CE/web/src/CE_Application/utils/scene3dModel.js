// scene3dModel.js — a 3D part's recipe (docs/design/import-formats.md, 3 and 4): the objects of a
// small scene, each with a shape, a material and a motion, which utils/scene3dRender.js renders from
// straight above into the layers the Blender add-on writes. Pure: what a recipe holds, its defaults
// and bounds, and the names its objects are written under so that the import gives each its motion.
//
// The shapes are piece E's vocabulary (utils/renderedLookCore.js): a turned body (smooth, knurled or
// fluted, a taper, a top flat, with an insert, domed or dished), a block (a rounded box), and a
// pointer of its own (a line, a bar, a dot or a chicken-head). Sizes are in percent: a diameter, a
// width or a length of the part's smaller side; a height or a base (where it stands) of its radius.
// A mesh from a glTF file is the fourth kind (`mesh`), its shape the file's.

export const SCENE3D_KIND = 'scene3d';
export const SHAPE_KINDS = ['turned', 'block', 'pointer', 'mesh'];
export const SIDES = ['smooth', 'knurled', 'fluted'];
export const TOPS = ['flat', 'insert', 'dome', 'dish'];
export const POINTER_STYLES = ['line', 'bar', 'dot', 'chicken-head'];
export const FINISHES = ['spun-metal', 'brushed-metal', 'metal', 'gloss-plastic', 'satin-plastic', 'rubber'];
export const MOTIONS = ['stays', 'turns', 'lamp'];

export const FINISH_LABELS = {
  'spun-metal': 'Spun metal', 'brushed-metal': 'Brushed metal', metal: 'Polished metal',
  'gloss-plastic': 'Gloss plastic', 'satin-plastic': 'Satin plastic', rubber: 'Rubber',
};
/** Each finish's metalness, roughness and clear coat, as the renderer sets them; roughness can be changed. */
export const FINISH_MATERIAL = {
  'spun-metal': { metalness: 1, roughness: 0.28, clearcoat: 0 },
  'brushed-metal': { metalness: 1, roughness: 0.4, clearcoat: 0 },
  metal: { metalness: 1, roughness: 0.12, clearcoat: 0 },
  'gloss-plastic': { metalness: 0, roughness: 0.3, clearcoat: 0.7 },
  'satin-plastic': { metalness: 0, roughness: 0.55, clearcoat: 0 },
  rubber: { metalness: 0, roughness: 0.9, clearcoat: 0 },
};

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const bound = (value, low, high, fallback) => Math.min(high, Math.max(low, num(value, fallback)));
const pick = (value, list, fallback) => (list.includes(value) ? value : fallback);
const colour = (value, fallback) => (/^[0-9A-Fa-f]{8}$/.test(String(value ?? '')) ? String(value).toUpperCase() : fallback);

/** A knob to start from: a skirt that stays, a body and a knurled metal top that turn round, a pointer. */
export function starterKnob() {
  return normalizeScene3d({
    objects: [
      { name: 'skirt', shape: { kind: 'turned', side: 'knurled', ridges: 36, depth: 3, diameter: 94, base: 0, height: 10, taper: 3, top: 'flat' },
        material: { finish: 'satin-plastic', colour: 'FF2B2E33' }, motion: 'stays' },
      { name: 'body', shape: { kind: 'turned', side: 'smooth', diameter: 74, base: 0, height: 34, taper: 8, top: 'flat' },
        material: { finish: 'gloss-plastic', colour: 'FF33373C' }, motion: 'turns' },
      { name: 'top', shape: { kind: 'turned', side: 'knurled', ridges: 60, depth: 2, diameter: 52, base: 34, height: 8, taper: 4, top: 'insert' },
        material: { finish: 'spun-metal', colour: 'FFC9CDD2' }, motion: 'turns' },
      { name: 'pointer', shape: { kind: 'pointer', style: 'line', length: 24, width: 3, base: 42, height: 2, from: 4 },
        material: { finish: 'gloss-plastic', colour: 'FFF08A3E' }, motion: 'turns' },
    ],
  });
}

/** One object of a recipe, defaulted and bounded. */
export function normalizeObject(object = {}, index = 0) {
  const shape = object.shape ?? {};
  const kind = pick(shape.kind, SHAPE_KINDS, 'turned');
  const material = object.material ?? {};
  const finish = pick(material.finish, FINISHES, 'satin-plastic');
  const normal = {
    name: String(object.name ?? '').trim() || `object ${index + 1}`,
    shape: { kind },
    material: {
      finish,
      colour: colour(material.colour, 'FF808080'),
      roughness: bound(material.roughness, 0, 100, Math.round(FINISH_MATERIAL[finish].roughness * 100)),
      ...(Number.isFinite(Number(material.metalness)) ? { metalness: bound(material.metalness, 0, 100, 0) } : {}),
    },
    motion: pick(object.motion, MOTIONS, 'stays'),
  };
  if (kind === 'turned') {
    Object.assign(normal.shape, {
      side: pick(shape.side, SIDES, 'smooth'),
      ridges: Math.round(bound(shape.ridges, 3, 180, 36)),
      depth: bound(shape.depth, 0, 20, 3),
      diameter: bound(shape.diameter, 2, 100, 70),
      base: bound(shape.base, 0, 200, 0),
      height: bound(shape.height, 1, 200, 30),
      taper: bound(shape.taper, 0, 60, 4),
      top: pick(shape.top, TOPS, 'flat'),
    });
  } else if (kind === 'block') {
    Object.assign(normal.shape, {
      width: bound(shape.width, 2, 100, 40), length: bound(shape.length, 2, 100, 70),
      corner: bound(shape.corner, 0, 50, 12), base: bound(shape.base, 0, 200, 0), height: bound(shape.height, 1, 200, 30),
      top: pick(shape.top, ['flat', 'dish', 'dome'], 'flat'),
    });
  } else if (kind === 'pointer') {
    Object.assign(normal.shape, {
      style: pick(shape.style, POINTER_STYLES, 'line'),
      length: bound(shape.length, 1, 100, 24), width: bound(shape.width, 0.5, 60, 3),
      from: bound(shape.from, 0, 100, 4), base: bound(shape.base, 0, 200, 40), height: bound(shape.height, 0.5, 200, 2),
    });
  } else {
    // A mesh from a glTF file: which node of it, its triangles kept with the file.
    Object.assign(normal.shape, { node: String(shape.node ?? normal.name), triangles: Math.max(0, Math.round(num(shape.triangles, 0))) });
  }
  if (object.id) normal.id = String(object.id);
  return normal;
}

/** A recipe, defaulted and bounded: `{ version, objects, source? }` (`source` the glTF it came from). */
export function normalizeScene3d(recipe = {}) {
  const objects = (Array.isArray(recipe.objects) ? recipe.objects : []).map(normalizeObject);
  const taken = new Set();
  for (const object of objects) {
    let name = object.name;
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${object.name} ${n}`;
    object.name = name;
    taken.add(name.toLowerCase());
  }
  const out = { version: 1, objects };
  if (recipe.source && typeof recipe.source === 'object') out.source = { fileName: String(recipe.source.fileName ?? ''), asset: String(recipe.source.asset ?? '') };
  return out;
}

/** Whether a turned body looks the same at every angle, so that its light stays as it turns (a rotor). */
export function isRound(object) {
  return object.shape.kind === 'turned';
}

/** How an object moves, as the Layers list says it: "turns · round", "stays", "lamp". */
export function describeObject(object) {
  const how = object.motion === 'turns' ? (isRound(object) ? 'turns · round' : 'turns') : object.motion;
  return object.shape.kind === 'mesh' ? `${how} · mesh` : how;
}

const words = (name) => String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const TURN_WORDS = ['pointer', 'indicator', 'needle', 'rotor', 'marker', 'turns', 'rotate', 'rotates'];
const LAMP_WORDS = ['lamp', 'led', 'light', 'lit', 'glow', 'on'];
const OTHER_ROLE_WORDS = ['pivot', 'centre', 'center', 'axis', 'pressed', 'down', 'off', 'unlit', 'fader', 'thumb', 'handle', 'slide', 'track', 'slot', 'rail', 'groove'];

/**
 * The name an object is written under, so that the import gives it its motion by the importer's
 * words: a round body that turns as a "rotor" (its colour turns, its light stays), anything else that
 * turns with a word that turns it, a lamp with "lamp", and what stays without any word that would move it.
 */
export function layerNameOf(object) {
  const own = words(object.name).filter((word) => ![...TURN_WORDS, ...LAMP_WORDS, ...OTHER_ROLE_WORDS].includes(word)).join(' ')
    || (object.motion === 'lamp' ? 'lens' : 'part');
  if (object.motion === 'turns') return isRound(object) ? `${own} rotor` : (words(object.name).some((w) => TURN_WORDS.includes(w)) ? object.name.toLowerCase() : `${own} turns`);
  if (object.motion === 'lamp') return `${own} lamp`;
  return own;
}

/** What a render depends on: the recipe, the size and the lamp. Two equal keys draw the same layers. */
export function scene3dKey(recipe, { width, height, lamp = null } = {}) {
  return JSON.stringify({ recipe: normalizeScene3d(recipe), width: Math.round(width), height: Math.round(height), lamp: lamp ?? null });
}
