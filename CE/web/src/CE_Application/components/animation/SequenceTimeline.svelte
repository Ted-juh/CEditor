<script>
  /**
   * The sequence's timeline: a ruler, one row per track, a diamond per keyframe, a playhead.
   *
   * Plain elements, not a canvas. The first version drew this with animation-timeline-js, and
   * most of what went wrong with it came from the library rather than from the idea: it gave a
   * drag to the playhead before the keyframe under the pointer, moved the playhead on any click in
   * a row, scrolled its rows up out of their own box on a turn of the wheel, and on the owner's
   * display drew itself at about sixty percent of its box, over the fields below. Each of those
   * was patched from outside. Rows of elements have none of them to patch, take the tab's own type
   * sizes, and let each track carry its name, its warning and its remove button on the row itself.
   *
   * WHO MOVES WHAT. The playhead belongs to the ruler: a press or a drag anywhere along it moves
   * the playhead and nothing else. The keyframes belong to the rows: a press selects one, a drag
   * moves it, a press on empty track deselects. Neither moves the other. A double-click on a
   * keyframe sends the playhead to it, which is the one way from a row and is on purpose.
   *
   * WHAT IS WRITTEN WHEN. Nothing is written while a keyframe is in the hand; `ondrag` says where
   * it is, and `onmove` is called once, on release. The tab turns that into one store write, so a
   * drag is one undo step.
   *
   * THE SCALE. The animation's length ends nine tenths of the way across (AXIS_FILL), whatever the
   * length; the last tenth is room to drag a keyframe past the end. Ticks fall on round numbers
   * (axisScale, utils/keyframeModel.js). Times snap to 10 ms.
   *
   * MANY TRACKS. The rows scroll inside this box and nowhere else; the ruler stays at the top.
   */
  import { tick } from 'svelte';
  import X from 'lucide-svelte/icons/x';
  import Plus from 'lucide-svelte/icons/plus';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import { formatAxisLabel, axisScale, AXIS_FILL } from '../../utils/keyframeModel.js';

  let {
    tracks = [],            // [{ label, path, keyframes: [{ time }], works, detail }]
    duration = 1000,
    time = 0,
    selected = null,        // { track, index } or null
    selectedTrack = -1,
    adding = false,
    addrow = null,          // snippet: the "what to add" row, shown under the ruler while adding
    ontime = () => {},
    onmove = () => {},      // [{ track, index, time }]
    onselect = () => {},    // { track, index } or null
    ondrag = () => {},      // { track, index, time } while a keyframe is dragged, null when it ends
    onselecttrack = () => {},
    onremove = () => {},
    onreorder = () => {},
    ontoggleadd = () => {},
    ondelete = () => {},
  } = $props();

  /** Pixels before 0 ms, so a keyframe at the start is not cut in half by the edge. */
  const MARGIN = 8;
  const SNAP = 10;

  let rulerEl = $state(null);
  let rulerWidth = $state(0);
  let nameEls = $state([]);
  let scrubbing = false;
  let drag = $state(null);  // { track, index, startX, start, time, moved }

  let length = $derived(Math.max(10, Number(duration) || 1000));
  let visibleEnd = $derived(length / AXIS_FILL);
  /** Pixels per millisecond, from the ruler's real width. */
  let scale = $derived(rulerWidth > MARGIN ? ((rulerWidth - MARGIN) * AXIS_FILL) / length : 0);

  const snap = (ms) => Math.round(ms / SNAP) * SNAP;
  const clamp = (ms) => Math.max(0, Math.min(snap(visibleEnd), ms));
  const leftOf = (ms) => `calc(${MARGIN}px + (100% - ${MARGIN}px) * ${((AXIS_FILL * Math.min(ms, visibleEnd)) / length).toFixed(5)})`;

  let ticks = $derived.by(() => {
    const { stepVal } = axisScale(length, Math.max(100, rulerWidth - MARGIN));
    const out = [];
    for (let at = 0; at <= visibleEnd + 0.001 && out.length < 200; at += stepVal) out.push(at);
    return out;
  });

  function timeAt(clientX) {
    if (!rulerEl || !scale) return 0;
    const left = rulerEl.getBoundingClientRect().left;
    return clamp(snap((clientX - left - MARGIN) / scale));
  }

  // --- The ruler: the playhead's, all of it -------------------------------------------------------

  function rulerDown(event) {
    if (event.button !== 0) return;
    scrubbing = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    ontime(timeAt(event.clientX));
  }
  function rulerMove(event) {
    if (scrubbing) ontime(timeAt(event.clientX));
  }
  function rulerUp() {
    scrubbing = false;
  }
  function rulerKey(event) {
    const step = event.shiftKey ? 100 : SNAP;
    if (event.key === 'ArrowLeft') { event.preventDefault(); ontime(clamp(time - step)); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); ontime(clamp(time + step)); }
    else if (event.key === 'Home') { event.preventDefault(); ontime(0); }
    else if (event.key === 'End') { event.preventDefault(); ontime(snap(length)); }
  }

  // --- Keyframes: the rows' ---------------------------------------------------------------------

  /** Where a keyframe is drawn: where it is being dragged to, or where the document has it. */
  function shownTime(trackIndex, index, keyframe) {
    return drag && drag.moved && drag.track === trackIndex && drag.index === index ? drag.time : keyframe.time;
  }

  function keyDown(event, trackIndex, index, keyframe) {
    if (event.button !== 0) return;
    event.stopPropagation();
    onselecttrack(trackIndex);
    onselect({ track: trackIndex, index });
    drag = { track: trackIndex, index, startX: event.clientX, start: keyframe.time, time: keyframe.time, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function keyMove(event) {
    if (!drag || !scale) return;
    const dx = event.clientX - drag.startX;
    // A press that wobbles a pixel or two is a click, not a move.
    if (!drag.moved && Math.abs(dx) < 3) return;
    const next = clamp(snap(drag.start + dx / scale));
    drag = { ...drag, moved: true, time: next };
    ondrag({ track: drag.track, index: drag.index, time: next });
  }
  function keyUp() {
    if (!drag) return;
    const done = drag;
    drag = null;
    if (done.moved) {
      if (done.time !== done.start) onmove([{ track: done.track, index: done.index, time: done.time }]);
      ondrag(null);
    }
  }
  function keyKey(event, trackIndex, index, keyframe) {
    const step = event.shiftKey ? 100 : SNAP;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next = clamp(keyframe.time + (event.key === 'ArrowLeft' ? -step : step));
      if (next !== keyframe.time) onmove([{ track: trackIndex, index, time: next }]);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onselect({ track: trackIndex, index });
      ondelete({ track: trackIndex, index });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      ontime(keyframe.time);
    }
  }

  /** A press on the track itself, not on a keyframe: nothing is selected any more. */
  function laneDown(event, trackIndex) {
    if (event.button !== 0) return;
    onselecttrack(trackIndex);
    onselect(null);
  }

  // --- Track names: select, reorder from the keyboard, remove ------------------------------------

  async function nameKey(event, trackIndex) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onselecttrack(trackIndex); return; }
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const to = trackIndex + (event.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= tracks.length) return;
    onreorder(trackIndex, to);
    await tick();
    nameEls[to]?.focus();
  }

  const barOf = (trackIndex, track) => {
    const times = (track.keyframes ?? []).map((keyframe, index) => shownTime(trackIndex, index, keyframe));
    if (times.length < 2) return null;
    const first = Math.min(...times);
    const last = Math.max(...times);
    return { left: leftOf(first), width: `calc((100% - ${MARGIN}px) * ${((AXIS_FILL * (Math.min(last, visibleEnd) - first)) / length).toFixed(5)})` };
  };
