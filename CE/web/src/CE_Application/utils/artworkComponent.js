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
 * clockwise from rest); several of one name fade from one to the next as the part turns.
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
import { createValueChannel, makeInteractive } from './customComponentFactory.js';

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

/**
 * The component, from `layers` bottom first: `{ name, part, box, names }`, where `part` is the part
 * node (its Layout in px from the artwork's top left), `box` its bounds in those px and `names` its
 * own name and its groups' (innermost first). `fileName` can say it is a button.
 *
 * `{ component, kind, report }`: kind is 'dial', 'fader', 'switch', 'button' or 'artwork'; report
 * lists what each role found, by layer name, for the import's summary.
 */
export function buildArtworkComponent({ name = 'Artwork', width, height, layers = [], fileName = '' }) {
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
    // A turning layer drawn at one of several angles ("pointer reflection at 27": a part's reflection
    // as it is with the part turned 27 degrees clockwise, drawn turned back to rest) shows near its
    // angle: it fades in from the angle a step before and out by the angle a step after, so between
    // two the picture is the two mixed, each turned with the part. The step is the smallest between
    // two of a set's angles; one missing (it drew nothing) leaves nothing in its place.
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
    case 'dial': return `A dial of ${layers}: ${list(report.turns)} turn${report.turns.length === 1 ? 's' : ''} with the value.`;
    case 'fader': return `A fader of ${layers}: ${list(report.moves)} move${report.moves.length === 1 ? 's' : ''} along ${report.track[0] ?? 'the artwork'}.`;
    case 'switch': case 'button': {
      const lit = [...report.on, ...report.off, ...report.pressed];
      return `A ${kind} of ${layers}: ${list(lit)} show${lit.length === 1 ? 's' : ''} its state.`;
    }
    default: return `${layers}, each a layer to change. Name a layer "pointer", "fader" or "lamp" to make it move or light.`;
  }
}
