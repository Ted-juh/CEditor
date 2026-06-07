<script>
  // The hero "Parameters" screen — faithful to dpd-mockup-v2.html #params.
  // Table is built from the resolved instance-0 params (tone 1 + global); the enum drawer edits
  // the selected parameter's source enum live (mutating the shared model proxy).
  import DpdEnumInspector from './DpdEnumInspector.svelte';

  let { model, resolved, validation } = $props();

  // One row per parameter definition (instance 0 = tone 1 + global), already resolved.
  let rows = $derived((resolved ?? []).filter((p) => p.instance === 0));

  let cleanCount = $derived(rows.filter(rowOk).length);
  let allClean = $derived(validation?.ok !== false && cleanCount === rows.length);

  let selectedKey = $state(null);
  let firstEnumKey = $derived.by(() => {
    const e = rows.find((r) => r.valueType === 'enum') ?? rows[0];
    return e ? `${e.scope}::${e.paramId}` : null;
  });
  let activeKey = $derived(selectedKey ?? firstEnumKey);
  let selectedParam = $derived.by(() => {
    if (!activeKey) return null;
    const [scope, pid] = activeKey.split('::');
    return model?.scopes?.[scope]?.parameters?.find((p) => p.id === pid) ?? null;
  });

  let newName = $state('');

  function rowOk(r) { return !!(r.wires?.write?.address || r.wires?.write?.cc != null); }
  function rowKey(r) { return `${r.scope}::${r.paramId}`; }

  function msgType(r) {
    const m = r.wires?.write?.msg ?? r.wires?.rxLive?.msg;
    if (m === 'cc') return { label: 'CC', cls: 'cc' };
    if (m === 'nrpn') return { label: 'NRPN', cls: 'nrpn' };
    return { label: 'SysEx', cls: 'sysex' };
  }
  function vtype(r) {
    switch (r.valueType) {
      case 'enum': return { label: `◆ Enum · ${r.enum?.length ?? 0}`, cls: 'enum' };
      case 'toggle': return { label: 'Toggle', cls: 'toggle' };
      case 'signed': return { label: 'Signed', cls: 'cont' };
      default: return { label: 'Continuous', cls: 'cont' };
    }
  }
  function addrText(r) {
    const w = r.wires?.write;
    if (w?.address) return w.address;
    if (w?.cc != null) return `CC ${w.cc}`;
    return '—';
  }
  function fmt(n) { return n < 0 ? '−' + Math.abs(n) : String(n); }
  function rangeText(r) {
    if (r.valueType === 'enum') return 'list →';
    if (r.valueType === 'toggle') return 'Off / On';
    const min = r.range?.min ?? 0, max = r.range?.max ?? 127;
    return `${fmt(min)} – ${fmt(max)}`;
  }

  function addParam() {
    const name = newName.trim();
    if (!name || !model?.scopes) return;
    const scopeKey = Object.keys(model.scopes)[0];
    if (!scopeKey) return;
    const params = model.scopes[scopeKey].parameters ?? (model.scopes[scopeKey].parameters = []);
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || `param`;
    let id = base, n = 1;
    while (params.some((p) => p.id === id)) id = `${base}.${++n}`;
    params.push({ id, name, valueType: 'continuous', address: '00 00 00 00', range: { min: 0, max: 127 }, encoding: { type: 'u7' }, access: { read: true, write: true } });
    selectedKey = `${scopeKey}::${id}`;
    newName = '';
  }
</script>

<div class="shead"><h1>Parameters</h1></div>
<p class="sub">Each parameter carries its value type. Enums auto-fill comboboxes; ranges set dial min/max on drop.</p>

<div class="toolbar">
  <button class="btn primary" onclick={() => addParam()}>+ Add parameter</button>
  <button class="btn" disabled title="Coming soon">⇪ Import CSV</button>
  <button class="btn" disabled title="Coming soon">◉ MIDI learn</button>
  <div class="spacer"></div>
  <div class={['status-pill', !allClean && 'warn']}>
    <span class={['chk', allClean ? 'ok' : 'warn']}>{allClean ? '✓' : '!'}</span>
    <b>{cleanCount} of {rows.length}</b> round-trip cleanly
  </div>
</div>

<div class="split">
  <div class="main">
    <div class="tablewrap">
      <table>
        <thead><tr>
          <th style="width:24%">Parameter</th><th style="width:13%">Msg type</th>
          <th style="width:18%">Value type</th><th style="width:23%">Address / CC</th>
          <th style="width:14%">Range / List</th><th style="width:8%">✓</th>
        </tr></thead>
        <tbody>
          {#each rows as r (rowKey(r))}
            {@const mt = msgType(r)}
            {@const vt = vtype(r)}
            {@const ok = rowOk(r)}
            <tr
              class={[!ok && 'warnrow', activeKey === rowKey(r) && 'sel']}
              role="button" tabindex="0"
              onclick={() => selectedKey = rowKey(r)}
              onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (selectedKey = rowKey(r))}
            >
              <td><div class="cell pname clickable">{r.name ?? r.paramId}</div></td>
              <td><div class="cell"><span class={['ptype', mt.cls]}>{mt.label}</span></div></td>
              <td><div class="cell"><span class={['vtype', vt.cls]}>{vt.label}</span></div></td>
              <td><div class="cell"><span class="addr">{addrText(r)}</span></div></td>
              <td><div class="cell"><span class="range">{rangeText(r)}</span></div></td>
              <td><div class="cell"><span class={['chk', ok ? 'ok' : 'warn']} title={ok ? '' : 'no write address'}>{ok ? '✓' : '!'}</span></div></td>
            </tr>
          {/each}
          <tr class="emptyrow">
            <td><div class="cell"><input placeholder="Type a parameter name…" bind:value={newName} onfocus={(e) => e.target.select()} onkeydown={(e) => e.key === 'Enter' && addParam()} /></div></td>
            <td><div class="cell"><span class="ptype">—</span></div></td>
            <td><div class="cell"><span class="vtype">—</span></div></td>
            <td><div class="cell">—</div></td>
            <td><div class="cell">—</div></td>
            <td><div class="cell rowlearn">◉ learn</div></td>
          </tr>
        </tbody>
      </table>
    </div>
    {#if !allClean}
      <div class="hint">⚠ {rows.length - cleanCount} parameter{rows.length - cleanCount === 1 ? '' : 's'} need a write address — click a row to fix.</div>
    {/if}
  </div>

  <DpdEnumInspector param={selectedParam} />
</div>
