<script>
  import { get } from 'svelte/store';
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import { panelPreviewSessions } from '../stores/interactionPreview.js';
  import { isRangeBehavior, getRangeMin, getRangeMax, getCurrentRangeValue } from '../utils/rangeBehavior.js';
  import { autoArrange, captureConstellationValues } from '../utils/constellationLayout.js';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import TransportSyncCells from '../properties/TransportSyncCells.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import { MIN_BARS, MAX_BARS } from '../utils/transportLayout.js';
  import Waypoints from 'lucide-svelte/icons/waypoints';
  import Palette from 'lucide-svelte/icons/palette';
  import Target from 'lucide-svelte/icons/target';
  import Bookmark from 'lucide-svelte/icons/bookmark';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let cn = $derived(getSection(control, 'Constellation'));
  let targets = $derived(Array.isArray(cn?.targets) ? cn.targets : []);
  let presets = $derived(Array.isArray(cn?.presets) ? cn.presets : []);

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Constellation.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

  // Targets ------------------------------------------------------------------
  function setTargets(next) { set('targets', next); }
  function updateTarget(i, key, value) { setTargets(targets.map((t, idx) => idx === i ? { ...t, [key]: value } : t)); }
  function addTarget() { setTargets([...targets, { id: `t${Date.now()}`, label: `Target ${targets.length + 1}` }]); }
  function removeTarget(i) {
    const removed = targets[i];
    setTargets(targets.filter((_, idx) => idx !== i));
    if (removed?.id) setPresets(presets.map((p) => { const v = { ...(p.values ?? {}) }; delete v[removed.id]; return { ...p, values: v }; }));
  }

  // Presets ------------------------------------------------------------------
  function setPresets(next) { set('presets', next); }
  function updatePreset(i, key, value) { setPresets(presets.map((p, idx) => idx === i ? { ...p, [key]: value } : p)); }
  function updatePresetValue(i, targetId, value) {
    setPresets(presets.map((p, idx) => idx === i ? { ...p, values: { ...(p.values ?? {}), [targetId]: value } } : p));
  }
  function addPreset() {
    const values = {};
    for (const t of targets) values[t.id] = 0.5;
    setPresets([...presets, { id: `s${Date.now()}`, label: `Preset ${presets.length + 1}`, x: 0.5, y: 0.5, values }]);
  }
  function removePreset(i) { setPresets(presets.filter((_, idx) => idx !== i)); }
  function pv(p, id) { return num(p?.values?.[id], 0); }
  function arrange() { setPresets(autoArrange(control)); }

  // Capture-from-patch (shared with Timbre): the panel's current bound values.
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
      const min = getRangeMin(beh); const max = getRangeMax(beh);
      const raw = getCurrentRangeValue(beh, sessions[id] ?? null);
      const norm = max > min ? clamp01((raw - min) / (max - min)) : 0;
      for (const b of bindings) if (b?.kind === 'deviceParameter' && b?.parameterId) map[String(b.parameterId)] = norm;
    }
    return map;
  }
  // How many targets could be captured right now (bound + a matching panel value).
  let capturable = $derived.by(() => Object.keys(captureConstellationValues(control, currentParamValues())).length);
  function capturePreset(i) {
    const captured = captureConstellationValues(control, currentParamValues());
    if (!Object.keys(captured).length) return;
    setPresets(presets.map((p, idx) => idx === i ? { ...p, values: { ...(p.values ?? {}), ...captured } } : p));
  }
</script>

