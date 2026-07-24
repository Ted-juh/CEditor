<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

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
  function addLane() {
    setLanes([...lanes, { id: `g${Date.now()}`, label: `Lane ${lanes.length + 1}`, points: [], rest: 0, enabled: true }]);
  }
  function removeLane(i) { setLanes(lanes.filter((_, idx) => idx !== i)); }
  function clearLane(i) { updateLane(i, 'points', []); }
  function pointCount(l) { return Array.isArray(l?.points) ? l.points.length : 0; }

  // Accent-colour swatches: the native picker edits RGB; we preserve each
  // colour's original alpha so faint grids keep their transparency.
  function colRgb(v, fb) { const s = String(v ?? fb).replace(/^#/, ''); return `#${s.length >= 6 ? s.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) { const s = String(cur ?? '').replace(/^#/, ''); const a = /^[0-9a-fA-F]{8}$/.test(s) ? s.slice(0, 2) : 'FF'; set(prop, `${a}${hex.replace('#', '').toUpperCase()}`); }
</script>

{#if lp}
  <PropertySection title="Looper">
    <PropertyCell label="Run" span={1} hint="Play the loops in preview / player.">
      <PropertyToggle value={lp.running !== false} onchange={() => set('running', !(lp.running !== false))} />
    </PropertyCell>
    <PropertyCell label="Loop (s)" span={2} hint="Loop length in seconds — how long one pass around takes.">
      <input class="val" type="number" min="0.1" max="60" step="0.1" value={lp.loopSeconds ?? 4} onchange={(e) => set('loopSeconds', Math.max(0.1, num(e.target.value, 4)))} />
    </PropertyCell>
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
      <PropertyCell label="Major" span={1} hint="Major value-division lines (same as a slider's Major Count).">
        <input class="val" type="number" min="2" max="21" step="1" value={lp.majorTickCount ?? 5} onchange={(e) => set('majorTickCount', Math.max(2, Math.min(21, Math.round(num(e.target.value, 5)))))} />
      </PropertyCell>
      <PropertyCell label="Minor / gap" span={1} hint="Minor lines between each pair of majors (same as a slider's Minor / Gap).">
        <input class="val" type="number" min="0" max="8" step="1" value={lp.minorTickCount ?? 0} onchange={(e) => set('minorTickCount', Math.max(0, Math.min(8, Math.round(num(e.target.value, 0)))))} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Lane" span={1} hint="Lane background colour.">
      <input class="cswatch" type="color" value={colRgb(lp.laneColour, 'FF0E0E13')} onchange={(e) => setCol('laneColour', lp.laneColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Grid" span={1} hint="Grid lines (stays faint — its transparency is kept).">
      <input class="cswatch" type="color" value={colRgb(lp.gridColour, 'FFFFFFFF')} onchange={(e) => setCol('gridColour', lp.gridColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Playhead" span={1} hint="The sweeping playhead colour.">
      <input class="cswatch" type="color" value={colRgb(lp.playheadColour, 'FFFFFFFF')} onchange={(e) => setCol('playheadColour', lp.playheadColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Labels" span={1} hint="Lane label colour.">
      <input class="cswatch" type="color" value={colRgb(lp.labelColour, 'FFB9B9B9')} onchange={(e) => setCol('labelColour', lp.labelColour, e.target.value)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Lanes">
    <PropertyCell label="" span={4} hint="Each lane records a value-over-loop gesture: press and move inside it in preview, release to loop it. Every lane is a bindable 'Lane' port. Bind it in Device Bindings to drive a parameter.">
      <div class="lanes">
        {#if lanes.length === 0}
          <div class="empty">No lanes yet. Add one, then bind its port in Device Bindings.</div>
        {/if}
        {#each lanes as l, i (l.id ?? i)}
          <div class="lane" class:off={l.enabled === false}>
            <div class="lrow">
              <input class="val name" type="text" value={l.label ?? ''} placeholder="Lane" onchange={(e) => updateLane(i, 'label', e.target.value)} />
              <input class="swatch" type="color" value={`#${String(l.colour ?? 'FF39D98A').slice(-6)}`} onchange={(e) => updateLane(i, 'colour', `FF${e.target.value.replace('#', '').toUpperCase()}`)} title="Colour" />
              <span class="pts">{pointCount(l) ? `${pointCount(l)} pts` : 'empty'}</span>
              <label class="flag"><input type="checkbox" checked={l.enabled !== false} onchange={(e) => updateLane(i, 'enabled', e.currentTarget.checked)} /><span>On</span></label>
              <button type="button" class="action-btn" onclick={() => clearLane(i)} title="Clear recording">Clear</button>
              <button type="button" class="action-btn danger" onclick={() => removeLane(i)} title="Remove">✕</button>
            </div>
            <div class="lrow2">
              <label class="fld"><span>Rest %</span>
                <input class="val" type="number" min="0" max="100" step="5" value={Math.round(num(l.rest, 0) * 100)} onchange={(e) => updateLane(i, 'rest', Math.max(0, Math.min(1, num(e.target.value, 0) / 100)))} />
              </label>
            </div>
          </div>
        {/each}
        <button type="button" class="action-btn" onclick={addLane}>Add Lane</button>
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
  .swatch { width: 26px; height: 24px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .cswatch { width: 100%; height: 26px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .pts { font-size: 10px; color: #8a8a94; white-space: nowrap; }
  .lrow2 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
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
