<script>
  /**
   * A meter drawn with its own parts (models/meterDeviceParts.js), in the form frame's 160 by 100
   * units: ControlAnatomy places the frame, as it does for a form. Its reading is a Label of its own.
   * What each part draws at the reading comes from utils/meterParts.js; this paints it, each part
   * with its fill, a gradient laid over it, a border and a finish, its lit cells and its zone in
   * the active colour, and where the meter's colour zones decide, in theirs. A scale's numerals are
   * drawn upright, outside the part's own turn.
   */
  import SliderShapeFill from './SliderShapeFill.svelte';
  import { METER_DEVICE_PARTS, METER_FRAME } from '../models/meterDeviceParts.js';
  import { meterLitOffset, meterPartDrawing } from '../utils/meterParts.js';
  import { materialActive } from '../utils/materialFilter.js';
  import { numberOr } from '../utils/primitives.js';
  import { renderedFrame, renderedLooks, renderedMeterPartSpec, requestRenderedLook } from '../utils/renderedLook.js';
  import { activeControlSet } from '../stores/controlSets.js';

  let { parts = {}, p = 0, peak = null, figures = '0', meter = {}, uid = 'meter' } = $props();

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

  let drawn = $derived(METER_DEVICE_PARTS
    .map((name) => [name, parts?.[name]])
    .filter(([, part]) => part?.visible === true)
    .sort((a, b) => numberOr(a[1].zIndex, 0) - numberOr(b[1].zIndex, 0))
    .map(([name, part]) => {
      const background = part?._children?.Background ?? null;
      const fill = background?._children?.Fill ?? {};
      const border = background?._children?.Border ?? {};
      const drawing = meterPartDrawing(name, part, { p, peak, figures, meter });
      const opacity = numberOr(part.opacity, 1);
      const activeColour = String(part.activeColour ?? '').trim();
      // The base paths in the part's own paint, and those the meter's zones colour, apart.
      const own = drawing.paths.filter((path) => path.role === 'base' && !path.colour);
      return {
        name,
        part,
        drawing,
        base: own.map((path) => path.d).join(' '),
        zoned: drawing.paths.filter((path) => path.role === 'base' && path.colour).map((path) => ({ d: path.d, colour: css(path.colour) })),
        lit: drawing.paths.filter((path) => path.role === 'lit'),
        zone: drawing.paths.filter((path) => path.role === 'zone').map((path) => path.d).join(' '),
        litOffset: meterLitOffset(part),
        // A fill that is a gradient only (Fill Type: Gradient) shows no colour under it.
        colour: fill.solidEnabled === false ? 'transparent' : css(fill.colour, 'transparent'),
        textColour: css(drawing.textColour ?? fill.colour, 'transparent'),
        activeColour: css(activeColour || fill.colour, 'transparent'),
        opacity,
        activeOpacity: part.activeOpacity != null ? numberOr(part.activeOpacity, 1) : opacity,
        stroke: border.enabled === true && numberOr(border.thickness, 0) > 0 ? { colour: css(border.colour, '#000'), width: numberOr(border.thickness, 0) } : null,
        gradient: gradientOf(fill, drawing.box),
        gradientOpacity: numberOr(fill.gradientOpacity, 100) / 100,
        // What a plain path cannot paint: a finish, an image. Those go through the full fill.
        full: materialActive(background?._children?.Effects?._children?.Material) || fill.imageEnabled === true || fill.overlayEnabled === true,
        background,
        fontFamily: String(part.fontFamily ?? '').trim() || 'inherit',
        shadow: shadowOf(part),
        rendered: renderedPart(name, part, drawing),
      };
    }));

  // A housing or clip lamp whose look is 'rendered' (utils/renderedLook.js): a low block its box's
  // size, or a turned body for a round lamp, as an image centred on its box, lit by the set's lamp. A
  // lamp lit at its level is another image in its lit colour. Null while it is made, and the part
  // draws as it always did; so does one the meter's zones colour, whose colour moves with the reading.
  const RENDERED_PARTS = new Set(['housing', 'lamp']);
  function renderedPart(name, part, drawing) {
    if (!RENDERED_PARTS.has(name) || String(part?.look ?? '') !== 'rendered') return null;
    if (String(part?.zoneColours ?? 'off') !== 'off' || drawing.paths.some((path) => path.colour)) return null;
    const box = drawing.box;
    if (!(box?.w > 0) || !(box?.h > 0)) return null;
    const lit = drawing.paths.some((path) => path.role === 'lit') && String(part?.activeColour ?? '').trim();
    const colour = lit ? part.activeColour : part?._children?.Background?._children?.Fill?.colour;
    const spec = renderedMeterPartSpec(part, { colour, topColour: part?.renderTopColour || null, lamp: $activeControlSet?.lamp, name });
    if (!spec) return null;
    const big = Math.max(box.w, box.h);
    const frame = renderedFrame(spec);
    const w = frame.w * big;
    const h = frame.h * big;
    const url = requestRenderedLook($renderedLooks, spec, Math.max(w, h) * 3, 0);
    return url ? { url, x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h } : null;
  }

  // A drop shadow under a part (the sculpted synth set's cases): its outline again, `shadowOffset` %
  // of the frame's height lower, softened by `shadowBlur` %, in `shadowColour`. None unless asked.
  function shadowOf(part) {
    const dy = (numberOr(part?.shadowOffset, 0) / 100) * H;
    const blur = (numberOr(part?.shadowBlur, 0) / 100) * H;
    return dy > 0 || blur > 0 ? { dy, blur, colour: css(part?.shadowColour, 'rgba(0,0,0,0.6)') } : null;
  }
