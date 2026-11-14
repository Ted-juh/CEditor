<script>
  // The instances of the selected parameter's block (a drum key's 37 keys, a part's 16 parts), each as
  // the device has it: its name, the message it goes out with and its default. A name or default typed
  // here is that instance's own (perInstance.js); emptied, it goes back to the block's. A block that
  // does not name its instances (no idTemplate) cannot carry values per instance: listed, not edited.
  import { hasOwn, setInstanceValue } from './perInstance.js';

  // `instances`: the resolved rows of this parameter, one per instance. `describe(row)`: its message.
  let { param, instances = [], named = false, first = 1, describe = null } = $props();
  const CAP = 64;
  let showAll = $state(false);
  let rows = $derived(showAll ? instances : instances.slice(0, CAP));
  let isEnum = $derived(param.valueType === 'enum');
  let isNumber = $derived(!isEnum && param.valueType !== 'text');

  function commit(field, r, raw, el) {
    let v = String(raw).trim();
    if (v === '') v = null;
    else if (field === 'default' && isNumber) {
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n)) { el.value = r.default ?? ''; return; }
      v = n;
    }
    setInstanceValue(param, field, r.instance, { count: instances.length, first }, v);
    // An emptied field shows the block's value again, which may be what it showed before.
    el.value = field === 'default' && isEnum && !hasOwn(param, 'default', r.instance, first) ? '' : (r[field] ?? '');
  }
</script>

<div class="esub">
  {#if named}Its {instances.length} instances. A name or default typed here is that one's own; empty it to go back to the block's.{:else}Its {instances.length} instances. This block does not name its instances, so they cannot have values of their own.{/if}
</div>
<div class="ilist">
  {#each rows as r (r.instance)}
    {@const ownName = hasOwn(param, 'name', r.instance, first)}
    {@const ownDefault = hasOwn(param, 'default', r.instance, first)}
    <div class={['irow', (ownName || ownDefault) && 'own']} data-instance={first + r.instance}>
      <span class="inum" title={r.legacyId ?? r.resolvedId}>{first + r.instance}</span>
      <div class="iname">
        <input class={['iname-in', ownName && 'own']} aria-label="Name of instance {first + r.instance}" value={r.name ?? ''} disabled={!named}
          onchange={(e) => commit('name', r, e.currentTarget.value, e.currentTarget)} />
        {#if describe}<div class="imsg">{describe(r)}</div>{/if}
      </div>
      {#if isEnum}
        <select class={['idef', ownDefault && 'own']} aria-label="Default of instance {first + r.instance}" value={ownDefault ? r.default : ''} disabled={!named}
          onchange={(e) => commit('default', r, e.currentTarget.value, e.currentTarget)}>
          <option value="">The block's</option>
          {#each param.enum ?? [] as entry (entry.id)}<option value={entry.id}>{entry.label}</option>{/each}
        </select>
      {:else}
        <input class={['idef', ownDefault && 'own']} aria-label="Default of instance {first + r.instance}" value={r.default ?? ''} disabled={!named}
          onchange={(e) => commit('default', r, e.currentTarget.value, e.currentTarget)} />
      {/if}
    </div>
  {/each}
</div>
{#if !showAll && instances.length > CAP}<button class="addslot asbtn" onclick={() => { showAll = true; }}>Show all {instances.length}</button>{/if}
