<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let k = $derived(getSection(control, 'Kinetic'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Kinetic.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function pct(v, f = 0) { return Math.round(num(v, f) * 100); }

  // Reset the ball to a fresh start (a random-ish throw from mid-box).
  function reset() {
    set('initial', { x: 0.5, y: 0.72, vx: (Math.round(Math.random() * 140) - 70) / 100, vy: Math.round(Math.random() * 60) / 100 });
  }

  // Accent-colour swatches: the picker edits RGB; we preserve each colour's alpha.
  function colRgb(v, fb) { const s = String(v ?? fb).replace(/^#/, ''); return `#${s.length >= 6 ? s.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) { const s = String(cur ?? '').replace(/^#/, ''); const a = /^[0-9a-fA-F]{8}$/.test(s) ? s.slice(0, 2) : 'FF'; set(prop, `${a}${hex.replace('#', '').toUpperCase()}`); }
</script>

{#if k}
  <PropertySection title="Kinetic">
    <PropertyCell label="Run" span={1} hint="Integrate the physics in preview / player.">
      <PropertyToggle value={k.running !== false} onchange={() => set('running', !(k.running !== false))} />
    </PropertyCell>
    <PropertyCell label="Fling" span={1} hint="Drag the ball to throw it in preview.">
      <PropertyToggle value={k.editable !== false} onchange={() => set('editable', !(k.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Reset" span={2} hint="Drop the ball back to a fresh start.">
      <button type="button" class="action-btn" onclick={reset}>Reset ball</button>
    </PropertyCell>
    <PropertyCell label="Gravity" span={4} hint="Downward pull. 0 = zero-g (the ball drifts and bounces like a billiard); higher = it falls and settles unless the bounce is high.">
      <div class="rangewrap"><input class="range" type="range" min="0" max="4" step="0.05" value={num(k.gravity, 0)} oninput={(e) => set('gravity', num(e.target.value, 0))} /><span class="lbl">{num(k.gravity, 0).toFixed(2)}</span></div>
    </PropertyCell>
    <PropertyCell label="Bounce" span={4} hint="Wall restitution — energy kept on each bounce. 100% = perpetual motion; lower = the ball loses energy and slows.">
      <div class="rangewrap"><input class="range" type="range" min="0" max="100" step="1" value={pct(k.restitution, 0.92)} oninput={(e) => set('restitution', num(e.target.value, 92) / 100)} /><span class="lbl">{pct(k.restitution, 0.92)}%</span></div>
    </PropertyCell>
    <PropertyCell label="Drag" span={4} hint="Air resistance — how quickly the ball loses speed over time (0 = frictionless).">
      <div class="rangewrap"><input class="range" type="range" min="0" max="1" step="0.01" value={num(k.friction, 0.04)} oninput={(e) => set('friction', num(e.target.value, 0.04))} /><span class="lbl">{num(k.friction, 0.04).toFixed(2)}</span></div>
    </PropertyCell>
    <PropertyCell label="Keep alive" span={4} hint="When the ball nearly stalls, give it a random kick this strong to keep it moving. 0 = let it settle.">
      <div class="rangewrap"><input class="range" type="range" min="0" max="100" step="1" value={pct(k.keepAlive, 0.35)} oninput={(e) => set('keepAlive', num(e.target.value, 35) / 100)} /><span class="lbl">{pct(k.keepAlive, 0.35)}%</span></div>
    </PropertyCell>
    <PropertyCell label="Trail" span={1} hint="Comet trail behind the ball.">
      <PropertyToggle value={k.showTrail !== false} onchange={() => set('showTrail', !(k.showTrail !== false))} />
    </PropertyCell>
    <PropertyCell label="Walls" span={1} hint="Draw the box walls.">
      <PropertyToggle value={k.showWalls !== false} onchange={() => set('showWalls', !(k.showWalls !== false))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Field" span={1} hint="Box background colour.">
      <input class="cswatch" type="color" value={colRgb(k.fieldColour, 'FF0D0D12')} onchange={(e) => setCol('fieldColour', k.fieldColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Ball" span={1} hint="Ball + trail colour.">
      <input class="cswatch" type="color" value={colRgb(k.ballColour, 'FF39D98A')} onchange={(e) => { setCol('ballColour', k.ballColour, e.target.value); setCol('trailColour', k.trailColour, e.target.value); }} />
    </PropertyCell>
    <PropertyCell label="Walls" span={1} hint="Wall colour (stays faint — its transparency is kept).">
      <input class="cswatch" type="color" value={colRgb(k.wallColour, 'FF2A6BA8')} onchange={(e) => setCol('wallColour', k.wallColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Labels" span={1} hint="Hint colour.">
      <input class="cswatch" type="color" value={colRgb(k.labelColour, 'FFB9B9B9')} onchange={(e) => setCol('labelColour', k.labelColour, e.target.value)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Outputs">
    <PropertyCell label="" span={4} hint="Four bindable ports (fan-out): X / Y position, Speed (velocity magnitude), and a Bounce gate that pulses on each wall hit. Bind them in Device Bindings.">
      <div class="ports">
        <span class="chip"><i style="background:#39D98A"></i>X</span>
        <span class="chip"><i style="background:#5B9BD5"></i>Y</span>
        <span class="chip"><i style="background:#F2994A"></i>Speed</span>
        <span class="chip"><i style="background:#F2C94C"></i>Bounce</span>
      </div>
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .rangewrap { display: flex; align-items: center; gap: 10px; }
  .range { flex: 1 1 auto; accent-color: #39D98A; }
  .lbl { font-size: 11px; color: #B9B9B9; min-width: 42px; text-align: right; font-variant-numeric: tabular-nums; }
  .cswatch { width: 100%; height: 26px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .ports { display: flex; gap: 10px; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #C8C8CE; }
  .chip i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .action-btn {
    background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD;
    font-size: 11px; padding: 4px 10px; cursor: pointer; align-self: flex-start;
  }
  .action-btn:hover { border-color: #5B9BD5; }
</style>
