/**
 * The dock's Access tool, measuring (browser-checks/accessCheck.mjs).
 *
 * A panel with text of known contrast, drawn by the editor's own surface: grey on a light plate
 * (too faint), black on white (fine), large pale text that passes only because it is large, and a
 * label over the panel's own colour. The tool's measuring (stores/accessibilityCheckRun.js) runs on
 * it as it runs on the canvas.
 */
import { mount, tick } from 'svelte';
import '../src/assets/fonts/panelFonts.css';
import PanelSurface from '../src/CE_Application/editor/PanelSurface.svelte';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { buildSolidStyle, buildGradientStyle } from '../src/CE_Application/utils/backgroundCSS.js';
import { pictureSurface } from '../src/CE_Application/stores/pictureExport.js';
import { measureTextContrast } from '../src/CE_Application/stores/accessibilityCheckRun.js';

window.__JUCE__ = undefined;

const label = (id, x, y, width, height, words, text, plate, size = 14, weight = 400) => createControl('Label', {
  Core: { id, name: id },
  Transform: { x, y, width, height },
  Text: { content: words, _children: { Fill: { colour: text }, Font: { size, weightValue: weight } } },
  Background: plate
    ? { _children: { Fill: { solidEnabled: true, colour: plate }, Border: { enabled: false } } }
    : { _children: { Fill: { solidEnabled: false }, Border: { enabled: false } } },
});

const panel = createPanel('Access');
panel.width = 420;
panel.height = 240;
panel.bgColour = 'FF202020';
panel.controlSet = { id: 'graphite' };
panel.controlSets = [];
panel.controls = [
  label('faint', 20, 20, 180, 30, 'FILTER', 'FFB8B8B8', 'FFF0F0F0'),
  label('strong', 220, 20, 180, 30, 'AMP', 'FF000000', 'FFFFFFFF'),
  label('large', 20, 80, 380, 50, 'BIG TITLE', 'FF8A8A8A', 'FFFFFFFF', 28, 700),
  label('onPanel', 20, 160, 180, 30, 'dark on dark', 'FF3A3A3A', null),
];

window.__access = {
  async load() {
    panels.set([panel]);
    activePanelId.set(panel.id);
    mount(PanelSurface, {
      target: document.getElementById('host'),
      props: {
        panel, scale: 1, gridStyle: '', marquee: { isActive: false }, marqueeRect: { x: 0, y: 0, w: 0, h: 0 },
        bgLayers: { solid: buildSolidStyle(panel), gradient: buildGradientStyle(panel) },
      },
    });
    await tick();
    pictureSurface.set({ element: document.querySelector('.panel-surface'), panelId: panel.id });
    return true;
  },
  measure: () => measureTextContrast(),
};
