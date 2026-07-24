<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { timbreAddressableCount } from '../utils/timbreLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let tb = $derived(getSection(control, 'Timbre'));
  let targets = $derived(Array.isArray(tb?.targets) ? tb.targets : []);
  let anchors = $derived(Array.isArray(tb?.anchors) ? tb.anchors : []);
  let addr = $derived(timbreAddressableCount(control));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Timbre.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }

  // Targets ------------------------------------------------------------------
  function setTargets(next) { set('targets', next); }
  function updateTarget(i, key, value) { setTargets(targets.map((t, idx) => idx === i ? { ...t, [key]: value } : t)); }
  function addTarget() { setTargets([...targets, { id: `t${Date.now()}`, label: `Target ${targets.length + 1}` }]); }
  function removeTarget(i) {
    const removed = targets[i];
    setTargets(targets.filter((_, idx) => idx !== i));
    // Drop the removed target's value from every anchor.
    if (removed?.id) setAnchors(anchors.map((a) => { const v = { ...(a.values ?? {}) }; delete v[removed.id]; return { ...a, values: v }; }));
  }

  // Anchors ------------------------------------------------------------------
  function setAnchors(next) { set('anchors', next); }
  function updateAnchor(i, key, value) { setAnchors(anchors.map((a, idx) => idx === i ? { ...a, [key]: value } : a)); }
  function updateAnchorValue(i, targetId, value) {
    setAnchors(anchors.map((a, idx) => idx === i ? { ...a, values: { ...(a.values ?? {}), [targetId]: value } } : a));
  }
  function addAnchor() {
    const values = {};
    for (const t of targets) values[t.id] = 0.5;
    setAnchors([...anchors, { id: `a${Date.now()}`, label: `Anchor ${anchors.length + 1}`, x: 0.5, y: 0.5, values }]);
  }
  function removeAnchor(i) { setAnchors(anchors.filter((_, idx) => idx !== i)); }
  function av(a, id) { return num(a?.values?.[id], 0); }
</script>

