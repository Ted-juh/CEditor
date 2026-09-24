// The last pass: turn the drawn sections into real ones.
//
// Every section on the panel used to be DRAWN rather than BUILT: a `box_LFO` Background, a
// `tab_LFO` title, and the knobs and captions laid on top of it at panel coordinates, all loose at
// the top level. It looked sectioned and was not, so the component tree showed 327 loose controls,
// 171 of them called `label`, and the three tones' boxes shared their names (`box_LFO` ×3), which
// breaks the one-name-one-control rule scripts rely on.
//
// This pass runs after every layout pass, on the finished geometry, so none of those passes has to
// know about nesting. Each box becomes a Container with the box's own look, holding what sits on
// it; the three tones and the effects column get a transparent Container each; the pages of
// `bottom_pages` are sectioned the same way. Captions are named after the control they caption.
// The drawn result is unchanged: every child keeps its panel position, re-expressed relative to
// its new parent, and paint order is list order throughout, which is kept.
//
// Names are underscores, never dots: a script path's first dot ends the control name
// (panelRuntime splitScriptPath), so `tone1.lfo` would be unaddressable as `tone1.lfo.visible`.
// Existing control names are left alone — DAW parameter ids and scripts are keyed on them.

import { createControl } from '../../../CE/web/src/CE_Application/models/componentTypes.js';
import { childPageId } from '../../../CE/web/src/CE_Application/utils/tabContainerLayout.js';

const core = (c) => c._children.Core;
const rect = (c) => c._children.Transform;
const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const BOX = 'box_';
const TAB = 'tab_';

function isBox(c) {
  return core(c).controlType === 'Background' && String(core(c).name ?? '').startsWith(BOX);
}

function containsFully(outer, inner, slack = 1) {
  const o = rect(outer);
  const i = rect(inner);
  return i.x >= o.x - slack && i.y >= o.y - slack
    && i.x + i.width <= o.x + o.width + slack && i.y + i.height <= o.y + o.height + slack;
}

function overlapShare(outer, inner) {
  const o = rect(outer);
  const i = rect(inner);
  const w = Math.min(o.x + o.width, i.x + i.width) - Math.max(o.x, i.x);
  const h = Math.min(o.y + o.height, i.y + i.height) - Math.max(o.y, i.y);
  return w > 0 && h > 0 ? (w * h) / (i.width * i.height) : 0;
}

/**
 * Pull a control that overhangs its box back inside, keeping its centre where it was. The MOD LFO
 * captions sat 4px left of their box — invisible as a drawing, but a child hanging out of its
 * container is either clipped or a hit area outside the section, and neither is what was meant.
 */
function tuckInto(box, c) {
  const o = rect(box);
  const r = rect(c);
  const over = Math.max(0, o.x - r.x, r.x + r.width - (o.x + o.width));
  if (over > 0 && r.width > over * 2) { r.x += over; r.width -= over * 2; }
  const overY = Math.max(0, o.y - r.y, r.y + r.height - (o.y + o.height));
  if (overY > 0 && r.height > overY * 2) { r.y += overY; r.height -= overY * 2; }
}

function makeContainer(name, box, { tabPageId, transparent = false } = {}) {
  const t = rect(box);
  const container = createControl('Container', {
    Core: { id: name, name, ...(tabPageId ? { tabPageId } : {}) },
    Transform: { x: t.x, y: t.y, width: t.width, height: t.height },
    // A section is a frame, not a snapping surface: forty grids drawn over the panel in the editor
    // would bury the controls they are meant to help place.
    Grid: { visible: false },
    ...(transparent
      ? { Background: { _children: { Fill: { colour: '00000000' }, Border: { enabled: false } } } }
      : {}),
  });
  if (!transparent) container._children.Background = structuredClone(box._children.Background);
  return container;
}

/** Move `members` into `container`, keeping each one's drawn position. */
function adopt(container, members) {
  const o = rect(container);
  const children = {};
  for (const m of members) {
    rect(m).x -= o.x;
    rect(m).y -= o.y;
    delete core(m).tabPageId; // the page belongs to the container now
    children[core(m).id] = m;
  }
  container._children.Children = { _type: 'Children', _children: children };
  return container;
}

