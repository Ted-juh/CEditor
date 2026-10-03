<script>
  /**
   * A response curve you drag. Across is what the keyboard sends, up is what the instrument
   * gets. The shaded column is the part of the keyboard's range that is used (drag its edges on
   * the bottom axis); the shaded row is where that lands on the instrument (drag its edges on
   * the left axis). The nine points shape the curve; dragging one on a named curve turns it
   * into a custom curve starting from that shape. Every note you play shows as a dot on the
   * curve, fading after a couple of seconds.
   *
   * The arithmetic is responseCurve.js, the browser copy of MidiFxChain::shape7Bit.
   */
  import { applyResponseCurve7, responseCurveDisplayPoints } from '../../utils/responseCurve.js';

  let {
    curve = 'linear', points = [], inputMin = 0, inputMax = 127, outputMin = 0, outputMax = 127,
    floor = 0, dots = [], now = 0, label = 'Response', testid = undefined,
    onchange = () => {},
  } = $props();

  const W = 520, H = 290, L = 50, R = 14, T = 14, B = 44;
  const IW = W - L - R, IH = H - T - B;
  const X = (v) => L + (v / 127) * IW;
  const Y = (v) => T + IH - (v / 127) * IH;

  // A drag edits a draft; the module only hears about it when the pointer lets go.
  let draft = $state(null);
  const shape = $derived({
    curve: draft?.curve ?? curve,
    points: draft?.points ?? responseCurveDisplayPoints(curve, points),
    inputMin: draft?.inputMin ?? inputMin, inputMax: draft?.inputMax ?? inputMax,
    outputMin: draft?.outputMin ?? outputMin, outputMax: draft?.outputMax ?? outputMax,
  });
  const out = (v) => applyResponseCurve7(v, { ...shape, noteVelocity: floor === 1 });
  const path = $derived(Array.from({ length: 128 }, (_, v) => `${v ? 'L' : 'M'}${X(v)},${Y(out(v))}`).join(''));
  const handles = $derived(shape.points.map((p, i) => ({
    i, x: X(shape.inputMin + (i / 8) * (shape.inputMax - shape.inputMin)),
    y: Y(shape.outputMin + (p / 127) * (shape.outputMax - shape.outputMin)),
  })));
  const live = $derived(dots.filter((d) => now - d.at < 2500));

  function local(event, svg) {
    const m = svg.getScreenCTM()?.inverse();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  }
  const toValue = (px, from, span) => Math.max(0, Math.min(127, Math.round(((px - from) / span) * 127)));

  function begin(event, apply) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    const svg = target.ownerSVGElement ?? target;
    target.setPointerCapture?.(event.pointerId);
    draft = { ...shape, points: [...shape.points] };
    const move = (e) => apply(local(e, svg));
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      const d = draft;
      draft = null;
      if (d) onchange({ curve: d.curve, points: d.points, inputMin: d.inputMin, inputMax: d.inputMax,
                        outputMin: d.outputMin, outputMax: d.outputMax });
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    move(event);
  }
  const dragPoint = (e, i) => begin(e, ({ y }) => {
    const span = Math.max(1, draft.outputMax - draft.outputMin);
    const value = Math.round(((Y(0) - y) / IH * 127 - draft.outputMin) / span * 127);
    draft.points[i] = Math.max(0, Math.min(127, value));
    draft.curve = 'custom';
  });
  const dragInput = (e, key) => begin(e, ({ x }) => {
    const v = Math.max(floor, toValue(x, L, IW));
    draft[key] = key === 'inputMin' ? Math.min(v, draft.inputMax - 4) : Math.max(v, draft.inputMin + 4);
  });
  const dragOutput = (e, key) => begin(e, ({ y }) => {
    const v = Math.max(floor, 127 - toValue(y, T, IH));
    draft[key] = key === 'outputMin' ? Math.min(v, draft.outputMax - 4) : Math.max(v, draft.outputMin + 4);
  });
  const ticks = [0, 32, 64, 96, 127];
</script>

