<script>
  /**
   * The time axis: one row per target, a diamond per keyframe, a playhead.
   *
   * `animation-timeline-js` draws and handles it (canvas, no dependencies, MIT). This component
   * owns nothing: it builds the library's model from the tracks it is given, and turns the
   * library's events back into calls — a dragged keyframe becomes `onmove`, a moved playhead
   * `ontime`, a click `onselect`. The document is written by the tab, through the same store path
   * as every other edit, so undo sees a keyframe drag as one step.
   */
  import { onDestroy, onMount } from 'svelte';
  import { Timeline } from 'animation-timeline-js';

  let {
    tracks = [],          // [{ label, keyframes: [{ time }] }]
    duration = 1000,
    time = 0,
    selected = null,      // { track, index } or null
    rowHeight = 26,
    ontime = () => {},
    onmove = () => {},    // [{ track, index, time }]
    onselect = () => {},  // { track, index } or null
  } = $props();

  let host = $state(null);
  let timeline = null;
  let settingModel = false;
  const where = new WeakMap(); // library keyframe object → { track, index }

  function buildModel() {
    return {
      rows: tracks.map((track, trackIndex) => ({
        keyframes: (track.keyframes ?? []).map((keyframe, index) => {
          const kf = { val: keyframe.time, selected: selected?.track === trackIndex && selected?.index === index };
          where.set(kf, { track: trackIndex, index });
          return kf;
        }),
      })),
    };
  }

  onMount(() => {
    timeline = new Timeline({
      id: host,
      headerHeight: 22,
      rowsStyle: { height: rowHeight, marginBottom: 2 },
      stepVal: 250,       // one labelled tick per 250 ms
      stepPx: 90,
      stepSmallPx: 18,
      snapStep: 10,       // keyframes land on 10 ms
      zoomMin: 0.25,
      zoomMax: 8,
      leftMargin: 8,
      fillColor: '#101316',
      headerFillColor: '#15181B',
      labelsColor: '#8E99A4',
      tickColor: '#2E3540',
      selectionColor: '#8FEDE3',
      timelineStyle: { strokeColor: '#F5B83D', fillColor: '#F5B83D', width: 2, capStyle: { width: 10, height: 8, fillColor: '#F5B83D' } },
    }, buildModel());
    timeline.setTime(time);

    timeline.onTimeChanged((event) => {
      if (settingModel || event.source === 'setTimeMethod') return;
      ontime(Math.max(0, Math.round(event.val)));
    });
    timeline.onDragFinished((event) => {
      const moves = [];
      for (const element of event.elements ?? []) {
        const at = element?.keyframe ? where.get(element.keyframe) : null;
        if (at) moves.push({ ...at, time: Math.max(0, Math.round(element.keyframe.val)) });
      }
      if (moves.length) onmove(moves);
    });
    timeline.onSelected((event) => {
      if (settingModel) return;
      const first = event.selected?.[0];
      onselect(first ? where.get(first) ?? null : null);
    });
  });

  // The library keeps its own copy of the model; every change the tab makes rebuilds it, so what
  // is drawn is always the document and never a stale drag.
  $effect(() => {
    void tracks; void selected; void duration;
    if (!timeline) return;
    settingModel = true;
    try {
      timeline.setModel(buildModel());
      timeline.setTime(time);
    } finally {
      settingModel = false;
    }
  });

  onDestroy(() => {
    timeline?.dispose();
    timeline = null;
  });
</script>

<div class="kft" role="group" aria-label="Keyframe timeline">
  <div class="labels" style="padding-top:22px">
    {#each tracks as track, index (index)}
      <div class="lbl" class:on={selected?.track === index} style="height:{rowHeight}px; margin-bottom:2px" title={track.path}>
        {track.label}
      </div>
    {/each}
    {#if !tracks.length}<div class="none">No changes yet</div>{/if}
  </div>
  <div class="axis" bind:this={host} style="height:{22 + Math.max(1, tracks.length) * (rowHeight + 2) + 14}px"></div>
</div>

<style>
  .kft { display: flex; border: 1px solid #2A3038; border-radius: 4px; background: #101316; overflow: hidden; }
  .labels { width: 118px; flex: 0 0 118px; border-right: 1px solid #2A3038; font-size: 10.5px; color: #B9C4CE; }
  .lbl { display: flex; align-items: center; padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lbl.on { color: #8FEDE3; background: #152A2E; }
  .none { padding: 8px; color: #6E7A86; font-style: italic; }
  .axis { flex: 1; min-width: 0; }
</style>
