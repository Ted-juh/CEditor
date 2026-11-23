// CEditor Export — a Figma plugin that saves the selected frame as an SVG for CEditor's
// File › New Component from Vector Artwork (or New Panel from Vector Artwork, for a frame with a
// "components" layer of placeholders).
//
// Figma's own file format is undocumented and changes without notice; a plugin is Figma's supported
// way out. This one does what the Blender add-on (tools/blender/ceditor_layers.py) does for Blender:
// it lists what each layer will do in CEditor, by the words CEditor's importers read
// (CE/web/src/CE_Application/utils/artworkComponent.js; this file keeps a copy, which
// CE/web/test/figmaPlugin.test.js holds to the importer's), warns about what will not come across,
// and saves an SVG with every layer's name kept as its id, which the importer reads as the name.
//
//   - A component set's variants become states: the variant whose property says on (State=On, On=true,
//     Lit) is drawn as a group named "on", shown when on; off as "off"; pressed or down as "pressed",
//     shown while held; the rest is drawn as it is. Variants that differ in anything else (Size=Large)
//     are left out: the default's are used.
//   - "Flatten effects into pictures": CEditor's importer does not draw SVG filters, so a layer's drop
//     shadow, inner shadow or blur would be lost; this draws each layer on its own instead, and a layer
//     with an effect as a picture of how Figma renders it, effect and all. A mask between layers is
//     not kept that way, so a frame with one is exported whole.
//
// Install: Figma › Plugins › Development › Import plugin from manifest…, and choose manifest.json in
// this folder. It needs no account, token or network (manifest.json says so).

/* global figma, __html__ */

const ROLE_WORDS = [
  ['pivot', ['pivot', 'centre', 'center', 'axis']],
  ['pressed', ['pressed', 'down']],
  ['off', ['off', 'unlit']],
  ['on', ['lamp', 'led', 'light', 'lit', 'glow', 'on']],
  ['moves', ['fader', 'thumb', 'handle', 'slide']],
  ['turns', ['pointer', 'indicator', 'needle', 'rotor', 'marker', 'turns', 'rotate', 'rotates']],
  ['track', ['track', 'slot', 'rail', 'groove']],
];

const DOES = {
  pivot: 'where turning parts turn',
  pressed: 'shown while held',
  off: 'shown when off',
  on: 'shown when on',
  moves: 'slides with the value, along the track',
  turns: 'turns with the value',
  track: 'the track a fader slides along',
  '': 'stays put',
};

/** Figma's own names for a layer nobody named. */
const DEFAULT_NAME = /^(Rectangle|Ellipse|Polygon|Star|Line|Arrow|Vector|Group|Frame|Text|Image|Component|Instance|Union|Subtract|Intersect|Exclude|Slice|Section|Boolean)(\s+\d+)?$/;

const STATE_VALUES = {
  on: ['on', 'true', 'yes', 'lit', 'active', 'enabled', 'checked', 'selected'],
  off: ['off', 'false', 'no', 'unlit', 'inactive', 'disabled', 'unchecked', 'unselected'],
  pressed: ['pressed', 'down', 'held', 'hold', 'clicked'],
  rest: ['default', 'normal', 'rest', 'idle', 'up', 'released', 'enabled'],
};

