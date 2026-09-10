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
    width = 92,
    height = 64,
    active = false,
    label = '',
  } = $props();

  const PAD = 6;

  let path = $derived.by(() => {
    const points = easingPoints(name, 32);
    const w = width - PAD * 2;
    const h = height - PAD * 2;
    return points
      .map((point, index) => {
        const x = PAD + point.x * w;
        // y is upside down on screen: 1 is the top.
        const y = PAD + (1 - point.y) * h;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  });
</script>

<svg class="curve" class:on={active} {width} {height} viewBox="0 0 {width} {height}" role="img"
     aria-label={label || `${name} easing curve`}>
  <!-- A straight line for comparison, so you can see how far the curve leans off it. -->
  <line x1={PAD} y1={height - PAD} x2={width - PAD} y2={PAD} stroke="#2E3540" stroke-width="1" stroke-dasharray="2 3" />
  <path d={path} fill="none" stroke={active ? '#8FEDE3' : '#5B9BD5'} stroke-width="1.75" stroke-linecap="round" />
  <circle cx={PAD} cy={height - PAD} r="2" fill="#4B545C" />
  <circle cx={width - PAD} cy={PAD} r="2" fill={active ? '#8FEDE3' : '#5B9BD5'} />
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
