import { mount } from 'svelte';
import PanelShotHarness from './PanelShotHarness.svelte';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';

window.__JUCE__ = undefined;
window.__panelShot = {
  async load(url) {
    // Through deserializePanel, not raw JSON. A serialized panel has every default-valued field
    // elided, so a Combobox arrives without the Behavior.buttonType that MAKES it a Combobox and
    // renders as nothing at all. Feeding the file straight to the renderer is a harness that lies.
    const panel = deserializePanel(await (await fetch(url)).text(), 'shot.cepanel', 'shot');
    window.__panel = panel;
    mount(PanelShotHarness, { target: document.getElementById('host'), props: { panel } });
    return { width: panel.width, height: panel.height, controls: panel.controls.length };
  },
};
