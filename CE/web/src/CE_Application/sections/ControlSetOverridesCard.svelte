<script>
  /**
   * Core › Control design: the selected controls' relation to their control set, and the commands
   * that change it (docs/design/changeable-control-sets.md, piece A; models/controlSetOwnership.js).
   *
   *   Inherited:  "Control set: Tolex (inherited from panel)", "Overrides: N", Clear Overrides and
   *               Detach from Set, with "Keep colour roles linked when detaching".
   *   Detached:   "Control set: Detached (from Tolex)", how its colours are kept, Reattach to Set.
   *
   * The wording follows the tools people know it from: overrides and Revert (Unity prefabs, Figma
   * instances), Clear Overrides (InDesign), Detach (Figma, Sketch). Every command applies to every
   * selected control, one undo step.
   *
   * With one control selected, its overrides are listed, each with Revert and Apply, and Apply to
   * Set… gives them to the set's family (piece C, stores/setFromControl.js), as Unity applies a
   * prefab instance's overrides.
   */
  import { activePanel, selectedComponentIds } from '../stores/panels.js';
  import { activeControlSet, controlSetSources, makeControlLookOwn, resetControlLookToSet } from '../stores/controlSets.js';
  import { getControlSet } from '../models/controlSets.js';
  import { setOwnership } from '../models/controlSetOwnership.js';
  import { controlOverrides, describeLookValue } from '../models/setFromControl.js';
  import { requestApplyToSet } from '../stores/setFromControl.js';
  import { findControlById } from '../utils/containment.js';
  import PropertyButton from '../properties/PropertyButton.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let keepColourRoles = $state(true);

  let ids = $derived.by(() => {
    const id = control?._children?.Core?.id;
    const selected = [...($selectedComponentIds ?? [])];
    return selected.includes(id) ? selected : (id ? [id] : []);
  });
  let controls = $derived(ids.map((id) => findControlById($activePanel?.controls ?? [], id)).filter((entry) => entry?._children?.Core));
  let ownerships = $derived(controls.map((entry) => setOwnership(entry, $activeControlSet, $controlSetSources)));
  let detachedCount = $derived(ownerships.filter((entry) => entry.detached).length);
  let allDetached = $derived(ownerships.length > 0 && detachedCount === ownerships.length);
  let overrideCount = $derived(ownerships.reduce((sum, entry) => sum + entry.own.size, 0));
  let setName = $derived(ownerships[0]?.set?.name ?? $activeControlSet?.name ?? '');
  let assigned = $derived(String(control?._children?.Core?.controlSetId ?? '').trim() !== '');
  let detachedFrom = $derived.by(() => {
    const id = ownerships.find((entry) => entry.detached)?.detached ?? '';
    return id ? (getControlSet(id, $controlSetSources)?.name ?? id) : '';
  });
  let rolesLinked = $derived(controls.some((entry) => entry._children.Core.detachedColourRoles === true));
  let several = $derived(controls.length > 1);
  // One control: its overrides by name, to revert or apply one at a time.
  let overrides = $derived(!several && controls[0] && !detachedCount
    ? controlOverrides(controls[0], $activeControlSet, $controlSetSources).entries
    : []);
  let listOpen = $state(true);
</script>

