<script>
  /**
   * Scripts / Logic zone — right of the Device zone on the top Look bar.
   *
   * Mirrors the Device zone's pattern: appears only when the selected control
   * actually has a Scripts section (interactive controls do; static Labels don't),
   * shows a glanceable summary, and offers a jump to where scripts are edited.
   *
   * A control's scripts live in its Scripts section (command-graph scripts per
   * event trigger), edited in the Properties → Scripts tab (id 'actions') — that
   * is the script editor for control logic, distinct from the standalone Script
   * Workspace (which authors separate documents).
   */
  import { get } from 'svelte/store';
  import { selectedControl, getSection } from '../stores/controls.js';
  import { selectedComponentIds, setActiveEditorTab, activePanel } from '../stores/panels.js';
  import { getOrCreateScriptDocForPanel } from '../stores/scriptWorkspace.js';

  let control = $derived($selectedControl);
  let multiSelect = $derived($selectedComponentIds.size > 1);
  let scripts = $derived(getSection(control, 'Scripts'));
  let scriptList = $derived(Array.isArray(scripts?.scripts) ? scripts.scripts : []);
  let count = $derived(scriptList.length);
  let enabled = $derived(scripts?.enabled !== false);
  let runInPreview = $derived(scripts?.runInPreview !== false);
  let visible = $derived(!!scripts && !multiSelect);

  function openScripts() {
    // Open the script editor bound to THIS component's panel — so Paths shows that panel's controls.
    const panel = get(activePanel);
    const doc = getOrCreateScriptDocForPanel(panel?.id, panel?.name);
    if (!doc?.id) return;
    setActiveEditorTab({ type: 'script', id: doc.id });
  }
</script>

{#if visible}
  <div class="script-wrap">
    <div class="script-zone">
      <div class="s-row">
        <span class="s-chip">SCRIPTS</span>
        {#if count > 0}
          <span class="s-count">{count} script{count === 1 ? '' : 's'}</span>
          <span class={['s-badge', enabled ? 'on' : 'off']} title={enabled ? 'Scripts enabled' : 'Scripts disabled'}>{enabled ? 'on' : 'off'}</span>
        {:else}
          <span class="s-none">none</span>
        {/if}
      </div>
      <div class="s-row s-row-2">
        {#if count > 0}
          <span class="s-hint">{runInPreview ? 'runs in preview' : 'preview off'}</span>
        {:else}
          <span class="s-hint">no logic attached</span>
        {/if}
        <span class="s-actions">
          <button class="s-jump" title="Open the Script Editor" onclick={openScripts}>Script Editor</button>
        </span>
      </div>
    </div>
  </div>
{/if}

<style>
  .script-wrap {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    margin-left: 14px;
    padding-left: 14px;
    border-left: 1px solid #565656;
  }

  .script-zone {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 3px;
    max-width: 240px;
    min-width: 0;
    font-size: 11px;
  }

  .s-row {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .s-chip {
    flex: 0 0 auto;
    color: #C7A86F;
    font-size: 10px;
    font-weight: 700;
  }

  .s-count {
    color: #E6E6E6;
    font-weight: 600;
    white-space: nowrap;
  }

  .s-none,
  .s-hint {
    color: #8A8A8A;
    font-size: 10px;
    white-space: nowrap;
  }

  .s-badge {
    flex: 0 0 auto;
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid #3A3A3A;
    background: #1A1A1A;
    font-size: 10px;
    font-weight: 700;
  }
  .s-badge.on { color: #6FCF97; }
  .s-badge.off { color: #888; }

  .s-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .s-jump {
    flex: 0 0 auto;
    height: 22px;
    padding: 0 8px;
    border-radius: 3px;
    border: 1px solid #444;
    background: #333;
    color: #999;
    font-size: 10px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
  }
  .s-jump:hover { background: #444; color: #DDD; }
</style>
