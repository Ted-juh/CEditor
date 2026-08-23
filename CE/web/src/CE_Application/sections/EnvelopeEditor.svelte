<script>
  import { controlSources } from '../utils/controlSources.js';
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import {
    envelopePreset, normalizePoints, envelopePointAdded, envelopePointRemoved,
  } from '../utils/envelopeLayout.js';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import HeaderPill from '../properties/HeaderPill.svelte';
  import Spline from 'lucide-svelte/icons/spline';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import Repeat from 'lucide-svelte/icons/repeat';
  import Play from 'lucide-svelte/icons/play';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let e = $derived(getSection(control, 'Envelope'));
  let points = $derived(Array.isArray(e?.points) ? e.points : []);

  let rangeSources = $derived(
    controlSources($activePanel?.controls, 'range', core?.id)
  );

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Envelope.${prop}`, value);
  }
  function toggle(prop) { set(prop, !(e?.[prop] === true)); }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }

  function applyPreset(name) {
    const preset = envelopePreset(name);
    const pts = preset.points.map((p, i) => ({ id: `e${Date.now()}_${i}`, x: p.x, y: p.y, curve: p.curve ?? 'linear', tension: 0 }));
    set('points', pts);
    set('sustainIndex', preset.sustainIndex);
    set('preset', name);
  }
  function setPoints(next) { set('points', normalizePoints(next)); }
  function updatePoint(i, key, value) {
    setPoints(points.map((p, idx) => idx === i ? { ...p, [key]: value } : p));
  }
  // Both live in envelopeLayout.js so ce.components.envelope.insert()/.remove() make the same
  // shape decisions this button does — the widest-gap placement and the endpoints being fixed.
  function addPoint() { setPoints(envelopePointAdded(points)); }
  function removePoint(i) {
    const next = envelopePointRemoved(points, i);
    if (next) setPoints(next);
  }
</script>

{#if e}
  <PropertySection title="Envelope" icon={Spline}>
    <PropertyCell label="Preset" span={4} hint="Seed a shape. ADSR / AR / AD / DAHDSR keep stages; MSEG / Free let every node move.">
      <select class="val" value={e.preset ?? 'adsr'} onchange={(ev) => applyPreset(ev.target.value)}>
        <option value="adsr">ADSR</option>
        <option value="ar">AR (attack / release)</option>
        <option value="ad">AD (one-shot)</option>
        <option value="dahdsr">DAHDSR</option>
        <option value="mseg">MSEG (free multi-segment)</option>
        <option value="free">Free</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Sustain node" span={2} hint="Which node holds while a note is held (−1 = none).">
      <select class="val" value={String(e.sustainIndex ?? -1)} onchange={(ev) => set('sustainIndex', Math.round(num(ev.target.value, -1)))}>
        <option value="-1">None</option>
        {#each points as _, i (i)}<option value={String(i)}>Node {i + 1}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Editable" span={2} hint="Allow dragging / adding nodes in preview.">
      <PropertyToggle value={e.editable !== false} onchange={() => set('editable', !(e.editable !== false))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Nodes" icon={CircleDot}>
    {#snippet tools()}
      <button type="button" class="header-add-btn" title="Add node" onclick={addPoint}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="Normalized position (0–1). Curve = the segment shape ending at that node.">
      <div class="nodes">
        {#each points as p, i (p.id ?? i)}
          <div class="nrow">
            <span class="nlabel">{i + 1}</span>
            <span class="nnum nc-wrap" title="Time (x)"><NumberCell value={num(p.x, 0)} step={0.01} min={0} max={1} onchange={(v) => updatePoint(i, 'x', Math.max(0, Math.min(1, num(v, 0))))} /></span>
            <span class="nnum nc-wrap" title="Level (y)"><NumberCell value={num(p.y, 0)} step={0.01} min={0} max={1} onchange={(v) => updatePoint(i, 'y', Math.max(0, Math.min(1, num(v, 0))))} /></span>
            <select class="val ncurve" title="Segment curve" value={p.curve ?? 'linear'} onchange={(ev) => updatePoint(i, 'curve', ev.target.value)}>
              <option value="linear">Linear</option>
              <option value="exp">Exp</option>
              <option value="log">Log</option>
              <option value="scurve">S-curve</option>
              <option value="hold">Hold</option>
            </select>
            <button type="button" class="action-btn danger" disabled={i === 0 || i === points.length - 1} onclick={() => removePoint(i)} title="Remove node">✕</button>
          </div>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Loop & snap" icon={Repeat}>
    <PropertyCell label="Loop" span={2} hint="Cycle a section (function-generator / looping envelope).">
      <PropertyToggle value={e.loopEnabled === true} onchange={() => toggle('loopEnabled')} />
    </PropertyCell>
    {#if e.loopEnabled === true}
      <PropertyCell label="Loop start" span={1} compact hint="Node index the loop returns to.">
        <NumberCell label="Start" value={e.loopStart ?? 0} min={0} defaultValue={0} onchange={(v) => set('loopStart', Math.max(0, Math.round(num(v, 0))))} />
      </PropertyCell>
      <PropertyCell label="Loop end" span={1} compact hint="Node index the loop repeats from.">
        <NumberCell label="End" value={e.loopEnd ?? 0} min={0} defaultValue={0} onchange={(v) => set('loopEnd', Math.max(0, Math.round(num(v, 0))))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Snap X" span={2} compact hint="Grid snap for time when dragging (0 = free).">
      <NumberCell label="Snap X" value={e.snapX ?? 0} step={0.05} min={0} max={1} defaultValue={0} onchange={(v) => set('snapX', Math.max(0, Math.min(1, num(v, 0))))} />
    </PropertyCell>
    <PropertyCell label="Snap Y" span={2} compact hint="Grid snap for level when dragging (0 = free).">
      <NumberCell label="Snap Y" value={e.snapY ?? 0} step={0.05} min={0} max={1} defaultValue={0} onchange={(v) => set('snapY', Math.max(0, Math.min(1, num(v, 0))))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Playhead" icon={Play}>
    {#snippet tools()}
      <HeaderPill value={e.showPlayhead === true}
                  title="A moving dot along the curve at the current phase."
                  onchange={() => toggle('showPlayhead')} />
    {/snippet}
    {#if e.showPlayhead === true}
      <PropertyCell label="Phase source" span={4} hint="A knob / slider whose 0–1 value drives the playhead in preview.">
        <select class="val" value={e.phaseSourceId ?? ''} onchange={(ev) => set('phaseSourceId', ev.target.value)}>
          <option value="">— Static phase —</option>
          {#each rangeSources as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
        </select>
      </PropertyCell>
      {#if !e.phaseSourceId}
        <PropertyCell label="Phase" span={4} compact hint="0–1 position of the playhead.">
          <NumberCell label="Phase" value={e.phase ?? 0} step={0.01} min={0} max={1} defaultValue={0} onchange={(v) => set('phase', Math.max(0, Math.min(1, num(v, 0))))} />
        </PropertyCell>
      {/if}
    {/if}
  </PropertySection>

  <PropertySection title="Style" icon={Palette}>
    <PropertyCell label="Grid" span={1} hint="Draw a background grid.">
      <PropertyToggle value={e.showGrid !== false} onchange={() => set('showGrid', !(e.showGrid !== false))} />
    </PropertyCell>
    <PropertyCell label="Cols" span={1} compact hint="Vertical grid divisions.">
      <NumberCell label="Cols" value={e.gridX ?? 4} step={1} min={0} max={32} defaultValue={4} onchange={(v) => set('gridX', Math.max(0, Math.round(num(v, 4))))} />
    </PropertyCell>
    <PropertyCell label="Rows" span={1} compact hint="Horizontal grid divisions.">
      <NumberCell label="Rows" value={e.gridY ?? 4} step={1} min={0} max={32} defaultValue={4} onchange={(v) => set('gridY', Math.max(0, Math.round(num(v, 4))))} />
    </PropertyCell>
    <PropertyCell label="Fill" span={1} hint="Shade the area under the curve.">
      <PropertyToggle value={e.fillUnder !== false} onchange={() => set('fillUnder', !(e.fillUnder !== false))} />
    </PropertyCell>
    <PropertyCell label="Colours" span={4} hint="Curve line, area fill, node handles, sustain marker. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'lineColour', label: 'Line', value: e.lineColour, target: { type: 'control', controlId: core?.id, path: 'Envelope.lineColour' } },
        { key: 'fillColour', label: 'Fill', value: e.fillColour, target: { type: 'control', controlId: core?.id, path: 'Envelope.fillColour' } },
        { key: 'nodeColour', label: 'Nodes', value: e.nodeColour, target: { type: 'control', controlId: core?.id, path: 'Envelope.nodeColour' } },
        { key: 'sustainColour', label: 'Sustain', value: e.sustainColour, target: { type: 'control', controlId: core?.id, path: 'Envelope.sustainColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .nodes { display: flex; flex-direction: column; gap: 5px; }
  .nrow { display: flex; align-items: center; gap: 5px; }
  .nrow .nlabel { flex: 0 0 16px; color: #888; font-size: 11px; text-align: right; }
  .nrow .nnum { flex: 1 1 40px; min-width: 0; }
  .nrow .ncurve { flex: 1 1 70px; min-width: 0; }
  .action-btn {
    background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD;
    font-size: 11px; padding: 4px 8px; cursor: pointer; align-self: flex-start;
  }
  .action-btn:hover { border-color: #5B9BD5; }
  .action-btn.danger { flex: 0 0 auto; padding: 3px 7px; }
  .action-btn.danger:disabled { opacity: 0.35; cursor: default; }
  .action-btn.danger:not(:disabled):hover { border-color: #C96A6A; }
  .header-add-btn {
    height: 16px; padding: 0 8px; border-radius: 8px; border: 1px solid #333;
    background: #252525; color: #777; font-size: 9px; font-family: inherit;
    cursor: pointer; line-height: 1;
  }
  .header-add-btn:hover { color: #CCC; border-color: #4A6E8C; }
</style>
