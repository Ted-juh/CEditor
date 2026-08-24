<script>
  import { get } from 'svelte/store';
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import { panelPreviewSessions } from '../stores/interactionPreview.js';
  import { isRangeBehavior, getRangeMin, getRangeMax, getCurrentRangeValue } from '../utils/rangeBehavior.js';
  import { timbreAddressableCount, captureAnchorValues } from '../utils/timbreLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import Blend from 'lucide-svelte/icons/blend';
  import Target from 'lucide-svelte/icons/target';
  import Anchor from 'lucide-svelte/icons/anchor';
  import Palette from 'lucide-svelte/icons/palette';

  import { componentListWithElement } from '../utils/componentElements.js';
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
  // Shared with ce.components.timbre.insert() — see componentElements.js. The anchor carries a
  // value per morph target, which is why the template is given the whole section.
  function addAnchor() { setAnchors(componentListWithElement('Timbre', 'anchors', anchors, tb)); }
  function removeAnchor(i) { setAnchors(anchors.filter((_, idx) => idx !== i)); }
  function av(a, id) { return num(a?.values?.[id], 0); }

  // --- Capture from patch ---------------------------------------------------
  // A { parameterId: normalizedValue } snapshot of the panel's current state:
  // every range control (slider/knob/number), normalized by its own range, keyed
  // by the device parameter(s) it's bound to. Prefers the live preview value.
  function currentParamValues() {
    const controls = $activePanel?.controls ?? [];
    const sessions = get(panelPreviewSessions) ?? {};
    const map = {};
    for (const c of controls) {
      const beh = c?._children?.Behavior;
      if (!isRangeBehavior(beh)) continue;
      const bindings = c?._children?.DeviceBindings?.bindings;
      if (!Array.isArray(bindings) || !bindings.length) continue;
      const id = String(c?._children?.Core?.id ?? '');
      const min = getRangeMin(beh);
      const max = getRangeMax(beh);
      const raw = getCurrentRangeValue(beh, sessions[id] ?? null);
      const norm = max > min ? Math.max(0, Math.min(1, (raw - min) / (max - min))) : 0;
      for (const b of bindings) {
        if (b?.kind === 'deviceParameter' && b?.parameterId) map[String(b.parameterId)] = norm;
      }
    }
    return map;
  }
  // How many targets could be captured right now (bound + a matching panel value).
  let capturable = $derived.by(() => {
    const vals = currentParamValues();
    return Object.keys(captureAnchorValues(control, vals)).length;
  });
  function captureAnchor(i) {
    const captured = captureAnchorValues(control, currentParamValues());
    if (!Object.keys(captured).length) return;
    setAnchors(anchors.map((a, idx) => idx === i ? { ...a, values: { ...(a.values ?? {}), ...captured } } : a));
  }

</script>

