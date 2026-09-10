/**
 * The properties panel → dock tab handoff, in a real browser.
 *
 * The properties panel is on the left and the real DisplayPanel dock on the right, so this drives
 * the whole route: click the button in a section header, and the dock has to switch to that tab AND
 * the tab has to arrive already pointed at the control the button was in.
 *
 * Both halves matter and the check asserts both. Arming a target without requesting the tab lands
 * the user on whatever tab they left open, which looks like nothing happened —
 * `CustomDesignSurfaceEditor.svelte` recorded that for its own dock and it is the same here.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import DisplayPanel from '../src/CE_Application/panels/DisplayPanel.svelte';
import OpenersHarness from './OpenersHarness.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createCustomComponentPartsDefaults } from '../src/CE_Application/utils/customComponentFactory.js';
import { editorTarget, clearEditorTarget } from '../src/CE_Application/stores/editorTarget.js';
import { displayTabRequest } from '../src/CE_Application/stores/displayTab.js';
import { propertyFilter, clearPropertyFilter } from '../src/CE_Application/stores/propertyFilter.js';

const IDS = { custom: 'ctrl_custom', seq: 'ctrl_seq', label: 'ctrl_label' };

const custom = createControl('CustomComponent');
custom._children.Core.id = IDS.custom;
custom._children.Core.name = 'Big Knob';
custom._children.Parts = createCustomComponentPartsDefaults();
custom._children.Animations = {
  _type: 'Animations', enabled: true, debug: false,
  _children: {
    pressMotion: {
      _type: 'Animation', name: 'pressMotion', enabled: true, kind: 'transition',
      trigger: { type: 'stateChange', from: ['*'], to: ['pressed'] },
      duration: 90, delay: 0, easing: 'outQuad',
      targets: [{ path: 'Transform.scale', properties: ['transform'] }],
    },
  },
};

const seq = createControl('StepSequencer');
seq._children.Core.id = IDS.seq;
seq._children.Core.name = 'Big Drums';

const label = createControl('Label');
label._children.Core.id = IDS.label;
label._children.Core.name = 'The Label';

panels.set([{ id: 'p1', name: 'Check', width: 900, height: 400, bgColour: 'FF1E1E1E', controls: [custom, seq, label] }]);
activePanelId.set('p1');
selectedComponentIds.set(new Set([IDS.custom]));

// The dock, exactly as the app mounts it.
mount(DisplayPanel, { target: document.getElementById('dock') });

// The panel side: the four section editors that carry an opener, in ONE tree — the way the
// properties panel renders them. Four separate mount() roots is not how the app works and is not
// what this is checking.
const panelHost = document.getElementById('panel');
mount(OpenersHarness, { target: panelHost, props: { custom, seq, label } });

const textOf = (node) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** Every opener button in the panel, with the section header it sits in. */
function openers() {
  return [...panelHost.querySelectorAll('.open-in-dock')].map((button) => ({
    button,
    title: button.getAttribute('title') ?? '',
    section: textOf(button.closest('[class*="section"], section, div')?.querySelector('span, h3, h4')) || '',
  }));
}

window.__ho = {
  count: () => panelHost.querySelectorAll('.open-in-dock').length,
  titles: () => openers().map((o) => o.title),
  clickByTitle: (needle) => {
    const found = openers().find((o) => o.title.includes(needle));
    found?.button.click();
    return !!found;
  },
  /** Does clicking it also collapse the section it lives in? It must not. */
  sectionsOpenAfterClick: () => panelHost.querySelectorAll('.property-section, section').length,

  target: () => {
    const t = get(editorTarget);
    return t ? `${t.kind}:${t.controlId}:${t.domain ?? '-'}` : '';
  },
  pendingRequest: () => JSON.stringify(get(displayTabRequest)),
  clearTarget: () => clearEditorTarget(),

  // --- the dock side ---------------------------------------------------------------------
  activeTab: () => textOf(document.querySelector('#dock .studio-tab.active')),
  dockHeading: () => textOf(document.querySelector('#dock .who')),
  dockPaneText: () => (textOf(document.querySelector('#dock .tab-pane')) ?? '').slice(0, 260),
  dockHasPane: () => !!document.querySelector('#dock .tab-pane'),
  clickDockTab: (label) => {
    const btn = [...document.querySelectorAll('#dock .studio-tab')].find((b) => textOf(b) === label);
    btn?.click();
    return !!btn;
  },

  // --- the search index ------------------------------------------------------------------
  search: (value) => propertyFilter.set(value),
  clearSearch: () => clearPropertyFilter(),
  hitRows: () => [...document.querySelectorAll('.dh-row')].map((row) => textOf(row.querySelector('.dh-what'))),
  hitTabs: () => [...document.querySelectorAll('.dh-row .open-in-dock')].map((b) => (b.dataset.open ?? '').split(':')[0]),
  clickHit: (tab) => {
    const btn = [...document.querySelectorAll('.dh-row .open-in-dock')].find((b) => (b.dataset.open ?? '').startsWith(`${tab}:`));
    btn?.click();
    return !!btn;
  },
};
