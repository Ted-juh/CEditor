<script>
  // Device structure — how the program talks to the device, read from the model's own fields
  // (dpd.schema.json): its device id and channel, how messages are paced, how it answers an identity
  // inquiry; how its parameters are laid out (each scope a block written once, and how many times
  // it repeats); what it can be asked (requests) and what is asked when it connects; and the message
  // shapes the rest is built from. Nothing here is particular to one maker.
  import { shapeTemplate } from './dpdLabels.js';
  import { fillShape, EMIT_DEFAULTS } from '../../generated/dpd/emit-legacy-core.mjs';

  // `shown`: mounted with every other screen; a FANTOM's 442 requests are listed when this one shows.
  let { model, merged, shown = true } = $props();
  const CAP = 60;
  let showAllRequests = $state(false);
  let showAllSync = $state(false);

  // What the model leaves out is what the emitter writes (EMIT_DEFAULTS), shown as in effect.
  let channel = $derived(merged?.variables?.channel ?? EMIT_DEFAULTS.channel);
  let otherVariables = $derived(Object.entries(merged?.variables ?? {}).filter(([k]) => k !== 'channel'));
  let delay = $derived(merged?.timing?.minDelayBetweenMessagesMs ?? EMIT_DEFAULTS.timing.minDelayBetweenMessagesMs);
  let identity = $derived(merged?.identity ?? null);
  let shapes = $derived(merged?.messageShapes ?? []);

  let scopes = $derived(Object.entries(model?.scopes ?? {}).map(([key, s]) => ({
    key,
    label: s.label ?? key,
    count: s.parameters?.length ?? 0,
    instances: s.instances ?? (s.instancesFrom ? merged?.deviceStructure?.[s.instancesFrom] : null) ?? 1,
    named: s.idTemplate ?? null,
    first: s.first ?? 1,
    base: s.base ?? null,
    stride: s.stride ?? null,
  })));
  let listed = $derived(scopes.reduce((n, s) => n + s.count, 0));
  let total = $derived(scopes.reduce((n, s) => n + s.count * s.instances, 0));

  let requests = $derived(merged?.requests ?? []);
  let reqDefaults = $derived({ timeoutMs: merged?.defaults?.request?.timeoutMs ?? EMIT_DEFAULTS.request.timeoutMs, retries: merged?.defaults?.request?.retries ?? EMIT_DEFAULTS.request.retries });
  let shownRequests = $derived(!shown ? [] : showAllRequests ? requests : requests.slice(0, CAP));
  let requestName = $derived(new Map(requests.map((r) => [r.id, r.name ?? r.id])));
  let dumpName = $derived(new Map((merged?.dumps ?? []).map((d) => [d.id, d.name ?? d.id])));
  let sync = $derived((merged?.startup?.sync ?? []).map((s) => (typeof s === 'string' ? s : s?.request)));
  let shownSync = $derived(!shown ? [] : showAllSync ? sync : sync.slice(0, CAP));

  const toBytes = (hex) => (hex ? String(hex).trim().split(/\s+/) : []);
  // The bytes a request sends: its shape filled with its address and size (Roland's checksum
  // computed), or the message it writes out; the device id shown as the model's.
  function requestBytes(r) {
    const shape = r.shape ? shapes.find((s) => s.id === r.shape) : null;
    let bytes = null;
    try { bytes = shape ? fillShape(shape, r, toBytes(merged?.modelId)) : r.template; } catch { bytes = null; }
    return (bytes ?? []).map((t) => (t === '$deviceId' ? (merged?.deviceId ?? 'id') : t)).join(' ');
  }
  function answeredBy(r) {
    if (r.response?.dump) return `dump · ${dumpName.get(r.response.dump) ?? r.response.dump}`;
    if (r.response?.kind === 'identity') return 'identity reply';
    return r.response?.kind ?? '—';
  }
  function waitText(r) {
    const t = r.timeoutMs ?? reqDefaults.timeoutMs, n = r.retries ?? reqDefaults.retries;
    return `${t} ms${n ? ` · ${n} retr${n === 1 ? 'y' : 'ies'}` : ''}`;
  }
  const policyText = (p) => (p === 'pull' ? 'Reads the device into the panel' : p === 'push' ? 'Sends the panel to the device' : (p ?? '—'));
</script>

<div class="shead"><h1>Device structure</h1></div>
<p class="sub">How the program talks to this device: where its messages go, how its parameters are laid out, what it can be asked and what is asked when it connects.</p>

