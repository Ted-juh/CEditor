<script>
  /**
   * HostKeyboard.svelte — the one keyboard on screen, in two sizes.
   *
   * PLAY: three octaves of playable keys. The host had no way to make a sound without a
   * hardware MIDI keyboard plugged in, which made "load a synth and hear it" impossible on a
   * laptop lid. This strip sends notes through the SAME native path hardware MIDI takes (the
   * player's collector, ahead of the graph), so zones, splits, the event chain and the arp all
   * apply — auditioning here is auditioning what a keyboard would play, not a side door
   * around the routing. Velocity comes from WHERE a key is pressed — toward the top is soft,
   * the bottom edge is hard — because a mouse has no aftertouch and a fixed velocity makes
   * every synth sound like an organ. The computer keyboard plays too: A W S E D F T G Y H U J
   * K, the layout every DAW taught, with Z and X shifting octaves.
   *
   * RANGE: the same keyboard grown to all 128 keys, and the keys themselves say where a part
   * plays. The pressed part's keys take its colour; its two edges are tabs on the rim above
   * the keys, dragged to move an edge, with the strip between them dragged to move the whole
   * range. Editing lives on the rim because dragging across the keys plays them, and it
   * should keep doing that — you can hear which side of a split a key falls on. Every other
   * part is a thin band along the top of the keys it covers, stacked where they overlap, so a
   * six-way split reads as six bands on one keyboard rather than six lanes; click a band to
   * switch to that part. Every drag sends the same setPartMidiRules command the numeric zone
   * fields send, so the digits and the picture can never disagree.
   *
   * There used to be a second keyboard for this under the rack, linear in semitones, which
   * never lined up with the piano above it. One keyboard, one geometry (pianoGeometry.js).
   */
  import { hostNote, hostState, hostKeyboardMode, showKeyboardPlay, showPartRange,
           setPartMidiRules, partColor } from '../stores/instrumentHost.js';
  import { isBlack, noteName, whiteCount, noteAtFraction, zoneExtent }
    from '../utils/pianoGeometry.js';

  let baseOctave = $state(4);   // C4 at the left edge in play mode
  const PLAY_OCTAVES = 3;

  let mode = $derived($hostKeyboardMode.mode);
  let parts = $derived($hostState.rack.parts);
  let rangeIndex = $derived(parts.findIndex((p) => p.partId === $hostKeyboardMode.partId));
  let rangePart = $derived(rangeIndex >= 0 ? parts[rangeIndex] : null);
  let rangeColor = $derived(partColor(Math.max(0, rangeIndex)));
  // The other parts, with their rack index (which is their colour) and a band row each.
  let others = $derived(parts.map((part, index) => ({ part, index }))
                             .filter(({ part }) => part.partId !== $hostKeyboardMode.partId));

  // The keys on screen: [low, high], and the white keys among them in order, each with the
  // sharp that rides its right-hand seam (or -1 when there is none, or it is out of range).
  let low = $derived(mode === 'range' ? 0 : (baseOctave + 1) * 12);
  let high = $derived(mode === 'range' ? 127 : Math.min(127, (baseOctave + 1) * 12 + PLAY_OCTAVES * 12 - 1));
  let whites = $derived(whiteCount(low, high));
  let slots = $derived.by(() => {
    const out = [];
    for (let n = low; n <= high; n += 1)
      if (!isBlack(n)) out.push({ note: n, sharp: n + 1 <= high && isBlack(n + 1) ? n + 1 : -1 });
    return out;
  });
  let extent = $derived(rangePart ? zoneExtent(rangePart.keyLow, rangePart.keyHigh, low, high) : null);

  const covers = (part, note) => note >= part.keyLow && note <= part.keyHigh;
  const inRange = (note) => mode === 'range' && rangePart != null && covers(rangePart, note);
  const bandsOn = (note) => (mode === 'range' ? others.filter(({ part }) => covers(part, note)) : []);

  const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12 };
  const noteAt = (octave, semitone) => Math.min(127, Math.max(0, (octave + 1) * 12 + semitone));

  // --- playing -------------------------------------------------------------------------
  let pressed = $state(new Set());
  let mouseNote = -1;
  let mouseDown = false;

  function press(note, velocity) {
    if (pressed.has(note)) return;
    pressed = new Set(pressed).add(note);
    hostNote(note, velocity, true);
  }

  function release(note) {
    if (!pressed.has(note)) return;
    const next = new Set(pressed);
    next.delete(note);
    pressed = next;
    hostNote(note, 0, false);
  }

  function velocityFrom(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = (event.clientY - rect.top) / rect.height;
    return Math.round(30 + Math.min(1, Math.max(0, y)) * 97);
  }

  function keyDown(note, event) {
    mouseDown = true;
    mouseNote = note;
    press(note, velocityFrom(event));
  }

  function keyEnter(note, event) {
    if (!mouseDown) return;
    if (mouseNote >= 0 && mouseNote !== note) release(mouseNote);
    mouseNote = note;
    press(note, velocityFrom(event));
  }

  function mouseUp() {
    mouseDown = false;
    if (mouseNote >= 0) release(mouseNote);
    mouseNote = -1;
  }

  function typeDown(event) {
    if (event.repeat || event.target.closest('input, textarea, select, [contenteditable]')) return;
    const key = event.key.toLowerCase();
    if (key === 'escape' && mode === 'range') { showKeyboardPlay(); return; }
    if (key === 'z') { baseOctave = Math.max(0, baseOctave - 1); return; }
    if (key === 'x') { baseOctave = Math.min(7, baseOctave + 1); return; }
    if (key in KEYMAP) press(noteAt(baseOctave, KEYMAP[key]), 100);
  }

  function typeUp(event) {
    const key = event.key.toLowerCase();
    if (key in KEYMAP) release(noteAt(baseOctave, KEYMAP[key]));
  }

  // --- the range, on the rim -------------------------------------------------------------
  // Which handle while a drag is live; grabOffset keeps a middle-drag anchored to the key it
  // started on instead of snapping the range's left edge to the pointer.
  let rimEl = $state(null);
  let drag = $state(null);

  function keyAtClientX(clientX) {
    const rect = rimEl.getBoundingClientRect();
    return noteAtFraction((clientX - rect.left) / rect.width, low, high);
  }

  function beginDrag(event, handle) {
    if (!rangePart) return;
    event.preventDefault();
    event.stopPropagation();
    drag = { handle, grabOffset: keyAtClientX(event.clientX) - rangePart.keyLow };
    rimEl.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (!drag || !rangePart) { drag = null; return; }
    const part = rangePart;
    const key = keyAtClientX(event.clientX);

    if (drag.handle === 'low') {
      const next = Math.min(key, part.keyHigh);
      if (next !== part.keyLow) setPartMidiRules(part.partId, { keyLow: next });
    } else if (drag.handle === 'high') {
      const next = Math.max(key, part.keyLow);
      if (next !== part.keyHigh) setPartMidiRules(part.partId, { keyHigh: next });
    } else {
      const width = part.keyHigh - part.keyLow;
      const next = Math.max(0, Math.min(127 - width, key - drag.grabOffset));
      if (next !== part.keyLow)
        setPartMidiRules(part.partId, { keyLow: next, keyHigh: next + width });
    }
  }

  const endDrag = () => (drag = null);
  const pct = (fraction) => `${(fraction * 100).toFixed(3)}%`;
  const partLabel = (part) => part.pluginName || (part.hardware ? part.midiOutputName || 'hardware' : 'empty');
