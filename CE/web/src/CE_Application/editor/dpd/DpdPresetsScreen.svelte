<script>
  // Presets — the preset model (what a slot IS) + the librarian (what the user KEEPS).
  // Top half authors `model.presets`: the bank slot map (factory/ROM vs writable user), the recall
  // action (pc / bankPc / sysex) with a live compiled preview, the name request and the init patch.
  // Bottom half operates: scan slot names, capture them into persisted library banks, recall slots,
  // send captured patches back (ROM slots refused by the slot map), export/import banks.
  import { validatePresets } from '../../generated/dpd/validate.mjs';
  import { hexToBytes } from '../../generated/dpd/codecs.mjs';
  import { buildLegacyProfile } from '../../generated/dpd/emit-legacy-core.mjs';
  import {
    localCompilePresetRecall,
    presetSlotInfo,
    presetModelSlots,
  } from '../../stores/deviceProfileLocalEngine.js';
  import { startPresetListScan, cancelPresetListScan } from '../../stores/devicePresetJobs.js';
  import { latestPresetListScan } from '../../stores/deviceProfileStores.js';
  import {
    presetLibrary,
    createLibraryBank,
    renameLibraryBank,
    removeLibraryBank,
    captureScanToLibrary,
    renameLibraryEntry,
    removeLibraryEntry,
    recallPreset,
    sendEntryToDevice,
    exportLibraryBankJson,
    importLibraryBankJson,
    exportLibraryBankSyx,
    displayNameForSlot,
  } from '../../stores/presetLibrarian.js';
  import { isJuceAvailable } from '../../bridge/bridge.js';
  import NumberCell from '../../properties/NumberCell.svelte';

  let { model, merged, profileId = '' } = $props();

  const ROLES = ['factory', 'user'];
  const RECALL_KINDS = [
    { id: 'pc', label: 'Program Change' },
    { id: 'bankPc', label: 'Bank Select + PC' },
    { id: 'sysex', label: 'SysEx template' },
  ];

  let presets = $derived(model?.presets ?? null);
  let banks = $derived(presets?.banks ?? []);
  let errors = $derived.by(() => {
    if (!presets) return [];
    const out = [];
    validatePresets($state.snapshot(presets), (m) => out.push(m));
    return out;
  });
  let totalSlots = $derived(banks.reduce((sum, b) => sum + (Number(b.slotCount) || 0), 0));

  // A legacy-shaped probe of just what the local engine needs (variables + presets + scan plumbing) —
  // recall preview and dry-run scans work on the draft model without saving to the engine first.
  let probeProfile = $derived.by(() => {
    if (!merged || !presets) return null;
    try {
      return buildLegacyProfile($state.snapshot(merged), { legacyId: profileId || `${merged.id}-dpd` });
    } catch {
      return null;
    }
  });
  let deviceIdByte = $derived(merged?.deviceId ? hexToBytes(merged.deviceId)[0] : 16);

  function definePresetModel() {
    model.presets = { banks: [], recall: { kind: 'pc' } };
    if (!model.presets.banks.length) addBank();
  }
  function addBank() {
    const list = (model.presets.banks ??= []);
    const nextStart = list.reduce((m, b) => Math.max(m, (Number(b.startSlot) || 0) + (Number(b.slotCount) || 0)), 0);
    list.push({ id: list.length === 0 ? 'factory' : `bank-${list.length + 1}`, label: '', role: list.length === 0 ? 'factory' : 'user', startSlot: nextStart, slotCount: 64 });
  }
  function removeBank(i) { model.presets.banks.splice(i, 1); }
  function setRecallKind(kind) {
    const prev = model.presets.recall ?? {};
    model.presets.recall = { kind };
    if (prev.channel) model.presets.recall.channel = prev.channel;
    if (kind === 'sysex') model.presets.recall.template = prev.template ?? ['F0', '7D', '$deviceId', '0C', '$slot', 'F7'];
    if (kind === 'sysex' && prev.checksum) model.presets.recall.checksum = prev.checksum;
  }
  let templateText = $state('');
  let templateFor = null;
  $effect(() => {
    const t = presets?.recall?.template;
    if (t !== templateFor) { templateFor = t; templateText = (t ?? []).join(' '); }
  });
  function applyTemplate() {
    if (presets?.recall) { model.presets.recall.template = templateText.trim().split(/\s+/).filter(Boolean); templateFor = model.presets.recall.template; }
  }

  // ── recall preview ──
  let previewSlot = $state(0);
  let recallPreview = $derived.by(() => {
    if (!probeProfile) return null;
    return localCompilePresetRecall(probeProfile, { slot: previewSlot });
  });
  let previewInfo = $derived(probeProfile ? presetSlotInfo(probeProfile, previewSlot) : null);

  // ── name request ──
  let shapeIds = $derived((merged?.messageShapes ?? []).map((s) => s.id));

  // ── librarian ──
  let live = $derived(isJuceAvailable());
  let scan = $derived($latestPresetListScan);
  let library = $derived($presetLibrary[profileId || merged?.id]?.banks ?? []);
  let libraryKey = $derived(profileId || merged?.id || '');
  let statusLine = $state('');

  function runScan() {
    if (!probeProfile) return;
    statusLine = '';
    startPresetListScan({
      profileId: libraryKey,
      deviceRole: 'mainSynth',
      source: live ? '' : JSON.stringify(probeProfile),
      dryRun: !live,
    });
  }
  function capture() {
    const result = captureScanToLibrary(libraryKey, $state.snapshot(scan), { label: `Scan ${new Date().toLocaleDateString()}` });
    statusLine = result.ok ? `Captured ${result.captured} preset(s) into a new bank.` : result.error;
  }
  function recall(slot) {
    if (!probeProfile) return;
    const result = recallPreset(probeProfile, { slot, deviceRole: 'mainSynth' });
    statusLine = result.ok
      ? (result.sent ? `Recalled slot ${slot} (${result.messages.map((m) => m.hex).join(' · ')})` : `Recall preview: ${result.messages.map((m) => m.hex).join(' · ')}`)
      : result.error;
  }
  function sendEntry(bank, entry) {
    if (!probeProfile) return;
    const result = sendEntryToDevice(probeProfile, entry, { deviceRole: 'mainSynth', dryRun: !live });
    statusLine = result.ok ? `Sending "${entry.name}" to slot ${result.slot}${result.dryRun ? ' (dry run)' : ''}.` : result.error;
  }
  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  function exportJson(bank) {
    const payload = exportLibraryBankJson(libraryKey, bank.id);
    if (payload) download(`${bank.label || bank.id}.ceditor-presets.json`, new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  }
  function exportSyx(bank) {
    const result = exportLibraryBankSyx(libraryKey, bank.id);
    if (!result.ok) { statusLine = result.error; return; }
    download(`${bank.label || bank.id}.syx`, new Blob([new Uint8Array(result.bytes)], { type: 'application/octet-stream' }));
  }
  async function importJson(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const result = importLibraryBankJson(libraryKey, JSON.parse(await file.text()));
      statusLine = result.ok ? 'Bank imported.' : result.error;
    } catch (e) {
      statusLine = e?.message ?? 'Import failed.';
    }
  }

  // First rows shown in the slot browser (model slots annotated with the best-known name).
  const BROWSER_LIMIT = 128;
  let browserSlots = $derived.by(() => {
    if (!probeProfile) return [];
    return presetModelSlots(presets).slice(0, BROWSER_LIMIT).map((slot) => {
      const info = presetSlotInfo(probeProfile, slot);
      const named = displayNameForSlot(probeProfile, slot, { scan, bank: null });
      return { slot, info, ...named };
    });
  });
  const sel = (e) => e.target.select();
