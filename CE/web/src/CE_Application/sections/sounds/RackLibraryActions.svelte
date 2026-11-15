<script>
  import Save from 'lucide-svelte/icons/save';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Copy from 'lucide-svelte/icons/copy';
  import Trash from 'lucide-svelte/icons/trash-2';
  import { saveRackToLibrary, renameSavedRack, duplicateSavedRack, removeLibraryRecord } from '../../stores/instrumentHost.js';

  let { rack = null } = $props();
  const actions = [
    { id: 'save', label: 'Save current rack as', icon: Save, submit: 'Save' },
    { id: 'rename', label: 'Rename selected rack', icon: Pencil, submit: 'Rename' },
    { id: 'copy', label: 'Duplicate selected rack', icon: Copy, submit: 'Duplicate' },
    { id: 'delete', label: 'Delete selected rack', icon: Trash, submit: 'Delete' },
  ];
  let action = $state(null);
  let target = $state(null);
  let name = $state('');
  let opener;

  function begin(item, button) {
    opener = button;
    target = rack;
    name = item.id === 'copy' ? rack.name + ' copy' : item.id === 'rename' ? rack.name : '';
    action = item;
  }
  function close() {
    action = null;
    opener?.focus();
  }
  function submit(event) {
    event.preventDefault();
    if (!action || (action.id !== 'delete' && !name.trim())) return;
    if (action.id === 'save') saveRackToLibrary(name.trim());
    if (action.id === 'rename') renameSavedRack(target.recordId, name.trim());
    if (action.id === 'copy') duplicateSavedRack(target.recordId, name.trim());
    if (action.id === 'delete') removeLibraryRecord(target.recordId);
    close();
  }
  function focusField(node) { node.focus(); node.select?.(); }
</script>

<div class="rack-actions" role="group" aria-label="Saved rack actions">
  {#each actions as item (item.id)}
    <button type="button" class="ghost" aria-label={item.label} title={item.label}
            disabled={item.id !== 'save' && !rack} onclick={(event) => begin(item, event.currentTarget)}>
      <item.icon size={15} aria-hidden="true" />
    </button>
  {/each}
</div>
{#if action}
  {#key action}
    <form onsubmit={submit} aria-label={action.label}
          onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
      {#if action.id === 'delete'}
        <span>Delete “{target.name}” from the library?</span>
      {:else}
        <label>{action.label} <input use:focusField aria-label="Rack name" bind:value={name} placeholder="Rack name" /></label>
      {/if}
      <button type="submit" disabled={action.id !== 'delete' && !name.trim()}>{action.submit}</button>
      {#if action.id === 'delete'}
        <button type="button" use:focusField onclick={close}>Cancel</button>
      {:else}
        <button type="button" onclick={close}>Cancel</button>
      {/if}
    </form>
  {/key}
{/if}

<style>
  .rack-actions, form, label { display: flex; align-items: center; gap: 5px; }
  .rack-actions { margin-left: auto; }
  .rack-actions button { display: inline-grid; place-items: center; width: 30px; }
  form { flex: 1 0 100%; flex-wrap: wrap; }
  label { flex-wrap: wrap; }
  input { max-width: 100%; }
</style>
