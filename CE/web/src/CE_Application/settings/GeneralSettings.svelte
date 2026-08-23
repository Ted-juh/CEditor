<script>
  import { get } from 'svelte/store';
  import { generalSettings, updateGeneralSettings } from '../stores/appSettings.js';
  import { activeEditorTab } from '../stores/panels.js';
  import { registerGeneralSettingsHistory } from './generalSettingsHistory.js';
  import NumberCell from '../properties/NumberCell.svelte';
  import { normalizeManufacturerCode } from '../stores/runtimePreferences.js';

  let general = $derived($generalSettings);

  // Ctrl+Z did nothing whatsoever in the settings workspace, and every row here
  // is a one-click change that is applied and persisted the instant it is made.
  // The page is an undo context for as long as it is the section on screen —
  // why only this section, and why preferences get undo at all, is argued in
  // generalSettingsHistory.js.
  $effect(() => registerGeneralSettingsHistory({
    isActive: () => get(activeEditorTab)?.type === 'settings',
  }));

  function setBool(key, event) {
    updateGeneralSettings({ [key]: event.target.checked });
  }

  function setNumber(key, value) {
    updateGeneralSettings({ [key]: value });
  }

  function setText(key, event) {
    updateGeneralSettings({ [key]: event.target.value });
  }

  // The stored code is the padded, capitalised form; showing it back is what stops a
  // three-character code being silently widened into a plugin that identifies as something else.
  function setManufacturerCode(event) {
    const padded = normalizeManufacturerCode(event.target.value);
    updateGeneralSettings({ exportManufacturerCode: padded });
    event.target.value = padded;
  }
</script>

<div class="general-settings">
  <section class="settings-card">
    <div class="card-head">
      <h2>Startup</h2>
      <p>Control what comes back when the app launches again.</p>
    </div>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Reopen Last Session</strong>
        <span>Restore previously open saved panels on startup.</span>
      </div>
      <input type="checkbox" checked={general.reopenLastSession} onchange={(event) => setBool('reopenLastSession', event)} />
    </label>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Restore Unsaved Work</strong>
        <span>Recover unsaved panels from the local autosave snapshot.</span>
      </div>
      <input type="checkbox" checked={general.restoreUnsavedWork} onchange={(event) => setBool('restoreUnsavedWork', event)} />
    </label>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Check for Updates on Startup</strong>
        <!-- Said plainly, because the honest description IS the reason this is off by default.
             Help → Check for Updates works whatever this says. -->
        <span>Ask GitHub once per launch whether a newer CEditor has been released. Off by default:
          the request tells GitHub this machine's IP address.</span>
      </div>
      <input type="checkbox" checked={general.checkForUpdatesOnStartup} onchange={(event) => setBool('checkForUpdatesOnStartup', event)} />
    </label>
  </section>

  <section class="settings-card">
    <div class="card-head">
      <h2>Autosave</h2>
      <p>Autosave keeps a local recovery snapshot for unsaved work.</p>
    </div>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Enable Autosave</strong>
        <span>Refresh the local recovery snapshot after edits settle down.</span>
      </div>
      <input type="checkbox" checked={general.autosaveEnabled} onchange={(event) => setBool('autosaveEnabled', event)} />
    </label>

    <div class="setting-row compact">
      <div class="setting-copy">
        <strong>Autosave Delay</strong>
        <span>Seconds to wait after edits before writing the recovery snapshot.</span>
      </div>
      <div class="number-wrap">
        <NumberCell
          value={general.autosaveIntervalSeconds}
          min={5}
          max={600}
          step={5}
          onchange={(value) => setNumber('autosaveIntervalSeconds', value)}
        />
      </div>
    </div>
  </section>

  <section class="settings-card">
    <div class="card-head">
      <h2>New Panels</h2>
      <p>Defaults applied when you create a new panel.</p>
    </div>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Snap To Grid By Default</strong>
        <span>New panels start with grid snapping enabled.</span>
      </div>
      <input type="checkbox" checked={general.defaultSnapToGrid} onchange={(event) => setBool('defaultSnapToGrid', event)} />
    </label>

    <div class="setting-row compact">
      <div class="setting-copy">
        <strong>Default Grid Size</strong>
        <span>Initial grid size for newly created panels.</span>
      </div>
      <div class="number-wrap">
        <NumberCell
          value={general.defaultGridSize}
          min={1}
          max={400}
          step={1}
          onchange={(value) => setNumber('defaultGridSize', value)}
        />
      </div>
    </div>
  </section>

  <section class="settings-card">
    <div class="card-head">
      <h2>Canvas</h2>
      <p>Default editor overlays and measurement helpers.</p>
    </div>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Show Rulers</strong>
        <span>Display rulers around the canvas by default.</span>
      </div>
      <input type="checkbox" checked={general.showRulers} onchange={(event) => setBool('showRulers', event)} />
    </label>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Show Guides</strong>
        <span>Keep guide lines visible when they exist on the panel.</span>
      </div>
      <input type="checkbox" checked={general.showGuides} onchange={(event) => setBool('showGuides', event)} />
    </label>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Show Distances</strong>
        <span>Show measurement labels while dragging and resizing.</span>
      </div>
      <input type="checkbox" checked={general.showDistances} onchange={(event) => setBool('showDistances', event)} />
    </label>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Preview Selection Ring</strong>
        <span>Show the yellow dashed inspect ring around the active control while Preview mode is on.</span>
      </div>
      <input type="checkbox" checked={general.showPreviewSelectionRing} onchange={(event) => setBool('showPreviewSelectionRing', event)} />
    </label>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Fold Scenery While Editing</strong>
        <span>
          Draw labels, plates and images as one layer instead of as individual components, so a large
          panel builds faster. They stay selectable and become editable again as soon as you point at
          one. Preview always does this; turning it on here applies it to the edit canvas too.
        </span>
      </div>
      <input type="checkbox" checked={general.foldSceneryInEditor} onchange={(event) => setBool('foldSceneryInEditor', event)} />
    </label>
  </section>

  <section class="settings-card">
    <div class="card-head">
      <h2>Editing</h2>
      <p>Defaults for inserting, duplicating, and nudging components.</p>
    </div>

    <div class="settings-grid">
      <div class="mini-setting">
        <span>Insert Offset</span>
        <NumberCell
          value={general.insertOffset}
          min={0}
          max={400}
          step={1}
          onchange={(value) => setNumber('insertOffset', value)}
        />
      </div>

      <div class="mini-setting">
        <span>Duplicate Offset</span>
        <NumberCell
          value={general.duplicateOffset}
          min={0}
          max={400}
          step={1}
          onchange={(value) => setNumber('duplicateOffset', value)}
        />
      </div>

      <div class="mini-setting">
        <span>Arrow Nudge</span>
        <NumberCell
          value={general.keyboardNudgeSmall}
          min={1}
          max={200}
          step={1}
          onchange={(value) => setNumber('keyboardNudgeSmall', value)}
        />
      </div>

      <div class="mini-setting">
        <span>Shift+Arrow Nudge</span>
        <NumberCell
          value={general.keyboardNudgeLarge}
          min={1}
          max={400}
          step={1}
          onchange={(value) => setNumber('keyboardNudgeLarge', value)}
        />
      </div>
    </div>
  </section>

  <section class="settings-card">
    <div class="card-head">
      <h2>Export Defaults</h2>
      <p>What a new panel inherits when it is exported as a plugin. Each panel can override any of
        it on its own Export tab — this is the starting point, not the rule.</p>
    </div>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Vendor</strong>
        <span>The company name a DAW shows beside the plugin. Left blank on purpose: an invented
          name baked into a plugin is worse than an empty field, because nobody notices it.</span>
      </div>
      <input class="text-setting" type="text" value={general.exportVendor ?? ''}
             placeholder="Your name or company"
             onchange={(event) => setText('exportVendor', event)} />
    </label>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Manufacturer Code</strong>
        <span>Four characters, which is what VST and AU take. The plugin's unique identity comes
          from its own GUID, not from this — so a wrong code is cosmetic rather than a collision.</span>
      </div>
      <input class="text-setting short" type="text" maxlength="4"
             value={general.exportManufacturerCode ?? ''}
             placeholder="Abcd"
             onchange={setManufacturerCode} />
    </label>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Output Folder</strong>
        <span>Where builds are written. Blank means <code>export-out/</code> beside the project.</span>
      </div>
      <input class="text-setting" type="text" value={general.exportOutputDir ?? ''}
             placeholder="export-out/"
             onchange={(event) => setText('exportOutputDir', event)} />
    </label>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Default Format</strong>
        <span>What an unqualified Export produces.</span>
      </div>
      <select class="text-setting short" value={general.exportDefaultFormat ?? 'vst3'}
              onchange={(event) => setText('exportDefaultFormat', event)}>
        <option value="vst3">VST3</option>
        <option value="standalone">Standalone</option>
        <option value="both">Both</option>
      </select>
    </label>

    <label class="setting-row">
      <div class="setting-copy">
        <strong>Backend</strong>
        <span>Fast reuses a prebuilt shell and needs no toolchain; Recompile builds from source.
          Auto picks Fast when it can.</span>
      </div>
      <select class="text-setting short" value={general.exportBackend ?? 'auto'}
              onchange={(event) => setText('exportBackend', event)}>
        <option value="auto">Auto</option>
        <option value="fast">Fast</option>
        <option value="recompile">Recompile</option>
      </select>
    </label>
  </section>
