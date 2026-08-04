// Preset choice sync: keeps preset-sourced selectors fed with rows, and fires the real recall on
// commit. The row DATA comes from utils/presetChoiceRows (pure); this store decides when to build
// and where to put it — `Listbox._presetRows` on the active panel's controls, patched through the
// controls store so the renderer, hit-test and export all see the same rows. The Player (which owns
// its panel wholesale) uses injectPresetRowsIntoPanel directly instead.
import { get } from 'svelte/store';
import { deviceRoleMappings, profileSources, latestPresetListScan } from './deviceProfileStores.js';
import { requestProfileSource } from './deviceProfiles.js';
import { activePanel } from './panels.js';
import { applyControlPatchesById } from './controls.js';
import { flatControls } from '../utils/containment.js';
import { buildPresetChoiceRows, presetRowSlot } from '../utils/presetChoiceRows.js';
import { recallPreset } from './presetLibrarian.js';
import { DEFAULT_DEVICE_ROLE } from './deviceConstants.js';

// The parsed profile mapped to a device role, when its source has arrived. Missing source →
// request it from the engine and return null; the profileSources subscription re-syncs on arrival.
export function presetProfileForRole(role = DEFAULT_DEVICE_ROLE) {
  const profileId = String(get(deviceRoleMappings)?.[role]?.profileId ?? '');
  if (!profileId) return null;
  const source = get(profileSources)?.[profileId]?.source;
  if (!source) {
    requestProfileSource(profileId);
    return null;
  }
  try {
    const profile = JSON.parse(source);
    return profile && typeof profile === 'object' ? profile : null;
  } catch {
    return null;
  }
}

function presetSourcedListboxes(panel) {
  return flatControls(panel?.controls ?? []).filter((control) => {
    const source = String(control?._children?.Listbox?.choiceSource ?? '');
    return source === 'devicePresets' || source === 'factoryCatalog';
  });
}

// Rebuild `Listbox._presetRows` for every preset-sourced Listbox on the active panel. Patches only
// controls whose rows actually changed, so scan-progress churn doesn't spam the model/undo.
export function syncPresetChoiceRows({ role = DEFAULT_DEVICE_ROLE } = {}) {
  const panel = get(activePanel);
  const targets = presetSourcedListboxes(panel);
  if (!targets.length) return { updated: 0, targets: 0 };
  const profile = presetProfileForRole(role);
  if (!profile?.presets) return { updated: 0, targets: targets.length };

  const scan = get(latestPresetListScan);
  const patches = new Map();
  for (const control of targets) {
    const listbox = control._children.Listbox;
    const rows = buildPresetChoiceRows(profile, { source: String(listbox.choiceSource), scan });
    if (!rows.length) continue;
    const current = Array.isArray(listbox._presetRows) ? listbox._presetRows : [];
    if (JSON.stringify(current) === JSON.stringify(rows)) continue;
    const controlId = control?._children?.Core?.id;
    if (controlId != null) patches.set(controlId, { 'Listbox._presetRows': rows });
  }
  if (patches.size) applyControlPatchesById(patches);
  return { updated: patches.size, targets: targets.length };
}

// The commit-side effect behind `recallOnSelect`: resolve the row's device slot and send the
// profile's recall action. Rows without a slot (authored rows, headers) are a no-op — the toggle
// only recalls when the rows actually are presets.
export function recallRowSlot(row, { role = DEFAULT_DEVICE_ROLE } = {}) {
  const slot = presetRowSlot(row);
  if (slot == null) return { ok: false, error: 'Row carries no preset slot.', skipped: true };
  const profile = presetProfileForRole(role);
  if (!profile?.presets?.recall) return { ok: false, error: 'No preset recall action on the active profile.', skipped: true };
  return recallPreset(profile, { slot, deviceRole: role });
}

// Materialize preset rows INTO Value.rows (the Combobox path — and any selector that wants a
// stable snapshot): unlike the Listbox's live `_presetRows` swap, written rows work everywhere by
// construction (dropdown, export parameters, cascading, automation) and ship with the panel.
export function materializePresetRows(controlId, source = 'devicePresets', { role = DEFAULT_DEVICE_ROLE } = {}) {
  if (controlId == null) return { ok: false, error: 'No control selected.', rows: 0 };
  const profile = presetProfileForRole(role);
  if (!profile?.presets) return { ok: false, error: 'The active device profile has no preset model.', rows: 0 };
  const rows = buildPresetChoiceRows(profile, { source, scan: get(latestPresetListScan) });
  if (!rows.length) return { ok: false, error: source === 'factoryCatalog' ? 'The profile ships no factory catalog.' : 'No preset slots known yet — run a scan or add a slot map.', rows: 0 };
  applyControlPatchesById(new Map([[controlId, { 'Value.rows': rows }]]));
  return { ok: true, error: '', rows: rows.length };
}

// Auto-resync: scan results and (late-arriving) profile sources both refresh the rows. Idempotent.
let initialized = false;
export function initPresetChoiceSync() {
  if (initialized) return;
  initialized = true;
  latestPresetListScan.subscribe((scan) => {
    if (!scan || scan.running) return;
    if (!(scan.entries ?? []).some((entry) => String(entry?.name ?? '').trim())) return;
    syncPresetChoiceRows({ role: scan.deviceRole || DEFAULT_DEVICE_ROLE });
  });
  profileSources.subscribe(() => {
    syncPresetChoiceRows({});
  });
}
