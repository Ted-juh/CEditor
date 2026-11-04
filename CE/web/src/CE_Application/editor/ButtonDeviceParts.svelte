<script>
  /**
   * A button's or a switch's device drawn with its own parts (models/buttonDeviceParts.js), in the
   * form frame's top 160 by 80 units: ControlAnatomy places and scales that frame and sets the
   * caption beside or under it, as it does for a form. Each part is a shape in a box
   * (utils/deviceShapes.js) with its fill, a gradient laid over it, a border, and a finish; pressed
   * or on, it moves, turns and changes colour as the part says.
   */
  import SliderShapeFill from './SliderShapeFill.svelte';
  import { BUTTON_DEVICE_PARTS, DEVICE_FRAME } from '../models/buttonDeviceParts.js';
  import { deviceShapePath, devicePatternCells } from '../utils/deviceShapes.js';
  import { materialActive } from '../utils/materialFilter.js';
  import { numberOr } from '../utils/primitives.js';
  import { renderedDevicePartSpec, renderedFrame, renderedLooks, requestRenderedLook } from '../utils/renderedLook.js';
  import { activeControlSet } from '../stores/controlSets.js';

  let { parts = {}, active = false, uid = 'device' } = $props();

  const W = DEVICE_FRAME.width;
  const H = DEVICE_FRAME.height;

  function css(value, fallback = 'transparent') {
    const raw = String(value ?? '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{8}$/i.test(raw)) {
      const a = parseInt(raw.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(raw.slice(2, 4), 16)}, ${parseInt(raw.slice(4, 6), 16)}, ${parseInt(raw.slice(6, 8), 16)}, ${a.toFixed(3)})`;
    }
    if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
    return fallback;
  }

  function boxOf(part) {
    const layout = part?._children?.Layout ?? {};
    return {
      x: (numberOr(layout.x, 0) / 100) * W,
      y: (numberOr(layout.y, 0) / 100) * H,
      w: Math.max(0, (numberOr(layout.width, 0) / 100) * W),
      h: Math.max(0, (numberOr(layout.height, 0) / 100) * H),
    };
  }

  // Where it turns: its pivot, a percentage of its own box.
  function pivotOf(part, box) {
    return { x: box.x + (numberOr(part?.pivotX, 50) / 100) * box.w, y: box.y + (numberOr(part?.pivotY, 50) / 100) * box.h };
  }

  /** Its motion when pressed or on: a move, and a turn about its pivot. */
  function motionOf(part, box) {
    const pivot = pivotOf(part, box);
    const turn = numberOr(part?._children?.Layout?.rotation, 0) + (active ? numberOr(part?.swing, 0) : 0);
    const dx = active ? (numberOr(part?.travelX, 0) / 100) * W : 0;
    const dy = active ? (numberOr(part?.travelY, 0) / 100) * H : 0;
    return `translate(${+dx.toFixed(2)} ${+dy.toFixed(2)}) rotate(${+turn.toFixed(2)} ${+pivot.x.toFixed(2)} ${+pivot.y.toFixed(2)})`;
  }

  // A part that follows the key rides on it: drawn in the key's frame, it moves and turns as the
  // key does, at rest and pressed or on (the handle on a knife switch's blade), and then as itself.
  function followMotion(part) {
    if (String(part?.follows ?? '') !== 'key' || !parts.key || part === parts.key) return '';
    return motionOf(parts.key, boxOf(parts.key));
  }

  function pathOf(part, box) {
    const radius = numberOr(part?._children?.Background?._children?.Corners?.radius, 0);
    // A cell's share of its pitch too, as a meter's: the fine rules across an edge-lit key.
    return devicePatternCells(String(part?.pattern ?? 'solid'), box.x, box.y, box.w, box.h, { count: part?.patternCount, rows: part?.patternRows, cellWidth: part?.cellWidth, cellHeight: part?.cellHeight })
      .map((cell) => deviceShapePath(part?.shape, cell.x, cell.y, cell.w, cell.h, { depth: part?.shapeDepth, radius }))
      .filter(Boolean)
      .join(' ');
  }

  // A gradient laid over the fill, as SVG: the CSS angle (180 runs top to bottom) and a radial's
  // centre and reach, in the part's own box.
  function gradientOf(fill, box = null) {
    const g = fill?.gradientEnabled === true ? fill?.gradient : null;
    const stops = Array.isArray(g?.stops) ? g.stops : [];
    if (!g || stops.length < 2) return null;
    const list = stops.map((stop) => ({ offset: Math.max(0, Math.min(100, numberOr(stop.position, 0))), colour: css(stop.color, '#000') }));
    if (g.type === 'radial') {
      return { radial: true, cx: numberOr(g.centerX, 50) / 100, cy: numberOr(g.centerY, 50) / 100, r: numberOr(g.radiusX, 70) / 100, stops: list };
    }
    // A linear one runs as CSS runs it, across the box at its angle in the drawing's own units, its
    // ends where the box's far corners meet it: as the Gradient dock shows it and a layer draws it.
    // (In the box's fractions, as it was, an angle that is not straight up, down or across skewed on
    // a box that is not square.)
    const a = (numberOr(g.angle, 180) * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    if (box && box.w > 0 && box.h > 0) {
      const half = (Math.abs(box.w * dx) + Math.abs(box.h * dy)) / 2;
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      return { radial: false, user: true, x1: cx - dx * half, y1: cy - dy * half, x2: cx + dx * half, y2: cy + dy * half, stops: list };
    }
    return { radial: false, x1: 0.5 - dx / 2, y1: 0.5 - dy / 2, x2: 0.5 + dx / 2, y2: 0.5 + dy / 2, stops: list };
  }

  // What a plain path cannot paint: a finish, an image. Those go through the full fill.
  function needsFullFill(background) {
    const fill = background?._children?.Fill ?? {};
    return materialActive(background?._children?.Effects?._children?.Material)
      || fill.imageEnabled === true || fill.overlayEnabled === true;
  }

  let drawn = $derived(BUTTON_DEVICE_PARTS
    .map((name) => [name, parts?.[name]])
    .filter(([, part]) => part?.visible === true)
    .sort((a, b) => numberOr(a[1].zIndex, 0) - numberOr(b[1].zIndex, 0))
    .map(([name, part]) => {
      const box = boxOf(part);
      const background = part?._children?.Background ?? null;
      const fill = background?._children?.Fill ?? {};
      const border = background?._children?.Border ?? {};
      const lit = active && String(part.activeColour ?? '').trim() !== '';
      return {
        name,
        part,
        box,
        d: name === 'legend' ? '' : pathOf(part, box),
        follow: followMotion(part),
        motion: motionOf(part, box),
        colour: css(lit ? part.activeColour : fill.colour, 'transparent'),
        opacity: active && part.activeOpacity != null ? numberOr(part.activeOpacity, 1) : numberOr(part.opacity, 1),
        stroke: border.enabled === true && numberOr(border.thickness, 0) > 0 ? { colour: css(border.colour, '#000'), width: numberOr(border.thickness, 0) } : null,
        gradient: gradientOf(fill, box),
        gradientOpacity: numberOr(fill.gradientOpacity, 100) / 100,
        full: !lit && needsFullFill(background),
        background,
        shadow: shadowOf(part),
        rendered: renderedPart(name, part, box, lit ? part.activeColour : fill.colour),
      };
    }));

  // A housing, guard, key or indicator whose look is 'rendered' (utils/renderedLook.js): a block its
  // box's size, or a turned body for a circle, as an image centred on its box, lit by the set's lamp;
  // its lit colour is another image. Null while it is made, and the part draws as it always did.
  const RENDERED_PARTS = new Set(['housing', 'guard', 'key', 'indicator']);
  function renderedPart(name, part, box, colour) {
    if (!RENDERED_PARTS.has(name) || String(part?.look ?? '') !== 'rendered') return null;
    const spec = renderedDevicePartSpec(part, { colour, topColour: part?.renderTopColour || null, lamp: $activeControlSet?.lamp });
    if (!spec) return null;
    const big = Math.max(box.w, box.h);
    const frame = renderedFrame(spec);
    const w = frame.w * big;
    const h = frame.h * big;
    // The frame's units are drawn at about two to three pixels each on a panel; enough for both.
    const url = requestRenderedLook($renderedLooks, spec, Math.max(w, h) * 3, 0);
    return url ? { url, x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h } : null;
  }

  // A drop shadow under a part (the sculpted synth set's keys): its outline again, `shadowOffset` %
  // of the frame's height lower, softened by `shadowBlur` %, in `shadowColour`. None unless asked.
  function shadowOf(part) {
    const dy = (numberOr(part?.shadowOffset, 0) / 100) * H;
    const blur = (numberOr(part?.shadowBlur, 0) / 100) * H;
    return dy > 0 || blur > 0 ? { dy, blur, colour: css(part?.shadowColour, 'rgba(0,0,0,0.6)') } : null;
  }
</script>

{#each drawn as item (item.name)}
  <g data-part={item.name} transform={item.follow || undefined}>
    <g transform={item.motion} opacity={item.opacity}>
      {#if item.rendered}
        <image data-rendered-look={item.name} href={item.rendered.url} x={item.rendered.x} y={item.rendered.y} width={item.rendered.w} height={item.rendered.h} preserveAspectRatio="none" />
      {:else if item.name === 'legend'}
        <text x={item.box.x + item.box.w / 2} y={item.box.y + item.box.h / 2} text-anchor="middle" dominant-baseline="central"
          fill={item.colour} font-size={numberOr(item.part.fontSize, 11)} font-family="inherit">{active ? (item.part.onText ?? '') : (item.part.offText ?? '')}</text>
      {:else if item.d}
        {#if item.shadow}
          {#if item.shadow.blur > 0}
            <filter id={`${uid}-${item.name}-s`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={item.shadow.blur / 2} /></filter>
          {/if}
          <path data-part-shadow={item.name} d={item.d} transform={`translate(0 ${item.shadow.dy})`} fill={item.shadow.colour} fill-rule="evenodd" filter={item.shadow.blur > 0 ? `url(#${uid}-${item.name}-s)` : undefined} />
        {/if}
        {#if item.full}
          <SliderShapeFill background={item.background} bounds={{ x: item.box.x, y: item.box.y, width: item.box.w, height: item.box.h }}
            shape={{ kind: 'filled-path', d: item.d }} maskId={`${uid}-${item.name}`} svgWidth={W} svgHeight={H} />
        {:else}
          <path d={item.d} fill={item.colour} fill-rule="evenodd" />
        {/if}
        {#if item.gradient}
          <defs>
            {#if item.gradient.radial}
              <radialGradient id={`${uid}-${item.name}-g`} cx={item.gradient.cx} cy={item.gradient.cy} r={item.gradient.r}>
                {#each item.gradient.stops as stop, i (i)}<stop offset={`${stop.offset}%`} stop-color={stop.colour} />{/each}
              </radialGradient>
            {:else}
              <linearGradient id={`${uid}-${item.name}-g`} gradientUnits={item.gradient.user ? 'userSpaceOnUse' : undefined} x1={item.gradient.x1} y1={item.gradient.y1} x2={item.gradient.x2} y2={item.gradient.y2}>
                {#each item.gradient.stops as stop, i (i)}<stop offset={`${stop.offset}%`} stop-color={stop.colour} />{/each}
              </linearGradient>
            {/if}
          </defs>
          <path d={item.d} fill={`url(#${uid}-${item.name}-g)`} fill-rule="evenodd" opacity={item.gradientOpacity} />
        {/if}
        {#if item.stroke}
          <path d={item.d} fill="none" stroke={item.stroke.colour} stroke-width={item.stroke.width} stroke-linejoin="round" />
        {/if}
      {/if}
    </g>
  </g>
{/each}
