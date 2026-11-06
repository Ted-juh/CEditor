/**
 * artworkComponent.js — layers from a drawing program, made a component.
 *
 * The SVG and Photoshop importers (utils/svgComponentImport.js, utils/psdComponentImport.js) read
 * the file into layers: each a component part, vector or picture, with its name. This decides from
 * those names what moves, and wires the component so it does, the way the panel importers decide a
 * placeholder's role from its name (utils/svgPanelImport.js):
 *
 *   turns    pointer, indicator, needle, rotor, marker,       turn with the value, -135° to 135°,
 *            turns, rotate                                     about the pivot; the drawing's own
 *                                                              angle is the middle of the range
 *   moves    fader, thumb, handle, slide                       slide along the track with the value
 *   track    track, slot, rail, groove                         where a fader runs (its long side)
 *   pivot    pivot, centre, center, axis                       where turning layers turn about;
 *                                                              "<layer> pivot", where that one does
 *   on       lamp, led, light, lit, glow, on                   shown when the value is on
 *   off      off, unlit                                        shown when it is off
 *   pressed  pressed, down                                     shown while it is held
 *
 * A turning layer named "... at <angle>" is drawn as it looks with the part turned that far (degrees
 * clockwise from rest). Pictures of one name become one part, a frame an angle, whose frame follows
 * the value (utils/imageFrames.js); an SVG's are made pictures for it (utils/svgComponentImport.js).
 * Other layers of one name (a Photoshop shape or text layer) fade from one to the next.
 *
 * A keyword counts anywhere in a layer's name, or in the name of a group it is in, as a whole word:
 * "Pointer copy 2", "knob/pointer" and "pointerShadow" all turn; "spotlight" does not light.
 *
 * What it builds follows from what it found: turning layers make a dial, a moving layer a fader,
 * lit layers a switch (a button when the file or a layer says button), and nothing a still picture
 * made of layers, every one still a layer to change. The value channel, the behaviour, the hit zone
 * and one binding per moving layer are the same pieces the Component Designer builds, so the
 * component is edited there like any other.
 */
import { createControl } from '../models/componentTypes.js';
import { createPartNode, createValueChannel, makeInteractive } from './customComponentFactory.js';
import { deepClone } from './deepClone.js';
import { lightRoleOf } from './pictureRecolour.js';

const ROLE_WORDS = [
  ['pivot', ['pivot', 'centre', 'center', 'axis']],
  ['pressed', ['pressed', 'down']],
  ['off', ['off', 'unlit']],
  ['on', ['lamp', 'led', 'light', 'lit', 'glow', 'on']],
  ['moves', ['fader', 'thumb', 'handle', 'slide']],
  // Not "cap": a cap's highlight would swing round with it. A cap that should turn (a fluted one)
  // is named "rotor", or "cap turns".
  ['turns', ['pointer', 'indicator', 'needle', 'rotor', 'marker', 'turns', 'rotate', 'rotates']],
  ['track', ['track', 'slot', 'rail', 'groove']],
];
const PIVOT_WORDS = ROLE_WORDS.find(([role]) => role === 'pivot')[1];
// "... at 27", "... at -54°": a turning layer drawn at that angle, in degrees clockwise from rest.
const AT_ANGLE = /\s+at\s+(-?\d+(?:\.\d+)?)\s*(?:°|deg(?:rees)?)?\s*$/i;
const BUTTON_WORDS = ['button', 'btn', 'momentary', 'trigger', 'push', 'key'];

/** A name that says a layer is drawn at an angle ("pointer shadow at -27"): `{ base, angle }`, or null. */
export function drawnAtAngle(name) {
  const own = String(name ?? '');
  const at = AT_ANGLE.exec(own);
  return at ? { base: own.slice(0, at.index).trim(), angle: Number(at[1]) } : null;
}

