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
   * RANGE: the same keyboard grown to all 128 keys, with every part's key range drawn beneath
   * it as a bar you drag. Splits and layers used to live in a separate strip under the rack,
   * linear in semitones, which never lined up with the piano above it. Now there is one
   * geometry (pianoGeometry.js) and one keyboard; a split is a drag, a layer is two
   * overlapping bars, and a hole in the map is visible before it is audible. The keys stay
   * playable in this mode, so you can hear which side of the split a key falls on. Every drag
   * sends the same setPartMidiRules command the numeric zone fields send, so the digits and
   * the picture can never disagree.
   */
  import { hostNote, hostState, hostKeyboardMode, showKeyboardPlay, focusRackPart,
           setPartMidiRules } from '../stores/instrumentHost.js';
  import { isBlack, noteName, whiteCount, keySpan, noteAtFraction, zoneExtent }
    from '../utils/pianoGeometry.js';

  let baseOctave = $state(4);   // C4 at the left edge in play mode
  const PLAY_OCTAVES = 3;

  let mode = $derived($hostKeyboardMode.mode);
  let parts = $derived($hostState.rack.parts);
  let focusedPartId = $derived($hostState.rack.focusedPartId);
  let rangePart = $derived(parts.find((p) => p.partId === $hostKeyboardMode.partId) ?? null);

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

  // --- the range lanes -------------------------------------------------------------------
  // partId + which handle while a drag is live; grabOffset keeps a middle-drag anchored to
  // the key it started on instead of snapping the zone's left edge to the pointer.
  let lanesEl = $state(null);
  let drag = $state(null);

  function keyAtClientX(clientX) {
    const rect = lanesEl.getBoundingClientRect();
    return noteAtFraction((clientX - rect.left) / rect.width, low, high);
  }

  function beginDrag(event, part, handle) {
    event.preventDefault();
    focusRackPart(part.partId);
    drag = { partId: part.partId, handle, grabOffset: keyAtClientX(event.clientX) - part.keyLow };
    lanesEl.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (!drag) return;
    const part = parts.find((p) => p.partId === drag.partId);
    if (!part) { drag = null; return; }
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
  const laneColor = (i) => ['#3d81c4', '#4aa88c', '#b4854a', '#9a6bbf', '#c46a6a', '#6a94c4'][i % 6];
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
        <span class="octave-label">C{baseOctave}</span>
        <button type="button" title="Octave up (X)"
                onclick={() => (baseOctave = Math.min(7, baseOctave + 1))}>+</button>
      </div>
    {:else}
      <button type="button" class="mode-back" data-testid="host-keyboard-play"
              title="Back to the three-octave keyboard (Esc)"
              onclick={() => showKeyboardPlay()}>Play</button>
      <span class="range-for">{rangePart ? partLabel(rangePart) : 'Key ranges'}</span>
    {/if}
  </div>

  <div class="strip">
    <div class="keys" role="presentation" style={`--whites:${whites}`}>
      {#each slots as slot (slot.note)}
        <div class="white-slot">
          <button type="button" class="white" class:down={pressed.has(slot.note)}
                  class:c={slot.note % 12 === 0}
                  data-note={slot.note} aria-label={`Note ${slot.note}`}
                  onmousedown={(e) => keyDown(slot.note, e)}
                  onmouseenter={(e) => keyEnter(slot.note, e)}>
            {#if slot.note % 12 === 0 && (mode === 'range' || whites <= 28)}
              <span class="c-label">{noteName(slot.note)}</span>
            {/if}
          </button>
          {#if slot.sharp >= 0}
            <button type="button" class="black" class:down={pressed.has(slot.sharp)}
                    data-note={slot.sharp} aria-label={`Note ${slot.sharp}`}
                    onmousedown={(e) => { e.stopPropagation(); keyDown(slot.sharp, e); }}
                    onmouseenter={(e) => keyEnter(slot.sharp, e)}></button>
          {/if}
        </div>
      {/each}
    </div>

    {#if mode === 'range'}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="lanes" bind:this={lanesEl} data-testid="host-key-lanes"
           onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={endDrag}>
        {#each parts as part, i (part.partId)}
          {@const extent = zoneExtent(part.keyLow, part.keyHigh, low, high)}
          <div class="lane" class:focused={part.partId === focusedPartId} data-testid={`key-lane-${i}`}>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="zone" style={`left:${pct(extent.left)};width:${pct(extent.width)};background:${laneColor(i)}`}
                 data-testid={`key-zone-${i}`}
                 title={`${partLabel(part)} · ${noteName(part.keyLow)}–${noteName(part.keyHigh)} — drag to move, drag an edge to resize`}
                 onpointerdown={(e) => beginDrag(e, part, 'move')}>
              <span class="zone-edge left" data-testid={`key-zone-low-${i}`}
                    onpointerdown={(e) => { e.stopPropagation(); beginDrag(e, part, 'low'); }}></span>
              <span class="zone-label">{partLabel(part).slice(0, 18)} · {noteName(part.keyLow)}–{noteName(part.keyHigh)}</span>
              <span class="zone-edge right" data-testid={`key-zone-high-${i}`}
                    onpointerdown={(e) => { e.stopPropagation(); beginDrag(e, part, 'high'); }}></span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <span class="hint">
    {#if mode === 'play'}A–K plays · Z/X octave · press low on a key for a harder hit{:else}drag a bar to move a part's range, its edge to resize · Esc returns{/if}
  </span>
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
  .range-for { color: #9fd0e4; font-size: 11px; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .strip { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .keys { display: flex; height: 74px; min-width: 0; }
  .range .keys { height: 58px; }
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
  .c-label {
    position: absolute;
    left: 0; right: 0; bottom: 2px;
    font-size: 9px;
    color: #6a7480;
    text-align: center;
    pointer-events: none;
  }

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

  /* The lanes share the keys' width exactly — same flex box, same left edge — which is the
     whole reason they live in this component and not in a strip of their own. */
  .lanes { display: flex; flex-direction: column; gap: 2px; touch-action: none; }
  .lane { position: relative; height: 22px; background: #161e27; border: 1px solid #232c36; border-radius: 3px; }
  .lane.focused { border-color: #8fb8dd; }
  .zone {
    position: absolute;
    top: 2px; bottom: 2px;
    border-radius: 2px;
    opacity: 0.82;
    cursor: grab;
    display: flex;
    align-items: center;
    overflow: hidden;
  }
  .lane.focused .zone { opacity: 1; outline: 1px solid #fff; }
  .zone-edge {
    position: absolute;
    top: 0; bottom: 0;
    width: 7px;
    background: rgba(255, 255, 255, 0.35);
    cursor: col-resize;
  }
  .zone-edge.left { left: 0; }
  .zone-edge.right { right: 0; }
  .zone-edge:hover { background: rgba(255, 255, 255, 0.7); }
  .zone-label {
    margin-left: 10px;
    font-size: 10px;
    font-weight: 600;
    color: #0d1116;
    white-space: nowrap;
    pointer-events: none;
  }

  .hint { align-self: center; color: #66707b; font-size: 10px; white-space: nowrap; }

  @media (max-width: 1100px) { .hint { display: none; } }
</style>
