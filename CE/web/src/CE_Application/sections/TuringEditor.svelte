<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let tr = $derived(getSection(control, 'Turing'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Turing.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

  // Reseed / clear the register (a fresh random or a flat sequence).
  function reseed(random) {
    const len = Math.max(2, Math.min(64, Math.round(num(tr?.length, 8))));
    const steps = [];
    for (let i = 0; i < len; i += 1) steps.push(random ? Math.round(Math.random() * 100) / 100 : 0.5);
    set('steps', steps);
  }
  // Keep the stored register length in sync when the loop length changes.
  function setLength(len) {
    const n = Math.max(2, Math.min(64, Math.round(num(len, 8))));
    const cur = Array.isArray(tr?.steps) ? tr.steps : [];
    const steps = [];
    for (let i = 0; i < n; i += 1) steps.push(clamp01(num(cur[i], Math.round(Math.random() * 100) / 100)));
    set('length', n);
    set('steps', steps);
  }
  let rndPct = $derived(Math.round(clamp01(num(tr?.randomness, 0)) * 100));

  // Accent-colour swatches: the native picker edits RGB; we preserve each
  // colour's original alpha so faint elements keep their transparency.
  function colRgb(v, fb) { const s = String(v ?? fb).replace(/^#/, ''); return `#${s.length >= 6 ? s.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) { const s = String(cur ?? '').replace(/^#/, ''); const a = /^[0-9a-fA-F]{8}$/.test(s) ? s.slice(0, 2) : 'FF'; set(prop, `${a}${hex.replace('#', '').toUpperCase()}`); }
</script>

{#if tr}
  <PropertySection title="Turing Modulator">
    <PropertyCell label="Run" span={1} hint="Advance the sequence in preview / player.">
      <PropertyToggle value={tr.running !== false} onchange={() => set('running', !(tr.running !== false))} />
    </PropertyCell>
    <PropertyCell label="Rate" span={1} hint="Steps per second.">
      <input class="val" type="number" min="0.1" max="30" step="0.5" value={tr.rate ?? 2} onchange={(e) => set('rate', Math.max(0.1, num(e.target.value, 2)))} />
    </PropertyCell>
    <PropertyCell label="Length" span={2} hint="Loop length in steps (2–64).">
      <input class="val" type="number" min="2" max="64" step="1" value={tr.length ?? 8} onchange={(e) => setLength(e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Randomness" span={4} hint="0% = a locked loop (never changes); 100% = a new value every step (pure chaos); in between, the sequence slowly evolves. This is the Turing Machine's signature knob.">
      <div class="rangewrap">
        <input class="range" type="range" min="0" max="100" step="1" value={rndPct} oninput={(e) => set('randomness', num(e.target.value, 0) / 100)} />
        <span class="pctlbl">{rndPct === 0 ? 'locked' : rndPct === 100 ? 'chaos' : `${rndPct}%`}</span>
      </div>
    </PropertyCell>
    <PropertyCell label="Quantize" span={2} hint="Snap step values to N discrete levels (0 = continuous). Try 2 for on/off, 5 for a scale-like feel.">
      <input class="val" type="number" min="0" max="24" step="1" value={tr.quantizeLevels ?? 0} onchange={(e) => set('quantizeLevels', Math.max(0, Math.min(24, Math.round(num(e.target.value, 0)))))} />
    </PropertyCell>
    <PropertyCell label="Gate at" span={1} hint="The Gate port fires when a step's value is at/above this threshold.">
      <input class="val" type="number" min="0" max="1" step="0.05" value={tr.gateThreshold ?? 0.5} onchange={(e) => set('gateThreshold', clamp01(num(e.target.value, 0.5)))} />
    </PropertyCell>
    <PropertyCell label="Edit" span={1} hint="Drag the step bars in preview to seed the sequence.">
      <PropertyToggle value={tr.editable !== false} onchange={() => set('editable', !(tr.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Gate row" span={1} hint="Show the gate dots below the bars.">
      <PropertyToggle value={tr.showGate !== false} onchange={() => set('showGate', !(tr.showGate !== false))} />
    </PropertyCell>
    <PropertyCell label="Seed" span={3} hint="Regenerate the step values. Drag the bars in preview for a hand-drawn sequence.">
      <div class="btns">
        <button type="button" class="action-btn" onclick={() => reseed(true)}>Randomize</button>
        <button type="button" class="action-btn" onclick={() => reseed(false)}>Flatten</button>
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Bars" span={1} hint="Step value bar colour.">
      <input class="cswatch" type="color" value={colRgb(tr.barColour, 'FF39D98A')} onchange={(e) => setCol('barColour', tr.barColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Head" span={1} hint="The live (current) step colour.">
      <input class="cswatch" type="color" value={colRgb(tr.headColour, 'FFF2C94C')} onchange={(e) => setCol('headColour', tr.headColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Field" span={1} hint="Sequence background colour.">
      <input class="cswatch" type="color" value={colRgb(tr.fieldColour, 'FF0E0E13')} onchange={(e) => setCol('fieldColour', tr.fieldColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Labels" span={1} hint="Hint text colour.">
      <input class="cswatch" type="color" value={colRgb(tr.labelColour, 'FFB9B9B9')} onchange={(e) => setCol('labelColour', tr.labelColour, e.target.value)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Outputs">
    <PropertyCell label="" span={4} hint="Three bindable ports (fan-out): Value = the current step's level; Gate = 1 when the step is above the threshold; Inverse = 1 − Value. Bind them in Device Bindings.">
      <div class="ports">
        <span class="chip"><i style="background:#39D98A"></i>Value</span>
        <span class="chip"><i style="background:#F2C94C"></i>Gate</span>
        <span class="chip"><i style="background:#9B8AFF"></i>Inverse</span>
      </div>
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val {
    width: 100%; box-sizing: border-box; background: #1A1A1A; border: 1px solid #333;
    color: #DDD; border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none;
  }
  .val:focus { border-color: #5B9BD5; }
  .cswatch { width: 100%; height: 26px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .rangewrap { display: flex; align-items: center; gap: 10px; }
  .range { flex: 1 1 auto; accent-color: #39D98A; }
  .pctlbl { font-size: 11px; color: #B9B9B9; min-width: 48px; text-align: right; font-variant-numeric: tabular-nums; }
  .btns { display: flex; gap: 8px; }
  .ports { display: flex; gap: 10px; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #C8C8CE; }
  .chip i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .action-btn {
    background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD;
    font-size: 11px; padding: 4px 10px; cursor: pointer;
  }
  .action-btn:hover { border-color: #5B9BD5; }
</style>
