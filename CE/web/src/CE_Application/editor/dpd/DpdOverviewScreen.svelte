<script>
  // Overview — the resolved view (doc "Layer 1 invisibility"): based-on inheritance card,
  // completeness meter (from provenance), and a settings table tagging each value inherited-vs-yours.
  import { familyLabel as familyLabelOf, byteOrderLabel, checksumLabel, shapeById } from './dpdLabels.js';
  let { model, merged } = $props();

  let family = $derived(familyLabelOf(model));
  let showInherited = $state(true);

  function header(m) {
    const dt1 = shapeById(m, 'dt1');
    if (!dt1) return '—';
    const toks = dt1.template ?? [];
    const i = toks.indexOf('12');
    return (i >= 0 ? toks.slice(0, i + 1) : toks).map((t) => t === '$deviceId' ? m.deviceId : t === '$modelId' ? m.modelId : t).join(' ');
  }

  let toneParamCount = $derived(Object.values(model?.scopes ?? {}).reduce((n, s) => n + (s.parameters?.length ?? 0), 0));
  let prov = $derived(model?.provenance ?? {});
  let checks = $derived([
    { key: 'params', done: toneParamCount > 0, label: `${toneParamCount} parameters defined` },
    { key: 'rt', done: prov.verifiedRoundTrip === true, label: 'Round-trip verified' },
    { key: 'hw', done: !!prov.verifiedOnHardware, label: prov.verifiedOnHardware ? `Hardware-confirmed ${prov.verifiedOnHardware}` : 'Hardware-confirmed' },
    { key: 'cc', done: (prov.confirmations ?? 0) > 0, label: `Community-confirmed (${prov.confirmations ?? 0})` },
    { key: 'fd', done: prov.verifiedFullDump === true, label: 'Full dump verified' },
  ]);
  let pct = $derived(checks.length ? Math.round(checks.filter((c) => c.done).length / checks.length * 100) : 0);

  let settings = $derived.by(() => {
    if (!model || !merged) return [];
    const own = (k) => model[k] !== undefined;
    const fam = family + ' family';
    return [
      { name: 'SysEx header', value: header(merged), own: own('messageShapes'), src: own('messageShapes') ? 'This model' : fam, addr: true },
      { name: 'Checksum', value: checksumLabel(merged.checksum), own: own('checksum'), src: own('checksum') ? 'This model' : fam },
      { name: 'Value byte order', value: byteOrderLabel(merged.byteOrder), own: own('byteOrder'), src: own('byteOrder') ? 'This model' : fam },
      { name: 'Device ID', value: merged.deviceId ?? '—', addr: true, own: own('deviceId'), src: own('deviceId') ? 'You changed this' : fam },
      { name: 'Model ID', value: model.modelId ?? '—', addr: true, own: true, src: 'This model' },
      { name: 'Tone parameters', value: `${model.scopes?.tone?.parameters?.length ?? 0} params · base ${model.scopes?.tone?.base ?? '—'}`, own: true, src: 'This model' },
    ];
  });
</script>

<div class="shead"><h1>{merged?.label ?? 'Overview'}</h1></div>
<p class="sub">One synth, fully resolved. Inherited settings are filled in from the family template — edit any of them and it becomes yours.</p>

<div class="basedon">
  <div class="bi">🎚️</div>
  <div class="bt">
    <div class="b1">Based on: <b>{family} family template</b></div>
    <div class="b2">Checksum, byte order &amp; SysEx header come from here — override any of it.</div>
  </div>
  <div class={['toggleview', showInherited && 'on']} role="switch" aria-checked={showInherited} tabindex="0"
    onclick={() => showInherited = !showInherited} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (showInherited = !showInherited)}>
    <span class="sw"></span> Show inherited vs. yours
  </div>
</div>

<div class="meter">
  <div class="mh"><span class={['chk', pct >= 80 ? 'ok' : 'warn']}>{pct >= 80 ? '✓' : '!'}</span><span class="mt">Profile completeness</span><span class="mpct">{pct}%</span></div>
  <div class="bar"><i style="width:{pct}%"></i></div>
  <div class="checks">
    {#each checks as c (c.key)}
      <div class={['mcheck', c.done ? 'done' : 'todo']}><span class="d"></span>{#if c.done}<b>✓</b>&nbsp;{/if}{c.label}</div>
    {/each}
  </div>
</div>

<div class="tablewrap" style="max-width:880px">
  <table>
    <thead><tr><th style="width:30%">Setting</th><th style="width:38%">Value</th><th style="width:24%">Source</th><th style="width:8%"></th></tr></thead>
    <tbody>
      {#each settings as s (s.name)}
        {#if showInherited || s.own}
          <tr class={[!s.own && 'inherited']}>
            <td><div class="cell pname">{s.name}</div></td>
            <td><div class="cell">{#if s.addr}<span class="addr">{s.value}</span>{:else}{s.value}{/if}</div></td>
            <td><div class="cell"><span class={['src', s.own && 'own']}>{s.src}</span><span class="rowmenu">⋯</span></div></td>
            <td></td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</div>
<div class="viewend">💡 Inherited rows are dimmed (from the family template); rows specific to this model are tagged <b>This model</b>.</div>
