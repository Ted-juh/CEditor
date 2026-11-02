<script>
  /**
   * Apply a control set to a panel, choosing what changes: the background, the surface material,
   * each kind of control on the panel, or only the selected controls. What is not ticked keeps the
   * look it has now. Opened through stores/controlSets.js `requestControlSetApply`, from Settings ›
   * Control Sets, its template gallery and the panel's own Set; utils/controlSetApply.js does it.
   */
  import { panels, selectedComponentIds } from '../stores/panels.js';
  import { controlSetLibrary } from '../stores/controlSetLibrary.js';
  import { applyControlSetWithChoices, controlSetApplyRequest } from '../stores/controlSets.js';
  import { DEFAULT_CONTROL_SET_ID, getControlSet } from '../models/controlSets.js';
  import { DEFAULT_PANEL_COLOUR } from '../utils/backgroundCSS.js';
  import { aarrggbbToHex } from '../utils/colourHex.js';
  import { panelSetSummary } from '../utils/controlSetApply.js';

  let request = $derived($controlSetApplyRequest);
  let panel = $derived(request ? $panels.find((entry) => entry.id === request.panelId) ?? null : null);
  let oldSet = $derived(panel ? getControlSet(panel.controlSet?.id ?? DEFAULT_CONTROL_SET_ID, { document: panel.controlSets, library: $controlSetLibrary }) : null);
  let newSet = $derived(request ? getControlSet(request.setId, { document: panel?.controlSets, library: $controlSetLibrary }) : null);
  let summary = $derived(panel ? panelSetSummary(panel) : { families: [], pinned: 0, pinnedSets: [] });
  let selectionCount = $derived($selectedComponentIds?.size ?? 0);

  let background = $state(true);
  let material = $state(true);
  let families = $state(new Set());
  let onlySelected = $state(false);
  let includePinned = $state(false);

  // Everything ticked each time it opens: the old one-click Apply, unless you say otherwise.
  let openedFor = $state('');
  $effect(() => {
    const key = request ? `${request.panelId}:${request.setId}` : '';
    if (key === openedFor) return;
    openedFor = key;
    if (!request) return;
    background = true;
    material = true;
    families = new Set(summary.families.map((entry) => entry.label));
    onlySelected = false;
    includePinned = false;
  });

  const bare = (colour) => String(colour ?? '').replace(/^#/, '');
  let shownBackground = $derived.by(() => {
    const authored = bare(panel?.bgColour || DEFAULT_PANEL_COLOUR).toUpperCase();
    const follows = panel?.bgFollowsSet !== false && authored === DEFAULT_PANEL_COLOUR;
    return follows && oldSet?.panel?.colour ? bare(oldSet.panel.colour) : authored;
  });
  let newBackground = $derived(newSet?.panel?.colour ? bare(newSet.panel.colour) : DEFAULT_PANEL_COLOUR);
  let newMaterialName = $derived(newSet?.panel?.material?.enabled ? String(newSet.panel.material.kind ?? 'on') : 'none');

  function toggleFamily(label) {
    const next = new Set(families);
    if (next.has(label)) next.delete(label); else next.add(label);
    families = next;
  }

  function close() {
    controlSetApplyRequest.set(null);
  }

  function apply() {
    if (!panel || !request) return;
    applyControlSetWithChoices(panel.id, request.setId, {
      background,
      material,
      families,
      selected: onlySelected ? new Set($selectedComponentIds) : null,
      includePinned,
    });
    close();
  }

  function keydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  }
</script>

{#if request && panel}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" onmousedown={(event) => { if (event.target === event.currentTarget) close(); }} onkeydown={keydown}>
    <div class="dialog" role="dialog" aria-label="Apply Control Set" data-testid="apply-control-set">
      <div class="title">Apply Control Set: {newSet?.name ?? request.setId}</div>
      <p class="muted">Panel: {panel.name}. Selected items take {newSet?.name ?? 'the set'}'s appearance. Others keep their current appearance.</p>

      <div class="group">Panel</div>
      <label class="choice"><input type="checkbox" bind:checked={background} data-testid="apply-background" />
        Background colour
        <span class="sw" style:background={aarrggbbToHex(shownBackground)}></span>→<span class="sw" style:background={aarrggbbToHex(newBackground)}></span>
      </label>
      <label class="choice"><input type="checkbox" bind:checked={material} data-testid="apply-material" />
        Surface material <em>({newSet?.name ?? 'the set'}: {newMaterialName})</em>
      </label>

      <div class="group">Controls
        {#if summary.families.length}
          <button type="button" class="link" onclick={() => { families = new Set(summary.families.map((entry) => entry.label)); }}>All</button>
          <button type="button" class="link" onclick={() => { families = new Set(); }}>None</button>
        {/if}
      </div>
      {#if summary.families.length}
        <div class="families">
          {#each summary.families as entry (entry.label)}
            <label class="choice"><input type="checkbox" checked={families.has(entry.label)} onchange={() => toggleFamily(entry.label)} />{entry.label} · {entry.count}</label>
          {/each}
        </div>
      {:else}
        <p class="muted">No controls inherit from the panel's set.</p>
      {/if}
      {#if selectionCount}
        <label class="choice"><input type="checkbox" bind:checked={onlySelected} />Selected controls only ({selectionCount})</label>
      {/if}
      {#if summary.pinned}
        <label class="note"><input type="checkbox" bind:checked={includePinned} />
          {summary.pinned} control{summary.pinned === 1 ? ' is' : 's are'} assigned to another set ({summary.pinnedSets.map((id) => getControlSet(id, { document: panel.controlSets, library: $controlSetLibrary })?.name ?? id).join(', ')}). Include them
        </label>
      {/if}

      <div class="actions">
        <button type="button" class="btn" onclick={close}>Cancel</button>
        <button type="button" class="btn primary" onclick={apply} data-testid="apply-control-set-run">Apply</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 1250; background: rgba(0, 0, 0, 0.55); display: flex; align-items: center; justify-content: center; }
  .dialog {
    width: 560px; max-width: calc(100vw - 48px); max-height: calc(100vh - 64px); overflow-y: auto; box-sizing: border-box;
    background: #252526; border: 1px solid #3A3A3A; border-radius: 8px; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
    padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; color: #DDD; font-size: 12px;
  }
  .title { font-size: 15px; font-weight: 600; color: #EEE; }
  .muted { margin: 0 0 4px; color: #8F8F8F; }
  .group { margin-top: 8px; color: #6FA8C7; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; display: flex; gap: 8px; align-items: baseline; }
  .choice { display: flex; align-items: center; gap: 8px; padding: 3px 0; cursor: pointer; }
  .choice em { color: #8F8F8F; font-style: normal; }
  .sw { width: 16px; height: 16px; border-radius: 3px; border: 1px solid #555; display: inline-block; }
  .families { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 12px; }
  .note { display: flex; gap: 8px; align-items: center; margin-top: 8px; padding: 7px 9px; border: 1px solid #3A3A3A; border-radius: 5px; background: #202020; font-size: 11px; cursor: pointer; }
  .link { border: none; background: none; padding: 0; color: #5B9BD5; font: inherit; font-size: 10px; text-transform: none; letter-spacing: 0; cursor: pointer; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  .btn { height: 28px; padding: 0 14px; border: 1px solid #3A3A3A; border-radius: 4px; background: #2C2C2C; color: #DDD; font: inherit; font-weight: 600; cursor: pointer; }
  .btn.primary { background: #094771; border-color: #0B6EB5; color: #fff; }
</style>
