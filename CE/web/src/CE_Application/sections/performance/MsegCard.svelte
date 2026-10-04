<script>
  /**
   * One MSEG: a repeating curve you draw. Double-click adds a point, drag moves it, right-click
   * or Delete removes it, and the small diamond halfway along each segment bends that segment
   * (drag it up or down). The curve is the whole editor: there are no sliders repeating what the
   * points already say, only a readout of the one you picked.
   */
  import { setMseg, resetMseg, removeMseg } from '../../stores/instrumentHost.js';
  import HostConfirmButton from '../HostConfirmButton.svelte';
  import ScrubValue from '../../components/controls/ScrubValue.svelte';
  import ModulatorCard from './ModulatorCard.svelte';
  import RateControl from './RateControl.svelte';

  let { mseg, onroute = () => {} } = $props();

  let dragging = $state(null);          // { pointId, points } while a point or a bend is dragged
  let selectedPointId = $state('');
  const points = $derived(dragging?.points ?? mseg.points);
  const selectedIndex = $derived(Math.max(0, points.findIndex((p) => p.pointId === selectedPointId)));
  const selected = $derived(points[selectedIndex]);
  const set = (fields) => setMseg(mseg.msegId, fields);
  const X = (position) => position * 100;
  const Y = (value) => (1 - value) * 60;
  const shaped = (progress, curve) => progress ** (4 ** curve);

  function path(list) {
    if (list.length === 0) return '';
    const out = [`M ${X(list[0].position)} ${Y(list[0].value)}`];
    for (let i = 1; i < list.length; i += 1) {
      const left = list[i - 1], right = list[i];
      const span = right.position - left.position;
      if (span <= 0.000001) { out.push(`L ${X(right.position)} ${Y(right.value)}`); continue; }
      for (let s = 1; s <= 12; s += 1) {
        const p = s / 12;
        out.push(`L ${X(left.position + span * p)} ${Y(left.value + (right.value - left.value) * shaped(p, right.curve))}`);
      }
    }
    return out.join(' ');
  }
  // Where each segment's bend handle sits: halfway along, on the curve.
  const bends = $derived(points.slice(1).map((right, i) => {
    const left = points[i];
    return { pointId: right.pointId, index: i + 1, x: X((left.position + right.position) / 2),
             y: Y(left.value + (right.value - left.value) * shaped(0.5, right.curve)),
             flat: Math.abs(right.value - left.value) < 0.02 || right.position - left.position < 0.02 };
  }));

  function coordinates(svg, event) {
    const rect = svg.getBoundingClientRect();
    return {
      position: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      value: Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height)),
    };
  }
  function addPoint(event) {
    if (mseg.points.length >= 64) return;
    const { position, value } = coordinates(event.currentTarget, event);
    const point = { pointId: `mseg-point-${Date.now()}-${mseg.points.length + 1}`,
                    position: Math.max(0.001, Math.min(0.999, position)), value, curve: 0 };
    selectedPointId = point.pointId;
    set({ points: [...mseg.points, point].sort((a, b) => a.position - b.position) });
  }
  function beginPoint(point, event) {
    event.preventDefault();
    event.stopPropagation();
    selectedPointId = point.pointId;
    dragging = { kind: 'point', pointId: point.pointId, points: mseg.points.map((p) => ({ ...p })) };
    event.currentTarget.ownerSVGElement?.setPointerCapture?.(event.pointerId);
  }
  function beginBend(bend, event) {
    event.preventDefault();
    event.stopPropagation();
    const right = mseg.points[bend.index], left = mseg.points[bend.index - 1];
    // Up should pull the curve up: for a rising segment that is a smaller exponent, for a
    // falling one a larger.
    dragging = { kind: 'bend', pointId: right.pointId, startY: event.clientY, startCurve: right.curve,
                 sign: right.value >= left.value ? 1 : -1, points: mseg.points.map((p) => ({ ...p })) };
    event.currentTarget.ownerSVGElement?.setPointerCapture?.(event.pointerId);
  }
  function move(event) {
    if (!dragging) return;
    if (dragging.kind === 'bend') {
      const curve = Math.round(Math.max(-1, Math.min(1,
        dragging.startCurve + dragging.sign * (event.clientY - dragging.startY) / 60)) * 100) / 100;
      dragging = { ...dragging, points: dragging.points.map((p) => (p.pointId === dragging.pointId ? { ...p, curve } : p)) };
      return;
    }
    const { position, value } = coordinates(event.currentTarget, event);
    const next = dragging.points.map((point, index, all) => {
      if (point.pointId !== dragging.pointId) return point;
      const endpoint = index === 0 || index === all.length - 1;
      return { ...point, position: endpoint ? point.position : position, value };
    }).sort((a, b) => a.position - b.position);
    next[0].position = 0;
    next[next.length - 1].position = 1;
    dragging = { ...dragging, points: next };
  }
  function end(event) {
    if (!dragging) return;
    set({ points: dragging.points });
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragging = null;
  }
  function removePoint(point, event) {
    event?.preventDefault();
    event?.stopPropagation();
    const index = mseg.points.findIndex((p) => p.pointId === point.pointId);
    if (mseg.points.length <= 2 || index <= 0 || index === mseg.points.length - 1) return;
    const next = mseg.points.filter((p) => p.pointId !== point.pointId);
    if (selectedPointId === point.pointId) selectedPointId = next[index - 1].pointId;
    set({ points: next });
  }
  function pointKey(point, index, event) {
    const step = event.shiftKey ? 0.01 : 0.05;
    if (['Delete', 'Backspace'].includes(event.key)) { removePoint(point, event); return; }
    const inner = index > 0 && index < mseg.points.length - 1;
    const change = event.key === 'ArrowUp' ? { value: Math.min(1, point.value + step) }
      : event.key === 'ArrowDown' ? { value: Math.max(0, point.value - step) }
      : event.key === 'ArrowLeft' && inner ? { position: Math.max(0, point.position - step) }
      : event.key === 'ArrowRight' && inner ? { position: Math.min(1, point.position + step) }
      : null;
    if (!change) return;
    event.preventDefault();
    selectedPointId = point.pointId;
    set({ points: mseg.points.map((p) => (p.pointId === point.pointId ? { ...p, ...change } : p))
                            .sort((a, b) => a.position - b.position) });
  }
  function preset(values) {
    const next = values.map(([position, value, curve = 0], index) => ({
      pointId: `mseg-point-${Date.now()}-${index + 1}`, position, value, curve,
    }));
    selectedPointId = next[0].pointId;
    set({ points: next });
  }
