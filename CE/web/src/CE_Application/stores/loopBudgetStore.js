/**
 * loopBudgetStore.js — the open panel's loops against the budget (utils/loopBudget.js), for the three
 * places that say so: the status bar, the Animation tab's chips and the Export tab. Each one's click
 * goes to the next thing that loops, one at a time, with the Animation tab open on it.
 */
import { derived, get } from 'svelte/store';
import { activePanel } from './panels.js';
import { activateEditorTargetOnPanel } from './editorTarget.js';
import { displayTabRequest } from './displayTab.js';
import { panelLoops, loopLines } from '../utils/loopBudget.js';

/** `{ count, over, budget, items }` for the open panel. */
export const panelLoopSummary = derived(activePanel, ($panel) => panelLoops($panel?.controls ?? []));

/** The tooltip every place shows: what loops, one a line. */
export const panelLoopLines = derived(panelLoopSummary, ($summary) => loopLines($summary.items));

let cursor = 0;

/** Select the next looping control and open the Animation tab on it (on the loop, where it is one). */
export function showNextLoop() {
  const { items } = get(panelLoopSummary);
  const panel = get(activePanel);
  if (!items.length || !panel) return null;
  const item = items[cursor % items.length];
  cursor += 1;
  activateEditorTargetOnPanel(panel.id, 'animation', item.controlId, { focus: item.animation ?? null });
  displayTabRequest.set({ tab: 'animation' });
  return item;
}
