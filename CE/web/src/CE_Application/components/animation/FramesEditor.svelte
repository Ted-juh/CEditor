<script>
  /**
   * A keyframe animation's frames: where each sits in one cycle, and what it sets.
   *
   * The strip along the top is the cycle, left to right, with a mark for every frame. Each row below
   * is one frame — its position and the five things a frame can set. A cell left empty is not
   * "zero": the property is left out of that frame and eases through it from the frames either side,
   * which is how a pulse can scale without also fading. utils/animationModel.js does the edits and
   * utils/keyframeAnimation.js turns the frames into CSS.
   */
  import Plus from 'lucide-svelte/icons/plus';
  import X from 'lucide-svelte/icons/x';
  import NumberCell from '../../properties/NumberCell.svelte';
  import { addFrame, removeFrame, setFrameValue } from '../../utils/animationModel.js';

  let {
    frames = [],
    onchange = () => {},
  } = $props();

  // The column heads name each value; the cells carry none of their own. Rotation is in degrees and
  // x/y in pixels, as the head says.
  const COLUMNS = [
    { key: 'scale', head: 'scale', step: 0.01 },
    { key: 'rotate', head: 'turn °', step: 1 },
    { key: 'x', head: 'x px', step: 1 },
    { key: 'y', head: 'y px', step: 1 },
    { key: 'opacity', head: 'opacity', step: 0.05 },
  ];

  const percent = (at) => Math.round(at * 1000) / 10;
</script>

<div class="frames">
  <div class="strip" aria-hidden="true">
    {#each frames as frame, index (index)}
      <span class="mark" style="left:{percent(frame.at)}%" title={`${percent(frame.at)}%`}></span>
    {/each}
  </div>
  <div class="head" aria-hidden="true">
    <span>at %</span>
    {#each COLUMNS as column (column.key)}<span>{column.head}</span>{/each}
    <span></span>
  </div>
  {#each frames as frame, index (index)}
    <div class="frow">
      <div class="cell"><NumberCell label="%" value={percent(frame.at)} step={5} min={0} max={100}
        ariaLabel={`Frame ${index + 1} position`}
        onchange={(value) => onchange(setFrameValue(frames, index, 'at', value))} /></div>
      {#each COLUMNS as column (column.key)}
        <div class="cell"><NumberCell value={frame[column.key] ?? ''} allowEmpty
          step={column.step} ariaLabel={`Frame ${index + 1} ${column.key}`}
          onchange={(value) => onchange(setFrameValue(frames, index, column.key, value))} /></div>
      {/each}
      <button type="button" class="drop" title="Remove this frame" aria-label={`Remove frame ${index + 1}`}
              disabled={frames.length <= 1}
              onclick={() => onchange(removeFrame(frames, index))}>
        <X size={10} />
      </button>
    </div>
  {/each}
  <button type="button" class="addframe" onclick={() => onchange(addFrame(frames))}>
    <Plus size={11} /> Add a frame
  </button>
</div>

<style>
  .frames { border: 1px solid #333; border-radius: 4px; background: #1A1D20; padding: 8px; }
  .strip {
    position: relative;
    height: 10px;
    margin: 2px 6px 8px;
    border-radius: 5px;
    background: linear-gradient(90deg, #173449, #0B2320);
  }
  .mark {
    position: absolute;
    top: 1px;
    width: 8px;
    height: 8px;
    margin-left: -4px;
    border-radius: 50%;
    background: #8FEDE3;
    box-shadow: 0 0 0 1px #0C0F12;
  }
  .head, .frow {
    display: grid;
    grid-template-columns: 62px repeat(5, minmax(0, 1fr)) 18px;
    gap: 3px;
    align-items: center;
  }
  .head span {
    font: 600 7.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #4B545C;
    padding: 0 2px 3px;
  }
  .frow { margin-top: 3px; }
  .cell { min-width: 0; display: flex; }
  .drop {
    width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;
    padding: 0; border: 1px solid transparent; border-radius: 3px; background: transparent;
    color: #4B545C; cursor: pointer;
  }
  .drop:hover:not(:disabled) { border-color: #5C3A3A; color: #D98C8C; }
  .drop:disabled { opacity: 0.3; cursor: default; }
  .addframe {
    width: 100%; margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 4px;
    border: 1px solid #0E7C70; background: #0B2320; color: #8FEDE3;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif; padding: 6px; border-radius: 3px; cursor: pointer;
  }
  .addframe:hover { border-color: #14B8A6; color: #C9FFF8; }
</style>
