<script>
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import {
    hostState,
    addLayerGroup, removeLayerGroup, setLayerGroup,
    addLayerMember, removeLayerMember, setLayerMember,
  } from '../stores/instrumentHost.js';

  let groups = $derived($hostState.rack.layerGroups ?? []);
  let parts = $derived($hostState.rack.parts ?? []);
  let macros = $derived($hostState.rack.macros ?? []);

  const percent = (value) => Math.round(Number(value ?? 0) * 100);
  const normalized = (value) => Math.max(0, Math.min(1, Number(value) / 100));
  const partTitle = (part) => part?.pluginName || part?.midiOutputName || 'Empty part';

  function memberIds(exceptGroupId = '') {
    return new Set(groups.filter((group) => group.layerGroupId !== exceptGroupId)
      .flatMap((group) => group.members.map((member) => member.partId)));
  }

  function availableParts(group = null) {
    const claimed = memberIds(group?.layerGroupId ?? '');
    return parts.filter((part) => !part.midiSourcePartId && !claimed.has(part.partId)
      && !group?.members.some((member) => member.partId === part.partId));
  }

  function explanation(group) {
    if (group.allocation === 'roundRobin')
      return 'New notes rotate between the eligible instruments; releases return to the same one.';
    if (group.allocation === 'leastBusy')
      return 'Each new note goes to the eligible instrument currently holding the fewest voices.';
    if (['cc', 'expression', 'macro'].includes(group.source))
      return 'All instruments receive the notes. The source morphs their audio levels continuously.';
    return 'All eligible instruments play together. Overlap and crossfade shape each new note’s velocity.';
  }
</script>

