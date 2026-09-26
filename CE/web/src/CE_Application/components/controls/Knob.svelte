<script>
  /**
   * A knob: drag up or down (Shift for fine), arrow keys step it, double-click puts it back
   * (pan to the centre, a send to off). A two-sided knob (min < 0 < max, like pan) draws its arc
   * from the top, so left and right read at a glance.
   */
  let {
    value = 0, min = 0, max = 1, reset = 0, step = 0.01, size = 30, label = '',
    format = (v) => v.toFixed(2), onchange = () => {}, testid = undefined,
    oncommit = null,          // (value) once a gesture ends: the release of a drag, a key, a reset
  } = $props();

  const span = $derived(max - min);
  const t = $derived((Math.max(min, Math.min(max, value)) - min) / (span || 1));
  const centred = $derived(min < 0 && max > 0);
  let drag = null;
  let last = null;

  const A0 = -135, A1 = 135;
  const point = (a, r) => [20 + r * Math.sin((a * Math.PI) / 180), 20 - r * Math.cos((a * Math.PI) / 180)];
  const arc = (from, to, r = 15) => {
    if (Math.abs(to - from) < 0.5) return '';
    const [a, b] = from < to ? [from, to] : [to, from];
    const [x0, y0] = point(a, r), [x1, y1] = point(b, r);
    return `M${x0},${y0} A${r},${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x1},${y1}`;
  };
  const angle = $derived(A0 + (A1 - A0) * t);
  const zeroAngle = $derived(centred ? A0 + (A1 - A0) * ((0 - min) / span) : A0);
  const tip = $derived(point(angle, 9));

  const set = (v) => {
    const snapped = Math.max(min, Math.min(max, Math.round(v / step) * step));
    last = Number(snapped.toFixed(6));
    if (snapped !== value) onchange(last);
  };
  function down(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, v: value };
    last = null;
  }
  function move(e) {
    if (!drag) return;
    const pixels = e.shiftKey ? 600 : 150;
    set(drag.v + ((drag.y - e.clientY) / pixels) * span);
  }
  function up() {
    if (drag && last !== null) oncommit?.(last);
    drag = null;
  }
  function key(e) {
    const s = e.shiftKey ? step : Math.max(step, span / 50);
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { set(value + s); oncommit?.(last); e.preventDefault(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { set(value - s); oncommit?.(last); e.preventDefault(); }
  }
</script>

<svg class="knob" width={size} height={size} viewBox="0 0 40 40" role="slider" tabindex="0" aria-label={label}
     aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={format(value)}
     data-testid={testid} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
     ondblclick={() => { set(reset); oncommit?.(last); }} onkeydown={key}>
  <title>{label}: {format(value)} · drag up or down, double-click to reset</title>
  <path d={arc(A0, A1)} class="track" />
  <path d={arc(zeroAngle, angle)} class="value" class:centred />
  <circle cx="20" cy="20" r="10" class="cap" />
  <line x1="20" y1="20" x2={tip[0]} y2={tip[1]} class="pointer" />
</svg>

<style>
  .knob { display: block; cursor: ns-resize; touch-action: none; flex: none; }
  .knob:focus-visible { outline: 2px solid var(--host-accent-strong, #79b9ee); outline-offset: 2px; border-radius: 50%; }
  .track { fill: none; stroke: var(--host-line, #3b4652); stroke-width: 4; stroke-linecap: round; }
  .value { fill: none; stroke: var(--host-accent, #5b9bd5); stroke-width: 4; stroke-linecap: round; }
  .value.centred { stroke: #d7a44e; }
  .cap { fill: var(--host-field, #12171b); stroke: var(--host-line-strong, #526170); }
  .pointer { stroke: var(--host-text, #d9e0e6); stroke-width: 2.4; stroke-linecap: round; }
</style>
