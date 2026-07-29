<script>
  // ScriptDrawOverlay — paints what a script drew, on top of a control.
  //
  // Immediate mode: the runtime hands over a flat command list, each entry carrying the style that
  // was in force when the script issued it, and this walks it and emits one SVG element per
  // command, in order. There is no state machine here on purpose — the style was resolved on the
  // script side, so the renderer cannot disagree with the script about what colour something is.
  //
  // Coordinates are the CONTROL's own, (0,0) at its top-left, which is what makes a drawing scale
  // with whatever it is drawn on. Nothing here is ever persisted: a drawing is a product of the
  // script, and lives only in the scriptDrawings store.
  import { scriptDrawings } from '../stores/scriptDraw.js';
  import { gradientCoords } from '../utils/gradientGeometry.js';
  import { glyphRows, FONT_W, FONT_H, FONT_ADVANCE } from '../utils/pixelFont.js';

  let { controlId = '', width = 0, height = 0 } = $props();

  let commands = $derived($scriptDrawings[String(controlId)]?.commands ?? []);

  // Every gradient a command referred to, defined once in <defs>. The runtime hands them over
  // already resolved — angle, stops — and the geometry is the app's own gradientCoords, which is
  // written for exactly this: gradientUnits="userSpaceOnUse", so a gradient still paints on a
  // zero-area path like a horizontal line.
  let gradients = $derived((() => {
    const seen = new Map();
    for (const c of commands) {
      for (const paintValue of [c.fill, c.stroke]) {
        if (paintValue && typeof paintValue === 'object' && paintValue.gradient) {
          seen.set(paintValue.id, paintValue);
        }
      }
    }
    return [...seen.values()];
  })());

  /** A polyline/polygon "x,y x,y …" point list. */
  const pointsAttr = (points) => (points ?? []).map(([x, y]) => `${x},${y}`).join(' ');

  // SVG needs "none" rather than an absent attribute to mean "do not paint this". A gradient is an
  // object rather than a string, and becomes a url(#…) reference to the <defs> entry above.
  const paint = (colour) => {
    if (colour == null || colour === '') return 'none';
    if (typeof colour === 'object') return colour.gradient ? `url(#${colour.id})` : 'none';
    return colour;
  };

  /** The style every shape shares. Held in one place so a new attribute cannot reach five of the
   *  six shapes and get missed on the seventh. */
  const style = (c) => ({
    fill: paint(c.fill),
    stroke: paint(c.stroke),
    'stroke-width': c.strokeWidth,
    'stroke-dasharray': c.dash || undefined,
    'stroke-linecap': c.cap || undefined,
    'stroke-linejoin': c.join || undefined,
    opacity: c.opacity == null ? undefined : c.opacity,
    transform: c.transform || undefined,
  });

  /** The 5x7 pixel font, as one rect per lit pixel. The app's own glyphs — an LCD readout a script
   *  draws and one an LCD component prints are the same letters, which a second font would not be. */
  function pixelRects(c) {
    const out = [];
    const scale = Math.max(1, Math.round(c.scale || 1));
    let x = c.x;
    for (const ch of String(c.text ?? '')) {
      // glyphRows gives FONT_H strings of FONT_W characters, a lit pixel being '#'. An unknown
      // character comes back as the font's own block glyph rather than a hole, which is what the
      // LCD components show too.
      const rows = glyphRows(ch);
      if (rows) {
        for (let row = 0; row < FONT_H; row += 1) {
          const line = rows[row] ?? '';
          for (let col = 0; col < FONT_W; col += 1) {
            if (line[col] !== '#') continue;
            out.push({ x: x + col * scale, y: c.y + row * scale, s: scale });
          }
        }
      }
      x += FONT_ADVANCE * scale;
    }
    return out;
  }

  // Arc geometry. Angles arrive in DEGREES with 0 at twelve o'clock, increasing clockwise — the
  // convention a knob's arc is described in. SVG measures from three o'clock, hence the -90.
  function arcPoint(cx, cy, r, deg) {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function arcPath(c) {
    const r = Math.max(0, c.r);
    const sweep = c.to - c.from;
    // A full turn (or more) has no arc endpoints to draw between — SVG would render nothing at
    // all, since start and end coincide — so it becomes two half-circles.
    if (Math.abs(sweep) >= 360) {
      const [ax, ay] = arcPoint(c.cx, c.cy, r, 0);
      const [bx, by] = arcPoint(c.cx, c.cy, r, 180);
      return `M ${ax} ${ay} A ${r} ${r} 0 1 1 ${bx} ${by} A ${r} ${r} 0 1 1 ${ax} ${ay}`;
    }
    const [sx, sy] = arcPoint(c.cx, c.cy, r, c.from);
    const [ex, ey] = arcPoint(c.cx, c.cy, r, c.to);
    const large = Math.abs(sweep) > 180 ? 1 : 0;
    const dir = sweep >= 0 ? 1 : 0;
    const arc = `M ${sx} ${sy} A ${r} ${r} 0 ${large} ${dir} ${ex} ${ey}`;
    // Filled means a pie slice: close through the centre.
    return c.fill ? `${arc} L ${c.cx} ${c.cy} Z` : arc;
  }
</script>

{#if commands.length}
  <!-- overflow hidden: a script drawing outside the control's bounds must not paint over its
       neighbours. clipPath is per-control so two overlays cannot clip each other. -->
  <svg
    class="script-draw"
    {width}
    {height}
    viewBox="0 0 {Math.max(1, width)} {Math.max(1, height)}"
    aria-hidden="true"
  >
    <defs>
      <clipPath id="ce-draw-clip-{controlId}">
        <rect x="0" y="0" width={Math.max(0, width)} height={Math.max(0, height)} />
      </clipPath>
      {#each gradients as g (g.id)}
        {@const co = gradientCoords(g.angle, Math.max(1, width), Math.max(1, height))}
        <linearGradient
          id={g.id}
          gradientUnits="userSpaceOnUse"
          x1={co.x1} y1={co.y1} x2={co.x2} y2={co.y2}
        >
          {#each g.stops as st, si (si)}
            <stop offset="{st.at * 100}%" stop-color={st.colour} stop-opacity={st.opacity ?? 1} />
          {/each}
        </linearGradient>
      {/each}
    </defs>
    <g clip-path="url(#ce-draw-clip-{controlId})">
      {#each commands as c, i (i)}
        {#if c.op === 'rect'}
          <rect
            x={c.x} y={c.y} width={Math.max(0, c.w)} height={Math.max(0, c.h)}
            rx={c.radius || 0} ry={c.radius || 0}
            {...style(c)} />
        {:else if c.op === 'circle'}
          <circle cx={c.cx} cy={c.cy} r={Math.max(0, c.r)} {...style(c)} />
        {:else if c.op === 'ellipse'}
          <ellipse cx={c.cx} cy={c.cy} rx={Math.max(0, c.rx)} ry={Math.max(0, c.ry)} {...style(c)} />
        {:else if c.op === 'arc'}
          <!-- Stroked as an open arc; filled as a pie slice, because a filled arc with no centre
               would be a shape nobody asked for. -->
          <path d={arcPath(c)} {...style(c)} fill={c.fill ? paint(c.fill) : 'none'} />
        {:else if c.op === 'line'}
          <!-- A line has no inside, so it is stroke-only whatever fill was set. -->
          <line x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} {...style(c)} fill="none" />
        {:else if c.op === 'path'}
          {#if c.closed}
            <polygon points={pointsAttr(c.points)} {...style(c)} />
          {:else}
            <polyline points={pointsAttr(c.points)} {...style(c)}
              stroke-linejoin={c.join || 'round'} stroke-linecap={c.cap || 'round'} />
          {/if}
        {:else if c.op === 'text'}
          <text
            x={c.x} y={c.y} font-size={c.size}
            font-family={c.family || 'inherit'}
            text-anchor={c.align === 'middle' ? 'middle' : c.align === 'right' ? 'end' : 'start'}
            {...style(c)} stroke="none" fill={paint(c.fill ?? c.stroke)}>{c.text}</text>
        {:else if c.op === 'pixelText'}
          <!-- One rect per lit pixel. Deliberately literal: it IS a bitmap font, and rendering it
               as anything smoother would stop being the font the LCD components print. -->
          <g {...style(c)} stroke="none" fill={paint(c.fill ?? c.stroke)}>
            {#each pixelRects(c) as p, pi (pi)}
              <rect x={p.x} y={p.y} width={p.s} height={p.s} />
            {/each}
          </g>
        {/if}
      {/each}
    </g>
  </svg>
{/if}

<style>
  /* Absolutely positioned over the control, and never interactive: a drawing is decoration, and a
     script that wanted a click should use a control that reports one. */
  .script-draw {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
  }
</style>
