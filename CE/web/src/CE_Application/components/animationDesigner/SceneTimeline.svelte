<script>
  /**
   * A scene's timeline (utils/sceneModel.js): a ruler with the playhead, and a track per control and
   * place with its clips. Drag the ruler to scrub; drag a clip to retime it (Alt copies it), its right
   * edge to stretch it; click selects, Delete removes, the arrow keys nudge. An effect from the
   * library dropped on a track lands where it is dropped. Every change is one write, on release.
   */
  let {
    scene = null,
    tracks = [],
    at = 0,
    snap = 10,
    selectedClipId = '',
    readOnlyAdd = false,
    onseek = () => {},
    onselect = () => {},
    onmove = () => {},
    onresize = () => {},
    ondropeffect = () => {},
    ondelete = () => {},
    // The scene's markers (sceneFormat.js), flags on the ruler: picked, moved and taken out here.
    selectedMarkerId = '',
    onmarkerselect = () => {},
    onmarkermove = () => {},
    onmarkerdelete = () => {},
  } = $props();

  const LABEL_W = 220;
  let laneEl = $state(null);
  let laneWidth = $state(600);
  let drag = $state(null);          // { clipId, mode: 'move'|'resize', x0, start0, length0, copy, start, length }

  $effect(() => {
    if (!laneEl || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => { laneWidth = Math.max(200, laneEl.clientWidth); });
    observer.observe(laneEl);
    laneWidth = Math.max(200, laneEl.clientWidth);
    return () => observer.disconnect();
  });

  let length = $derived(Math.max(100, scene?.length ?? 1000));
  let pxPerMs = $derived(laneWidth / length);
  const snapTo = (ms) => Math.max(0, Math.round(ms / snap) * snap);

  /** Tick marks: about one every 80 px, at a round step. */
  let ticks = $derived.by(() => {
    const steps = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
    const step = steps.find((value) => value * pxPerMs >= 80) ?? 10000;
    const out = [];
    for (let t = 0; t <= length + 0.5; t += step) out.push(t);
    return out;
  });
  const fmt = (ms) => (ms >= 1000 || ms === 0 ? `${Number((ms / 1000).toFixed(2))}` : `${Math.round(ms)}`) + (ms >= 1000 || ms === 0 ? ' s' : ' ms');

  function timeAt(event, el) {
    const rect = el.getBoundingClientRect();
    return Math.min(length, Math.max(0, (event.clientX - rect.left) / pxPerMs));
  }

  // --- The ruler: scrub ---------------------------------------------------------------------------
  function rulerDown(event) {
    const el = event.currentTarget;
    el.setPointerCapture?.(event.pointerId);
    onseek(snapTo(timeAt(event, el)));
    const move = (e) => onseek(snapTo(timeAt(e, el)));
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  // --- Markers: a press picks one, a drag moves it along the ruler, Delete takes it out -------------
  let markerDrag = $state(null);     // { id, at }: where the marker being dragged is now
  function markerDown(event, marker) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    onmarkerselect(marker.id);
    const el = event.currentTarget;
    const ruler = laneEl;
    el.focus?.();
    el.setPointerCapture?.(event.pointerId);
    markerDrag = { id: marker.id, at: marker.at };
    const move = (e) => { markerDrag = { id: marker.id, at: snapTo(timeAt(e, ruler)) }; };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (markerDrag && markerDrag.at !== marker.at) onmarkermove(marker.id, markerDrag.at);
      markerDrag = null;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }
  const markerAt = (marker) => (markerDrag?.id === marker.id ? markerDrag.at : marker.at);

  // --- Clips: move, copy, stretch ------------------------------------------------------------------
  function clipDown(event, clip, mode) {
    if (event.button !== 0) return;
    event.stopPropagation();
    // No text selection and no native drag: a second press on a clip whose label the first drag had
    // selected started the browser's own drag of that text, which cancels the pointer mid-drag.
    event.preventDefault();
    const el = event.currentTarget;
    (el.closest('[data-clip]') ?? el).focus?.();
    onselect(clip.id);
    el.setPointerCapture?.(event.pointerId);
    drag = { clipId: clip.id, mode, x0: event.clientX, start0: clip.start, length0: clip.length, copy: event.altKey, start: clip.start, length: clip.length, moved: false };
    const move = (e) => {
      const dt = (e.clientX - drag.x0) / pxPerMs;
      if (Math.abs(e.clientX - drag.x0) > 2) drag.moved = true;
      if (drag.mode === 'move') drag = { ...drag, start: snapTo(drag.start0 + dt) };
      else drag = { ...drag, length: Math.max(snap, snapTo(drag.length0 + dt)) };
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      const done = drag;
      drag = null;
      if (!done?.moved) return;
      if (done.mode === 'move') onmove(done.clipId, done.start, { copy: done.copy });
      else onresize(done.clipId, done.length);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  function clipKey(event, clip) {
    const step = event.shiftKey ? 100 : snap;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); ondelete(clip.id); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); onmove(clip.id, Math.max(0, clip.start - step), {}); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); onmove(clip.id, clip.start + step, {}); }
  }

  const shown = (clip) => (drag?.clipId === clip.id && !drag.copy ? { start: drag.start, length: drag.length } : clip);

  // --- Dropping a library effect on a track --------------------------------------------------------
  let dropTrack = $state('');
  function trackDragOver(event, track) {
    if (readOnlyAdd || !event.dataTransfer?.types?.includes('application/x-ce-effect')) return;
    event.preventDefault();
    dropTrack = track.key;
  }
  function trackDrop(event, track) {
    const id = event.dataTransfer?.getData('application/x-ce-effect');
    dropTrack = '';
    if (!id || readOnlyAdd) return;
    event.preventDefault();
    ondropeffect({ effectId: id, controlId: track.controlId, target: track.target, start: snapTo(timeAt(event, event.currentTarget)) });
  }

  const engineOf = (clip) => (clip.effect.kind === 'text' ? 'text' : (clip.effect.frames ?? []).some((f) => f.turn !== undefined || f.shift !== undefined || f.fill || f.text) ? 'paint' : 'move');
  function clipLabel(clip) {
    if (clip.label) return clip.label;
    if (clip.effect.kind === 'text') return `${clip.effect.effect ?? 'text'} ${clip.effect.way ?? 'in'}`;
    return clip.effect.label ?? `${(clip.effect.frames ?? []).length} frames`;
  }
