<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { macroSlots, macroValue } from '../utils/macroLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let m = $derived(getSection(control, 'Macro'));
  let slots = $derived(Array.isArray(m?.slots) ? m.slots : []);

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Macro.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }

  function setSlots(next) { set('slots', next); }
  function updateSlot(i, key, value) {
    setSlots(slots.map((s, idx) => idx === i ? { ...s, [key]: value } : s));
  }
  function addSlot() {
    setSlots([...slots, { id: `m${Date.now()}`, label: `Dest ${slots.length + 1}`, depth: 1, curve: 'linear', min: 0, max: 1, enabled: true }]);
  }
  function removeSlot(i) { setSlots(slots.filter((_, idx) => idx !== i)); }
  // Depth in percent (−100..100) ↔ −1..1.
  function depthPct(s) { return Math.round(num(s?.depth, 1) * 100); }
</script>

{#if m}
  <PropertySection title="Macro">
    <PropertyCell label="Position" span={2} hint="Knob value (0–1). Drag the knob in preview.">
      <input class="val" type="number" min="0" max="1" step="0.01" value={m.value ?? 0.5} onchange={(e) => set('value', Math.max(0, Math.min(1, num(e.target.value, 0.5))))} />
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Turn the knob in preview.">
      <PropertyToggle value={m.editable !== false} onchange={() => set('editable', !(m.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Lanes" span={1} hint="Show the assignment lanes beside the knob.">
      <PropertyToggle value={m.showLanes !== false} onchange={() => set('showLanes', !(m.showLanes !== false))} />
    </PropertyCell>
    <PropertyCell label="Label" span={3} hint="Caption above the knob.">
      <input class="val" type="text" value={m.label ?? ''} onchange={(e) => set('label', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Values" span={1} hint="Show live per-lane values.">
      <PropertyToggle value={m.showValues !== false} onchange={() => set('showValues', !(m.showValues !== false))} />
    </PropertyCell>
    <PropertyCell label="Divisions" span={1} hint="Draw value-scale ticks along each lane meter, using the same major/minor tick generator as the sliders.">
      <PropertyToggle value={m.showDivisions === true} onchange={() => set('showDivisions', !(m.showDivisions === true))} />
    </PropertyCell>
    {#if m.showDivisions === true}
      <PropertyCell label="Major" span={1} hint="Major tick count (same as a slider's Major Count).">
        <input class="val" type="number" min="2" max="21" step="1" value={m.majorTickCount ?? 5} onchange={(e) => set('majorTickCount', Math.max(2, Math.min(21, Math.round(num(e.target.value, 5)))))} />
      </PropertyCell>
      <PropertyCell label="Minor / gap" span={1} hint="Minor ticks between each pair of majors (same as a slider's Minor / Gap).">
        <input class="val" type="number" min="0" max="8" step="1" value={m.minorTickCount ?? 0} onchange={(e) => set('minorTickCount', Math.max(0, Math.min(8, Math.round(num(e.target.value, 0)))))} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Assignments">
    <PropertyCell label="" span={4} hint="Each row maps the macro to one bound parameter: depth (−100…+100%), curve, and output range.">
      <div class="slots">
        {#if slots.length === 0}
          <div class="empty">No assignments yet. Add one, then bind its port in Device Bindings.</div>
        {/if}
        {#each slots as s, i (s.id ?? i)}
          <div class="slot" class:off={s.enabled === false}>
            <div class="srow">
              <input class="val name" type="text" value={s.label ?? ''} placeholder="Destination" onchange={(e) => updateSlot(i, 'label', e.target.value)} />
              <label class="flag"><input type="checkbox" checked={s.enabled !== false} onchange={(e) => updateSlot(i, 'enabled', e.currentTarget.checked)} /><span>On</span></label>
              <button type="button" class="action-btn danger" onclick={() => removeSlot(i)} title="Remove">✕</button>
            </div>
            <div class="srow2">
              <label class="fld"><span>Depth</span>
                <input class="val" type="number" min="-100" max="100" step="5" value={depthPct(s)} onchange={(e) => updateSlot(i, 'depth', Math.max(-1, Math.min(1, num(e.target.value, 100) / 100)))} />
              </label>
              <label class="fld"><span>Curve</span>
                <select class="val" value={s.curve ?? 'linear'} onchange={(e) => updateSlot(i, 'curve', e.target.value)}>
                  <option value="linear">Linear</option>
                  <option value="exp">Exp</option>
                  <option value="log">Log</option>
                  <option value="scurve">S-curve</option>
                </select>
              </label>
              <label class="fld"><span>Min</span>
                <input class="val" type="number" min="0" max="1" step="0.05" value={s.min ?? 0} onchange={(e) => updateSlot(i, 'min', Math.max(0, Math.min(1, num(e.target.value, 0))))} />
              </label>
              <label class="fld"><span>Max</span>
                <input class="val" type="number" min="0" max="1" step="0.05" value={s.max ?? 1} onchange={(e) => updateSlot(i, 'max', Math.max(0, Math.min(1, num(e.target.value, 1))))} />
              </label>
            </div>
          </div>
        {/each}
        <button type="button" class="action-btn" onclick={addSlot}>Add Assignment</button>
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
  .slots { display: flex; flex-direction: column; gap: 8px; }
  .slot { border: 1px solid #303030; border-radius: 6px; background: #171717; padding: 8px; display: flex; flex-direction: column; gap: 7px; }
  .slot.off { opacity: 0.55; }
  .srow { display: flex; align-items: center; gap: 8px; }
  .srow .name { flex: 1 1 auto; }
  .srow2 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .fld { display: flex; flex-direction: column; gap: 3px; }
  .fld > span { font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: #8a8a8a; }
  .flag { display: inline-flex; align-items: center; gap: 5px; color: #B9B9B9; font-size: 11px; white-space: nowrap; }
  .empty { border: 1px dashed #3A3A3A; border-radius: 4px; color: #8A8A8A; font-size: 11px; padding: 8px; }
  .action-btn {
    background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD;
    font-size: 11px; padding: 4px 8px; cursor: pointer; align-self: flex-start;
  }
  .action-btn:hover { border-color: #5B9BD5; }
  .action-btn.danger { flex: 0 0 auto; padding: 3px 7px; }
  .action-btn.danger:hover { border-color: #C96A6A; }
</style>
