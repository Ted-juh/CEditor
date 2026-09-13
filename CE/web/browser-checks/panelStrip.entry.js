/**
 * What is left of a properties section after its tab took the rows.
 *
 * One Label with every text effect switched on, so the section is measured at the height it reaches
 * in use rather than at rest. The Effects section was the single tallest in the application; this is
 * what it costs now.
 */
import { mount } from 'svelte';
import TextEditor from '../src/CE_Application/sections/TextEditor.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { setCollapsed } from '../src/CE_Application/stores/sectionCollapse.js';

const c = createControl('Label');
c._children.Core.id = 'ctrl_m';
// Every text effect on, so the section is at the height it reaches in use rather than at rest.
// The editor reads `text._children.Effects`, not `text.Effects` — the section is a node.
c._children.Text._children = c._children.Text._children ?? {};
c._children.Text._children.Effects = {
  ...(c._children.Text._children.Effects ?? {}),
  _type: 'Effects',
  outlineEnabled: true, stroke2Enabled: true, shadowEnabled: true, glowEnabled: true,
  innerGlowEnabled: true, innerShadowEnabled: true, bevelEnabled: true, blurEnabled: true,
  motionEnabled: true, reflectionEnabled: true, knockout: true,
};
panels.set([{ id: 'p1', name: 'M', width: 800, height: 400, bgColour: 'FF1E1E1E', controls: [c] }]);
activePanelId.set('p1');
selectedComponentIds.set(new Set(['ctrl_m']));

mount(TextEditor, { target: document.getElementById('host'), props: { control: c } });

const sectionEl = (title) => [...document.querySelectorAll('.property-section')]
  .find((el) => el.querySelector('.property-section-title')?.textContent?.trim() === title);

window.__m = {
  open: (title) => {
    const el = sectionEl(title);
    const btn = el?.querySelector('.header-toggle');
    if (btn && btn.getAttribute('aria-expanded') === 'false') btn.click();
    return !!el;
  },
  height: (title) => Math.round(sectionEl(title)?.getBoundingClientRect().height ?? 0),
  cells: (title) => sectionEl(title)?.querySelectorAll('.property-cell').length ?? 0,
  titles: () => [...document.querySelectorAll('.property-section-title')].map((n) => n.textContent.trim()),
  labels: (title) => [...(sectionEl(title)?.querySelectorAll('.property-cell') ?? [])]
    .map((el) => el.querySelector('.property-label')?.textContent?.trim() ?? ''),
  toggles: (title) => [...(sectionEl(title)?.querySelectorAll('.style-btn') ?? [])].map((b) => b.textContent.trim()),
  activeToggles: (title) => [...(sectionEl(title)?.querySelectorAll('.style-btn.active') ?? [])].map((b) => b.textContent.trim()),
  opener: (title) => sectionEl(title)?.querySelector('.open-in-dock')?.dataset?.open ?? '',
  note: (title) => sectionEl(title)?.querySelector('.effects-moved')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
};