</script>

<div class="tl" style={`--label:${LABEL_W}px`}>
  <div class="row head">
    <div class="lab sticky">{scene ? `${scene.name} · ${scene.loop ? 'loops' : 'once'} · ${fmt(length)}` : 'No scene'}</div>
    <div class="ruler" bind:this={laneEl} role="slider" tabindex="0" aria-label="Playhead" aria-valuemin="0" aria-valuemax={length} aria-valuenow={Math.round(at)}
         onpointerdown={rulerDown}
         onkeydown={(event) => { if (event.key === 'ArrowLeft') onseek(Math.max(0, at - snap)); if (event.key === 'ArrowRight') onseek(Math.min(length, at + snap)); if (event.key === 'Home') onseek(0); if (event.key === 'End') onseek(length); }}>
      {#each ticks as t (t)}
        <span class="tick" style={`left:${t * pxPerMs}px`}><i>{fmt(t)}</i></span>
      {/each}
      {#each scene?.markers ?? [] as marker (marker.id)}
        <button type="button" class="marker" class:sel={marker.id === selectedMarkerId} class:unnamed={!marker.action} data-marker={marker.id}
                style={`left:${markerAt(marker) * pxPerMs}px`}
                title={`${fmt(markerAt(marker))}: ${marker.action ? `calls ${marker.action}` : 'calls nothing yet: name its action'}`}
                aria-label={`Marker at ${fmt(marker.at)}${marker.action ? `, calls ${marker.action}` : ''}`}
                onpointerdown={(event) => markerDown(event, marker)}
                onkeydown={(event) => { if (event.key === 'Delete' || event.key === 'Backspace') { event.stopPropagation(); onmarkerdelete(marker.id); } }}></button>
      {/each}
    </div>
  </div>
  <div class="tracks">
    {#each tracks as track (track.key)}
      <div class="row track" class:missing={track.missing} data-track={track.key}>
        <div class="lab sticky" title={`${track.control} › ${track.label}`}>
          <b>{track.control}</b> <span>{track.label}</span>
        </div>
        <div class="lane" class:drop={dropTrack === track.key} role="group" aria-label={`${track.control} ${track.label}`}
             ondragover={(event) => trackDragOver(event, track)} ondragleave={() => { dropTrack = ''; }} ondrop={(event) => trackDrop(event, track)}>
          {#each track.clips as clip (clip.id)}
            {@const view = shown(clip)}
            <div class="clip {engineOf(clip)}" class:sel={clip.id === selectedClipId} role="button" tabindex="0" aria-roledescription="clip"
                 aria-label={`${clipLabel(clip)}, ${fmt(clip.start)} for ${fmt(clip.length)}`}
                 data-clip={clip.id}
                 style={`left:${view.start * pxPerMs}px;width:${Math.max(6, view.length * pxPerMs)}px`}
                 title={`${clipLabel(clip)} · ${fmt(view.start)} for ${fmt(view.length)} · drag to retime, Alt+drag copies`}
                 onpointerdown={(event) => clipDown(event, clip, 'move')} onkeydown={(event) => clipKey(event, clip)}
                 onfocus={() => onselect(clip.id)}>
              <span class="cl">{clipLabel(clip)}</span>
              <span class="grip" aria-hidden="true" onpointerdown={(event) => clipDown(event, clip, 'resize')}></span>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="row empty"><div class="lab sticky"></div><div class="lane note">Drag an effect from the library onto a control on the stage, or onto a track here.</div></div>
    {/each}
  </div>
  <div class="playhead" style={`left:calc(var(--label) + ${at * pxPerMs}px)`} aria-hidden="true"></div>
</div>

<style>
  .tl { position: relative; display: flex; flex-direction: column; min-height: 0; flex: 1; overflow: auto; user-select: none; -webkit-user-select: none; background: #12161A; font: 400 12px/1.3 'IBM Plex Sans', system-ui, sans-serif; color: #E8EEF3; }
  .row { display: grid; grid-template-columns: var(--label) minmax(0, 1fr); min-height: 30px; border-bottom: 1px solid #20262C; }
  .lab { padding: 6px 10px; border-right: 1px solid #2B323A; background: #151A1E; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #AEB9C4; }
  .lab b { color: #E8EEF3; font-weight: 600; }
  .sticky { position: sticky; left: 0; z-index: 2; }
  .head { position: sticky; top: 0; z-index: 3; background: #151A1E; }
  .ruler { position: relative; height: 30px; cursor: ew-resize; outline: none; }
  /* A marker: a flag hanging from the top of the ruler, its point at its moment. */
  .marker {
    position: absolute; top: 0; width: 10px; height: 12px; margin-left: -5px; padding: 0; border: 0; cursor: grab;
    background: #F2B84B; clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%); z-index: 2;
  }
  .marker.unnamed { background: #8A96A3; }
  .marker.sel { background: #FFE08A; outline: none; filter: drop-shadow(0 0 2px #FFE08A); }
  .marker:focus-visible { filter: drop-shadow(0 0 2px #5AA9E6); }
  .ruler:focus-visible { box-shadow: inset 0 0 0 1px #5AA9E6; }
  .tick { position: absolute; top: 0; bottom: 0; border-left: 1px solid #2F3840; }
  .tick i { position: absolute; left: 4px; top: 8px; font-style: normal; color: #8A96A3; white-space: nowrap; font-size: 11px; }
  .tracks { display: flex; flex-direction: column; }
  .lane { position: relative; height: 30px; }
  .lane.drop { background: #173449; }
  .track.missing .lab { color: #D98C8C; }
  .note { display: flex; align-items: center; padding: 0 12px; color: #8A96A3; }
  .clip { position: absolute; top: 4px; height: 22px; box-sizing: border-box; border-radius: 5px; border: 1px solid; cursor: grab; display: flex; align-items: center; overflow: hidden; outline: none; }
  .clip.move { background: #173A5A; border-color: #2E5677; }
  .clip.text { background: #10362F; border-color: #2E7D6B; }
  .clip.paint { background: #3A2B12; border-color: #7A5C16; }
  .clip.sel { box-shadow: 0 0 0 2px #E8EEF3; }
  .clip:focus-visible { box-shadow: 0 0 0 2px #5AA9E6; }
  .cl { padding: 0 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
  .grip { position: absolute; right: 0; top: 0; bottom: 0; width: 7px; cursor: ew-resize; background: rgba(255, 255, 255, 0.08); }
  .playhead { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #F06292; pointer-events: none; z-index: 4; }
</style>