</script>

<svelte:window onmouseup={mouseUp} onkeydown={typeDown} onkeyup={typeUp} />

<div class="host-keyboard" class:range={mode === 'range'} data-testid="host-keyboard" data-mode={mode}>
  <div class="side">
    {#if mode === 'play'}
      <div class="octave-controls">
        <button type="button" title="Octave down (Z)"
                onclick={() => (baseOctave = Math.max(0, baseOctave - 1))}>−</button>
        <span class="octave-label" title="Keys A–K play from this octave; Z and X shift it. Press low on a key for a harder hit.">C{baseOctave}</span>
        <button type="button" title="Octave up (X)"
                onclick={() => (baseOctave = Math.min(7, baseOctave + 1))}>+</button>
      </div>
    {:else}
      <button type="button" class="mode-back" data-testid="host-keyboard-play"
              title="Back to the three-octave keyboard (Esc). Drag the tabs on the rim to set the range, the strip between them to move it; click a band on the keys to edit another part."
              onclick={() => showKeyboardPlay()}>Play</button>
      <span class="range-for" style={`--part-color:${rangeColor}`}>
        {rangePart ? `${partLabel(rangePart)} · ${noteName(rangePart.keyLow)}–${noteName(rangePart.keyHigh)}` : 'Key ranges'}
      </span>
    {/if}
  </div>

  <div class="strip">
    {#if mode === 'range'}
      <!-- The rim: where the range is edited, so the keys underneath stay playable. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="rim" bind:this={rimEl} data-testid="host-key-rim"
           onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={endDrag}>
        {#if rangePart && extent}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="range-strip" data-testid="key-range-strip"
               style={`left:${pct(extent.left)};width:${pct(extent.width)};--part-color:${rangeColor}`}
               title={`${partLabel(rangePart)} · ${noteName(rangePart.keyLow)}–${noteName(rangePart.keyHigh)} — drag to move, drag a tab to resize`}
               onpointerdown={(e) => beginDrag(e, 'move')}>
            <span class="tab low" data-testid="key-range-low" title="Drag: lowest key"
                  onpointerdown={(e) => beginDrag(e, 'low')}></span>
            <span class="tab high" data-testid="key-range-high" title="Drag: highest key"
                  onpointerdown={(e) => beginDrag(e, 'high')}></span>
          </div>
        {/if}
      </div>
    {/if}

    <div class="keys" role="presentation">
      {#each slots as slot (slot.note)}
        <div class="white-slot">
          <button type="button" class="white" class:down={pressed.has(slot.note)}
                  class:in-range={inRange(slot.note)}
                  style={inRange(slot.note) ? `--part-color:${rangeColor}` : ''}
                  data-note={slot.note} aria-label={`Note ${slot.note}`}
                  onmousedown={(e) => keyDown(slot.note, e)}
                  onmouseenter={(e) => keyEnter(slot.note, e)}>
            <!-- The other parts, as bands along the top of every key they cover. Click one
                 to make it the part being edited — a six-way split is set without leaving
                 the keyboard. -->
            {#each bandsOn(slot.note) as { part, index } (part.partId)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span class="band" style={`top:${2 + index * 4}px;background:${partColor(index)}`}
                    data-testid={`key-band-${index}`}
                    title={`${partLabel(part)} · ${noteName(part.keyLow)}–${noteName(part.keyHigh)} — click to edit its range`}
                    onmousedown={(e) => { e.stopPropagation(); e.preventDefault(); showPartRange(part.partId); }}></span>
            {/each}
            {#if slot.note % 12 === 0 && slot.note > 0 && (mode === 'range' || whites <= 28)}
              <span class="c-label">{noteName(slot.note)}</span>
            {/if}
          </button>
          {#if slot.sharp >= 0}
            <button type="button" class="black" class:down={pressed.has(slot.sharp)}
                    class:in-range={inRange(slot.sharp)}
                    style={inRange(slot.sharp) ? `--part-color:${rangeColor}` : ''}
                    data-note={slot.sharp} aria-label={`Note ${slot.sharp}`}
                    onmousedown={(e) => { e.stopPropagation(); keyDown(slot.sharp, e); }}
                    onmouseenter={(e) => keyEnter(slot.sharp, e)}></button>
          {/if}
        </div>
      {/each}
    </div>
  </div>

</div>

<style>
  .host-keyboard {
    display: flex;
    align-items: stretch;
    gap: 10px;
    margin: 8px 14px;
    padding: 8px 10px;
    border: 1px solid #3b4652;
    border-radius: 6px;
    background: #171a1d;
    user-select: none;
  }
  .host-keyboard.range { border-color: #4a6a7a; }

  .side { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-width: 40px; }
  .octave-controls { display: flex; flex-direction: column; align-items: center; gap: 2px; justify-content: center; }
  .octave-label { color: #9aa5b1; font-size: 11px; min-width: 24px; text-align: center; }
  .octave-controls button, .mode-back {
    background: #232a31;
    border: 1px solid #3b4652;
    border-radius: 4px;
    color: #d6dbe0;
    padding: 0 6px 2px;
    cursor: pointer;
    font: inherit;
    line-height: 1.2;
  }
  .octave-controls button { width: 24px; padding: 0 0 2px; }
  .octave-controls button:hover, .mode-back:hover { border-color: #5b9bd5; }
  .range-for {
    font-size: 11px; max-width: 110px; text-align: center; color: #d6dbe0;
    border-top: 3px solid var(--part-color, #4a6a7a); padding-top: 3px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .strip { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .keys { display: flex; height: 74px; min-width: 0; }
  .range .keys { height: 64px; }
  .white-slot { position: relative; flex: 1; min-width: 0; }

  .white {
    position: absolute;
    inset: 0;
    background: #e8eaec;
    border: 1px solid #10141a;
    border-radius: 0 0 3px 3px;
    cursor: pointer;
    padding: 0;
    overflow: hidden;
  }
  .white.down { background: #9fc4e8; }
  /* The pressed part's keys take its colour — a wash on the whites, a shade on the blacks —
     so where it plays is read off the keyboard itself rather than off a bar beside it. */
  .white.in-range { background: color-mix(in srgb, var(--part-color) 42%, #e8eaec); }
  .white.in-range.down { background: color-mix(in srgb, var(--part-color) 70%, #ffffff); }
  .c-label {
    position: absolute;
    left: 0; right: 0; bottom: 2px;
    font-size: 9px;
    color: #4a525a;
    text-align: center;
    white-space: nowrap;
    pointer-events: none;
  }
  .band {
    position: absolute;
    left: 0; right: 0;
    height: 3px;
    cursor: pointer;
    opacity: 0.9;
  }
  .band:hover { height: 5px; opacity: 1; }

  .black {
    position: absolute;
    top: 0;
    right: -30%;
    width: 60%;
    height: 58%;
    background: #14171a;
    border: 1px solid #000;
    border-radius: 0 0 2px 2px;
    cursor: pointer;
    z-index: 2;
    padding: 0;
  }
  .black.down { background: #3d6fa3; }
  .black.in-range { background: color-mix(in srgb, var(--part-color) 55%, #14171a); }
  .black.in-range.down { background: color-mix(in srgb, var(--part-color) 85%, #ffffff); }

  /* The rim shares the keys' width exactly — same flex column, same left edge — which is what
     puts a tab over the key it names. */
  .rim { position: relative; height: 14px; margin-bottom: 2px; touch-action: none; }
  .range-strip {
    position: absolute;
    top: 2px; bottom: 0;
    background: color-mix(in srgb, var(--part-color) 75%, #ffffff);
    border-radius: 3px 3px 0 0;
    cursor: grab;
    min-width: 6px;
  }
  .tab {
    position: absolute;
    top: -2px; bottom: 0;
    width: 10px;
    background: var(--part-color);
    border: 1px solid #ffffffaa;
    border-radius: 3px 3px 0 0;
    cursor: col-resize;
  }
  .tab.low { left: -1px; }
  .tab.high { right: -1px; }
  .tab:hover { background: #ffffff; }

</style>
