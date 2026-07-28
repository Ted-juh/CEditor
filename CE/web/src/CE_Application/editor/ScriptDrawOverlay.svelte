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

  let { controlId = '', width = 0, height = 0 } = $props();

  let commands = $derived($scriptDrawings[String(controlId)]?.commands ?? []);

  /** A polyline/polygon "x,y x,y …" point list. */
  const pointsAttr = (points) => (points ?? []).map(([x, y]) => `${x},${y}`).join(' ');

  // SVG needs "none" rather than an absent attribute to mean "do not paint this".
  const paint = (colour) => (colour == null || colour === '' ? 'none' : colour);
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
    </defs>
    <g clip-path="url(#ce-draw-clip-{controlId})">
      {#each commands as c, i (i)}
        {#if c.op === 'rect'}
          <rect
            x={c.x} y={c.y} width={Math.max(0, c.w)} height={Math.max(0, c.h)}
            rx={c.radius || 0} ry={c.radius || 0}
            fill={paint(c.fill)} stroke={paint(c.stroke)} stroke-width={c.strokeWidth} />
        {:else if c.op === 'circle'}
          <circle
            cx={c.cx} cy={c.cy} r={Math.max(0, c.r)}
            fill={paint(c.fill)} stroke={paint(c.stroke)} stroke-width={c.strokeWidth} />
        {:else if c.op === 'line'}
          <!-- A line has no inside, so it is stroke-only whatever fill was set. -->
          <line
            x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
            stroke={paint(c.stroke)} stroke-width={c.strokeWidth} />
        {:else if c.op === 'path'}
          {#if c.closed}
            <polygon points={pointsAttr(c.points)}
              fill={paint(c.fill)} stroke={paint(c.stroke)} stroke-width={c.strokeWidth} />
          {:else}
            <polyline points={pointsAttr(c.points)}
              fill={paint(c.fill)} stroke={paint(c.stroke)} stroke-width={c.strokeWidth}
              stroke-linejoin="round" stroke-linecap="round" />
          {/if}
        {:else if c.op === 'text'}
          <text
            x={c.x} y={c.y} font-size={c.size}
            font-family={c.family || 'inherit'}
            text-anchor={c.align === 'middle' ? 'middle' : c.align === 'right' ? 'end' : 'start'}
            fill={paint(c.fill ?? c.stroke)}>{c.text}</text>
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
