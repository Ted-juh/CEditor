<script>
  // LcdLinePreview — a line an LCD is given, drawn in the Values tab as the display shows it
  // (scripting/lcdLines.js): its cells, each drawn as the display draws a character (a segment
  // display's segments, a graphic display's pixel font, a character display's text), a cell the
  // display has no shape for marked, and the characters past its width faint where they are cut and
  // dimmed where they scroll in. Drawn to read, not to edit: the line is edited in the code.
  import { getSegmentGlyph, SEGMENT_VIEWBOX } from '../utils/lcdSegmentFont.js';
  import { glyphRows, FONT_W, FONT_H } from '../utils/pixelFont.js';

  let { line } = $props();

  // Cells shrink to fit the row's width, down to a size that still reads, and the strip scrolls
  // sideways past that.
  const ROW_WIDTH = 236;
  let cellW = $derived(Math.max(7, Math.min(13, Math.floor(ROW_WIDTH / Math.max(1, line.cols + Math.min(line.past.length, 8))))));
  let cellH = $derived(Math.round(cellW * 1.6));

  const pixels = (ch) => {
    const rows = glyphRows(ch) ?? [];
    const out = [];
    rows.forEach((row, y) => { for (let x = 0; x < FONT_W; x += 1) if (row[x] === '#') out.push({ x, y }); });
    return out;
  };
  const shownChar = (ch) => (ch === ' ' ? ' ' : ch);
  const label = $derived(`The line as the ${line.cols}-character display shows it`
    + `${line.undrawn.length ? `; it cannot draw ${line.undrawn.map((c) => JSON.stringify(c)).join(', ')}` : ''}`
    + `${line.cut ? `; ${line.cut.length} characters are cut off` : ''}`);
</script>

{#snippet cell(c, extra)}
  <span class={['lcell', !c.draws && 'miss', extra]} style:width={`${cellW}px`} style:height={`${cellH}px`}
    title={c.draws ? undefined : `The display has no shape for ${JSON.stringify(c.ch)}: this cell stays blank`}>
    {#if !c.draws}
      <!-- Blank on the display; marked here so the gap is seen. -->
    {:else if line.panelType === 'segment'}
      {@const glyph = getSegmentGlyph(line.segmentType, c.ch)}
      <svg viewBox={`0 0 ${SEGMENT_VIEWBOX.width} ${SEGMENT_VIEWBOX.height}`} width={cellW - 2} height={cellH - 2} aria-hidden="true">
        {#each Object.entries(glyph.geometry) as [seg, shape] (seg)}
          {#if glyph.lit.has(seg)}
            {#if shape.kind === 'poly'}<polygon points={shape.points} />
            {:else if shape.kind === 'line'}<line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke-width={shape.width} />
            {:else if shape.kind === 'path'}<path d={shape.d} fill="none" stroke-width={shape.width} />
            {:else if shape.kind === 'dot'}<circle cx={shape.cx} cy={shape.cy} r={shape.r} />{/if}
          {/if}
        {/each}
      </svg>
    {:else if line.panelType === 'graphic'}
      <svg viewBox={`0 0 ${FONT_W} ${FONT_H}`} width={cellW - 3} height={cellH - 4} aria-hidden="true">
        {#each pixels(c.ch) as p, i (i)}<rect x={p.x + 0.08} y={p.y + 0.08} width="0.84" height="0.84" />{/each}
      </svg>
    {:else}
      <span class="lch" style:font-size={`${Math.round(cellH * 0.62)}px`}>{shownChar(c.ch)}</span>
    {/if}
  </span>
{/snippet}

<div class="lcdline" role="img" aria-label={label}>
  <span class="lscreen">
    {#each line.cells as c, i (i)}{@render cell(c, null)}{/each}
  </span>
  {#if line.past.length}
    <span class={['lpast', line.cut ? 'cut' : 'scrolls']}
      title={line.cut ? `Cut off: the display is ${line.cols} characters wide and does not scroll` : 'Scrolls in: the display scrolls the line through its cells'}>
      {#each line.past as c, i (i)}{@render cell(c, null)}{/each}
    </span>
  {/if}
</div>

<style>
  .lcdline { display: flex; align-items: center; max-width: 100%; overflow-x: auto; padding: 2px 0 3px; }
  .lscreen, .lpast { display: inline-flex; gap: 1px; padding: 2px; flex-shrink: 0; }
  .lscreen { background: #0f1a14; border: 1px solid #2c3b31; border-radius: 3px; color: #8fe0a0; fill: #8fe0a0; stroke: #8fe0a0; }
  .lpast { color: #8fe0a0; fill: #8fe0a0; stroke: #8fe0a0; border: 1px dashed transparent; }
  .lpast.cut { opacity: 0.32; }
  .lpast.cut .lcell { text-decoration: line-through; }
  .lpast.scrolls { opacity: 0.6; border-color: #2c3b31; border-left: none; border-radius: 0 3px 3px 0; }
  .lcell { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; position: relative; }
  .lcell.miss { box-shadow: inset 0 0 0 1px #e0635a; border-radius: 2px; background: rgba(224, 99, 90, 0.14); }
  .lch { font-family: var(--mono); line-height: 1; }
</style>
