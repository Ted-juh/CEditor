// staticPartBaking.js — decide which parts can never change, and fold them into one image.
//
// partsToSvg.js answers "can this part be DRAWN as SVG". This file answers the harder question:
// "can this part ever CHANGE". A part that is perfectly drawable but moves at runtime must stay a
// live element, and getting that wrong means a knob whose pointer is frozen at its default — a bug
// that looks like a broken binding and lives nowhere near the binding code.
//
// So the rule is inverted from the usual: a part is baked only if NOTHING in the control can reach
// it. Bindings, states, animations, generators and scripts are all ways for a part to move, and
// rather than model each one precisely, a control that has ANY of them keeps all its parts. That is
// blunt, and deliberately so — it costs a little performance on components that use those features
// and it cannot produce a frozen control. When someone wants the win on a stateful component, the
// way to get it is to narrow this rule with a test that proves the narrowing, not to trust a reading
// of five subsystems at once.
//
// DERIVED, NEVER STORED. The baked image is a cache keyed by the parts it came from, computed at
// render. Storing it in the document would mean the file holds both the parts and a picture of the
// parts, which can disagree; it would need invalidation; it would change the format; and an older
// build would have to understand it. A hash-keyed cache has none of those problems — change a
// part, the key changes, the old entry is garbage. Measured cost of computing every distinct image
// on the GAIA panel: well under the 188 ms that also included process start and 4.8 MB of parsing.

import { isBakeable, partsToSvg, svgToDataUrl, whyNotBakeable } from './partsToSvg.js';

/** The one part the bake produces. Named so it is obvious in a DOM inspector where it came from. */
export const BAKED_PART_NAME = '__bakedStatic';

/** Below this, folding parts costs more than it saves and only makes the DOM harder to read. */
const MIN_PARTS_TO_BAKE = 4;

const nonEmpty = (section) => {
  const children = section?._children;
  if (children && Object.keys(children).length > 0) return true;
  // Some of these sections carry their content as arrays or plain keys rather than _children.
  if (!section || typeof section !== 'object') return false;
  return Object.entries(section).some(([key, value]) =>
    key !== '_type' && key !== 'enabled' && key !== '_children'
    && (Array.isArray(value) ? value.length > 0 : value && typeof value === 'object' && Object.keys(value).length > 0));
};

/**
 * Why this control cannot have its parts baked, or null if it can.
 *
 * Everything here is a way for a part to move at runtime. States and animations patch parts by
 * name; generators create them; scripts address them as `Parts.<name>`; the arpeggiator surface
 * materializes a whole grid at render time that exists in no parts map at all.
 */
export function whyControlNotBakeable(control) {
  if (String(control?._children?.Core?.controlType ?? '') !== 'CustomComponent') return 'not a custom component';
  if (control._children.Core?.visible === false) return null;

  const children = control._children;
  if (nonEmpty(children.States)) return 'has states';
  if (nonEmpty(children.Animations)) return 'has animations';
  if (nonEmpty(children.Generators)) return 'has generators';
  if (children.Designer?.arpeggiator?.enabled === true) return 'arpeggiator surface materializes its own parts';

  const scripts = JSON.stringify(children.Scripts ?? {});
  if (scripts.length > 32 && /Parts\./.test(scripts)) return 'a script addresses parts by name';

  return null;
}

/** Part names something in this control can move — every binding target, conservatively parsed. */
export function movingPartNames(control) {
  const names = new Set();
  // Inline numeric inputs are live DOM controls, even without a visual binding.
  for (const [name, part] of Object.entries(control?._children?.Parts?._children ?? {})) {
    if (part.role === 'customValueField' || part.role === 'deviceSyncStatus') names.add(name);
  }
  for (const binding of Object.values(control?._children?.Bindings?._children ?? {})) {
    if (binding?.enabled === false) continue;
    const match = String(binding?.target ?? '').match(/^Parts\.([^.]+)/);
    if (match) names.add(match[1]);
  }
  return names;
}

