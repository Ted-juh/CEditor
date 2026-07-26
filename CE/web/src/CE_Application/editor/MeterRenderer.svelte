<script>
  // Meter — a read-only, value-driven level meter. Draws a horizontal / vertical
  // bar or an arc, as a continuous fill or discrete LED segments, coloured by
  // threshold zones, with an optional peak-hold marker, scale ticks and a
  // numeric readout. Visual only; the live value + peak are injected by the
  // preview surface onto the Meter section (Meter.__value / Meter.__peak).
  import {
    meterConfig, meterPosition, meterZones, meterZoneColourAt,
    meterSegmentsLit, meterSegmentCenter, meterTicks,
    meterArcPath, meterArcAngle, meterPolar,
  } from '../utils/meterLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  function css(hex, fallback = 'rgba(255,255,255,0.9)') {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      const a = parseInt(s.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) {
      return `rgba(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},1)`;
    }
    return fallback;
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }

  let cfg = $derived(meterConfig(control));
  let value = $derived(cfg.__value !== undefined ? cfg.__value : cfg.value);
  let pos = $derived(meterPosition(value, cfg));
  let peak = $derived(cfg.__peak); // normalized 0..1, or undefined in static editor view
  let orientation = $derived(String(cfg.orientation ?? 'horizontal'));
  let vertical = $derived(orientation === 'vertical');
  let arc = $derived(orientation === 'arc');
  let segments = $derived(Math.max(0, Math.round(num(cfg.segments, 0))));
  let trackCss = $derived(css(cfg.trackColour, 'rgba(20,20,20,1)'));
  let peakCss = $derived(css(cfg.peakColour, 'rgba(242,242,242,1)'));
  let zones = $derived(meterZones(cfg));

  // A CSS gradient across the FULL track (colours are absolute positions), so a
  // clipped window 0..pos reveals the right hues. Hard steps unless `gradient`.
  let gradientCss = $derived.by(() => {
    const dir = vertical ? 'to top' : 'to right';
    if (zones.length === 1) return css(zones[0].colour);
    const stops = [];
    for (let i = 0; i < zones.length; i += 1) {
      const c = css(zones[i].colour);
      const at = Math.round(zones[i].from * 100);
      if (cfg.gradient === false && i > 0) stops.push(`${css(zones[i - 1].colour)} ${at}%`);
      stops.push(`${c} ${at}%`);
    }
    return `linear-gradient(${dir}, ${stops.join(', ')})`;
  });

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let textCss = $derived(css(control?._children?.Text?._children?.Fill?.colour, 'rgba(220,220,220,0.9)'));
  let fontFamily = $derived(String(font?.family ?? 'Arial'));
  let fontSize = $derived(Math.max(7, num(font?.size, 11)));

  let readout = $derived.by(() => {
    if (cfg.showValue !== true) return '';
    const p = Math.max(0, Math.round(num(cfg.valuePrecision, 0)));
    return `${cfg.valuePrefix ?? ''}${num(value, 0).toFixed(p)}${cfg.valueSuffix ?? ''}`;
  });
  let ticks = $derived(cfg.showTicks === true ? meterTicks(cfg, cfg.tickCount) : []);

  // Arc geometry (viewBox-local).
  let arcGeo = $derived.by(() => {
    if (!arc) return null;
    const w = Math.max(1, width), h = Math.max(1, height);
    const cx = w / 2;
    const stroke = num(cfg.thickness, 0) > 0 ? num(cfg.thickness, 0) : Math.max(6, Math.min(w, h) * 0.16);
    const r = Math.max(2, Math.min(w, h * 1.6) / 2 - stroke / 2 - 2);
    const cy = Math.min(h - stroke / 2 - 2, h * 0.72);
    return { cx, cy, r, stroke };
  });
</script>

