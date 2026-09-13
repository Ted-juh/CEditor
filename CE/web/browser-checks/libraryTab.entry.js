/**
 * The Library tab, in a real browser.
 *
 * The model is unit-tested against the shipped thumbnail builder, which covers the loss arithmetic.
 * What that cannot cover is the tab: that each card is the REAL renderer rather than the panel's
 * coloured rectangles, that placing adds a component to the panel (which the library section has
 * never been able to do), that replacing overwrites the selected one, and that search, sort and
 * pinning behave.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import LibraryTab from '../src/CE_Application/components/LibraryTab.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createCustomComponentPartsDefaults, createPartNode } from '../src/CE_Application/utils/customComponentFactory.js';
import { customComponentLibrary } from '../src/CE_Application/stores/customComponentLibrary.js';

const HOST_ID = 'ctrl_host';

const host = createControl('CustomComponent');
host._children.Core.id = HOST_ID;
host._children.Core.name = 'On Canvas';
host._children.Parts = createCustomComponentPartsDefaults();

panels.set([{ id: 'p1', name: 'Check', width: 900, height: 400, bgColour: 'FF1E1E1E', controls: [host] }]);
activePanelId.set('p1');
selectedComponentIds.set(new Set([HOST_ID]));

function saved(name, { parts = 5, tags = ['knob'], author = 'me', category = 'knobs' } = {}) {
  const control = createControl('CustomComponent');
  control._children.Core.name = name;
  if (parts <= 5) {
    control._children.Parts = createCustomComponentPartsDefaults();
  } else {
    const children = {};
    for (let i = 0; i < parts; i += 1) {
      const part = createPartNode(`part${i}`, {});
      part.zIndex = i;
      part.name = `part${i}`;
      children[`part${i}`] = part;
    }
    control._children.Parts = { _type: 'Parts', _children: children };
  }
  return customComponentLibrary.saveControl(control, { name, author, category, tags });
}

customComponentLibrary.clear();
// Saved most-recent-first, so this order reverses in the store.
saved('Amber LED', { tags: ['led'], category: 'lamps' });
saved('Slim Fader', { tags: ['fader', 'mixer'], author: 'sam', category: 'faders' });
saved('Layered Knob', { parts: 22, tags: ['knob', 'complex'] });
saved('Big Knob', { tags: ['knob'] });

mount(LibraryTab, { target: document.getElementById('host') });

const textOf = (node) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const panelControls = () => get(panels)[0].controls;

window.__lib = {
  names: () => [...document.querySelectorAll('.card .cname')].map((n) => textOf(n)),
  cardCount: () => document.querySelectorAll('.card').length,
  head: () => textOf(document.querySelector('.who')),
  status: () => textOf(document.querySelector('.status')),

  /** Each card mounts the real renderer; this counts what it actually drew. */
  shotInk: () => [...document.querySelectorAll('.card .shot')].map((s) => (s.querySelector('.effect-preview')?.innerHTML ?? '').length),
  shotControls: () => document.querySelectorAll('.card .shot .effect-preview').length,
  lossNotes: () => [...document.querySelectorAll('.card .loss')].map(textOf),

  search: (value) => {
    const input = document.querySelector('.search input');
    if (!input) return false;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  },
  sortBy: (label) => {
    const btn = [...document.querySelectorAll('.sorts button')].find((b) => textOf(b) === label);
    btn?.click();
    return !!btn;
  },
  tagChips: () => [...document.querySelectorAll('.tagrow button')].map((b) => textOf(b)),
  clickTag: (name) => {
    const btn = [...document.querySelectorAll('.tagrow button')].find((b) => textOf(b).startsWith(name));
    btn?.click();
    return !!btn;
  },

  select: (name) => {
    const card = [...document.querySelectorAll('.card')].find((c) => textOf(c.querySelector('.cname')) === name);
    card?.click();
    return !!card;
  },
  selected: () => textOf(document.querySelector('.card.sel .cname')),
  pin: (name) => {
    const card = [...document.querySelectorAll('.card')].find((c) => textOf(c.querySelector('.cname')) === name);
    card?.querySelector('.pin')?.click();
    return !!card;
  },
  pinned: () => [...document.querySelectorAll('.card')].filter((c) => c.querySelector('.pin.on')).map((c) => textOf(c.querySelector('.cname'))),

  detailName: () => textOf(document.querySelector('.detailcol .f')),
  place: () => { [...document.querySelectorAll('.acts button')].find((b) => textOf(b).includes('Place'))?.click(); },
  replace: () => { [...document.querySelectorAll('.acts button')].find((b) => textOf(b).includes('Replace'))?.click(); },
  forget: () => { [...document.querySelectorAll('.acts button')].find((b) => textOf(b).includes('Forget'))?.click(); },
  replaceLabel: () => textOf([...document.querySelectorAll('.acts button')].find((b) => textOf(b).includes('Replace'))),
  detailNote: () => textOf(document.querySelector('.detailcol .note')),

  /** The drag payload the canvas already reads, taken off a real dragstart. */
  dragPayload: (name) => {
    const card = [...document.querySelectorAll('.card')].find((c) => textOf(c.querySelector('.cname')) === name);
    if (!card) return null;
    let captured = null;
    const dt = { effectAllowed: '', setData: (type, value) => { captured = { type, value }; } };
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dt });
    card.dispatchEvent(event);
    return captured;
  },

  panelControls: () => panelControls().map((c) => c._children.Core.name),
  selectHost: () => selectedComponentIds.set(new Set([HOST_ID])),
  hostParts: () => Object.keys(panelControls().find((c) => c._children.Core.id === 'ctrl_host')?._children?.Parts?._children ?? {}).length,
  hostName: () => panelControls().find((c) => c._children.Core.id === 'ctrl_host')?._children?.Core?.name ?? '',
  librarySize: () => (get(customComponentLibrary) ?? []).length,
  useCount: (name) => (get(customComponentLibrary) ?? []).find((e) => e.name === name)?.useCount ?? -1,

  sliderCount: () => document.querySelectorAll('input[type=range], .slider, [role=slider]').length,
};
