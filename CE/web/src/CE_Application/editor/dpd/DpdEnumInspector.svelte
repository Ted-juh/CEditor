<script>
  // The 380px inspector drawer — faithful to dpd-mockup-v2.html's enum editor + "same enum,
  // any component" preview. Edits mutate the selected parameter's source enum (shared model proxy),
  // so the table badge ("Enum · N") and the previews update live.
  let { param = null } = $props();

  let customValues = $state(true);
  let previewSel = $state(0);

  // Reset the preview selection only when the selected parameter changes (not on enum edits).
  let prevRef = null;
  $effect(() => {
    const p = param;
    if (p !== prevRef) { prevRef = p; previewSel = 0; }
  });

  let isEnum = $derived(param?.valueType === 'enum');
  let entries = $derived(isEnum ? (param.enum ?? (param.enum = [])) : []);

  function hex(w) { return Number(w ?? 0).toString(16).toUpperCase().padStart(2, '0'); }
  function setWire(entry, raw) {
    const n = parseInt(String(raw).replace(/[^0-9a-fA-F]/g, ''), 16);
    entry.wire = Number.isFinite(n) ? n : 0;
  }
  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= entries.length) return;
    const [e] = entries.splice(i, 1);
    entries.splice(j, 0, e);
  }
  function remove(i) { entries.splice(i, 1); }
  function add() {
    const nextWire = entries.reduce((m, e) => Math.max(m, Number(e.wire ?? 0)), -1) + 1;
    let id = `opt${entries.length + 1}`, n = entries.length + 1;
    while (entries.some((e) => e.id === id)) id = `opt${++n}`;
    entries.push({ id, label: 'New value', wire: nextWire });
  }

  let vtypeLabel = $derived(
    param?.valueType === 'enum' ? '◆ Enum'
      : param?.valueType === 'toggle' ? 'Toggle'
      : param?.valueType === 'signed' ? 'Signed' : 'Continuous'
  );
  let vtypeCls = $derived(param?.valueType === 'enum' ? 'enum' : param?.valueType === 'toggle' ? 'toggle' : 'cont');
  let selLabel = $derived(entries[previewSel]?.label ?? entries[0]?.label ?? '—');
</script>

<div class="enumdrawer">
  {#if !param}
    <div class="drawer-empty">Select a parameter to edit its details.</div>
  {:else if !isEnum}
    <div class="eh"><span class={['vtype', vtypeCls]} style="cursor:default">{vtypeLabel}</span><span class="ehname">{param.name ?? param.id}</span></div>
    <div class="esub">
      {#if param.range}This parameter spans {param.range.min} – {param.range.max}.{:else}A {param.valueType} parameter.{/if}
      Range &amp; encoding editing arrive with this inspector in a later step.
    </div>
  {:else}
    <div class="eh"><span class="vtype enum" style="cursor:default">◆ Enum</span><span class="ehname">{param.name ?? param.id}</span></div>
    <div class="esub">Describe the parameter's legal values. Reorder with the arrows; the device value stays pinned to each option.</div>

    <div
      class={['valtoggle', customValues && 'on']}
      role="switch" aria-checked={customValues} tabindex="0"
      onclick={() => customValues = !customValues}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (customValues = !customValues)}
    >
      <span class="sw"></span> Custom device values <span style="color:var(--txt-faint)">(set each option's wire byte)</span>
    </div>

    <div class="enumhdr"><span class="h-drag"></span><span class="h-pos">#</span><span class="h-label">Label</span><span class="h-val">Sends</span><span class="h-end"></span></div>
    <div class="enumlist">
      {#each entries as entry, i (entry.id ?? i)}
        <div class="enumrow">
          <span class="grip">⠿</span>
          <span class="idx">{i}</span>
          <input class="lbl" bind:value={entry.label} />
          <span class="valwrap"><input value={hex(entry.wire)} oninput={(e) => setWire(entry, e.target.value)} onfocus={(e) => e.target.select()} /></span>
          <span class="arrows"><span class="up" role="button" tabindex="-1" onclick={() => move(i, -1)} onkeydown={() => {}}>▲</span><span class="dn" role="button" tabindex="-1" onclick={() => move(i, 1)} onkeydown={() => {}}>▼</span></span>
          <span class="del" role="button" tabindex="-1" onclick={() => remove(i)} onkeydown={() => {}}>✕</span>
        </div>
      {/each}
    </div>
    <div class="enumadd" role="button" tabindex="0" onclick={() => add()} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && add()}>＋ Add value</div>
    <div class="pasteline">Each option keeps its own <b>wire byte</b> — handy when a device skips a value (e.g. uses 04, not 03). Turn off custom values for a plain 0,1,2,3 list.</div>

    <div class="previewstrip">
      <div class="pvh">Same enum, any component</div>
      <div class="pvsub">An enum is a value list, not a widget. Drop it on any of these — each renders the same {entries.length} options its own way.</div>
      <div class="pvgrid">
        <div class="pvitem"><div class="pvlabel"><span class="dot"></span>Combobox / dropdown</div>
          <div class="w-combo">{selLabel} <span class="car">▾</span></div></div>
        <div class="pvitem"><div class="pvlabel"><span class="dot"></span>Radio group</div>
          <div class="w-radio">
            {#each entries as entry, i (entry.id ?? i)}
              <label class={[i === previewSel && 'on']} role="button" tabindex="-1" onclick={() => previewSel = i} onkeydown={() => {}}><span class="rb"></span>{entry.label}</label>
            {/each}
          </div></div>
        <div class="pvitem"><div class="pvlabel"><span class="dot"></span>Segmented control</div>
          <div class="w-seg">
            {#each entries as entry, i (entry.id ?? i)}
              <div class={[i === previewSel && 'on']} role="button" tabindex="-1" onclick={() => previewSel = i} onkeydown={() => {}}>{entry.label}</div>
            {/each}
          </div></div>
        <div class="pvitem"><div class="pvlabel"><span class="dot"></span>Multi-stage button</div>
          <div class="w-steps"><div class="btn-step">◷</div>
            <div class="stepdots">{#each entries as entry, i (entry.id ?? i)}<i class={[i === previewSel && 'on']}></i>{/each}</div>
            <span class="stepname">{selLabel}</span></div></div>
      </div>
    </div>
  {/if}
</div>
