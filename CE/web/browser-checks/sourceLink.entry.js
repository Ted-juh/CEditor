/**
 * The Source card of a placed custom component, in a real browser.
 *
 * `test/customComponentSourceLink.test.js` covers the comparison and the rebuild. What it cannot cover
 * is that the card really offers the right action for each state, that pressing it changes the panel
 * — the store, not just the card — that the destructive ones ask first, and that updating several
 * copies is ONE undo step.
 *
 * The panel: three copies of "Dial" placed from 1.0.0, then 1.1.0 saved to the library.
 *   a — untouched                       → update available
 *   b — its label set (a published value) → update available, label kept
 *   c — a part hidden (a design edit)     → diverged; plain update refused
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import SourceLinkHarness from './SourceLinkHarness.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createCustomComponentPartsDefaults } from '../src/CE_Application/utils/customComponentFactory.js';
import { customComponentLibrary } from '../src/CE_Application/stores/customComponentLibrary.js';
import { instantiateCustomComponentPackageControl } from '../src/CE_Application/utils/customComponentPackage.js';
import { initHistory, undo, flushHistory } from '../src/CE_Application/stores/history.js';

const author = createControl('CustomComponent');
author._children.Core.name = 'Dial';
author._children.Parts = createCustomComponentPartsDefaults();
author._children.PublishedProperties = {
  _type: 'PublishedProperties', inputs: {}, outputs: {},
  editableProperties: { title: { path: 'Parts.label.Text.content', label: 'Title', type: 'text', enabled: true } },
};
const partNames = Object.keys(author._children.Parts._children);

customComponentLibrary.clear();
const v1 = customComponentLibrary.saveControl(author, { name: 'Dial', version: '1.0.0' });

const place = (id, x) => instantiateCustomComponentPackageControl(v1.envelope, { id, Transform: { x, y: 20 } });
const a = place('ctrl_a', 20);
const b = place('ctrl_b', 240);
b._children.Parts._children.label._children.Text = { ...(b._children.Parts._children.label._children.Text ?? {}), content: 'CUTOFF' };
const c = place('ctrl_c', 460);
c._children.Parts._children[partNames[0]].visible = false;

panels.set([{ id: 'p1', name: 'Check', width: 900, height: 400, bgColour: 'FF1E1E1E', controls: [a, b, c] }]);
activePanelId.set('p1');

// The library moves on: 1.1.0 changes one thing about the design.
const v2Author = JSON.parse(JSON.stringify(author));
v2Author._children.Parts._children[partNames[1]].opacity = 0.5;
customComponentLibrary.saveControl(v2Author, { name: 'Dial', version: '1.1.0' });

initHistory();
selectedComponentIds.set(new Set(['ctrl_a']));
mount(SourceLinkHarness, { target: document.getElementById('host') });

const textOf = (node) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const card = () => document.querySelector('.source-card');
const button = (label) => [...(card()?.querySelectorAll('button') ?? [])].find((btn) => textOf(btn).startsWith(label));
const find = (id) => get(panels)[0].controls.find((entry) => entry._children.Core.id === id);

window.__src = {
  partNames,
  select: (id) => selectedComponentIds.set(new Set([id])),
  pill: () => textOf(card()?.querySelector('.pill')),
  line: () => textOf(card()?.querySelector('.line')),
  buttons: () => [...(card()?.querySelectorAll('.actions button') ?? [])].map(textOf),
  press: (label) => { const btn = button(label); btn?.click(); return !!btn; },
  confirmText: () => textOf(card()?.querySelector('.confirm span')),
  confirm: () => { card()?.querySelector('.confirm button')?.click(); },
  status: () => textOf(card()?.querySelector('.status')),
  diffRows: () => [...(card()?.querySelectorAll('.diff .row') ?? [])].map(textOf),
  hasCard: () => !!card(),
  version: (id) => find(id)?._children?.Designer?.packageVersion ?? '',
  x: (id) => find(id)?._children?.Transform?.x,
  title: (id) => find(id)?._children?.Parts?._children?.label?._children?.Text?.content ?? '',
  opacity: (id) => find(id)?._children?.Parts?._children?.[partNames[1]]?.opacity,
  visible0: (id) => find(id)?._children?.Parts?._children?.[partNames[0]]?.visible,
  linked: (id) => !!find(id)?._children?.Designer?.sourcePackage,
  flush: () => flushHistory(),
  undo: () => undo(),
};
