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
    if (p !== prevRef) {
      prevRef = p;
      previewSel = 0;
      customValues = p?.valueType === 'enum'
        && (p.enum ?? []).some((entry, index) => Number(entry.wire ?? index) !== index);
    }
  });

  let isEnum = $derived(param?.valueType === 'enum');
  let entries = $derived(isEnum ? (param?.enum ?? []) : []); // read-only view; mutate via enumArr()

  // Lazily ensure the source enum array exists, then mutate it (never inside a $derived).
  function enumArr() {
    if (param && !Array.isArray(param.enum)) param.enum = [];
    return param?.enum ?? [];
  }
  function hex(w) { return Number(w ?? 0).toString(16).toUpperCase().padStart(2, '0'); }
  function setWire(entry, raw) {
    if (!customValues) return;
    const n = parseInt(String(raw).replace(/[^0-9a-fA-F]/g, ''), 16);
    entry.wire = Number.isFinite(n) ? n : 0;
  }
  function setCustomValues(enabled) {
    customValues = enabled;
    if (!enabled) enumArr().forEach((entry, index) => { entry.wire = index; });
  }
  function move(i, dir) {
    const arr = enumArr();
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    const [e] = arr.splice(i, 1);
    arr.splice(j, 0, e);
  }
  function remove(i) { enumArr().splice(i, 1); }
  function add() {
    const arr = enumArr();
    const nextWire = arr.reduce((m, e) => Math.max(m, Number(e.wire ?? 0)), -1) + 1;
    let id = `opt${arr.length + 1}`, n = arr.length + 1;
    while (arr.some((e) => e.id === id)) id = `opt${++n}`;
    arr.push({ id, label: 'New value', wire: nextWire });
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
      onclick={() => setCustomValues(!customValues)}
      onkeydown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        setCustomValues(!customValues);
      }}
    >
      <span class="sw"></span> Custom device values <span style="color:var(--txt-faint)">(set each option's wire byte)</span>
    </div>

    <div class="enumhdr"><span class="h-drag"></span><span class="h-pos">#</span><span class="h-label">Label</span><span class="h-val">Sends</span><span class="h-end"></span></div>
    <div class="enumlist">
      {#each entries as entry, i (entry.id ?? i)}
        <div class="enumrow">
          <span class="grip">⠿</span>
          <span class="idx">{i}</span>
          <input class="lbl" bind:value={entry.label} onfocus={(e) => e.target.select()} />
          <span class="valwrap"><input value={hex(customValues ? entry.wire : i)} disabled={!customValues} oninput={(e) => setWire(entry, e.target.value)} onfocus={(e) => e.target.select()} /></span>
          <span class="arrows"><button type="button" class="up" onclick={() => move(i, -1)} aria-label={`Move ${entry.label} up`} disabled={i === 0}>▲</button><button type="button" class="dn" onclick={() => move(i, 1)} aria-label={`Move ${entry.label} down`} disabled={i === entries.length - 1}>▼</button></span>
          <button type="button" class="del" onclick={() => remove(i)} aria-label={`Delete ${entry.label}`}>✕</button>
        </div>
      {/each}
    </div>
    <button type="button" class="enumadd" onclick={() => add()}>＋ Add value</button>
    <div class="pasteline">Each option keeps its own <b>wire byte</b> — handy when a device skips a value (e.g. uses 04, not 03). Turn off custom values for a plain 0,1,2,3 list.</div>

    <div class="previewstrip">
      <div class="pvh">Same enum, any component</div>
      <div class="pvsub">An enum is a value list, not a widget. Drop it on any of these — each renders the same {entries.length} options its own way.</div>
      <div class="pvgrid">
        <div class="pvitem"><div class="pvlabel"><span class="dot"></span>Combobox / dropdown</div>
          <div class="w-combo">{selLabel} <span class="car">▾</span></div></div>
        <div class="pvitem"><div class="pvlabel"><span class="dot"></span>Radio group</div>
          <div class="w-radio" role="radiogroup" aria-label="Radio group preview">
            {#each entries as entry, i (entry.id ?? i)}
              <button type="button" class={['ritem', i === previewSel && 'on']} role="radio" aria-checked={i === previewSel} onclick={() => previewSel = i}><span class="rb"></span>{entry.label}</button>
            {/each}
          </div></div>
        <div class="pvitem"><div class="pvlabel"><span class="dot"></span>Segmented control</div>
          <div class="w-seg">
            {#each entries as entry, i (entry.id ?? i)}
              <button type="button" class={[i === previewSel && 'on']} aria-pressed={i === previewSel} onclick={() => previewSel = i}>{entry.label}</button>
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