{#if controls.length}
  <div class="set-card" data-testid="control-set-card">
    {#if allDetached}
      <span class="k">Control set</span><span class="v">Detached <span class="muted">(from {detachedFrom})</span></span>
      <span class="k">Colours</span><span class="v">{rolesLinked ? 'Linked to set colour roles' : 'Stored on the control'}</span>
      <div class="actions">
        <PropertyButton label="Reattach to Set" title={`Discard the stored appearance and inherit from ${setName} again.`}
          onclick={() => resetControlLookToSet(ids)} />
      </div>
    {:else}
      <span class="k">Control set</span><span class="v">{setName} <span class="muted">({assigned ? 'assigned to this control' : 'inherited from panel'})</span></span>
      <span class="k">Overrides</span><span class="v"><span class="badge" data-testid="control-set-overrides">{overrideCount}</span>{#if several}<span class="muted"> across {controls.length} controls</span>{/if}{#if detachedCount}<span class="muted">; {detachedCount} detached</span>{/if}{#if overrides.length}<button type="button" class="fold" aria-expanded={listOpen} onclick={() => (listOpen = !listOpen)}>{listOpen ? '▾ hide' : '▸ show'}</button>{/if}</span>
      {#if overrides.length && listOpen}
        <div class="overrides" data-testid="control-set-override-list">
          {#each overrides as entry (entry.path)}
            <div class="orow">
              <span class="what" title={entry.path}>{#if entry.part}<span class="part">{`${entry.part} · `}</span>{/if}<b>{entry.property}</b> {describeLookValue(entry.value)}</span>
              <button type="button" class="mini" title={`Revert to what ${setName} gives: ${describeLookValue(entry.was)}`} onclick={() => resetControlLookToSet(ids, [entry.path])}>Revert</button>
              <button type="button" class="mini" title={`Give this to ${setName}'s family`} onclick={() => requestApplyToSet(controls[0]._children.Core.id, [entry.path])}>Apply</button>
            </div>
          {/each}
        </div>
      {/if}
      <div class="actions">
        <PropertyButton label="Clear Overrides" disabled={overrideCount === 0 && detachedCount === 0}
          title={`Revert every override${several ? ' on the selected controls' : ''} to the value ${setName} gives it.`}
          onclick={() => resetControlLookToSet(ids)} />
        <PropertyButton label="Apply to Set…" disabled={!overrides.length}
          title={several ? 'Select one control to apply its look to the set.' : `Give this control's overrides to ${setName}'s family, so every control that follows the set takes them.`}
          onclick={() => requestApplyToSet(controls[0]._children.Core.id)} />
        <PropertyButton label="Detach from Set"
          title={`Store ${setName}'s appearance on the control. Set changes no longer affect it.`}
          onclick={() => makeControlLookOwn(ids, { keepColourRoles })} />
      </div>
      <span class="k">Keep colour roles</span>
      <span class="v option">
        <PropertyToggle value={keepColourRoles} compact
          title="When detaching. On: colours stay linked to the set's colour roles. Off: the current colours are stored on the control."
          onchange={(next) => (keepColourRoles = next)} />
        <span class="muted">linked when detaching</span>
      </span>
    {/if}
  </div>
{/if}

<style>
  .set-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 5px 12px;
    align-items: center;
    padding: 8px 10px;
    border: 1px solid var(--pp-field-border, #333);
    border-radius: var(--pp-field-radius, 3px);
    background: #1B1B1B;
    font-size: 11px;
  }
  .k { color: #5B9BD5; font-size: 10px; letter-spacing: 0.3px; text-transform: uppercase; white-space: nowrap; }
  .v { color: #DDD; min-width: 0; }
  .muted { color: #8A8A8A; }
  .badge {
    display: inline-flex; align-items: center; height: 16px; padding: 0 6px; border-radius: 3px;
    background: #22384A; color: #CFE3F2; font-size: 10.5px; font-weight: 700;
  }
  .actions { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 6px; margin-top: 3px; }
  .fold { margin-left: 8px; border: none; background: none; padding: 0; color: #5B9BD5; font: inherit; font-size: 10.5px; cursor: pointer; }
  .overrides { grid-column: 1 / -1; border: 1px solid #2C3A44; border-radius: 3px; background: #151C21; }
  .orow { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px; align-items: center; padding: 4px 8px; border-top: 1px solid #22303A; }
  .orow:first-child { border-top: 0; }
  .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #CCC; }
  .what .part { color: #9FB6C8; }
  .what b { color: #EEE; font-weight: 600; }
  .mini { height: 20px; padding: 0 7px; border: 1px solid #3B3B3B; border-radius: 3px; background: #1E1E1E; color: #CCC; font: inherit; font-size: 10.5px; cursor: pointer; }
  .mini:hover { border-color: #5B9BD5; color: #FFF; }
  .option { display: flex; align-items: center; gap: 8px; }
  .option > :global(.property-toggle) { width: auto; min-width: 44px; flex: 0 0 auto; }
</style>
