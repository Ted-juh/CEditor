<script>
  /**
   * The thirteen flow modes, each drawn with the control's own text.
   *
   * Today these are thirteen buttons with words on them, and "perimeter" and "stair" are not words
   * that tell you what you are about to get. Each thumbnail is the real renderer given a clone in
   * that mode, so what you click is what you get.
   */
  import EffectPreview from '../effects/EffectPreview.svelte';
  import { FLOW_MODE_OPTIONS, POSITION_ROOT } from '../../utils/typographyModel.js';
  import { deepClone } from '../../utils/deepClone.js';

  let { control = null, mode = 'rotate', onpick = () => {} } = $props();

  function inMode(value) {
    if (!control) return control;
    const clone = deepClone(control);
    const position = clone?._children?.Text?._children?.Position;
    if (position) position.flowMode = value;
    return clone;
  }
</script>

<div class="modegrid" role="radiogroup" aria-label="Text flow mode">
  {#each FLOW_MODE_OPTIONS as option (option.value)}
    <button
      type="button"
      class="mode"
      class:on={option.value === mode}
      role="radio"
      aria-checked={option.value === mode}
      title={option.label}
      onclick={() => onpick(option.value)}
    >
      <span class="modebox">
        <EffectPreview control={inMode(option.value)} boxWidth={62} boxHeight={40} padding={2} maxScale={0.85} />
      </span>
      <span class="model">{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .modegrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }

  .mode {
    border: 1px solid #2E3540;
    border-radius: 3px;
    background: #0C0F12;
    padding: 0 0 4px;
    overflow: hidden;
    cursor: pointer;
  }
  .mode:hover { border-color: #45525C; }
  .mode.on { border-color: #0E7C70; box-shadow: 0 0 0 1px #0B2320; }

  .modebox { display: flex; align-items: center; justify-content: center; height: 40px; overflow: hidden; }

  .model {
    display: block;
    font: 500 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    text-align: center;
    margin-top: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mode.on .model { color: #8FEDE3; }
</style>