<svg class="curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: played across, sent up`} data-testid={testid}>
  {#each ticks as t (t)}
    <line x1={X(t)} x2={X(t)} y1={T} y2={T + IH} class="grid" />
    <line x1={L} x2={L + IW} y1={Y(t)} y2={Y(t)} class="grid" />
    <text x={X(t)} y={T + IH + 27} class="tick" text-anchor="middle">{t}</text>
    <text x={L - 19} y={Y(t) + 3} class="tick" text-anchor="end">{t}</text>
  {/each}
  <rect class="band-in" x={X(shape.inputMin)} y={T} width={X(shape.inputMax) - X(shape.inputMin)} height={IH} />
  <rect class="band-out" x={L} y={Y(shape.outputMax)} width={IW} height={Y(shape.outputMin) - Y(shape.outputMax)} />
  <path d={path} class="line" />

  {#each live as d (d.id)}
    {@const fade = 1 - (now - d.at) / 2500}
    <g class="dot" style:opacity={fade}>
      <line x1={X(d.v)} x2={X(d.v)} y1={Y(0)} y2={Y(out(d.v))} />
      <line x1={X(d.v)} x2={L} y1={Y(out(d.v))} y2={Y(out(d.v))} stroke-dasharray="3 3" />
      <circle cx={X(d.v)} cy={Y(out(d.v))} r="5" />
    </g>
  {/each}

  {#each handles as h (h.i)}
    <circle class="point" class:named={shape.curve !== 'custom'} cx={h.x} cy={h.y} r="6" data-point={h.i}
            role="slider" tabindex="-1" aria-label={`${label} point ${h.i + 1}`} aria-valuenow={shape.points[h.i]}
            onpointerdown={(e) => dragPoint(e, h.i)}>
      <title>Drag up or down{shape.curve !== 'custom' ? ' (makes the curve custom)' : ''}</title>
    </circle>
  {/each}

  {#each [['inputMin', shape.inputMin], ['inputMax', shape.inputMax]] as [key, v] (key)}
    <rect class="grip in" x={X(v) - 5} y={T + IH + 3} width="10" height="12" rx="2" data-grip={key}
          role="slider" tabindex="-1" aria-label={key === 'inputMin' ? 'Softest used' : 'Hardest used'} aria-valuenow={v}
          onpointerdown={(e) => dragInput(e, key)}><title>Drag sideways: the keyboard range used</title></rect>
  {/each}
  {#each [['outputMin', shape.outputMin], ['outputMax', shape.outputMax]] as [key, v] (key)}
    <rect class="grip out" x={L - 15} y={Y(v) - 5} width="12" height="10" rx="2" data-grip={key}
          role="slider" tabindex="-1" aria-label={key === 'outputMin' ? 'Softest sent' : 'Hardest sent'} aria-valuenow={v}
          onpointerdown={(e) => dragOutput(e, key)}><title>Drag up or down: the range the instrument gets</title></rect>
  {/each}

  {#if draft}
    <text x={W - R} y={T + 12} class="readout" text-anchor="end">
      in {shape.inputMin}–{shape.inputMax} · out {shape.outputMin}–{shape.outputMax}</text>
  {/if}
  <text x={L + IW} y={H - 4} class="axis" text-anchor="end">played →</text>
  <text x={4} y={T + 2} class="axis">↑ sent</text>
</svg>

<style>
  .curve { width: 100%; max-width: 620px; display: block; touch-action: none; user-select: none;
           background: var(--host-field, #12171b); border: 1px solid var(--host-line-soft, #2c353e); border-radius: 5px; }
  .grid { stroke: var(--host-line-soft, #2c353e); stroke-width: 1; }
  .tick, .axis { font: 9px var(--host-font-mono, monospace); fill: var(--host-text-faint, #65717c); }
  .axis { font-size: 10px; fill: var(--host-text-dim, #7f8b96); }
  .band-in { fill: var(--host-accent, #5b9bd5); opacity: .08; }
  .band-out { fill: #d7a44e; opacity: .07; }
  .line { fill: none; stroke: var(--host-accent-strong, #79b9ee); stroke-width: 2.5; }
  .point { fill: var(--host-bg-deep, #101418); stroke: var(--host-accent-strong, #79b9ee); stroke-width: 2; cursor: ns-resize; }
  .point.named { stroke: var(--host-text-dim, #7f8b96); }
  .grip { cursor: ew-resize; }
  .grip.in { fill: var(--host-accent, #5b9bd5); }
  .grip.out { fill: #d7a44e; cursor: ns-resize; }
  .dot line { stroke: #ff9408; stroke-width: 1; }
  .dot circle { fill: #ff9408; }
  .readout { font: 600 11px var(--host-font-mono, monospace); fill: var(--host-text, #d9e0e6); }
</style>
