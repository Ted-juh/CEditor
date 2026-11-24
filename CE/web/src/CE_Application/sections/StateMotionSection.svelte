<script>
  /**
   * The States tab's Motion: what plays on Entering the state being edited (mouse over, for Hover),
   * what loops While in it, and what plays on Leaving it (mouse exit) — and an Events row for the
   * gestures that have no duration: click, double-click, long press, flick, a wheel turn.
   *
   * Decided by the owner on 2026-11-24 (docs/design/animation-designer.md) instead of a mouse layer
   * of its own: the States tab already says when a control is hovered or pressed and how it looks
   * then; this says how it gets there. Every slot is a reading of animations the Animation tab
   * already edits (utils/stateMotion.js), so a chip opens that animation there, and "New" writes one
   * animation in one store write.
   */
  import { applyControlPatch, getSection } from '../stores/controls.js';
  import { activateEditorTarget } from '../stores/editorTarget.js';
  import { displayTabRequest } from '../stores/displayTab.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import Clapperboard from 'lucide-svelte/icons/clapperboard';
  import MousePointerClick from 'lucide-svelte/icons/mouse-pointer-click';
  import {
    MOTION_EVENTS,
    eventMotion,
    newEventPatch,
    newMotionPatch,
    playbackPatch,
    slotLabel,
    stateMotion,
  } from '../utils/stateMotion.js';

  let { control = null, stateName = '', showEvents = true } = $props();

  let core = $derived(getSection(control, 'Core'));
  let motion = $derived(stateName ? stateMotion(control, stateName) : null);
  let events = $derived(eventMotion(control));
  let allPlayedBack = $derived(!!motion?.enteringTransitions.length && motion.playedBack.length === motion.enteringTransitions.length);

  /** Open one animation in the dock's Animation tab, selected. */
  function open(name) {
    if (!core?.id) return;
    activateEditorTarget('animation', core.id, null, name);
    displayTabRequest.set({ tab: 'animation' });
  }

  function write(made) {
    if (!made || !core?.id) return;
    applyControlPatch(core.id, made.patch, { pin: true });
    open(made.name);
  }

  function setPlayback(on) {
    const patch = playbackPatch(control, stateName, on);
    if (core?.id && Object.keys(patch).length) applyControlPatch(core.id, patch, { pin: true });
  }
</script>

{#snippet chips(rows, empty)}
  {#if rows.length}
    {#each rows as row (row.name)}
      {@const label = slotLabel(row)}
      <button type="button" class="chip" class:off={!label.enabled} title={`Open ${label.name} in the Animation tab`}
              onclick={() => open(row.name)}>
        <span class="nm">{label.name}</span><span class="kd">{label.kind}{label.enabled ? '' : ' · off'}</span>
      </button>
    {/each}
  {:else}
    <span class="none">{empty}</span>
  {/if}
{/snippet}

{#if motion}
  <PropertySection title="Motion" icon={Clapperboard}>
    <PropertyCell label="Entering" span={4} hint={`Plays when the control enters ${stateName}${motion.state === 'hover' ? ' — mouse over' : ''}.`}>
      <div class="slot" data-slot="entering">
        {@render chips(motion.entering, 'Nothing: the change snaps in.')}
        <button type="button" class="add" onclick={() => write(newMotionPatch(control, stateName, 'entering'))}
                title={`A transition that eases what ${stateName} changes`}>+ New</button>
      </div>
    </PropertyCell>
    <PropertyCell label="While in" span={4} hint={`Loops for as long as the control stays in ${stateName}.`}>
      <div class="slot" data-slot="whileIn">
        {@render chips(motion.whileIn, 'Nothing loops.')}
        <button type="button" class="add" onclick={() => write(newMotionPatch(control, stateName, 'whileIn'))}
                title="A gentle pulse of the whole control, looping while the state holds">+ New</button>
      </div>
    </PropertyCell>
    <PropertyCell label="Leaving" span={4} hint={`Plays when the control leaves ${stateName}${motion.state === 'hover' ? ' — mouse exit' : ''}.`}>
      <div class="slot" data-slot="leaving">
        {#if motion.enteringTransitions.length}
          <PropertyToggle compact value={allPlayedBack} label="Entering, played back" ariaLabel="Play Entering back when leaving"
                          title="Run the Entering transitions backwards when the state ends — how a hover lift settles"
                          onchange={(value) => setPlayback(value)} />
        {/if}
        {@render chips(motion.leaving, motion.enteringTransitions.length ? '' : 'Nothing: the change snaps back.')}
        <button type="button" class="add" onclick={() => write(newMotionPatch(control, stateName, 'leaving'))}
                title={`A transition of its own that plays only when ${stateName} ends`}>+ New</button>
      </div>
    </PropertyCell>
  </PropertySection>
{/if}

{#if showEvents}
  <PropertySection title="Events" icon={MousePointerClick}>
    {#each MOTION_EVENTS as event (event.id)}
      <PropertyCell label={event.label} span={4} hint={`A keyframe animation played on each ${event.label.toLowerCase()} on this control. A gesture the control already uses is shared, never taken.`}>
        <div class="slot" data-event={event.id}>
          {@render chips(events[event.id] ?? [], 'Nothing.')}
          <button type="button" class="add" onclick={() => write(newEventPatch(control, event.id))}
                  title={`A single pulse of the whole control on each ${event.label.toLowerCase()}`}>+ New</button>
        </div>
      </PropertyCell>
    {/each}
  </PropertySection>
{/if}

<style>
  .slot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: var(--pp-field-height, 26px); }
  .chip {
    display: inline-flex; align-items: center; gap: 6px; height: var(--pp-field-height, 26px); padding: 0 9px;
    border: 1px solid #0E7C70; border-radius: 4px; background: #0B2320; color: #8FEDE3; font: inherit; cursor: pointer;
  }
  .chip.off { opacity: 0.6; border-style: dashed; }
  .chip .kd { color: #8A949C; font-size: 0.9em; }
  .add {
    height: var(--pp-field-height, 26px); padding: 0 9px; border: 1px dashed #4A5560; border-radius: 4px;
    background: transparent; color: inherit; font: inherit; cursor: pointer;
  }
  .add:hover { border-color: #3DDBB4; }
  .none { color: #8A949C; }
</style>