{#if tb}
  <PropertySection title="Timbre Space" icon={Blend}>
    <PropertyCell label="X axis" span={2} hint="Name the horizontal musical direction (e.g. dark → bright).">
      <input class="val" type="text" value={tb.axisX ?? ''} onchange={(e) => set('axisX', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Y axis" span={2} hint="Name the vertical musical direction (e.g. soft → aggressive).">
      <input class="val" type="text" value={tb.axisY ?? ''} onchange={(e) => set('axisY', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Blend" span={1} compact hint="Sharpness of the blend — higher makes the nearest anchor dominate sooner.">
      <NumberCell label="Blend" min={1} max={6} step={0.5} value={tb.power ?? 2} defaultValue={2} onchange={(v) => set('power', Math.max(1, Math.min(6, v)))} />
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Drag the puck / anchors in preview.">
      <PropertyToggle value={tb.editable !== false} onchange={() => set('editable', !(tb.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Field" span={1} hint="Show the colour heat field.">
      <PropertyToggle value={tb.showField !== false} onchange={() => set('showField', !(tb.showField !== false))} />
    </PropertyCell>
    <PropertyCell label="Readout" span={1} hint="Show how many targets are actually MIDI-addressable (bound to a device parameter).">
      <PropertyToggle value={tb.showReadout !== false} onchange={() => set('showReadout', !(tb.showReadout !== false))} />
    </PropertyCell>
    {#if targets.length}
      <PropertyCell label="" span={2} hint="Bind each target's port in Device Bindings to make it drive a real parameter." compact>
        <div class="note" class:warn={addr.addressable < addr.total}>{addr.addressable} of {addr.total} targets are MIDI-addressable</div>
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Colours" span={2} hint="Field background, blend puck, axis + anchor labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'fieldColour', label: 'Field', value: tb.fieldColour ?? 'FF0C0C12', target: { type: 'control', controlId: core?.id, path: 'Timbre.fieldColour' } },
        { key: 'puckColour', label: 'Puck', value: tb.puckColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'Timbre.puckColour' } },
        { key: 'labelColour', label: 'Labels', value: tb.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Timbre.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Targets" icon={Target}>
    {#snippet tools()}
      <button type="button" class="hdr-btn" title="Add target" onclick={addTarget}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="Each target is one parameter the anchors morph. Bind its 'Target' port in Device Bindings." compact>
      <div class="rows">
        {#if targets.length === 0}<div class="empty">No targets yet. Add one, then bind its port.</div>{/if}
        {#each targets as t, i (t.id ?? i)}
          <div class="trow">
            <input class="val name" type="text" value={t.label ?? ''} placeholder="Target" onchange={(e) => updateTarget(i, 'label', e.target.value)} />
            <SwatchCluster swatches={[
              { key: `targetColour_${t.id ?? i}`, label: 'Colour', value: t.colour ?? 'FF39D98A', target: { type: 'callback', apply: (hex) => updateTarget(i, 'colour', hex) } },
            ]} />
            <button type="button" class="action-btn danger" onclick={() => removeTarget(i)} title="Remove">✕</button>
          </div>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Anchors" icon={Anchor}>
    {#snippet tools()}
      <button type="button" class="hdr-btn" title="Add anchor" onclick={addAnchor}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="Each anchor is a named patch at X/Y (0–1) storing a value per target. Capture stamps the panel's current values." compact>
      <div class="rows">
        {#if anchors.length === 0}<div class="empty">No anchors yet. Add one and set its per-target values.</div>{/if}
        {#each anchors as a, i (a.id ?? i)}
          <div class="anchor">
            <div class="arow">
              <input class="val name" type="text" value={a.label ?? ''} placeholder="Patch name" onchange={(e) => updateAnchor(i, 'label', e.target.value)} />
              <SwatchCluster swatches={[
                { key: `anchorColour_${a.id ?? i}`, label: 'Colour', value: a.colour ?? 'FF5B9BD5', target: { type: 'callback', apply: (hex) => updateAnchor(i, 'colour', hex) } },
              ]} />
              <button type="button" class="action-btn" onclick={() => captureAnchor(i)} disabled={capturable === 0} title={capturable ? `Set this anchor's values from the panel's current bound controls (${capturable})` : 'Bind targets to device parameters that panel controls also drive, then capture'}>Capture</button>
              <button type="button" class="action-btn danger" onclick={() => removeAnchor(i)} title="Remove">✕</button>
            </div>
            <div class="arow2">
              <label class="fld"><span>X</span><NumberCell min={0} max={1} step={0.05} value={num(a.x, 0.5)} defaultValue={0.5} onchange={(v) => updateAnchor(i, 'x', Math.max(0, Math.min(1, v)))} /></label>
              <label class="fld"><span>Y</span><NumberCell min={0} max={1} step={0.05} value={num(a.y, 0.5)} defaultValue={0.5} onchange={(v) => updateAnchor(i, 'y', Math.max(0, Math.min(1, v)))} /></label>
            </div>
            {#if targets.length}
              <div class="grid">
                {#each targets as t (t.id)}
                  <label class="fld"><span>{t.label}</span>
                    <NumberCell min={0} max={1} step={0.05} value={av(a, t.id)} defaultValue={0} onchange={(v) => updateAnchorValue(i, t.id, Math.max(0, Math.min(1, v)))} />
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .rows { display: flex; flex-direction: column; gap: 8px; }
  .trow { display: flex; align-items: center; gap: 8px; }
  .trow .name { flex: 1 1 auto; }
  .anchor { border: 1px solid #303030; border-radius: 6px; background: #171717; padding: 8px; display: flex; flex-direction: column; gap: 7px; }
  .arow { display: flex; align-items: center; gap: 8px; }
  .arow .name { flex: 1 1 auto; }
  .arow2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; border-top: 1px solid #2a2a2a; padding-top: 7px; }
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
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; border-color: #3B3B3B; }
  .action-btn.danger { flex: 0 0 auto; padding: 3px 7px; }
  .action-btn.danger:hover { border-color: #C96A6A; }
  .hdr-btn {
    height: 16px; font-size: 9px; padding: 0 8px; border-radius: 8px;
    background: #252525; border: 1px solid #333; color: #777;
    font-family: inherit; cursor: pointer; line-height: 1;
  }
  .hdr-btn:hover { border-color: #4A6E8C; color: #CCC; }
</style>
