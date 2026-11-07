// buildPanel.js — S3's placement plan (reconstruct.js) made into a CEditor panel.
//
// Shared by File → New Panel from Ctrlr Panel... (stores/ctrlrImportActions.js) and the command line
// (tools/scripts/ctrlr-import.mjs), so the two cannot make different panels from one file. Kept out
// of reconstruct.js on purpose: that module is a pure translation of the source document, testable
// without the editor's component model; this one stands the model up.

import { createControl } from '../models/componentTypes.js';
import { createPanel } from '../stores/panelModel.js';

/**
 * A panel `{ name, width, height }` with the plan's controls, bound to the harvested profile
 * `profileId` where the plan says so. Nothing in it is guessed: every control is the plan's entry,
 * named and described as imported, with its rectangle, opacity, background colour, list rows and
 * binding — and nothing else.
 */
export function buildCtrlrPanel(plan, { name, width, height, profileId }) {
  const panel = createPanel(name);
  panel.width = Math.max(320, width || 0);
  panel.height = Math.max(240, height || 0);
  panel.requiredProfiles = profileId ? [{ role: 'primary', profileId, version: '*' }] : [];

  panel.controls = plan.placed.map((entry, index) => {
    const id = `ctrlr_${index}_${(entry.name || entry.type).replace(/\W+/g, '_').toLowerCase()}`;
    const overrides = {
      Core: { id, name: id, description: `${entry.name} — imported (${entry.reason})` },
      Transform: {
        x: entry.rect.x, y: entry.rect.y, width: entry.rect.width, height: entry.rect.height,
        opacity: Number.isFinite(entry.alpha) ? entry.alpha : 1,
      },
    };
    if (entry.colours.background) {
      overrides.Background = { _children: { Fill: { colour: entry.colours.background } } };
    }
    if (entry.parameterId && entry.profileId) {
      overrides.DeviceBindings = {
        bindings: [{
          kind: 'deviceParameter',
          port: entry.type === 'ToggleButton' ? 'state' : (entry.type === 'Combobox' ? 'selectedChoice' : 'value'),
          deviceRole: entry.deviceRole,
          parameterId: entry.parameterId,
          adoptMetadata: true,
          dryRun: false,
          feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
        }],
      };
    }
    const control = createControl(entry.type, overrides);
    if (entry.items.length && control._children.Value) {
      control._children.Value.rows = entry.items.map((label, row) => ({
        id: `row_${row}`, displayText: label, internalValue: label,
        sendValue: row, receiveValue: row, selectedByDefault: row === 0, enabled: true, visualOverrides: {},
      }));
    }
    if (entry.type === 'Label' && control._children.Text) control._children.Text.content = entry.name;
    return control;
  });

  return panel;
}
