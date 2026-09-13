<script>
  /**
   * The selected flow mode's parameters, and nothing else.
   *
   * This is the whole point of the Flow half. The properties panel renders all 26 flow controls at
   * every moment with exactly one `{#if}` between them, so with Circle picked you are shown wave
   * amplitude, spiral turns, stair unit and eight bezier numbers, every one inert and drawn exactly
   * like the two that work. `flowFieldsFor` is the renderer's own branching written down, so what
   * appears here is what the mode reads.
   */
  import TypeFieldRow from './TypeFieldRow.svelte';
  import { flowFieldsFor, curvePresetsFor, POSITION_ROOT } from '../../utils/typographyModel.js';

  let {
    mode = 'rotate',
    position = null,
    hiddenCount = 0,
    currentPreset = '',
    onset = () => {},
    onpreset = () => {},
  } = $props();

  let fields = $derived(flowFieldsFor(mode));
  let presets = $derived(curvePresetsFor(mode));
</script>

<div class="setbox">
  {#if presets.length}
    <div class="grp">Shape <span class="grpnote">drag the points, or start here</span></div>
    <div class="presets">
      {#each presets as preset (preset.id)}
        <button
          type="button"
          class:on={preset.id === currentPreset}
          title={`Set the whole path to ${preset.label}`}
          onclick={() => onpreset(preset)}
        >{preset.label}</button>
      {/each}
    </div>
  {/if}

  {#if fields.own.length}
    <div class="grp">This mode</div>
    {#each fields.own as field (field.key)}
      <TypeFieldRow {field} value={position?.[field.key]} onset={(key, value) => onset(POSITION_ROOT, key, value)} />
    {/each}
  {:else if !presets.length}
    <div class="grp">This mode</div>
    <p class="note">{mode === 'vertical' ? 'Vertical has no settings of its own — it walks a straight path down the box.' : 'This mode has no settings of its own.'}</p>
  {/if}

  {#if fields.shared.length}
    <div class="grp">Every path mode</div>
    {#each fields.shared as field (field.key)}
      <TypeFieldRow {field} value={position?.[field.key]} onset={(key, value) => onset(POSITION_ROOT, key, value)} />
    {/each}
  {/if}

  {#if hiddenCount > 0}
    <p class="hidden-note">
      The other <b>{hiddenCount}</b> {hiddenCount === 1 ? 'control belongs' : 'controls belong'} to modes
      you are not in. They are still stored and still exported, and reappear the moment you pick that mode.
    </p>
  {/if}
</div>

<style>
  .setbox { background: #1E1E1E; border: 1px solid #333; border-radius: 4px; padding: 8px; }

  .grp {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #616C75;
    margin: 12px 0 4px;
    padding-top: 8px;
    border-top: 1px solid #242424;
  }
  .grp:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
  .grpnote {
    font: 400 8.5px/1 'IBM Plex Sans', system-ui, sans-serif;
    letter-spacing: 0;
    text-transform: none;
    color: #14B8A6;
  }

  .presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .presets button {
    height: 22px;
    border: 1px solid #333;
    border-radius: 3px;
    background: #1A1A1A;
    font: 600 8.5px/20px 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
  }
  .presets button:hover { border-color: #4A555E; color: #9AA6AE; }
  .presets button.on { border-color: #0E7C70; background: #0B2320; color: #8FEDE3; }

  .note, .hidden-note {
    margin: 6px 0 0;
    font: 400 9.5px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
  }
  .hidden-note {
    margin-top: 10px;
    padding: 7px 8px;
    border: 1px dashed #33404A;
    border-radius: 4px;
    background: #0F1418;
    font-size: 9px;
  }
  .hidden-note b { color: #14B8A6; }
</style>