/** The words of a name: split at anything not a letter or digit, and where lower case meets upper. */
function nameWords(name) {
  return String(name == null ? '' : name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The role names give (the layer's own first, then its groups', innermost first), or ''. */
function roleOf(names) {
  for (const name of names) {
    const words = nameWords(name);
    for (const [role, keywords] of ROLE_WORDS) if (keywords.some((word) => words.indexOf(word) >= 0)) return role;
  }
  return '';
}

/** A variant's state from its properties ({ State: 'On' }, { On: 'true' }, { Pressed: 'false' }): 'on', 'off', 'pressed', 'rest' or ''. */
function stateOfVariant(properties) {
  for (const key of Object.keys(properties || {})) {
    const value = nameWords(properties[key]).join(' ');
    const keyRole = roleOf([key]);
    if (value === 'true' || value === 'yes') {
      if (keyRole === 'on' || keyRole === 'off' || keyRole === 'pressed') return keyRole;
    }
    if (value === 'false' || value === 'no') {
      if (keyRole === 'on') return 'off';
      if (keyRole === 'off') return 'on';
      if (keyRole === 'pressed') return 'rest';
    }
    for (const state of ['pressed', 'on', 'off', 'rest']) if (STATE_VALUES[state].indexOf(value) >= 0) return state;
  }
  return '';
}

/** A variant's properties: Figma's own, or read from its name ("State=On, Size=Large"). */
function variantPropertiesOf(node) {
  if (node && node.variantProperties) return node.variantProperties;
  const out = {};
  for (const pair of String(node && node.name || '').split(',')) {
    const at = pair.indexOf('=');
    if (at > 0) out[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
  }
  return out;
}

/**
 * The variants of a component set to draw, and as which state: those that differ from the default
 * variant only in their state. [{ node, state }], the default first; empty when no variant has a state.
 */
function stateVariants(set) {
  const variants = (set.children || []).filter((child) => child.type === 'COMPONENT' && child.visible !== false);
  if (!variants.length) return [];
  const base = set.defaultVariant || variants[0];
  const baseProps = variantPropertiesOf(base);
  const stateKey = (props) => Object.keys(props).find((key) => stateOfVariant({ [key]: props[key] }));
  const key = stateKey(baseProps) || variants.map((v) => stateKey(variantPropertiesOf(v))).find(Boolean);
  if (!key) return [];
  const sameOtherwise = (props) => Object.keys(baseProps).every((k) => k === key || props[k] === baseProps[k]);
  const picked = [];
  for (const node of [base, ...variants.filter((v) => v !== base)]) {
    const props = variantPropertiesOf(node);
    if (!sameOtherwise(props)) continue;
    const state = stateOfVariant({ [key]: props[key] }) || 'rest';
    if (picked.some((p) => p.state === state)) continue;
    picked.push({ node, state });
  }
  return picked.length > 1 ? picked : [];
}

const hasEffects = (node) => (node.effects || []).some((effect) => effect.visible !== false);

/**
 * What the selection will become, for the window: { ok, name, kind, rows: [{ name, does, warn }],
 * notes } or { ok: false, message }.
 */
function describeSelection(selection, options) {
  if (!selection || selection.length !== 1) return { ok: false, message: 'Select one frame, component, component set or group.' };
  const node = selection[0];
  if (['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP'].indexOf(node.type) < 0) {
    return { ok: false, message: 'Select a frame, component, component set or group: the control as a whole, not one of its layers.' };
  }
  const rows = [];
  const notes = [];
  let kind = node.type === 'COMPONENT_SET' ? 'component set' : node.type.toLowerCase();
  let layers = node.children || [];
  const variants = node.type === 'COMPONENT_SET' && options.variants ? stateVariants(node) : [];
  if (node.type === 'COMPONENT_SET') {
    kind = `component set, ${(node.children || []).length} variants`;
    if (variants.length) {
      layers = variants[0].node.children || [];
      for (const { node: variant, state } of variants.slice(1)) {
        rows.push({ name: variant.name, variant: true, does: `${DOES[state === 'rest' ? '' : state]} (the whole variant)`, warn: false });
      }
    } else {
      notes.push(options.variants
        ? 'No variant says on, off or pressed: the set is saved as Figma draws it, every variant side by side.'
        : 'Variants as states is off: the set is saved as Figma draws it, every variant side by side.');
    }
  }
  for (const layer of layers) {
    if (layer.visible === false) continue;
    const role = roleOf([layer.name]);
    const named = !DEFAULT_NAME.test(layer.name);
    let does = DOES[role];
    if (!role && hasEffects(layer)) does += options.flatten ? ', effect drawn into its picture' : ', its effect not drawn';
    rows.push({ name: layer.name, does: named || role ? does : 'no name: comes in as a layer that stays put', warn: !named && !role });
  }
  if (!options.flatten && layers.some((layer) => layer.visible !== false && hasEffects(layer))) {
    notes.push('Some layers have effects (shadows, blurs), which CEditor does not draw from an SVG. Tick Flatten effects into pictures to keep them.');
  }
  if (options.flatten && layers.some((layer) => layer.isMask)) {
    notes.push('A layer masks the ones above it, which drawing each layer on its own would lose: this frame is saved whole, effects as Figma writes them.');
  }
  return { ok: true, name: node.name, kind, rows, notes };
}

// --- The SVG -------------------------------------------------------------------------------------

/** UTF-8, by hand: the plugin's sandbox has no TextDecoder. */
function utf8Decode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    let code;
    if (b < 0x80) { code = b; i += 1; } else if (b < 0xE0) { code = ((b & 0x1F) << 6) | (bytes[i + 1] & 0x3F); i += 2; } else if (b < 0xF0) {
      code = ((b & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F); i += 3;
    } else {
      code = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3F) << 12) | ((bytes[i + 2] & 0x3F) << 6) | (bytes[i + 3] & 0x3F); i += 4;
    }
    out += String.fromCodePoint(code);
  }
  return out;
}

