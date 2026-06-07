<script>
  // Device structure — how the device organizes memory (scopes/stride/device id) + the message shapes.
  let { model, merged } = $props();
  let tones = $derived(model?.deviceStructure?.tones ?? null);
  let tone = $derived(model?.scopes?.tone ?? null);

  function tpl(id) {
    const s = (merged?.messageShapes ?? []).find((x) => x.id === id);
    if (!s) return '—';
    return (s.template ?? []).map((t) =>
      t === '$deviceId' ? merged.deviceId : t === '$modelId' ? merged.modelId
      : t === '$address' ? '[addr]' : t === '$encodedValue' ? '[value]' : t === '$size' ? '[size]' : t === '$checksum' ? '[sum]' : t
    ).join(' ');
  }
</script>

<div class="shead"><h1>Device structure</h1></div>
<p class="sub">How the device organizes memory and what to send to request data. Dumps and presets build on these.</p>

<div class="fieldgrid">
  <div class="field"><div class="fl">Tones</div><div class="fin"><input value={tones ?? '—'} readonly /><span class="unit">per patch</span></div><div class="fhint">Layered/split voices, each addressed by the tone stride</div></div>
  <div class="field"><div class="fl">Device ID</div><div class="fin"><input value={merged?.deviceId ?? '—'} readonly /><span class="unit">(hex) unit #</span></div><div class="fhint">Byte 3 of every SysEx message</div></div>
  <div class="field"><div class="fl">Tone base address</div><div class="fin"><input value={tone?.base ?? '—'} readonly /><span class="unit">tone 1</span></div><div class="fhint">First tone's parameter block</div></div>
  <div class="field"><div class="fl">Tone stride</div><div class="fin"><input value={tone?.stride ?? '—'} readonly /><span class="unit">per tone</span></div><div class="fhint">Added per tone index to reach the next tone</div></div>
</div>

<div class="reqbox">
  <div class="rl">Message shapes</div>
  <div class="reqfield"><div class="rname">Set parameter (DT1)</div><div class="rmsg">{tpl('dt1')}</div></div>
  <div class="reqfield"><div class="rname">Request parameter (RQ1)</div><div class="rmsg">{tpl('rq1')}</div></div>
</div>
