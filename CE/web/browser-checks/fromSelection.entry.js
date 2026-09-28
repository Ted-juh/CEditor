/**
 * Create Component from Selection, proved in pixels.
 *
 * The command REPLACES the selection, so the only acceptable result is a copy that looks exactly like
 * what was selected. This builds a panel of varied artwork, draws it with the editor's own renderer
 * (PanelShotHarness → CanvasControl), runs the real command, draws the result the same way, and hands
 * both to browser-checks/fromSelection.mjs to compare pixel by pixel.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import PanelShotHarness from './PanelShotHarness.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { customComponentLibrary } from '../src/CE_Application/stores/customComponentLibrary.js';
import { createComponentFromSelection } from '../src/CE_Application/stores/componentFromSelectionActions.js';

const checker = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="10" height="10" fill="#e0443a"/><rect x="10" y="10" width="10" height="10" fill="#3a8be0"/></svg>')}`;
const at = (type, id, x, y, width, height, extra = {}) => createControl(type, {
  ...extra,
  Core: { id, name: id, ...(extra.Core ?? {}) },
  Transform: { x, y, width, height, ...(extra.Transform ?? {}) },
});

const controls = [
  at('Background', 'plate', 20, 20, 360, 170, { Background: { _children: { Corners: { radius: 10 } } } }),
  at('Label', 'cutoffLegend', 40, 34, 120, 24, { Text: { content: 'CUTOFF' } }),
  at('Label', 'resLegend', 40, 64, 140, 24, {
    Text: { content: 'resonance', _children: { Fill: { colour: 'FFE0443A' }, Font: { size: 15, weightValue: 700, weight: 'Bold', caseMode: 'uppercase' } } },
    Background: { _children: { Fill: { solidEnabled: false }, Border: { enabled: false } } },
  }),
  at('Shape', 'star', 200, 34, 60, 60, { Shape: { kind: 'star', fillColour: 'FFF0C040', strokeColour: 'FF20242A', strokeWidth: 2 } }),
  at('Shape', 'ring', 280, 34, 80, 50, { Shape: { kind: 'ellipse', fillEnabled: false, strokeColour: 'FF9FC8E4', strokeWidth: 3, strokeStyle: 'dashed' } }),
  at('Shape', 'rule', 40, 110, 140, 20, { Shape: { kind: 'line', strokeColour: 'FFD8E2EA', strokeWidth: 2 } }),
  at('Image', 'logo', 200, 110, 60, 50, { Background: { _children: { Fill: { imageSrc: checker, imageFit: 'fill' } } } }),
  at('Shape', 'tilted', 285, 115, 60, 40, { Transform: { rotation: 20, opacity: 0.7 }, Shape: { kind: 'rectangle', fillColour: 'FF5B9BD5', cornerRadius: 6, strokeEnabled: false } }),
];

const panel = { id: 'p1', name: 'Check', width: 400, height: 210, bgColour: 'FF1E1E1E', controls, scripts: [] };
customComponentLibrary.clear();
panels.set([panel]);
activePanelId.set('p1');

const before = JSON.parse(JSON.stringify(panel));
mount(PanelShotHarness, { target: document.getElementById('before'), props: { panel: before } });

selectedComponentIds.set(new Set(controls.map((c) => c._children.Core.id)));
const result = createComponentFromSelection('Plate');
const after = get(panels)[0];
mount(PanelShotHarness, { target: document.getElementById('after'), props: { panel: after } });

window.__fromSelection = {
  ok: result.ok,
  refused: result.refused ?? [],
  afterControls: after.controls.map((c) => `${c._children.Core.controlType}:${c._children.Core.name}`),
  parts: Object.keys(after.controls[0]?._children?.Parts?._children ?? {}),
  library: (get(customComponentLibrary) ?? []).map((entry) => `${entry.name}@${entry.version}`),
  linked: !!after.controls[0]?._children?.Designer?.sourcePackage,
  selected: [...get(selectedComponentIds)],
};