</script>

<ModulatorCard name={mseg.name} enabled={mseg.enabled} kind="MSEG" identity={JSON.stringify([mseg.msegId])}
               readout={`phase ${Math.round(mseg.phase * 100)}% · ${Math.round(mseg.value * 100)}%`} testid="mseg-card"
               onenable={(on) => set({ enabled: on })} onrename={(name) => set({ name })}
               onrestart={() => resetMseg(mseg.msegId)} onremove={() => removeMseg(mseg.msegId)}>
  <div class="editor">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <svg viewBox="0 0 100 60" preserveAspectRatio="none" role="application" data-testid="mseg-editor"
         aria-label={`${mseg.name} curve editor. Double-click to add, drag points, right-click to remove.`}
         ondblclick={addPoint} onpointermove={move} onpointerup={end} onpointercancel={end}>
      <g class="grid" aria-hidden="true">
        {#each [25, 50, 75] as x (x)}<line x1={x} y1="0" x2={x} y2="60"></line>{/each}
        {#each [15, 30, 45] as y (y)}<line x1="0" y1={y} x2="100" y2={y}></line>{/each}
      </g>
      <path class="curve" d={path(points)}></path>
      <line class="playhead" x1={mseg.phase * 100} y1="0" x2={mseg.phase * 100} y2="60"></line>
      <rect class="live" x={mseg.phase * 100 - 0.7} y={(1 - mseg.value) * 60 - 2.5} width="1.4" height="5"></rect>
      {#each bends as bend (bend.pointId)}
        {#if !bend.flat}
          <rect class="bend" x={bend.x - 0.7} y={bend.y - 2} width="1.4" height="4" data-testid="mseg-bend"
                role="slider" tabindex="-1" aria-label={`Bend segment ${bend.index}: drag up or down`}
                aria-valuenow={points[bend.index].curve}
                onpointerdown={(e) => beginBend(bend, e)} ondblclick={(e) => e.stopPropagation()}>
            <title>Bend {points[bend.index].curve > 0 ? '+' : ''}{points[bend.index].curve.toFixed(2)}: drag up or down</title></rect>
        {/if}
      {/each}
      {#each points as point, index (point.pointId)}
        <rect class="point" class:selected={selected?.pointId === point.pointId}
              x={point.position * 100 - 0.85} y={(1 - point.value) * 60 - 3} width="1.7" height="6"
              role="button" tabindex="0" data-testid="mseg-point"
              aria-label={`Point ${index + 1}, position ${Math.round(point.position * 100)} percent, value ${Math.round(point.value * 100)} percent`}
              onpointerdown={(e) => beginPoint(point, e)} ondblclick={(e) => e.stopPropagation()}
              onkeydown={(e) => pointKey(point, index, e)} oncontextmenu={(e) => removePoint(point, e)}>
          <title>{Math.round(point.position * 100)}% · {Math.round(point.value * 100)}%</title>
        </rect>
      {/each}
    </svg>
    <div class="axis" aria-hidden="true"><span>0</span><span>1/4</span><span>1/2</span><span>3/4</span><span>1 cycle</span></div>
  </div>

  <div class="picked" data-testid="mseg-picked">
    {#if selected}
      <strong>Point {selectedIndex + 1}</strong>
      <span>at {Math.round(selected.position * 100)}%</span>
      <span>value {Math.round(selected.value * 100)}%</span>
      {#if selectedIndex > 0}<span>bend {selected.curve > 0 ? '+' : ''}{selected.curve.toFixed(2)}</span>{/if}
      <HostConfirmButton identity={selected.pointId} title="Remove point"
                         disabled={points.length <= 2 || selectedIndex === 0 || selectedIndex === points.length - 1}
                         onclick={(e) => removePoint(selected, e)}>Remove point</HostConfirmButton>
    {/if}
    <span class="count">{points.length} / 64 points</span>
  </div>

  <div class="controls">
    <RateControl sync={mseg.sync} rateHz={mseg.rateHz} syncBeats={mseg.syncBeats} label="Cycle" testid="mseg-rate" onchange={set} />
    <div class="field"><span class="lbl">Phase</span>
      <ScrubValue value={Math.round(mseg.phaseOffset * 360)} min={0} max={355} step={5} fineStep={1} unit="°"
                  label="Phase offset" testid="mseg-phase" onchange={(deg) => set({ phaseOffset: deg / 360 })} /></div>
    <div class="field"><span class="lbl">Start from</span>
      <div class="presets">
        <button type="button" class="ghost" onclick={() => preset([[0, 0], [1, 1]])}>Ramp</button>
        <button type="button" class="ghost" onclick={() => preset([[0, 0], [0.1, 1, -0.35], [0.45, 0.18, 0.2], [1, 0]])}>Pluck</button>
        <button type="button" class="ghost" onclick={() => preset([[0, 0], [0.24, 0], [0.25, 1], [0.74, 1], [0.75, 0], [1, 0]])}>Pulse</button>
      </div></div>
    <span class="spacer"></span>
    <button type="button" class="route" onclick={onroute}>Route in matrix →</button>
  </div>
</ModulatorCard>

<style>
  .editor svg { display: block; width: 100%; height: 150px; background: #101417; border: 1px solid #2d343a; border-radius: 4px;
                touch-action: none; user-select: none; }
  .grid line { stroke: #252c32; stroke-width: 1; vector-effect: non-scaling-stroke; }
  .curve { fill: none; stroke: #e39a55; stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  .playhead { stroke: #f2c28e; stroke-width: 1; opacity: .45; vector-effect: non-scaling-stroke; }
  .live { fill: #ffd8b0; }
  .point { fill: #181c20; stroke: #efad70; stroke-width: 1.5; vector-effect: non-scaling-stroke; cursor: grab; }
  .point:hover, .point.selected { fill: #e28a3d; stroke: #ffe0c1; }
  .point:focus-visible { outline: none; fill: #e28a3d; }
  .bend { fill: #8f5a35; cursor: ns-resize; }
  .bend:hover { fill: #efad70; }
  .axis { display: grid; grid-template-columns: repeat(5, 1fr); font: 10px var(--host-font-mono, monospace); color: #68737d; margin-top: 2px; }
  .axis span:nth-child(2), .axis span:nth-child(3), .axis span:nth-child(4) { text-align: center; }
  .axis span:last-child { text-align: right; }
  .picked { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font: 11px var(--host-font-mono, monospace); color: #aab4bd; }
  .picked strong { color: #e0a36b; font-family: var(--host-font, sans-serif); }
  .count { margin-left: auto; color: #77838d; }
  .controls { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .lbl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: #8d969e; }
  .presets { display: flex; gap: 4px; }
  .spacer { flex: 1; }
  .route { border-color: #9b5e31; color: #f0b47d; white-space: nowrap; }
</style>
