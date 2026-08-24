<script>
  /**
   * The connection-and-diagnostics half of the MIDI workbench.
   *
   * `docs/midi-workbench.md` listed seven concrete GUI gaps. Four of them were still open after the
   * rest were built, and they are one surface rather than four: which ports am I on, who answered,
   * send me some bytes, and what did that dump say. Each was a store with nothing rendering it —
   * `latestDeviceIdentityReply` in particular has existed and been invisible, which is the whole
   * shape of the problem: the data arrives and the app never shows it.
   *
   * Kept out of the Monitor tab deliberately. That tab answers "what is going past", which you read
   * while doing something else; this one answers "what am I connected to and what does it say",
   * which you use when something is wrong. Merging them would bury the diagnostics under a scrolling
   * log at exactly the moment you need them.
   *
   * WHAT IS NOT HERE, on purpose: nothing that writes a profile. Learning a parameter's address is
   * the DPD's job (see the note in `known-issues.md` about why that is a different thing from the
   * MIDI learn chips), and a diagnostics surface that quietly edited a profile would be a trap.
   */
  import { get } from 'svelte/store';

  import {
    midiDestinations,
    midiInputs,
    selectedMidiDestinationId,
    selectedMidiInputId,
    selectedDeviceProfileId,
    latestDeviceIdentityReply,
    latestSysexInputMessage,
    latestDumpParseResult,
    discoveredMidiCiProfiles,
    midiCiStatus,
    requestMidiCiDiscovery,
  } from '../stores/deviceProfileStores.js';
  import { parseProfileDump } from '../stores/deviceMidiOps.js';
  import { triggerRawMidiAction } from '../bridge/bridge.js';
  import { parseRawMidiHexText } from '../stores/deviceProfileLocalEngine.js';

  let rawHex = $state('');
  let dumpHex = $state('');
  let sendNote = $state('');

  const destinations = $derived($midiDestinations ?? []);
  const inputs = $derived($midiInputs ?? []);
  const identity = $derived($latestDeviceIdentityReply);
  const ciProfiles = $derived($discoveredMidiCiProfiles ?? []);
  const parsed = $derived($latestDumpParseResult);

  // Validate as you type rather than on send. A malformed byte is the overwhelmingly common mistake
  // here and finding out at send time means finding out from the synth, which says nothing.
  const rawCheck = $derived(rawHex.trim() ? parseRawMidiHexText(rawHex) : null);
  const dumpCheck = $derived(dumpHex.trim() ? parseRawMidiHexText(dumpHex) : null);

  function sendRaw() {
    if (!rawCheck?.ok) return;
    triggerRawMidiAction({
      deviceRole: 'primary',
      actionId: `workbench_${Date.now()}`,
      message: rawHex.trim(),
      dryRun: false,
    });
    sendNote = `Sent ${rawCheck.bytes.length} byte(s)`;
  }

  /** Pull whatever SysEx arrived last into the box, so a capture is one click rather than a copy. */
  function captureLastSysex() {
    const last = get(latestSysexInputMessage);
    const hex = last?.hex ?? last?.message ?? '';
    if (hex) dumpHex = String(hex);
  }

  function decodeDump() {
    if (!dumpCheck?.ok) return;
    parseProfileDump({
      requestId: `workbench_${Date.now()}`,
      profileId: get(selectedDeviceProfileId),
      hex: dumpHex.trim(),
      source: '',
    });
  }

  const decodedValues = $derived(
    parsed?.ok && parsed.values && typeof parsed.values === 'object'
      ? Object.entries(parsed.values)
      : [],
  );
</script>