function unionRect(members) {
  const xs = members.map((m) => rect(m).x);
  const ys = members.map((m) => rect(m).y);
  const x2 = members.map((m) => rect(m).x + rect(m).width);
  const y2 = members.map((m) => rect(m).y + rect(m).height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { _children: { Transform: { x, y, width: Math.max(...x2) - x, height: Math.max(...y2) - y } } };
}

/**
 * Section one list of sibling controls: every box becomes a Container holding what sits on it.
 * `nameFor(title, members)` names the section. Returns the new list, in paint order.
 */
function sectionize(list, nameFor, { tabPageId } = {}) {
  const boxes = list.filter(isBox);
  if (!boxes.length) return list;
  const membersOf = new Map(boxes.map((b) => [b, []]));
  const owner = new Map();
  for (const c of list) {
    if (isBox(c)) continue;
    const full = boxes.filter((b) => containsFully(b, c));
    let box = full.sort((a, b) => rect(a).width * rect(a).height - rect(b).width * rect(b).height)[0];
    if (!box) {
      box = boxes.find((b) => overlapShare(b, c) >= 0.5);
      if (box) tuckInto(box, c);
    }
    if (box) { membersOf.get(box).push(c); owner.set(c, box); }
  }

  const out = [];
  for (const c of list) {
    if (owner.has(c)) continue; // placed with its box
    if (!isBox(c)) { out.push(c); continue; }
    const title = String(core(c).name).slice(BOX.length);
    const members = membersOf.get(c);
    const name = nameFor(title, members);
    const pageId = tabPageId ?? core(c).tabPageId;
    for (const m of members) {
      if (String(core(m).name ?? '') === `${TAB}${title}`) core(m).name = `${name}_title`;
    }
    out.push(adopt(makeContainer(name, c, { tabPageId: pageId }), members));
  }
  return out;
}

/** Which tone (or effect) a top-level box belongs to, read from the names of what sits on it. */
function topLevelSectionName(title, members) {
  const counts = new Map();
  for (const m of members) {
    const head = String(core(m).name ?? '').split('.')[0];
    if (/^tone\d$/.test(head) || ['distortion', 'flanger', 'delay', 'reverb'].includes(head)) {
      counts.set(head, (counts.get(head) ?? 0) + 1);
    }
  }
  const [owner] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (/^tone\d$/.test(owner ?? '')) return `${owner}_${slug(title)}`;
  if (title === 'EFFECTS / OUTPUT') return 'effects_output';
  if (owner) return `effects_${owner}`;
  throw new Error(`section-tree: cannot tell which part of the panel box_${title} belongs to`);
}

/** Wrap `members` (already in paint order within `list`) in a transparent group named `name`. */
function group(list, name, members) {
  if (!members.length) return list;
  const set = new Set(members);
  const container = adopt(makeContainer(name, unionRect(members), { transparent: true }), members);
  const out = [];
  let placed = false;
  for (const c of list) {
    if (!set.has(c)) { out.push(c); continue; }
    if (!placed) { out.push(container); placed = true; }
  }
  return out;
}

const PAGE_PREFIX = { arpeggiator: 'arp' };

function sectionPages(tabs) {
  const kids = Object.values(tabs._children.Children?._children ?? {});
  const pages = tabs._children.TabContainer?.pages ?? [];
  const next = [];
  for (const page of pages) {
    const onPage = kids.filter((k) => childPageId(k, tabs) === String(page.id));
    const prefix = PAGE_PREFIX[page.id] ?? slug(page.id);
    next.push(...sectionize(onPage, (title) => `${prefix}_${slug(title)}`, { tabPageId: String(page.id) }));
  }
  tabs._children.Children._children = Object.fromEntries(next.map((c) => [core(c).id, c]));
}

// --- Names ---------------------------------------------------------------------------------------

function childList(c) {
  return Object.values(c._children.Children?._children ?? {});
}

function centre(c) {
  const r = rect(c);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

const spanX = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
const spanY = (a, b) => Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

/** The empty space between two rectangles, 0 when they touch or overlap. */
function gap(a, b) {
  return Math.hypot(Math.max(0, -spanX(a, b)), Math.max(0, -spanY(a, b)));
}

/**
 * A caption is named after the control it captions: the nearest sibling input it shares a column
 * with (a caption under a knob) or a row with (a caption beside a System field). A caption lying
 * across three or more inputs is not any one of theirs — the write-protect legend runs over a
 * whole row of slots — and neither is one with no input in line with it; those are the section's
 * notes. Section titles are never what a caption captions.
 */
function nameCaptions(list, parentName) {
  // Nor is a container: a Fader/Graph view spans half a section, and "nearest" would hand it every
  // caption along its top edge.
  const inputs = list.filter((c) => core(c).controlType !== 'Label' && !isBox(c) && !c._children.Children
    && !String(core(c).name ?? '').endsWith('_title'));
  for (const c of list) {
    if (core(c).controlType !== 'Label' || core(c).name !== 'label') continue;
    const me = rect(c);
    const page = childPageIdOf(c);
    const inLine = inputs.filter((i) => (!page || childPageIdOf(i) === page)
      && (spanX(rect(i), me) > 0 || spanY(rect(i), me) > 0));
    // Side by side, not stacked: a caption over an LED column overlaps every LED in it, and that
    // is one control's worth of column, not three controls.
    const columns = inLine
      .filter((i) => spanX(rect(i), me) > 0)
      .map((i) => rect(i))
      .sort((a, b) => a.x - b.x)
      .reduce((ends, r) => (ends.length && r.x < ends[ends.length - 1] ? ends : [...ends, r.x + r.width]), []);
    const nearest = columns.length >= 3
      ? null
      : inLine
        .map((i) => ({ i, d: gap(rect(i), me) + Math.hypot(centre(i).x - centre(c).x, centre(i).y - centre(c).y) / 1000 }))
        .sort((a, b) => a.d - b.d)[0]?.i;
    core(c).name = nearest
      ? `${String(core(nearest).name).replace(/[^A-Za-z0-9]+/g, '_')}_label`
      : `${parentName}_note`;
  }
  for (const c of list) {
    if (childList(c).length) nameCaptions(childList(c), String(core(c).name));
  }
}

function childPageIdOf(c) {
  return core(c).tabPageId ?? '';
}

/** Names are addresses: a second `x` becomes `x_2`, so every control can be found by name. */
function uniqueNames(controls) {
  const seen = new Map();
  const visit = (list) => {
    for (const c of list) {
      const base = String(core(c).name ?? '');
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      if (n > 1) {
        let candidate = `${base}_${n}`;
        while (seen.has(candidate)) candidate = `${base}_${n += 1}`;
        seen.set(candidate, 1);
        core(c).name = candidate;
      }
      visit(childList(c));
    }
  };
  visit(controls);
}

// --- The pass --------------------------------------------------------------------------------------

/** Loose top-level controls that are meant to stay loose. Anything else loose is a layout bug. */
const TOP_LEVEL = new Set(['plate', 'bottom_pages']);

export function applySectionTree(panel) {
  let list = sectionize(panel.controls, topLevelSectionName);

  for (const tone of [1, 2, 3]) {
    const mine = list.filter((c) => {
      const name = String(core(c).name ?? '');
      return name.startsWith(`tone${tone}_`) || name.startsWith(`tone${tone}.`) || name === `common.tone${tone}Select`
        || name === `common.tone${tone}Switch`;
    });
    list = group(list, `tone${tone}`, mine);
  }
  list = group(list, 'effects', list.filter((c) => String(core(c).name ?? '').startsWith('effects_')));

  const tabs = list.find((c) => core(c).name === 'bottom_pages');
  if (tabs) sectionPages(tabs);

  const loose = list.filter((c) => !TOP_LEVEL.has(core(c).name) && !['tone1', 'tone2', 'tone3', 'effects'].includes(core(c).name));
  if (loose.length) {
    throw new Error(`section-tree: controls left outside any section: ${loose.map((c) => core(c).name).join(', ')}`);
  }

  nameCaptions(list, 'panel');
  uniqueNames(list);
  return { ...panel, controls: list };
}
