<script>
  /**
   * A meter drawn with its own parts (models/meterDeviceParts.js), in the form frame's 160 by 100
   * units: ControlAnatomy places the frame and sets the readout under it, as it does for a form.
   * What each part draws at the reading comes from utils/meterParts.js; this paints it, each part
   * with its fill, a gradient laid over it, a border and a finish, its lit cells and its zone in
   * the active colour.
   */
  import SliderShapeFill from './SliderShapeFill.svelte';
  import { METER_DEVICE_PARTS, METER_FRAME } from '../models/meterDeviceParts.js';
  import { meterLitOffset, meterPartDrawing } from '../utils/meterParts.js';
  import { materialActive } from '../utils/materialFilter.js';
  import { numberOr } from '../utils/primitives.js';

  let { parts = {}, p = 0, figures = '0', uid = 'meter' } = $props();

  const W = METER_FRAME.width;
  const H = METER_FRAME.height;

  function css(value, fallback = 'transparent') {
    const raw = String(value ?? '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{8}$/i.test(raw)) {
      const a = parseInt(raw.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(raw.slice(2, 4), 16)}, ${parseInt(raw.slice(4, 6), 16)}, ${parseInt(raw.slice(6, 8), 16)}, ${a.toFixed(3)})`;
    }
    if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
    return fallback;
  }

  // A gradient laid over the fill, as SVG: the CSS angle (180 runs top to bottom) and a radial's
  // centre and reach, in the part's own box (as editor/ButtonDeviceParts.svelte).
  function gradientOf(fill) {
    const g = fill?.gradientEnabled === true ? fill?.gradient : null;
    const stops = Array.isArray(g?.stops) ? g.stops : [];
    if (!g || stops.length < 2) return null;
    const list = stops.map((stop) => ({ offset: Math.max(0, Math.min(100, numberOr(stop.position, 0))), colour: css(stop.color, '#000') }));
    if (g.type === 'radial') {
      return { radial: true, cx: numberOr(g.centerX, 50) / 100, cy: numberOr(g.centerY, 50) / 100, r: numberOr(g.radiusX, 70) / 100, stops: list };
    }
    const a = (numberOr(g.angle, 180) * Math.PI) / 180;
    return { radial: false, x1: 0.5 - Math.sin(a) / 2, y1: 0.5 + Math.cos(a) / 2, x2: 0.5 + Math.sin(a) / 2, y2: 0.5 - Math.cos(a) / 2, stops: list };
  }

  let drawn = $derived(METER_DEVICE_PARTS
    .map((name) => [name, parts?.[name]])
    .filter(([, part]) => part?.visible === true)
    .sort((a, b) => numberOr(a[1].zIndex, 0) - numberOr(b[1].zIndex, 0))
    .map(([name, part]) => {
      const background = part?._children?.Background ?? null;
      const fill = background?._children?.Fill ?? {};
      const border = background?._children?.Border ?? {};
      const drawing = meterPartDrawing(name, part, { p, figures });
      const opacity = numberOr(part.opacity, 1);
      const activeColour = String(part.activeColour ?? '').trim();
      return {
        name,
        part,
        drawing,
        base: drawing.paths.filter((path) => path.role === 'base').map((path) => path.d).join(' '),
        lit: drawing.paths.filter((path) => path.role === 'lit').map((path) => path.d).join(' '),
        zone: drawing.paths.filter((path) => path.role === 'zone').map((path) => path.d).join(' '),
        litOffset: meterLitOffset(part),
        colour: css(fill.colour, 'transparent'),
        activeColour: css(activeColour || fill.colour, 'transparent'),
        opacity,
        activeOpacity: part.activeOpacity != null ? numberOr(part.activeOpacity, 1) : opacity,
        stroke: border.enabled === true && numberOr(border.thickness, 0) > 0 ? { colour: css(border.colour, '#000'), width: numberOr(border.thickness, 0) } : null,
        gradient: gradientOf(fill),
        gradientOpacity: numberOr(fill.gradientOpacity, 100) / 100,
        // What a plain path cannot paint: a finish, an image. Those go through the full fill.
        full: materialActive(background?._children?.Effects?._children?.Material) || fill.imageEnabled === true || fill.overlayEnabled === true,
        background,
        fontFamily: String(part.fontFamily ?? '').trim() || 'inherit',
      };
    }));
</script>

{#each drawn as item (item.name)}
  <g data-part={item.name} transform={item.drawing.transform || undefined}>
    {#if item.base}
      {#if item.full}
        <g opacity={item.opacity}>
          <SliderShapeFill background={item.background} bounds={{ x: item.drawing.box.x, y: item.drawing.box.y, width: item.drawing.box.w, height: item.drawing.box.h }}
            shape={{ kind: 'filled-path', d: item.base }} maskId={`${uid}-${item.name}`} svgWidth={W} svgHeight={H} />
        </g>
      {:else}
        <path d={item.base} fill={item.colour} fill-rule="evenodd" opacity={item.opacity} />
      {/if}
      {#if item.gradient}
        <defs>
          {#if item.gradient.radial}
            <radialGradient id={`${uid}-${item.name}-g`} cx={item.gradient.cx} cy={item.gradient.cy} r={item.gradient.r}>
              {#each item.gradient.stops as stop, i (i)}<stop offset={`${stop.offset}%`} stop-color={stop.colour} />{/each}
            </radialGradient>
          {:else}
            <linearGradient id={`${uid}-${item.name}-g`} x1={item.gradient.x1} y1={item.gradient.y1} x2={item.gradient.x2} y2={item.gradient.y2}>
              {#each item.gradient.stops as stop, i (i)}<stop offset={`${stop.offset}%`} stop-color={stop.colour} />{/each}
            </linearGradient>
          {/if}
        </defs>
        <path d={item.base} fill={`url(#${uid}-${item.name}-g)`} fill-rule="evenodd" opacity={item.gradientOpacity * item.opacity} />
      {/if}
      {#if item.stroke}
        <path d={item.base} fill="none" stroke={item.stroke.colour} stroke-width={item.stroke.width} stroke-linejoin="round" opacity={item.opacity} />
      {/if}
    {/if}
    {#if item.zone}
      <path d={item.zone} fill={item.activeColour} fill-rule="evenodd" opacity={item.opacity} />
    {/if}
    {#if item.lit}
      <g transform={item.litOffset.x || item.litOffset.y ? `translate(${item.litOffset.x} ${item.litOffset.y})` : undefined}>
        <path d={item.lit} fill={item.activeColour} fill-rule="evenodd" opacity={item.activeOpacity} />
        {#if item.stroke}<path d={item.lit} fill="none" stroke={item.stroke.colour} stroke-width={item.stroke.width} stroke-linejoin="round" opacity={item.activeOpacity} />{/if}
      </g>
    {/if}
    {#each item.drawing.texts as text, i (i)}
      <text x={text.x} y={text.y} text-anchor="middle" fill={item.colour} opacity={item.opacity} font-size={text.size} font-family={item.fontFamily}>{text.text}</text>
    {/each}
  </g>
{/each}
