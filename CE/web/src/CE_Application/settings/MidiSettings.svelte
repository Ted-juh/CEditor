<script>
  /**
   * MIDI ports, in Settings, where someone looking for them will look.
   *
   * The plumbing for this has existed the whole time — DeviceProfileServiceMidiIO enumerates real
   * ports with juce::MidiOutput::getAvailableDevices(), opens them and sends — but the only way to
   * reach it was three unlabelled dropdowns in the Device tab's toolbar, and they did not work
   * there. initDeviceProfileBridge registers the LISTENER for the port-list reply; it never asks for
   * the list. Only Player.svelte ever called listMidiDestinations()/listMidiInputs(), so in the
   * editor the dropdowns sat on their defaults — "Preview Only" and "No MIDI Input" — even on a
   * desktop build with a synth plugged in. Nothing was broken in the C++; nobody had asked it
   * anything.
   *
   * So this page asks, on open and on demand, and shows the answer with names on it. Selection goes
   * through mapDeviceRole exactly as the Device tab's dropdowns do, so the two stay in agreement and
   * the choice persists through the existing device-session settings rather than a second store.
   *
   * AS MANY SYNTHS AS YOU LIKE. Everything below the UI is already keyed by a device name —
   * bindings carry one, sends carry one, the mappings are a map of them — but every mapDeviceRole
   * call in the UI passed one hardcoded constant, `mainSynth`, so that was the only device anything
   * could configure. Meanwhile the GAIA panel's 183 bindings all name a device called `primary`,
   * which no settings path could reach; sending one resolves no mapping and gives up with "Not sent:
   * unresolved profile for primary".
   *
   * There are no slots here and no fixed number of them. A device is whatever the user called it,
   * and that name is the identity — no hidden id underneath, because a second identifier is a second
   * thing to keep in sync and a second thing to show by mistake. Renaming therefore rewrites the
   * bindings that referred to the old name, so the controls keep pointing at the same instrument.
   */
  import { onMount } from 'svelte';
  import Plug from 'lucide-svelte/icons/plug';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import {
    midiDestinations,
    midiInputs,
    deviceProfiles,
    deviceRoleMappings,
    selectedDeviceProfileId,
    selectedMidiDestinationId,
    selectedMidiInputId,
    mapDeviceRole,
    forgetDeviceRole,
    initDeviceProfileBridge,
    startDeviceSync,
    latestDeviceIdentityReply,
    latestDeviceRequestTimedOut,
    latestDeviceSyncResult,
  } from '../stores/deviceProfiles.js';
  import { listMidiDestinations, listMidiInputs, listDeviceProfiles, isJuceAvailable } from '../bridge/bridge.js';
  import { panels, updatePanel } from '../stores/panels.js';
  import { deviceRoleRows, renameRoleInPanel } from '../utils/deviceRoles.js';
  import { identityEventMatches, identityOutcome, identityTestBlocker } from '../utils/deviceIdentity.js';

  let hasBackend = $state(false);
  let refreshedAt = $state(null);
  let newRoleName = $state('');

  let outputs = $derived($midiDestinations ?? []);
  let inputs = $derived($midiInputs ?? []);

  // One row per device: what is already configured, plus whatever the open panels bind to. The
  // second half is the point — an unconfigured role is exactly the one that fails to send.
  let rows = $derived(deviceRoleRows($deviceRoleMappings ?? {}, $panels ?? []));

  // "Preview Only" and "Disabled"/"No MIDI Input" are always present — they are how you say "do not
  // send anywhere". Real hardware is anything else, and it is the only thing that answers the
  // question "did it find my synth".
  const isHardware = (port) => port?.type === 'hardwareOutput' || port?.type === 'hardwareInput';
  let hardwareOutputs = $derived(outputs.filter(isHardware));
  let hardwareInputs = $derived(inputs.filter(isHardware));

  const portOf = (list, id, fallback) => list.find((entry) => entry.id === id) ?? fallback;
  const outFor = (row) => portOf(outputs, row.mapping?.midiDestination?.id, null);
  const inFor = (row) => portOf(inputs, row.mapping?.midiInput?.id, null);
  const sendsHardware = (row) => isHardware(outFor(row));

  function refresh() {
    hasBackend = !!isJuceAvailable();
    if (!hasBackend) return;
    initDeviceProfileBridge();
    listDeviceProfiles();
    listMidiDestinations();
    listMidiInputs();
    refreshedAt = new Date().toLocaleTimeString();
  }

  onMount(refresh);

  const PREVIEW_ONLY = { type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' };
  const NO_INPUT = { type: 'none', id: 'none', name: 'No MIDI Input' };

  function apply(row, { destination, input, profile } = {}) {
    mapDeviceRole(row.role, profile ?? row.mapping?.profileId ?? $selectedDeviceProfileId, {
      midiDestination: portOf(outputs, destination ?? row.mapping?.midiDestination?.id, PREVIEW_ONLY),
      midiInput: portOf(inputs, input ?? row.mapping?.midiInput?.id, NO_INPUT),
      syncDirection: row.mapping?.syncDirection ?? 'pull',
    });
  }

  function addDevice() {
    const name = newRoleName.trim();
    if (!name || rows.some((row) => row.role === name)) return;
    mapDeviceRole(name, $selectedDeviceProfileId, { midiDestination: PREVIEW_ONLY, midiInput: NO_INPUT });
    newRoleName = '';
  }

  /**
   * Rename a device, and every control that names it.
   *
   * The name is the identity, so this is not cosmetic — leave the bindings alone and 183 controls go
   * on asking for a device that no longer exists. The panel's exportParameters name the device too,
   * and those are what an exported plugin binds to, so they move with it or the export breaks
   * somewhere the editor never shows.
   */
  function rename(row, event) {
    const next = event.currentTarget.value.trim();
    if (!next || next === row.role) { event.currentTarget.value = row.role; return; }
    if (rows.some((other) => other.role === next)) { event.currentTarget.value = row.role; return; }

    for (const panel of $panels ?? []) {
      const renamed = renameRoleInPanel(panel, row.role, next);
      if (renamed === panel) continue;
      updatePanel(panel.id, {
        controls: renamed.controls,
        exportParameters: renamed.exportParameters,
        requiredProfiles: renamed.requiredProfiles,
      });
    }
    if (row.mapping) {
      mapDeviceRole(next, row.mapping.profileId, {
        midiDestination: row.mapping.midiDestination,
        midiInput: row.mapping.midiInput,
        syncDirection: row.mapping.syncDirection,
      });
      forgetDeviceRole(row.role);
    }
  }

  function remove(row) {
    if (row.usedBy > 0) return;                  // still named by controls; removing would orphan them
    forgetDeviceRole(row.role);
  }

  /**
   * Ask the instrument who it is.
   *
   * A Universal Device Inquiry — MIDI's own handshake, which any compliant synth answers with its
   * manufacturer, family, model and firmware. It is the only thing here that proves the whole chain
   * end to end: the port is open, the cable is in, the instrument is listening and something came
   * back. Everything else on this page is a claim about what SHOULD happen.
   *
   * The reply arrives asynchronously on a store, so what is kept per device is only which test is
   * outstanding; the outcome is derived from whichever event names that device next.
   */
  let testing = $state({});                      // device name -> { at, correlationId, expired }

  // A backstop for "Asking…", which must never be a resting state. C++ times an identity request out
  // after the profile's own timeoutMs (1000ms for the GAIA) and emits deviceRequestTimedOut — but a
  // request that never went OUT is never made pending, so nothing times it out, and a failure result
  // carries no deviceRole to match on. Either way the card would wait forever. This ends it.
  const TEST_GIVE_UP_MS = 4000;

  function test(row) {
    const correlationId = `identity_${row.role}_${Date.now()}`;

    // Asked before sending, because both answers are already on this card. Sending anyway meant the
    // engine declined it ("Not sent: MIDI destination is preview-only") into the MIDI monitor on
    // another tab, while this card said "Asking…" and then reported nothing came back — which reads
    // as a silent instrument and was an app that never asked.
    const blocked = identityTestBlocker(row.mapping ?? {});
    if (blocked) {
      testing = { ...testing, [row.role]: { at: Date.now(), correlationId, expired: false, blocked } };
      return;
    }

    testing = { ...testing, [row.role]: { at: Date.now(), correlationId, expired: false } };
    startDeviceSync({
      correlationId,
      deviceRole: row.role,
      profileId: row.mapping?.profileId ?? $selectedDeviceProfileId,
      request: 'identityRequest',
      dryRun: false,
    });
    setTimeout(() => {
      const current = testing[row.role];
      if (current?.correlationId !== correlationId) return;      // a newer Test replaced this one
      testing = { ...testing, [row.role]: { ...current, expired: true } };
    }, TEST_GIVE_UP_MS);
  }

  /** The outcome for a device, from whichever of the replies named it most recently. */
  function outcomeFor(row) {
    const session = testing[row.role];
    if (!session) return null;
    if (session.blocked) return identityOutcome({ error: session.blocked });
    const reply = identityEventMatches($latestDeviceIdentityReply, row.role) ? $latestDeviceIdentityReply : null;
    const timedOut = identityEventMatches($latestDeviceRequestTimedOut, row.role);
    // A sync that never sent — "Profile has no identity declaration", no output port, a compile
    // error — reports itself here rather than looking like silence from the instrument. Matched on
    // the correlation id, NOT on deviceRole: the engine's error response carries only
    // { ok, requestId, error }, so a deviceRole match silently never fired and the card sat on
    // "Asking…" through every one of those failures.
    const failed = $latestDeviceSyncResult;
    const mine = failed && (failed.requestId === session.correlationId || failed.deviceRole === row.role);
    const error = mine && failed.ok === false ? String(failed.error ?? '') : '';
    // Kept apart deliberately. `timedOut` is the backend's own verdict: the request went out, the
    // profile's timeout elapsed, the instrument said nothing. `gaveUp` is only this card losing
    // patience, which is a fact about the app — reporting it as silence from the instrument sends
    // someone to check a cable that is fine.
    return identityOutcome({ reply, timedOut, gaveUp: session.expired === true, error });
  }
</script>

<div class="midi-settings">
  {#if !hasBackend}
    <section class="settings-card">
      <div class="card-head">
        <h2>MIDI Devices</h2>
        <p>Which synth each panel plays, and which one it listens to.</p>
      </div>
      <!--
        The honest empty state. In a browser there is no window.__JUCE__.backend, every bridge call
        returns immediately, and no port can ever appear no matter how much hardware is attached.
        Saying "no MIDI devices found" here would be a claim about the user's studio.
      -->
      <div class="notice">
        <strong>MIDI is only available in the desktop app.</strong>
        <span>
          This is running in a browser, which has no connection to the audio backend, so no ports can
          be listed and nothing can be sent. Open the same panel in the CEditor desktop build to
          reach your instruments.
        </span>
      </div>
    </section>
  {:else}
    <section class="settings-card">
      <div class="card-head">
        <h2>MIDI Devices</h2>
        <p>
          Each device is a name your panels bind to, with its own profile and ports — so several
          synths can be driven at once, and a panel reaches whichever one its controls ask for.
        </p>
      </div>

      <div class="setting-row status-row">
        <div class="setting-copy">
          <strong>
            <Plug size={13} strokeWidth={1.8} />
            {hardwareOutputs.length} output{hardwareOutputs.length === 1 ? '' : 's'},
            {hardwareInputs.length} input{hardwareInputs.length === 1 ? '' : 's'} found
          </strong>
          <span>
            Ports are read when this page opens, so anything plugged in afterwards needs a rescan.
            {#if refreshedAt}<em>Checked at {refreshedAt}.</em>{/if}
          </span>
        </div>
        <button type="button" class="refresh" onclick={refresh}>
          <RefreshCw size={13} strokeWidth={1.8} />
          Rescan
        </button>
      </div>

      {#if hardwareOutputs.length === 0 && hardwareInputs.length === 0}
        <div class="notice quiet">
          <strong>No MIDI hardware found.</strong>
          <span>Connect an instrument or a virtual MIDI port and press Rescan.</span>
        </div>
      {/if}
    </section>

    {#each rows as row (row.role)}
      <section class="settings-card" class:unconfigured={!row.configured && row.usedBy > 0}>
        <div class="card-head device-head">
          <div class="device-name">
            <input
              class="name-input"
              aria-label="Device name"
              value={row.role}
              onchange={(event) => rename(row, event)}
              onblur={(event) => rename(row, event)}
            />
            <p>
              {#if row.usedBy > 0}
                Named by {row.usedBy} control{row.usedBy === 1 ? '' : 's'} in the open panels.
                Renaming it renames them too.
              {:else}
                Not used by any open panel.
              {/if}
            </p>
          </div>
          <div class="device-actions">
            <span class="pill" class:live={sendsHardware(row)}>
              {#if sendsHardware(row)}
                {outFor(row)?.name}
              {:else if !row.configured}
                Not set up
              {:else}
                Preview only
              {/if}
            </span>
            <button
              type="button"
              class="remove"
              aria-label="Test device"
              title={identityTestBlocker(row.mapping ?? {}) || 'Ask the instrument to identify itself'}
              onclick={() => test(row)}
            >Test</button>
            <button
              type="button"
              class="remove"
              aria-label="Remove device"
              disabled={row.usedBy > 0}
              title={row.usedBy > 0 ? 'Controls still name this device' : 'Remove this device'}
              onclick={() => remove(row)}
            >Remove</button>
          </div>
        </div>

        {#if outcomeFor(row)}
          {@const result = outcomeFor(row)}
          <div class="setting-row identity" class:good={result.ok}>
            <div class="setting-copy">
              <strong>
                {#if result.outcome === 'replied'}Instrument answered
                {:else if result.outcome === 'mismatch'}Wrong instrument
                {:else if result.outcome === 'timeout'}No answer
                {:else if result.outcome === 'stalled'}Still nothing
                {:else if result.outcome === 'refused'}Could not ask
                {:else}Asking…{/if}
              </strong>
              <span>{result.detail}</span>
            </div>
          </div>
        {/if}

        {#if !row.configured && row.usedBy > 0}
          <!--
            The case this whole page was rebuilt for. A role a panel binds to but nothing has
            configured resolves no mapping at send time and fails with "Not sent: unresolved profile
            for <role>" — silently, from the panel's point of view. Choosing anything below creates
            the mapping.
          -->
          <div class="notice">
            <strong>This device has no ports assigned.</strong>
            <span>
              {row.usedBy} control{row.usedBy === 1 ? '' : 's'} send to <code>{row.role}</code>, and
              nothing has told the app where that is — so those sends are dropped. Pick an output
              below, and rename it to whatever you call the instrument.
            </span>
          </div>
        {/if}

        <div class="setting-row">
          <div class="setting-copy">
            <strong>Send To</strong>
            <span>
              The MIDI output this device's controls play. <em>Preview Only</em> keeps everything
              inside the editor and touches no hardware.
            </span>
          </div>
          <select
            class="port-select"
            aria-label="MIDI output"
            value={row.mapping?.midiDestination?.id ?? 'previewOnly'}
            onchange={(event) => apply(row, { destination: event.currentTarget.value })}
          >
            {#each outputs as port (port.id)}
              <option value={port.id}>{port.name || port.id}</option>
            {/each}
          </select>
        </div>

        <div class="setting-row">
          <div class="setting-copy">
            <strong>Listen To</strong>
            <span>The MIDI input used for learning controls and reading its patch back.</span>
          </div>
          <select
            class="port-select"
            aria-label="MIDI input"
            value={row.mapping?.midiInput?.id ?? 'none'}
            onchange={(event) => apply(row, { input: event.currentTarget.value })}
          >
            {#each inputs as port (port.id)}
              <option value={port.id}>{port.name || port.id}</option>
            {/each}
          </select>
        </div>

        <div class="setting-row">
          <div class="setting-copy">
            <strong>Device Profile</strong>
            <span>
              Which instrument's parameter map to use. The profile decides what each control means;
              the ports above decide where it goes.
            </span>
          </div>
          <select
            class="port-select"
            aria-label="Device profile"
            value={row.mapping?.profileId ?? $selectedDeviceProfileId}
            onchange={(event) => apply(row, { profile: event.currentTarget.value })}
          >
            {#each $deviceProfiles as profile (profile.id)}
              <option value={profile.id}>{profile.name || profile.id}</option>
            {/each}
          </select>
        </div>
      </section>
    {/each}

    <section class="settings-card">
      <div class="setting-row">
        <div class="setting-copy">
          <strong>Add A Device</strong>
          <span>
            Call it whatever you call the instrument. Devices your panels already name appear above
            on their own, so this is only for setting one up before the panel that will use it.
          </span>
        </div>
        <div class="add-device">
          <input
            type="text"
            aria-label="New device name"
            placeholder="e.g. drums"
            bind:value={newRoleName}
            onkeydown={(event) => event.key === 'Enter' && addDevice()}
          />
          <button type="button" class="refresh" onclick={addDevice} disabled={!newRoleName.trim()}>Add</button>
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .midi-settings {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px 18px 24px;
  }

  .settings-card {
    border: 1px solid #303030;
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(34, 34, 34, 0.98), rgba(24, 24, 24, 0.98));
    overflow: hidden;
  }

  .card-head {
    padding: 12px 14px 10px;
    border-bottom: 1px solid #2B2B2B;
  }

  .card-head h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 650;
    color: #F4F4F4;
  }

  .card-head p {
    margin: 4px 0 0;
    font-size: 11px;
    color: #949494;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 12px 14px;
    border-top: 1px solid #292929;
  }

  .setting-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .setting-copy strong {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: #F0F0F0;
  }

  .setting-copy strong.live {
    color: #6FCF97;
  }

  .setting-copy span {
    font-size: 11px;
    color: #8A8A8A;
    line-height: 1.35;
  }

  .setting-copy em {
    font-style: normal;
    color: #6E6E6E;
  }

  .port-select {
    flex: 0 0 auto;
    min-width: 210px;
    max-width: 280px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid #3A3A3A;
    border-radius: 7px;
    background: #1B1B1B;
    color: #E8E8E8;
    font-family: inherit;
    font-size: 12px;
  }

  .status-row {
    background: rgba(11, 110, 181, 0.06);
  }

  .refresh {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    height: 28px;
    padding: 0 12px;
    border: 1px solid #3A3A3A;
    border-radius: 7px;
    background: #232323;
    color: #E8E8E8;
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .refresh:hover {
    background: #2C2C2C;
    border-color: #4A4A4A;
  }

  .notice {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin: 14px;
    padding: 12px 14px;
    border: 1px solid #4A3A1E;
    border-radius: 10px;
    background: rgba(196, 145, 46, 0.09);
  }

  .identity {
    background: rgba(216, 166, 87, 0.07);
  }

  .identity.good {
    background: rgba(111, 207, 151, 0.08);
  }

  .identity.good .setting-copy strong {
    color: #6FCF97;
  }

  .settings-card.unconfigured {
    border-color: #6B4A1E;
  }

  .device-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .device-name {
    min-width: 0;
    flex: 1 1 auto;
  }

  .name-input {
    width: 100%;
    max-width: 280px;
    height: 30px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: #F4F4F4;
    font-family: inherit;
    font-size: 15px;
    font-weight: 650;
  }

  .name-input:hover {
    border-color: #3A3A3A;
    background: #1B1B1B;
  }

  .name-input:focus {
    outline: none;
    border-color: #0B6EB5;
    background: #1B1B1B;
  }

  .device-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
  }

  .remove {
    height: 26px;
    padding: 0 10px;
    border: 1px solid #3A3A3A;
    border-radius: 7px;
    background: #232323;
    color: #C9C9C9;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  .remove:hover:not(:disabled) {
    border-color: #6B3030;
    color: #E8A0A0;
  }

  .remove:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .pill {
    flex: 0 0 auto;
    padding: 3px 9px;
    border: 1px solid #3A3A3A;
    border-radius: 999px;
    background: #1B1B1B;
    color: #9A9A9A;
    font-size: 10.5px;
    white-space: nowrap;
  }

  .pill.live {
    border-color: #2F6B47;
    background: rgba(111, 207, 151, 0.12);
    color: #6FCF97;
  }

  .add-device {
    display: flex;
    gap: 8px;
    flex: 0 0 auto;
  }

  .add-device input {
    width: 180px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid #3A3A3A;
    border-radius: 7px;
    background: #1B1B1B;
    color: #E8E8E8;
    font-family: inherit;
    font-size: 12px;
  }

  .refresh:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .notice code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #D8C08A;
  }

  .notice.quiet {
    border-color: #343434;
    background: #1B1B1B;
  }

  .notice strong {
    font-size: 12.5px;
    font-weight: 600;
    color: #F0F0F0;
  }

  .notice span {
    font-size: 11px;
    color: #8A8A8A;
    line-height: 1.4;
  }
</style>
