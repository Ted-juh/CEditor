<script>
  /**
   * A control's Animations in the properties panel: what is there, what is wrong with it, and the
   * way into the Animation tab, where they are edited.
   *
   * This used to be four sections of rows: a dropdown that showed one animation at a time, a Kind
   * text box you could type any word into, the trigger's states as comma-separated text, four of the
   * ten easings, and the target list as a twelve-row box of raw JSON. Two of the seven properties it
   * offered animated nothing until the runtime grew a colour bucket, and its Quick buttons replaced
   * a state of the same name, so pressing one on a button threw away its own Pressed colour.
   *
   * Everything those rows did, the Animation tab does — with clash and unknown-state warnings, a
   * stage to play them on, keyframes, and presets that merge rather than replace — so the rows are
   * gone and this is the summary. The panel's search still finds every field the tab edits: it is
   * fed from allAnimationFieldLabels() (utils/dockFieldIndex.js), and a match offers to open the tab.
   */
  import { getSection } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import PropertySection from '../properties/PropertySection.svelte';
  import OpenInDock from '../properties/OpenInDock.svelte';
  import Play from 'lucide-svelte/icons/play';
  import {
    readAnimations,
    animationsEnabled,
    deadTargetCount,
    findClashes,
    controlStateNames,
    unknownTriggerStates,
    triggerSummary,
  } from '../utils/animationModel.js';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let animations = $derived(getSection(control, 'Animations'));
  let multiEdit = $derived($selectedComponentIds.size > 1);
  let partNames = $derived(Object.keys(getSection(control, 'Parts')?._children ?? {}));
  let stateNames = $derived(control ? controlStateNames(control) : []);

  let rows = $derived(control ? readAnimations(control) : []);
  let allOn = $derived(control ? animationsEnabled(control) : true);
  let dead = $derived(rows.reduce((sum, row) => sum + deadTargetCount(row, partNames), 0));
  let unknown = $derived(rows.reduce((sum, row) => sum + unknownTriggerStates(row, stateNames).length, 0));
  let clashes = $derived(findClashes(rows, partNames).length);
</script>

{#if multiEdit}
  <div class="placeholder">
    Animations are edited one control at a time, in the Animation tab. Its presets can go on every
    selected control at once.
  </div>
{:else if animations}
  <PropertySection title="Animations" icon={Play}>
    <div class="summary">
      <div class="head">
        <span class="count">{rows.length} {rows.length === 1 ? 'animation' : 'animations'}{allOn ? '' : ' — all off'}</span>
        {#if dead}<span class="bad">{dead} {dead === 1 ? 'target does' : 'targets do'} nothing</span>{/if}
        {#if clashes}<span class="bad">{clashes} {clashes === 1 ? 'clash' : 'clashes'}</span>{/if}
        {#if unknown}<span class="bad">{unknown} unknown {unknown === 1 ? 'state' : 'states'}</span>{/if}
      </div>
      {#each rows as row (row.name)}
        <div class="row" class:off={!row.enabled || !allOn}>
          <span class="nm">{row.name}</span>
          <span class="ms">{row.duration}ms</span>
          <span class="what">{row.kind === 'keyframes' ? 'keyframes' : 'transition'} · {triggerSummary(row)}</span>
        </div>
      {/each}
      {#if !rows.length}<p class="none">No animations yet.</p>{/if}
      <div class="open">
        <OpenInDock tab="animation" controlId={core?.id ?? ''} what="this control's animations" />
      </div>
    </div>
  </PropertySection>
{/if}

<style>
  .placeholder { padding: 10px 12px; font: 400 11px/1.5 'IBM Plex Sans', system-ui, sans-serif; color: #8A949C; }
  /* PropertySection lays its children on a four-column grid; the summary takes the whole width. */
  .summary { grid-column: 1 / -1; min-width: 0; padding: 4px 10px 10px; }
  .head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 6px; }
  .count { font: 500 10px/1 'IBM Plex Sans', system-ui, sans-serif; color: #C3D0DA; }
  .bad {
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    color: #F0D48A;
    border: 1px solid #6B4A1E;
    background: #241d10;
    border-radius: 3px;
    padding: 3px 6px;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 8px;
    row-gap: 1px;
    align-items: center;
    padding: 4px 0;
    border-top: 1px solid #23282D;
    font: 400 10px/1.3 'IBM Plex Sans', system-ui, sans-serif;
  }
  .row.off { opacity: 0.45; }
  .nm { color: #C3D0DA; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .what { grid-column: 1 / -1; color: #8A949C; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ms { font: 400 9px/1 'IBM Plex Mono', ui-monospace, monospace; color: #616C75; }
  .none { margin: 4px 0; font: 400 10px/1.4 'IBM Plex Sans', system-ui, sans-serif; color: #69737B; }
  .open { margin-top: 8px; display: flex; }
</style>
