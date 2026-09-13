<script>
  /**
   * The specimen and the weight ramp.
   *
   * The ramp is the part worth having: it draws the control's own text at each weight the selected
   * family actually offers, so picking 600 over 500 is a matter of looking at the two rather than
   * choosing a number from a list. A family with one weight gets no ramp at all — five identical
   * thumbnails would be worse than none.
   */
  import EffectPreview from '../effects/EffectPreview.svelte';
  import { WEIGHT_OPTIONS } from '../../stores/appSettings.js';
  import { deepClone } from '../../utils/deepClone.js';

  let {
    control = null,
    weight = 400,
    supportsWeight = false,
    onweight = () => {},
  } = $props();

  // A variable face can be set to any of the nine; a static one realistically has regular and bold,
  // and offering seven weights it does not have would draw seven identical specimens.
  let weights = $derived(supportsWeight ? WEIGHT_OPTIONS : WEIGHT_OPTIONS.filter((w) => w.value === 400 || w.value === 700));

  function atWeight(value) {
    if (!control) return control;
    const clone = deepClone(control);
    const font = clone?._children?.Text?._children?.Font;
    if (font) {
      font.weightValue = value;
      font.weight = value >= 700 ? 'Bold' : 'Regular';
    }
    return clone;
  }
</script>

<div class="speccol">
  <div class="spec">
    <EffectPreview {control} boxWidth={420} boxHeight={120} padding={12} maxScale={3} label="Type specimen" />
  </div>

  {#if weights.length > 1}
    <div class="ramph">Weights <s>{weights.length}</s></div>
    <div class="ramp" role="radiogroup" aria-label="Font weight">
      {#each weights as option (option.value)}
        <button
          type="button"
          class="rampcell"
          class:on={Number(weight) === option.value}
          role="radio"
          aria-checked={Number(weight) === option.value}
          title={option.label}
          onclick={() => onweight(option.value)}
        >
          <span class="box">
            <EffectPreview control={atWeight(option.value)} boxWidth={78} boxHeight={30} fit="cover" zoom={1.15} maxScale={1.1} />
          </span>
          <span class="n">{option.value}</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="single">This family has one weight.</p>
  {/if}
</div>

<style>
  .speccol { display: flex; flex-direction: column; min-width: 0; }

  .spec {
    background: #0C0F12;
    border: 1px solid #333;
    border-radius: 4px;
    height: 124px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .ramph {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #616C75;
    margin: 10px 0 6px;
  }
  .ramph s { margin-left: auto; text-decoration: none; }

  .ramp { display: flex; gap: 5px; }

  .rampcell {
    flex: 1;
    min-width: 0;
    border: 1px solid #2E3540;
    border-radius: 3px;
    background: #0C0F12;
    padding: 0 0 4px;
    cursor: pointer;
    overflow: hidden;
  }
  .rampcell:hover { border-color: #45525C; }
  .rampcell.on { border-color: #5B9BD5; box-shadow: 0 0 0 1px #173449; }

  .box { display: flex; align-items: center; justify-content: center; height: 30px; overflow: hidden; }

  .n {
    display: block;
    font: 500 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    text-align: center;
    margin-top: 4px;
  }
  .rampcell.on .n { color: #5B9BD5; }

  .single { margin: 10px 0 0; font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif; color: #616C75; }
</style>
