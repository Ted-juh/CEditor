<script>
  /**
   * The MIDI monitor, as its own tab.
   *
   * It existed already, and that is the problem it is worth naming: C++ keeps a 500-event ring
   * buffer with a timestamp, direction, device, message type, meaning, hex and status on every one,
   * and the Device tab showed the last FOUR of them with three of those fields dropped. You could
   * see that MIDI had happened, but not when, not to which synth, and not whether it worked. Three
   * separate "this is missing" reports have now all turned out to be things buried in that tab, so
   * this one gets its own — a monitor is watched while you turn a knob, which means it has to be
   * somewhere you can leave open.
   *
   * Pausing matters more than it looks. The buffer is replaced wholesale on every emit, so the list
   * moves under the pointer exactly when someone is trying to read the line that just appeared.
   * Pause keeps a snapshot; nothing is lost, because C++ goes on collecting either way.
   */
  import MidiLearnChips from './MidiLearnChips.svelte';
  import { latestMidiPreview, midiMonitorEvents, refreshDeviceProfiles } from '../stores/deviceProfiles.js';
  import { clearMidiMonitorEvents, isJuceAvailable } from '../bridge/bridge.js';
  import {
    MONITOR_DIRECTIONS,
    filterMonitorEvents,
    isMonitorFailure,
    monitorCounts,
    monitorEventLine,
    monitorFacets,
    monitorTime,
  } from '../utils/midiMonitor.js';

  let direction = $state('');
  let device = $state('');
  let type = $state('');
  let search = $state('');
  let failuresOnly = $state(false);
  let paused = $state(false);
  let frozen = $state([]);
  let copyStatus = $state('');

  let live = $derived($midiMonitorEvents ?? []);
  // Only while it is the LAST thing that happened: once a send succeeds the store carries a
  // transaction instead, and a stale banner would accuse a panel that is now working.
  let notSent = $derived($latestMidiPreview?.ok === false ? String($latestMidiPreview.error ?? '') : '');
  let events = $derived(paused ? frozen : live);
  let facets = $derived(monitorFacets(events));
  let counts = $derived(monitorCounts(events));
  let rows = $derived(filterMonitorEvents(events, { direction, device, type, search, failuresOnly }));

  function togglePause() {
    if (!paused) frozen = [...live];
    paused = !paused;
  }

  // Clearing the local store alone looked like it worked and wasn't: the engine keeps the last 500
  // events and pushes the whole list on every message, so the next slider move brought them all
  // back. The engine owns the log, so it has to do the forgetting; the local clear stays for the
  // instant feedback, and for dev mode in a plain browser where there is no engine to ask.
  function clear() {
    clearMidiMonitorEvents();
    midiMonitorEvents.set([]);
    frozen = [];
  }

  async function copyAll() {
    const body = rows.map(monitorEventLine).join('\n');
    if (!body) return;
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(body);
      copyStatus = `Copied ${rows.length}`;
    } catch {
      copyStatus = 'Copy failed';
    }
  }
</script>

