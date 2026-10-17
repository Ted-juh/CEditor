// panelFileActions.js — the panel file view's Apply: an edited item written into its panel, as one
// undo step in that panel's history.
//
// The text and its checks are panelFileText.js; this is only the write. It addresses the panel by id
// rather than through resolvedActivePanelId, because the view lives on a script tab, where no panel
// is the active one (stores/panels.js says why), and records the step with history.recordEdit for
// the same reason: written through the store alone, the edit would be absorbed into the panel's
// baseline when it next became active, with nothing to undo.

import { get } from 'svelte/store';
import { panels } from './panels.js';
import { recordEdit } from './history.js';
import { applyPanelUpdates } from './panelDocumentHelpers.js';
import { findControlById, mapControlsTree } from '../utils/containment.js';
import { applyControlFileText, applyPanelSettingsFileText } from './panelFileText.js';

const missing = (message) => ({ ok: false, changed: false, errors: [{ message }], warnings: [] });

/** Apply an edited control text (panelFileText.applyControlFileText says what it returns). */
export function applyControlFileEdit(panelId, controlId, text) {
  const panel = get(panels).find((p) => p.id === panelId);
  if (!panel) return missing('That panel is no longer open.');
  const control = findControlById(panel.controls, controlId);
  if (!control) return missing('That control is no longer in the panel.');

  const result = applyControlFileText(text, control, { panelControls: panel.controls });
  if (!result.ok || !result.changed) return result;
  const name = result.control._children?.Core?.name || controlId;
  recordEdit({ kind: 'panel', id: panelId }, () => {
    panels.update((list) => list.map((p) => {
      if (p.id !== panelId) return p;
      // By id at any depth; the replacement keeps its children, the same objects (panelFileText).
      const controls = mapControlsTree(p.controls, (c) => (c?._children?.Core?.id === controlId ? result.control : c));
      return controls === p.controls ? p : { ...p, controls, modified: true };
    }));
  }, { label: `Edit ${name} as text` });
  return result;
}

/** Apply edited panel settings (panelFileText.applyPanelSettingsFileText says what it returns). */
export function applyPanelSettingsFileEdit(panelId, text) {
  const panel = get(panels).find((p) => p.id === panelId);
  if (!panel) return missing('That panel is no longer open.');

  const result = applyPanelSettingsFileText(text, panel);
  if (!result.ok || !result.changed) return result;
  recordEdit({ kind: 'panel', id: panelId }, () => {
    panels.update((list) => list.map((p) => (p.id === panelId ? applyPanelUpdates(p, result.updates) : p)));
  }, { label: 'Edit panel settings as text' });
  return result;
}
