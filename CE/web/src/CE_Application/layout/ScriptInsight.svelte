<script>
  /**
   * Scripts button — beside the Device button in the bar above the canvas (ContextBar).
   *
   * Appears only when the selected control actually has a Scripts section
   * (interactive controls do; static Labels don't), says how many scripts it has
   * ("Scripts none", "Scripts 2 on"), and opens the Script Editor. It was a block
   * two rows tall; the hint it carried ("no logic attached", "2 enabled") is the
   * tooltip now.
   *
   * Scripts are authored in the Behavior Designer, in the script document bound to
   * this control's panel — that is the only script editor. Count the source scripts
   * targeting this control in that document, including wildcard attachments.
   * The control's Scripts section only determines whether this zone is offered.
   */
  import { get } from 'svelte/store';
  import { selectedControl, getSection } from '../stores/controls.js';
  import { selectedComponentIds, setActiveEditorTab, activePanel } from '../stores/panels.js';
  import { getOrCreateScriptDocForPanel, scriptDocuments } from '../stores/scriptWorkspace.js';
  import { isSourceScript } from '../scripting/scriptModel.js';

  let control = $derived($selectedControl);
  let multiSelect = $derived($selectedComponentIds.size > 1);
  let scripts = $derived(getSection(control, 'Scripts'));
  // The bound workspace is also the runtime's first document source. The old
  // per-control Scripts section does not contain Behavior Designer attachments.
  let scriptDocument = $derived($scriptDocuments.find((doc) =>
    String(doc.panelId) === String($activePanel?.id)));
  let scriptList = $derived((scriptDocument?.scripts ?? $activePanel?.scripts ?? []).filter((script) => {
    if (!isSourceScript(script) || script.scope !== 'component') return false;
    const target = String(script.target ?? '*').toLowerCase();
    return target === '*' || target === 'self'
      || target === String(getSection(control, 'Core')?.name ?? '').toLowerCase();
  }));
  let count = $derived(scriptList.length);
  let enabledCount = $derived(scriptList.filter((script) => script.enabled !== false).length);
  let enabled = $derived(enabledCount > 0);
  let visible = $derived(!!scripts && !multiSelect);

  let title = $derived(count > 0
    ? `${count} script${count === 1 ? '' : 's'}, ${enabledCount} enabled. Open the Script Editor.`
    : 'No logic attached. Open the Script Editor.');

  function openScripts() {
    // Open the script editor bound to THIS component's panel — so Paths shows that panel's controls.
    const panel = get(activePanel);
    const doc = getOrCreateScriptDocForPanel(panel?.id, panel?.name, panel?.scripts);
    if (!doc?.id) return;
    setActiveEditorTab({ type: 'script', id: doc.id });
  }
</script>

{#if visible}
  <div class="script-wrap">
    <button class="s-jump" {title} onclick={openScripts}>
      <span class="s-chip">Scripts</span>
      {#if count > 0}
        <span class="s-count">{count}</span>
        <span class={['s-badge', enabled ? 'on' : 'off']}>{enabled ? 'on' : 'off'}</span>
      {:else}
        <span class="s-none">none</span>
      {/if}
    </button>
  </div>
{/if}

<style>
  .script-wrap {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .s-jump {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 8px;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    background: #1E1E1E;
    color: #DDD;
    font-family: inherit;
    font-size: 11px;
    white-space: nowrap;
    cursor: pointer;
  }
  .s-jump:hover { border-color: #5B9BD5; background: #1B3147; color: #FFF; }

  .s-chip {
    flex: 0 0 auto;
    color: #C7A86F;
    font-size: 10px;
    font-weight: 700;
  }

  .s-count {
    color: #E6E6E6;
    font-weight: 600;
  }

  .s-none {
    color: #DDD;
  }

  .s-badge {
    flex: 0 0 auto;
    padding: 0 4px;
    border-radius: 3px;
    border: 1px solid #3A3A3A;
    background: #1A1A1A;
    font-size: 10px;
    font-weight: 700;
  }
  .s-badge.on { color: #6FCF97; }
  .s-badge.off { color: #888; }
</style>
