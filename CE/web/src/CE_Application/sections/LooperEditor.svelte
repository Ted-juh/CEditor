<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import TransportSyncCells from '../properties/TransportSyncCells.svelte';
  import { MIN_BARS, MAX_BARS } from '../utils/transportLayout.js';
  import Repeat from 'lucide-svelte/icons/repeat';
  import Palette from 'lucide-svelte/icons/palette';
  import Rows3 from 'lucide-svelte/icons/rows-3';

  import { componentListWithElement } from '../utils/componentElements.js';
  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let lp = $derived(getSection(control, 'Looper'));
  let lanes = $derived(Array.isArray(lp?.lanes) ? lp.lanes : []);

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Looper.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }

  function setLanes(next) { set('lanes', next); }
  function updateLane(i, key, value) {
    setLanes(lanes.map((l, idx) => idx === i ? { ...l, [key]: value } : l));
  }
  // Shared with ce.components.looper.insert() — see componentElements.js.
  function addLane() { setLanes(componentListWithElement('Looper', 'lanes', lanes, lp)); }
  function removeLane(i) { setLanes(lanes.filter((_, idx) => idx !== i)); }
  function clearLane(i) { updateLane(i, 'points', []); }
  function pointCount(l) { return Array.isArray(l?.points) ? l.points.length : 0; }

</script>

