<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import { ROUTER_INPUT_SOURCES, routerSourceLabel, routerSettingsForLearned } from '../utils/routerLayout.js';
  import { learnCandidateLabel } from '../utils/midiNoteInput.js';
  import { midiLearnState, startMidiLearn, stopMidiLearn } from '../stores/noteInput.js';
  import { onDestroy } from 'svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  import { componentListWithElement } from '../utils/componentElements.js';
  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let r = $derived(getSection(control, 'Router'));
  let dests = $derived(Array.isArray(r?.destinations) ? r.destinations : []);

  // Value-producing controls that can drive the router as a linked source.
  let linkSources = $derived(
    ($activePanel?.controls ?? [])
      .filter((c) => String(c?._children?.Behavior?.family ?? '').trim().toLowerCase() === 'range'
        && String(c?._children?.Core?.id ?? '') !== String(core?.id ?? ''))
      .map((c) => ({ id: String(c._children.Core.id), name: String(c._children.Core.name ?? c._children.Core.id) }))
  );

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Router.${prop}`, value);
  }

  // --- MIDI learn -------------------------------------------------------------
  // Press Learn, wiggle the controller you want. The session adopts whatever
  // moved the MOST, not the first message to arrive, so brushing a key on the
  // way to the mod wheel doesn't hijack it.
  let learning = $derived($midiLearnState.ownerId === String(core?.id ?? ''));
  let candidate = $derived(learning ? $midiLearnState.best : null);
  function toggleLearn() {
    if (learning) { stopMidiLearn(); return; }
    if (core?.id) startMidiLearn(core.id);
  }
  // Apply as soon as something clears the movement threshold: that's the whole
  // point of learn, and waiting for a second click would just be a second step.
  $effect(() => {
    if (!learning || !candidate) return;
    const settings = routerSettingsForLearned(candidate);
    if (!settings) return;
    stopMidiLearn();
    for (const [k, v] of Object.entries(settings)) set(k, v);
  });
  onDestroy(() => { if ($midiLearnState.ownerId === String(core?.id ?? '')) stopMidiLearn(); });
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }

  function setDests(next) { set('destinations', next); }
  function updateDest(i, key, value) {
    setDests(dests.map((d, idx) => idx === i ? { ...d, [key]: value } : d));
  }
  // Shared with ce.components.router.insert() — see componentElements.js.
  function addDest() { setDests(componentListWithElement('Router', 'destinations', dests, r)); }
  function removeDest(i) { setDests(dests.filter((_, idx) => idx !== i)); }
  function depthPct(d) { return Math.round(num(d?.depth, 1) * 100); }
  // Which standard sources are "external" (need the synth/controller to send them).
  const EXTERNAL = new Set(['aftertouch', 'breath', 'foot', 'velocity']);

  // Accent-colour swatches: the native picker edits RGB; we preserve each
  // colour's original alpha so faint grids keep their transparency.
  function colRgb(v, fb) { const s = String(v ?? fb).replace(/^#/, ''); return `#${s.length >= 6 ? s.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) { const s = String(cur ?? '').replace(/^#/, ''); const a = /^[0-9a-fA-F]{8}$/.test(s) ? s.slice(0, 2) : 'FF'; set(prop, `${a}${hex.replace('#', '').toUpperCase()}`); }
</script>

