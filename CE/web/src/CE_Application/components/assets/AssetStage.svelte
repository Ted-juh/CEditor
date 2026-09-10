<script>
  /**
   * The asset, at a size you can judge — and, for a filmstrip, the arithmetic checked.
   *
   * A filmstrip is drawn as a run of frames with the boundaries visible, not as one tall image.
   * The properties panel shows the whole strip in a box capped at 178px, so 128 frames arrive as a
   * grey smear and the question "does this strip really hold 128 frames?" is not answerable from
   * the picture. Here each frame is its own box, positioned by `frameBackground` — the same
   * proportional CSS `InteractivePartRenderer` uses — so a strip that does not divide evenly shows
   * the drift rather than hiding it. Computing pixel offsets here instead would draw a tidy strip
   * and ship a broken one.
   *
   * The check bar under it is the finding this tab was built for: `height % frameCount === 0` is
   * the whole test, the application has never run it, and when it fails the nearest counts that do
   * divide are one click away.
   */
  import ChevronLeft from 'lucide-svelte/icons/chevron-left';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import NumberCell from '../../properties/NumberCell.svelte';
  import {
    frameBackground,
    frameWindow,
    frameDivision,
    suggestFrameCounts,
    imageSizeCheck,
    stepFrame,
  } from '../../utils/assetsModel.js';

  let {
    entry = null,
    natural = { width: 0, height: 0, pending: false },
    frameIndex = 0,
    onframe = () => {},
    onfix = () => {},
    onrecordsize = () => {},
  } = $props();

  const GAP = 3;
  /** Inner height of the stage box, less its padding. */
  const STAGE_HEIGHT = 132;
  /** How many frames the stage aims to show. Enough that stepping reads as movement along a strip
   *  rather than a slideshow, few enough that each frame is still a picture. */
  const TARGET_FRAMES = 9;
  const MIN_BOX = 20;

  let stageWidth = $state(560);

  let isFilm = $derived(entry?.kind === 'filmstrip');
  let rendering = $derived(entry?.interpolation === 'nearest' ? 'pixelated' : 'auto');

  // One frame's shape. The measured strip wins over the stored frame size: the stored one is
  // rounded at import and is exactly what goes wrong when the count is off.
  let frameAspect = $derived.by(() => {
    const count = Math.max(1, entry?.frameCount ?? 1);
    if (natural.width > 0 && natural.height > 0) {
      return entry?.orientation === 'horizontal'
        ? (natural.width / count) / natural.height
        : natural.width / (natural.height / count);
    }
    if (entry?.frameWidth > 0 && entry?.frameHeight > 0) return entry.frameWidth / entry.frameHeight;
    return 1;
  });

  // Frame boxes are sized from the space, not from a fixed height. A 34x7 frame blown up to a
  // 128px-tall box would be five hundred pixels wide and two of them would fill the stage; a square
  // one at the same height leaves the row half empty. So: aim for TARGET_FRAMES across, keep the
  // frame's real shape, and let the height fall out of that — capped by the stage, floored so a
  // very wide frame does not become a line.
  let innerWidth = $derived(Math.max(40, stageWidth - 16));
  let boxWidth = $derived.by(() => {
    const share = Math.floor((innerWidth + GAP) / TARGET_FRAMES) - GAP;
    const byHeight = STAGE_HEIGHT * frameAspect;
    return Math.max(MIN_BOX, Math.min(innerWidth, Math.round(Math.min(share, byHeight))));
  });
  let boxHeight = $derived(Math.max(MIN_BOX, Math.min(STAGE_HEIGHT, Math.round(boxWidth / frameAspect))));
  let capacity = $derived(Math.max(1, Math.floor((innerWidth + GAP) / (boxWidth + GAP))));
  // Not called `window`: shadowing the global inside a component is legal and a trap.
  let visibleFrames = $derived(frameWindow({ frameCount: entry?.frameCount ?? 1, frameIndex, capacity }));

  let division = $derived(frameDivision({
    width: natural.width,
    height: natural.height,
    frameCount: entry?.frameCount ?? 1,
    orientation: entry?.orientation,
  }));
  let offers = $derived(division.known && !division.divides ? suggestFrameCounts(division.total, division.frameCount, 3) : []);

  let sizeCheck = $derived(imageSizeCheck({
    stored: { width: entry?.width ?? 0, height: entry?.height ?? 0 },
    measured: natural,
  }));

  function boxStyle(index) {
    if (!entry?.hasSource) return `width:${boxWidth}px;height:${boxHeight}px`;
    const css = frameBackground({ frameCount: entry.frameCount, frameIndex: index, orientation: entry.orientation });
    return [
      `width:${boxWidth}px`,
      `height:${boxHeight}px`,
      `background-image:url("${entry.source.replaceAll('"', '\\"')}")`,
      `background-size:${css.backgroundSize}`,
      `background-position:${css.backgroundPosition}`,
      'background-repeat:no-repeat',
      `image-rendering:${rendering}`,
    ].join(';');
  }

  function step(delta) {
    onframe(stepFrame(frameIndex, delta, entry?.frameCount ?? 1));
  }
