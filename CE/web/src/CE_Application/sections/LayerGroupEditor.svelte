<script>
  import HostConfirmButton from './HostConfirmButton.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import HostPartIdentity from './HostPartIdentity.svelte';
  import { hostPartTitle } from '../utils/hostTargetContext.js';
  import { partColor, hostState, focusRackPart, setLayerGroup, removeLayerGroup, setLayerMember,
    removeLayerMember, addLayerMember } from '../stores/instrumentHost.js';
  import { clampLayerValue, layerScale, layerDisplayValue, layerValueLabel,
    layerEnvelopePoints, editLayerBoundary } from '../utils/layerRangeGeometry.js';

  let { group, parts, macros, availableParts } = $props();
  let selectedPartId = $state('');
  let drag = $state(null);
  let selected = $derived(group.members.find(m => m.partId === selectedPartId)
    ?? group.members.find(m => m.partId === $hostState.rack.focusedPartId) ?? group.members[0] ?? null);
  const memberView = (member) => drag?.partId === member.partId ? { ...member, ...drag.fields } : member;
  let selectedView = $derived(selected ? memberView(selected) : null);
  let sourceScale = $derived(layerScale(group.source));
  let ticks = $derived(group.source === 'macro' ? [0, 25, 50, 75, 100] : [0, 32, 64, 96, 127]);
  const partIndex = (member) => parts.findIndex(p => p.partId === member.partId);
  const memberPart = (member) => parts.find(p => p.partId === member.partId)
    ?? { pluginName: member.partName || 'Instrument', unresolved: true };
  const memberName = (member) => hostPartTitle(memberPart(member));
  const sourceLabel = (source) => ({ velocity: 'Velocity', key: 'Key position', cc: 'MIDI CC',
    expression: 'Expression', macro: 'Macro' })[source] ?? 'Source';

  function selectMember(member) {
    selectedPartId = member.partId;
    if (partIndex(member) >= 0 && $hostState.rack.focusedPartId !== member.partId)
      focusRackPart(member.partId, { followEditor: false });
  }

  function explanation() {
    if (group.allocation === 'roundRobin') return 'New notes rotate between eligible instruments; releases return to the same one.';
    if (group.allocation === 'leastBusy') return 'Each new note goes to the eligible instrument holding the fewest voices.';
    if (['cc', 'expression', 'macro'].includes(group.source)) return 'All instruments receive notes. The source crossfades their audio levels continuously.';
    return 'Overlapping instruments play together. Crossfades shape each new note’s velocity.';
  }

  // Keep the native model authoritative. Drag drafts only exist until pointer-up;
  // cancelling or losing the pointer never persists a partial range.
  function beginDrag(event, member, field, side = 1) {
    if (event.button !== 0) return;
    event.preventDefault();
    selectMember(member);
    const bounds = event.currentTarget.closest('.range-track').getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    drag = { partId: member.partId, source: group.source, field, side,
      pointerId: event.pointerId, x: event.clientX, width: bounds.width,
      original: member[field], member: { ...member }, fields: { [field]: member[field] } };
  }
  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.source !== group.source || !group.members.some(m => m.partId === drag.partId)) { drag = null; return; }
    let value = drag.original + (event.clientX - drag.x) / drag.width * drag.side;
    // Endpoints follow the selected source scale; fade remains a percentage of 0..1.
    if (drag.field !== 'crossfade') value = Math.round(value * sourceScale) / sourceScale;
    drag = { ...drag, fields: editLayerBoundary(drag.member, drag.field, value) };
  }
  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = null;
    if (finished.source === group.source && group.members.some(m => m.partId === finished.partId)
        && finished.fields[finished.field] !== finished.original)
      setLayerMember(group.layerGroupId, finished.partId, finished.fields);
  }
  function handleKey(event, member, field, side = 1) {
    if (event.key === 'Escape') { drag = null; return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    selectMember(member);
    const step = field === 'crossfade' ? .01 : 1 / sourceScale;
    const value = event.key === 'Home' ? 0 : event.key === 'End' ? (field === 'crossfade' ? .5 : 1)
      : member[field] + (event.key === 'ArrowLeft' ? -1 : 1) * side * step * (event.shiftKey ? 10 : 1);
    setLayerMember(group.layerGroupId, member.partId, editLayerBoundary(member, field, value));
  }
  function numericEdit(event, field) {
    if (!selected || !event.currentTarget.validity.valid || event.currentTarget.value === '') return;
    const value = event.currentTarget.valueAsNumber / (field === 'crossfade' ? 100 : sourceScale);
    const fields = editLayerBoundary(selected, field, value);
    event.currentTarget.value = field === 'crossfade'
      ? Math.round(fields[field] * 1000) / 10 : layerDisplayValue(fields[field], group.source);
    setLayerMember(group.layerGroupId, selected.partId, fields);
  }
</script>

<article class="group" class:disabled={!group.enabled} data-testid="layer-group">
  <div class="group-head">
    <PropertyToggle compact value={group.enabled} ariaLabel={`Enable ${group.name}`}
      onchange={(enabled) => setLayerGroup(group.layerGroupId, { enabled })} />
    <input class="group-name" aria-label="Layer name" value={group.name}
      onchange={(event) => setLayerGroup(group.layerGroupId, { name: event.currentTarget.value })} />
    <span class="member-count">{group.members.length} instruments</span>
    <HostConfirmButton identity={JSON.stringify([group.layerGroupId])} title="Remove layer group" aria-label="Remove group" type="button" class="danger ghost" onclick={() => removeLayerGroup(group.layerGroupId)}>Remove group</HostConfirmButton>
  </div>
  <div class="mode-grid">
    <label>Voice mode<select aria-label="Voice mode" value={group.allocation}
      onchange={(event) => setLayerGroup(group.layerGroupId, { allocation: event.currentTarget.value })}>
      <option value="all">Layer all</option><option value="roundRobin">Round-robin</option><option value="leastBusy">Least busy</option>
    </select></label>
    <label>Source<select aria-label="Source" value={group.source} onchange={(event) => {
      drag = null;
      setLayerGroup(group.layerGroupId, { source: event.currentTarget.value,
        ...(event.currentTarget.value === 'macro' && !group.macroId && macros[0] ? { macroId: macros[0].macroId } : {}) });
    }}>
      <option value="velocity">Velocity</option><option value="key">Key position</option>
      <option value="cc">MIDI CC</option><option value="expression">Expression (CC 11)</option>
      <option value="macro" disabled={macros.length === 0}>Macro</option>
    </select></label>
    {#if group.source === 'cc'}
      <label>Controller<input type="number" min="0" max="127" value={group.controller}
        onchange={(event) => setLayerGroup(group.layerGroupId, { controller: Number(event.currentTarget.value) })} /></label>
    {:else if group.source === 'macro'}
      <label>Macro<select aria-label="Macro" value={group.macroId} onchange={(event) => setLayerGroup(group.layerGroupId, { macroId: event.currentTarget.value })}>
        {#if !macros.some(m => m.macroId === group.macroId)}<option value={group.macroId} disabled>Missing macro</option>{/if}
        {#each macros as macro (macro.macroId)}<option value={macro.macroId}>{macro.name}</option>{/each}
      </select></label>
    {/if}
    <span class="mode-badge">{group.allocation === 'all'
      ? ['cc', 'expression', 'macro'].includes(group.source) ? 'Audio crossfade' : 'Dynamic layer' : 'Voice allocation'}</span>
  </div>
  <p class="explanation">{explanation()}</p>
  <div class="range-editor">
    <div class="axis-row"><span class="axis-caption">INSTRUMENT / RANGE</span><div class="axis" aria-label={`${sourceLabel(group.source)} scale`}>
      {#each ticks as tick}<span class="tick" style={`left:${tick / sourceScale * 100}%`}>{layerValueLabel(tick / sourceScale, group.source)}</span>{/each}
    </div></div>
    {#each group.members as member (member.partId)}
      {@const view = memberView(member)}
      {@const name = memberName(member)}
      <div class="member" class:unresolved={!member.resolved} style={`--lane:${partColor(Math.max(0, partIndex(member)))}`}>
        <button type="button" class="member-name" aria-pressed={selected?.partId === member.partId}
          onclick={() => selectMember(member)} data-testid="layer-member-select">
          <span><HostPartIdentity part={memberPart(member)} index={partIndex(member)} /><small>{layerValueLabel(view.minimum, group.source)}–{layerValueLabel(view.maximum, group.source)}</small>
          {#if !member.resolved}<small class="warning">Unavailable routing</small>{/if}</span>
        </button>
        <div class="range-track" data-testid="layer-range-track">
          <svg class="envelope" viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">
            <polygon points={layerEnvelopePoints(view)} />
          </svg>
          <button type="button" class="range-band" class:selected={selected?.partId === member.partId}
            style={`left:${view.minimum * 100}%;width:${(view.maximum - view.minimum) * 100}%`}
            aria-label={`Select ${name} range`} onclick={() => selectMember(member)}></button>
          {#each ['minimum', 'maximum'] as field}
            <button type="button" class="range-handle" class:upper={field === 'maximum'}
              class:coincident={view.minimum === view.maximum}
              style={`left:${view[field] * 100}%`} aria-label={`${name} ${field} range`}
              title={`${field === 'minimum' ? 'Minimum' : 'Maximum'}: ${layerValueLabel(view[field], group.source)} · drag or use arrow keys`}
              data-testid={`layer-${field}`} onpointerdown={(e) => beginDrag(e, member, field)}
              onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={() => drag = null}
              onlostpointercapture={() => drag = null} onkeydown={(e) => handleKey(e, member, field)}></button>
          {/each}
          {#each [-1, 1] as side}
            {#if side < 0 ? view.minimum > 0 : view.maximum < 1}
              <button type="button" class="fade-handle"
                style={`left:${clampLayerValue(side < 0 ? view.minimum - view.crossfade : view.maximum + view.crossfade) * 100}%`}
                aria-label={`${name} ${side < 0 ? 'lower' : 'upper'} crossfade`}
                title={`Crossfade: ${Math.round(view.crossfade * 100)}% · drag or use arrow keys`}
                data-testid="layer-crossfade-handle" onpointerdown={(e) => beginDrag(e, member, 'crossfade', side)}
                onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={() => drag = null}
                onlostpointercapture={() => drag = null} onkeydown={(e) => handleKey(e, member, 'crossfade', side)}></button>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
    <div class="range-legend"><span><i class="edge-symbol"></i>Range edge</span><span><i class="fade-symbol"></i>Crossfade</span>
      <span>{sourceLabel(group.source)} · {layerValueLabel(0, group.source)}–{layerValueLabel(1, group.source)}</span></div>
  </div>
  {#if selectedView}
    <div class="selection-panel" data-testid="layer-inspector">
      <div class="selection-title"><span class="eyebrow">SELECTED INSTRUMENT</span><HostPartIdentity part={memberPart(selectedView)} index={partIndex(selectedView)} />
        {#if !selectedView.resolved}<span class="warning">Unavailable routing</span>{/if}</div>
      <div class="fields">
        <label>Minimum<input aria-label="Minimum" type="number" min="0" max={sourceScale} step="1"
          value={layerDisplayValue(selectedView.minimum, group.source)} onchange={(e) => numericEdit(e, 'minimum')} />
          <small>{group.source === 'key' ? layerValueLabel(selectedView.minimum, 'key') : group.source === 'macro' ? '%' : 'MIDI value'}</small></label>
        <label>Maximum<input aria-label="Maximum" type="number" min="0" max={sourceScale} step="1"
          value={layerDisplayValue(selectedView.maximum, group.source)} onchange={(e) => numericEdit(e, 'maximum')} />
          <small>{group.source === 'key' ? layerValueLabel(selectedView.maximum, 'key') : group.source === 'macro' ? '%' : 'MIDI value'}</small></label>
        <label>Crossfade<input aria-label="Crossfade" type="number" min="0" max="50" step="0.1"
          value={Math.round(selectedView.crossfade * 1000) / 10} onchange={(e) => numericEdit(e, 'crossfade')} />
          <small>% of source range</small></label>
      </div>
      <HostConfirmButton identity={JSON.stringify([group.layerGroupId, selectedView.partId])} aria-label="Remove instrument" type="button" class="ghost danger remove-member" title="A group with fewer than two members is removed"
        onclick={() => removeLayerMember(group.layerGroupId, selectedView.partId)}>Remove instrument</HostConfirmButton>
    </div>
  {/if}
  <div class="group-footer">
    {#if group.members.length < 8 && availableParts.length > 0}
      <label class="add-member">Add instrument<select aria-label="Add instrument" value="" onchange={(event) => {
        if (event.currentTarget.value) addLayerMember(group.layerGroupId, event.currentTarget.value);
        event.currentTarget.value = '';
      }}><option value="">Choose a rack part…</option>
        {#each availableParts as part (part.partId)}<option value={part.partId}>{part.pluginName || part.midiOutputName || 'Empty part'}</option>{/each}
      </select></label>
    {/if}
    <span>{group.enabled ? 'Group enabled' : 'Group disabled'}</span>
  </div>
</article>

<style>
  .group { background: var(--host-surface); border: 1px solid var(--host-line); border-radius: var(--host-radius-panel); min-width: 0; }
  .group-head { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 12px 15px; border-bottom: 1px solid var(--host-line-soft); }
  .group-name { min-width: 0; width: 185px; font-weight: 650; }
  .group-head > :global(button) { margin-left: auto; }
  .member-count, .mode-badge { font-size: 11px; color: var(--host-text-dim); }
  .mode-grid { display: flex; gap: 12px; align-items: end; flex-wrap: wrap; padding: 13px 15px 9px; }
  label { display: flex; flex-direction: column; gap: 5px; font-size: 11px; color: var(--host-text-soft); min-width: 0; }
  .mode-grid input { width: 76px; }
  .mode-badge { padding-bottom: 6px; margin-left: auto; }
  .explanation { margin: 0; padding: 0 15px 13px; font-size: 12px; color: var(--host-text-soft); }
  .range-editor { padding: 15px; border-top: 1px solid var(--host-line-soft); }
  .axis-row, .member { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 15px; }
  .axis-caption { color: var(--host-text-dim); font-size: 10px; letter-spacing: .04em; }
  .axis { position: relative; height: 30px; margin: 0 7px; color: var(--host-text-soft); font-size: 11px; }
  .tick { position: absolute; transform: translateX(-50%); white-space: nowrap; }
  .tick:first-child { transform: none; } .tick:last-child { transform: translateX(-100%); }
  .member { min-height: 82px; padding: 9px 0; align-items: center; border-top: 1px solid var(--host-line-soft); }
  :global(.host-workspace.host-workspace) .group .member button.member-name { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left; background: transparent; border-color: transparent; padding: 5px 2px; }
  .member-name > span { min-width: 0; }
  .member-name small { display: block; margin-top: 3px; font-size: 11px; color: var(--host-text-soft); }
  :global(.host-workspace.host-workspace) .group .member button.member-name[aria-pressed='true'] { color: var(--host-accent-strong); }
  .warning { color: var(--host-danger) !important; font-size: 11px; }
  .range-track { position: relative; height: 59px; margin: 0 7px; border-inline: 1px solid var(--host-line-soft); background: repeating-linear-gradient(to right, transparent 0, transparent calc(25% - 1px), var(--host-line-soft) calc(25% - 1px), var(--host-line-soft) 25%); }
  .envelope { position: absolute; inset: 0; width: 100%; height: 44px; pointer-events: none; overflow: visible; }
  .envelope polygon { fill: var(--lane); fill-opacity: .24; stroke: var(--lane); stroke-width: 1.2; vector-effect: non-scaling-stroke; }
  :global(.host-workspace.host-workspace) .group .range-track button { position: absolute; min-height: 0; padding: 0; touch-action: none; }
  :global(.host-workspace.host-workspace) .group .range-track button.range-band { top: 3px; height: 38px; min-width: 1px; border: 1px solid var(--lane); background: transparent; border-radius: 3px; }
  :global(.host-workspace.host-workspace) .group .range-track button.range-band.selected { outline: 2px solid var(--host-accent-strong); outline-offset: 3px; }
  :global(.host-workspace.host-workspace) .group .range-track button.range-handle { top: 7px; height: 28px; width: 11px; transform: translateX(-50%); border: 1px solid var(--lane); background: var(--lane); border-radius: 2px; cursor: ew-resize; z-index: 2; }
  :global(.host-workspace.host-workspace) .group .range-track button.range-handle.upper { top: 9px; }
  :global(.host-workspace.host-workspace) .group .range-track button.range-handle.coincident { top: 3px; height: 17px; }
  :global(.host-workspace.host-workspace) .group .range-track button.range-handle.upper.coincident { top: 23px; }
  :global(.host-workspace.host-workspace) .group .range-track button.fade-handle { top: 39px; width: 20px; height: 20px; transform: translateX(-50%); background: transparent; border: none; cursor: ew-resize; z-index: 3; }
  .fade-handle::after { content: ''; position: absolute; left: 6px; top: 6px; width: 8px; height: 8px; transform: rotate(45deg); background: var(--host-surface); border: 1px solid var(--lane); }
  .range-legend { display: flex; gap: 17px; flex-wrap: wrap; font-size: 11px; color: var(--host-text-soft); padding-top: 12px; }
  .range-legend span { display: flex; align-items: center; gap: 6px; }
  .edge-symbol { width: 4px; height: 11px; background: var(--host-text-dim); }
  .fade-symbol { width: 7px; height: 7px; border: 1px solid var(--host-text-dim); transform: rotate(45deg); }
  .selection-panel { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; background: var(--host-bg-deep); padding: 14px 15px; border-top: 1px solid var(--host-line); }
  .selection-title { min-width: 160px; max-width: 240px; overflow-wrap: anywhere; display: flex; flex-direction: column; gap: 4px; }
  .eyebrow { font-size: 10px; color: var(--host-text-dim); letter-spacing: .08em; }
  .fields { display: flex; gap: 12px; flex-wrap: wrap; }
  .fields input { width: 95px; font-variant-numeric: tabular-nums; }
  .fields small { font-size: 11px; color: var(--host-text-dim); }
  .selection-panel :global(.remove-member) { margin-left: auto; }
  .group-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 11px 15px; }
  .group-footer > span { font-size: 11px; color: var(--host-text-dim); margin-left: auto; }
  .add-member { flex-direction: row; align-items: center; flex-wrap: wrap; gap: 8px; }
  .add-member select { max-width: 100%; }
  .disabled .range-editor { opacity: .6; }
  .unresolved .range-band { border-style: dashed !important; }
  @media (max-width: 820px) {
    .axis-row, .member { grid-template-columns: 120px minmax(0, 1fr); gap: 12px; }
    .group-name { width: 150px; } .fields input { width: 80px; } .selection-panel { gap: 12px; }
  }
  @media (max-width: 520px) {
    .axis-row, .member { grid-template-columns: minmax(0, 1fr); gap: 4px; }
    .axis-caption { display: none; } .tick:nth-child(even) { display: none; }
    .member-name small { display: inline; }
    .member-name small { margin-left: 8px; } .group-head { gap: 8px; }
    .mode-grid { gap: 10px; } .mode-badge { margin-left: 0; }
  }
</style>