/**
 * Split a control's parts into the ones that can be folded and the ones that must stay live.
 * Pure — takes the control, returns names. Everything downstream is derived from this.
 */
export function classifyParts(control) {
  const parts = control?._children?.Parts?._children ?? {};
  const blocked = whyControlNotBakeable(control);
  if (blocked) return { bakeable: [], live: Object.keys(parts), reason: blocked };

  const moving = movingPartNames(control);
  const bakeable = [];
  const live = [];
  for (const [name, part] of Object.entries(parts)) {
    if (moving.has(name) || !isBakeable(part)) live.push(name);
    else bakeable.push(name);
  }
  return { bakeable, live, reason: null };
}

/**
 * Why nothing was baked, in words — for the diagnostics panel and for anyone asking why a
 * particular component did not get faster. Never called on a hot path.
 */
export function bakeDiagnostics(control) {
  const blocked = whyControlNotBakeable(control);
  if (blocked) return { baked: 0, blocked, refusals: [] };
  const moving = movingPartNames(control);
  const refusals = [];
  for (const [name, part] of Object.entries(control?._children?.Parts?._children ?? {})) {
    if (moving.has(name)) continue;
    const why = whyNotBakeable(part);
    if (why) refusals.push({ part: name, why });
  }
  return { baked: classifyParts(control).bakeable.length, blocked: null, refusals };
}

/* ------------------------------------------------------------------ the cache */

// Two levels, because the two things being deduplicated are different.
//
// IDENTITY (WeakMap) is the fast path and covers re-renders. Parts are immutable — the store
// replaces what it edits and returns everything else by reference — so the same object means the
// same picture, decided by comparing the participating part references. This is the lookup that runs on every render.
//
// CONTENT (Map) is the slow path and covers the 69 faders. They are 69 distinct objects holding the
// same drawing, so identity alone would mint 69 identical data URLs and make the browser decode
// each one. A digest folds them onto one.
//
// Intern only the fields painted by the SVG serializer. This avoids serializing
// bindings and metadata for every fader, while retaining exact content equality.
const CACHE_LIMIT = 512;
const byContent = new Map();
let byIdentity = new WeakMap();
let partTokens = new WeakMap();
const tokenByPaint = new Map();
let nextToken = 0;
const counts = { hits: 0, builds: 0 };

// Exact paint descriptions are interned, not reduced to a collision-prone hash.
// Part identity avoids serialization during MIDI updates; equal drawings from
// different controls share tokens even if their MIDI bindings differ.
function paintToken(part) {
  let token = partTokens.get(part);
  if (token !== undefined) return token;
  const l = part?._children?.Layout ?? {};
  const bg = part?._children?.Background?._children ?? {};
  const f = bg.Fill ?? {}, b = bg.Border ?? {}, g = f.gradient ?? {};
  const key = JSON.stringify([
    part.zIndex ?? 0, part.opacity ?? 1, part.visible !== false,
    ...['x', 'y', 'width', 'height', 'rotation', 'pivotX', 'pivotY'].map(k => l[k] ?? null),
    f.solidEnabled !== false, f.colour ?? '', f.gradientEnabled === true,
    f.gradientEnabled === true ? [g.type, g.angle, g.centerX, g.centerY, g.radiusX, g.radiusY,
      (g.stops ?? []).map(stop => [stop.color, stop.position])] : null,
    b.enabled === true, b.thickness ?? 0, b.colour ?? '', bg.Corners?.radius ?? 0,
  ]);
  token = tokenByPaint.get(key);
  if (token === undefined) {
    token = ++nextToken;
    tokenByPaint.set(key, token);
    if (tokenByPaint.size > 8192) tokenByPaint.delete(tokenByPaint.keys().next().value);
  }
  partTokens.set(part, token);
  return token;
}

