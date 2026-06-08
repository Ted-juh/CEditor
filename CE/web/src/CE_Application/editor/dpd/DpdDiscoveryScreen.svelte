<script>
  // Detect devices — MIDI-CI live discovery (MIDI 2.0 plan, phase M1). Broadcasts a Discovery on the
  // mapped output; the C++ session runs Property Exchange and the bundled importer drafts a partial
  // profile from what the device reports (controllers, presets, identity). Picking one seeds the
  // Designer's model. The SysEx/dump layer is added afterwards from the manual or a capture.
  import { discoveredMidiCiProfiles, requestMidiCiDiscovery, setMidiCiProfile } from '../../stores/deviceProfiles.js';
  import { isJuceAvailable } from '../../bridge/bridge.js';

  let { onPick } = $props();
  let scanning = $state(false);
  let scanned = $state(false);
  let timer = null;

  function scan() {
    scanning = true;
    scanned = true;
    requestMidiCiDiscovery('mainSynth');
    clearTimeout(timer);
    timer = setTimeout(() => { scanning = false; }, 7000); // matches the C++ 6s discovery window + slack
  }

  const ctrlCount = (e) => e?.profile?.scopes?.global?.parameters?.length ?? 0;
  const presetCount = (e) => e?.profile?.imported?.presets?.length ?? 0;
  const idLabel = (e) => {
    const id = e?.profile?.identity ?? {};
    return [id.manufacturerId, id.family, id.member].filter(Boolean).join(' · ') || 'identity captured';
  };
</script>

<div class="shead"><h1>Detect devices</h1></div>
<p class="sub">Discover a connected synth over MIDI-CI and start a profile from what it reports — controllers, presets and identity. Roland-style SysEx, bit-packing and dumps are added afterwards from the manual or a capture.</p>

<div class="note"><span>ⓘ</span><div>Needs a <b>hardware MIDI output + input</b> mapped for this device and a <b>MIDI-CI-capable</b> synth — many recent instruments support it over an ordinary MIDI cable. Discovery is <b>partial</b> by design: it brings the controller map, presets and identity, not the SysEx address/dump structure.</div></div>

<div class="rtbar">
  <button class="asbtn primary" onclick={scan} disabled={scanning || !isJuceAvailable()}>
    {scanning ? '◌ Scanning…' : '◉ Scan for MIDI-CI devices'}
  </button>
  {#if !isJuceAvailable()}<span class="lm">Discovery runs inside the app (the native bridge is required).</span>{/if}
</div>

{#if $discoveredMidiCiProfiles.length}
  <div class="dumpgrid">
    {#each $discoveredMidiCiProfiles as entry (entry.muid)}
      <div class="dumpcard">
        <div class="dt">◆ {entry.profile?.label ?? 'MIDI-CI device'}</div>
        {#if entry.error}
          <div class="dm warnt">Import failed: {entry.error}</div>
        {:else}
          <div class="dm">{idLabel(entry)}</div>
          <div class="dstat"><span><b>{ctrlCount(entry)}</b> controllers</span><span><b>{presetCount(entry)}</b> presets</span></div>
          {#if entry.summary?.needsYou?.length}<div class="dm" style="margin-top:8px">Needs you: {entry.summary.needsYou[0]}</div>{/if}
          {#if entry.profiles?.length}
            <div class="ciprofiles">
              <div class="cplabel">MIDI-CI profiles</div>
              {#each entry.profiles as p (p.id)}
                <div class="cprow">
                  <span class="cpid">{p.id}</span>
                  <button class={['cptoggle', p.active && 'on']} onclick={() => setMidiCiProfile(entry.muid, p.id, !p.active)}>
                    {p.active ? 'On' : 'Off'}
                  </button>
                </div>
              {/each}
            </div>
          {/if}
          <button class="asbtn" style="margin:12px 0 0" onclick={() => onPick?.(structuredClone($state.snapshot(entry.profile)))}>Open in Designer →</button>
        {/if}
      </div>
    {/each}
  </div>
{:else if scanning}
  <div class="placeholder">Listening for MIDI-CI replies…</div>
{:else if scanned}
  <div class="placeholder">No MIDI-CI devices responded. Check the MIDI output/input mapping and that the device has MIDI-CI enabled.</div>
{:else}
  <div class="placeholder">Press <b>Scan</b> to broadcast a MIDI-CI Discovery on the mapped output.</div>
{/if}