<section class="layers" aria-label="Layer groups" data-testid="host-layer-groups">
  <header class="layers-head">
    <div>
      <strong>Layer groups</strong>
      <p>Build velocity and key layers, distribute voices, or morph complete instruments.</p>
    </div>
    <button type="button" data-testid="add-layer-group"
            disabled={availableParts().length < 2 || groups.length >= 32}
            title={availableParts().length < 2
              ? 'Two ungrouped keyboard parts are required' : 'Group the first two available parts'}
            onclick={() => addLayerGroup()}>+ New layer</button>
  </header>

  {#if groups.length === 0}
    <div class="empty">
      <strong>No layer groups yet</strong>
      <span>Add at least two rack parts, then combine them here. Their plug-ins may be software or hardware.</span>
    </div>
  {/if}

  <div class="group-list">
    {#each groups as group (group.layerGroupId)}
      <article class="group" class:disabled={!group.enabled} data-testid="layer-group">
        <div class="group-head">
          <PropertyToggle compact value={group.enabled} ariaLabel={`Enable ${group.name}`}
                          onchange={(enabled) => setLayerGroup(group.layerGroupId, { enabled })} />
          <input class="group-name" aria-label="Layer name" value={group.name}
                 onchange={(event) => setLayerGroup(group.layerGroupId,
                   { name: event.currentTarget.value })} />
          <span class="member-count">{group.members.length} instruments</span>
          <button type="button" class="danger ghost"
                  onclick={() => removeLayerGroup(group.layerGroupId)}>Remove group</button>
        </div>

        <div class="mode-grid">
          <label>Voice mode
            <select value={group.allocation}
                    onchange={(event) => setLayerGroup(group.layerGroupId,
                      { allocation: event.currentTarget.value })}>
              <option value="all">Layer all</option>
              <option value="roundRobin">Round-robin</option>
              <option value="leastBusy">Least busy</option>
            </select>
          </label>
          <label>Source
            <select value={group.source}
                    onchange={(event) => setLayerGroup(group.layerGroupId,
                      { source: event.currentTarget.value,
                        ...(event.currentTarget.value === 'macro' && !group.macroId && macros[0]
                          ? { macroId: macros[0].macroId } : {}) })}>
              <option value="velocity">Velocity</option>
              <option value="key">Key position</option>
              <option value="cc">MIDI CC</option>
              <option value="expression">Expression (CC 11)</option>
              <option value="macro" disabled={macros.length === 0}>Macro</option>
            </select>
          </label>
          {#if group.source === 'cc'}
            <label>Controller
              <input type="number" min="0" max="127" value={group.controller}
                     onchange={(event) => setLayerGroup(group.layerGroupId,
                       { controller: Number(event.currentTarget.value) })} />
            </label>
          {:else if group.source === 'macro'}
            <label>Macro
              <select value={group.macroId}
                      onchange={(event) => setLayerGroup(group.layerGroupId,
                        { macroId: event.currentTarget.value })}>
                {#each macros as macro (macro.macroId)}
                  <option value={macro.macroId}>{macro.name}</option>
                {/each}
              </select>
            </label>
          {/if}
          <div class="mode-badge" class:audio={group.allocation === 'all'
            && ['cc', 'expression', 'macro'].includes(group.source)}>
            {group.allocation === 'all' && ['cc', 'expression', 'macro'].includes(group.source)
              ? 'Audio crossfade' : group.allocation === 'all' ? 'Dynamic layer' : 'Voice allocation'}
          </div>
        </div>
        <p class="explanation">{explanation(group)}</p>

        <div class="member-list">
          {#each group.members as member (member.partId)}
            <div class="member" class:unresolved={!member.resolved}>
              <div class="member-title">
                <strong>{member.partName || partTitle(parts.find((part) => part.partId === member.partId))}</strong>
                <span>{member.resolved ? 'Keyboard input' : 'Unavailable routing'}</span>
                <button type="button" class="ghost" title="Remove this instrument from the layer"
                        onclick={() => removeLayerMember(group.layerGroupId, member.partId)}>×</button>
              </div>

              <div class="range-track" aria-hidden="true">
                <span class="fade-zone" style={`left:${Math.max(0, percent(member.minimum) - percent(member.crossfade))}%;right:${Math.max(0, 100 - percent(member.maximum) - percent(member.crossfade))}%`}></span>
                <span class="full-zone" style={`left:${percent(member.minimum)}%;right:${100 - percent(member.maximum)}%`}></span>
              </div>

              <div class="member-controls">
                <label>From
                  <input class="square-range" type="range" min="0" max="100" step="1"
                         value={percent(member.minimum)}
                         onchange={(event) => setLayerMember(group.layerGroupId, member.partId,
                           { minimum: normalized(event.currentTarget.value) })} />
                  <output>{percent(member.minimum)}%</output>
                </label>
                <label>To
                  <input class="square-range" type="range" min="0" max="100" step="1"
                         value={percent(member.maximum)}
                         onchange={(event) => setLayerMember(group.layerGroupId, member.partId,
                           { maximum: normalized(event.currentTarget.value) })} />
                  <output>{percent(member.maximum)}%</output>
                </label>
                <label>Crossfade
                  <input class="square-range" type="range" min="0" max="50" step="1"
                         value={percent(member.crossfade)}
                         onchange={(event) => setLayerMember(group.layerGroupId, member.partId,
                           { crossfade: normalized(event.currentTarget.value) })} />
                  <output>{percent(member.crossfade)}%</output>
                </label>
              </div>
            </div>
          {/each}
        </div>

        {#if group.members.length < 8 && availableParts(group).length > 0}
          <label class="add-member">Add instrument
            <select value="" onchange={(event) => {
              if (event.currentTarget.value)
                addLayerMember(group.layerGroupId, event.currentTarget.value);
              event.currentTarget.value = '';
            }}>
              <option value="">Choose a rack part…</option>
              {#each availableParts(group) as part (part.partId)}
                <option value={part.partId}>{partTitle(part)}</option>
              {/each}
            </select>
          </label>
        {/if}
      </article>
    {/each}
  </div>
</section>

<style>
  .layers { min-height: 0; padding: 14px; color: var(--host-text, #dce5eb); }
  .layers-head, .group-head, .member-title { display: flex; align-items: center; gap: 10px; }
  .layers-head { justify-content: space-between; margin-bottom: 12px; }
  .layers-head strong { font-size: 14px; letter-spacing: .02em; }
  p { margin: 3px 0 0; color: var(--host-text-dim, #8798a4); font-size: 11px; }
  button, input, select { font: inherit; }
  button, select, input[type="number"], .group-name {
    min-height: 30px; border: 1px solid var(--host-line, #34434d); border-radius: 3px;
    background: var(--host-control, #182129); color: inherit; padding: 5px 8px;
  }
  button { cursor: pointer; }
  button:disabled { opacity: .45; cursor: default; }
  button:hover:not(:disabled) { border-color: var(--host-accent, #ff7a00); }
  .ghost { background: transparent; }
  .danger { color: #eaa098; }
  .empty { border: 1px dashed var(--host-line, #34434d); padding: 28px; display: grid;
    place-items: center; gap: 6px; color: var(--host-text-dim, #8798a4); text-align: center; }
  .group-list { display: grid; gap: 12px; }
  .group { border: 1px solid var(--host-line, #34434d); border-radius: 4px;
    background: var(--host-panel, #111a21); padding: 12px; }
  .group.disabled { opacity: .65; }
  .group-head { border-bottom: 1px solid var(--host-line-soft, #27343d); padding-bottom: 10px; }
  .group-name { flex: 1; min-width: 120px; font-weight: 650; }
  .member-count { font-size: 10px; color: var(--host-text-dim, #8798a4); }
  .mode-grid { display: grid; grid-template-columns: repeat(3, minmax(130px, 1fr)) auto;
    gap: 10px; align-items: end; margin-top: 10px; }
  label { display: grid; gap: 4px; min-width: 0; color: var(--host-text-dim, #8798a4);
    font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .055em; }
  .mode-badge { align-self: end; min-height: 30px; display: grid; place-items: center;
    padding: 0 9px; border: 1px solid var(--host-line, #34434d); color: var(--host-text-dim, #8798a4);
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
  .mode-badge.audio { border-color: var(--host-accent, #ff7a00); color: var(--host-accent, #ff7a00); }
  .explanation { min-height: 16px; margin: 7px 0 10px; }
  .member-list { display: grid; gap: 7px; }
  .member { border: 1px solid var(--host-line-soft, #27343d); background: var(--host-raised, #162027);
    padding: 9px; }
  .member.unresolved { border-color: #9e554e; }
  .member-title strong { flex: 1; font-size: 12px; }
  .member-title span { font-size: 9px; color: var(--host-text-dim, #8798a4); }
  .member-title button { min-height: 24px; padding: 1px 8px; font-size: 16px; }
  .range-track { height: 6px; position: relative; margin: 8px 0 3px; background: #0b1116; overflow: hidden; }
  .range-track span { position: absolute; inset-block: 0; }
  .fade-zone { background: color-mix(in srgb, var(--host-accent, #ff7a00) 32%, transparent); }
  .full-zone { background: var(--host-accent, #ff7a00); }
  .member-controls { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .member-controls label { grid-template-columns: auto 1fr 36px; align-items: center; }
  output { text-align: right; color: var(--host-text, #dce5eb); font-variant-numeric: tabular-nums; }
  .square-range { width: 100%; accent-color: var(--host-accent, #ff7a00); }
  .square-range::-webkit-slider-thumb { border-radius: 1px; }
  .square-range::-moz-range-thumb { border-radius: 1px; }
  .add-member { width: min(330px, 100%); margin-top: 10px; }
  @media (max-width: 820px) {
    .mode-grid { grid-template-columns: repeat(2, 1fr); }
    .member-controls { grid-template-columns: 1fr; }
    .group-head { flex-wrap: wrap; }
    .group-name { flex-basis: 60%; }
  }
</style>