function cached(entries, width, height) {
  const anchor = entries[0]?.[1];
  const hit = anchor && byIdentity.get(anchor);
  if (hit && hit.width === width && hit.height === height && hit.entries.length === entries.length
      && hit.entries.every(([name, part], i) => name === entries[i][0] && part === entries[i][1])) {
    counts.hits++;
    return hit.url;
  }
  // Names do not affect the image. Order does: equal-z parts paint in input order.
  const key = `${width}:${height}:${entries.map(([, part]) => paintToken(part)).join(',')}`;
  let url;
  if (byContent.has(key)) {
    counts.hits++;
    url = byContent.get(key);
    byContent.delete(key); // Retain recently reused versions for undo and preview re-entry.
  } else {
    counts.builds++;
    const svg = partsToSvg(entries, width, height);
    url = svg ? svgToDataUrl(svg) : null;
  }
  byContent.set(key, url);
  if (byContent.size > CACHE_LIMIT) byContent.delete(byContent.keys().next().value);
  if (anchor) byIdentity.set(anchor, { url, entries, width, height });
  return url;
}

export const bakeCacheSize = () => byContent.size;
export const bakeCacheStats = () => ({ ...counts, entries: byContent.size });
export function clearBakeCache() {
  byContent.clear();
  byIdentity = new WeakMap();
  partTokens = new WeakMap();
  tokenByPaint.clear();
  nextToken = 0;
  counts.hits = counts.builds = 0;
}

/** The single part that stands in for all the folded ones. */
function bakedPart(url, width, height, zIndex) {
  return {
    _type: 'Part',
    name: BAKED_PART_NAME,
    role: 'custom',
    kind: 'rectangle',
    visible: true,
    opacity: 1,
    // The lowest z-index of what it replaced, so it lands exactly where those parts were in the
    // stack. Not -1: a negative z-index puts it behind the control's own content wrapper, which
    // renders it invisible — found by screenshot, twice.
    zIndex,
    acceptsStatePatches: false,
    clipChildren: false,
    meta: { bakedStatic: true },
    _children: {
      Layout: {
        _type: 'PartLayout', mode: 'absolute',
        x: 0, y: 0, width, height,
        xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px',
        anchorX: 'left', anchorY: 'top', align: 'center',
        paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0,
        offsetX: 0, offsetY: 0, rotation: 0, scale: 1, pivotX: 50, pivotY: 50,
      },
      Background: {
        _type: 'Background',
        _children: {
          Fill: { _type: 'Fill', colour: '00000000', solidEnabled: false, imageEnabled: true, imageSrc: url, imageFit: 'fill' },
          Border: { _type: 'Border', enabled: false, thickness: 0, colour: '00000000' },
          Corners: { _type: 'Corners', linked: true, radius: 0 },
        },
      },
    },
  };
}

/**
 * The render-time entry point: `[name, part]` entries in, the same entries with the unchanging ones
 * folded into one, out.
 *
 * Returns the input array UNCHANGED whenever it cannot help, which is what makes this safe to call
 * unconditionally — no caller needs to know the rules.
 */
export function bakeStaticPartEntries(control, entries, width, height) {
  if (!Array.isArray(entries) || entries.length < MIN_PARTS_TO_BAKE) return entries;
  if (!(width > 0 && height > 0)) return entries;

  const { bakeable } = classifyParts(control);
  if (bakeable.length < MIN_PARTS_TO_BAKE) return entries;

  const bakeableSet = new Set(bakeable);
  const folded = entries.filter(([name]) => bakeableSet.has(name));
  if (folded.length < MIN_PARTS_TO_BAKE) return entries;

  const url = cached(folded, width, height);
  if (!url) return entries;

  const zIndex = Math.min(...folded.map(([, part]) => Number(part?.zIndex ?? 0)));
  const kept = entries.filter(([name]) => !bakeableSet.has(name));
  return [[BAKED_PART_NAME, bakedPart(url, width, height, zIndex)], ...kept];
}
