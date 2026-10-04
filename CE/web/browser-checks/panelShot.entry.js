import { mount } from 'svelte';
import PanelShotHarness from './PanelShotHarness.svelte';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { scrubKeyframes, clearKeyframeScrub } from '../src/CE_Application/utils/keyframePlayer.js';
import { keyframeOverlays } from '../src/CE_Application/stores/keyframeOverlays.js';
import { get } from 'svelte/store';

window.__JUCE__ = undefined;
window.__panelShot = {
  /** Pose a control at one time of one of its keyframes animations, as the Animation tab's playhead does. */
  scrub(controlId, name, time) {
    const control = window.__panel?.controls?.find((c) => c?._children?.Core?.id === controlId);
    const animation = control?._children?.Animations?._children?.[name];
    if (animation) scrubKeyframes(controlId, name, animation, time);
    return !!animation;
  },
  clearScrub(controlId) { clearKeyframeScrub(controlId); },
  overlay(controlId) { return get(keyframeOverlays)[controlId] ?? null; },
  partStyle(controlId, partName) {
    const el = document.querySelector(`[data-part-name="${partName}"], .interactive-part[data-part="${partName}"]`);
    return el ? el.getAttribute('style') : (document.querySelector('.interactive-part')?.getAttribute('style') ?? null);
  },
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