</script>

{#if entry}
  <div class="stagewrap">
    <div class="stage" bind:clientWidth={stageWidth} class:film={isFilm}>
      {#if !entry.hasSource}
        <p class="nosource">This asset has no image yet. Import one, or paste a source in the properties panel.</p>
      {:else if isFilm}
        <div class="strip" style={`gap:${GAP}px`}>
          {#each visibleFrames.indices as index (index)}
            <button
              type="button"
              class="frame"
              class:cur={index === frameIndex}
              style={boxStyle(index)}
              title={`Frame ${index + 1} of ${entry.frameCount}`}
              aria-label={`Frame ${index + 1}`}
              aria-pressed={index === frameIndex}
              onclick={() => onframe(index)}
            ></button>
          {/each}
        </div>
      {:else}
        <img class="flat" src={entry.source} alt={entry.name} style={`image-rendering:${rendering}`} />
      {/if}
    </div>

    {#if isFilm && entry.hasSource}
      <div class="bar">
        <span class="stepper">
          <button type="button" disabled={frameIndex <= 0} onclick={() => step(-1)} aria-label="Previous frame">
            <ChevronLeft size={12} />
          </button>
          <button type="button" disabled={frameIndex >= entry.frameCount - 1} onclick={() => step(1)} aria-label="Next frame">
            <ChevronRight size={12} />
          </button>
        </span>
        <span class="readout">frame <b>{frameIndex + 1}</b> of {entry.frameCount}</span>
        <span class="numcell">
          <!-- A frame scrubber would be a horizontal slider wearing a different hat, and the rule
               for this whole family of tabs is that there are none. Steppers, a typed value and the
               strip itself are three ways in without one. -->
          <NumberCell
            value={frameIndex + 1}
            min={1}
            max={entry.frameCount}
            step={1}
            label="Frame"
            onchange={(value) => onframe(Math.round(value) - 1)}
          />
        </span>
      </div>
    {/if}

    {#if isFilm && entry.hasSource}
      {#if natural.pending}
        <div class="check">Measuring the strip…</div>
      {:else if !division.known}
        <div class="check">Could not measure this strip, so the frame count cannot be checked.</div>
      {:else if division.overSliced}
        <div class="check bad">
          <b>{division.frameCount} frames in {division.total}px.</b>
          There are fewer pixels along the {division.axis} than frames, so most frames have nothing
          to show. Either the count is wrong or this is not the strip you meant.
        </div>
      {:else if division.divides}
        <div class="check good">
          <b>{division.total} ÷ {division.frameCount} = {division.framePixels}px per frame.</b>
          Frames land on pixel boundaries.
        </div>
      {:else}
        <div class="check bad">
          <b>{division.total} ÷ {division.frameCount} = {division.framePixels.toFixed(2)}px per frame — not whole.</b>
          The renderer positions frames proportionally, so these drift and the last frames show part
          of a neighbour.
          {#if offers.length}
            <span class="fixes">
              {#each offers as offer (offer)}
                <button type="button" onclick={() => onfix(offer)} title={`Set the frame count to ${offer}, which divides ${division.total} evenly`}>
                  use {offer} <i>({division.total / offer}px)</i>
                </button>
              {/each}
            </span>
          {:else}
            <span class="nofix">No smaller frame count divides {division.total} evenly — the strip itself needs re-exporting.</span>
          {/if}
        </div>
      {/if}
    {:else if !isFilm && entry.hasSource}
      {#if natural.pending}
        <div class="check">Measuring the image…</div>
      {:else if !sizeCheck.known}
        <div class="check">Could not measure this image.</div>
      {:else if sizeCheck.matches}
        <div class="check good"><b>{sizeCheck.width}×{sizeCheck.height}.</b> Matches the size recorded on the asset.</div>
      {:else}
        <div class="check bad">
          <b>{sizeCheck.width}×{sizeCheck.height} measured.</b>
          The asset records {sizeCheck.recorded ? `${sizeCheck.storedWidth}×${sizeCheck.storedHeight}` : 'no size at all'},
          and that recorded size is what goes into the exported package.
          <span class="fixes">
            <button type="button" onclick={onrecordsize}>record {sizeCheck.width}×{sizeCheck.height}</button>
          </span>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .stagewrap { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

  .stage {
    height: 148px;
    border: 1px solid #333;
    border-radius: 4px;
    background: #0C0F12;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 8px;
    box-sizing: border-box;
  }

  .strip { display: flex; align-items: center; height: 100%; }

  /* Each frame is a box of its own, so the gap between them IS the frame boundary — no drawn
     lines to fall out of step with the arithmetic. */
  .frame {
    padding: 0;
    border: 1px solid #223038;
    border-radius: 2px;
    background-color: #0E1317;
    cursor: pointer;
    flex: 0 0 auto;
  }
  .frame:hover { border-color: #4A555E; }
  .frame.cur { border-color: #14B8A6; box-shadow: 0 0 0 1px rgba(20, 184, 166, 0.35); }

  .flat { max-width: 100%; max-height: 100%; object-fit: contain; }

  .nosource {
    margin: 0;
    max-width: 40ch;
    text-align: center;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #69737B;
  }

  .bar { display: flex; align-items: center; gap: 8px; }

  .stepper { display: flex; gap: 2px; }
  .stepper button {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid #333B42;
    background: #12171A;
    color: #9AA6AE;
    border-radius: 3px;
    cursor: pointer;
  }
  .stepper button:hover:not(:disabled) { border-color: #4A555E; color: #E8EEF5; }
  .stepper button:disabled { opacity: 0.35; cursor: default; }

  .readout {
    font: 400 10px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #8A949C;
    white-space: nowrap;
  }
  .readout b { color: #EAF5FF; font-weight: 600; }

  .numcell { margin-left: auto; width: 108px; flex: 0 0 auto; }

  .check {
    border: 1px solid #2E3540;
    border-radius: 4px;
    background: #12171A;
    padding: 6px 8px;
    font: 400 9.5px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #8A949C;
  }
  .check b { color: #C3D0DA; font-weight: 600; }
  .check.good { border-color: #2C5A44; background: #10201A; color: #93C4AC; }
  .check.good b { color: #A9E7C9; }
  .check.bad { border-color: #6B4A1E; background: #221D12; color: #D9BE8A; }
  .check.bad b { color: #F0D48A; }

  .fixes { display: flex; gap: 4px; margin-top: 5px; flex-wrap: wrap; }
  .fixes button {
    border: 1px solid #6B4A1E;
    background: #2A2213;
    color: #F0D48A;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 4px 7px;
    border-radius: 3px;
    cursor: pointer;
  }
  .fixes button:hover { border-color: #E5A029; color: #FFF1D2; }
  .fixes button i { font-style: normal; opacity: 0.7; }

  .nofix { display: block; margin-top: 4px; opacity: 0.85; }
</style>
