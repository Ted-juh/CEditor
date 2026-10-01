<script>
  /**
   * The easing curve, drawn.
   *
   * The properties panel offers four easing names in a dropdown and shows no picture of any of
   * them. These are the same curves the runtime hands to CSS, so what you see is what you get.
   */
  import { easingPoints } from '../../utils/animationModel.js';

  let {
    name = 'outQuad',
    // Given, the curve is these points rather than a named easing — a spring, which goes above 1
    // and comes back. The picture then scales so the overshoot fits, and the dashed line is the
    // target rather than the straight path.
    points = null,
    width = 92,
    height = 64,
    active = false,
    label = '',
  } = $props();

  const PAD = 6;

  let curve = $derived(points ?? easingPoints(name, 32));
  let lo = $derived(Math.min(0, ...curve.map((p) => p.y)));
  let hi = $derived(Math.max(1, ...curve.map((p) => p.y)));
  let yOf = $derived((y) => PAD + (1 - (y - lo) / (hi - lo)) * (height - PAD * 2));

  let path = $derived.by(() => {
    const w = width - PAD * 2;
    return curve
      .map((point, index) => {
        const x = PAD + point.x * w;
        // y is upside down on screen: 1 is the top.
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${yOf(point.y).toFixed(2)}`;
      })
      .join(' ');
  });
</script>

<svg class="curve" class:on={active} {width} {height} viewBox="0 0 {width} {height}" role="img"
     aria-label={label || `${name} easing curve`}>
  {#if points}
    <!-- The target, which a spring crosses and comes back to. -->
    <line x1={PAD} y1={yOf(1)} x2={width - PAD} y2={yOf(1)} stroke="#2E3540" stroke-width="1" stroke-dasharray="2 3" />
  {:else}
    <!-- A straight line for comparison, so you can see how far the curve leans off it. -->
    <line x1={PAD} y1={height - PAD} x2={width - PAD} y2={PAD} stroke="#2E3540" stroke-width="1" stroke-dasharray="2 3" />
  {/if}
  <path class="trace" d={path} fill="none" stroke={active ? '#8FEDE3' : '#5B9BD5'} stroke-width="1.75" stroke-linecap="round" />
  <circle cx={PAD} cy={yOf(0)} r="2" fill="#4B545C" />
  <circle cx={width - PAD} cy={yOf(1)} r="2" fill={active ? '#8FEDE3' : '#5B9BD5'} />
</svg>

<style>
  .curve {
    display: block;
    border: 1px solid #2A3038;
    border-radius: 3px;
    background: #0C0F12;
  }
  .curve.on { border-color: #0E7C70; }
</style>
