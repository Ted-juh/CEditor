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
   * Five more pages can follow the performance page once asked for here — CUE (the setlist read
   * mid-show), LAYERS (every part's zone over the keys), SOUNDCHECK (the set, checked), DISCOVER
   * (what you own and have never opened, nearest to what you load) and CHANGES (the focused
   * part's sound against its saves) — each drawn by one call (set_cue, set_layers, set_check,
   * set_discover, set_changes) where a knob page takes two. Their encoders are labelled from the
   * same bytes.
   *
   * The page and its images are loaded on demand, so a build that cannot reach them (a test
   * harness serving only CE/web) loses this card and nothing else.
   */
  import { onDestroy } from 'svelte';
  import ChevronLeft from 'lucide-svelte/icons/chevron-left';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import { ctrl49Screen, hostSurface, hostState, surfaceInput, setControlSlotValue, surfaceStatusText,
           layersOnSurface, soundcheckOnSurface, discoverOnSurface, cueOnSurface, changesOnSurface } from '../stores/instrumentHost.js';
  import { createCtrl49Screen } from '../screen/ctrl49Runtime.js';
  import { readLayersPayload, readSoundcheckPayload, readDiscoverPayload, readCuePayload, readChangesPayload } from '../screen/ctrl49Payloads.js';

  const KIND = { control: 'Controls', performance: 'Performance', browse: 'Sound browser',
                 layers: 'Layers', soundcheck: 'Soundcheck', discover: 'Discover', cue: 'Cue', changes: 'Changes' };
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = (n) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
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
  const stage = $derived($ctrl49Screen.call !== '');
  const splash = $derived(!$ctrl49Screen.received
                          || (stage ? $ctrl49Screen.payload.length === 0 : $ctrl49Screen.labels.length === 0)
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
        if (screen.call) {
          runtime.call(screen.call, screen.payload);
        } else {
          runtime.call('set_labels', screen.labels);
          runtime.call('set_values', screen.values);
        }
      }
      runtime.call('draw', []);
      failure = '';
    } catch (e) {
      failure = `The display page failed: ${e?.message ?? e}`;
    }
  });

  // What the encoders do on a stage page, read back out of the payload the page draws: the
  // focused part's zone on LAYERS, the song on SOUNDCHECK. An encoder the page does not use is
  // left blank, and its steppers off.
  function stageSlots({ pageKind, payload }) {
    const unused = { label: '', text: '', unused: true };
    if (pageKind === 'layers') {
      const view = readLayersPayload(payload);
      const part = view.parts.find((p) => p.index === view.focused);
      if (!part) return Array.from({ length: 8 }, () => unused);
      const sign = (n) => (n > 0 ? `+${n}` : String(n));
      return [
        { label: 'Part', text: part.name || `Part ${part.index + 1}` },
        { label: 'Lowest key', text: noteName(part.keyLow) },
        { label: 'Highest key', text: noteName(part.keyHigh) },
        { label: 'Transpose', text: sign(part.transpose) },
        { label: 'Lowest velocity', text: String(part.velocityLow) },
        { label: 'Highest velocity', text: String(part.velocityHigh) },
        unused, unused,
      ];
    }
    if (pageKind === 'changes') {
      const view = readChangesPayload(payload);
      if (view.state === 'problem') return Array.from({ length: 8 }, () => unused);
      return [
        { label: 'Listen', text: view.listen >= 100 ? 'Now' : view.listen === 0 ? 'The save' : `${view.listen}% of the way` },
        { label: 'Change', text: view.count ? `${view.selected + 1} / ${view.count}` : 'Nothing changed', unused: !view.count },
        { label: 'Put back', text: view.putBack ? `${view.putBack} put back` : 'Turn to put back', unused: !view.count && !view.putBack },
        { label: 'Walk back', text: `Save ${view.back + 1} of ${view.saves}`, unused: view.saves < 2 },
        unused, unused, unused, unused,
      ];
    }
    if (pageKind === 'cue') {
      const view = readCuePayload(payload);
      const text = view.pickedSong ? `Go to ${view.pickedSong}`
        : view.current >= 0 ? `On stage: ${view.current + 1} / ${view.songs}` : view.songs ? 'Nothing on stage' : 'No setlist';
      return [{ label: 'Pick a song', text, unused: view.songs === 0 }, unused, unused, unused, unused, unused, unused, unused];
    }
    if (pageKind === 'discover') {
      const view = readDiscoverPayload(payload);
      const sound = view.sounds.find((s) => s.index === view.selected);
      const none = view.state !== 'suggestions' || !sound;
      return [
        { label: 'Pick', text: none ? 'Nothing to pick' : `${view.selected + 1} / ${view.count}` },
        { label: 'Reach', text: 'Eight further', unused: none },
        { label: 'Kind', text: view.kind ? view.kind[0] + view.kind.slice(1).toLowerCase() : 'Every kind' },
        { label: 'Keep', text: none ? '' : sound.kept ? 'Kept' : 'Not kept', unused: none },
        unused, unused, unused, unused,
      ];
    }
    const view = readSoundcheckPayload(payload);
    return [
      { label: 'Song', text: view.count ? `${view.selected + 1} / ${view.count}` : 'No songs' },
      unused, unused, unused, unused, unused, unused,
      { label: 'Check again',
        text: !view.count ? 'Nothing to check' : view.unchecked ? `${view.unchecked} not checked` : 'Checked' },
    ];
  }

  // The eight labels and values, read back out of the same payloads the page draws:
  // set_labels [titleLen][title][8 x [len][label]], set_values [active][v0..v7].
  const slots = $derived.by(() => {
    if (stage) return stageSlots($ctrl49Screen);
    const { labels, values } = $ctrl49Screen;
    const out = [];
    let at = 1 + (labels[0] ?? 0);
    for (let i = 0; i < 8; i++) {
      const length = labels[at] ?? 0;
      const label = String.fromCharCode(...labels.slice(at + 1, at + 1 + length));
      at += 1 + length;
      out.push({ label, value: values[1 + i] ?? 0, text: String(values[1 + i] ?? 0), unused: false });
    }
    return out;
  });
  const activeSlot = $derived($ctrl49Screen.values[0] ?? 0);

  // Which knob is under the pointer, in the page's own 480x272 coordinates (knob_pos in the Lua:
  // four columns 118 px apart from x 31, two rows from y 32 and 150, each knob 64 px plus label).
  function slotAt(event) {
    if (stage) return -1;                // a stage page draws no knobs to grab
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
    if (!moved && !stage) editingSlot = slot;
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

  // The keyboard's own status, and whether this card is also what the keyboard shows.
  const surfaceStatus = $derived(surfaceStatusText($hostSurface));
  const status = $derived($hostSurface.state === 'connected' ? 'Showing on the keyboard too'
                          : `${surfaceStatus.short} — shown here only`);

  // The stage pages are off until asked for; SOUNDCHECK needs the setlists the edition may not have.
  const pagesOn = $derived($hostState.surfacePages ?? { layers: false, soundcheck: false, discover: false, cue: false, changes: false });
  // The pads do nothing on LAYERS and SOUNDCHECK; on DISCOVER each auditions the row beside it,
  // and on CUE pad 1 goes to the song E1 picked.
  const cuePick = $derived($ctrl49Screen.pageKind === 'cue' && readCuePayload($ctrl49Screen.payload).pickedSong !== '');
  const padIdle = (index) => stage && !($ctrl49Screen.pageKind === 'discover' || (cuePick && index === 0));
  const setlists = $derived(($hostState.licence?.features ?? [])
    .find((f) => f.feature === 'scenesAndSetlists')?.allowed !== false);
  const HINT = {
    layers: 'Encoder 1 picks the part; 2–6 set its lowest and highest key, transpose and velocity range.',
    soundcheck: 'Encoder 1 walks the set; encoder 8 checks it again.',
    cue: 'Encoder 1 picks a song; pad 1 goes to it. Shift + Page steps the set from any page.',
    changes: 'Encoder 1 listens between the save and now, 2 picks a change, 3 puts it back (the other way takes it back), 4 walks back through the saves.',
    discover: 'Encoder 1 picks, 2 reaches further, 3 keeps to one kind, 4 keeps a sound as a favourite. Pad N plays row N.',
  };
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

      <div class="stage-pages" role="group" aria-label="Stage pages on the keyboard">
        <span class="group-label">After Performance</span>
        <button type="button" aria-pressed={pagesOn.cue} class:on={pagesOn.cue} data-testid="ctrl49-cue-toggle"
                disabled={!setlists && !pagesOn.cue}
                title={setlists ? 'The setlist read mid-show: the song, its section, its clock, what is next' : 'Needs scenes and setlists'}
                onclick={() => cueOnSurface(!pagesOn.cue)}>Cue</button>
        <button type="button" aria-pressed={pagesOn.layers} class:on={pagesOn.layers} data-testid="ctrl49-layers-toggle"
                title="Every part's zone over the keys, and the notes you hold"
                onclick={() => layersOnSurface(!pagesOn.layers)}>Layers</button>
        <button type="button" aria-pressed={pagesOn.soundcheck} class:on={pagesOn.soundcheck} data-testid="ctrl49-soundcheck-toggle"
                disabled={!setlists && !pagesOn.soundcheck}
                title={setlists ? 'The set, checked before the show: what is ready and what is not' : 'Needs scenes and setlists'}
                onclick={() => soundcheckOnSurface(!pagesOn.soundcheck)}>Soundcheck</button>
        <button type="button" aria-pressed={pagesOn.discover} class:on={pagesOn.discover} data-testid="ctrl49-discover-toggle"
                title="What you own and have never opened, nearest to what you keep loading"
                onclick={() => discoverOnSurface(!pagesOn.discover)}>Discover</button>
        <button type="button" aria-pressed={pagesOn.changes} class:on={pagesOn.changes} data-testid="ctrl49-changes-toggle"
                title="The focused part's sound against its saves: what moved, heard and put back"
                onclick={() => changesOnSurface(!pagesOn.changes)}>Changes</button>
      </div>

      <div class="encoders" role="group" aria-label="Encoders">
        {#each slots as s, slot}
          <div class="encoder" class:active={!splash && !stage && activeSlot === slot} class:hover={hoverSlot === slot}
               class:unused={s.unused}>
            <span class="label" title={s.label || `Encoder ${slot + 1}`}>{s.label || `Encoder ${slot + 1}`}</span>
            <div class="stepper">
              <button type="button" aria-label={`Encoder ${slot + 1} down`} title="Turn down" disabled={s.unused}
                      onclick={() => turn(slot, -1)}>−</button>
              {#if editingSlot === slot && !stage}
                <input type="text" inputmode="numeric" class="value" value={s.value} use:focusAndSelect
                       aria-label={`Encoder ${slot + 1} value`} data-testid={`ctrl49-encoder-${slot + 1}-input`}
                       onkeydown={(e) => { if (e.key === 'Enter') commitValue(slot, e.currentTarget.value); if (e.key === 'Escape') editingSlot = -1; }}
                       onblur={(e) => { if (editingSlot === slot) commitValue(slot, e.currentTarget.value); }} />
              {:else}
                <span class="value" role="spinbutton" tabindex="0" aria-valuemin={stage ? undefined : 0}
                      aria-valuemax={stage ? undefined : 127} aria-valuenow={stage ? undefined : s.value}
                      aria-valuetext={stage ? s.text : undefined}
                      aria-label={stage ? `Encoder ${slot + 1}, ${s.label || 'unused'} — drag to turn`
                                        : `Encoder ${slot + 1} value — drag, or click to type`}
                      title={stage ? 'Drag up or down to turn' : 'Drag up or down, or click to type'}
                      data-testid={`ctrl49-encoder-${slot + 1}-value`}
                      onpointerdown={(e) => valueDown(e, slot)} onpointermove={valueMove} onpointerup={valueUp}
                      onkeydown={(e) => {
                        if (e.key === 'Enter' && !stage) editingSlot = slot;
                        else if (e.key === 'ArrowUp') { turn(slot, 1); e.preventDefault(); }
                        else if (e.key === 'ArrowDown') { turn(slot, -1); e.preventDefault(); }
                      }}>{s.text}</span>
              {/if}
              <button type="button" aria-label={`Encoder ${slot + 1} up`} title="Turn up" disabled={s.unused}
                      data-testid={`ctrl49-encoder-${slot + 1}-up`} onclick={() => turn(slot, 1)}>+</button>
            </div>
          </div>
        {/each}
      </div>

      <span class="group-label">Pads</span>
      <div class="pads" role="group" aria-label="Pads">
        {#each Array(8) as _, index}
          <button type="button" class="pad" disabled={padIdle(index)}
                  title={padIdle(index) ? 'The pads do nothing on this page'
                         : $ctrl49Screen.pageKind === 'discover' ? `Audition row ${index + 1}`
                         : $ctrl49Screen.pageKind === 'cue' ? 'Go to the song encoder 1 picked' : `Pad ${index + 1}`}
                  onclick={() => pad(index)}>{index + 1}</button>
        {/each}
      </div>

      <p class="hint" data-testid="ctrl49-hint">{HINT[$ctrl49Screen.pageKind]
        ?? 'Drag or scroll on a knob on the screen to turn it; click it to select it.'}</p>
    </div>
  </div>

  {#if surfaceStatus.detail && $hostSurface.state !== 'connected'}
    <p class="failure" role="status" data-testid="ctrl49-status-detail">{surfaceStatus.detail}</p>
  {/if}
  {#if $hostSurface.deviceError}
    <p class="failure" role="status" data-testid="ctrl49-device-error">
      {$hostSurface.deviceError}{$hostSurface.deviceRefusals > 1 ? ` (${$hostSurface.deviceRefusals} refusals this connection)` : ''}
    </p>
  {/if}
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
  .controls { flex: 1 1 440px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
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
  /* Encoders and pads share one four-column grid, as on the keyboard: pad N sits under
     encoder N's column, and both fill whatever width the card has. */
  .encoders, .pads { display: grid; grid-template-columns: repeat(4, minmax(104px, 1fr)); gap: 8px 12px; }
  .encoder { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 4px; border-radius: 6px; border: 1px solid transparent; }
  .encoder.hover { background: var(--host-surface-raised, #1d2229); }
  .encoder.active { border-color: var(--host-accent, #ff9408); }
  .label { font-size: 11px; color: var(--host-text-dim, #8791a0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .encoder.active .label { color: var(--host-text, #d7dde6); }
  .stepper { display: grid; grid-template-columns: 30px 1fr 30px; gap: 4px; align-items: stretch; }
  .stepper button { padding: 0; min-height: 28px; }
  .value {
    display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 28px;
    box-sizing: border-box; padding: 0 4px; font: inherit; font-size: 12px; font-variant-numeric: tabular-nums;
    border: 1px solid var(--host-line, #2d343e); border-radius: var(--host-radius-control, 5px);
    background: #0f1216; color: var(--host-text, #d7dde6); cursor: ns-resize; user-select: none; touch-action: none;
  }
  input.value { width: 100%; text-align: center; cursor: text; user-select: text; outline: none; border-color: var(--host-accent, #ff9408); }
  span.value:focus-visible { outline: 2px solid var(--host-accent, #ff9408); outline-offset: 1px; }
  .group-label { font-size: 11px; color: var(--host-text-dim, #8791a0); margin-bottom: -4px; }
  .pad { min-height: 34px; padding: 0; }
  .stage-pages { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .stage-pages .group-label { margin: 0 4px 0 0; }
  /* A light on each switch, lit when the page is on the keyboard. */
  .stage-pages button::before { content: ''; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; background: var(--host-line, #2d343e); }
  .stage-pages button.on { border-color: var(--host-accent, #ff9408); background: var(--host-accent-surface, #2a2116); }
  .stage-pages button.on::before { background: var(--host-accent, #ff9408); }
  button:disabled { opacity: .4; cursor: default; }
  button:disabled:hover { border-color: var(--host-line, #2d343e); }
  .encoder.unused .label { opacity: .4; }
  .hint { margin: 0; font-size: 11px; color: var(--host-text-dim, #8791a0); }
  .failure { margin: 0; font-size: 12px; color: #ffb4b4; }
</style>
