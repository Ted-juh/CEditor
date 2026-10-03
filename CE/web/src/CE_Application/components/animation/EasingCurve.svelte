<script>
  /**
   * The easing curve, drawn.
   *
   * The properties panel offers four easing names in a dropdown and shows no picture of any of
   * them. These are the same curves the runtime hands to CSS, so what you see is what you get.
   *
   * `easing` is a name or a whole Animation node — the node is how a custom bezier or a spring draws
   * its own shape. The box leaves a margin above and below, because the "back" curves and a spring
   * overshoot, and a curve clipped at the edge would look like one that does not.
   */
  import { easingPoints } from '../../utils/animationModel.js';

  let {
    name = 'outQuad',
    easing = null,
    width = 92,
    height = 64,
    active = false,
    label = '',
  } = $props();

  const PAD = 6;
  // Room for overshoot: y from -0.25 to 1.25 fills the box, 0 and 1 sit inside it.
  const Y_LO = -0.25;
  const Y_HI = 1.25;

  let shape = $derived(easing ?? name);
  let title = $derived(typeof shape === 'string' ? shape : String(shape?.easing ?? name));
  const yOf = (value, h) => PAD + ((Y_HI - value) / (Y_HI - Y_LO)) * h;

  let path = $derived.by(() => {
    const points = easingPoints(shape, 48);
    const w = width - PAD * 2;
    const h = height - PAD * 2;
    return points
      .map((point, index) => {
        const x = PAD + point.x * w;
        const y = yOf(Math.min(Y_HI, Math.max(Y_LO, point.y)), h);
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  });
  let y0 = $derived(yOf(0, height - PAD * 2));
  let y1 = $derived(yOf(1, height - PAD * 2));
</script>

<svg class="curve" class:on={active} {width} {height} viewBox="0 0 {width} {height}" role="img"
     aria-label={label || `${title} easing curve`}>
  <!-- A straight line for comparison, so you can see how far the curve leans off it. -->
  <line x1={PAD} y1={y0} x2={width - PAD} y2={y1} stroke="#2E3540" stroke-width="1" stroke-dasharray="2 3" />
  <path d={path} fill="none" stroke={active ? '#8FEDE3' : '#5B9BD5'} stroke-width="1.75" stroke-linecap="round" />
  <circle cx={PAD} cy={y0} r="2" fill="#4B545C" />
  <circle cx={width - PAD} cy={y1} r="2" fill={active ? '#8FEDE3' : '#5B9BD5'} />
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
