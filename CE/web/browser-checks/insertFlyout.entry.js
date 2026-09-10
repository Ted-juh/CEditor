/**
 * The icon rail's category flyouts, in a real browser.
 *
 * What can only be checked here is the hover behaviour: that a group opens on hover, that the
 * pointer can cross from the button into the panel without it closing under the cursor, that
 * travelling down the rail does not flash five menus, and that clicking an item inserts a control.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import IconPanel from '../src/CE_Application/layout/IconPanel.svelte';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { INSERT_CATEGORIES } from '../src/CE_Application/models/insertCatalog.js';

panels.set([{ id: 'p1', name: 'Check', width: 900, height: 400, bgColour: 'FF1E1E1E', controls: [] }]);
activePanelId.set('p1');

mount(IconPanel, { target: document.getElementById('host') });

const textOf = (node) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const catButtons = () => [...document.querySelectorAll('.category-btn')];

function pointer(element, type) {
  const box = element.getBoundingClientRect();
  element.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1,
    clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
  }));
}

window.__fly = {
  categoryCount: () => catButtons().length,
  categoryTitles: () => catButtons().map((b) => b.getAttribute('title') ?? ''),
  catalogGroups: () => INSERT_CATEGORIES.map((c) => `${c.label}|${c.items.length}`),

  hover: (index) => { const b = catButtons()[index]; if (!b) return false; pointer(b, 'pointerenter'); return true; },
  unhover: (index) => { const b = catButtons()[index]; if (!b) return false; pointer(b, 'pointerleave'); return true; },
  enterFlyout: () => { const f = document.querySelector('.insert-flyout'); if (!f) return false; pointer(f, 'pointerenter'); return true; },
  leaveFlyout: () => { const f = document.querySelector('.insert-flyout'); if (!f) return false; pointer(f, 'pointerleave'); return true; },

  open: () => textOf(document.querySelector('.insert-flyout .fly-head span')),
  openCount: () => document.querySelectorAll('.insert-flyout').length,
  items: () => [...document.querySelectorAll('.insert-flyout .fly-item span')].map(textOf),
  itemsDisabled: () => [...document.querySelectorAll('.insert-flyout .fly-item')].every((b) => b.disabled),
  activeButtons: () => catButtons().filter((b) => b.classList.contains('active')).length,
  flyoutLeft: () => Math.round(document.querySelector('.insert-flyout')?.getBoundingClientRect().left ?? -1),
  railWidth: () => Math.round(document.querySelector('.icon-panel')?.getBoundingClientRect().width ?? -1),

  clickItem: (label) => {
    const btn = [...document.querySelectorAll('.insert-flyout .fly-item')].find((b) => textOf(b) === label);
    btn?.click();
    return !!btn;
  },
  dragPayload: (label) => {
    const btn = [...document.querySelectorAll('.insert-flyout .fly-item')].find((b) => textOf(b) === label);
    if (!btn) return null;
    let captured = null;
    const dt = { effectAllowed: '', setData: (type, value) => { captured = { type, value }; } };
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dt });
    btn.dispatchEvent(event);
    return captured;
  },

  // The + drawer has to survive alongside them.
  plusButton: () => !!document.querySelector('.insert-btn'),
  clickPlus: () => { document.querySelector('.insert-btn')?.click(); },
  drawerOpen: () => !!document.querySelector('.insert-panel'),
  drawerHasSearch: () => !!document.querySelector('.insert-panel .search-row input'),

  controls: () => get(panels)[0].controls.map((c) => c._children.Core.controlType),
  clearPanel: () => panels.update((list) => [{ ...list[0], controls: [] }]),
  // An empty panel list, not an empty id: `activePanel` resolves a selection and falls back to the
  // first panel, so clearing the id alone leaves one open.
  noPanel: () => panels.set([]),
  restorePanel: () => {
    panels.set([{ id: 'p1', name: 'Check', width: 900, height: 400, bgColour: 'FF1E1E1E', controls: [] }]);
    activePanelId.set('p1');
  },
};