<div class="fieldgrid">
  <div class="field"><div class="fl">Device ID</div><div class="fin"><input value={merged?.deviceId ?? '—'} readonly /><span class="unit">hex</span></div><div class="fhint">Filled into every message that names <code>$deviceId</code>; 7F reaches any unit</div></div>
  <div class="field"><div class="fl">Channel</div><div class="fin"><input value={channel} readonly /><span class="unit">1–16</span></div><div class="fhint">The channel its controllers, NRPNs and program changes go out on</div></div>
  <div class="field"><div class="fl">Pause between messages</div><div class="fin"><input value={delay} readonly /><span class="unit">ms</span></div><div class="fhint">The least time between two messages to the device</div></div>
  <div class="field"><div class="fl">Identity</div><div class="fin"><input value={identity ? [identity.manufacturerId, identity.family, identity.member].filter(Boolean).join(' · ') : '—'} readonly /><span class="unit">mfr · family · member</span></div><div class="fhint">{identity ? 'How it answers a device inquiry, so it can be found when it is connected' : 'No identity: the device is picked by hand'}</div></div>
</div>

{#if otherVariables.length}
  <div class="reqbox" style="margin-bottom:26px">
    <div class="rl">Other variables</div>
    {#each otherVariables as [name, value] (name)}
      <div class="reqfield"><div class="rname">{name}</div><div class="rmsg">{value}</div></div>
    {/each}
  </div>
{/if}

<div class="dshead"><h2>Parameter layout</h2><span class="lm">{listed} parameters written, {total} on the device</span></div>
<div class="tablewrap" style="margin-bottom:26px">
  <table class="dstable">
    <thead><tr><th style="width:30%">Block</th><th style="width:14%">Parameters</th><th style="width:12%">Instances</th><th style="width:26%">Named</th><th style="width:18%">Base · stride</th></tr></thead>
    <tbody>
      {#each scopes as s (s.key)}
        <tr>
          <td><div class="cell pname">{s.label}</div></td>
          <td><div class="cell">{s.count}</div></td>
          <td><div class="cell">{#if s.instances > 1}<span class="inst">×{s.instances}</span>{:else}1{/if}</div></td>
          <td><div class="cell"><span class="addr">{s.named ? `${s.named.replaceAll('{n}', s.first)} … ${s.named.replaceAll('{n}', s.first + s.instances - 1)}` : '—'}</span></div></td>
          <td><div class="cell"><span class="addr">{s.base ?? '—'}{s.stride && s.stride !== '00' ? ` · +${s.stride}` : ''}</span></div></td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<div class="dshead"><h2>Requests</h2><span class="lm">{requests.length ? `${requests.length} · ${reqDefaults.timeoutMs} ms${reqDefaults.retries ? `, ${reqDefaults.retries} retry` : ''} unless a row says otherwise` : 'none'}</span></div>
{#if requests.length}
  <div class="tablewrap" style="margin-bottom:8px">
    <table class="dstable">
      <thead><tr><th style="width:26%">Request</th><th style="width:38%">Message · address · size</th><th style="width:22%">Answered by</th><th style="width:14%">Waits</th></tr></thead>
      <tbody>
        {#each shownRequests as r (r.id)}
          <tr class="dsreq">
            <td><div class="cell pname" title={r.id}>{r.name ?? r.id}</div></td>
            <!-- A request by shape reads as its shape, address and size; its bytes are in the tooltip. -->
            <td><div class="cell"><span class="addr rqmsg" title={requestBytes(r)}>{#if r.shape}<b class="shp">{r.shape}</b> {r.address} · {r.size}{:else}{requestBytes(r)}{/if}</span></div></td>
            <td><div class="cell">{answeredBy(r)}</div></td>
            <td><div class="cell"><span class="range">{waitText(r)}</span></div></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if shown && !showAllRequests && requests.length > CAP}<button class="addslot asbtn" onclick={() => { showAllRequests = true; }}>Show all {requests.length} requests</button>{/if}
{:else}
  <div class="placeholder" style="margin-bottom:26px">Nothing to ask this device: it is only sent to.</div>
{/if}

{#if merged?.startup}
  <div class="reqbox" style="margin:18px 0 26px">
    <div class="rl">When it connects · {policyText(merged.startup.policy)}</div>
    {#if sync.length}
      <ol class="dssync">
        {#each shownSync as id, i (i)}<li>{requestName.get(id) ?? id}</li>{/each}
      </ol>
      {#if shown && !showAllSync && sync.length > CAP}<button class="addslot asbtn" onclick={() => { showAllSync = true; }}>Show all {sync.length}</button>{/if}
    {:else}
      <div class="fhint">Nothing is asked.</div>
    {/if}
  </div>
{/if}

<div class="reqbox">
  <div class="rl">Message shapes</div>
  {#each shapes as s (s.id)}
    <div class="reqfield"><div class="rname">{s.id}</div><div class="rmsg">{shapeTemplate(s, merged)}</div></div>
  {:else}
    <div class="fhint">None: the parameters are sent as controllers, NRPNs or RPNs.</div>
  {/each}
</div>