</script>

<div class="shead"><h1>Presets</h1></div>
<p class="sub">
  The preset model says what a slot <i>is</i> — which bank, factory ROM or writable user, how to recall
  it, how to read its name. The librarian below keeps what you capture: named banks you can rename,
  export, and send back (ROM slots are refused).
</p>

{#if !presets}
  <div class="layoutbox">
    <div class="needmap">
      <div class="nmh">No preset model yet</div>
      <p>This device has no slot map. Define one to unlock the preset browser, the librarian, and ROM-write protection — start from the device manual's bank table (e.g. "Preset A 0–63, User 64–127").</p>
      <button class="asbtn" onclick={definePresetModel}>Define preset model</button>
    </div>
  </div>
{:else}
  <!-- slot map strip -->
  {#if banks.length}
    <div class="bankstrip">
      {#each banks as bank (bank.id)}
        <div class={['bankseg', bank.role]} style={`flex-grow:${Math.max(1, Number(bank.slotCount) || 1)}`}
          title={`${bank.label || bank.id} · slots ${bank.startSlot}–${(Number(bank.startSlot) || 0) + (Number(bank.slotCount) || 1) - 1}`}>
          <span class="bs-name">{bank.label || bank.id}</span>
          <span class="bs-range">{bank.startSlot}–{(Number(bank.startSlot) || 0) + (Number(bank.slotCount) || 1) - 1}{#if bank.role === 'factory'} · ROM{/if}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- banks table -->
  <div class="layoutbox">
    <div class="lh"><span class="lt">Slot map</span><span class="lm">{banks.length} bank(s) · {totalSlots} slots</span></div>
    <div class="dlhead presetgrid"><span>id</span><span>label</span><span>role</span><span>writable</span><span>start</span><span>count</span><span>PC base</span><span>MSB</span><span>LSB</span><span></span></div>
    {#each banks as bank, i (i)}
      <div class="dlrow presetgrid">
        <input class="psel" bind:value={bank.id} onfocus={sel} />
        <input class="psel" bind:value={bank.label} placeholder={bank.id} onfocus={sel} />
        <select class="csel" bind:value={bank.role}>
          {#each ROLES as role (role)}<option value={role}>{role}</option>{/each}
        </select>
        <input type="checkbox" checked={bank.writable != null ? bank.writable === true : bank.role === 'user'}
          onchange={(e) => bank.writable = e.target.checked} title="May the librarian overwrite these slots?" />
        <span class="nc-wrap"><NumberCell min={0} value={bank.startSlot} onchange={(v) => bank.startSlot = v} /></span>
        <span class="nc-wrap"><NumberCell min={1} value={bank.slotCount} onchange={(v) => bank.slotCount = v} /></span>
        <span class="nc-wrap"><NumberCell min={0} max={127} value={bank.programBase} onchange={(v) => bank.programBase = v} /></span>
        <span class="nc-wrap"><NumberCell min={0} max={127} value={bank.bankMsb} onchange={(v) => bank.bankMsb = v} /></span>
        <span class="nc-wrap"><NumberCell min={0} max={127} value={bank.bankLsb} onchange={(v) => bank.bankLsb = v} /></span>
        <button class="xbtn" title="remove bank" onclick={() => removeBank(i)}>✕</button>
      </div>
    {/each}
    <button class="addslot asbtn" onclick={addBank}>+ Add bank</button>
    {#each errors as error (error)}<div class="warnrow">⚠ {error}</div>{/each}
  </div>

  <!-- recall + name request + init patch -->
  <div class="layoutbox">
    <div class="lh"><span class="lt">Recall action</span><span class="lm">"recall slot S" → the right bytes for this device</span></div>
    <div class="recallrow">
      <select class="csel" value={presets.recall?.kind ?? 'pc'} onchange={(e) => setRecallKind(e.target.value)}>
        {#each RECALL_KINDS as kind (kind.id)}<option value={kind.id}>{kind.label}</option>{/each}
      </select>
      {#if presets.recall}
        <label class="lm">channel <span class="nc-wrap inline"><NumberCell min={1} max={16} value={presets.recall.channel} onchange={(v) => presets.recall.channel = v} /></span></label>
      {/if}
      {#if presets.recall?.kind === 'sysex'}
        <input class="psel grow" bind:value={templateText} onblur={applyTemplate}
          placeholder="F0 7D $deviceId 0C $slot $checksum F7" title="Tokens: hex bytes, $deviceId, $slot, $program, $bankMsb, $bankLsb, $checksum" />
      {/if}
      <label class="lm">preview slot <span class="nc-wrap inline"><NumberCell min={0} value={previewSlot} onchange={(v) => previewSlot = v} /></span></label>
    </div>
    <div class="rtbar">
      {#if recallPreview?.ok}
        <span class="status-pill"><span class="chk ok">✓</span> {recallPreview.messages.map((m) => m.hex).join('  ·  ')}</span>
        {#if previewInfo?.inBank}<span class="tag">{previewInfo.bankLabel || previewInfo.bankId}{previewInfo.writable ? '' : ' · ROM'}</span>{/if}
      {:else}
        <span class="status-pill warn"><span class="chk warn">!</span> {recallPreview?.error ?? 'No recall action'}</span>
      {/if}
    </div>
    <div class="recallrow">
      <span class="lm">Name request</span>
      <select class="csel" value={presets.nameRequest?.request ?? ''}
        onchange={(e) => model.presets.nameRequest = e.target.value ? { request: e.target.value, slotVariable: presets.nameRequest?.slotVariable ?? 'slot' } : undefined}>
        <option value="">— none —</option>
        {#each shapeIds as id (id)}<option value={id}>{id}</option>{/each}
      </select>
      {#if presets.nameRequest}
        <label class="lm">slot variable <input class="psel" bind:value={model.presets.nameRequest.slotVariable} placeholder="slot" onfocus={sel} /></label>
      {/if}
      <span class="lm">Init patch</span>
      <span class="nc-wrap inline" title="Slot of the device's init/neutral patch">
        <NumberCell min={0} value={presets.initPatch?.slot ?? ''} onchange={(v) => model.presets.initPatch = { slot: Number(v) }} />
      </span>
    </div>
  </div>

  <!-- librarian: browse / scan / capture -->
  <div class="layoutbox">
    <div class="lh">
      <span class="lt">Preset browser</span>
      <span class="lm">{live ? 'device connected' : 'no device — dry run'} · names: library › scan › catalog</span>
    </div>
    <div class="recallrow">
      {#if scan?.running}
        <button class="asbtn" onclick={() => cancelPresetListScan({})}>Cancel scan</button>
        <span class="lm">Scanning… {scan.completed ?? 0}/{scan.total ?? '?'}</span>
      {:else}
        <button class="asbtn" onclick={runScan} disabled={!presets.nameRequest && !probeProfile?.presetBrowser}>Scan names from device</button>
        {#if scan?.entries?.length}<button class="asbtn" onclick={capture}>Capture scan → library bank</button>{/if}
      {/if}
      {#if statusLine}<span class="lm">{statusLine}</span>{/if}
    </div>
    {#if browserSlots.length}
      <div class="dlhead browsegrid"><span>slot</span><span>bank</span><span>name</span><span>source</span><span></span></div>
      <div class="browselist">
        {#each browserSlots as row (row.slot)}
          <div class="dlrow browsegrid">
            <span class="lm">{row.slot}</span>
            <span class="lm">{row.info.bankLabel || row.info.bankId}{row.info.writable ? '' : ' 🔒'}</span>
            <span>{row.name || '—'}</span>
            <span class="lm">{row.source === 'none' ? '' : row.source}</span>
            <button class="asbtn" onclick={() => recall(row.slot)} title="Send the recall action for this slot">Recall</button>
          </div>
        {/each}
      </div>
      {#if presetModelSlots(presets).length > BROWSER_LIMIT}
        <div class="lm" style="padding:6px 10px">Showing the first {BROWSER_LIMIT} of {presetModelSlots(presets).length} slots.</div>
      {/if}
    {/if}
  </div>

  <!-- librarian: persisted banks -->
  <div class="layoutbox">
    <div class="lh">
      <span class="lt">Library</span>
      <span class="lm">{library.length} saved bank(s) · stored locally per profile</span>
    </div>
    <div class="recallrow">
      <button class="asbtn" onclick={() => createLibraryBank(libraryKey, {})}>+ New bank</button>
      <label class="asbtn importlbl">Import bank JSON<input type="file" accept=".json,application/json" onchange={importJson} hidden /></label>
    </div>
    {#each library as bank (bank.id)}
      <div class="libbank">
        <div class="lh">
          <input class="psel" value={bank.label} onchange={(e) => renameLibraryBank(libraryKey, bank.id, e.target.value)} onfocus={sel} />
          <span class="lm">{bank.entries.length} preset(s)</span>
          <button class="asbtn" onclick={() => exportJson(bank)}>Export JSON</button>
          <button class="asbtn" onclick={() => exportSyx(bank)} title="Concatenated captured SysEx">Export .syx</button>
          <button class="xbtn" title="delete bank" onclick={() => removeLibraryBank(libraryKey, bank.id)}>✕</button>
        </div>
        {#each bank.entries as entry (entry.slot)}
          <div class="dlrow librow">
            <span class="lm">{entry.slot}</span>
            <input class="psel" value={entry.name} onchange={(e) => renameLibraryEntry(libraryKey, bank.id, entry.slot, e.target.value)} onfocus={sel} />
            <span class="tag">{entry.source}{entry.hex ? ' · data' : ''}</span>
            <button class="asbtn" disabled={!entry.hex || !(probeProfile && presetSlotInfo(probeProfile, entry.slot).writable)}
              title={!entry.hex ? 'Name only — no captured patch data' : (probeProfile && !presetSlotInfo(probeProfile, entry.slot).writable ? 'Slot is factory ROM' : 'Send the captured patch back to the device')}
              onclick={() => sendEntry(bank, entry)}>Send</button>
            <button class="asbtn" onclick={() => recall(entry.slot)}>Recall</button>
            <button class="xbtn" title="remove" onclick={() => removeLibraryEntry(libraryKey, bank.id, entry.slot)}>✕</button>
          </div>
        {:else}
          <div class="lm" style="padding:6px 10px">Empty — capture a scan into it, or import.</div>
        {/each}
      </div>
    {/each}
  </div>
{/if}

<style>
  .bankstrip { display: flex; gap: 2px; margin: 10px 0; border-radius: 6px; overflow: hidden; }
  .bankseg { padding: 6px 10px; min-width: 60px; background: #1d2733; display: flex; flex-direction: column; gap: 2px; }
  .bankseg.factory { background: #2a2333; }
  .bs-name { font-weight: 600; font-size: 12px; }
  .bs-range { font-size: 11px; opacity: 0.65; }
  .presetgrid { display: grid; grid-template-columns: 1fr 1.2fr 90px 26px 64px 64px 64px 56px 56px 28px; gap: 6px; align-items: center; }
  .browsegrid { display: grid; grid-template-columns: 56px 140px 1fr 80px 70px; gap: 6px; align-items: center; }
  .browselist { max-height: 300px; overflow-y: auto; }
  .librow { display: grid; grid-template-columns: 56px 1fr 110px 70px 70px 28px; gap: 6px; align-items: center; }
  .recallrow { display: flex; gap: 10px; align-items: center; padding: 8px 10px; flex-wrap: wrap; }
  .recallrow .grow { flex: 1; min-width: 260px; }
  .libbank { border-top: 1px solid rgba(255, 255, 255, 0.06); }
  .importlbl { cursor: pointer; }
  .warnrow { padding: 4px 10px; font-size: 12px; }
  /* Wrappers keeping NumberCell inside its grid column / row slot. */
  .nc-wrap { display: flex; min-width: 0; }
  .nc-wrap.inline { display: inline-flex; width: 74px; vertical-align: middle; }
</style>
