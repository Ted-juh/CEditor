<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import { envelopePreset, normalizePoints } from '../utils/envelopeLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let e = $derived(getSection(control, 'Envelope'));
  let points = $derived(Array.isArray(e?.points) ? e.points : []);

  let rangeSources = $derived(
    ($activePanel?.controls ?? [])
      .filter((c) => String(c?._children?.Behavior?.family ?? '').trim().toLowerCase() === 'range'
        && String(c?._children?.Core?.id ?? '') !== String(core?.id ?? ''))
      .map((c) => ({ id: String(c._children.Core.id), name: String(c._children.Core.name ?? c._children.Core.id) }))
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
  function addPoint() {
    const sorted = normalizePoints(points);
    // Insert at the widest gap so the new node is easy to grab.
    let gapAt = 1; let gap = -1;
    for (let i = 1; i < sorted.length; i += 1) {
      const g = sorted[i].x - sorted[i - 1].x;
      if (g > gap) { gap = g; gapAt = i; }
    }
    const x = (sorted[gapAt - 1].x + sorted[gapAt].x) / 2;
    const y = (sorted[gapAt - 1].y + sorted[gapAt].y) / 2;
    const next = [...sorted];
    next.splice(gapAt, 0, { id: `e${Date.now()}`, x, y, curve: sorted[gapAt].curve ?? 'linear', tension: 0 });
    setPoints(next);
  }
  function removePoint(i) {
    if (points.length <= 2 || i <= 0 || i >= points.length - 1) return;
    setPoints(points.filter((_, idx) => idx !== i));
  }

  function hexToInput(argb) {
    const s = String(argb ?? '').replace(/^#/, '');
    return /^[0-9a-fA-F]{8}$/.test(s) ? `#${s.slice(2)}` : (/^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : '#000000');
  }
  function inputToArgb(prev, hex) {
    const rgb = String(hex ?? '').replace(/^#/, '').toUpperCase();
    const alpha = /^[0-9a-fA-F]{8}$/.test(String(prev ?? '').replace(/^#/, '')) ? String(prev).replace(/^#/, '').slice(0, 2) : 'FF';
    return `${alpha}${rgb}`;
  }
</script>

{#if e}
  <PropertySection title="Envelope">
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

  <PropertySection title="Nodes">
    <PropertyCell label="" span={4} hint="Normalized position (0–1). Curve = the segment shape ending at that node.">
      <div class="nodes">
        {#each points as p, i (p.id ?? i)}
          <div class="nrow">
            <span class="nlabel">{i + 1}</span>
            <input class="val nnum" type="number" min="0" max="1" step="0.01" title="Time (x)" value={num(p.x, 0)} onchange={(ev) => updatePoint(i, 'x', Math.max(0, Math.min(1, num(ev.target.value, 0))))} />
            <input class="val nnum" type="number" min="0" max="1" step="0.01" title="Level (y)" value={num(p.y, 0)} onchange={(ev) => updatePoint(i, 'y', Math.max(0, Math.min(1, num(ev.target.value, 0))))} />
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
        <button type="button" class="action-btn" onclick={addPoint}>Add Node</button>
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Loop & snap">
    <PropertyCell label="Loop" span={2} hint="Cycle a section (function-generator / looping envelope).">
      <PropertyToggle value={e.loopEnabled === true} onchange={() => toggle('loopEnabled')} />
    </PropertyCell>
    {#if e.loopEnabled === true}
      <PropertyCell label="Loop start" span={1} hint="Node index the loop returns to.">
        <input class="val" type="number" min="0" value={e.loopStart ?? 0} onchange={(ev) => set('loopStart', Math.max(0, Math.round(num(ev.target.value, 0))))} />
      </PropertyCell>
      <PropertyCell label="Loop end" span={1} hint="Node index the loop repeats from.">
        <input class="val" type="number" min="0" value={e.loopEnd ?? 0} onchange={(ev) => set('loopEnd', Math.max(0, Math.round(num(ev.target.value, 0))))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Snap X" span={2} hint="Grid snap for time when dragging (0 = free).">
      <input class="val" type="number" min="0" max="1" step="0.05" value={e.snapX ?? 0} onchange={(ev) => set('snapX', Math.max(0, Math.min(1, num(ev.target.value, 0))))} />
    </PropertyCell>
    <PropertyCell label="Snap Y" span={2} hint="Grid snap for level when dragging (0 = free).">
      <input class="val" type="number" min="0" max="1" step="0.05" value={e.snapY ?? 0} onchange={(ev) => set('snapY', Math.max(0, Math.min(1, num(ev.target.value, 0))))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Playhead">
    <PropertyCell label="Show" span={2} hint="A moving dot along the curve at the current phase.">
      <PropertyToggle value={e.showPlayhead === true} onchange={() => toggle('showPlayhead')} />
    </PropertyCell>
    {#if e.showPlayhead === true}
      <PropertyCell label="Phase source" span={4} hint="A knob / slider whose 0–1 value drives the playhead in preview.">
        <select class="val" value={e.phaseSourceId ?? ''} onchange={(ev) => set('phaseSourceId', ev.target.value)}>
          <option value="">— Static phase —</option>
          {#each rangeSources as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
        </select>
      </PropertyCell>
      {#if !e.phaseSourceId}
        <PropertyCell label="Phase" span={2} hint="0–1 position of the playhead.">
          <input class="val" type="number" min="0" max="1" step="0.01" value={e.phase ?? 0} onchange={(ev) => set('phase', Math.max(0, Math.min(1, num(ev.target.value, 0))))} />
        </PropertyCell>
      {/if}
    {/if}
  </PropertySection>

  <PropertySection title="Style">
    <PropertyCell label="Grid" span={1} hint="Draw a background grid.">
      <PropertyToggle value={e.showGrid !== false} onchange={() => set('showGrid', !(e.showGrid !== false))} />
    </PropertyCell>
    <PropertyCell label="Cols" span={1} hint="Vertical grid divisions.">
      <input class="val" type="number" min="0" max="32" value={e.gridX ?? 4} onchange={(ev) => set('gridX', Math.max(0, Math.round(num(ev.target.value, 4))))} />
    </PropertyCell>
    <PropertyCell label="Rows" span={1} hint="Horizontal grid divisions.">
      <input class="val" type="number" min="0" max="32" value={e.gridY ?? 4} onchange={(ev) => set('gridY', Math.max(0, Math.round(num(ev.target.value, 4))))} />
    </PropertyCell>
    <PropertyCell label="Fill" span={1} hint="Shade the area under the curve.">
      <PropertyToggle value={e.fillUnder !== false} onchange={() => set('fillUnder', !(e.fillUnder !== false))} />
    </PropertyCell>
    <PropertyCell label="Line" span={2} hint="Curve line colour.">
      <input class="val color" type="color" value={hexToInput(e.lineColour)} onchange={(ev) => set('lineColour', inputToArgb(e.lineColour, ev.target.value))} />
    </PropertyCell>
    <PropertyCell label="Fill colour" span={2} hint="Area fill colour.">
      <input class="val color" type="color" value={hexToInput(e.fillColour)} onchange={(ev) => set('fillColour', inputToArgb(e.fillColour, ev.target.value))} />
    </PropertyCell>
    <PropertyCell label="Nodes" span={2} hint="Node handle colour.">
      <input class="val color" type="color" value={hexToInput(e.nodeColour)} onchange={(ev) => set('nodeColour', inputToArgb(e.nodeColour, ev.target.value))} />
    </PropertyCell>
    <PropertyCell label="Sustain" span={2} hint="Sustain marker + node colour.">
      <input class="val color" type="color" value={hexToInput(e.sustainColour)} onchange={(ev) => set('sustainColour', inputToArgb(e.sustainColour, ev.target.value))} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val {
    width: 100%; box-sizing: border-box; background: #1A1A1A; border: 1px solid #333;
    color: #DDD; border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none;
  }
  .val:focus { border-color: #5B9BD5; }
  .val.color { padding: 1px 2px; height: 24px; cursor: pointer; }
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
</style>