{#if tb}
  <PropertySection title="Timbre Space">
    <PropertyCell label="X axis" span={2} hint="Name the horizontal musical direction (e.g. dark → bright).">
      <input class="val" type="text" value={tb.axisX ?? ''} onchange={(e) => set('axisX', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Y axis" span={2} hint="Name the vertical musical direction (e.g. soft → aggressive).">
      <input class="val" type="text" value={tb.axisY ?? ''} onchange={(e) => set('axisY', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Blend" span={2} hint="Sharpness of the blend — higher makes the nearest anchor dominate sooner.">
      <input class="val" type="number" min="1" max="6" step="0.5" value={tb.power ?? 2} onchange={(e) => set('power', Math.max(1, Math.min(6, num(e.target.value, 2))))} />
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Drag the puck / anchors in preview.">
      <PropertyToggle value={tb.editable !== false} onchange={() => set('editable', !(tb.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Field" span={1} hint="Show the colour heat field.">
      <PropertyToggle value={tb.showField !== false} onchange={() => set('showField', !(tb.showField !== false))} />
    </PropertyCell>
    <PropertyCell label="Readout" span={2} hint="Show how many targets are actually MIDI-addressable (bound to a device parameter).">
      <PropertyToggle value={tb.showReadout !== false} onchange={() => set('showReadout', !(tb.showReadout !== false))} />
    </PropertyCell>
    {#if targets.length}
      <PropertyCell label="" span={2} hint="Bind each target's port in Device Bindings to make it drive a real parameter.">
        <div class="note" class:warn={addr.addressable < addr.total}>{addr.addressable} of {addr.total} targets are MIDI-addressable</div>
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Targets">
    <PropertyCell label="" span={4} hint="Each target is one parameter dimension the anchors morph. Every target is a bindable 'Target' port — bind it in Device Bindings.">
      <div class="rows">
        {#if targets.length === 0}<div class="empty">No targets yet. Add one, then bind its port.</div>{/if}
        {#each targets as t, i (t.id ?? i)}
          <div class="trow">
            <input class="val name" type="text" value={t.label ?? ''} placeholder="Target" onchange={(e) => updateTarget(i, 'label', e.target.value)} />
            <input class="swatch" type="color" value={`#${String(t.colour ?? 'FF39D98A').slice(-6)}`} onchange={(e) => updateTarget(i, 'colour', `FF${e.target.value.replace('#', '').toUpperCase()}`)} title="Colour" />
            <button type="button" class="action-btn danger" onclick={() => removeTarget(i)} title="Remove">✕</button>
          </div>
        {/each}
        <button type="button" class="action-btn" onclick={addTarget}>Add Target</button>
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Anchors">
    <PropertyCell label="" span={4} hint="Each anchor is a named patch placed on the pad (X/Y in 0–1), storing a value per target. The puck blends the anchors by distance — move it and the whole patch morphs toward the nearest anchors.">
      <div class="rows">
        {#if anchors.length === 0}<div class="empty">No anchors yet. Add one and set its per-target values.</div>{/if}
        {#each anchors as a, i (a.id ?? i)}
          <div class="anchor">
            <div class="arow">
              <input class="val name" type="text" value={a.label ?? ''} placeholder="Patch name" onchange={(e) => updateAnchor(i, 'label', e.target.value)} />
              <input class="swatch" type="color" value={`#${String(a.colour ?? 'FF5B9BD5').slice(-6)}`} onchange={(e) => updateAnchor(i, 'colour', `FF${e.target.value.replace('#', '').toUpperCase()}`)} title="Colour" />
              <button type="button" class="action-btn danger" onclick={() => removeAnchor(i)} title="Remove">✕</button>
            </div>
            <div class="arow2">
              <label class="fld"><span>X</span><input class="val" type="number" min="0" max="1" step="0.05" value={num(a.x, 0.5)} onchange={(e) => updateAnchor(i, 'x', Math.max(0, Math.min(1, num(e.target.value, 0.5))))} /></label>
              <label class="fld"><span>Y</span><input class="val" type="number" min="0" max="1" step="0.05" value={num(a.y, 0.5)} onchange={(e) => updateAnchor(i, 'y', Math.max(0, Math.min(1, num(e.target.value, 0.5))))} /></label>
            </div>
            {#if targets.length}
              <div class="grid">
                {#each targets as t (t.id)}
                  <label class="fld"><span>{t.label}</span>
                    <input class="val" type="number" min="0" max="1" step="0.05" value={av(a, t.id)} onchange={(e) => updateAnchorValue(i, t.id, Math.max(0, Math.min(1, num(e.target.value, 0))))} />
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
        <button type="button" class="action-btn" onclick={addAnchor}>Add Anchor</button>
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
  .rows { display: flex; flex-direction: column; gap: 8px; }
  .trow { display: flex; align-items: center; gap: 8px; }
  .trow .name { flex: 1 1 auto; }
  .anchor { border: 1px solid #303030; border-radius: 6px; background: #171717; padding: 8px; display: flex; flex-direction: column; gap: 7px; }
  .arow { display: flex; align-items: center; gap: 8px; }
  .arow .name { flex: 1 1 auto; }
  .arow2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; border-top: 1px solid #2a2a2a; padding-top: 7px; }
  .swatch { width: 26px; height: 24px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .fld { display: flex; flex-direction: column; gap: 3px; }
  .fld > span { font-size: 10px; letter-spacing: .03em; color: #8a8a8a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .note { font-size: 11px; color: #8a8a94; }
  .note.warn { color: #F2994A; }
  .empty { border: 1px dashed #3A3A3A; border-radius: 4px; color: #8A8A8A; font-size: 11px; padding: 8px; }
  .action-btn {
    background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD;
    font-size: 11px; padding: 4px 8px; cursor: pointer; align-self: flex-start;
  }
  .action-btn:hover { border-color: #5B9BD5; }
  .action-btn.danger { flex: 0 0 auto; padding: 3px 7px; }
  .action-btn.danger:hover { border-color: #C96A6A; }
</style>