{#if r}
  <PropertySection title="Expression Router">
    <PropertyCell label="Source" span={2} hint="The incoming signal to shape. Mod Wheel / Expression are near-universal; Aftertouch / Breath / Foot / Velocity only work if your synth (or controller) actually transmits them. 'Linked control' follows an on-panel control in preview.">
      <select class="val" value={r.source ?? 'modwheel'} onchange={(e) => set('source', e.target.value)}>
        {#each ROUTER_INPUT_SOURCES as s (s.id)}
          <option value={s.id}>{s.label}{EXTERNAL.has(s.id) ? ' — device-dependent' : ''}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Invert" span={1} hint="Flip the input before the curve.">
      <PropertyToggle value={r.invert === true} onchange={() => set('invert', !(r.invert === true))} />
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Drag the transfer-curve nodes in preview.">
      <PropertyToggle value={r.editable !== false} onchange={() => set('editable', !(r.editable !== false))} />
    </PropertyCell>

    {#if String(r.source ?? '') === 'link'}
      <PropertyCell label="Linked" span={2} hint="The on-panel control whose value feeds the router in preview.">
        <select class="val" value={r.sourceControlId ?? ''} onchange={(e) => set('sourceControlId', e.target.value)}>
          <option value="">— pick a control —</option>
          {#each linkSources as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
        </select>
      </PropertyCell>
    {:else}
      <PropertyCell label="Learn" span={2} hint="Press, then move the controller you want. It adopts whichever one moves the most over the next few seconds — a stray note or a resting controller's jitter can't win — and pins the channel it actually arrived on. Times out on its own if nothing moves.">
        <button class="btn" class:listening={learning} type="button" onclick={toggleLearn}>
          {learning ? (candidate ? `Got ${learnCandidateLabel(candidate)}` : 'Listening… move a control') : 'Learn from MIDI in'}
        </button>
      </PropertyCell>
      {#if String(r.source ?? '') === 'cc'}
        <PropertyCell label="CC number" span={2} hint="Which controller number to follow (0–127).">
          <input class="val" type="number" min="0" max="127" step="1" value={num(r.ccNumber, 1)} onchange={(e) => set('ccNumber', Math.max(0, Math.min(127, Math.round(num(e.target.value, 1)))))} />
        </PropertyCell>
      {/if}
      {#if String(r.source ?? '') === 'polyAftertouch'}
        <PropertyCell label="Reduce by" span={2} hint="Per-note pressure is many values; a destination is one. Highest = the hardest-pressed key still down, so leaning on anything opens it. Last = the key you most recently leaned on. Released keys stop counting either way.">
          <select class="val" value={r.polyMode ?? 'highest'} onchange={(e) => set('polyMode', e.target.value)}>
            <option value="highest">Hardest key held</option>
            <option value="last">Most recent key</option>
          </select>
        </PropertyCell>
      {/if}
      <PropertyCell label="In channel" span={1} hint="Which MIDI channel to take this controller from. 0 = omni (any channel).">
        <input class="val" type="number" min="0" max="16" step="1" value={num(r.inputChannel, 0)} onchange={(e) => set('inputChannel', Math.max(0, Math.min(16, Math.round(num(e.target.value, 0)))))} />
      </PropertyCell>
      <PropertyCell label="Test in" span={1} hint="Stand-in value (0–1) used until that controller actually sends something. Once real hardware arrives it takes over, and the header reads LIVE instead of TEST — so a silent controller is never mistaken for a working one.">
        <input class="val" type="number" min="0" max="1" step="0.01" value={r.testInput ?? 0.5} onchange={(e) => set('testInput', Math.max(0, Math.min(1, num(e.target.value, 0.5))))} />
      </PropertyCell>
      <PropertyCell label="" span={4} hint="The controller is read from the hardware MIDI input on the device role. No input selected there means no live signal, and the router stays on its test value.">
        <div class="note">Reads {String(r.source ?? '') === 'cc' ? `CC ${num(r.ccNumber, 1)}` : routerSourceLabel(r.source ?? 'modwheel')} from the MIDI input{num(r.inputChannel, 0) > 0 ? ` · ch ${num(r.inputChannel, 0)}` : ' · omni'}{String(r.source ?? '') === 'polyAftertouch' ? ` · ${String(r.polyMode ?? 'highest') === 'last' ? 'most recent key' : 'hardest key'}` : ''}</div>
      </PropertyCell>
    {/if}
    <PropertyCell label="Dead-zone" span={2} hint="Ignore the bottom of the input range; the rest rescales to fill 0–1 (0 = off).">
      <input class="val" type="number" min="0" max="0.9" step="0.02" value={r.deadzone ?? 0} onchange={(e) => set('deadzone', Math.max(0, Math.min(0.9, num(e.target.value, 0))))} />
    </PropertyCell>
    <PropertyCell label="Divisions" span={1} hint="Draw value-scale ticks along each destination meter, using the same major/minor tick generator as the sliders.">
      <PropertyToggle value={r.showDivisions === true} onchange={() => set('showDivisions', !(r.showDivisions === true))} />
    </PropertyCell>
    {#if r.showDivisions === true}
      <PropertyCell label="Major" span={1} hint="Major tick count (same as a slider's Major Count).">
        <input class="val" type="number" min="2" max="21" step="1" value={r.majorTickCount ?? 5} onchange={(e) => set('majorTickCount', Math.max(2, Math.min(21, Math.round(num(e.target.value, 5)))))} />
      </PropertyCell>
      <PropertyCell label="Minor / gap" span={1} hint="Minor ticks between each pair of majors (same as a slider's Minor / Gap).">
        <input class="val" type="number" min="0" max="8" step="1" value={r.minorTickCount ?? 0} onchange={(e) => set('minorTickCount', Math.max(0, Math.min(8, Math.round(num(e.target.value, 0)))))} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Curve" span={1} hint="The transfer-curve line colour.">
      <input class="cswatch" type="color" value={colRgb(r.curveColour, 'FF39D98A')} onchange={(e) => setCol('curveColour', r.curveColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Input" span={1} hint="The live input bar + crosshair colour.">
      <input class="cswatch" type="color" value={colRgb(r.inputColour, 'FFF2C94C')} onchange={(e) => setCol('inputColour', r.inputColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Field" span={1} hint="Curve-area background colour.">
      <input class="cswatch" type="color" value={colRgb(r.fieldColour, 'FF0A0A0F')} onchange={(e) => setCol('fieldColour', r.fieldColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Grid" span={1} hint="Grid lines (stays faint — its transparency is kept).">
      <input class="cswatch" type="color" value={colRgb(r.gridColour, 'FFFFFFFF')} onchange={(e) => setCol('gridColour', r.gridColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Labels" span={1} hint="Label colour.">
      <input class="cswatch" type="color" value={colRgb(r.labelColour, 'FFB9B9B9')} onchange={(e) => setCol('labelColour', r.labelColour, e.target.value)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Destinations">
    <PropertyCell label="" span={4} hint="Each destination maps the shaped curve value to one bound device parameter: depth (−100…+100%, sign = direction) and output range. Every row is a bindable 'Destination' port. Draw the transfer curve by dragging its nodes in preview.">
      <div class="dests">
        {#if dests.length === 0}
          <div class="empty">No destinations yet. Add one, then bind its port in Device Bindings.</div>
        {/if}
        {#each dests as d, i (d.id ?? i)}
          <div class="dest" class:off={d.enabled === false}>
            <div class="drow">
              <input class="val name" type="text" value={d.label ?? ''} placeholder="Destination" onchange={(e) => updateDest(i, 'label', e.target.value)} />
              <input class="swatch" type="color" value={`#${String(d.colour ?? 'FF39D98A').slice(-6)}`} onchange={(e) => updateDest(i, 'colour', `FF${e.target.value.replace('#', '').toUpperCase()}`)} title="Colour" />
              <label class="flag"><input type="checkbox" checked={d.enabled !== false} onchange={(e) => updateDest(i, 'enabled', e.currentTarget.checked)} /><span>On</span></label>
              <button type="button" class="action-btn danger" onclick={() => removeDest(i)} title="Remove">✕</button>
            </div>
            <div class="drow2">
              <label class="fld"><span>Depth</span>
                <input class="val" type="number" min="-100" max="100" step="5" value={depthPct(d)} onchange={(e) => updateDest(i, 'depth', Math.max(-1, Math.min(1, num(e.target.value, 100) / 100)))} />
              </label>
              <label class="fld"><span>Min</span>
                <input class="val" type="number" min="0" max="1" step="0.05" value={d.min ?? 0} onchange={(e) => updateDest(i, 'min', Math.max(0, Math.min(1, num(e.target.value, 0))))} />
              </label>
              <label class="fld"><span>Max</span>
                <input class="val" type="number" min="0" max="1" step="0.05" value={d.max ?? 1} onchange={(e) => updateDest(i, 'max', Math.max(0, Math.min(1, num(e.target.value, 1))))} />
              </label>
            </div>
          </div>
        {/each}
        <button type="button" class="action-btn" onclick={addDest}>Add Destination</button>
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
  .note { font-size: 11px; color: #8a8a94; }
  .btn {
    width: 100%; background: #1A1A1A; border: 1px solid #333; color: #DDD;
    border-radius: 4px; padding: 4px 6px; font-size: 12px; cursor: pointer;
  }
  .btn:hover { border-color: #5B9BD5; }
  .btn.listening { border-color: #F2C94C; color: #F2C94C; background: #241f10; }
  .dests { display: flex; flex-direction: column; gap: 8px; }
  .dest { border: 1px solid #303030; border-radius: 6px; background: #171717; padding: 8px; display: flex; flex-direction: column; gap: 7px; }
  .dest.off { opacity: 0.55; }
  .drow { display: flex; align-items: center; gap: 8px; }
  .drow .name { flex: 1 1 auto; }
  .swatch { width: 26px; height: 24px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .cswatch { width: 100%; height: 26px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .drow2 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
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
