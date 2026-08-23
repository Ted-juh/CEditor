<script>
  // Step Sequencer — steps across, tracks down, a playhead walking left to right.
  //
  // Visual only. The pattern and the geometry are `stepSequencerLayout.js`; the running position is
  // injected by the preview surface onto the section (`StepSequencer.__position`), because in the
  // editor the sequencer is stopped and drawing a playhead that never moves would suggest otherwise.
  //
  // Beat lines are heavier every fourth step. Without them a sixteen-step grid is sixteen identical
  // boxes and nobody can see where beat three is.
  import {
    beatLines, cellKey, sequencerConfig, sequencerGeometry, sequencerPattern, sequencerSteps,
    sequencerTracks, cellRect,
  } from '../utils/stepSequencerLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  function css(hex, fallback = 'rgba(255,255,255,0.9)') {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      const a = parseInt(s.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
    }
    return fallback;
  }

  let cfg = $derived(sequencerConfig(control));
  let geom = $derived(sequencerGeometry(width, height, control));
  let tracks = $derived(sequencerTracks(control));
  let pattern = $derived(sequencerPattern(control));
  let steps = $derived(sequencerSteps(control));
  let beats = $derived(beatLines(control));
  // `__position` only exists while the preview surface is running the sequencer. Absent means
  // stopped, and a stopped sequencer draws no playhead rather than one parked at step zero.
  let playhead = $derived(cfg.__position);

  let gridCss = $derived(css(cfg.gridColour, 'rgba(46,46,54,1)'));
  let cellCss = $derived(css(cfg.cellColour, 'rgba(30,30,36,1)'));
  let onCss = $derived(css(cfg.cellOnColour, 'rgba(91,155,213,1)'));
  let headCss = $derived(css(cfg.playheadColour, 'rgba(91,155,213,0.53)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));
</script>

<svg class="seq" viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} width={width} height={height} aria-hidden="true">
  {#if playhead !== undefined && playhead !== null}
    <rect
      x={geom.x0 + playhead * geom.cellW} y={geom.y0}
      width={geom.cellW} height={geom.height}
      fill={headCss}
    />
  {/if}

  {#each tracks as track, trackIndex (track.id ?? trackIndex)}
    <text
      x={geom.pad} y={geom.y0 + trackIndex * geom.cellH + geom.cellH / 2 + 3}
      fill={labelCss} font-size={Math.min(10, geom.cellH * 0.6)}
      opacity={track.muted ? 0.4 : 1}
    >{track.label ?? `Track ${trackIndex + 1}`}</text>

    {#each Array.from({ length: steps }, (_, step) => step) as step (step)}
      {@const rect = cellRect(geom, trackIndex, step)}
      {@const cell = pattern[cellKey(track.id, step)]}
      <rect
        x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={2}
        fill={cell?.on ? (track.colour ? css(track.colour, onCss) : onCss) : cellCss}
        opacity={track.muted ? 0.35 : (cell?.on ? Math.max(0.35, (cell.velocity ?? 100) / 127) : 1)}
      />
    {/each}
  {/each}

  {#each beats as step (step)}
    <line
      x1={geom.x0 + step * geom.cellW} y1={geom.y0}
      x2={geom.x0 + step * geom.cellW} y2={geom.y0 + geom.height}
      stroke={gridCss} stroke-width="1.5"
    />
  {/each}
</svg>

<style>
  .seq { display: block; overflow: visible; }
  text { font-family: inherit; pointer-events: none; user-select: none; }
</style>
