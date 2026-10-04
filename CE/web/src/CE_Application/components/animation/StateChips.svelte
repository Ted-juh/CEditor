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
      <TriangleAlert size={12} aria-hidden="true" /> {name}
    </button>
  {/each}
</div>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 5px; min-width: 0; }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid #3A434D;
    border-radius: 14px;
    background: #12161A;
    color: #AEB9C4;
    font: 400 13px/1 'IBM Plex Sans', system-ui, sans-serif;
    cursor: pointer;
    white-space: nowrap;
  }
  .chip:hover { border-color: #5B6670; color: #E8EEF3; }
  .chip.on { border-color: #5AA9E6; background: #173A5A; color: #FFFFFF; font-weight: 500; }
  .chip.any { font-style: italic; }
  .chip.bad { border-color: #7A5C16; background: #2E2410; color: #F6D58A; }
  .chip.bad:hover { border-color: #C9A244; }
</style>
