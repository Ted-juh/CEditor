/**
 * Create Component from Selection on a REAL panel. The hand-made panel in fromSelection.entry.js
 * covers every kind of artwork; this covers what panels actually contain. It loads a QA sheet,
 * selects every label the command will accept — letting the command's own refusals, including the
 * paint-order one, trim the selection — runs the real command, and draws the panel before and after
 * with the editor's renderer for fromSelectionQa.mjs to compare.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import PanelShotHarness from './PanelShotHarness.svelte';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { activeControlSet } from '../src/CE_Application/stores/controlSets.js';
import { customComponentLibrary } from '../src/CE_Application/stores/customComponentLibrary.js';
import { planComponentFromSelection } from '../src/CE_Application/utils/customComponentFromControls.js';
import { createComponentFromSelection, measureLabelText } from '../src/CE_Application/stores/componentFromSelectionActions.js';

window.__JUCE__ = undefined;
window.__qa = {
  async run(file) {
    const panel = deserializePanel(await (await fetch(`/qa/${file}`)).text(), file, 'qa');
    panel.id = 'qa';
    customComponentLibrary.clear();
    panels.set([panel]);
    activePanelId.set('qa');

    const rectOf = (c) => c._children.Transform;
    const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    let ids = panel.controls.filter((c) => c._children.Core.controlType === 'Label').map((c) => c._children.Core.id);
    const offered = ids.length;
    const reasons = {};
    for (let round = 0; round < 50 && ids.length; round += 1) {
      const plan = planComponentFromSelection(panel, ids, { set: get(activeControlSet), name: 'QA', measure: measureLabelText });
      if (plan.ok) break;
      const drop = new Set();
      for (const entry of plan.refused) {
        const key = entry.reason.split(' — ')[0].replace(/"[^"]*"/g, '"…"').replace(/line \d+/, 'line N');
        reasons[key] = (reasons[key] ?? 0) + 1;
        if (ids.includes(entry.id)) drop.add(entry.id);
        else {
          // Sandwiched: drop the selected labels it overlaps.
          const other = panel.controls.find((c) => c._children.Core.id === entry.id);
          for (const id of ids) {
            const mine = panel.controls.find((c) => c._children.Core.id === id);
            if (other && overlaps(rectOf(mine), rectOf(other))) drop.add(id);
          }
        }
      }
      ids = ids.filter((id) => !drop.has(id));
    }

    mount(PanelShotHarness, { target: document.getElementById('before'), props: { panel: JSON.parse(JSON.stringify(panel)) } });
    selectedComponentIds.set(new Set(ids));
    const result = ids.length ? createComponentFromSelection('QA') : { ok: false };
    const after = get(panels)[0];
    mount(PanelShotHarness, { target: document.getElementById('after'), props: { panel: after } });
    return {
      offered, converted: ids.length, ok: result.ok, reasons,
      width: panel.width, height: panel.height,
      before: panel.controls.length, after: after.controls.length,
    };
  },
};
