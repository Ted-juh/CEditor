<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import TransportSyncCells from '../properties/TransportSyncCells.svelte';
  import { MIN_BARS, MAX_BARS } from '../utils/transportLayout.js';
  import Orbit from 'lucide-svelte/icons/orbit';
  import Satellite from 'lucide-svelte/icons/satellite';
  import Palette from 'lucide-svelte/icons/palette';

  import { componentListWithElement } from '../utils/componentElements.js';
  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let o = $derived(getSection(control, 'Orbit'));
  let nodes = $derived(Array.isArray(o?.nodes) ? o.nodes : []);

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Orbit.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }

  function setNodes(next) { set('nodes', next); }
  function updateNode(i, key, value) {
    setNodes(nodes.map((s, idx) => idx === i ? { ...s, [key]: value } : s));
  }
  // Shared with ce.components.orbit.insert() — see componentElements.js.
  function addNode() { setNodes(componentListWithElement('Orbit', 'nodes', nodes, o)); }
  function removeNode(i) { setNodes(nodes.filter((_, idx) => idx !== i)); }
  // Radius / depth in percent for a friendlier UI.
  function pct(v, f = 100) { return Math.round(num(v, f / 100) * 100); }
</script>

{#if o}
  <PropertySection title="Orbit" icon={Orbit}>
    <PropertyCell label="Run" span={1} hint="Animate the satellites in preview / player.">
      <PropertyToggle value={o.running !== false} onchange={() => set('running', !(o.running !== false))} />
    </PropertyCell>
    <TransportSyncCells
      synced={o.syncToTransport === true}
      onchange={(v) => set('syncToTransport', v)}
      span={2}
      hint="How many bars one global cycle takes. Each satellite's ratio is turns per cycle."
    >
      {#snippet children()}
        <PropertyCell label="Cycle (bars)" span={1} compact hint="How many bars one global cycle takes. A satellite at ratio 2 then makes two turns per cycle, on the bar.">
          <NumberCell label="Bars" value={o.cycleBars ?? 4} min={MIN_BARS} max={MAX_BARS} step={1} defaultValue={4} onchange={(v) => set('cycleBars', Math.max(MIN_BARS, Math.min(MAX_BARS, num(v, 4))))} />
        </PropertyCell>
      {/snippet}
    </TransportSyncCells>
    {#if o.syncToTransport !== true}
      <PropertyCell label="Rate" span={1} compact hint="Global speed — cycles per second (all ratios are relative to this).">
        <NumberCell label="Rate" value={o.rate ?? 0.25} min={0} max={10} step={0.05} defaultValue={0.25} onchange={(v) => set('rate', Math.max(0, num(v, 0.25)))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Editable" span={1} hint="Drag satellites to a new radius/angle in preview.">
      <PropertyToggle value={o.editable !== false} onchange={() => set('editable', !(o.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Rings" span={1} hint="Faint orbit rings.">
      <PropertyToggle value={o.showRings !== false} onchange={() => set('showRings', !(o.showRings !== false))} />
    </PropertyCell>
    <PropertyCell label="Spokes" span={1} hint="Line from centre to each satellite.">
      <PropertyToggle value={o.showSpokes !== false} onchange={() => set('showSpokes', !(o.showSpokes !== false))} />
    </PropertyCell>
    <PropertyCell label="Trails" span={1} hint="Comet trails behind satellites.">
      <PropertyToggle value={o.showTrails !== false} onchange={() => set('showTrails', !(o.showTrails !== false))} />
    </PropertyCell>
    <PropertyCell label="Values" span={1} hint="Live per-satellite value readout.">
      <PropertyToggle value={o.showValues === true} onchange={() => set('showValues', !(o.showValues === true))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Colours" span={4} hint="Field background, orbit rings, centre hub, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'fieldColour', label: 'Field', value: o.fieldColour ?? 'FF0D0D12', target: { type: 'control', controlId: core?.id, path: 'Orbit.fieldColour' } },
        { key: 'ringColour', label: 'Rings', value: o.ringColour ?? 'FF2A6BA8', target: { type: 'control', controlId: core?.id, path: 'Orbit.ringColour' } },
        { key: 'centreColour', label: 'Centre', value: o.centreColour ?? 'FF3A3A44', target: { type: 'control', controlId: core?.id, path: 'Orbit.centreColour' } },
        { key: 'labelColour', label: 'Labels', value: o.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Orbit.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Satellites" icon={Satellite}>
    {#snippet tools()}
      <button type="button" class="hdr-btn" title="Add satellite" onclick={addNode}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="Each satellite emits a live 0–1 value from its position. Bind its 'Node' port in Device Bindings." compact>
      <div class="nodes">
        {#if nodes.length === 0}
          <div class="empty">No satellites yet. Add one, then bind its port in Device Bindings.</div>
        {/if}
        {#each nodes as s, i (s.id ?? i)}
          <div class="node" class:off={s.enabled === false}>
            <div class="nrow">
              <input class="val name" type="text" value={s.label ?? ''} placeholder="Node" onchange={(e) => updateNode(i, 'label', e.target.value)} />
              <span class="ncol"><SwatchCluster swatches={[
                { key: 'colour', label: 'Colour', value: s.colour ?? 'FF5B9BD5', target: { type: 'callback', apply: (hex) => updateNode(i, 'colour', hex) } },
              ]} /></span>
              <PropertyToggle compact label="On" value={s.enabled !== false} onchange={(next) => updateNode(i, 'enabled', next)} ariaLabel={`Node ${i + 1} enabled`} />
              <button type="button" class="action-btn danger" onclick={() => removeNode(i)} title="Remove">✕</button>
            </div>
            <div class="nrow2">
              <label class="fld"><span>Radius %</span>
                <NumberCell value={pct(s.radius, 60)} min={0} max={100} step={5} onchange={(v) => updateNode(i, 'radius', Math.max(0, Math.min(1, num(v, 60) / 100)))} />
              </label>
              <label class="fld"><span>Angle°</span>
                <NumberCell value={Math.round(num(s.angle, 0))} min={0} max={360} step={5} onchange={(v) => updateNode(i, 'angle', ((num(v, 0) % 360) + 360) % 360)} />
              </label>
              <label class="fld"><span>Speed</span>
                <NumberCell value={num(s.ratio, 1)} min={-8} max={8} step={0.5} onchange={(v) => updateNode(i, 'ratio', num(v, 1))} />
              </label>
              <label class="fld"><span>Output</span>
                <select class="val" value={s.output ?? 'y'} onchange={(e) => updateNode(i, 'output', e.target.value)}>
                  <option value="y">Y (vert)</option>
                  <option value="x">X (horiz)</option>
                  <option value="sine">Sine</option>
                  <option value="radius">Radius</option>
                </select>
              </label>
              <label class="fld"><span>Depth %</span>
                <NumberCell value={pct(s.depth, 100)} min={0} max={100} step={5} onchange={(v) => updateNode(i, 'depth', Math.max(0, Math.min(1, num(v, 100) / 100)))} />
              </label>
              <span class="flag inv"><PropertyToggle compact label="Invert" value={s.invert === true} onchange={(next) => updateNode(i, 'invert', next)} ariaLabel={`Node ${i + 1} invert`} /></span>
            </div>
          </div>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .nodes { display: flex; flex-direction: column; gap: 8px; }
  .node { border: 1px solid #303030; border-radius: 6px; background: #171717; padding: 8px; display: flex; flex-direction: column; gap: 7px; }
  .node.off { opacity: 0.55; }
  .nrow { display: flex; align-items: center; gap: 8px; }
  .nrow .name { flex: 1 1 auto; }
  .ncol { flex: 0 0 52px; display: flex; }
  .nrow2 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; align-items: end; }
  .fld { display: flex; flex-direction: column; gap: 3px; }
  .fld > span { font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: #8a8a8a; }
  .flag { display: inline-flex; align-items: center; gap: 5px; color: #B9B9B9; font-size: 11px; white-space: nowrap; }
  .flag.inv { align-self: center; padding-top: 14px; }
  .empty { border: 1px dashed #3A3A3A; border-radius: 4px; color: #8A8A8A; font-size: 11px; padding: 8px; }
  .action-btn {
    background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD;
    font-size: 11px; padding: 4px 8px; cursor: pointer; align-self: flex-start;
  }
  .action-btn:hover { border-color: #5B9BD5; }
  .action-btn.danger { flex: 0 0 auto; padding: 3px 7px; }
  .action-btn.danger:hover { border-color: #C96A6A; }
  .hdr-btn {
    height: 16px; font-size: 9px; padding: 0 8px; border-radius: 8px;
    background: #252525; border: 1px solid #333; color: #777;
    font-family: inherit; cursor: pointer; line-height: 1;
  }
  .hdr-btn:hover { border-color: #4A6E8C; color: #CCC; }
</style>
