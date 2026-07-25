<script>
  // Transport — play button, tempo, and a bar.beat.tick readout with a beat
  // pulse. Visual only; the clock lives in stores/transport.js. Live state
  // arrives via Transport.__running / __beats / __bpm / __locked.
  import {
    transportConfig, transportBpm, transportSource, transportSignature,
    formatBarBeat, transportGeometry, transportButtonRect,
    TRANSPORT_SOURCE_LABELS,
  } from '../utils/transportLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  const PAD = 8;
  function css(hex, fallback = 'rgba(255,255,255,0.9)') {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      const a = parseInt(s.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) return `rgba(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},1)`;
    return fallback;
  }
  function n(v, f = 0) { const x = Number(v); return Number.isFinite(x) ? x : f; }

  let cfg = $derived(transportConfig(control));
  let geom = $derived(transportGeometry(width, height, PAD));
  let btn = $derived(transportButtonRect(geom));

  let running = $derived(cfg.__running === true);
  let beats = $derived(n(cfg.__beats, 0));
  let external = $derived(transportSource(control) === 'external');
  // Following an external clock, the tempo shown is the one being RECEIVED, not
  // the one configured — otherwise the readout quietly lies about the rig.
  let bpm = $derived(external ? n(cfg.__bpm, transportBpm(control)) : transportBpm(control));
  let locked = $derived(cfg.__locked === true);
  let sig = $derived(transportSignature(control));

  let faceCss = $derived(css(cfg.faceColour, 'rgba(20,20,32,1)'));
  let accentCss = $derived(css(cfg.accentColour, 'rgba(57,217,138,1)'));
  let beatCss = $derived(css(cfg.beatColour, 'rgba(242,201,76,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  // The pulse flashes on the beat, and harder on the downbeat, so you can read
  // the position without reading the numbers.
  let beatPhase = $derived(beats - Math.floor(beats));
  let onBeat = $derived(running && beatPhase < 0.18);
  let downbeat = $derived(Math.floor(beats) % Math.max(1, sig.beats) === 0);

  let showPosition = $derived(cfg.showPosition !== false && geom.w >= 150);
  let bpmSize = $derived(Math.max(13, Math.min(22, geom.h * 0.42)));
</script>

<svg class="transport" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <rect x={geom.x} y={geom.y} width={geom.w} height={geom.h} rx="6" fill={faceCss} stroke="rgba(42,42,54,1)" />

  <!-- play / stop -->
  <rect x={btn.x} y={btn.y} width={btn.w} height={btn.h} rx="6"
        fill={running ? accentCss : 'rgba(28,28,38,1)'} opacity={running ? 0.9 : 1}
        stroke={running ? accentCss : 'rgba(58,58,72,1)'} />
  {#if running}
    <rect x={btn.x + btn.w / 2 - 6} y={btn.y + btn.h / 2 - 6} width="4.5" height="12" rx="1" fill="#0b0b10" />
    <rect x={btn.x + btn.w / 2 + 1.5} y={btn.y + btn.h / 2 - 6} width="4.5" height="12" rx="1" fill="#0b0b10" />
  {:else}
    <path d={`M ${btn.x + btn.w / 2 - 4} ${btn.y + btn.h / 2 - 7} L ${btn.x + btn.w / 2 + 7} ${btn.y + btn.h / 2} L ${btn.x + btn.w / 2 - 4} ${btn.y + btn.h / 2 + 7} Z`}
          fill={accentCss} />
  {/if}

  <!-- tempo -->
  <text x={btn.x + btn.w + 12} y={geom.y + geom.h * 0.52} font-size={bpmSize}
        fill="rgba(232,232,238,1)" style="font-weight:700">{bpm.toFixed(1)}</text>
  <text x={btn.x + btn.w + 12} y={geom.y + geom.h - 8} font-size="8.5" fill={labelCss} opacity="0.75">
    BPM · {sig.beats}/{sig.unit}{external ? ` · ${locked ? 'EXT' : 'EXT · no clock'}` : ''}
  </text>

  <!-- position + beat pulse -->
  {#if showPosition}
    <text x={geom.x + geom.w - 10} y={geom.y + geom.h * 0.52} font-size={Math.max(11, bpmSize * 0.78)}
          fill={labelCss} text-anchor="end" style="font-weight:600">{formatBarBeat(beats, sig)}</text>
    <circle cx={geom.x + geom.w - 14} cy={geom.y + geom.h - 12} r={onBeat ? (downbeat ? 5 : 3.5) : 2.5}
            fill={onBeat ? beatCss : 'rgba(80,80,92,1)'} />
  {/if}

  <!-- external, unlocked: say so rather than showing a frozen readout -->
  {#if external && !locked}
    <rect x={geom.x} y={geom.y} width={geom.w} height={geom.h} rx="6" fill="none"
          stroke={beatCss} stroke-width="1" stroke-dasharray="3 3" opacity="0.7" />
  {/if}
</svg>

<style>
  .transport { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
