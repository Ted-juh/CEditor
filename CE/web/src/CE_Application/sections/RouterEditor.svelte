<script>
  import { controlSources } from '../utils/controlSources.js';
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import { ROUTER_INPUT_SOURCES, routerSourceLabel, routerSettingsForLearned } from '../utils/routerLayout.js';
  import { learnCandidateLabel } from '../utils/midiNoteInput.js';
  import { midiLearnState, startMidiLearn, stopMidiLearn } from '../stores/noteInput.js';
  import { onDestroy } from 'svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import Route from 'lucide-svelte/icons/route';
  import LogOut from 'lucide-svelte/icons/log-out';
  import Palette from 'lucide-svelte/icons/palette';

  import { componentListWithElement } from '../utils/componentElements.js';
  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let r = $derived(getSection(control, 'Router'));
  let dests = $derived(Array.isArray(r?.destinations) ? r.destinations : []);

  // Value-producing controls that can drive the router as a linked source.
  let linkSources = $derived(
    controlSources($activePanel?.controls, 'range', core?.id)
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
</script>

{#if r}
  <PropertySection title="Expression Router" icon={Route}>
    <PropertyCell label="Source" span={2} hint="The incoming signal to shape. Aftertouch, Breath, Foot and Velocity only work if your gear sends them.">
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
      <PropertyCell label="Learn" span={2} hint="Press, then move the controller you want. It takes the one that moves most and pins its channel.">
        <button class="btn" class:listening={learning} type="button" onclick={toggleLearn}>
          {learning ? (candidate ? `Got ${learnCandidateLabel(candidate)}` : 'Listening… move a control') : 'Learn from MIDI in'}
        </button>
      </PropertyCell>
      {#if String(r.source ?? '') === 'cc'}
        <PropertyCell label="CC number" span={1} compact hint="Which controller number to follow (0–127).">
          <NumberCell label="CC" value={num(r.ccNumber, 1)} step={1} min={0} max={127} onchange={(v) => set('ccNumber', Math.max(0, Math.min(127, Math.round(num(v, 1)))))} />
        </PropertyCell>
      {/if}
      {#if String(r.source ?? '') === 'polyAftertouch'}
        <PropertyCell label="Reduce by" span={2} hint="How to turn per-note pressure into one value. Highest = hardest-pressed key still down; Last = most recent.">
          <select class="val" value={r.polyMode ?? 'highest'} onchange={(e) => set('polyMode', e.target.value)}>
            <option value="highest">Hardest key held</option>
            <option value="last">Most recent key</option>
          </select>
        </PropertyCell>
      {/if}
      <PropertyCell label="In channel" span={1} compact hint="Which MIDI channel to take this controller from. 0 = omni (any channel).">
        <NumberCell label="Ch" value={num(r.inputChannel, 0)} step={1} min={0} max={16} onchange={(v) => set('inputChannel', Math.max(0, Math.min(16, Math.round(num(v, 0)))))} />
      </PropertyCell>
      <PropertyCell label="Test in" span={1} compact hint="Stand-in value (0–1) until that controller sends something. The header reads Live once real data arrives.">
        <NumberCell label="Test" value={r.testInput ?? 0.5} step={0.01} min={0} max={1} defaultValue={0.5} onchange={(v) => set('testInput', Math.max(0, Math.min(1, num(v, 0.5))))} />
      </PropertyCell>
      <PropertyCell label="" span={4} hint="The controller is read from the hardware MIDI input on the device role." compact>
        <div class="note">Reads {String(r.source ?? '') === 'cc' ? `CC ${num(r.ccNumber, 1)}` : routerSourceLabel(r.source ?? 'modwheel')} from the MIDI input{num(r.inputChannel, 0) > 0 ? ` · ch ${num(r.inputChannel, 0)}` : ' · omni'}{String(r.source ?? '') === 'polyAftertouch' ? ` · ${String(r.polyMode ?? 'highest') === 'last' ? 'most recent key' : 'hardest key'}` : ''}</div>
      </PropertyCell>
    {/if}
    <PropertyCell label="Dead-zone" span={1} compact hint="Ignore the bottom of the input range; the rest rescales to fill 0–1 (0 = off).">
      <NumberCell label="Dz" value={r.deadzone ?? 0} step={0.02} min={0} max={0.9} defaultValue={0} onchange={(v) => set('deadzone', Math.max(0, Math.min(0.9, num(v, 0))))} />
    </PropertyCell>
    <PropertyCell label="Divisions" span={1} hint="Draw value-scale ticks along each destination meter, using the same major/minor tick generator as the sliders.">
      <PropertyToggle value={r.showDivisions === true} onchange={() => set('showDivisions', !(r.showDivisions === true))} />
    </PropertyCell>
    {#if r.showDivisions === true}
      <PropertyCell label="Major" span={1} compact hint="Major tick count (same as a slider's Major Count).">
        <NumberCell label="Major" value={r.majorTickCount ?? 5} step={1} min={2} max={21} defaultValue={5} onchange={(v) => set('majorTickCount', Math.max(2, Math.min(21, Math.round(num(v, 5)))))} />
      </PropertyCell>
      <PropertyCell label="Minor / gap" span={1} compact hint="Minor ticks between each pair of majors (same as a slider's Minor / Gap).">
        <NumberCell label="Minor" value={r.minorTickCount ?? 0} step={1} min={0} max={8} defaultValue={0} onchange={(v) => set('minorTickCount', Math.max(0, Math.min(8, Math.round(num(v, 0)))))} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Colours" span={4} hint="Transfer curve, live input bar, field background, grid lines, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'curveColour', label: 'Curve', value: r.curveColour ?? 'FF39D98A', target: { type: 'control', controlId: core?.id, path: 'Router.curveColour' } },
        { key: 'inputColour', label: 'Input', value: r.inputColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'Router.inputColour' } },
        { key: 'fieldColour', label: 'Field', value: r.fieldColour ?? 'FF0A0A0F', target: { type: 'control', controlId: core?.id, path: 'Router.fieldColour' } },
        { key: 'gridColour', label: 'Grid', value: r.gridColour ?? 'FFFFFFFF', target: { type: 'control', controlId: core?.id, path: 'Router.gridColour' } },
        { key: 'labelColour', label: 'Labels', value: r.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Router.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Destinations" icon={LogOut}>
    {#snippet tools()}
      <button type="button" class="hdr-btn" title="Add destination" onclick={addDest}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="Each destination maps the curve to one bound parameter: depth (−100…+100%) and output range." compact>
      <div class="dests">
        {#if dests.length === 0}
          <div class="empty">No destinations yet. Add one, then bind its port in Device Bindings.</div>
        {/if}
        {#each dests as d, i (d.id ?? i)}
          <div class="dest" class:off={d.enabled === false}>
            <div class="drow">
              <input class="val name" type="text" value={d.label ?? ''} placeholder="Destination" onchange={(e) => updateDest(i, 'label', e.target.value)} />
              <span class="dcol"><SwatchCluster swatches={[
                { key: 'colour', label: 'Colour', value: d.colour ?? 'FF39D98A', target: { type: 'callback', apply: (hex) => updateDest(i, 'colour', hex) } },
              ]} /></span>
              <PropertyToggle compact label="On" value={d.enabled !== false} onchange={(next) => updateDest(i, 'enabled', next)} ariaLabel={`Destination ${i + 1} enabled`} />
              <button type="button" class="action-btn danger" onclick={() => removeDest(i)} title="Remove">✕</button>
            </div>
            <div class="drow2">
              <label class="fld"><span>Depth</span>
                <NumberCell value={depthPct(d)} step={5} min={-100} max={100} onchange={(v) => updateDest(i, 'depth', Math.max(-1, Math.min(1, num(v, 100) / 100)))} />
              </label>
              <label class="fld"><span>Min</span>
                <NumberCell value={d.min ?? 0} step={0.05} min={0} max={1} defaultValue={0} onchange={(v) => updateDest(i, 'min', Math.max(0, Math.min(1, num(v, 0))))} />
              </label>
              <label class="fld"><span>Max</span>
                <NumberCell value={d.max ?? 1} step={0.05} min={0} max={1} defaultValue={1} onchange={(v) => updateDest(i, 'max', Math.max(0, Math.min(1, num(v, 1))))} />
              </label>
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
  .dcol { flex: 0 0 52px; display: flex; }
  .drow2 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .fld { display: flex; flex-direction: column; gap: 3px; }
  .fld > span { font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: #8a8a8a; }
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