<div class="meter" class:vertical style={`width:${width}px; height:${height}px; color:${textCss}; font-family:${fontFamily}; font-size:${fontSize}px;`}>
  {#if cfg.label && cfg.labelPosition === 'above'}<div class="meter-label">{cfg.label}</div>{/if}

  <div class="meter-body">
    {#if arc}
      <svg class="meter-arc" viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} preserveAspectRatio="xMidYMid meet">
        <path d={meterArcPath(arcGeo.cx, arcGeo.cy, arcGeo.r, 0, 1, cfg.arcStart, cfg.arcSweep)}
              fill="none" stroke={trackCss} stroke-width={arcGeo.stroke} stroke-linecap="round" />
        {#if pos > 0}
          <path d={meterArcPath(arcGeo.cx, arcGeo.cy, arcGeo.r, 0, pos, cfg.arcStart, cfg.arcSweep)}
                fill="none" stroke={css(meterZoneColourAt(pos, cfg))} stroke-width={arcGeo.stroke} stroke-linecap="round" />
        {/if}
        {#if cfg.peakHold === true && peak !== undefined && peak > 0}
          {@const pa = (meterArcAngle(peak, cfg.arcStart, cfg.arcSweep))}
          {@const p1 = meterPolar(arcGeo.cx, arcGeo.cy, arcGeo.r - arcGeo.stroke / 2, pa)}
          {@const p2 = meterPolar(arcGeo.cx, arcGeo.cy, arcGeo.r + arcGeo.stroke / 2, pa)}
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={peakCss} stroke-width="2" />
        {/if}
      </svg>
      {#if readout}<div class="meter-readout arc-readout">{readout}</div>{/if}
    {:else if segments > 0}
      {@const lit = meterSegmentsLit(pos, segments)}
      {@const peakSeg = cfg.peakHold === true && peak !== undefined ? meterSegmentsLit(peak, segments) : -1}
      <div class="meter-segments" style={`gap:${num(cfg.segmentGap, 2)}px;`}>
        {#each Array(segments) as _, i (i)}
          {@const idx = vertical ? segments - 1 - i : i}
          <div class="seg"
               class:lit={idx < lit}
               class:peak={idx === peakSeg - 1 && idx >= lit}
               style={`background:${idx < lit ? css(meterZoneColourAt(meterSegmentCenter(idx, segments), cfg)) : trackCss}; border-radius:${num(cfg.rounded, 3)}px;`}></div>
        {/each}
      </div>
    {:else}
      <div class="meter-track" style={`background:${trackCss}; border-radius:${num(cfg.rounded, 3)}px;`}>
        <div class="meter-clip" style={vertical ? `height:${pos * 100}%;` : `width:${pos * 100}%;`}>
          <div class="meter-fill" style={`${vertical ? `height:${height}px; width:100%` : `width:${width}px; height:100%`}; background:${gradientCss}; border-radius:${num(cfg.rounded, 3)}px;`}></div>
        </div>
        {#if cfg.peakHold === true && peak !== undefined && peak > 0}
          <div class="meter-peak" style={vertical ? `bottom:${peak * 100}%; background:${peakCss};` : `left:${peak * 100}%; background:${peakCss};`}></div>
        {/if}
        {#if ticks.length}
          {#each ticks as t (t.pos)}
            <div class="meter-tick" style={vertical ? `bottom:${t.pos * 100}%;` : `left:${t.pos * 100}%;`}></div>
          {/each}
        {/if}
      </div>
      {#if readout}<div class="meter-readout" class:vert={vertical}>{readout}</div>{/if}
    {/if}
  </div>

  {#if cfg.label && cfg.labelPosition === 'below'}<div class="meter-label">{cfg.label}</div>{/if}
</div>

<style>
  .meter {
    position: absolute; inset: 0; box-sizing: border-box;
    display: flex; flex-direction: column; gap: 3px; padding: 4px;
    pointer-events: none; overflow: hidden;
  }
  .meter-body { position: relative; flex: 1 1 auto; min-height: 0; display: flex; }
  .meter-label { flex: 0 0 auto; font-size: 0.82em; opacity: 0.75; text-align: center; white-space: nowrap; overflow: hidden; }

  .meter-track { position: relative; flex: 1 1 auto; align-self: stretch; overflow: hidden; }
  .meter-clip { position: absolute; left: 0; bottom: 0; top: 0; overflow: hidden; }
  .meter.vertical .meter-clip { top: auto; right: 0; width: 100%; }
  .meter-fill { position: absolute; left: 0; bottom: 0; }
  .meter-peak { position: absolute; }
  .meter:not(.vertical) .meter-peak { top: 0; bottom: 0; width: 2px; transform: translateX(-1px); }
  .meter.vertical .meter-peak { left: 0; right: 0; height: 2px; transform: translateY(1px); }
  .meter-tick { position: absolute; background: rgba(255,255,255,0.18); }
  .meter:not(.vertical) .meter-tick { top: 0; bottom: 0; width: 1px; }
  .meter.vertical .meter-tick { left: 0; right: 0; height: 1px; }

  .meter-segments { position: relative; flex: 1 1 auto; align-self: stretch; display: flex; }
  .meter:not(.vertical) .meter-segments { flex-direction: row; }
  .meter.vertical .meter-segments { flex-direction: column; }
  .seg { flex: 1 1 0; min-width: 0; min-height: 0; transition: background 60ms linear; }
  .seg.peak { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.8); }

  .meter-readout {
    position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
    font-variant-numeric: tabular-nums; font-size: 0.9em; opacity: 0.92;
    text-shadow: 0 1px 2px rgba(0,0,0,0.6); pointer-events: none;
  }
  .meter-readout.vert { top: 4px; right: 50%; transform: translateX(50%); }
  .meter-arc { width: 100%; height: 100%; display: block; }
  .arc-readout { position: absolute; left: 0; right: 0; bottom: 6px; top: auto; transform: none; text-align: center; }
</style>
