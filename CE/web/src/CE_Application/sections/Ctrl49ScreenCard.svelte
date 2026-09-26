<script>
  /**
   * The CTRL49's screen, in the app.
   *
   * Runs the display page the app uploads to the keyboard (tools/ctrl49/Hostage_MultiKnob.lua —
   * the same file, bundled, not a copy) on the bytes the broker built for the keyboard, so what
   * is drawn here is what the device draws. It works with no keyboard at all: the broker still
   * pages and paints, and the controls here press the keyboard's own buttons through it — Page
   * Left/Right, the eight encoders (drag or scroll on a knob, or the steppers), the encoder
   * switches (click a knob) and the pads. The keyboard, when there is one, follows along.
   *
   * The page and its images are loaded on demand, so a build that cannot reach them (a test
   * harness serving only CE/web) loses this card and nothing else.
   */
  import { onDestroy } from 'svelte';
  import ChevronLeft from 'lucide-svelte/icons/chevron-left';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import { ctrl49Screen, hostSurface, surfaceInput, setControlSlotValue } from '../stores/instrumentHost.js';
  import { createCtrl49Screen } from '../screen/ctrl49Runtime.js';

  const KIND = { control: 'Controls', performance: 'Performance', browse: 'Sound browser' };
  const DRAG_STEP = 4;                   // pixels of drag per encoder detent

  let canvas = $state();
  let runtime = $state(null);
  let failure = $state('');
  let hoverSlot = $state(-1);
  let editingSlot = $state(-1);

  $effect(() => {
    if (!canvas) return;
    let cancelled = false;
    let made = null;
    (async () => {
      const [lua, strip, logo] = await Promise.all([
        import('../../../../../tools/ctrl49/Hostage_MultiKnob.lua?raw'),
        import('../../../../../tools/ctrl49/knob_strip.png?url'),
        import('../../../../../tools/ctrl49/hostage_logo.png?url'),
      ]);
      // The object ids the broker uploads them under before binding the page.
      return createCtrl49Screen(canvas, { lua: lua.default, assets: { 0x0200: strip.default, 0x0210: logo.default } });
    })()
      .then((s) => { if (cancelled) s.dispose(); else { made = s; runtime = s; } })
      .catch((e) => { if (!cancelled) failure = `The screen could not be drawn: ${e?.message ?? e}`; });
    return () => { cancelled = true; made?.dispose(); runtime = null; };
  });

  onDestroy(() => runtime?.dispose());

  // The splash while the keyboard is starting up, as the keyboard itself shows it, and before the
  // broker has said anything at all.
  const splash = $derived(!$ctrl49Screen.received || $ctrl49Screen.labels.length === 0
                          || $hostSurface.state === 'connecting');

  $effect(() => {
    const screen = $ctrl49Screen;
    const showSplash = splash;
    if (!runtime) return;
    try {
      runtime.call('init', []);
      if (showSplash) {
        runtime.call('set_mode', [0]);
      } else {
        runtime.call('set_mode', [1]);
        runtime.call('set_labels', screen.labels);
        runtime.call('set_values', screen.values);
      }
      runtime.call('draw', []);
      failure = '';
    } catch (e) {
      failure = `The display page failed: ${e?.message ?? e}`;
    }
  });

  // The eight labels and values, read back out of the same payloads the page draws:
  // set_labels [titleLen][title][8 x [len][label]], set_values [active][v0..v7].
  const slots = $derived.by(() => {
    const { labels, values } = $ctrl49Screen;
    const out = [];
    let at = 1 + (labels[0] ?? 0);
    for (let i = 0; i < 8; i++) {
      const length = labels[at] ?? 0;
      const label = String.fromCharCode(...labels.slice(at + 1, at + 1 + length));
      at += 1 + length;
      out.push({ label, value: values[1 + i] ?? 0 });
    }
    return out;
  });
  const activeSlot = $derived($ctrl49Screen.values[0] ?? 0);

  // Which knob is under the pointer, in the page's own 480x272 coordinates (knob_pos in the Lua:
  // four columns 118 px apart from x 31, two rows from y 32 and 150, each knob 64 px plus label).
  function slotAt(event) {
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) * 480) / box.width;
    const y = ((event.clientY - box.top) * 272) / box.height;
    if (y < 28 || x < 12 || x > 468) return -1;
    const col = Math.max(0, Math.min(3, Math.floor((x - 13) / 118)));
    const row = y < 146 ? 0 : 1;
    return row * 4 + col;
  }

  const turn = (slot, detents) => {
    for (let i = 0; i < Math.min(127, Math.abs(detents)); i++)
      surfaceInput(11 + slot, detents > 0 ? 0x01 : 0x7f);
  };

  // A wheel notch is one detent, as on the hardware; a trackpad's stream of small deltas adds up
  // to detents rather than firing one per event.
  let wheelRest = 0;
  function onWheel(event) {
    const slot = slotAt(event);
    if (slot < 0) return;
    event.preventDefault();
    wheelRest += event.deltaMode === 0 ? event.deltaY / 40 : event.deltaY;
    const detents = Math.max(-8, Math.min(8, Math.trunc(wheelRest)));
    if (detents === 0) return;
    wheelRest -= detents;
    turn(slot, -detents);
  }

  $effect(() => {
    if (!canvas) return;
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  });

  // Drag on a knob, up to turn it up. A press that does not move is the encoder's switch, which
  // makes it the active one — the same two things the hardware knob does.
  let drag = null;
  function knobDown(event) {
    const slot = slotAt(event);
    if (slot < 0 || event.button !== 0) return;
    drag = { slot, lastY: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function knobMove(event) {
    if (!drag) { hoverSlot = slotAt(event); return; }
    const detents = Math.trunc((drag.lastY - event.clientY) / DRAG_STEP);
    if (detents === 0) return;
    drag.lastY -= detents * DRAG_STEP;
    drag.moved = true;
    turn(drag.slot, detents);
  }
  function knobUp(event) {
    if (!drag) return;
    if (!drag.moved) surfaceInput(19 + drag.slot, 127);
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  // The value between a stepper's − and +: drag it up or down to turn, or click it and type.
  let valueDrag = null;
  function valueDown(event, slot) {
    if (event.button !== 0 || editingSlot === slot) return;
    valueDrag = { slot, lastY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function valueMove(event) {
    if (!valueDrag) return;
    const detents = Math.trunc((valueDrag.lastY - event.clientY) / DRAG_STEP);
    if (detents === 0) return;
    valueDrag.lastY -= detents * DRAG_STEP;
    valueDrag.moved = true;
    turn(valueDrag.slot, detents);
  }
  function valueUp(event) {
    if (!valueDrag) return;
    const { slot, moved } = valueDrag;
    valueDrag = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!moved) editingSlot = slot;
  }

  const focusAndSelect = (node) => { node.focus(); node.select(); };

  function commitValue(slot, text) {
    editingSlot = -1;
    const target = Math.max(0, Math.min(127, Math.round(Number(text))));
    if (!Number.isFinite(Number(text)) || String(text).trim() === '') return;
    const current = slots[slot]?.value ?? 0;
    if (target === current) return;
    // On a control page the slot is set outright; anywhere else the keyboard's own relative
    // turns are the only thing that means anything, so it is turned there.
    if ($ctrl49Screen.pageKind === 'control' && $ctrl49Screen.pageId)
      setControlSlotValue($ctrl49Screen.pageId, `s${slot + 1}`, target / 127);
    else
      turn(slot, target - current);
  }

  function pad(index) {
    surfaceInput(1 + index, 100);
    surfaceInput(1 + index, 0);
  }

  function onKeydown(event) {
    if (event.key === 'ArrowLeft') { surfaceInput(39, 127); event.preventDefault(); }
    else if (event.key === 'ArrowRight') { surfaceInput(40, 127); event.preventDefault(); }
  }

  const status = $derived({
    connected: 'Showing on the keyboard too',
    connecting: 'Keyboard found, starting up…',
    heldElsewhere: 'The keyboard is in use by another window — shown here only',
    failed: `The keyboard did not start${$hostSurface.detail ? `: ${$hostSurface.detail}` : ''} — shown here only`,
  }[$hostSurface.state] ?? 'No keyboard connected — shown here only');
</script>

<section class="ctrl49-screen" data-testid="ctrl49-screen-card" aria-label="CTRL49 screen">
  <div class="head">
    <strong>CTRL49 screen</strong>
    <span class="status" class:live={$hostSurface.state === 'connected'} data-testid="ctrl49-screen-status">{status}</span>
  </div>

  <div class="body">
    <canvas bind:this={canvas} width="480" height="272" data-testid="ctrl49-screen-canvas"
            tabindex="0" role="img" onkeydown={onKeydown}
            aria-label={`CTRL49 display, ${KIND[$ctrl49Screen.pageKind]} page ${$ctrl49Screen.pageIndex + 1} of ${$ctrl49Screen.pageCount}. Drag or scroll on a knob to turn it; arrow keys change page.`}
            onpointerdown={knobDown} onpointermove={knobMove} onpointerup={knobUp} onpointercancel={knobUp}
            onpointerleave={() => { if (!drag) hoverSlot = -1; }}
            class:over-knob={hoverSlot >= 0}></canvas>

    <div class="controls">
      <div class="pager">
        <button type="button" title="Page Left" aria-label="Page Left" data-testid="ctrl49-page-left"
                onclick={() => surfaceInput(39, 127)}><ChevronLeft size={16} /></button>
        <span class="page" data-testid="ctrl49-page">
          <b>{$ctrl49Screen.pageIndex + 1}</b> / {$ctrl49Screen.pageCount}
          <em>{KIND[$ctrl49Screen.pageKind]}</em>
        </span>
        <button type="button" title="Page Right" aria-label="Page Right" data-testid="ctrl49-page-right"
                onclick={() => surfaceInput(40, 127)}><ChevronRight size={16} /></button>
      </div>

      <div class="encoders" role="group" aria-label="Encoders">
        {#each slots as s, slot}
          <div class="encoder" class:active={!splash && activeSlot === slot} class:hover={hoverSlot === slot}>
            <span class="label" title={s.label || `Encoder ${slot + 1}`}>{s.label || `Encoder ${slot + 1}`}</span>
            <div class="stepper">
              <button type="button" aria-label={`Encoder ${slot + 1} down`} title="Turn down"
                      onclick={() => turn(slot, -1)}>−</button>
              {#if editingSlot === slot}
                <input type="text" inputmode="numeric" class="value" value={s.value} use:focusAndSelect
                       aria-label={`Encoder ${slot + 1} value`} data-testid={`ctrl49-encoder-${slot + 1}-input`}
                       onkeydown={(e) => { if (e.key === 'Enter') commitValue(slot, e.currentTarget.value); if (e.key === 'Escape') editingSlot = -1; }}
                       onblur={(e) => { if (editingSlot === slot) commitValue(slot, e.currentTarget.value); }} />
              {:else}
                <span class="value" role="spinbutton" tabindex="0" aria-valuemin="0" aria-valuemax="127"
                      aria-valuenow={s.value} aria-label={`Encoder ${slot + 1} value — drag, or click to type`}
                      title="Drag up or down, or click to type" data-testid={`ctrl49-encoder-${slot + 1}-value`}
                      onpointerdown={(e) => valueDown(e, slot)} onpointermove={valueMove} onpointerup={valueUp}
                      onkeydown={(e) => {
                        if (e.key === 'Enter') editingSlot = slot;
                        else if (e.key === 'ArrowUp') { turn(slot, 1); e.preventDefault(); }
                        else if (e.key === 'ArrowDown') { turn(slot, -1); e.preventDefault(); }
                      }}>{s.value}</span>
              {/if}
              <button type="button" aria-label={`Encoder ${slot + 1} up`} title="Turn up"
                      data-testid={`ctrl49-encoder-${slot + 1}-up`} onclick={() => turn(slot, 1)}>+</button>
            </div>
          </div>
        {/each}
      </div>

      <div class="pads" role="group" aria-label="Pads">
        <span class="pads-label">Pads</span>
        {#each Array(8) as _, index}
          <button type="button" class="pad" title={`Pad ${index + 1}`} onclick={() => pad(index)}>{index + 1}</button>
        {/each}
      </div>

      <p class="hint">Drag or scroll on a knob on the screen to turn it; click it to select it.</p>
    </div>
  </div>

  {#if failure}
    <p class="failure" role="alert" data-testid="ctrl49-screen-failure">{failure}</p>
  {/if}
</section>

<style>
  .ctrl49-screen {
    flex: none; display: flex; flex-direction: column; gap: 10px; padding: 12px;
    border: 1px solid var(--host-line, #2d343e); border-radius: var(--host-radius-panel, 8px);
    background: var(--host-surface, #171b21); color: var(--host-text, #d7dde6);
  }
  .head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .head strong { font-size: 13px; }
  .status { font-size: 12px; color: var(--host-text-dim, #8791a0); }
  .status.live { color: #8fd0a4; }
  .body { display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; }
  canvas {
    width: 100%; max-width: 480px; aspect-ratio: 480 / 272; height: auto; touch-action: none;
    border-radius: 6px; border: 6px solid #050608; background: #07090d; box-sizing: content-box;
  }
  canvas.over-knob { cursor: ns-resize; }
  canvas:focus-visible { outline: 2px solid var(--host-accent, #ff9408); outline-offset: 2px; }
  .controls { flex: 0 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
  .pager { display: flex; align-items: center; gap: 8px; }
  .page { font-size: 12px; color: var(--host-text-dim, #8791a0); min-width: 130px; text-align: center; }
  .page b { color: var(--host-text, #d7dde6); font-weight: 600; }
  .page em { font-style: normal; margin-left: 6px; }
  button {
    font: inherit; font-size: 12px; min-height: 26px; padding: 2px 8px; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid var(--host-line, #2d343e); border-radius: var(--host-radius-control, 5px);
    background: var(--host-surface-raised, #1d2229); color: inherit;
  }
  button:hover { border-color: var(--host-accent, #ff9408); }
  .encoders { display: grid; grid-template-columns: repeat(4, 116px); gap: 8px 10px; }
  .encoder { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 4px; border-radius: 6px; border: 1px solid transparent; }
  .encoder.hover { background: var(--host-surface-raised, #1d2229); }
  .encoder.active { border-color: var(--host-accent, #ff9408); }
  .label { font-size: 11px; color: var(--host-text-dim, #8791a0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .encoder.active .label { color: var(--host-text, #d7dde6); }
  .stepper { display: grid; grid-template-columns: 26px 1fr 26px; gap: 3px; align-items: stretch; }
  .stepper button { padding: 0; min-height: 26px; }
  .value {
    display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 26px;
    box-sizing: border-box; padding: 0 4px; font: inherit; font-size: 12px; font-variant-numeric: tabular-nums;
    border: 1px solid var(--host-line, #2d343e); border-radius: var(--host-radius-control, 5px);
    background: #0f1216; color: var(--host-text, #d7dde6); cursor: ns-resize; user-select: none; touch-action: none;
  }
  input.value { width: 100%; text-align: center; cursor: text; user-select: text; outline: none; border-color: var(--host-accent, #ff9408); }
  span.value:focus-visible { outline: 2px solid var(--host-accent, #ff9408); outline-offset: 1px; }
  .pads { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .pads-label { font-size: 11px; color: var(--host-text-dim, #8791a0); margin-right: 4px; }
  .pad { width: 32px; padding: 0; }
  .hint { margin: 0; font-size: 11px; color: var(--host-text-dim, #8791a0); }
  .failure { margin: 0; font-size: 12px; color: #ffb4b4; }
</style>
