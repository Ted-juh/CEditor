<script>
  // Bulk dumps — the device's whole-patch SysEx, shown as a REAL byte map: a ruler of the framed
  // message (header / per-field payload / checksum / suffix) plus an editable layout table with a live
  // round-trip check. UNIVERSAL — driven entirely by dumps.mjs (assemble/parse/byteMap), no device
  // special-cased. A dump declared without a byte layout (e.g. an imported stub) shows a clear
  // "needs its byte map" state rather than faking offsets.
  import { dumpByteMap, assembleDump, dumpRoundTrip } from '../../generated/dpd/dumps.mjs';
  import { resolveParams } from '../../generated/dpd/resolve.mjs';
  import { bytesToHex } from '../../generated/dpd/codecs.mjs';

  let { model, merged } = $props();

  const CODECS = ['u7', 'u8', 's7', 'u14', 'nibbles', 'packed8to7', 'bitslice', 'text-ascii', 'text-nibbled-ascii'];
  const FIELD_COLORS = 6; // .f0..f5 cycle in CSS

  let dumps = $derived(model?.dumps ?? []);            // live, editable model proxies
  let selected = $state(0);
  let active = $derived(dumps[Math.min(selected, Math.max(0, dumps.length - 1))] ?? null);
  let isMapped = $derived(!!(active?.message?.matcher && active?.layout?.length));

  let paramOptions = $derived(merged ? resolveParams(merged).map((p) => ({ id: p.resolvedId, name: p.name ?? p.paramId })) : []);

  // resolved byte map + probe wire (zero values → shows framing + checksum) + live round-trip
  let map = $derived(isMapped ? safe(() => dumpByteMap(active, merged)) : null);
  let wire = $derived(isMapped ? safe(() => assembleDump(active, {}, merged)) ?? [] : []);
  let rt = $derived(isMapped ? safe(() => dumpRoundTrip(active, merged)) : null);

  function safe(fn) { try { return fn(); } catch { return null; } }

  // one region tag per wire byte: 'header' | 'fN' | 'pad' | 'checksum' | 'suffix'
  let regions = $derived.by(() => {
    if (!map || !wire.length) return [];
    const n = wire.length;
    const out = new Array(n).fill('pad');
    const pEnd = n - map.suffixLen - (map.checksum ? 1 : 0);
    for (let i = 0; i < map.payloadOffset; i++) out[i] = 'header';
    for (let i = n - map.suffixLen; i < n; i++) out[i] = 'suffix';
    if (map.checksum) out[map.checksum.byteOffset ?? pEnd] = 'checksum';
    if (!map.packed) map.fields.forEach((f, fi) => { for (let k = 0; k < f.size; k++) { const idx = map.payloadOffset + f.offset + k; if (idx < pEnd) out[idx] = 'f' + (fi % FIELD_COLORS); } });
    return out;
  });
  let fieldFails = $derived(new Set((rt?.failures ?? []).map((f) => f.param)));

  // ── authoring ──
  function selectDump(i) { selected = i; }
  function defineLayout(d) {
    if (!d.message) d.message = { matcher: { prefix: ['F0', 'F7'].slice(0, 1).concat([]), suffix: ['F7'] }, payload: { offset: 1 } };
    if (!d.message.matcher) d.message.matcher = { prefix: ['F0'], suffix: ['F7'] };
    if (!Array.isArray(d.layout)) d.layout = [];
    if (!d.layout.length) addField(d);
  }
  function addField(d) {
    const used = new Set((d.layout ?? []).map((e) => e.param));
    const next = paramOptions.find((p) => !used.has(p.id))?.id ?? paramOptions[0]?.id ?? 'param';
    const offset = (d.layout ?? []).reduce((m, e) => Math.max(m, (e.offset ?? 0) + (e.size ?? 1)), 0);
    (d.layout ??= []).push({ param: next, offset, codec: { type: 'u7' } });
  }
  function removeField(d, i) { d.layout.splice(i, 1); }
  function setCodec(entry, type) {
    entry.codec = type === 'nibbles' ? { type, bytes: entry.codec?.bytes ?? 2 }
      : (type === 'text-ascii' || type === 'text-nibbled-ascii') ? { type, length: entry.codec?.length ?? 8, pad: 32 }
      : type === 'packed8to7' ? { type, bytes: entry.codec?.bytes ?? 2, packOrder: 'msb-high-first' }
      : { type };
  }
  const codecLabel = (c) => !c ? 'u7' : c.type + (c.bytes ? `·${c.bytes}` : '') + (c.length ? `·${c.length}` : '');
  const sel = (e) => e.target.select();
</script>

<div class="shead"><h1>Bulk dumps</h1></div>
<p class="sub">A dump is one big message carrying a whole patch. Lay out which parameter sits at which byte — this powers “get patch” / “send patch”, and is checked end-to-end by a live round-trip.</p>

