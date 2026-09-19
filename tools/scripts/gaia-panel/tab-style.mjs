import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';

export function applyGaiaTabStyle(panel) {
  for (const control of flatControls(panel.controls)) {
    const tabs = control._children.TabContainer;
    if (!tabs) continue;
    if (control._children.Core.name === 'bottom_pages') {
      const activeId = tabs.pages[tabs.pageIndex ?? 0]?.id;
      const order = ['status', 'banks', 'arpeggiator', 'system'];
      tabs.pages.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      tabs.pageIndex = Math.max(0, tabs.pages.findIndex(page => page.id === activeId));
    }
    Object.assign(tabs, {
      appearance: 'instrument', stripColour: 'FF14191D', tabColour: 'FF252D32',
      activeTabColour: 'FF39372B', labelColour: 'FFB8C3CA', activeLabelColour: 'FFFFE1A0',
      accentColour: 'FFE2A52C',
    });
  }
  return panel;
}
