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
    initDeviceProfileBridge,
  } from '../stores/deviceProfiles.js';
  import { listMidiDestinations, listMidiInputs, listDeviceProfiles, isJuceAvailable } from '../bridge/bridge.js';

  const ROLE = 'mainSynth';

  let hasBackend = $state(false);
  let refreshedAt = $state(null);

  let outputs = $derived($midiDestinations ?? []);
  let inputs = $derived($midiInputs ?? []);
  let profileId = $derived($selectedDeviceProfileId);
  let destinationId = $derived($selectedMidiDestinationId);
  let inputId = $derived($selectedMidiInputId);
  let mapping = $derived($deviceRoleMappings?.[ROLE] ?? null);

  // "Preview Only" and "Disabled"/"No MIDI Input" are always present — they are how you say "do not
  // send anywhere". Real hardware is anything else, and it is the only thing that answers the
  // question "did it find my synth".
  const isHardware = (port) => port?.type === 'hardwareOutput' || port?.type === 'hardwareInput';
  let hardwareOutputs = $derived(outputs.filter(isHardware));
  let hardwareInputs = $derived(inputs.filter(isHardware));
  let connectedOut = $derived(outputs.find((p) => p.id === destinationId) ?? null);
  let connectedIn = $derived(inputs.find((p) => p.id === inputId) ?? null);
  let sending = $derived(isHardware(connectedOut));

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

  const find = (list, id, fallback) => list.find((entry) => entry.id === id) ?? fallback;

  function apply({ destination = destinationId, input = inputId, profile = profileId }) {
    mapDeviceRole(ROLE, profile, {
      midiDestination: find(outputs, destination, { type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' }),
      midiInput: find(inputs, input, { type: 'none', id: 'none', name: 'No MIDI Input' }),
      syncDirection: mapping?.syncDirection ?? 'pull',
    });
  }
</script>

<div class="midi-settings">
  <section class="settings-card">
    <div class="card-head">
      <h2>MIDI Ports</h2>
      <p>Choose which synth this panel plays, and which one it listens to.</p>
    </div>

    {#if !hasBackend}
      <!--
        The honest empty state. In a browser there is no window.__JUCE__.backend, every bridge call
        returns immediately, and no port can ever appear no matter how much hardware is attached.
        Saying "no MIDI devices found" there would be a lie about the hardware.
      -->
      <div class="notice">
        <strong>MIDI is only available in the desktop app.</strong>
        <span>
          This is running in a browser, which has no connection to the audio backend, so no ports can
          be listed and nothing can be sent. Open the same panel in the CEditor desktop build to
          reach your instruments.
        </span>
      </div>
    {:else}
      <div class="setting-row">
        <div class="setting-copy">
          <strong>Send To</strong>
          <span>
            The MIDI output a control's value is sent on. <em>Preview Only</em> keeps everything
            inside the editor and touches no hardware.
          </span>
        </div>
        <select
          class="port-select"
          aria-label="MIDI output"
          value={destinationId}
          onchange={(event) => apply({ destination: event.currentTarget.value })}
        >
          {#each outputs as port (port.id)}
            <option value={port.id}>{port.name || port.id}</option>
          {/each}
        </select>
      </div>

      <div class="setting-row">
        <div class="setting-copy">
          <strong>Listen To</strong>
          <span>
            The MIDI input used for learning controls and reading a synth's current patch back.
          </span>
        </div>
        <select
          class="port-select"
          aria-label="MIDI input"
          value={inputId}
          onchange={(event) => apply({ input: event.currentTarget.value })}
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
          value={profileId}
          onchange={(event) => apply({ profile: event.currentTarget.value })}
        >
          {#each $deviceProfiles as profile (profile.id)}
            <option value={profile.id}>{profile.name || profile.id}</option>
          {/each}
        </select>
      </div>

      <div class="setting-row status-row">
        <div class="setting-copy">
          <strong class:live={sending}>
            <Plug size={13} strokeWidth={1.8} />
            {#if sending}
              Sending to {connectedOut?.name}
            {:else}
              Not sending to any hardware
            {/if}
          </strong>
          <span>
            {hardwareOutputs.length} output{hardwareOutputs.length === 1 ? '' : 's'} and
            {hardwareInputs.length} input{hardwareInputs.length === 1 ? '' : 's'} found.
            {#if connectedIn && isHardware(connectedIn)}
              Listening on {connectedIn.name}.
            {/if}
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
          <span>
            Connect an instrument or a virtual MIDI port and press Rescan. Ports are read when this
            page opens, so something plugged in afterwards will not appear on its own.
          </span>
        </div>
      {/if}
    {/if}
  </section>
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