<div class="midi-monitor">
  <!-- Above the log, because it is read the other way round: the log answers "what happened", this
       answers "what do I do with it". Same events, one step further on. -->
  <MidiLearnChips />
  <div class="toolbar">
    <select aria-label="Direction" bind:value={direction}>
      <option value="">Both ways</option>
      {#each MONITOR_DIRECTIONS as value}
        <option {value}>{value === 'out' ? 'Sent' : 'Received'}</option>
      {/each}
    </select>

    <select aria-label="Device" bind:value={device}>
      <option value="">Every device</option>
      {#each facets.devices as name}
        <option value={name}>{name}</option>
      {/each}
    </select>

    <select aria-label="Message type" bind:value={type}>
      <option value="">Every type</option>
      {#each facets.types as name}
        <option value={name}>{name}</option>
      {/each}
    </select>

    <input type="text" aria-label="Search" placeholder="Filter by parameter, hex, anything" bind:value={search} />

    <label class="check"><input type="checkbox" bind:checked={failuresOnly} /> Failures only</label>

    <div class="spacer"></div>
    <button type="button" class:on={paused} onclick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>
    <button type="button" onclick={copyAll} disabled={!rows.length}>{copyStatus || 'Copy'}</button>
    <button type="button" onclick={clear}>Clear</button>
  </div>

  <div class="summary">
    {#if !isJuceAvailable()}
      <!--
        Same distinction the MIDI settings page makes: in a browser there is no backend to collect
        anything, which is not the same as a quiet synth.
      -->
      <span class="warn">No audio backend — MIDI can only be monitored in the desktop app.</span>
    {:else}
      <span>{counts.sent} sent</span>
      <span>{counts.received} received</span>
      {#if counts.failed > 0}<span class="warn">{counts.failed} failed</span>{/if}
      <span class="dim">
        {rows.length === counts.total ? `${counts.total} events` : `${rows.length} of ${counts.total} shown`}
        · C++ keeps the last 500
      </span>
      <button type="button" class="link" onclick={refreshDeviceProfiles}>Refresh</button>
    {/if}
  </div>

  <!--
    A send that never happened leaves no event, so the log has nothing to show and the honest read of
    an empty monitor is "the control is not wired up" — which is exactly the wrong conclusion when
    the truth is "this panel's device has no profile yet".

    resolveParameterSend already works this out and words it well, and then set it on a store whose
    only reader is a preview box in the Parameter Browser. Someone moving a fader and watching the
    monitor never saw it. It belongs here, where they are looking.
  -->
  {#if notSent}
    <div class="not-sent">
      <strong>Nothing was sent</strong>
      <span>{notSent}</span>
    </div>
  {/if}

  <div class="rows" role="log" aria-label="MIDI events">
    {#each rows as event, index (`${event.timestamp}_${index}`)}
      <div class="row" class:failed={isMonitorFailure(event)} title={monitorEventLine(event)}>
        <span class="time">{monitorTime(event)}</span>
        <span class="dir" class:out={event.direction === 'out'}>{event.direction === 'out' ? '→' : '←'}</span>
        <span class="device">{event.deviceRole || ''}</span>
        <span class="type">{event.messageType || ''}</span>
        <span class="semantic">{event.semantic || ''}</span>
        <span class="hex">{event.hex || ''}</span>
        <span class="status">{event.status || ''}</span>
      </div>
    {:else}
      <div class="empty">
        {#if counts.total === 0}
          No MIDI yet. Move a bound control, or play the synth to see what it sends.
        {:else}
          Nothing matches these filters — {counts.total} event{counts.total === 1 ? '' : 's'} hidden.
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .midi-monitor {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: #161616;
    color: #D8D8D8;
    font-size: 11px;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px;
    border-bottom: 1px solid #2B2B2B;
    flex: 0 0 auto;
    flex-wrap: wrap;
  }

  .toolbar select,
  .toolbar input[type='text'] {
    height: 24px;
    padding: 0 6px;
    border: 1px solid #3A3A3A;
    border-radius: 6px;
    background: #1B1B1B;
    color: #E8E8E8;
    font-family: inherit;
    font-size: 11px;
  }

  .toolbar input[type='text'] { flex: 1 1 180px; min-width: 140px; }
  .spacer { flex: 1 1 auto; }

  .check { display: flex; align-items: center; gap: 5px; color: #9A9A9A; white-space: nowrap; }
  .check input { accent-color: #0B6EB5; }

  .toolbar button {
    height: 24px;
    padding: 0 10px;
    border: 1px solid #3A3A3A;
    border-radius: 6px;
    background: #232323;
    color: #D8D8D8;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  .toolbar button:hover:not(:disabled) { background: #2C2C2C; }
  .toolbar button:disabled { opacity: 0.4; cursor: default; }
  .toolbar button.on { border-color: #0B6EB5; background: #094771; color: #FFF; }

  .summary {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    border-bottom: 1px solid #2B2B2B;
    color: #9A9A9A;
    flex: 0 0 auto;
  }

  .summary .dim { color: #6E6E6E; }
  .warn { color: #D8A657; }

  .not-sent {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex: 0 0 auto;
    padding: 7px 8px;
    border-bottom: 1px solid #2B2B2B;
    background: #2A2114;
    color: #E7C88A;
  }

  .not-sent strong { color: #F0D9A8; }

  .link {
    margin-left: auto;
    border: none;
    background: none;
    color: #6FA8DC;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
  }

  .rows {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .row {
    display: grid;
    /* Status is given room rather than squeezed: a failure explains itself there — "Not sent:
       unresolved profile for <device>" — and truncating it hides the one line worth reading. */
    grid-template-columns: 88px 16px 140px 48px minmax(110px, 1fr) minmax(90px, 1fr) minmax(150px, 1.3fr);
    gap: 8px;
    padding: 3px 10px;
    border-bottom: 1px solid #1F1F1F;
    white-space: nowrap;
  }

  .row:hover { background: #1D1D1D; }
  .row.failed { background: rgba(200, 90, 90, 0.10); }
  .row.failed .status { color: #E8A0A0; }

  .time { color: #6E6E6E; }
  .dir { color: #6FA8DC; text-align: center; }
  .dir.out { color: #6FCF97; }
  .device { color: #9A9A9A; overflow: hidden; text-overflow: ellipsis; }
  .type { color: #6E6E6E; }
  .semantic { color: #E8E8E8; overflow: hidden; text-overflow: ellipsis; }
  .hex { color: #C8A46B; overflow: hidden; text-overflow: ellipsis; }
  .status { color: #7A7A7A; overflow: hidden; text-overflow: ellipsis; }

  .empty { padding: 18px 12px; color: #6E6E6E; }
</style>