</script>

{#each drawn as item (item.name)}
  <g data-part={item.name} transform={item.drawing.transform || undefined}>
    {#if item.rendered}
      <image data-rendered-look={item.name} href={item.rendered.url} x={item.rendered.x} y={item.rendered.y} width={item.rendered.w} height={item.rendered.h} opacity={item.opacity} preserveAspectRatio="none" />
    {:else if item.drawing.zoneFill && item.base}
      <!-- A fill coloured by position: the zones along its own direction, across its whole box. -->
      <defs>
        <linearGradient id={`${uid}-${item.name}-z`} gradientUnits="userSpaceOnUse" x1={item.drawing.zoneFill.x1} y1={item.drawing.zoneFill.y1} x2={item.drawing.zoneFill.x2} y2={item.drawing.zoneFill.y2}>
          {#each item.drawing.zoneFill.stops as stop, i (i)}<stop offset={stop.offset} stop-color={css(stop.colour, '#000')} />{/each}
        </linearGradient>
      </defs>
      <path d={item.base} fill={`url(#${uid}-${item.name}-z)`} fill-rule="evenodd" opacity={item.opacity} />
      {#if item.stroke}<path d={item.base} fill="none" stroke={item.stroke.colour} stroke-width={item.stroke.width} stroke-linejoin="round" opacity={item.opacity} />{/if}
    {:else if item.base}
      {#if item.shadow}
        {#if item.shadow.blur > 0}
          <filter id={`${uid}-${item.name}-s`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={item.shadow.blur / 2} /></filter>
        {/if}
        <path data-part-shadow={item.name} d={item.base} transform={`translate(0 ${item.shadow.dy})`} fill={item.shadow.colour} fill-rule="evenodd" filter={item.shadow.blur > 0 ? `url(#${uid}-${item.name}-s)` : undefined} />
      {/if}
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
            <linearGradient id={`${uid}-${item.name}-g`} gradientUnits={item.gradient.user ? 'userSpaceOnUse' : undefined} x1={item.gradient.x1} y1={item.gradient.y1} x2={item.gradient.x2} y2={item.gradient.y2}>
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
    {#if !item.rendered}
    {#each item.zoned as path, i (i)}
      <path d={path.d} fill={path.colour} fill-rule="evenodd" opacity={item.opacity} />
    {/each}
    {#if item.zone}
      <path d={item.zone} fill={item.activeColour} fill-rule="evenodd" opacity={item.opacity} />
    {/if}
    {#if item.lit.length}
      <g transform={item.litOffset.x || item.litOffset.y ? `translate(${item.litOffset.x} ${item.litOffset.y})` : undefined}>
        {#each item.lit as path, i (i)}
          <path d={path.d} fill={path.colour ? css(path.colour) : item.activeColour} fill-rule="evenodd" opacity={item.activeOpacity} />
          {#if item.stroke}<path d={path.d} fill="none" stroke={item.stroke.colour} stroke-width={item.stroke.width} stroke-linejoin="round" opacity={item.activeOpacity} />{/if}
        {/each}
      </g>
    {/if}
    {/if}
    {#each item.drawing.texts as text, i (i)}
      <text x={text.x} y={text.y} text-anchor="middle" fill={item.textColour} opacity={item.opacity} font-size={text.size} font-family={item.fontFamily}>{text.text}</text>
    {/each}
  </g>
  {#each item.drawing.labels as label, i (i)}
    <text data-numeral={item.name} x={label.x} y={label.y} text-anchor={label.anchor} dominant-baseline="central" fill={item.textColour} opacity={item.opacity} font-size={label.size} font-family={item.fontFamily}>{label.text}</text>
  {/each}
{/each}
