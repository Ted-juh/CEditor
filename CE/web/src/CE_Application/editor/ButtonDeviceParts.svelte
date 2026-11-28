<script>
  /**
   * A button's or a switch's device drawn with its own parts (models/buttonDeviceParts.js), in the
   * form frame's top 160 by 80 units: ControlAnatomy places and scales that frame and sets the
   * caption beside or under it, as it does for a form. Each part is a shape in a box
   * (utils/deviceShapes.js) with its fill, a gradient laid over it, a border, and a finish; pressed
   * or on, it moves, turns and changes colour as the part says.
   *
   * Each part also plays what is put on it (the Components showcase's Button, second half:
   * docs/design/component-presets.md): a keyframe animation moves and fades it about its own centre
   * (`partAnimations`, on a group inside the part's own travel, so it adds to the key going down); a
   * colour frame recolours what it fills (`partColours`, the shape channel, read by every shape it
   * paints with); a state change eases its colour and opacity (`partTransitions`, a lamp that fades
   * up as it lights); and a text effect plays on the legend's words (`partTexts`), a letter or a word
   * at a time where the browser set them (utils/svgWords.js), or whole. Every part sets all of these, `none` where it has nothing, so none borrows the
   * control's own.
   */
  import SliderShapeFill from './SliderShapeFill.svelte';
  import { BUTTON_DEVICE_PARTS, DEVICE_FRAME } from '../models/buttonDeviceParts.js';
  import { deviceShapeOptions, deviceShapePath, devicePatternCells } from '../utils/deviceShapes.js';
  import { materialActive } from '../utils/materialFilter.js';
  import { numberOr } from '../utils/primitives.js';
  import { renderedDevicePartSpec, renderedFrame, renderedLooks, requestRenderedLook } from '../utils/renderedLook.js';
  import { activeControlSet } from '../stores/controlSets.js';
  import { animationDeclaration, colourVariables } from '../utils/keyframeAnimation.js';
  import { transitionDeclaration, colourTransitionVar } from '../utils/transitionCss.js';
  import { textEffectClips } from '../utils/textEffects.js';
  import { wordPieces, wordsSplit } from '../utils/svgWords.js';
  import { measureLetters } from './measureLetters.js';

  let { parts = {}, active = false, uid = 'device', partAnimations = null, partColours = null, partTransitions = null, partTexts = null } = $props();

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
      .map((cell) => deviceShapePath(part?.shape, cell.x, cell.y, cell.w, cell.h, deviceShapeOptions(part, radius, active)))
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
        ...playing(name),
      };
    }));

  /**
   * What plays on one part: its group's opacity, timing and colour channels; its own motion; and on
   * the legend, a text effect on its words. The opacity is a style rather than an attribute so a
   * state change can ease it. A part's travel is an SVG transform attribute, which no transition
   * moves, so only its colour and opacity ease; its keyframes move it on top of its travel.
   */
  function playing(name) {
    const bucket = partTransitions?.get?.(name) ?? null;
    const channels = partColours ? (partColours.get(name) ?? {}) : null;
    const eased = bucket ? { transform: null, size: null, opacity: bucket.opacity ?? null, colour: bucket.colour ?? null, visibility: null } : null;
    const words = name === 'legend' ? (partTexts?.get?.('legend')?.at(-1) ?? null) : null;
    return {
      timing: `${transitionDeclaration(eased, { target: 'svg' })}${colourTransitionVar(bucket?.colour ?? null, { svg: true })}${colourVariables(channels)}`,
      moves: animationDeclaration(partAnimations?.get?.(name) ?? null, { svg: true }),
      words,
    };
  }

  // What a shape paints with, as a style: its colour, eased on the part's colour timing, and the
  // part's colour frames (the shape channel) over it.
  const paint = (colour) => `fill:${colour};transition:var(--ce-colour-transition, none);animation:var(--ce-kf-shape, none);`;

  // A text effect on the legend's words, whole: SVG text has no letters to move one at a time.
  // A text effect on the legend's words: its letters (or words) where the browser set them, measured
  // from the word drawn whole and hidden (./measureLetters.js); whole until then, or when played whole.
  let letterAt = $state({});
  const measured = (key, at) => {
    const was = letterAt[key];
    if (was && was.end === at.end && was.xs.join() === at.xs.join()) return;
    letterAt = { ...letterAt, [key]: at };
  };
  function legendWords(item) {
    if (!item.words) return null;
    const text = { x: item.box.x + item.box.w / 2, y: item.box.y + item.box.h / 2, text: legendText(item), size: numberOr(item.part.fontSize, 11) };
    const key = `${text.text}|${text.x}|${text.y}|${text.size}`;
    const split = wordsSplit(item.words.effect, [text]);
    const pieces = wordPieces(item.words.effect, [text], [split === 'whole' ? null : (letterAt[key] ?? null)],
      { phase: item.words.phase, seedText: `legend:${item.words.name}`, at: item.words.at ?? null, central: true });
    return { pieces, measure: split === 'whole' ? null : { ...text, key } };
  }
  const legendText = (item) => (active ? (item.part.onText ?? '') : (item.part.offText ?? ''));

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
    <g transform={item.motion} style={`opacity:${item.opacity};${item.timing}`}>
    <g data-part-moves={item.moves ? '' : undefined} style={item.moves || undefined}>
      {#if item.rendered}
        <image data-rendered-look={item.name} href={item.rendered.url} x={item.rendered.x} y={item.rendered.y} width={item.rendered.w} height={item.rendered.h} preserveAspectRatio="none" />
      {:else if item.name === 'legend'}
        {@const fx = legendWords(item)}
        <!-- The words inherit their fill from the group, which takes the legend's colour frames, so a
             text effect's own animation on the words does not replace them. -->
        <g style={paint(item.colour)} clip-path={fx && textEffectClips(item.words?.effect) ? `url(#${uid}-legend-clip)` : undefined}>
          {#if fx && textEffectClips(item.words?.effect)}
            <clipPath id={`${uid}-legend-clip`}><rect x={item.box.x} y={item.box.y} width={item.box.w} height={item.box.h} /></clipPath>
          {/if}
          {#if fx}
            <!-- A piece each: the word whole, or its letters where the word had them. -->
            <!-- A reel's piece is its column, itself then the glyphs it rolls past, in a window of its own. -->
            {#each fx.pieces as piece, i (i)}
              {#if piece.column && piece.clip}
                <clipPath id={`${uid}-legend-w${i}`}><rect x={piece.clip.x} y={piece.clip.y} width={piece.clip.width} height={piece.clip.height} /></clipPath>
              {/if}
              <g clip-path={piece.column && piece.clip ? `url(#${uid}-legend-w${i})` : undefined}>
              <text x={piece.x} y={piece.y} text-anchor={piece.anchor} dominant-baseline="central"
                font-size={piece.size} font-family="inherit" style={piece.style || undefined} data-word-piece="">{#if piece.column}{#each piece.column.lines as line, k (k)}<tspan x={piece.x} y={piece.y + k * piece.column.step}>{line}</tspan>{/each}{:else}{piece.text}{/if}</text>
              </g>
            {/each}
            {#if fx.measure}
              <text use:measureLetters={{ key: fx.measure.key, measured }} x={fx.measure.x} y={fx.measure.y} text-anchor="middle" dominant-baseline="central"
                font-size={fx.measure.size} font-family="inherit" visibility="hidden" aria-hidden="true">{fx.measure.text}</text>
            {/if}
          {:else}
            <text x={item.box.x + item.box.w / 2} y={item.box.y + item.box.h / 2} text-anchor="middle" dominant-baseline="central"
              font-size={numberOr(item.part.fontSize, 11)} font-family="inherit">{legendText(item)}</text>
          {/if}
        </g>
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
          <path d={item.d} style={paint(item.colour)} fill-rule="evenodd" />
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
  </g>
{/each}
