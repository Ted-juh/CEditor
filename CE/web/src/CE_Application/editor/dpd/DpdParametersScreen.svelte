<script>
  // The hero "Parameters" screen — faithful to dpd-mockup-v2.html #params.
  // Table is built from the resolved instance-0 params (tone 1 + global); the enum drawer edits
  // the selected parameter's source enum live (mutating the shared model proxy).
  //
  // Only the rows in view are drawn. A FANTOM lists 7,710 parameters and a KRONOS drum kit 6,016;
  // drawing every one took a second and a half of the designer's opening and slowed every edit,
  // since each edit resolves the model again. The rows are one fixed height (a name too long is cut
  // off, its whole text in the tooltip), so where a row sits is its index times that height.
  import DpdEnumInspector from './DpdEnumInspector.svelte';

  // `shown`: the designer mounts every screen; this one draws rows only while it is the one shown.
  let { model, resolved, validation, shown = true } = $props();

  // One row per parameter definition (instance 0 = tone 1 + global), already resolved.
  let allRows = $derived((resolved ?? []).filter((p) => p.instance === 0));

  // Search: every word must appear in the name, id, group, scope, message or address.
  let query = $state('');
  let onlyProblems = $state(false);
  let words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  let rows = $derived(allRows.filter((r) => (!onlyProblems || !rowOk(r)) && (!words.length || words.every((w) => haystack(r).includes(w)))));
  function haystack(r) {
    return [r.name, r.paramId, r.legacyId, r.group, r.scopeLabel, r.scope, msgType(r).label, addrText(r)]
      .filter((s) => s != null).join(' ').toLowerCase();
  }

  // How many instances a row's scope has: the row is the first, and stands for the rest.
  function instancesOf(r) { const s = model?.scopes?.[r.scope]; return s?.instances ?? 1; }
  function instanceTitle(r) {
    const s = model?.scopes?.[r.scope];
    return `One of ${instancesOf(r)}: ${s?.idTemplate ? s.idTemplate.replaceAll('{id}', r.paramId) : `${r.scope} 1–${instancesOf(r)}`}, each the same parameter${s?.stride && s.stride !== '00' ? ` ${s.stride} on from the last` : ''}`;
  }

  // ── the window of rows in view ──
  const OVERSCAN = 12;
  let scroller = $state(null);
  let scrollTop = $state(0);
  let viewHeight = $state(0);
  let rowHeight = $state(47);
  let first = $derived(Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN));
  let last = $derived(Math.min(rows.length, Math.ceil((scrollTop + Math.max(viewHeight, 600)) / rowHeight) + OVERSCAN));
  let windowRows = $derived(shown ? rows.slice(first, last) : []);
  // Measure a drawn row once: the stylesheet decides its height, not this file.
  $effect(() => {
    if (!shown || !scroller || !windowRows.length) return;
    const tr = scroller.querySelector('tbody tr.prow');
    const h = tr?.getBoundingClientRect().height;
    if (h && Math.abs(h - rowHeight) > 0.5) rowHeight = h;
  });
  // A new search starts at the top.
  $effect(() => { void words; void onlyProblems; if (scroller) { scroller.scrollTop = 0; scrollTop = 0; } });
  function scrollToKey(key) {
    const i = rows.findIndex((r) => rowKey(r) === key);
    if (i < 0 || !scroller) return;
    const top = i * rowHeight, bottom = top + rowHeight;
    if (top < scroller.scrollTop || bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = Math.max(0, top - scroller.clientHeight / 2);
    scrollTop = scroller.scrollTop;
  }

  let cleanCount = $derived(allRows.filter(rowOk).length);
  let allClean = $derived(validation?.ok !== false && cleanCount === allRows.length);

  let selectedKey = $state(null);
  let firstEnumKey = $derived.by(() => {
    const e = allRows.find((r) => r.valueType === 'enum') ?? allRows[0];
    return e ? `${e.scope}::${e.paramId}` : null;
  });
  let activeKey = $derived(selectedKey ?? firstEnumKey);
  let selectedParam = $derived.by(() => {
    if (!activeKey) return null;
    const [scope, pid] = activeKey.split('::');
    return model?.scopes?.[scope]?.parameters?.find((p) => p.id === pid) ?? null;
  });

  let newName = $state('');

  // A write wire is addressed by a SysEx address, a controller, or an NRPN or RPN number. Counting
  // only the first two put every NRPN parameter under "needs a write address": 92 of a Sub 37's 164.
  function rowOk(r) { const w = r.wires?.write; return !!(w?.address || w?.cc != null || w?.nrpn || w?.rpn); }
  function rowKey(r) { return `${r.scope}::${r.paramId}`; }

  function msgType(r) {
    const m = r.wires?.write?.msg ?? r.wires?.rxLive?.msg;
    if (m === 'cc') return { label: 'CC', cls: 'cc' };
    if (m === 'nrpn') return { label: 'NRPN', cls: 'nrpn' };
    if (m === 'rpn') return { label: 'RPN', cls: 'nrpn' };
    return { label: 'SysEx', cls: 'sysex' };
  }
  function vtype(r) {
    switch (r.valueType) {
      case 'enum': return { label: `◆ Enum · ${r.enum?.length ?? 0}`, cls: 'enum' };
      case 'toggle': return { label: 'Toggle', cls: 'toggle' };
      case 'signed': return { label: 'Signed', cls: 'cont' };
      case 'trigger': return { label: 'Trigger', cls: 'toggle' };
      case 'momentary': return { label: 'Momentary', cls: 'toggle' };
      default: return { label: 'Continuous', cls: 'cont' };
    }
  }
  function addrText(r) {
    const w = r.wires?.write;
    if (w?.address) return w.address;
    if (w?.cc != null) return w.lsbCc != null ? `CC ${w.cc} / ${w.lsbCc}` : `CC ${w.cc}`;
    if (w?.nrpn) return `NRPN ${w.nrpn}`;
    if (w?.rpn) return `RPN ${w.rpn}`;
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
    // Show the new row: clear a search that would hide it, then scroll to it once it is resolved.
    query = ''; onlyProblems = false;
    const key = selectedKey;
    queueMicrotask(() => requestAnimationFrame(() => scrollToKey(key)));
  }
</script>

<div class="shead"><h1>Parameters</h1></div>
<p class="sub">Each parameter carries its value type. Enums auto-fill comboboxes; ranges set dial min/max on drop.</p>

<div class="toolbar">
  <button class="btn primary" onclick={() => addParam()}>+ Add parameter</button>
  <input class="psearch" type="search" placeholder="Search {allRows.length} parameters — name, group, CC 74, NRPN, 10 00…" bind:value={query} aria-label="Search parameters" />
  {#if words.length || onlyProblems}<span class="pcount">{rows.length} of {allRows.length}</span>{/if}
  <div class="spacer"></div>
  <div class={['status-pill', !allClean && 'warn']}>
    <span class={['chk', allClean ? 'ok' : 'warn']}>{allClean ? '✓' : '!'}</span>
    <b>{cleanCount} of {allRows.length}</b> round-trip cleanly
  </div>
</div>

<div class="split">
  <div class="main">
    <div class="tablewrap vlist" bind:this={scroller} bind:clientHeight={viewHeight}
      onscroll={(e) => { scrollTop = e.currentTarget.scrollTop; }}>
      <table>
        <thead><tr>
          <th style="width:35%">Parameter</th><th style="width:11%">Msg type</th>
          <th style="width:17%">Value type</th><th style="width:18%">Address / CC</th>
          <th style="width:12%">Range / List</th><th style="width:7%">✓</th>
        </tr></thead>
        <tbody>
          {#if first > 0}<tr class="vspace" style:height="{first * rowHeight}px"><td colspan="6"></td></tr>{/if}
          {#each windowRows as r (rowKey(r))}
            {@const mt = msgType(r)}
            {@const vt = vtype(r)}
            {@const ok = rowOk(r)}
            {@const n = instancesOf(r)}
            <tr
              class={['prow', !ok && 'warnrow', activeKey === rowKey(r) && 'sel']}
              role="button" tabindex="0"
              onclick={() => selectedKey = rowKey(r)}
              onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (selectedKey = rowKey(r))}
            >
              <td><div class="cell pname clickable" title={r.name ?? r.paramId}><span class="pn">{r.name ?? r.paramId}</span>{#if n > 1}<span class="inst" title={instanceTitle(r)}>×{n}</span>{/if}</div></td>
              <td><div class="cell"><span class={['ptype', mt.cls]}>{mt.label}</span></div></td>
              <td><div class="cell"><span class={['vtype', vt.cls]}>{vt.label}</span></div></td>
              <td><div class="cell"><span class="addr">{addrText(r)}</span></div></td>
              <td><div class="cell"><span class="range">{rangeText(r)}</span></div></td>
              <td><div class="cell"><span class={['chk', ok ? 'ok' : 'warn']} title={ok ? '' : 'no write address'}>{ok ? '✓' : '!'}</span></div></td>
            </tr>
          {/each}
          {#if last < rows.length}<tr class="vspace" style:height="{(rows.length - last) * rowHeight}px"><td colspan="6"></td></tr>{/if}
          {#if !rows.length && allRows.length}<tr class="vnone"><td colspan="6"><div class="cell">No parameter matches “{query}”.</div></td></tr>{/if}
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
      <div class="hint">⚠ {allRows.length - cleanCount} parameter{allRows.length - cleanCount === 1 ? '' : 's'} need a write address — click a row to fix.
        <button class="linkbtn" onclick={() => { onlyProblems = !onlyProblems; }}>{onlyProblems ? 'Show all' : 'Show only these'}</button></div>
    {/if}
  </div>

  <DpdEnumInspector param={selectedParam} />
</div>