</div>

<style>
  .text-setting {
    background: #1A1A1A; border: 1px solid #3A3A3A; border-radius: 5px; color: #DDD;
    font-family: inherit; font-size: 12px; padding: 4px 8px; min-width: 190px;
  }
  .text-setting:focus { outline: none; border-color: #5B9BD5; }
  .text-setting.short { min-width: 110px; }

  .general-settings {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px 18px 24px;
  }

  .settings-card {
    border: 1px solid #303030;
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(34, 34, 34, 0.98), rgba(24, 24, 24, 0.98));
    overflow: hidden;
  }

  .card-head {
    padding: 12px 14px 10px;
    border-bottom: 1px solid #2B2B2B;
  }

  .card-head h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 650;
    color: #F4F4F4;
  }

  .card-head p {
    margin: 4px 0 0;
    font-size: 11px;
    color: #949494;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 12px 14px;
    border-top: 1px solid #292929;
  }

  .setting-row.compact {
    align-items: flex-start;
  }

  .setting-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .setting-copy strong {
    font-size: 13px;
    font-weight: 600;
    color: #F0F0F0;
  }

  .setting-copy span {
    font-size: 11px;
    color: #8A8A8A;
    line-height: 1.35;
  }

  .setting-row input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: #0B6EB5;
    flex: 0 0 auto;
  }

  .number-wrap {
    width: 120px;
    flex: 0 0 auto;
    margin-top: 2px;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
    padding: 14px;
  }

  .mini-setting {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid #343434;
    border-radius: 10px;
    background: #1B1B1B;
  }

  .mini-setting span {
    font-size: 11px;
    font-weight: 600;
    color: #D6D6D6;
  }
</style>