function utf8Encode(text) {
  const out = [];
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
    else if (code < 0x10000) out.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
    else out.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
  }
  return new Uint8Array(out);
}

const escapeXml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = (v) => String(Math.round(v * 1000) / 1000);

/** An exported SVG's inner content and its size: { inner, width, height }. */
function svgParts(text) {
  const open = /<svg\b([^>]*)>/i.exec(text);
  if (!open) return { inner: '', width: 0, height: 0 };
  const attrs = open[1];
  const attr = (name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(attrs); return m ? m[1] : ''; };
  const close = text.lastIndexOf('</svg>');
  const viewBox = attr('viewBox').split(/[\s,]+/).map(Number);
  const width = parseFloat(attr('width')) || viewBox[2] || 0;
  const height = parseFloat(attr('height')) || viewBox[3] || 0;
  let inner = text.slice(open.index + open[0].length, close < 0 ? text.length : close);
  // A viewBox that is not the size itself (a scaled export): drawn at the size.
  if (viewBox.length === 4 && viewBox[2] && viewBox[3] && (viewBox[0] || viewBox[1] || Math.abs(viewBox[2] - width) > 1e-6 || Math.abs(viewBox[3] - height) > 1e-6)) {
    inner = `<g transform="scale(${num(width / viewBox[2])} ${num(height / viewBox[3])}) translate(${num(-viewBox[0])} ${num(-viewBox[1])})">${inner}</g>`;
  }
  return { inner, width, height };
}

/** The ids definitions are referred to by (gradients, clips, filters), given a prefix so that two exports stacked in one SVG cannot collide. Layer names, which nothing refers to, are left as they are. */
function referencedIds(inner) {
  const referred = new Set();
  inner.replace(/url\(#([^)]+)\)/g, (whole, id) => { referred.add(id); return whole; });
  inner.replace(/href="#([^"]+)"/g, (whole, id) => { referred.add(id); return whole; });
  return referred;
}

function prefixReferences(inner, prefix) {
  const referred = referencedIds(inner);
  if (!referred.size) return inner;
  return inner
    .replace(/\sid="([^"]+)"/g, (whole, id) => (referred.has(id) ? ` id="${prefix}${id}"` : whole))
    .replace(/url\(#([^)]+)\)/g, (whole, id) => (referred.has(id) ? `url(#${prefix}${id})` : whole))
    .replace(/href="#([^"]+)"/g, (whole, id) => (referred.has(id) ? `href="#${prefix}${id}"` : whole));
}

/**
 * Inside a state's group, a name that says a state of its own (a lamp in the off look, the variant's
 * own "State=Off") would win over the group's: those ids are dropped, so the group names them. An id a
 * definition is referred to by (a gradient's) is kept, whatever it says.
 */
function withoutStateNames(inner) {
  const referred = referencedIds(inner);
  return inner.replace(/\sid="([^"]+)"/g, (whole, id) => (!referred.has(id) && ['on', 'off', 'pressed', 'pivot'].indexOf(roleOf([id])) >= 0 ? '' : whole));
}

