<script>
  /**
   * A trigger's From or To list, as chips.
   *
   * These were free text boxes. The runtime compares state names and nothing else, so "presed"
   * typed into one was not an error anywhere — it was an animation that never played. Now the
   * chips are the control's own States, plus "*" (any) and "default" (no state at all), and a name
   * the control does not have is still shown — as it was typed, marked, and one click from gone —
   * rather than hidden, because hiding it would make the animation look fine.
   *
   * utils/animationModel.js has the rules (toggleTriggerState: "*" and named states exclude each
   * other, and an empty list means any).
   */
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import { toggleTriggerState, ANY_STATE, DEFAULT_STATE } from '../../utils/animationModel.js';

  let {
    choices = [],
    value = [],
    unknown = [],
    ariaLabel = '',
    onchange = () => {},
  } = $props();

  let chosen = $derived(new Set((value ?? []).map((name) => String(name).trim().toLowerCase()).filter(Boolean)));
  let anyOn = $derived(!chosen.size || chosen.has(ANY_STATE));

  const label = (name) => (name === ANY_STATE ? 'any' : name);
  const title = (name) => {
    if (name === ANY_STATE) return 'Any state at all';
    if (name === DEFAULT_STATE) return 'No state active — the control at rest';
    return `The ${name} state`;
  };
</script>

<div class="chips" role="group" aria-label={ariaLabel}>
  {#each choices as name (name)}
    {@const on = name === ANY_STATE ? anyOn : chosen.has(name)}
    <button type="button" class="chip" class:on class:any={name === ANY_STATE}
            aria-pressed={on} title={title(name)}
            onclick={() => onchange(toggleTriggerState(value, name))}>
      {label(name)}
    </button>
  {/each}
  {#each unknown as name (name)}
    <button type="button" class="chip on bad" aria-pressed="true"
            title={`This control has no state called "${name}". Click to remove it.`}
            onclick={() => onchange(toggleTriggerState(value, name))}>
      <TriangleAlert size={9} aria-hidden="true" /> {name}
    </button>
  {/each}
</div>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 3px; min-width: 0; }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 20px;
    padding: 0 7px;
    border: 1px solid #333B42;
    border-radius: 10px;
    background: #12171A;
    color: #8A949C;
    font: 500 9px/1 'IBM Plex Mono', ui-monospace, monospace;
    cursor: pointer;
    white-space: nowrap;
  }
  .chip:hover { border-color: #4A555E; color: #E8EEF5; }
  .chip.on { border-color: #5B9BD5; background: #173449; color: #EAF5FF; }
  .chip.any { font-style: italic; }
  .chip.bad { border-color: #6B4A1E; background: #241d10; color: #F0D48A; }
  .chip.bad:hover { border-color: #E5A029; }
</style>