/** The words of a name: split at anything not a letter or digit, and where lower case meets upper. */
export function nameWords(name) {
  return String(name ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The role the names give a layer (its own first, then its groups', innermost first), or ''. */
export function artworkRole(names = []) {
  for (const name of names) {
    const words = new Set(nameWords(name));
    for (const [role, keywords] of ROLE_WORDS) if (keywords.some((word) => words.has(word))) return role;
  }
  return '';
}

/** A part name the designer can bind to: letters, digits and underscores, unique, not a number first. */
export function uniqueLayerName(wanted, taken) {
  // A minus before a number is a word of its own ("at -27", "gain -6"): dropped, it would make the
  // name of the one at 27, or at 6.
  const base = String(wanted ?? '').replace(/(^|[^A-Za-z0-9])-(?=\d)/g, '$1minus_')
    .replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'layer';
  const first = /^[0-9]/.test(base) ? `layer_${base}` : base;
  let name = first;
  for (let n = 2; taken.has(name); n += 1) name = `${first}_${n}`;
  taken.add(name);
  return name;
}

function rangeBinding(name, source, target, outputMin, outputMax, outputUnit = '') {
  return {
    _type: 'Binding', name, enabled: true, source, mapMode: 'range', target, outputUnit,
    inputMin: 0, inputMax: 1, outputMin, outputMax, falseValue: outputMin, trueValue: outputMax,
    enumMap: {}, clamp: true, round: false, invert: false,
  };
}

const centre = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
const area = (box) => box.width * box.height;

/** A picture layer's picture, or '' for a layer that is anything else (a vector, text, a masked picture). */
function pictureOf(part) {
  const fill = part?._children?.Background?._children?.Fill;
  if (part?.kind !== 'rectangle' || part.mask || part._children?.Image || part._children?.Text) return '';
  return fill?.imageEnabled === true && fill.solidEnabled === false && fill.gradientEnabled !== true ? String(fill.imageSrc ?? '') : '';
}

const blendOf = (part) => part?._children?.Effects?._children?.Blend?.mode ?? 'normal';

/**
 * A turning picture drawn at several angles ("pointer reflection at -27", "... at 0", "... at 27":
 * as it is with the part turned that far, drawn turned back to rest), made one part that is each of
 * them in turn: a part of frames (utils/imageFrames.js), the frame following the value and the two
 * it falls between mixed. Laid as layers of their own and faded against each other, a shadow or a
 * multiply shows through by a quarter more half way between two, and the part would brighten
 * between every two angles; a part of frames mixes them first.
 *
 * Returns the layers with each such set one layer, in the place of its lowest, and the angles of
 * each part made. A set that is not all pictures of one blend mode is left as layers.
 */
function framesFromAngles(layers) {
  const sets = new Map();
  layers.forEach((layer, index) => {
    if (artworkRole(layer.names ?? [layer.name]) !== 'turns') return;
    const own = layer.names?.[0] ?? layer.name ?? layer.part.name;
    const at = AT_ANGLE.exec(own);
    if (!at || !pictureOf(layer.part)) return;
    const base = own.slice(0, at.index).trim();
    const key = nameWords(base).join(' ');
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push({ layer, index, angle: Number(at[1]), base });
  });
  const replaced = new Map();
  const angles = new Map();
  const renamed = new Map();
  const taken = new Set(layers.map((layer) => layer.part.name));
  for (const set of sets.values()) {
    const distinct = new Set(set.map((each) => each.angle));
    if (distinct.size < 2 || distinct.size !== set.length) continue;
    if (new Set(set.map((each) => blendOf(each.layer.part))).size !== 1) continue;
    set.sort((a, b) => a.angle - b.angle);
    const x0 = Math.min(...set.map(({ layer }) => layer.box.x));
    const y0 = Math.min(...set.map(({ layer }) => layer.box.y));
    const x1 = Math.max(...set.map(({ layer }) => layer.box.x + layer.box.width));
    const y1 = Math.max(...set.map(({ layer }) => layer.box.y + layer.box.height));
    const box = { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
    const share = (value, whole) => Math.round((value / whole) * 1e6) / 1e4;
    const frameOf = ({ layer }) => {
      // The light on it and its gloss at that angle, in its box (utils/pictureRecolour.js).
      const fill = layer.part._children.Background._children.Fill;
      return {
        source: pictureOf(layer.part),
        x: share(layer.box.x - box.x, box.width), y: share(layer.box.y - box.y, box.height),
        width: share(layer.box.width, box.width), height: share(layer.box.height, box.height),
        ...(fill.imageColourLighting && fill.imageColourGloss ? { lighting: fill.imageColourLighting, gloss: fill.imageColourGloss } : {}),
        // The light another part throws in it, and the look under it (a turning part's reflection).
        ...(fill.imageColourUnder && fill.imageColourThrown ? { under: fill.imageColourUnder, thrown: { ...fill.imageColourThrown } } : {}),
      };
    };
    // Angles a step apart (the smallest gap) over the dial's travel, the -135 to 135 degrees it turns:
    // an angle the set has no layer at (the add-on leaves out one that drew nothing) is a frame of
    // nothing, so that nothing stands in for it, and so are the ends beyond the first and the last.
    // Angles off one such step are the frames as they are.
    const drawnAngles = set.map((each) => each.angle);
    const step = Math.min(...drawnAngles.slice(1).map((angle, i) => angle - drawnAngles[i]));
    const onStep = drawnAngles.every((angle) => Math.abs((angle - drawnAngles[0]) / step - Math.round((angle - drawnAngles[0]) / step)) < 1e-6);
    const list = onStep ? [] : drawnAngles;
    if (onStep) {
      const start = drawnAngles[0] - step * Math.floor((drawnAngles[0] + 135) / step + 1e-9);
      for (let angle = start; angle <= 135 + 1e-9; angle += step) list.push(Math.round(angle * 1e6) / 1e6);
    }
    const nothing = { source: '', x: 0, y: 0, width: 100, height: 100 };
    const frames = list.map((angle) => {
      const drawn = set.find((each) => Math.abs(each.angle - angle) < 1e-6);
      return drawn ? frameOf(drawn) : nothing;
    });
    // At rest, the dial in the middle of its travel: the angle 0, or between the two either side.
    const after = list.findIndex((angle) => angle >= 0);
    const rest = after <= 0 ? (after === 0 ? 0 : list.length - 1)
      : after - 1 + (0 - list[after - 1]) / (list[after] - list[after - 1]);
    const first = set[0].layer;
    // Its colour is changed from the colour of the frame at rest (utils/pictureRecolour.js).
    const atRest = [...set].sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle))[0].layer;
    const colourDrawn = String(atRest.part._children.Background._children.Fill.imageColourDrawn ?? '');
    const colourMetal = atRest.part._children.Background._children.Fill.imageColourMetal === true;
    for (const { layer } of set) taken.delete(layer.part.name);
    const effects = first.part._children.Effects;
    const part = createPartNode(uniqueLayerName(set[0].base, taken), {
      role: 'image', kind: 'rectangle', opacity: Math.max(...set.map(({ layer }) => layer.part.opacity ?? 1)), visible: true,
      layout: { x: box.x, y: box.y, width: box.width, height: box.height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top' },
      sections: {
        Image: { _type: 'Image', mode: 'frames', frames, frameIndex: Math.round(rest * 1e4) / 1e4, blendFrames: true, interpolation: 'smooth', colour: '', colourDrawn, ...(colourMetal ? { colourMetal } : {}) },
        ...(effects ? { Effects: deepClone(effects) } : {}),
      },
    });
    angles.set(part.name, list);
    for (const { layer } of set) renamed.set(layer.part.name, part.name);
    const lowest = Math.min(...set.map((each) => each.index));
    replaced.set(lowest, { name: set[0].base, part, box, names: [set[0].base, ...(first.names?.slice(1) ?? [])] });
    for (const each of set) if (each.index !== lowest) replaced.set(each.index, null);
  }
  if (!replaced.size) return { layers, angles };
  const out = layers.flatMap((layer, index) => (replaced.has(index) ? (replaced.get(index) ? [replaced.get(index)] : []) : [layer]));
  // Light thrown by a part now one part of frames is keyed by that part's name.
  const rename = (map) => (map && typeof map === 'object' ? Object.fromEntries(Object.entries(map).map(([from, value]) => [renamed.get(from) ?? from, value])) : map);
  for (const { part } of out) {
    const fill = part._children.Background?._children?.Fill;
    if (fill?.imageColourThrown) fill.imageColourThrown = rename(fill.imageColourThrown);
    for (const frame of part._children.Image?.frames ?? []) if (frame.thrown) frame.thrown = rename(frame.thrown);
  }
  return { layers: out, angles };
}

/**
 * The component, from `layers` bottom first: `{ name, part, box, names }`, where `part` is the part
 * node (its Layout in px from the artwork's top left), `box` its bounds in those px and `names` its
 * own name and its groups' (innermost first). `fileName` can say it is a button.
 *
 * `{ component, kind, report }`: kind is 'dial', 'fader', 'switch', 'button' or 'artwork'; report
 * lists what each role found, by layer name, for the import's summary.
 */
export function buildArtworkComponent({ name = 'Artwork', width, height, layers: drawn = [], fileName = '', colourOf = null }) {
  const { layers, angles: frameAngles } = framesFromAngles(drawn);
  // The light layers that go with a colour layer (the Blender add-on says which, as `colourOf`, light
  // layer to colour layer, by name): its shading and highlights, worked out again with it in another
  // colour, and a turning part's reflection in a metal, changed with the metal's colour
  // (utils/pictureRecolour.js).
  const named = (label) => layers.find((layer) => nameWords(layer.name).join(' ') === nameWords(label).join(' '));
  for (const [light, colourLayer] of colourOf ?? []) {
    const follower = named(light);
    const leader = named(colourLayer);
    if (!follower || !leader || follower === leader) continue;
    const role = lightRoleOf(light);
    const image = follower.part._children.Image;
    const target = image ?? follower.part._children.Background?._children?.Fill;
    if (!target) continue;
    if (image) Object.assign(image, { colourFollows: leader.part.name, ...(role ? { colourRole: role } : {}) });
    else Object.assign(target, { imageColourFollows: leader.part.name, ...(role ? { imageColourRole: role } : {}) });
  }
  const component = createControl('CustomComponent');
  const children = component._children;
  children.Core.name = String(name).trim() || 'Artwork';
  Object.assign(children.Transform, { x: 0, y: 0, width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) });

  const parts = {};
  const roles = { turns: [], moves: [], track: [], pivot: [], on: [], off: [], pressed: [] };
  layers.forEach((layer, index) => {
    const part = layer.part;
    part.zIndex = index;
    parts[part.name] = part;
    const role = artworkRole(layer.names ?? [layer.name]);
    if (role) roles[role].push(layer);
  });
  children.Parts = { _type: 'Parts', _children: parts };

  const wantsButton = [fileName, ...layers.flatMap((layer) => layer.names ?? [])]
    .some((label) => nameWords(label).some((word) => BUTTON_WORDS.includes(word)));
  const kind = roles.turns.length ? 'dial'
    : roles.moves.length ? 'fader'
      : (roles.on.length || roles.off.length || roles.pressed.length) ? (wantsButton ? 'button' : 'switch')
        : 'artwork';

  const channels = {};
  const behaviors = {};
  const hitZones = {};
  const bindings = {};
  const states = {};
  const channelName = 'mainValue';
  const largest = [...layers].sort((a, b) => area(b.box) - area(a.box))[0];

  if (kind === 'dial') {
    Object.assign(channels, { [channelName]: createValueChannel(channelName, { label: 'Value', type: 'float', min: 0, max: 1, step: 0.01, defaultValue: 0.5 }) });
    const wired = makeInteractive('dial', { name: 'main' });
    Object.assign(behaviors, wired.behaviors);
    Object.assign(hitZones, wired.hitZones);
    // Turned about the pivot layer's centre; failing one, the centre of the largest layer that holds
    // every turning layer (the knob's body, which a pointer is drawn on); failing that, the artwork's.
    const inside = (box, point) => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
    const turning = new Set(roles.turns);
    const holders = [...layers].filter((layer) => !turning.has(layer))
      .sort((a, b) => area(b.box) - area(a.box))
      .filter((layer) => roles.turns.every((turn) => inside(layer.box, centre(turn.box))));
    // Not the backdrop, when there is a smaller layer the pointer sits on; and of the large ones the
    // topmost, which is the knob the pointer is drawn on rather than the shadow under it.
    const candidates = holders.filter((layer) => area(layer.box) < 0.9 * width * height);
    const biggest = candidates.length ? area(candidates[0].box) : 0;
    const large = new Set(candidates.filter((layer) => area(layer.box) >= 0.5 * biggest));
    const body = [...layers].reverse().find((layer) => large.has(layer)) ?? holders[0];
    // A pivot named after a turning layer ("pointer shadow pivot") is that layer's own. A shadow cast
    // by a light that stays put turns about a point beside the axis, half its reach towards where it
    // falls, so it stays on the side away from the light whichever way the pointer points.
    const ownName = (layer) => layer.names?.[0] ?? layer.name ?? layer.part.name;
    const withoutPivot = (label) => nameWords(label).filter((word) => !PIVOT_WORDS.includes(word)).join(' ');
    const ownPivots = new Map();
    const shared = [];
    for (const mark of roles.pivot) {
      const named = withoutPivot(ownName(mark));
      const owner = named && roles.turns.find((layer) => !ownPivots.has(layer) && withoutPivot(ownName(layer)) === named);
      if (owner) ownPivots.set(owner, centre(mark.box));
      else shared.push(mark);
    }
    const pivot = shared.length ? centre(shared[0].box)
      : body ? centre(body.box)
        : roles.turns.length === 1 && area(roles.turns[0].box) > 0.25 * width * height ? centre(roles.turns[0].box)
          : { x: width / 2, y: height / 2 };
    for (const layer of roles.turns) {
      const layout = layer.part._children.Layout;
      const w = Math.max(1, layer.box.width);
      const h = Math.max(1, layer.box.height);
      const about = ownPivots.get(layer) ?? pivot;
      layout.pivotX = Math.round(((about.x - layer.box.x) / w) * 10000) / 100;
      layout.pivotY = Math.round(((about.y - layer.box.y) / h) * 10000) / 100;
      bindings[`${layer.part.name}Turn`] = rangeBinding(`${layer.part.name}Turn`, `channel.${channelName}.normalized`, `Parts.${layer.part.name}.Layout.rotation`, -135, 135, 'deg');
    }
    for (const layer of roles.pivot) layer.part.visible = false;
    // A part of frames, one an angle (framesFromAngles): its frame follows the value, the dial turning
    // -135 to 135 degrees over 0 to 1. Angles a step apart, one binding; otherwise one a gap, each
    // adding its share of a frame.
    for (const [part, list] of frameAngles) {
      const at = (angle) => (angle + 135) / 270;
      const gaps = list.slice(1).map((angle, i) => angle - list[i]);
      const even = gaps.every((gap) => Math.abs(gap - gaps[0]) < 1e-6);
      const target = `Parts.${part}.Image.frameIndex`;
      const source = `channel.${channelName}.normalized`;
      if (even) {
        bindings[`${part}Frame`] = { ...rangeBinding(`${part}Frame`, source, target, 0, list.length - 1), inputMin: at(list[0]), inputMax: at(list[list.length - 1]) };
      } else {
        gaps.forEach((_, i) => {
          bindings[`${part}Frame${i + 1}`] = { ...rangeBinding(`${part}Frame${i + 1}`, source, target, 0, 1), inputMin: at(list[i]), inputMax: at(list[i + 1]), ...(i ? { add: true } : {}) };
        });
      }
    }
    // A lamp on a dial (lamp, led, light, lit, glow): lit by a value of its own, on or off, for the
    // panel to set (a binding, a script, the device); "off" layers the other way. The dial's value
    // turns it; nothing about the dial lights it. It starts as the file shows it: on when its lit
    // layers are shown there (the Blender add-on writes a lamp lit), off when they are hidden.
    if (roles.on.length || roles.off.length) {
      const lit = roles.on.length ? roles.on.some((layer) => layer.part.visible !== false) : roles.off.every((layer) => layer.part.visible === false);
      channels.lamp = createValueChannel('lamp', { label: 'Lamp', type: 'bool', min: 0, max: 1, step: 1, defaultValue: lit });
      const lampSource = 'channel.lamp.normalized';
      const wire = (layer, suffix, shownWhenLit) => {
        const full = layer.part.opacity ?? 1;
        layer.part.visible = true;
        layer.part.opacity = lit === shownWhenLit ? full : 0;
        bindings[`${layer.part.name}${suffix}`] = rangeBinding(`${layer.part.name}${suffix}`, lampSource, `Parts.${layer.part.name}.opacity`,
          shownWhenLit ? 0 : full, shownWhenLit ? full : 0);
      };
      for (const layer of roles.on) wire(layer, 'On', true);
      for (const layer of roles.off) wire(layer, 'Off', false);
    }
    // A turning layer drawn at one of several angles that is not a picture (a vector drawn at each)
    // shows near its angle: it fades in from the angle a step before and out by the angle a step
    // after, so between two the picture is the two laid one over the other. The step is the smallest
    // between two of a set's angles; one missing (it drew nothing) leaves nothing in its place.
    const sets = new Map();
    for (const layer of roles.turns) {
      const at = AT_ANGLE.exec(ownName(layer));
      if (!at) continue;
      const base = withoutPivot(ownName(layer).slice(0, at.index));
      if (!sets.has(base)) sets.set(base, []);
      sets.get(base).push({ layer, angle: Number(at[1]) });
    }
    for (const set of sets.values()) {
      const angles = [...new Set(set.map((each) => each.angle))].sort((a, b) => a - b);
      if (angles.length < 2) continue;
      const step = Math.min(...angles.slice(1).map((angle, i) => angle - angles[i]));
      for (const { layer, angle } of set) {
        // Where on the value it is fully shown (the dial turns -135 to 135 degrees over 0 to 1).
        const name = layer.part.name;
        const peak = (angle + 135) / 270;
        const width = step / 270;
        const full = layer.part.opacity ?? 1;
        // Shown as at rest until the value says otherwise (the dial starts in the middle, at 0).
        layer.part.visible = true;
        layer.part.opacity = full * Math.max(0, 1 - Math.abs(angle) / step);
        bindings[`${name}FadeIn`] = { ...rangeBinding(`${name}FadeIn`, `channel.${channelName}.normalized`, `Parts.${name}.opacity`, 0, full), inputMin: peak - width, inputMax: peak };
        bindings[`${name}FadeOut`] = { ...rangeBinding(`${name}FadeOut`, `channel.${channelName}.normalized`, `Parts.${name}.opacity`, 0, -full), inputMin: peak, inputMax: peak + width, add: true };
      }
    }
  } else if (kind === 'fader') {
    // Along the track's long side, or the artwork's; the value 0 at the bottom or the left.
    const track = roles.track[0]?.box ?? { x: 0, y: 0, width, height };
    const vertical = track.height >= track.width;
    Object.assign(channels, { [channelName]: createValueChannel(channelName, { label: 'Value', type: 'float', min: 0, max: 1, step: 0.01, defaultValue: 0 }) });
    const wired = makeInteractive('slider', { name: 'main', partName: (roles.track[0] ?? largest).part.name, geometry: vertical ? 'vertical' : 'horizontal' });
    Object.assign(behaviors, wired.behaviors);
    Object.assign(hitZones, wired.hitZones);
    for (const layer of roles.moves) {
      const box = layer.box;
      if (vertical) {
        const atMin = track.y + track.height - box.height - box.y;
        const atMax = track.y - box.y;
        bindings[`${layer.part.name}Move`] = rangeBinding(`${layer.part.name}Move`, `channel.${channelName}.normalized`, `Parts.${layer.part.name}.Layout.offsetY`, Math.round(atMin * 100) / 100, Math.round(atMax * 100) / 100, 'px');
      } else {
        const atMin = track.x - box.x;
        const atMax = track.x + track.width - box.width - box.x;
        bindings[`${layer.part.name}Move`] = rangeBinding(`${layer.part.name}Move`, `channel.${channelName}.normalized`, `Parts.${layer.part.name}.Layout.offsetX`, Math.round(atMin * 100) / 100, Math.round(atMax * 100) / 100, 'px');
      }
    }
  } else if (kind === 'switch' || kind === 'button') {
    const wired = makeInteractive(kind === 'button' ? 'button' : 'toggle', { name: 'main', partName: largest?.part.name ?? '' });
    Object.assign(channels, wired.valueChannels);
    Object.assign(behaviors, wired.behaviors);
    Object.assign(hitZones, wired.hitZones);
    for (const layer of roles.on) bindings[`${layer.part.name}On`] = rangeBinding(`${layer.part.name}On`, `channel.${channelName}.normalized`, `Parts.${layer.part.name}.opacity`, 0, layer.part.opacity ?? 1);
    for (const layer of roles.off) bindings[`${layer.part.name}Off`] = rangeBinding(`${layer.part.name}Off`, `channel.${channelName}.normalized`, `Parts.${layer.part.name}.opacity`, layer.part.opacity ?? 1, 0);
    // Shown while held: hidden at rest, and a state for the press.
    if (roles.pressed.length) {
      const zone = Object.keys(hitZones)[0];
      for (const layer of roles.pressed) layer.part.visible = false;
      states.pressedLook = {
        _type: 'State', name: 'pressedLook', group: 'interaction', enabled: true,
        description: 'The layers named pressed or down, while it is held.',
        when: { activeCustomHitZone: zone },
        patches: { component: {}, parts: Object.fromEntries(roles.pressed.map((layer) => [layer.part.name, { visible: true }])) },
      };
    }
  }

  children.ValueChannels = { ...children.ValueChannels, _children: channels };
  children.Behaviors = { ...children.Behaviors, _children: behaviors };
  children.HitZones = { ...children.HitZones, _children: hitZones };
  children.Bindings = { ...children.Bindings, _children: bindings };
  children.States = { ...children.States, _children: { ...(children.States?._children ?? {}), ...states } };
  const published = Object.fromEntries(Object.values(channels).map((channel) => [channel.name, {
    channel: channel.name, label: channel.label || channel.name, type: channel.type, enabled: true,
    min: channel.min ?? 0, max: channel.max ?? 1, defaultValue: channel.defaultValue,
  }]));
  children.PublishedProperties = { ...children.PublishedProperties, inputs: published, outputs: published, editableProperties: {} };
  const firstChannel = Object.keys(channels)[0] ?? '';
  children.Designer = { ...children.Designer, selectedLayer: '', selectedValueChannel: firstChannel, selectedBehavior: Object.keys(behaviors)[0] ?? '' };

  const names = (list) => list.map((layer) => layer.name);
  return {
    component,
    kind,
    // The component's layers, as the Component Designer lists them: a turning part drawn at several
    // angles is one, however many layers of the file it was made from.
    layers: Object.keys(parts).length,
    report: {
      turns: names(roles.turns), moves: names(roles.moves), track: names(roles.track), pivot: names(roles.pivot),
      on: names(roles.on), off: names(roles.off), pressed: names(roles.pressed),
    },
  };
}

/** One sentence on what was built, for the notification. */
export function describeArtworkComponent({ kind, report }, layerCount) {
  const list = (items) => items.slice(0, 3).join(', ') + (items.length > 3 ? ` and ${items.length - 3} more` : '');
  const layers = `${layerCount} layer${layerCount === 1 ? '' : 's'}`;
  switch (kind) {
    case 'dial': {
      const lamps = [...(report.on ?? []), ...(report.off ?? [])];
      const lit = lamps.length ? ` ${list(lamps)} light${lamps.length === 1 ? 's' : ''} with a value of ${lamps.length === 1 ? 'its' : 'their'} own, Lamp.` : '';
      return `A dial of ${layers}: ${list(report.turns)} turn${report.turns.length === 1 ? 's' : ''} with the value.${lit}`;
    }
    case 'fader': return `A fader of ${layers}: ${list(report.moves)} move${report.moves.length === 1 ? 's' : ''} along ${report.track[0] ?? 'the artwork'}.`;
    case 'switch': case 'button': {
      const lit = [...report.on, ...report.off, ...report.pressed];
      return `A ${kind} of ${layers}: ${list(lit)} show${lit.length === 1 ? 's' : ''} its state.`;
    }
    default: return `${layers}, each a layer to change. Name a layer "pointer", "fader" or "lamp" to make it move or light.`;
  }
}
