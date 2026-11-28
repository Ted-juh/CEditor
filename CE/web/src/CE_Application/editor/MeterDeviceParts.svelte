<script>
  /**
   * A meter drawn with its own parts (models/meterDeviceParts.js), in the form frame's 160 by 100
   * units: ControlAnatomy places the frame, as it does for a form. Its reading is a Label of its own.
   * What each part draws at the reading comes from utils/meterParts.js; this paints it, each part
   * with its fill, a gradient laid over it, a border and a finish, its lit cells and its zone in
   * the active colour, and where the meter's colour zones decide, in theirs. A scale's numerals are
   * drawn upright, outside the part's own turn.
   *
   * Each part also plays what is put on it, as a key's parts do (editor/ButtonDeviceParts.svelte; the
   * Components showcase's Meter, phase 2: docs/design/component-presets.md): a keyframe animation
   * moves and fades it about its own centre (`partAnimations`, on a group inside the part's own turn,
   * so a needle's glow rides on the needle); a colour frame recolours what it fills (`partColours`, the
   * shape channel); a change eases its colour and opacity (`partTransitions`). Every part sets all of
   * these, `none` where it has nothing, so none borrows the control's own.
   *
   * A text effect plays on the words the meter draws (`partTexts`, utils/svgWords.js): its legend,
   * a letter or a word at a time where the browser set them (measured from the word drawn whole and
   * hidden), or a figure at a time where it draws figures in cells; and its scale's numbers, a number
   * at a time. The pieces fill with the part's paint, its colour eased and its colour frames, and an
   * effect that colours them plays on that fill (utils/svgWords.js), so both show.
   */
  import SliderShapeFill from './SliderShapeFill.svelte';
  import { METER_DEVICE_PARTS, METER_FRAME } from '../models/meterDeviceParts.js';
  import { meterLitOffset, meterPartDrawing } from '../utils/meterParts.js';
  import { materialActive } from '../utils/materialFilter.js';
  import { numberOr } from '../utils/primitives.js';
  import { renderedFrame, renderedLooks, renderedMeterPartSpec, requestRenderedLook } from '../utils/renderedLook.js';
  import { activeControlSet } from '../stores/controlSets.js';
  import { animationDeclaration, colourVariables } from '../utils/keyframeAnimation.js';
  import { transitionDeclaration, colourTransitionVar } from '../utils/transitionCss.js';
  import { optionRankVars } from '../utils/optionStagger.js';
  import { METER_CELL_PART } from '../models/meterDeviceParts.js';
  import { numeralPieces, wordPieces, wordsSplit } from '../utils/svgWords.js';
  import { measureLetters } from './measureLetters.js';

  let { parts = {}, p = 0, peak = null, figures = '0', meter = {}, uid = 'meter', partAnimations = null, partColours = null, partTransitions = null, partTexts = null } = $props();

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
        ...playing(name),
        cells: name === 'indicator' && lampsPlay && drawing.cells?.length ? eachLamp(drawing.cells, fill, activeColour) : null,
      };
    })
    .map((item) => ({ ...item, words: wordsPlaying(item) })));

  // Every lamp (models/meterDeviceParts.js METER_CELL_PART): while something plays on it, the
  // indicator draws each of its lamps alone, in its own colour, each saying where it stands along the
  // row, from the top down, out from the level and in a scattered order (utils/optionStagger.js), so
  // one animation can reach them one after another. A gradient, a finish or an image on the part is
  // not drawn on a lamp alone: no set gives its lamps one.
  let lampsPlay = $derived.by(() => {
    const moves = animationDeclaration(partAnimations?.get?.(METER_CELL_PART) ?? null, { svg: true });
    const channels = partColours?.get?.(METER_CELL_PART) ?? null;
    return moves || channels ? { moves, colours: colourVariables(channels) } : null;
  });
  function eachLamp(cells, fill, activeColour) {
    const top = cells.reduce((at, cell) => (cell.lit ? Math.max(at, cell.index) : at), -1);
    const unlit = fill.solidEnabled === false ? 'transparent' : css(fill.colour, 'transparent');
    const lit = css(activeColour || fill.colour, 'transparent');
    return cells.map((cell) => ({
      d: cell.d,
      lit: cell.lit,
      index: cell.index,
      colour: cell.lit ? (cell.colour ? css(cell.colour) : lit) : unlit,
      vars: `${optionRankVars(cell.index, cell.count, top)}${lampsPlay.colours}`,
    }));
  }

  /**
   * What plays on one part: its group's timing and colour channels, and its own motion. A part's
   * turn (a needle's swing) is an SVG transform attribute; its keyframes move it inside that turn.
   */
  function playing(name) {
    const bucket = partTransitions?.get?.(name) ?? null;
    const channels = partColours ? (partColours.get(name) ?? {}) : null;
    const eased = bucket ? { transform: null, size: null, opacity: bucket.opacity ?? null, colour: bucket.colour ?? null, visibility: null } : null;
    return {
      timing: `${transitionDeclaration(eased, { target: 'svg' })}${colourTransitionVar(bucket?.colour ?? null, { svg: true })}${colourVariables(channels)}`,
      moves: animationDeclaration(partAnimations?.get?.(name) ?? null, { svg: true }),
    };
  }

  // The text effect playing on a part's words: the last to start, as a Label's.
  const wordsOn = (name) => partTexts?.get?.(name)?.at(-1) ?? null;

  // Where the browser set each letter of a legend's words, measured from the word drawn whole and
  // hidden (./measureLetters.js): by the word, its place, size and face.
  let letterAt = $state({});
  const letterKey = (text, family) => `${text.text}|${text.x}|${text.y}|${text.size}|${family}`;
  const measured = (key, at) => {
    const was = letterAt[key];
    if (was && was.end === at.end && was.xs.join() === at.xs.join()) return;
    letterAt = { ...letterAt, [key]: at };
  };

  /** A text effect on a legend's words or a scale's numbers, as pieces to draw; null for none. */
  function wordsPlaying(item) {
    const words = wordsOn(item.name);
    if (!words) return null;
    const opts = { phase: words.phase, seedText: `${item.name}:${words.name}`, at: words.at ?? null };
    if (item.name === 'legend' && item.drawing.texts.length) {
      const split = wordsSplit(words.effect, item.drawing.texts);
      const measure = split === 'whole' ? [] : item.drawing.texts.map((text) => ({ ...text, key: letterKey(text, item.fontFamily) }));
      return { pieces: wordPieces(words.effect, item.drawing.texts, measure.map((m) => letterAt[m.key] ?? null), opts), measure, labels: false };
    }
    if (item.drawing.labels.length) return { pieces: numeralPieces(words.effect, item.drawing.labels, opts), measure: [], labels: true };
    return null;
  }

  // What a shape paints with, as a style: its colour, eased on the part's colour timing, and the
  // part's colour frames (the shape channel) over it.
  const paint = (colour) => `fill:${colour};transition:var(--ce-colour-transition, none);animation:var(--ce-kf-shape, none);`;

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
  <g style={item.timing}>
  <g data-part-moves={item.moves ? '' : undefined} style={item.moves || undefined}>
    {#if item.cells}
      <!-- Every lamp alone, each its own animation's place (lampsPlay, above). -->
      {#each item.cells as cell, i (i)}
        <g style={cell.vars}>
          <g data-lamp={cell.index} data-lamp-lit={cell.lit ? '' : undefined} data-part-moves={lampsPlay.moves ? '' : undefined} style={lampsPlay.moves || undefined}>
            <path d={cell.d} style={paint(cell.colour)} fill-rule="evenodd" opacity={cell.lit ? item.activeOpacity : item.opacity}
              transform={cell.lit && (item.litOffset.x || item.litOffset.y) ? `translate(${item.litOffset.x} ${item.litOffset.y})` : undefined} />
            {#if item.stroke}<path d={cell.d} fill="none" stroke={item.stroke.colour} stroke-width={item.stroke.width} stroke-linejoin="round" opacity={cell.lit ? item.activeOpacity : item.opacity} />{/if}
          </g>
        </g>
      {/each}
    {:else if item.rendered}
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
        <path d={item.base} style={paint(item.colour)} fill-rule="evenodd" opacity={item.opacity} />
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
    {#if !item.rendered && !item.cells}
    {#each item.zoned as path, i (i)}
      <path d={path.d} fill={path.colour} fill-rule="evenodd" opacity={item.opacity} />
    {/each}
    {#if item.zone}
      <path d={item.zone} style={paint(item.activeColour)} fill-rule="evenodd" opacity={item.opacity} />
    {/if}
    {#if item.lit.length}
      <g transform={item.litOffset.x || item.litOffset.y ? `translate(${item.litOffset.x} ${item.litOffset.y})` : undefined}>
        {#each item.lit as path, i (i)}
          <path d={path.d} style={paint(path.colour ? css(path.colour) : item.activeColour)} fill-rule="evenodd" opacity={item.activeOpacity} />
          {#if item.stroke}<path d={path.d} fill="none" stroke={item.stroke.colour} stroke-width={item.stroke.width} stroke-linejoin="round" opacity={item.activeOpacity} />{/if}
        {/each}
      </g>
    {/if}
    {/if}
    {#if item.words && !item.words.labels}
      {@render drawWords(item, item.words.pieces, '')}
      {#each item.words.measure as m (m.key)}
        <text use:measureLetters={{ key: m.key, measured }} x={m.x} y={m.y} text-anchor="middle" font-size={m.size} font-family={item.fontFamily} visibility="hidden" aria-hidden="true">{m.text}</text>
      {/each}
    {:else}
      {#each item.drawing.texts as text, i (i)}
        <text x={text.x} y={text.y} text-anchor="middle" style={paint(item.textColour)} opacity={item.opacity} font-size={text.size} font-family={item.fontFamily}>{text.text}</text>
      {/each}
    {/if}
  </g>
  </g>
  </g>
  {#if item.drawing.labels.length}
    <!-- Upright, outside the part's turn, and playing what the part plays: a scale that lights up
         lights its numerals. -->
    <g style={item.timing}><g style={item.moves || undefined}>
    {#if item.words?.labels}
      {@render drawWords(item, item.words.pieces, 'central')}
    {:else}
      {#each item.drawing.labels as label, i (i)}
        <text data-numeral={item.name} x={label.x} y={label.y} text-anchor={label.anchor} dominant-baseline="central" style={paint(item.textColour)} opacity={item.opacity} font-size={label.size} font-family={item.fontFamily}>{label.text}</text>
      {/each}
    {/if}
    </g></g>
  {/if}
{/each}

<!-- Words in a text effect, a piece each: filled with the part's paint, which they inherit with its
     colour frames, and the effect's colour on that fill; each moving about its own box, a roll or a
     push cut to a box about it. -->
{#snippet drawWords(item, pieces, baseline)}
  <g style={paint(item.textColour)} opacity={item.opacity}>
    {#each pieces as piece, i (i)}
      {#if piece.clip}
        <clipPath id={`${uid}-${item.name}-w${i}`}><rect x={piece.clip.x} y={piece.clip.y} width={piece.clip.width} height={piece.clip.height} /></clipPath>
      {/if}
      <g clip-path={piece.clip ? `url(#${uid}-${item.name}-w${i})` : undefined}>
        <!-- A reel's piece is its column: itself, then the glyphs it rolls past, a line each. -->
        <text data-word-piece={item.name} x={piece.x} y={piece.y} text-anchor={piece.anchor} dominant-baseline={baseline || undefined}
          font-size={piece.size} font-family={item.fontFamily} style={piece.style || undefined}>{#if piece.column}{#each piece.column.lines as line, k (k)}<tspan x={piece.x} y={piece.y + k * piece.column.step}>{line}</tspan>{/each}{:else}{piece.text}{/if}</text>
      </g>
    {/each}
  </g>
{/snippet}
