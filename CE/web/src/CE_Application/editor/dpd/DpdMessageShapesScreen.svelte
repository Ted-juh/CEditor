<script>
  // Message shapes — the SysEx envelopes inherited from the manufacturer (DT1/RQ1), with their
  // byte order + checksum. Defined once; the parameter table and dumps build on them.
  let { merged } = $props();
  let shapes = $derived(merged?.messageShapes ?? []);

  function tpl(s) {
    return (s.template ?? []).map((t) =>
      t === '$deviceId' ? merged.deviceId : t === '$modelId' ? merged.modelId
      : t === '$address' ? '[addr]' : t === '$encodedValue' ? '[value]' : t === '$size' ? '[size]' : t === '$checksum' ? '[sum]' : t
    ).join(' ');
  }
  function byteOrderLabel(b) { return b === 'msb-first' ? '14-bit · MSB first' : b === 'lsb-first' ? '14-bit · LSB first' : (b ?? '—'); }
  function checksumLabel(c) { return c?.type === 'roland-7bit' ? 'Roland · (128 − Σ) mod 128' : (c?.type ?? 'none'); }
</script>

<div class="shead"><h1>Message shapes</h1></div>
<p class="sub">Defined once per device. Inherited from the {merged?.inherits ?? 'family'} template — rarely needs editing.</p>
<div class="note"><span>ⓘ</span><div>The parameter table and dumps both build on these shapes. Open one only if a row fails its round-trip check.</div></div>

{#each shapes as s (s.id)}
  <div class="layoutbox" style="margin-bottom:16px">
    <div class="lh">
      <span class="lt">{s.id.toUpperCase()} · {s.kind}</span>
      <span class="lm">{tpl(s)}</span>
      <span style="margin-left:auto" class="status-pill"><span class="chk ok">✓</span> {s.id}</span>
    </div>
    <div class="offsetrow"><div class="off">byte order</div><div class="pp">{byteOrderLabel(merged?.byteOrder)}</div><div class="enc"></div><div class="ck"></div></div>
    <div class="offsetrow"><div class="off">checksum</div><div class="pp">{checksumLabel(s.checksum ?? merged?.checksum)}</div><div class="enc"></div><div class="ck"></div></div>
  </div>
{:else}
  <div class="placeholder">No message shapes resolved for this device.</div>
{/each}
