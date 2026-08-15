<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import TransportSyncCells from '../properties/TransportSyncCells.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import { DIVISION_IDS, DIVISION_LABELS } from '../utils/transportLayout.js';
  import Dices from 'lucide-svelte/icons/dices';
  import LogOut from 'lucide-svelte/icons/log-out';
  import Palette from 'lucide-svelte/icons/palette';

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
</script>

{#if tr}
  <PropertySection title="Turing Modulator" icon={Dices}>
    <PropertyCell label="Run" span={1} hint="Advance the sequence in preview / player.">
      <PropertyToggle value={tr.running !== false} onchange={() => set('running', !(tr.running !== false))} />
    </PropertyCell>
    <TransportSyncCells
      synced={tr.syncToTransport === true}
      onchange={(v) => set('syncToTransport', v)}
      span={1}
      hint="Clock the sequence off the panel's Transport."
    >
      {#snippet children()}
        <PropertyCell label="Division" span={2} hint="Step length in musical time.">
          <select class="val" value={String(tr.division ?? '1/8')} onchange={(e) => set('division', e.target.value)}>
            {#each DIVISION_IDS as d (d)}<option value={d}>{d} · {DIVISION_LABELS[d]}</option>{/each}
          </select>
        </PropertyCell>
      {/snippet}
    </TransportSyncCells>
    {#if tr.syncToTransport !== true}
      <PropertyCell label="Rate" span={1} hint="Steps per second.">
        <input class="val" type="number" min="0.1" max="30" step="0.5" value={tr.rate ?? 2} onchange={(e) => set('rate', Math.max(0.1, num(e.target.value, 2)))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Length" span={2} hint="Loop length in steps (2–64).">
      <input class="val" type="number" min="2" max="64" step="1" value={tr.length ?? 8} onchange={(e) => setLength(e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Randomness" span={4} hint="0% = a locked loop; 100% = a new value every step; in between, the sequence slowly evolves.">
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
    <PropertyCell label="Divisions" span={1} hint="Draw value-scale lines across the bars, using the same major/minor tick generator as the sliders.">
      <PropertyToggle value={tr.showDivisions === true} onchange={() => set('showDivisions', !(tr.showDivisions === true))} />
    </PropertyCell>
    {#if tr.showDivisions === true}
      <PropertyCell label="Major" span={1} hint="Major division lines across the value range (same as a slider's Major Count).">
        <input class="val" type="number" min="2" max="21" step="1" value={tr.majorTickCount ?? 5} onchange={(e) => set('majorTickCount', Math.max(2, Math.min(21, Math.round(num(e.target.value, 5)))))} />
      </PropertyCell>
      <PropertyCell label="Minor / gap" span={1} hint="Minor lines inserted between each pair of majors (same as a slider's Minor / Gap).">
        <input class="val" type="number" min="0" max="8" step="1" value={tr.minorTickCount ?? 0} onchange={(e) => set('minorTickCount', Math.max(0, Math.min(8, Math.round(num(e.target.value, 0)))))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Seed" span={3} hint="Regenerate the step values. Drag the bars in preview for a hand-drawn sequence.">
      <div class="btns">
        <button type="button" class="action-btn" onclick={() => reseed(true)}>Randomize</button>
        <button type="button" class="action-btn" onclick={() => reseed(false)}>Flatten</button>
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Colours" span={4} hint="Step bars, live head step, field background, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'barColour', label: 'Bars', value: tr.barColour ?? 'FF39D98A', target: { type: 'control', controlId: core?.id, path: 'Turing.barColour' } },
        { key: 'headColour', label: 'Head', value: tr.headColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'Turing.headColour' } },
        { key: 'fieldColour', label: 'Field', value: tr.fieldColour ?? 'FF0E0E13', target: { type: 'control', controlId: core?.id, path: 'Turing.fieldColour' } },
        { key: 'labelColour', label: 'Labels', value: tr.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Turing.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Outputs" icon={LogOut}>
    <PropertyCell label="" span={4} hint="Ports: Value = the current step's level; Gate = 1 above the threshold; Inverse = 1 − Value.">
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