{#if dumps.length}
  <div class="dumpgrid">
    {#each dumps as d, i (d.id)}
      {@const mapped = !!(d.message?.matcher && d.layout?.length)}
      <div class={['dumpcard', i === selected && 'sel']} role="button" tabindex="0"
        onclick={() => selectDump(i)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && selectDump(i)}>
        <div class="dt">◆ {d.name ?? d.id}{#if i === selected}<span class="pill">active</span>{/if}</div>
        <div class="dm">{d.kind ?? 'dump'} · spans {(d.spans ?? []).join(', ') || '—'}</div>
        <div class="dstat">
          {#if mapped}<span><b>{d.layout.length}</b> fields</span><span><b>{(d.message.payload?.size ?? '—')}</b> B payload</span>
          {:else}<span class="warnt">no byte map</span>{/if}
          <span>req <b>{d.requestShape ?? '—'}</b></span>
        </div>
      </div>
    {/each}
  </div>

  {#if active && isMapped && map}
    <!-- live round-trip status -->
    <div class="rtbar">
      {#if rt?.ok}<span class="status-pill"><span class="chk ok">✓</span> Round-trip verified — {map.fields.length} fields, {wire.length} bytes</span>
      {:else}<span class="status-pill warn"><span class="chk warn">!</span> Round-trip failing{#if rt?.failures?.length}: {rt.failures[0].param ?? rt.failures[0].error}{/if}</span>{/if}
      {#if map.packed}<span class="tag">payload 8→7 packed</span>{/if}
      {#if map.completion?.messages > 1}<span class="tag">{map.completion.messages}-message bank</span>{/if}
      <span style="margin-left:auto" class="lm">request via {active.requestShape ?? '—'}</span>
    </div>

    <!-- byte ruler: the framed message -->
    <div class="druler">
      {#each wire as b, i (i)}
        <div class={['dbyte', regions[i]]} title={regions[i]}>
          <span class="bi">{i}</span><span class="bv">{b.toString(16).padStart(2, '0').toUpperCase()}</span>
        </div>
      {/each}
    </div>
    <div class="dlegend">
      <span class="lk header">header</span>
      {#each map.fields as f, fi (f.param)}<span class={['lk', 'f' + (fi % FIELD_COLORS)]}>{f.name}</span>{/each}
      {#if map.checksum}<span class="lk checksum">checksum · {map.checksum.type}</span>{/if}
      <span class="lk suffix">end</span>
    </div>

    <!-- editable layout table -->
    <div class="layoutbox">
      <div class="lh"><span class="lt">{active.name ?? active.id} layout</span><span class="lm">offset · parameter · codec · size</span></div>
      <div class="dlhead"><span>offset</span><span>parameter</span><span>codec</span><span>size</span><span></span><span></span></div>
      {#each active.layout as entry, i (i)}
        {@const fail = fieldFails.has(entry.param)}
        <div class="dlrow">
          <input class="num" type="number" min="0" bind:value={entry.offset} onfocus={sel} />
          <select class="psel" bind:value={entry.param}>
            {#each paramOptions as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
            {#if !paramOptions.some((o) => o.id === entry.param)}<option value={entry.param}>{entry.param} (name)</option>{/if}
          </select>
          <select class="csel" value={entry.codec?.type ?? 'u7'} onchange={(e) => setCodec(entry, e.target.value)}>
            {#each CODECS as c (c)}<option value={c}>{c}</option>{/each}
          </select>
          {#if entry.codec?.type === 'nibbles' || entry.codec?.type === 'packed8to7'}
            <input class="num" type="number" min="1" bind:value={entry.codec.bytes} onfocus={sel} title="bytes" />
          {:else if entry.codec?.type === 'text-ascii' || entry.codec?.type === 'text-nibbled-ascii'}
            <input class="num" type="number" min="1" bind:value={entry.codec.length} onfocus={sel} title="length" />
          {:else}
            <input class="num" type="number" min="1" bind:value={entry.size} onfocus={sel} placeholder="auto" />
          {/if}
          <span class="ck">{#if fail}<span class="chk warn">!</span>{:else}<span class="chk ok">✓</span>{/if}</span>
          <button class="xbtn" title="remove" onclick={() => removeField(active, i)}>✕</button>
        </div>
      {/each}
      <button class="addslot asbtn" onclick={() => addField(active)}>+ Add parameter</button>
    </div>
  {:else if active}
    <!-- declared but unmapped (e.g. an imported stub whose byte layout is unknown) -->
    <div class="layoutbox">
      <div class="lh"><span class="lt">{active.name ?? active.id}</span><span class="lm">spans {(active.spans ?? []).join(', ') || '—'} · request {active.requestShape ?? '—'}</span></div>
      <div class="needmap">
        <div class="nmh">No byte map yet</div>
        <p>This dump is declared (it knows which scopes it covers and how to request it) but its byte layout hasn’t been entered. Add the device’s byte map — from its MIDI implementation manual or a captured dump — to enable get/send patch and the round-trip check.</p>
        <button class="asbtn" onclick={() => defineLayout(active)}>Define byte layout</button>
      </div>
    </div>
  {/if}
{:else}
  <div class="placeholder">No bulk dumps defined for this device yet.</div>
{/if}
