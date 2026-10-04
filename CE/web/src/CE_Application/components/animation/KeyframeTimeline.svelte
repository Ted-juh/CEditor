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
  import { formatAxisLabel, axisScale } from '../../utils/keyframeModel.js';

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
  let resizeWatch = null;
  let settingModel = false;
  // While a keyframe is being dragged the library's model is the truth; replacing it mid-drag
  // leaves the drag holding a keyframe that no longer exists and drops it at the wrong time. The
  // document's model is applied when the drag ends instead.
  let dragging = false;
  let modelStale = false;
  const where = new WeakMap(); // library keyframe object → { track, index }
  const LEFT_MARGIN = 8;
  let fittedTo = '';
  let pinTop = null;

  /** A plain wheel is not the timeline's: it scrolls the tab. Ctrl+wheel is the library's zoom. */
  function leaveWheelToTheTab(event) {
    if (event.ctrlKey || event.metaKey) return;
    event.stopPropagation();
  }

  // The ruler fits the animation's length to the width it has (utils/keyframeModel.js, axisScale).
  // Done on mount, when the length changes and when the tab is resized; a zoom the user sets with
  // the wheel stays until one of those happens.
  function fitAxis() {
    if (!timeline || !host) return;
    const width = host.clientWidth - LEFT_MARGIN;
    if (!(width > 0)) return;
    const key = `${duration}:${width}`;
    if (key === fittedTo) return;
    fittedTo = key;
    timeline.setOptions({ ...axisScale(duration, width), zoom: 1 });
  }

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
      stepVal: 250,       // replaced by fitAxis() as soon as the width is known
      stepPx: 90,
      stepSmallPx: 18,
      snapStep: 10,       // keyframes land on 10 ms
      zoomMin: 0.25,
      zoomMax: 8,
      leftMargin: LEFT_MARGIN,
      fillColor: '#101316',
      headerFillColor: '#15181B',
      labelsColor: '#8E99A4',
      tickColor: '#2E3540',
      selectionColor: '#8FEDE3',
      timelineStyle: { strokeColor: '#F5B83D', fillColor: '#F5B83D', width: 2, capStyle: { width: 10, height: 8, fillColor: '#F5B83D' } },
    }, buildModel());
    // THE ROWS DO NOT SCROLL UP AND DOWN. The library makes its scroll area a fifth taller than
    // its rows and moves it on every turn of the wheel, so a wheel over the timeline slid the
    // keyframes up out of view — in a box that is already exactly as tall as its rows — and the
    // tab underneath could not be scrolled while the pointer was here. Vertical scrolling is off:
    // the wheel is left to the tab (Ctrl+wheel still zooms the ruler), and the scroll area is
    // held at the top if a drag near the edge pans it.
    const scroller = timeline._scrollContainer;
    if (scroller) {
      scroller.style.overflowY = 'hidden';
      scroller.style.overflowX = 'auto';
      pinTop = () => { if (scroller.scrollTop !== 0) scroller.scrollTop = 0; };
      scroller.addEventListener('scroll', pinTop);
      // With no vertical scrollbar the canvas takes the whole width.
      if (timeline._canvas) timeline._canvas.style.width = '100%';
      timeline.rescale();
    }
    // Capture, so it runs before the library's own listener on the canvas.
    host.addEventListener('wheel', leaveWheelToTheTab, { capture: true });

    // A KEYFRAME UNDER THE POINTER WINS THE DRAG. The library gives a press to the playhead before
    // a keyframe when both are under it. Selecting a keyframe puts the playhead exactly on it, so
    // the keyframe you had just selected could not be dragged — the playhead went instead, and a
    // second try moved the keyframe, leaving the two at different times. The playhead is still
    // dragged from the ruler, or from anywhere on a row that is not a keyframe.
    const pickDraggable = timeline._findDraggableElement;
    timeline._findDraggableElement = (elements, val = null) => {
      const keyframes = (elements ?? []).filter((element) => element?.type === 'keyframe');
      return pickDraggable(keyframes.length ? keyframes : elements, val);
    };
    // The library labels the ruler in seconds with no unit. Ours say what they are.
    timeline._formatUnitsText = formatAxisLabel;
    fitAxis();
    timeline.setTime(time);
    timeline.redraw();
    resizeWatch = new ResizeObserver(() => fitAxis());
    resizeWatch.observe(host);

    timeline.onTimeChanged((event) => {
      if (settingModel || event.source === 'setTimeMethod') return;
      ontime(Math.max(0, Math.round(event.val)));
    });
    timeline.onDragStarted(() => { dragging = true; });
    timeline.onDragFinished((event) => {
      dragging = false;
      const moves = [];
      for (const element of event.elements ?? []) {
        const at = element?.keyframe ? where.get(element.keyframe) : null;
        if (at) moves.push({ ...at, time: Math.max(0, Math.round(element.keyframe.val)) });
      }
      if (moves.length) onmove(moves);
      if (modelStale) applyModel();
    });
    // A press on the ruler or the playhead moves time; it is not a request to drop the selection,
    // so the empty "selected" the library sends after it is ignored. A press on empty track space
    // still deselects.
    let lastPress = '';
    timeline.onMouseDown((event) => {
      lastPress = String(event.target?.type ?? '');
      // A press on the keyframe that is already selected changes no selection, so the library says
      // nothing — and the playhead stayed wherever it was. It goes to the keyframe, as on a first click.
      const pressed = lastPress === 'keyframe' ? where.get(event.target.keyframe) : null;
      if (pressed && selected?.track === pressed.track && selected?.index === pressed.index) onselect(pressed);
    });
    timeline.onSelected((event) => {
      if (settingModel) return;
      const first = event.selected?.[0];
      if (!first && lastPress === 'timeline') return;
      onselect(first ? where.get(first) ?? null : null);
    });
  });

  // The library keeps its own copy of the model; every change the tab makes rebuilds it, so what
  // is drawn is always the document and never a stale drag.
  function applyModel() {
    if (!timeline) return;
    modelStale = false;
    settingModel = true;
    try {
      timeline.setModel(buildModel());
      timeline.setTime(time);
    } finally {
      settingModel = false;
    }
  }

  $effect(() => {
    void tracks; void selected; void duration; void time;
    if (!timeline) return;
    if (dragging) { modelStale = true; return; }
    fitAxis();
    applyModel();
  });

  onDestroy(() => {
    host?.removeEventListener('wheel', leaveWheelToTheTab, { capture: true });
    if (pinTop) timeline?._scrollContainer?.removeEventListener('scroll', pinTop);
    resizeWatch?.disconnect();
    resizeWatch = null;
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
  <div class="axis" bind:this={host} style="height:{22 + Math.max(1, tracks.length) * (rowHeight + 2) + 18}px"></div>
</div>

<style>
  .kft { display: flex; border: 1px solid #2A3038; border-radius: 4px; background: #101316; overflow: hidden; }
  .labels { width: 118px; flex: 0 0 118px; border-right: 1px solid #2A3038; font-size: 10.5px; color: #B9C4CE; }
  .lbl { display: flex; align-items: center; padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lbl.on { color: #8FEDE3; background: #152A2E; }
  .none { padding: 8px; color: #6E7A86; font-style: italic; }
  .axis { flex: 1; min-width: 0; }
</style>