{#if lp}
  <PropertySection title="Looper" icon={Repeat}>
    <PropertyCell label="Run" span={1} hint="Play the loops in preview / player.">
      <PropertyToggle value={lp.running !== false} onchange={() => set('running', !(lp.running !== false))} />
    </PropertyCell>
    <TransportSyncCells
      synced={lp.syncToTransport === true}
      onchange={(v) => set('syncToTransport', v)}
      span={2}
      hint="Loop over a number of bars instead of seconds, so the loop point is the bar line."
    >
      {#snippet children()}
        <PropertyCell label="Loop (bars)" span={2} compact hint="Loop length in bars. 0.25 = one beat in 4/4.">
          <NumberCell label="Bars" value={lp.loopBars ?? 2} step={0.25} min={MIN_BARS} max={MAX_BARS} defaultValue={2} onchange={(v) => set('loopBars', Math.max(MIN_BARS, Math.min(MAX_BARS, num(v, 2))))} />
        </PropertyCell>
      {/snippet}
    </TransportSyncCells>
    {#if lp.syncToTransport !== true}
      <PropertyCell label="Loop (s)" span={2} compact hint="Loop length in seconds — how long one pass around takes.">
        <NumberCell label="Sec" value={lp.loopSeconds ?? 4} step={0.1} min={0.1} max={60} defaultValue={4} onchange={(v) => set('loopSeconds', Math.max(0.1, num(v, 4)))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Record" span={1} hint="Press & move inside a lane in preview to record its motion.">
      <PropertyToggle value={lp.editable !== false} onchange={() => set('editable', !(lp.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Playhead" span={1} hint="Show the sweeping playhead.">
      <PropertyToggle value={lp.showPlayhead !== false} onchange={() => set('showPlayhead', !(lp.showPlayhead !== false))} />
    </PropertyCell>
    <PropertyCell label="Grid" span={1} hint="Show the quarter/half time grid lines.">
      <PropertyToggle value={lp.showGrid !== false} onchange={() => set('showGrid', !(lp.showGrid !== false))} />
    </PropertyCell>
    <PropertyCell label="Divisions" span={1} hint="Draw value-scale lines across each lane, using the same major/minor tick generator as the sliders.">
      <PropertyToggle value={lp.showDivisions === true} onchange={() => set('showDivisions', !(lp.showDivisions === true))} />
    </PropertyCell>
    {#if lp.showDivisions === true}
      <PropertyCell label="Major" span={1} compact hint="Major value-division lines (same as a slider's Major Count).">
        <NumberCell label="Major" value={lp.majorTickCount ?? 5} step={1} min={2} max={21} defaultValue={5} onchange={(v) => set('majorTickCount', Math.max(2, Math.min(21, Math.round(num(v, 5)))))} />
      </PropertyCell>
      <PropertyCell label="Minor / gap" span={1} compact hint="Minor lines between each pair of majors (same as a slider's Minor / Gap).">
        <NumberCell label="Minor" value={lp.minorTickCount ?? 0} step={1} min={0} max={8} defaultValue={0} onchange={(v) => set('minorTickCount', Math.max(0, Math.min(8, Math.round(num(v, 0)))))} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Colours" span={4} hint="Lane background, grid lines, playhead, lane labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'laneColour', label: 'Lane', value: lp.laneColour ?? 'FF0E0E13', target: { type: 'control', controlId: core?.id, path: 'Looper.laneColour' } },
        { key: 'gridColour', label: 'Grid', value: lp.gridColour ?? '22FFFFFF', target: { type: 'control', controlId: core?.id, path: 'Looper.gridColour' } },
        { key: 'playheadColour', label: 'Playhd', value: lp.playheadColour ?? 'FFFFFFFF', target: { type: 'control', controlId: core?.id, path: 'Looper.playheadColour' } },
        { key: 'labelColour', label: 'Labels', value: lp.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Looper.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Lanes" icon={Rows3}>
    {#snippet tools()}
      <button type="button" class="header-add-btn" title="Add lane" onclick={addLane}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="Each lane records a value-over-loop gesture. Bind its 'Lane' port in Device Bindings.">
      <div class="lanes">
        {#if lanes.length === 0}
          <div class="empty">No lanes yet. Add one, then bind its port in Device Bindings.</div>
        {/if}
        {#each lanes as l, i (l.id ?? i)}
          <div class="lane" class:off={l.enabled === false}>
            <div class="lrow">
              <input class="val name" type="text" value={l.label ?? ''} placeholder="Lane" onchange={(e) => updateLane(i, 'label', e.target.value)} />
              <SwatchCluster swatches={[
                { key: `lane-${i}`, label: 'Colour', value: l.colour ?? 'FF39D98A', target: { type: 'callback', apply: (hex) => updateLane(i, 'colour', hex) } },
              ]} />
              <span class="pts">{pointCount(l) ? `${pointCount(l)} pts` : 'empty'}</span>
              <label class="flag"><input type="checkbox" checked={l.enabled !== false} onchange={(e) => updateLane(i, 'enabled', e.currentTarget.checked)} /><span>On</span></label>
              <button type="button" class="action-btn" onclick={() => clearLane(i)} title="Clear recording">Clear</button>
              <button type="button" class="action-btn danger" onclick={() => removeLane(i)} title="Remove">✕</button>
            </div>
            <div class="lrow2">
              <label class="fld"><span>Rest %</span>
                <span class="nc-wrap"><NumberCell value={Math.round(num(l.rest, 0) * 100)} step={5} min={0} max={100} onchange={(v) => updateLane(i, 'rest', Math.max(0, Math.min(1, num(v, 0) / 100)))} /></span>
              </label>
            </div>
          </div>
        {/each}
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
  .lanes { display: flex; flex-direction: column; gap: 8px; }
  .lane { border: 1px solid #303030; border-radius: 6px; background: #171717; padding: 8px; display: flex; flex-direction: column; gap: 7px; }
  .lane.off { opacity: 0.55; }
  .lrow { display: flex; align-items: center; gap: 8px; }
  .lrow .name { flex: 1 1 auto; }
  .pts { font-size: 10px; color: #8a8a94; white-space: nowrap; }
  .lrow2 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .fld { display: flex; flex-direction: column; gap: 3px; }
  .fld > span { font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: #8a8a8a; }
  .nc-wrap { display: flex; }
  .flag { display: inline-flex; align-items: center; gap: 5px; color: #B9B9B9; font-size: 11px; white-space: nowrap; }
  .empty { border: 1px dashed #3A3A3A; border-radius: 4px; color: #8A8A8A; font-size: 11px; padding: 8px; }
  .action-btn {
    background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD;
    font-size: 11px; padding: 4px 8px; cursor: pointer; align-self: flex-start;
  }
  .action-btn:hover { border-color: #5B9BD5; }
  .action-btn.danger { flex: 0 0 auto; padding: 3px 7px; }
  .action-btn.danger:hover { border-color: #C96A6A; }
  .header-add-btn {
    height: 16px; padding: 0 8px; border-radius: 8px; border: 1px solid #333;
    background: #252525; color: #777; font-size: 9px; font-family: inherit;
    cursor: pointer; line-height: 1;
  }
  .header-add-btn:hover { color: #CCC; border-color: #4A6E8C; }
</style>
