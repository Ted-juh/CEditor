<script>
  /**
   * File → Export Picture (stores/pictureExport.js): the panel, the selection, or a filmstrip of
   * the selected control, as a PNG at 1 to 4 times its size.
   *
   *   The whole panel     as it is on the canvas, without the grid, guides, selection or hidden
   *                       controls: a mock-up, a product page, a manual.
   *   The selection       cropped to the selected controls, with the panel behind them or alone on
   *                       transparency (a control to put in a document or another design).
   *   A filmstrip         the one selected control at each of its values, one frame after another:
   *                       what JUCE's LookAndFeel, HISE and KnobMan read a knob or a switch from.
   *
   * What is drawn is what the page draws (utils/domPicture.js), so the picture is the canvas.
   */
  import { panels } from '../stores/panels.js';
  import {
    exportFilmstrip, exportPanelPicture, pictureExportRequest, pictureSize,
  } from '../stores/pictureExport.js';
  import { filmstripFrames } from '../utils/filmstripFrames.js';
  import { flatControls } from '../utils/containment.js';

  const SCALES = [1, 2, 3, 4];

  let request = $derived($pictureExportRequest);
  let what = $state('panel');
  let scale = $state(2);
  let alone = $state(false);
  let margin = $state(0);
  let frames = $state(64);
  let orientation = $state('vertical');
  let busy = $state(false);
  let openedFor = $state('');

  let panel = $derived(request ? $panels.find((entry) => entry.id === request.panelId) ?? null : null);
  let selected = $derived(panel && request
    ? flatControls(panel.controls ?? []).filter((control) => request.ids.includes(String(control?._children?.Core?.id)))
    : []);
  let single = $derived(selected.length === 1 ? selected[0] : null);
  let strip = $derived(single ? filmstripFrames(single, frames) : null);
  let stripFixed = $derived(strip?.ok && strip.kind !== 'range');

  $effect(() => {
    const key = request ? `${request.panelId}:${request.ids.join(',')}` : '';
    if (key === openedFor) return;
    openedFor = key;
    if (!request) return;
    // Open on what the author most likely means: with nothing selected the panel, with something
    // selected that, and never on a choice that cannot be made.
    what = request.ids.length ? 'selection' : 'panel';
    busy = false;
  });

  let width = $derived(Number(panel?.width) || 0);
  let height = $derived(Number(panel?.height) || 0);
  let size = $derived(pictureSize(width, height, scale));

  let frameSize = $derived.by(() => {
    const transform = single?._children?.Transform ?? {};
    const m = Math.max(0, Math.round(Number(margin) || 0));
    return { w: Math.round(Number(transform.width) || 1) + m * 2, h: Math.round(Number(transform.height) || 1) + m * 2 };
  });
  let stripCount = $derived(strip?.ok ? strip.frames.length : 0);
  let stripPixels = $derived({
    w: Math.round(frameSize.w * scale) * (orientation === 'horizontal' ? stripCount : 1),
    h: Math.round(frameSize.h * scale) * (orientation === 'horizontal' ? 1 : stripCount),
  });

  let canExport = $derived(!busy && !!panel && (
    what === 'panel' ? !size.tooLarge
      : what === 'selection' ? selected.length > 0
        : !!strip?.ok
  ));

  function close() {
    if (busy) return;
    pictureExportRequest.set(null);
  }

  async function run() {
    if (!canExport) return;
    busy = true;
    const options = { scale, margin: Number(margin) || 0 };
    try {
      const result = what === 'filmstrip'
        ? await exportFilmstrip({ ...options, controlId: single?._children?.Core?.id, frames: Number(frames) || 64, orientation })
        : await exportPanelPicture({ ...options, what, ids: request.ids, alone });
      if (result?.ok) pictureExportRequest.set(null);
    } finally {
      busy = false;
    }
  }

  function onKeydown(event) {
    if (!request) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Enter' && event.target?.tagName !== 'BUTTON') { event.preventDefault(); run(); }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if request}
  <div class="backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Export Picture" data-testid="picture-export">
      <div class="title">Export Picture</div>
      <p class="muted">A PNG, drawn as the canvas draws it, without the grid, guides, selection and hidden controls.</p>

      <label class="option" class:on={what === 'panel'}>
        <input type="radio" name="picture-what" value="panel" bind:group={what} />
        <span><b>The whole panel</b><em>{width} × {height}, as the canvas shows it now (in Preview, at the values it shows there).</em></span>
      </label>
      <label class="option" class:on={what === 'selection'} class:off={!selected.length}>
        <input type="radio" name="picture-what" value="selection" bind:group={what} disabled={!selected.length} />
        <span><b>The selection</b><em>{selected.length ? `${selected.length} control${selected.length === 1 ? '' : 's'}, cropped to what they draw.` : 'Select controls on the canvas first.'}</em></span>
      </label>
      <label class="option" class:on={what === 'filmstrip'} class:off={!strip?.ok}>
        <input type="radio" name="picture-what" value="filmstrip" bind:group={what} disabled={!strip?.ok} />
        <span><b>A filmstrip of the selected control</b><em>{#if !single}Select one knob, slider, meter, switch, button or component.{:else if !strip?.ok}{strip?.reason}.{:else}Every position in one picture, one frame after another: for JUCE, HISE or KnobMan.{/if}</em></span>
      </label>

      <div class="group">Size</div>
      <div class="segmented" role="radiogroup" aria-label="Size">
        {#each SCALES as option (option)}
          <button type="button" role="radio" aria-checked={scale === option} class:on={scale === option} onclick={() => { scale = option; }}>{option}×</button>
        {/each}
      </div>

      {#if what === 'selection'}
        <label class="check"><input type="checkbox" bind:checked={alone} /> Only the selected controls, on a transparent background</label>
        <label class="field inline"><span>Margin</span><input type="number" min="0" max="200" step="1" bind:value={margin} /> px</label>
      {:else if what === 'filmstrip'}
        <label class="field inline"><span>Frames</span>
          <input type="number" min="2" max="512" step="1" bind:value={frames} disabled={stripFixed} />
          {#if stripFixed}<em class="muted">{stripCount}: one for each {strip.kind === 'list' ? 'entry' : 'position'}</em>{/if}
        </label>
        <div class="segmented" role="radiogroup" aria-label="Direction">
          <button type="button" role="radio" aria-checked={orientation === 'vertical'} class:on={orientation === 'vertical'} onclick={() => { orientation = 'vertical'; }}>Frames down</button>
          <button type="button" role="radio" aria-checked={orientation === 'horizontal'} class:on={orientation === 'horizontal'} onclick={() => { orientation = 'horizontal'; }}>Frames across</button>
        </div>
        <label class="field inline"><span>Margin</span><input type="number" min="0" max="200" step="1" bind:value={margin} /> px</label>
      {/if}

      <p class="muted" data-testid="picture-size">
        {#if what === 'panel'}
          {size.pixelWidth} × {size.pixelHeight} pixels{size.tooLarge ? ' — too large to draw; choose a smaller size' : ''}.
        {:else if what === 'filmstrip' && strip?.ok}
          {stripCount} frames of {Math.round(frameSize.w * scale)} × {Math.round(frameSize.h * scale)}: {stripPixels.w} × {stripPixels.h} pixels.
        {:else if what === 'selection'}
          {scale} pixels for each panel pixel; the size follows the selection.
        {/if}
      </p>

      <div class="actions">
        <button class="btn" type="button" onclick={close} disabled={busy}>Cancel</button>
        <button class="btn primary" type="button" onclick={run} disabled={!canExport}>{busy ? 'Drawing…' : 'Export…'}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 1250; background: rgba(0, 0, 0, 0.55); display: flex; align-items: center; justify-content: center; }
  .dialog {
    width: 470px; max-width: calc(100vw - 48px); max-height: calc(100vh - 64px); overflow-y: auto; box-sizing: border-box;
    background: #252526; border: 1px solid #3A3A3A; border-radius: 8px; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
    padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; color: #DDD; font-size: 12px;
  }
  .title { font-size: 15px; font-weight: 600; color: #EEE; }
  .muted { margin: 2px 0; color: #8F8F8F; font-size: 11px; font-style: normal; }
  .group { margin-top: 8px; color: #6FA8C7; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
  .option { display: flex; gap: 8px; align-items: flex-start; padding: 7px 9px; border: 1px solid #333; border-radius: 5px; cursor: pointer; }
  .option.on { border-color: #0B6EB5; background: #10273A; }
  .option.off { opacity: 0.55; cursor: default; }
  .option input { margin: 2px 0 0; accent-color: #5B9BD5; }
  .option b { display: block; color: #EEE; font-weight: 600; }
  .option em { display: block; color: #999; font-style: normal; font-size: 11px; line-height: 1.4; }
  .segmented { display: flex; gap: 0; border: 1px solid #3A3A3A; border-radius: 4px; overflow: hidden; align-self: flex-start; }
  .segmented button { height: 26px; padding: 0 12px; border: 0; border-right: 1px solid #3A3A3A; background: #1E1E1E; color: #BBB; font: inherit; cursor: pointer; }
  .segmented button:last-child { border-right: 0; }
  .segmented button.on { background: #094771; color: #fff; }
  .check { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
  .check input { accent-color: #5B9BD5; }
  .field.inline { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .field span { color: #6FA8C7; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; min-width: 52px; }
  .field input { width: 72px; height: 24px; padding: 0 6px; border: 1px solid #3A3A3A; border-radius: 3px; background: #1A1A1A; color: #DDD; font: inherit; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  .btn { height: 28px; padding: 0 14px; border: 1px solid #3A3A3A; border-radius: 4px; background: #2C2C2C; color: #DDD; font: inherit; font-weight: 600; cursor: pointer; }
  .btn.primary { background: #094771; border-color: #0B6EB5; color: #fff; }
  .btn:disabled { opacity: 0.45; cursor: default; }
</style>
