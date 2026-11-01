<script>
  /**
   * Export a custom component: name, version, what changed, where to (the library and/or a file),
   * and the few checks that say whether it will work on a panel. Opened by Export… in the Component
   * Designer's header, and by File › Save (Ctrl+S) while a component open on its own is in front.
   * None of the checks stops the export (stores/componentExport.js, utils/componentExport.js).
   */
  import { selectedControl, applyControlPatch } from '../stores/controls.js';
  import { customComponentLibrary } from '../stores/customComponentLibrary.js';
  import { closeComponentExport, componentExportOpen, exportComponent } from '../stores/componentExport.js';
  import { componentExportChecks, componentExportName, componentExportVersion } from '../utils/componentExport.js';
  import { editablePropertiesWithMissingTargets } from '../utils/customComponentPackage.js';

  let control = $derived(String($selectedControl?._children?.Core?.controlType ?? '') === 'CustomComponent' ? $selectedControl : null);

  let name = $state('');
  let version = $state('');
  let was = $state(null);
  let changes = $state('');
  let toLibrary = $state(true);
  let toFile = $state(false);
  let error = $state('');

  // Filled in each time the window opens, from the component and the library as they are then.
  let openedFor = $state(null);
  $effect(() => {
    if (!$componentExportOpen) { openedFor = null; return; }
    const id = control?._children?.Core?.id ?? null;
    if (openedFor === id) return;
    openedFor = id;
    name = control ? componentExportName(control) : '';
    const suggested = componentExportVersion(control, $customComponentLibrary, name);
    version = suggested.version;
    was = suggested.was;
    changes = '';
    error = '';
  });
  // A different name is a different family in the library: suggest its version again.
  function nameChanged() {
    const suggested = componentExportVersion(control, $customComponentLibrary, name);
    version = suggested.version;
    was = suggested.was;
  }

  let checks = $derived($componentExportOpen && control ? componentExportChecks(control) : []);

  function fix(check) {
    if (check.fix !== 'drop-missing-settings' || !control) return;
    const id = control._children.Core.id;
    const missing = new Set(editablePropertiesWithMissingTargets(control));
    const kept = Object.fromEntries(Object.entries(control._children.PublishedProperties?.editableProperties ?? {})
      .filter(([key]) => !missing.has(key)));
    applyControlPatch(id, { 'PublishedProperties.editableProperties': kept });
  }

  function run() {
    if (!control) return;
    const result = exportComponent(control, { name, version, changes, toLibrary, toFile });
    if (!result.ok) { error = result.error; return; }
    closeComponentExport();
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeComponentExport(); }
    else if (e.key === 'Enter' && !['BUTTON', 'TEXTAREA'].includes(e.target?.tagName)) { e.preventDefault(); run(); }
  }
</script>