{#if cn}
  <PropertySection title="Constellation" icon={Waypoints}>
    <PropertyCell label="Mode" span={2} hint="Snap = recall the nearest preset exactly (discrete). Blend = morph between nearby presets by distance (continuous).">
      <select class="val" value={cn.mode ?? 'blend'} onchange={(e) => set('mode', e.target.value)}>
        <option value="blend">Blend (morph)</option>
        <option value="snap">Snap (recall)</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Drag the probe / stars in preview.">
      <PropertyToggle value={cn.editable !== false} onchange={() => set('editable', !(cn.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Wander" span={1} hint="Auto-drift the probe through the map on the clock.">
      <PropertyToggle value={cn.running === true} onchange={() => set('running', !(cn.running === true))} />
    </PropertyCell>
    {#if cn.running === true}
      <TransportSyncCells
        synced={cn.syncToTransport === true}
        onchange={(v) => set('syncToTransport', v)}
        span={2}
        hint="How many bars one full wander cycle takes."
      >
        {#snippet children()}
          <PropertyCell label="Wander (bars)" span={1} compact hint="How many bars one full pass through the map takes.">
            <NumberCell label="Bars" value={cn.wanderBars ?? 8} step={1} min={MIN_BARS} max={MAX_BARS} defaultValue={8} onchange={(v) => set('wanderBars', Math.max(MIN_BARS, Math.min(MAX_BARS, num(v, 8))))} />
          </PropertyCell>
        {/snippet}
      </TransportSyncCells>
      {#if cn.syncToTransport !== true}
        <PropertyCell label="Wander rate" span={1} compact hint="Wander speed (cycles per second).">
          <NumberCell label="Rate" value={cn.wanderRate ?? 0.08} step={0.01} min={0.01} max={2} defaultValue={0.08} onchange={(v) => set('wanderRate', Math.max(0.01, num(v, 0.08)))} />
        </PropertyCell>
      {/if}
    {/if}
    {#if String(cn.mode ?? 'blend') === 'blend'}
      <PropertyCell label="Blend" span={1} compact hint="Morph sharpness — higher makes the nearest preset dominate sooner.">
        <NumberCell label="Blend" value={cn.blendPower ?? 2} step={0.5} min={1} max={6} defaultValue={2} onchange={(v) => set('blendPower', Math.max(1, Math.min(6, num(v, 2))))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Links" span={1} hint="Draw constellation lines between sonically-similar presets.">
      <PropertyToggle value={cn.showLinks !== false} onchange={() => set('showLinks', !(cn.showLinks !== false))} />
    </PropertyCell>
    {#if cn.showLinks !== false}
      <PropertyCell label="Neighbours" span={1} compact hint="How many nearest neighbours each preset links to.">
        <NumberCell label="Count" value={cn.linkCount ?? 2} step={1} min={1} max={6} defaultValue={2} onchange={(v) => set('linkCount', Math.max(1, Math.min(6, Math.round(num(v, 2)))))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Labels" span={1} hint="Show preset names.">
      <PropertyToggle value={cn.showLabels !== false} onchange={() => set('showLabels', !(cn.showLabels !== false))} />
    </PropertyCell>
    <PropertyCell label="Arrange" span={2} hint="Lay the presets out by sonic similarity (a best-effort 2D projection of their patches). Similar sounds cluster together.">
      <button type="button" class="action-btn" onclick={arrange} disabled={presets.length < 2}>Auto-arrange</button>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Colours" span={4} hint="Map background, probe, links, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'fieldColour', label: 'Field', value: cn.fieldColour ?? 'FF0C0C12', target: { type: 'control', controlId: core?.id, path: 'Constellation.fieldColour' } },
        { key: 'probeColour', label: 'Probe', value: cn.probeColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'Constellation.probeColour' } },
        { key: 'linkColour', label: 'Links', value: cn.linkColour ?? 'FF2A6BA8', target: { type: 'control', controlId: core?.id, path: 'Constellation.linkColour' } },
        { key: 'labelColour', label: 'Labels', value: cn.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Constellation.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Targets" icon={Target}>
    {#snippet tools()}
      <button type="button" class="header-add-btn" title="Add target" onclick={addTarget}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="Each target is one parameter the presets morph. Bind its 'Target' port in Device Bindings." compact>
      <div class="rows">
        {#if targets.length === 0}<div class="empty">No targets yet. Add one, then bind its port.</div>{/if}
        {#each targets as t, i (t.id ?? i)}
          <div class="trow">
            <input class="val name" type="text" value={t.label ?? ''} placeholder="Target" onchange={(e) => updateTarget(i, 'label', e.target.value)} />
            <span class="clus">
              <SwatchCluster swatches={[
                { key: `target-${t.id ?? i}`, label: 'Colour', value: t.colour ?? 'FF39D98A', target: { type: 'callback', apply: (hex) => updateTarget(i, 'colour', hex) } },
              ]} />
            </span>
            <button type="button" class="action-btn danger" onclick={() => removeTarget(i)} title="Remove">✕</button>
          </div>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Presets" icon={Bookmark}>
    {#snippet tools()}
      <button type="button" class="header-add-btn" title="Add preset" onclick={addPreset}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="Each preset is a star at X/Y (0–1) storing a value per target. Capture stamps the panel's current values." compact>
      <div class="rows">
        {#if presets.length === 0}<div class="empty">No presets yet. Add one and set its per-target values.</div>{/if}
        {#each presets as p, i (p.id ?? i)}
          <div class="preset">
            <div class="prow">
              <input class="val name" type="text" value={p.label ?? ''} placeholder="Preset name" onchange={(e) => updatePreset(i, 'label', e.target.value)} />
              <span class="clus">
                <SwatchCluster swatches={[
                  { key: `preset-${p.id ?? i}`, label: 'Colour', value: p.colour ?? 'FF5B9BD5', target: { type: 'callback', apply: (hex) => updatePreset(i, 'colour', hex) } },
                ]} />
              </span>
              <button type="button" class="action-btn" onclick={() => capturePreset(i)} disabled={capturable === 0} title={capturable ? `Set from the panel's current bound controls (${capturable})` : 'Bind targets to parameters that panel controls drive, then capture'}>Capture</button>
              <button type="button" class="action-btn danger" onclick={() => removePreset(i)} title="Remove">✕</button>
            </div>
            <div class="prow2">
              <label class="fld"><span>X</span><span class="nc-wrap"><NumberCell value={num(p.x, 0.5)} step={0.05} min={0} max={1} onchange={(v) => updatePreset(i, 'x', clamp01(num(v, 0.5)))} /></span></label>
              <label class="fld"><span>Y</span><span class="nc-wrap"><NumberCell value={num(p.y, 0.5)} step={0.05} min={0} max={1} onchange={(v) => updatePreset(i, 'y', clamp01(num(v, 0.5)))} /></span></label>
            </div>
            {#if targets.length}
              <div class="grid">
                {#each targets as t (t.id)}
                  <label class="fld"><span>{t.label}</span>
                    <span class="nc-wrap"><NumberCell value={pv(p, t.id)} step={0.05} min={0} max={1} onchange={(v) => updatePresetValue(i, t.id, clamp01(num(v, 0)))} /></span>
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
  .preset { border: 1px solid #303030; border-radius: 6px; background: #171717; padding: 8px; display: flex; flex-direction: column; gap: 7px; }
  .prow { display: flex; align-items: center; gap: 8px; }
  .prow .name { flex: 1 1 auto; }
  .prow2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; border-top: 1px solid #2a2a2a; padding-top: 7px; }
  .clus { flex: 0 0 44px; display: flex; }
  .fld { display: flex; flex-direction: column; gap: 3px; }
  .nc-wrap { display: flex; }
  .fld > span { font-size: 10px; letter-spacing: .03em; color: #8a8a8a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .empty { border: 1px dashed #3A3A3A; border-radius: 4px; color: #8A8A8A; font-size: 11px; padding: 8px; }
  .action-btn { background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD; font-size: 11px; padding: 4px 8px; cursor: pointer; align-self: flex-start; }
  .action-btn:hover { border-color: #5B9BD5; }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; border-color: #3B3B3B; }
  .action-btn.danger { flex: 0 0 auto; padding: 3px 7px; }
  .action-btn.danger:hover { border-color: #C96A6A; }
  .header-add-btn {
    height: 16px; padding: 0 8px; border-radius: 8px; border: 1px solid #333;
    background: #252525; color: #777; font-size: 9px; font-family: inherit;
    cursor: pointer; line-height: 1;
  }
  .header-add-btn:hover { color: #CCC; border-color: #4A6E8C; }
</style>
