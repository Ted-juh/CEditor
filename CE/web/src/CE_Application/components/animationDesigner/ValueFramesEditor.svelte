<script>
  /**
   * A value effect's frames (step 6, utils/valueDrawn.js): for each, when in the clip, and where the
   * value is drawn then — the value itself, a point of the range, or so far from the value. The last
   * frame is the hand-back, and the editor says so when it is not the value itself.
   */
  import NumberCell from '../../properties/NumberCell.svelte';
  import PropertySelect from '../../properties/PropertySelect.svelte';
  import { cleanValueFrames } from '../../utils/sceneFormat.js';

  let { frames = [], onchange = () => {} } = $props();

  const MODES = [
    { value: 'live', label: 'The value' },
    { value: 'at', label: 'At' },
    { value: 'by', label: 'The value +' },
  ];
  const modeOf = (frame) => (Number.isFinite(frame?.value) ? 'at' : Number.isFinite(frame?.by) ? 'by' : 'live');
  const pct = (n) => Math.round(n * 1000) / 10;

  function write(list) {
    const cleaned = cleanValueFrames(list);
    if (cleaned) onchange(cleaned);
  }
  function setFrame(index, patch) {
    write(frames.map((frame, i) => (i === index ? { ...frame, ...patch } : frame)));
  }
  function setMode(index, mode) {
    const { value, by, ...rest } = frames[index];
    const next = mode === 'at' ? { ...rest, value: 1 } : mode === 'by' ? { ...rest, by: 0.05 } : rest;
    write(frames.map((frame, i) => (i === index ? next : frame)));
  }
  function add() {
    const last = frames[frames.length - 1];
    const before = frames[frames.length - 2] ?? { at: 0 };
    const at = last ? (before.at + last.at) / 2 : 0.5;
    write([...frames, { at, value: 0.5 }]);
  }
  function remove(index) {
    if (frames.length > 2) write(frames.filter((_, i) => i !== index));
  }
  let handsBack = $derived(modeOf(frames[frames.length - 1]) === 'live');
</script>

<div class="vf" data-value-frames>
  {#each frames as frame, index (index)}
    <div class="row" data-value-frame={index}>
      <div class="cell at"><NumberCell label="%" value={pct(frame.at)} min={0} max={100} step={5}
                                       onchange={(value) => setFrame(index, { at: Math.max(0, Math.min(1, value / 100)) })} /></div>
      <div class="cell mode"><PropertySelect ariaLabel="Drawn at" value={modeOf(frame)} options={MODES} onchange={(mode) => setMode(index, mode)} /></div>
      {#if modeOf(frame) === 'at'}
        <div class="cell amt"><NumberCell label="%" value={pct(frame.value)} min={0} max={100} step={5}
                                          onchange={(value) => setFrame(index, { value: Math.max(0, Math.min(1, value / 100)) })} /></div>
      {:else if modeOf(frame) === 'by'}
        <div class="cell amt"><NumberCell label="%" value={pct(frame.by)} min={-100} max={100} step={1}
                                          onchange={(value) => setFrame(index, { by: Math.max(-1, Math.min(1, value / 100)) })} /></div>
      {:else}
        <div class="cell amt"></div>
      {/if}
      <button type="button" class="x" aria-label="Remove frame" disabled={frames.length <= 2} onclick={() => remove(index)}>×</button>
    </div>
  {/each}
  <button type="button" class="tb" onclick={add}>+ Frame</button>
  {#if !handsBack}
    <p class="warn" data-value-handback>It ends away from the value; the value is drawn again as soon as the clip ends.</p>
  {/if}
</div>

<style>
  .vf { display: flex; flex-direction: column; gap: 5px; }
  .row { display: grid; grid-template-columns: 70px minmax(0, 1fr) 70px 22px; gap: 5px; align-items: center; }
  .cell { min-width: 0; }
  .x { width: 22px; height: 22px; border: 1px solid #3A434D; border-radius: 4px; background: #1E2328; color: #CCD3DA; cursor: pointer; padding: 0; }
  .x:disabled { opacity: 0.35; cursor: default; }
  .tb { align-self: flex-start; height: 26px; padding: 0 10px; border: 1px solid #3A434D; border-radius: 5px; background: #1E2328; color: #E8EEF3; font: 400 12px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer; }
  .warn { margin: 0; color: #F6D58A; font-size: 12px; }
</style>