</script>

<div class="seqtl" role="group" aria-label="Sequence timeline">
  <div class="tl-scroll">
    <div class="tl-top">
      <div class="tl-head">
        <div class="tl-name head">
          <b>Tracks</b>
          <span class="count">{tracks.length}</span>
          <button type="button" class="addtoggle" class:on={adding} aria-expanded={adding}
                  title="Add a track: pick what this sequence changes" onclick={ontoggleadd}>
            <Plus size={13} aria-hidden="true" /> Add
          </button>
        </div>
        <!-- The ruler is the playhead's handle: pointer and arrow keys both move it. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <div class="tl-ruler" bind:this={rulerEl} bind:clientWidth={rulerWidth}
             role="group" tabindex="0"
             aria-label={`Playhead at ${Math.round(time)} ms of ${Math.round(length)}. Arrow keys move it.`}
             title="Click or drag here to move the playhead"
             onpointerdown={rulerDown} onpointermove={rulerMove} onpointerup={rulerUp} onpointercancel={rulerUp}
             onkeydown={rulerKey}>
          {#each ticks as at (at)}
            <span class="tick" style="left:{leftOf(at)}">{formatAxisLabel(at)}</span>
          {/each}
          <span class="end" style="left:{leftOf(length)}" title="The sequence ends here"></span>
          <span class="cap" style="left:{leftOf(time)}"></span>
        </div>
      </div>
      {#if adding && addrow}
        <div class="tl-add">{@render addrow()}</div>
      {/if}
    </div>

    {#each tracks as track, trackIndex (trackIndex)}
      {@const bar = barOf(trackIndex, track)}
      <div class="tl-track" class:sel={selectedTrack === trackIndex} class:bad={track.works === false}>
        <div class="tl-name" role="button" tabindex="0" bind:this={nameEls[trackIndex]}
             aria-pressed={selectedTrack === trackIndex}
             title={track.works === false ? track.detail : `${track.path} — Alt+Up / Alt+Down moves this track`}
             onclick={() => onselecttrack(trackIndex)}
             onkeydown={(event) => nameKey(event, trackIndex)}>
          {#if track.works === false}<TriangleAlert size={13} aria-hidden="true" />{/if}
          <span class="lbl">{track.label}</span>
          <button type="button" class="drop" title="Remove this track" aria-label={`Remove the ${track.label} track`}
                  onclick={(event) => { event.stopPropagation(); onremove(trackIndex); }}>
            <X size={13} />
          </button>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="tl-lane" onpointerdown={(event) => laneDown(event, trackIndex)}>
          {#if bar}<span class="bar" style="left:{bar.left};width:{bar.width}"></span>{/if}
          <span class="end" style="left:{leftOf(length)}"></span>
          {#each track.keyframes ?? [] as keyframe, index (index)}
            {@const at = shownTime(trackIndex, index, keyframe)}
            {@const on = selected?.track === trackIndex && selected?.index === index}
            <button type="button" class="kf" class:on
                    style="left:{leftOf(at)}"
                    aria-pressed={on}
                    aria-label={`${track.label} keyframe at ${at} ms`}
                    title={`${at} ms — drag to move, double-click to bring the playhead here`}
                    onpointerdown={(event) => keyDown(event, trackIndex, index, keyframe)}
                    onpointermove={keyMove} onpointerup={keyUp} onpointercancel={keyUp}
                    ondblclick={() => ontime(keyframe.time)}
                    onkeydown={(event) => keyKey(event, trackIndex, index, keyframe)}>
              <i aria-hidden="true"></i>
            </button>
          {/each}
          <span class="line" style="left:{leftOf(time)}"></span>
        </div>
      </div>
    {/each}

    {#if !tracks.length}
      <p class="none">No tracks yet. Use Add to pick what this sequence changes.</p>
    {/if}
  </div>
</div>

<style>
  .seqtl {
    flex: 1;
    min-height: 0;
    display: flex;
    border: 1px solid #2B323A;
    border-radius: 8px;
    background: #12161A;
    overflow: hidden;
    --name: 200px;
    --row: 30px;
  }
  .tl-scroll { flex: 1; min-width: 0; min-height: 0; overflow-x: hidden; overflow-y: auto; scrollbar-color: #4A5560 #12161A; }
  .tl-top { position: sticky; top: 0; z-index: 3; background: #171B1F; border-bottom: 1px solid #2B323A; }
  .tl-head, .tl-track { display: flex; }
  .tl-track { border-bottom: 1px solid #232A31; }

  .tl-name {
    flex: 0 0 var(--name);
    box-sizing: border-box;
    height: var(--row);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px 0 12px;
    border-right: 1px solid #2B323A;
    font: 400 13px/1.2 'IBM Plex Sans', system-ui, sans-serif;
    color: #E8EEF3;
    cursor: pointer;
    outline: none;
    min-width: 0;
  }
  .tl-name.head { height: 32px; cursor: default; padding-right: 6px; }
  .tl-name.head b { font-weight: 600; }
  .tl-name .count { flex: 1; color: #AEB9C4; }
  .tl-name .lbl { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl-name:focus-visible { box-shadow: inset 0 0 0 2px #7CC4FF; }
  .tl-track.sel .tl-name { background: #173A5A; }
  .tl-track.bad .tl-name { color: #F6D58A; }

  .addtoggle {
    display: inline-flex; align-items: center; gap: 5px;
    height: 26px; padding: 0 10px;
    border: 1px solid #2E7D6B; border-radius: 6px; background: #10362F; color: #BFF3E6;
    font: 500 13px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer;
  }
  .addtoggle:hover { border-color: #3DDBB4; }
  .addtoggle.on { background: #17493F; }

  .drop {
    flex: none; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
    padding: 0; border: 1px solid transparent; border-radius: 5px; background: transparent;
    color: #8A96A3; cursor: pointer;
  }
  .drop:hover { border-color: #8A3B3B; color: #FFC9C9; }

  .tl-ruler {
    flex: 1; min-width: 0; position: relative; height: 32px;
    cursor: ew-resize; outline: none; touch-action: none; user-select: none;
  }
  .tl-ruler:focus-visible { box-shadow: inset 0 0 0 2px #7CC4FF; }
  .tick {
    position: absolute; top: 0; bottom: 0;
    border-left: 1px solid #3A434D;
    padding: 8px 0 0 6px;
    font: 400 12px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #AEB9C4; white-space: nowrap; pointer-events: none;
  }
  .cap {
    position: absolute; top: 2px; width: 14px; height: 12px; margin-left: -7px;
    border-radius: 3px; background: #F5B83D; pointer-events: none;
  }
  /* Where the sequence ends: everything to the right of it is only room to drag into. */
  .end { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px dashed #5B6670; pointer-events: none; }

  .tl-add { border-top: 1px solid #2B323A; background: #1A2026; }

  .tl-lane { flex: 1; min-width: 0; position: relative; height: var(--row); background: #161B20; touch-action: none; }
  .tl-track.sel .tl-lane { background: #18222C; }
  .bar { position: absolute; top: 12px; height: 6px; border-radius: 3px; background: #2C5C8A; pointer-events: none; }
  .line { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #F5B83D; pointer-events: none; }

  .kf {
    position: absolute; top: 1px; width: 28px; height: 28px; margin-left: -14px; padding: 0;
    border: 0; background: transparent; display: flex; align-items: center; justify-content: center;
    cursor: grab; touch-action: none; z-index: 1; outline: none;
  }
  .kf:active { cursor: grabbing; }
  .kf i { width: 12px; height: 12px; transform: rotate(45deg); background: #F0A441; }
  .kf:hover i { background: #FFC56E; }
  /* Selected: red, larger and ringed in white, so it is told apart by more than its hue. */
  .kf.on { z-index: 2; }
  .kf.on i { width: 14px; height: 14px; background: #FF6B6B; outline: 2px solid #FFFFFF; }
  .kf:focus-visible i { outline: 2px solid #7CC4FF; outline-offset: 2px; }

  .none { margin: 0; padding: 14px 12px; font: 400 13px/1.5 'IBM Plex Sans', system-ui, sans-serif; color: #AEB9C4; }
</style>
