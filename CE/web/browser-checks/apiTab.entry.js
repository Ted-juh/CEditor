/**
 * The API tab, in a real browser.
 *
 * The model is unit-tested against the shipped package validator, which covers the disagreement.
 * What that cannot cover is the tab: that the whole contract is on screen at once, that a row a
 * consumer will never see is marked ON THE ROW, that the offered repair writes the properties and
 * clears the stale field it replaces, and that sorting a column really reorders the table.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import ApiTab from '../src/CE_Application/components/ApiTab.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createCustomComponentPartsDefaults } from '../src/CE_Application/utils/customComponentFactory.js';
import { activateEditorTarget, editorTarget } from '../src/CE_Application/stores/editorTarget.js';

const ID = 'ctrl_api_1';

const control = createControl('CustomComponent');
control._children.Core.id = ID;
control._children.Core.name = 'Big Knob';
control._children.Parts = createCustomComponentPartsDefaults();

control._children.PublishedProperties = {
  _type: 'PublishedProperties',
  inputs: {
    gain: { enabled: true, label: 'Gain', channel: 'mainValue', type: 'float', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
    // The shipped default contract's shape: a `variable` target nothing reads.
    accentColour: { enabled: true, label: 'Accent Colour', variable: 'mainValue', type: 'color' },
    ghost: { enabled: true, label: 'Ghost', channel: 'noSuchChannel', type: 'float' },
    muted: { enabled: false, label: 'Muted', channel: 'noSuchChannel', type: 'float' },
  },
  outputs: {
    level: { enabled: true, label: 'Level', channel: 'mainValue', type: 'float' },
  },
  editableProperties: {
    caption: { enabled: true, label: 'Caption', path: 'Parts.label.Text.content', type: 'text', defaultValue: 'INIT' },
    // Resolves on the first segment and nowhere after it.
    bogus: { enabled: true, label: 'Bogus', path: 'Parts.background.Background.Fill.nonsenseKey', type: 'color' },
  },
};

panels.set([{ id: 'p1', name: 'Check', width: 800, height: 400, bgColour: 'FF1E1E1E', controls: [control] }]);
activePanelId.set('p1');
selectedComponentIds.set(new Set([ID]));
activateEditorTarget('api', ID);

mount(ApiTab, { target: document.getElementById('host') });

const textOf = (node) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const live = () => get(panels)[0].controls[0]._children.PublishedProperties;

window.__api = {
  target: () => get(editorTarget),

  // --- making and unmaking an entry ------------------------------------------------------
  storedNames: (map) => Object.keys(live()?.[map] ?? {}),
  pickKind: (kind) => {
    const select = document.querySelector('.addrow select');
    if (!select) return false;
    select.value = kind;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  },
  typeName: (value) => {
    const input = document.querySelector('.addrow input');
    if (!input) return false;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  },
  clickAdd: () => { document.querySelector('.addrow .mk')?.click(); },
  removeRow: (name) => {
    const row = [...document.querySelectorAll('.tr')].find((r) => textOf(r.querySelector('.name')).split(' ')[0] === name);
    row?.querySelector('.drop')?.click();
    return !!row;
  },
  head: () => textOf(document.querySelector('.who')),
  alarm: () => textOf(document.querySelector('.alarm')),

  names: () => [...document.querySelectorAll('.tr .name')].map((n) => textOf(n).split(' ')[0]),
  rowCount: () => document.querySelectorAll('.tr').length,
  badRows: () => [...document.querySelectorAll('.tr')].map((r, i) => (r.classList.contains('bad') ? i : -1)).filter((i) => i >= 0),
  targets: () => [...document.querySelectorAll('.tr .target')].map(textOf),
  types: () => [...document.querySelectorAll('.tr .type')].map(textOf),
  ranges: () => [...document.querySelectorAll('.tr .range')].map(textOf),

  sortBy: (label) => {
    const th = [...document.querySelectorAll('.th')].find((b) => textOf(b).replace(/[▲▼]/g, '').trim() === label);
    th?.click();
    return !!th;
  },
  sortState: () => {
    const th = document.querySelector('.th.sorted');
    return th ? { label: textOf(th).replace(/[▲▼]/g, '').trim(), dir: th.getAttribute('aria-sort') } : null;
  },

  select: (name) => {
    const row = [...document.querySelectorAll('.tr')].find((r) => textOf(r.querySelector('.name')).split(' ')[0] === name);
    row?.click();
    return !!row;
  },
  selected: () => textOf(document.querySelector('.tr.sel .name')).split(' ')[0],

  issueText: () => textOf(document.querySelector('.issue')),
  hasIssue: () => !!document.querySelector('.issue'),
  fixLabel: () => textOf(document.querySelector('.issue button')),
  applyFix: () => { document.querySelector('.issue button')?.click(); },
  warnings: () => [...document.querySelectorAll('.warn')].map(textOf),

  settingLabels: () => [...document.querySelectorAll('.setbox .r > label')].map(textOf),
  setText: (labelText, value) => {
    const row = [...document.querySelectorAll('.setbox .r')].find((r) => textOf(r.querySelector('label')) === labelText);
    const input = row?.querySelector('input');
    if (!input) return false;
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  },
  toggleRow: (name) => {
    const row = [...document.querySelectorAll('.tr')].find((r) => textOf(r.querySelector('.name')).split(' ')[0] === name);
    row?.querySelector('.dot')?.click();
    return !!row;
  },

  entry: (kind, name) => {
    const map = { input: 'inputs', output: 'outputs', property: 'editableProperties' }[kind];
    const e = live()[map]?.[name];
    return e ? { channel: e.channel ?? null, variable: e.variable ?? null, path: e.path ?? null, label: e.label, enabled: e.enabled !== false } : null;
  },

  sliderCount: () => document.querySelectorAll('input[type=range], .slider, [role=slider]').length,
};
