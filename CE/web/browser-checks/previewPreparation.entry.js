import { mount, unmount, tick } from 'svelte';
import SceneryGround from '../src/CE_Application/editor/SceneryGround.svelte';
import SceneryLayer from '../src/CE_Application/editor/SceneryLayer.svelte';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { buildSceneryRenderPlan } from '../src/CE_Application/utils/sceneryRenderPlan.js';
import { preparePreviewInBackground } from '../src/CE_Application/utils/previewPreparation.js';
import { sceneryMarkupStats, clearSceneryMarkupCache } from '../src/CE_Application/utils/sceneryMarkupCache.js';
import { bakeCacheStats, clearBakeCache } from '../src/CE_Application/utils/staticPartBaking.js';

let panel, original, apps = [];
const ground = () => buildSceneryRenderPlan(panel, { preview: true, fold: true }).items.filter(i => i.type === 'ground');
window.__preparation = {
  async load() {
    panel = deserializePanel(await (await fetch('/gaia-panel.json')).text(), 'gaia.cepanel', 'gaia');
    original = panel;
    return { groundCount: ground().reduce((n, i) => n + i.controls.length, 0) };
  },
  stats: () => ({ scenery: sceneryMarkupStats(), parts: bakeCacheStats() }),
  clear() { clearSceneryMarkupCache(); clearBakeCache(); },
  prepare() { return new Promise((resolve, reject) => preparePreviewInBackground(panel, { delay: 1, onComplete: resolve, onError: reject })); },
  async render(raw = false, dimensions = {}) {
    for (const app of apps) await unmount(app);
    apps = [];
    const target = document.getElementById('host');
    target.replaceChildren();
    for (const item of ground()) apps.push(mount(raw ? SceneryLayer : SceneryGround, { target, props: {
      controls: item.controls, allControls: panel.controls, panelControls: panel.controls,
      panelWidth: panel.width, panelHeight: panel.height, scale: 1, annotate: true, ...dimensions,
    } }));
    await tick();
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  },
  editCaption() {
    const control = ground().flatMap(i => i.controls).find(c => c._children.Core.controlType === 'Label');
    const edited = structuredClone(control);
    edited._children.Text.content = 'CACHE EDIT';
    panel = { ...panel, controls: panel.controls.map(c => c === control ? edited : c) };
    return control._children.Core.id;
  },
  editMidi() {
    panel = structuredClone(panel);
    for (const control of panel.controls) {
      for (const binding of control._children?.DeviceBindings?.bindings ?? []) binding.parameterId += '.changed';
    }
  },
  undo() { panel = original; },
};
