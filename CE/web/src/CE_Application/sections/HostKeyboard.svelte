<script>
  /**
   * HostKeyboard.svelte — two octaves of playable keys under the rack.
   *
   * The host had no way to make a sound without a hardware MIDI keyboard plugged in, which
   * made "load a synth and hear it" impossible on a laptop lid. This strip sends notes through
   * the SAME native path hardware MIDI takes (the player's collector, ahead of the graph), so
   * zones, splits, the event chain and the arp all apply — auditioning here is auditioning
   * what a keyboard would play, not a side door around the routing.
   *
   * Velocity comes from WHERE a key is pressed — toward the top is soft, the bottom edge is
   * hard — because a mouse has no aftertouch and a fixed velocity makes every synth sound like
   * an organ. The computer keyboard plays too: A W S E D F T G Y H U J K, the layout every
   * DAW taught, with Z and X shifting octaves.
   */
  import { hostNote } from '../stores/instrumentHost.js';

  let baseOctave = $state(4);   // C4 at the left edge

  const WHITE = [0, 2, 4, 5, 7, 9, 11];
  const BLACK = { 0: 1, 1: 3, 3: 6, 4: 8, 5: 10 };   // white index → sharp above it
  const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12 };

  let pressed = $state(new Set());
  let mouseNote = -1;
  let mouseDown = false;

  function noteAt(octave, semitone) {
    return Math.min(127, Math.max(0, (octave + 1) * 12 + semitone));
  }

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
    if (key === 'z') { baseOctave = Math.max(0, baseOctave - 1); return; }
    if (key === 'x') { baseOctave = Math.min(8, baseOctave + 1); return; }
    if (key in KEYMAP) press(noteAt(baseOctave, KEYMAP[key]), 100);
  }

  function typeUp(event) {
    const key = event.key.toLowerCase();
    if (key in KEYMAP) release(noteAt(baseOctave, KEYMAP[key]));
  }
</script>

<svelte:window onmouseup={mouseUp} onkeydown={typeDown} onkeyup={typeUp} />

<div class="host-keyboard" data-testid="host-keyboard">
  <div class="octave-controls">
    <button type="button" title="Octave down (Z)"
            onclick={() => (baseOctave = Math.max(0, baseOctave - 1))}>−</button>
    <span class="octave-label">C{baseOctave}</span>
    <button type="button" title="Octave up (X)"
            onclick={() => (baseOctave = Math.min(8, baseOctave + 1))}>+</button>
  </div>

  <div class="keys" role="presentation">
    {#each [0, 1] as octaveOffset (octaveOffset)}
      {#each WHITE as semitone, whiteIndex (semitone)}
        {@const note = noteAt(baseOctave + octaveOffset, semitone)}
        <div class="white-slot">
          <button type="button" class="white" class:down={pressed.has(note)}
                  data-note={note} aria-label={`Note ${note}`}
                  onmousedown={(e) => keyDown(note, e)}
                  onmouseenter={(e) => keyEnter(note, e)}></button>
          {#if whiteIndex in BLACK}
            {@const sharp = noteAt(baseOctave + octaveOffset, BLACK[whiteIndex])}
            <button type="button" class="black" class:down={pressed.has(sharp)}
                    data-note={sharp} aria-label={`Note ${sharp}`}
                    onmousedown={(e) => { e.stopPropagation(); keyDown(sharp, e); }}
                    onmouseenter={(e) => keyEnter(sharp, e)}></button>
          {/if}
        </div>
      {/each}
    {/each}
  </div>

  <span class="hint">A–K plays · Z/X octave · press low on a key for a harder hit</span>
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

  .octave-controls { display: flex; flex-direction: column; align-items: center; gap: 2px; justify-content: center; }
  .octave-label { color: #9aa5b1; font-size: 11px; min-width: 24px; text-align: center; }
  .octave-controls button {
    background: #232a31;
    border: 1px solid #3b4652;
    border-radius: 4px;
    color: #d6dbe0;
    width: 24px;
    padding: 0 0 2px;
    cursor: pointer;
    font: inherit;
    line-height: 1.2;
  }
  .octave-controls button:hover { border-color: #5b9bd5; }

  .keys { display: flex; flex: 1; height: 74px; min-width: 0; }
  .white-slot { position: relative; flex: 1; min-width: 0; }

  .white {
    position: absolute;
    inset: 0;
    background: #e8eaec;
    border: 1px solid #10141a;
    border-radius: 0 0 3px 3px;
    cursor: pointer;
    padding: 0;
  }
  .white.down { background: #9fc4e8; }

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

  .hint { align-self: center; color: #66707b; font-size: 10px; white-space: nowrap; }

  @media (max-width: 1100px) { .hint { display: none; } }
</style>