{#if $componentExportOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog-backdrop" onmousedown={(e) => { if (e.target === e.currentTarget) closeComponentExport(); }} onkeydown={handleKeydown}>
    <div class="dialog" role="dialog" aria-label="Export component" data-testid="component-export-dialog">
      <div class="dialog-title">Export component</div>
      {#if !control}
        <p class="muted">Open a custom component in the Component Designer to export it.</p>
        <div class="actions"><button class="btn" onclick={closeComponentExport}>Close</button></div>
      {:else}
        <p class="muted">{name || 'The component'}, as it is now: what it draws, its values and its settings.</p>
        <div class="row2">
          <label class="field">
            <span>Name</span>
            <!-- svelte-ignore a11y_autofocus -->
            <input type="text" bind:value={name} onchange={nameChanged} autofocus data-testid="component-export-name" />
          </label>
          <label class="field">
            <span>Version</span>
            <div class="version">
              <input type="text" bind:value={version} data-testid="component-export-version" />
              {#if was}<em>was {was}</em>{/if}
            </div>
          </label>
        </div>
        <label class="field">
          <span>What changed (optional)</span>
          <textarea bind:value={changes} rows="2" placeholder="Kept with this version, in your library and in the file."></textarea>
        </label>

        <div class="field">
          <span>Save to</span>
          <label class="choice">
            <input type="checkbox" bind:checked={toLibrary} data-testid="component-export-library" />
            <strong>My component library</strong>
            <em>Insert › Saved packages lists it, on every panel</em>
          </label>
          <label class="choice">
            <input type="checkbox" bind:checked={toFile} data-testid="component-export-file" />
            <strong>A file</strong>
            <em>to share or keep: {name || 'Custom Component'}-{version || '1.0.0'}.ceditor-component.json</em>
          </label>
        </div>

        <div class="field">
          <span>Checks</span>
          <ul class="checks" data-testid="component-export-checks">
            {#each checks as check, index (index)}
              <li class={check.level}>
                <b aria-hidden="true">{check.level === 'ok' ? '✓' : check.level === 'warn' ? '!' : '·'}</b>
                <span>{check.text}</span>
                {#if check.fix === 'drop-missing-settings'}
                  <button type="button" class="link" onclick={() => fix(check)}>Remove {check.text.startsWith('The setting') ? 'it' : 'them'}</button>
                {/if}
              </li>
            {/each}
          </ul>
          <em class="hint">A warning never stops the export.</em>
        </div>

        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <div class="actions">
          <button class="btn" type="button" onclick={closeComponentExport}>Cancel</button>
          <button class="btn primary" type="button" onclick={run} disabled={!toLibrary && !toFile} data-testid="component-export-run">Export</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1200;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dialog {
    width: 540px;
    max-width: calc(100vw - 48px);
    max-height: calc(100vh - 64px);
    overflow-y: auto;
    background: #242424;
    border: 1px solid #3A3A3A;
    border-radius: 8px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.55);
    padding: 18px 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    color: #CCC;
    font-size: 12px;
  }

  .dialog-title { font-size: 14px; font-weight: 600; color: #EEE; }
  .muted { margin: -6px 0 0; color: #8F8F8F; }

  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

  .field { display: flex; flex-direction: column; gap: 6px; }
  .field > span {
    color: #8F8F8F;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .field input[type="text"],
  .field textarea {
    background: #1C1C1C;
    border: 1px solid #3A3A3A;
    border-radius: 4px;
    color: #DDD;
    font-size: 12px;
    font-family: inherit;
    padding: 0 8px;
    outline: none;
  }
  .field input[type="text"] { height: 26px; width: 100%; box-sizing: border-box; }
  .field textarea { padding: 6px 8px; resize: vertical; }
  .field input[type="text"]:focus,
  .field textarea:focus { border-color: #5B9BD5; }

  .version { display: flex; align-items: center; gap: 8px; }
  .version em, .choice em, .hint { color: #8F8F8F; font-style: normal; font-size: 11px; }

  .choice { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .choice strong { color: #DDD; font-weight: 600; white-space: nowrap; }

  .checks { list-style: none; margin: 0; padding: 6px 10px; border: 1px solid #343434; border-radius: 5px; background: #1F1F1F; }
  .checks li { display: flex; gap: 8px; align-items: baseline; padding: 4px 0; line-height: 1.35; }
  .checks b { flex: 0 0 12px; text-align: center; }
  .checks li.ok b { color: #6FCF97; }
  .checks li.warn { color: #E8C27A; }
  .checks li.warn b { color: #E5A029; }
  .checks li.note b { color: #8F8F8F; }
  .link { background: none; border: 0; padding: 0; color: #5B9BD5; font: inherit; cursor: pointer; white-space: nowrap; }
  .link:hover { text-decoration: underline; }

  .error { margin: 0; color: #E28B8B; }

  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  .btn {
    height: 28px;
    padding: 0 14px;
    border: 1px solid #3A3A3A;
    border-radius: 4px;
    background: #2C2C2C;
    color: #DDD;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) { border-color: #5B9BD5; }
  .btn.primary { background: #094771; border-color: #0B6EB5; color: #FFF; }
  .btn:disabled { opacity: 0.45; cursor: default; }
</style>
