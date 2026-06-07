<script>
  // Advanced — the power-user escape hatch re-housed from the legacy DeviceProfileDesigner:
  //   (1) raw new-DPD source (JSON) edit + validate + apply,
  //   (2) the engine's test vectors (Run tests),
  //   (3) SysEx dump parsing.
  // Most editing happens on the visual screens; this is the fallback.
  import { runTestsForProfile, parseProfileDump, latestProfileTestResult, latestDumpParseResult } from '../../stores/deviceProfiles.js';
  import { validateProfile } from '../../generated/dpd/validate.mjs';

  let { model, profileId = '', onApplyModel } = $props();

  // ---- raw source (the new-schema model as JSON) ----
  let sourceText = $state('');
  let sourceStatus = $state('');
  let editing = $state(false);
  let lastModelRef = null;
  $effect(() => {
    // re-sync the textarea from the model when the model changes, unless the user is mid-edit
    if (model !== lastModelRef && !editing) { lastModelRef = model; sourceText = model ? JSON.stringify(model, null, 2) : ''; }
  });
  function validateSource() {
    try { const v = validateProfile(JSON.parse(sourceText)); sourceStatus = v.ok ? 'valid ✓' : ('invalid: ' + v.errors.join('; ')); }
    catch (e) { sourceStatus = 'parse error: ' + e.message; }
  }
  function applySource() {
    let parsed;
    try { parsed = JSON.parse(sourceText); } catch (e) { sourceStatus = 'parse error: ' + e.message; return; }
    const v = validateProfile(parsed);
    if (!v.ok) { sourceStatus = 'invalid: ' + v.errors.join('; '); return; }
    onApplyModel?.(parsed);
    editing = false;
    sourceStatus = 'applied ✓ — use “Save to engine” to persist';
  }

  // ---- engine tests + dump parse (operate on the loaded engine profile via the bridge) ----
  let dumpHex = $state('');
  function runTests() { if (profileId) runTestsForProfile(profileId); }
  function parseDump() { if (profileId) parseProfileDump({ requestId: `dpd_dump_${profileId}`, profileId, hex: dumpHex }); }

  let testResult = $derived($latestProfileTestResult?.profileId === profileId ? $latestProfileTestResult : null);
  let dumpResult = $derived($latestDumpParseResult?.profileId === profileId ? $latestDumpParseResult : null);
</script>

<div class="shead"><h1>Advanced</h1></div>
<p class="sub">Power-user tools: edit the raw profile source, run the engine's test vectors, and parse a SysEx dump. Most editing happens on the visual screens — this is the escape hatch.</p>

<div class="advsec">
  <div class="advhead">
    <span class="advh">New-DPD source (JSON)</span>
    <div class="advspacer"></div>
    <button class="btn sm" onclick={() => validateSource()}>Validate</button>
    <button class="btn sm primary" onclick={() => applySource()}>Apply</button>
    {#if sourceStatus}<span class="advstatus">{sourceStatus}</span>{/if}
  </div>
  <textarea class="advcode" bind:value={sourceText} oninput={() => editing = true} spellcheck="false"></textarea>
</div>

<div class="advsec">
  <div class="advhead">
    <span class="advh">Engine test vectors</span>
    <div class="advspacer"></div>
    <button class="btn sm" onclick={() => runTests()}>Run tests</button>
    {#if testResult}<span class="advstatus">{testResult.running ? 'running…' : (testResult.total ?? 0) === 0 ? 'no test vectors in this profile' : `${testResult.passed ?? 0}/${testResult.total} passed`}</span>{/if}
  </div>
  {#if testResult?.results?.length}
    <div class="layoutbox">
      {#each testResult.results as t, i (t.name + i)}
        <div class="offsetrow">
          <div class="off"><span class={['chk', t.passed ? 'ok' : 'warn']} style="width:16px;height:16px;font-size:10px">{t.passed ? '✓' : '!'}</span></div>
          <div class="pp">{t.name}</div>
          <div class="enc">{t.kind ?? ''}</div>
          <div class="ck"></div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<div class="advsec">
  <div class="advhead">
    <span class="advh">Parse SysEx dump</span>
    <div class="advspacer"></div>
    <button class="btn sm" onclick={() => parseDump()}>Parse</button>
    {#if dumpResult}<span class="advstatus">{dumpResult.running ? 'parsing…' : dumpResult.ok ? `parsed: ${dumpResult.dumpName ?? dumpResult.dumpId ?? 'ok'} · checksum ${dumpResult.checksumStatus ?? 'n/a'}` : ('error: ' + (dumpResult.error ?? 'failed'))}</span>{/if}
  </div>
  <textarea class="advcode short" bind:value={dumpHex} placeholder="F0 41 7F 00 00 41 12 …  F7" spellcheck="false"></textarea>
</div>

<style>
  /* component-scoped; tokens (var(--bg) etc.) inherit from the .dpd-app ancestor */
  .advsec{margin-bottom:22px;max-width:880px}
  .advhead{display:flex;align-items:center;gap:9px;margin-bottom:10px}
  .advhead .advh{font-weight:700;font-size:13.5px}
  .advspacer{flex:1}
  .advstatus{font-size:11.5px;color:var(--txt-dim);font-family:'JetBrains Mono',monospace}
  .advcode{width:100%;min-height:300px;background:var(--bg);border:1px solid var(--line-2);border-radius:10px;
    padding:14px;color:var(--txt);font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.5;resize:vertical;outline:none;box-sizing:border-box}
  .advcode:focus{border-color:var(--violet)}
  .advcode.short{min-height:90px}
</style>
