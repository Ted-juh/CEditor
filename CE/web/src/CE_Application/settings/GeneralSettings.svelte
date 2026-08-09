<script>
  import { generalSettings, updateGeneralSettings } from '../stores/appSettings.js';
  import NumberInput from '../sections/NumberInput.svelte';

  let general = $derived($generalSettings);

  function setBool(key, event) {
    updateGeneralSettings({ [key]: event.target.checked });
  }

  function setNumber(key, value) {
    updateGeneralSettings({ [key]: value });
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
        <NumberInput
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
        <NumberInput
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
        <NumberInput
          value={general.insertOffset}
          min={0}
          max={400}
          step={1}
          onchange={(value) => setNumber('insertOffset', value)}
        />
      </div>

      <div class="mini-setting">
        <span>Duplicate Offset</span>
        <NumberInput
          value={general.duplicateOffset}
          min={0}
          max={400}
          step={1}
          onchange={(value) => setNumber('duplicateOffset', value)}
        />
      </div>

      <div class="mini-setting">
        <span>Arrow Nudge</span>
        <NumberInput
          value={general.keyboardNudgeSmall}
          min={1}
          max={200}
          step={1}
          onchange={(value) => setNumber('keyboardNudgeSmall', value)}
        />
      </div>

      <div class="mini-setting">
        <span>Shift+Arrow Nudge</span>
        <NumberInput
          value={general.keyboardNudgeLarge}
          min={1}
          max={400}
          step={1}
          onchange={(value) => setNumber('keyboardNudgeLarge', value)}
        />
      </div>
    </div>
  </section>
</div>

<style>
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
