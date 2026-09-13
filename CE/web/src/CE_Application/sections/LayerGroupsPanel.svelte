<script>
  import { hostState, addLayerGroup } from '../stores/instrumentHost.js';
  import LayerGroupEditor from './LayerGroupEditor.svelte';

  let groups = $derived($hostState.rack.layerGroups ?? []);
  let parts = $derived($hostState.rack.parts ?? []);
  let macros = $derived($hostState.rack.macros ?? []);

  function availableParts(group = null) {
    const claimed = new Set(groups.filter(g => g.layerGroupId !== group?.layerGroupId)
      .flatMap(g => g.members.map(member => member.partId)));
    return parts.filter(part => !part.midiSourcePartId && !claimed.has(part.partId)
      && !group?.members.some(member => member.partId === part.partId));
  }
</script>

<section class="layers" aria-label="Layer groups" data-testid="host-layer-groups">
  <header class="layers-head">
    <div><h2>Layers</h2><p>Shape how your instruments overlap and respond.</p></div>
    <button type="button" data-testid="add-layer-group"
      disabled={availableParts().length < 2 || groups.length >= 32}
      title={availableParts().length < 2 ? 'Two ungrouped keyboard parts are required' : 'Group the first two available parts'}
      onclick={() => addLayerGroup()}>+ New layer</button>
  </header>
  {#if groups.length === 0}
    <div class="empty"><strong>No layer groups yet</strong>
      <span>Add at least two rack parts, then combine them here. Their plug-ins may be software or hardware.</span></div>
  {/if}
  <div class="group-list">
    {#each groups as group (group.layerGroupId)}
      <LayerGroupEditor {group} {parts} {macros} availableParts={availableParts(group)} />
    {/each}
  </div>
</section>

<style>
  .layers { min-width: 0; color: var(--host-text); }
  .layers-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
  h2 { margin: 0; font-size: 19px; font-weight: 650; }
  p { margin: 3px 0 0; color: var(--host-text-soft); font-size: 12px; }
  .empty { border: 1px dashed var(--host-line); padding: 28px; display: grid; place-items: center; gap: 6px; color: var(--host-text-soft); text-align: center; }
  .group-list { display: grid; gap: 16px; }
</style>
