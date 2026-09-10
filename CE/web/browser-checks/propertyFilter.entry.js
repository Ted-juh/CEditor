/**
 * The properties panel's search, in a real browser.
 *
 * One bare section editor and nothing else, because that is all it takes: setting the filter to a
 * PARTIAL match — "x", "gl", "t", "to", every keystroke on the way to a real query — used to blow
 * up with `effect_update_depth_exceeded` and freeze the panel. A cell reported its visibility into
 * the section's `$state` counter, that re-ran the section, which re-ran the cells, which reported
 * again. Nothing on the page but a ToggleButton's Behavior section, so this is not about any one
 * editor.
 *
 * The check also pins what the counter is FOR: a section with no matching row hides its header.
 */
import { mount } from 'svelte';
import BehaviorEditor from '../src/CE_Application/sections/BehaviorEditor.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { propertyFilter } from '../src/CE_Application/stores/propertyFilter.js';
const c = createControl('ToggleButton');
c._children.Core.id = 'ctrl_f';
panels.set([{ id: 'p1', name: 'F', width: 800, height: 400, bgColour: 'FF1E1E1E', controls: [c] }]);
activePanelId.set('p1');
selectedComponentIds.set(new Set(['ctrl_f']));
mount(BehaviorEditor, { target: document.getElementById('host'), props: { control: c } });
const textOf = (n) => n?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
window.__f = {
  search: (v) => propertyFilter.set(v),
  cells: () => document.querySelectorAll('.property-cell').length,
  shownCells: () => document.querySelectorAll('.property-cell:not(.filtered-out)').length,
  sections: () => [...document.querySelectorAll('.property-section')].map((el) => ({
    title: textOf(el.querySelector('.property-section-title')),
    hidden: el.classList.contains('filtered-hidden'),
  })),
  labels: () => [...document.querySelectorAll('.property-cell')].map((el) => textOf(el.querySelector('.property-label, label'))),
};
