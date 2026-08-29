<script>
  /**
   * HostSplitEditor.svelte — splits and layers drawn on one keyboard.
   *
   * The zone numbers (key low/high per part) were always editable as digits in the MIDI
   * zone panel; this draws every part's range as a bar over a piano strip so a split is a
   * drag, a layer is two overlapping bars, and a hole in the map is visible before it is
   * audible. Dragging an edge moves that bound, dragging the middle moves the whole zone;
   * every move sends the same setPartMidiRules command the numeric fields send, so the
   * digits and the picture can never disagree.
   */
  import { hostState, focusRackPart, setPartMidiRules } from '../stores/instrumentHost.js';

  let parts = $derived($hostState.rack.parts);
  let focusedPartId = $derived($hostState.rack.focusedPartId);

  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const BLACK = new Set([1, 3, 6, 8, 10]);
  const noteName = (n) => `${NOTES[n % 12]}${Math.floor(n / 12) - 1}`;

  const LANE_H = 22;
  const KEYS_H = 26;
  let svgEl = $state(null);

  // partId + which handle while a drag is live; grabOffset keeps a middle-drag anchored to
  // the key it started on instead of snapping the zone's left edge to the pointer.
  let drag = $state(null);

  function keyAt(clientX) {
    const rect = svgEl.getBoundingClientRect();
    return Math.max(0, Math.min(127, Math.floor(((clientX - rect.left) / rect.width) * 128)));
  }

  function beginDrag(event, part, handle) {
    event.preventDefault();
    focusRackPart(part.partId);
    drag = { partId: part.partId, handle, grabOffset: keyAt(event.clientX) - part.keyLow };
    event.currentTarget.ownerSVGElement.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (!drag) return;
    const part = parts.find((p) => p.partId === drag.partId);
    if (!part) { drag = null; return; }
    const key = keyAt(event.clientX);

    if (drag.handle === 'low') {
      const low = Math.min(key, part.keyHigh);
      if (low !== part.keyLow) setPartMidiRules(part.partId, { keyLow: low });
    } else if (drag.handle === 'high') {
      const high = Math.max(key, part.keyLow);
      if (high !== part.keyHigh) setPartMidiRules(part.partId, { keyHigh: high });
    } else {
      const width = part.keyHigh - part.keyLow;
      const low = Math.max(0, Math.min(127 - width, key - drag.grabOffset));
      if (low !== part.keyLow)
        setPartMidiRules(part.partId, { keyLow: low, keyHigh: low + width });
    }
  }

  const endDrag = () => (drag = null);
  const laneColor = (i) => ['#3d81c4', '#4aa88c', '#b4854a', '#9a6bbf', '#c46a6a', '#6a94c4'][i % 6];
</script>

<div class="split-editor" data-testid="host-split-editor">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <svg bind:this={svgEl} viewBox={`0 0 128 ${KEYS_H + parts.length * LANE_H}`}
       preserveAspectRatio="none" role="application"
       aria-label="Key ranges — drag a bar's edges to set a part's split"
       style={`height: ${KEYS_H + parts.length * LANE_H + 8}px`}
       onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={endDrag}
       onpointerleave={endDrag}>
    {#each Array.from({ length: 128 }, (_, k) => k) as k}
      <rect x={k} y="0" width="1" height={KEYS_H}
            class:black={BLACK.has(k % 12)} class="key" />
      {#if k % 12 === 0}
        <text x={k + 0.3} y={KEYS_H - 3} class="octave">{noteName(k)}</text>
      {/if}
    {/each}

    {#each parts as part, i (part.partId)}
      {@const y = KEYS_H + i * LANE_H}
      {@const low = part.keyLow}
      {@const width = part.keyHigh - part.keyLow + 1}
      <rect x="0" y={y} width="128" height={LANE_H} class="lane-bg" />
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <g class="zone" class:focused={part.partId === focusedPartId} data-testid={`split-zone-${i}`}>
        <rect x={low} y={y + 3} width={width} height={LANE_H - 6} rx="1"
              fill={laneColor(i)} class="zone-body"
              onpointerdown={(e) => beginDrag(e, part, 'move')} />
        <rect x={low} y={y + 3} width={Math.min(1.6, width / 2)} height={LANE_H - 6}
              class="zone-edge" data-testid={`split-low-${i}`}
              onpointerdown={(e) => beginDrag(e, part, 'low')} />
        <rect x={low + width - Math.min(1.6, width / 2)} y={y + 3}
              width={Math.min(1.6, width / 2)} height={LANE_H - 6}
              class="zone-edge" data-testid={`split-high-${i}`}
              onpointerdown={(e) => beginDrag(e, part, 'high')} />
        <text x={Math.min(low + 0.8, 116)} y={y + LANE_H / 2 + 2.4} class="zone-label">
          {(part.pluginName || 'empty').slice(0, 14)} · {noteName(part.keyLow)}–{noteName(part.keyHigh)}
        </text>
      </g>
    {/each}
  </svg>
</div>

<style>
  .split-editor { background: #10161c; border: 1px solid #232c36; border-radius: 6px; padding: 6px; }
  svg { display: block; width: 100%; }
  .key { fill: #e8eaec; stroke: #b9bec4; stroke-width: 0.06; }
  .key.black { fill: #2a3138; }
  .octave { font-size: 3.2px; fill: #6a7480; pointer-events: none; }
  .lane-bg { fill: #161e27; stroke: #232c36; stroke-width: 0.08; }
  .zone-body { opacity: 0.82; cursor: grab; }
  .zone.focused .zone-body { opacity: 1; stroke: #fff; stroke-width: 0.18; }
  .zone-edge { fill: #ffffff; opacity: 0.35; cursor: col-resize; }
  .zone-edge:hover { opacity: 0.7; }
  .zone-label { font-size: 3.4px; fill: #0d1116; font-weight: 600; pointer-events: none; }
</style>