function svgDocument(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(width)}" height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}" fill="none">${body}</svg>`;
}

const svgOptions = (options) => ({ format: 'SVG', svgIdAttribute: true, svgOutlineText: !options.text, svgSimplifyStroke: true });

/** Where a layer is drawn, effects included, from the top left of `frame`. */
function placeIn(layer, frame) {
  const bounds = layer.absoluteRenderBounds || layer.absoluteBoundingBox;
  const origin = frame.absoluteBoundingBox;
  return { x: bounds.x - origin.x, y: bounds.y - origin.y, width: bounds.width, height: bounds.height };
}

/** Each visible layer of `frame` on its own: an SVG export where it has no effect, a picture where it has one. */
async function layerByLayer(frame, options, api) {
  const box = frame.absoluteBoundingBox;
  const body = [];
  let n = 0;
  for (const layer of frame.children || []) {
    if (layer.visible === false) continue;
    const place = placeIn(layer, frame);
    n += 1;
    if (hasEffects(layer)) {
      const png = await layer.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
      body.push(`<image id="${escapeXml(layer.name)}" x="${num(place.x)}" y="${num(place.y)}" width="${num(place.width)}" height="${num(place.height)}" preserveAspectRatio="none" href="data:image/png;base64,${api.base64Encode(png)}"/>`);
    } else {
      const parts = svgParts(utf8Decode(await layer.exportAsync(svgOptions(options))));
      const scale = parts.width ? place.width / parts.width : 1;
      body.push(`<g id="${escapeXml(layer.name)}" transform="translate(${num(place.x)} ${num(place.y)})${Math.abs(scale - 1) > 1e-6 ? ` scale(${num(scale)})` : ''}">${prefixReferences(parts.inner, `l${n}_`)}</g>`);
    }
  }
  return svgDocument(box.width, box.height, body.join(''));
}

/**
 * The selection as SVG text, and the file name to save it under: { ok, fileName, svg } or
 * { ok: false, message }. `api`: what of `figma` it needs (base64Encode), so a test can stand in.
 */
async function exportSelection(selection, options, api) {
  const described = describeSelection(selection, options);
  if (!described.ok) return described;
  const node = selection[0];
  const fileName = `${String(node.name).replace(/[\\/:*?"<>|]+/g, ' - ').replace(/\s+/g, ' ').trim() || 'Figma frame'}.svg`;
  const variants = node.type === 'COMPONENT_SET' && options.variants ? stateVariants(node) : [];
  if (variants.length) {
    let width = 0;
    let height = 0;
    const body = [];
    let n = 0;
    for (const { node: variant, state } of variants) {
      n += 1;
      const parts = svgParts(utf8Decode(await variant.exportAsync(svgOptions(options))));
      width = Math.max(width, parts.width);
      height = Math.max(height, parts.height);
      const inner = prefixReferences(parts.inner, `v${n}_`);
      body.push(`<g id="${state === 'rest' ? escapeXml(node.name) : state}">${withoutStateNames(inner)}</g>`);
    }
    return { ok: true, fileName, svg: svgDocument(width, height, body.join('')) };
  }
  const masked = (node.children || []).some((layer) => layer.isMask);
  if (options.flatten && !masked && node.type !== 'COMPONENT_SET') {
    return { ok: true, fileName, svg: await layerByLayer(node, options, api) };
  }
  return { ok: true, fileName, svg: utf8Decode(await node.exportAsync(svgOptions(options))) };
}

// --- In Figma --------------------------------------------------------------------------------------

function main() {
  let options = { text: true, variants: true, flatten: false };
  figma.showUI(__html__, { width: 340, height: 500, themeColors: true });
  const show = () => figma.ui.postMessage(Object.assign({ type: 'selection', options }, describeSelection(figma.currentPage.selection, options)));
  figma.on('selectionchange', show);
  figma.ui.onmessage = async (message) => {
    if (!message) return;
    if (message.type === 'options') {
      options = Object.assign({}, options, message.options);
      show();
    } else if (message.type === 'export') {
      try {
        const result = await exportSelection(figma.currentPage.selection, options, figma);
        if (!result.ok) { figma.notify(result.message, { error: true }); return; }
        figma.ui.postMessage({ type: 'save', fileName: result.fileName, bytes: utf8Encode(result.svg) });
      } catch (error) {
        figma.notify(`Could not export: ${error && error.message ? error.message : error}`, { error: true });
      }
    } else if (message.type === 'saved') {
      figma.notify(`Saved ${message.fileName}. In CEditor: File › New Component from Vector Artwork.`);
    } else if (message.type === 'close') {
      figma.closePlugin();
    }
  };
  show();
}

if (typeof figma !== 'undefined') main();