<div class="workbench">
  <section>
    <h3>Ports</h3>
    <p class="sub">Which MIDI ports this panel is talking through. The same selection the Device tab
      uses — repeated here because a connection problem is diagnosed from this screen.</p>
    <label class="row">
      <span>Output</span>
      <select class="val" bind:value={$selectedMidiDestinationId}>
        {#each destinations as port (port.id)}<option value={port.id}>{port.name}</option>{/each}
      </select>
    </label>
    <label class="row">
      <span>Input</span>
      <select class="val" bind:value={$selectedMidiInputId}>
        {#each inputs as port (port.id)}<option value={port.id}>{port.name}</option>{/each}
      </select>
    </label>
  </section>

  <section>
    <h3>Identity</h3>
    <p class="sub">What answered a Device Inquiry, and what MIDI-CI discovery found. Blank until
      something replies — which is itself the answer when a cable is wrong.</p>
    {#if identity}
      <dl class="facts">
        <dt>Manufacturer</dt><dd>{identity.manufacturer ?? identity.manufacturerId ?? '—'}</dd>
        <dt>Family</dt><dd>{identity.family ?? identity.familyCode ?? '—'}</dd>
        <dt>Model</dt><dd>{identity.model ?? identity.modelNumber ?? '—'}</dd>
        <dt>Version</dt><dd>{identity.version ?? identity.softwareRevision ?? '—'}</dd>
      </dl>
    {:else}
      <p class="empty">No identity reply yet.</p>
    {/if}

    <div class="actions">
      <button class="btn" onclick={() => requestMidiCiDiscovery('primary')}>Run MIDI-CI discovery</button>
      <span class="status">{$midiCiStatus?.message || $midiCiStatus?.state || 'idle'}</span>
    </div>
    {#if ciProfiles.length}
      <ul class="list">
        {#each ciProfiles as profile (profile.muid ?? profile.profileId)}
          <li>{profile.name ?? profile.profileId} <span class="dim">{profile.muid ?? ''}</span></li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h3>Send raw MIDI</h3>
    <p class="sub">Bytes as hex — <code>B0 4A 64</code>, or a whole SysEx starting <code>F0</code>.
      Goes out through the same filtered path a control's binding uses, so an
      <code>interceptMidiOut</code> filter sees it too.</p>
    <textarea class="val" rows="2" bind:value={rawHex} placeholder="F0 41 10 00 00 41 11 ... F7"></textarea>
    {#if rawCheck && !rawCheck.ok}<p class="bad">{rawCheck.error}</p>{/if}
    <div class="actions">
      <button class="btn primary" onclick={sendRaw} disabled={!rawCheck?.ok}>Send</button>
      <span class="status">{rawCheck?.ok ? `${rawCheck.bytes.length} byte(s)` : ''} {sendNote}</span>
    </div>
  </section>

  <section>
    <h3>Capture a dump</h3>
    <p class="sub">Paste a bulk dump, or take the last SysEx that arrived, and decode it against the
      selected profile. This is the read half of the codec — what the synth said, in parameter names
      rather than hex.</p>
    <textarea class="val" rows="3" bind:value={dumpHex} placeholder="F0 ... F7"></textarea>
    {#if dumpCheck && !dumpCheck.ok}<p class="bad">{dumpCheck.error}</p>{/if}
    <div class="actions">
      <button class="btn" onclick={captureLastSysex}>Take last SysEx</button>
      <button class="btn primary" onclick={decodeDump} disabled={!dumpCheck?.ok}>Decode</button>
    </div>

    {#if parsed && !parsed.running}
      {#if parsed.ok}
        <p class="good">Matched <b>{parsed.dumpName || parsed.dumpId}</b> · checksum {parsed.checksumStatus}</p>
        <table class="values">
          <tbody>
            {#each decodedValues as [id, value] (id)}
              <tr><td class="pid">{id}</td><td>{value}</td></tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="bad">{parsed.error} <span class="dim">({parsed.matchStatus})</span></p>
      {/if}
    {/if}
  </section>
</div>

<style>
  .workbench { display: flex; flex-direction: column; gap: 18px; padding: 12px; overflow-y: auto; }
  section { display: flex; flex-direction: column; gap: 6px; }
  h3 { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: .02em; }
  .sub { margin: 0 0 4px; font-size: 11px; opacity: .7; line-height: 1.45; }
  .row { display: grid; grid-template-columns: 72px 1fr; align-items: center; gap: 8px; }
  .row span { font-size: 11px; opacity: .8; }
  .val {
    height: var(--pp-field-height, 26px);
    box-sizing: border-box; min-width: 0; width: 100%;
    font-size: 11px; padding: 0 6px;
  }
  textarea.val { height: auto; padding: 5px 6px; font-family: ui-monospace, monospace; resize: vertical; }
  .actions { display: flex; align-items: center; gap: 8px; }
  .btn { height: 24px; padding: 0 10px; font-size: 11px; cursor: pointer; }
  .btn:disabled { opacity: .45; cursor: default; }
  .status { font-size: 11px; opacity: .7; }
  .facts { display: grid; grid-template-columns: 92px 1fr; gap: 2px 8px; margin: 0; font-size: 11px; }
  .facts dt { opacity: .65; }
  .facts dd { margin: 0; font-family: ui-monospace, monospace; }
  .empty, .dim { font-size: 11px; opacity: .55; }
  .good { font-size: 11px; color: #7fd18a; margin: 6px 0 0; }
  .bad { font-size: 11px; color: #e06c6c; margin: 4px 0 0; }
  .list { margin: 4px 0 0; padding-left: 16px; font-size: 11px; }
  .values { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
  .values td { padding: 2px 4px; border-bottom: 1px solid rgba(255,255,255,.06); }
  .pid { font-family: ui-monospace, monospace; opacity: .8; width: 45%; }
</style>
