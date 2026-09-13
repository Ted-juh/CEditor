// Full editor, with observation/loading hooks only. User actions are driven through its UI.
import { mount } from 'svelte';
import { get } from 'svelte/store';
import App from '../src/App.svelte';
import '../src/assets/fonts/webFonts.css';
import * as panelStore from '../src/CE_Application/stores/panels.js';
import { createPanel, serializePanel, deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { INSERT_CATEGORIES } from '../src/CE_Application/models/insertCatalog.js';
import { flushHistory } from '../src/CE_Application/stores/history.js';
import { panelPreviewSessions } from '../src/CE_Application/stores/interactionPreview.js';
import { noteOutputEvents } from '../src/CE_Application/stores/noteOutput.js';

window.__JUCE__ = undefined;
mount(App, { target: document.getElementById('app') });
window.__acceptance = {
  catalog: INSERT_CATEGORIES,
  panel: () => get(panelStore.activePanel),
  panels: () => get(panelStore.panels),
  selection: () => [...get(panelStore.selectedComponentIds)],
  previewSession: id => get(panelPreviewSessions)[id],
  noteOutput: () => get(noteOutputEvents),
  snapshot: () => serializePanel(get(panelStore.activePanel)),
  flush: flushHistory,
  load(text) {
    const panel = deserializePanel(text, 'Acceptance.cepanel');
    panelStore.addPanel(panel);
    return panel.id;
  },
  blank() {
    const panel = createPanel('Editor acceptance laboratory');
    panel.width = 1400; panel.height = 3200;
    panelStore.addPanel(panel);
    return panel.id;
  },
};
