<script>
  // Bulk dumps — the model's dump definitions (patch/bank/global), each spanning one or more scopes.
  // Bit-level / packed layouts are deferred to the Packing Studio.
  let { model } = $props();
  let dumps = $derived(model?.dumps ?? []);
  let selected = $state(0);
  let active = $derived(dumps[selected] ?? null);

  function scopeParamCount(spanKey) { return model?.scopes?.[spanKey]?.parameters?.length ?? 0; }
  function dumpParams(d) { return (d?.spans ?? []).reduce((n, s) => n + scopeParamCount(s), 0); }
</script>

<div class="shead"><h1>Bulk dumps</h1></div>
<p class="sub">A dump is one big message carrying many parameters. Define which parameter sits at which byte offset — this powers "get patch" / "send patch".</p>

{#if dumps.length}
  <div class="dumpgrid">
    {#each dumps as d, i (d.id)}
      <div class={['dumpcard', i === selected && 'sel']} role="button" tabindex="0"
        onclick={() => selected = i} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (selected = i)}>
        <div class="dt">◆ {d.name ?? d.id}{#if i === selected}<span class="pill">active</span>{/if}</div>
        <div class="dm">{d.kind ?? 'dump'} · spans {(d.spans ?? []).join(', ') || '—'}</div>
        <div class="dstat"><span><b>{dumpParams(d)}</b> params</span><span>request <b>{d.requestShape ?? '—'}</b></span></div>
      </div>
    {/each}
  </div>

  {#if active}
    <div class="layoutbox">
      <div class="lh">
        <span class="lt">{active.name ?? active.id} layout</span>
        <span class="lm">spans: {(active.spans ?? []).join(', ')}</span>
        <span style="margin-left:auto" class="status-pill"><span class="chk ok">✓</span> request via {active.requestShape ?? '—'}</span>
      </div>
      {#each (active.spans ?? []) as spanKey (spanKey)}
        {#each (model?.scopes?.[spanKey]?.parameters ?? []).slice(0, 10) as p, idx (p.id)}
          <div class="offsetrow">
            <div class="off">{spanKey} · {idx}</div>
            <div class="pp">{p.name ?? p.id}</div>
            <div class="enc">{p.encoding?.type ?? 'u7'}</div>
            <div class="ck"><span class="chk ok">✓</span></div>
          </div>
        {/each}
      {/each}
      <div class="addslot">＋ Bit-level / packed layouts open in the Packing Studio…</div>
    </div>
  {/if}
{:else}
  <div class="placeholder">No bulk dumps defined for this device yet.</div>
{/if}
