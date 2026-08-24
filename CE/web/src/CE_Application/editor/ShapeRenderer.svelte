<script>
  // Shape — a vector primitive, drawn as a real path.
  //
  // The reason this exists rather than a Background with a corner radius: a Background can be a
  // rectangle and, past half its width, a stadium. It cannot be an ellipse at an arbitrary aspect
  // ratio, a line at an angle, or a polygon. Those need a path.
  //
  // Everything is drawn into the control's own box and scales with it, so resizing the control is
  // how you draw the shape. A line runs corner to corner for the same reason — dragging the box is
  // the gesture, and an angle field on top would be a second way to say the same thing.
  import {
    shapeConfig, shapeNeedsRoundCap, shapePath, shapeStrokeDash, shapeTakesFill,
  } from '../utils/shapePrimitives.js';

  let { control = null, width = 0, height = 0 } = $props();

  function css(hex, fallback = 'none') {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      const a = parseInt(s.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) {
      return `rgba(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},1)`;
    }
    return fallback;
  }

  let cfg = $derived(shapeConfig(control));
  let w = $derived(Math.max(1, width));
  let h = $derived(Math.max(1, height));
  let path = $derived(shapePath(cfg, w, h));
  let dash = $derived(shapeStrokeDash(cfg));
  let fill = $derived(shapeTakesFill(cfg) ? css(cfg.fillColour, 'none') : 'none');
  let stroke = $derived(cfg.strokeEnabled !== false ? css(cfg.strokeColour, 'none') : 'none');
  // Rotation about the centre, so a rotated shape stays where it was drawn.
  let transform = $derived(Number(cfg.rotation) ? `rotate(${Number(cfg.rotation)} ${w / 2} ${h / 2})` : null);
</script>

<svg class="shape" viewBox={`0 0 ${w} ${h}`} width={width} height={height} aria-hidden="true">
  <path
    d={path}
    fill={fill}
    stroke={stroke}
    stroke-width={cfg.strokeEnabled !== false ? Math.max(0, Number(cfg.strokeWidth) || 0) : 0}
    stroke-linecap={shapeNeedsRoundCap(cfg) ? 'round' : (cfg.lineCap ?? 'butt')}
    stroke-linejoin="round"
    stroke-dasharray={dash}
    transform={transform}
  />
</svg>

<style>
  /* overflow visible so a thick stroke on the box edge is not clipped in half. */
  .shape { display: block; overflow: visible; }
</style>
