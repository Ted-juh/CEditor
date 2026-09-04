<script>
  /** The calm, locked-down reading of the rig used while playing. */
  import { onDestroy } from 'svelte';
  import {
    hostState, hostSurface, hostMidiActivity, hostLastError, hostPanic,
    setlistPrev, setlistNext, transportPlay, transportStop,
  } from '../stores/instrumentHost.js';
  import { noteName } from '../utils/pianoGeometry.js';
  import {
    changedSurfaceSlot, stageSetlistContext, stageSurfaceModel, surfaceSlotForMidiActivity,
  } from '../utils/stageViewModel.js';

  let performance = $derived($hostState.performance);
  let transport = $derived(performance.transport);
  let setlist = $derived(stageSetlistContext(performance));
  let currentScene = $derived(setlist.current
    ? performance.scenes.find((scene) => scene.sceneId === setlist.current.sceneId) ?? null
    : null);
  let surface = $derived(stageSurfaceModel($hostState.rack, performance, $hostSurface));
  let activeParts = $derived($hostState.rack.parts.filter(
    (part) => part.hasInstrument || part.hardware || part.unresolved));
  let movingSlot = $state(-1);
  let previousSurfaceEntries = [];
  let previousMovementSeq;
  let previousMidiSeq;
  let movementTimer;

  $effect(() => {
    const current = surface.entries;
    const movementSeq = $hostSurface.movementSeq;
    const hardwareMoved = previousMovementSeq !== undefined && movementSeq !== previousMovementSeq;
    previousMovementSeq = movementSeq;
    const midiSeq = $hostMidiActivity.seq;
    const midiMoved = previousMidiSeq !== undefined && midiSeq !== previousMidiSeq;
    previousMidiSeq = midiSeq;
    const changed = surface.type !== 'controls' ? -1
      : hardwareMoved ? $hostSurface.movingSlot
        : midiMoved ? surfaceSlotForMidiActivity(current, $hostMidiActivity)
          : changedSurfaceSlot(previousSurfaceEntries, current);
    previousSurfaceEntries = current.map((entry) => ({ ...entry }));
    if (changed < 0) return;
    movingSlot = changed;
    clearTimeout(movementTimer);
    movementTimer = setTimeout(() => (movingSlot = -1), 450);
  });

  onDestroy(() => clearTimeout(movementTimer));

  const percent = (value) => `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
  const partName = (part) => part.pluginName || part.midiOutputName || 'Unresolved part';
  const audioStatus = (audio) => {
    if (!audio.enabled) return 'Audio off';
    if (!audio.running) return 'Audio starting';
    return `${audio.deviceName || 'Audio'} · ${Math.round(audio.cpu * 100)}% CPU`
      + (audio.xruns > 0 ? ` · ${audio.xruns} xruns` : '');
  };
  const surfaceStatus = (state) => {
    if (state === 'connected') return $hostSurface.device || 'CTRL49 connected';
    if (state === 'connecting') return 'CTRL49 connecting';
    if (state === 'heldElsewhere') return 'CTRL49 used by another instance';
    if (state === 'failed') return 'CTRL49 unavailable';
    return 'Looking for CTRL49';
  };
</script>

<main class="stage" data-testid="host-stage-view">
  <section class="stage-status" aria-label="Performance status">
    <div class="status-item" class:good={$hostState.audio.running} class:warn={$hostState.audio.xruns > 0}>
      <span class="status-dot"></span>
      <span>{audioStatus($hostState.audio)}</span>
    </div>
    <div class="status-item" class:good={$hostSurface.state === 'connected'}
         class:warn={$hostSurface.state === 'heldElsewhere' || $hostSurface.state === 'failed'}>
      <span class="status-dot"></span>
      <span>{surfaceStatus($hostSurface.state)}</span>
    </div>
    {#if $hostLastError}
      <span class="stage-error" role="alert">
        <span>{$hostLastError}</span>
        <button type="button" aria-label="Dismiss error" onclick={() => hostLastError.set('')}>×</button>
      </span>
    {/if}
    <span class="stage-lock" class:pending={!$hostState.stageLocked}>
      {$hostState.stageLocked ? 'STAGE LOCKED' : 'LOCKING…'}
    </span>
  </section>

  <section class="transport-card" aria-label="Transport">
    <button type="button" class="play" class:playing={transport.playing}
            aria-label={transport.playing ? 'Stop' : 'Play'}
            onclick={() => (transport.playing ? transportStop() : transportPlay())}>
      {transport.playing ? '■' : '▶'}
    </button>
    <div class="position">
      <strong>{transport.bar}.{transport.beat}</strong>
      <span>BAR · BEAT</span>
    </div>
    <div class="tempo">
      <strong>{Math.round(transport.tempo)}</strong>
      <span>BPM</span>
    </div>
    <div class="clock" class:warn={transport.clockLost}>
      {transport.externalClock ? (transport.clockLost ? 'NO CLOCK' : 'EXT CLOCK') : 'INTERNAL'}
    </div>
  </section>

  <section class="setlist-grid" aria-label="Setlist position">
    <button type="button" class="step-button previous" disabled={!setlist.canPrevious}
            onclick={() => setlistPrev()} aria-label="Previous setlist item">
      <span class="arrow">←</span><span>PREVIOUS</span>
    </button>

    <div class="song-card current-song">
      <span class="eyebrow">NOW</span>
      {#if setlist.current}
        <strong>{setlist.current.name}</strong>
        <span class="scene-name">{setlist.loadingIndex === setlist.currentIndex
          ? 'Loading rig…' : (setlist.current.sceneName || 'Scene')}</span>
        {#if setlist.current.notes}<p>{setlist.current.notes}</p>{/if}
        <span class="song-count">{setlist.currentIndex + 1} / {setlist.items.length}</span>
      {:else}
        <strong>{setlist.items.length ? 'Ready' : 'No setlist'}</strong>
        <span class="scene-name">{setlist.items.length ? 'Press Next to begin' : 'Add scenes in Build mode'}</span>
      {/if}
    </div>

    <div class="song-card next-song">
      <span class="eyebrow">NEXT</span>
      {#if setlist.next}
        <strong>{setlist.next.name}</strong>
        <span class="scene-name">{setlist.next.sceneName || 'Scene'}</span>
        {#if setlist.next.tempo > 0}<span>{setlist.next.tempo} BPM</span>{/if}
      {:else}
        <strong>End of set</strong>
        <span class="scene-name">No following song</span>
      {/if}
    </div>

    <button type="button" class="step-button next" disabled={!setlist.canNext}
            onclick={() => setlistNext()} aria-label={setlist.currentIndex < 0 ? 'Start setlist' : 'Next setlist item'}>
      <span>{setlist.currentIndex < 0 ? 'START' : 'NEXT'}</span><span class="arrow">→</span>
    </button>
  </section>

  <div class="stage-body">
    <section class="stage-panel parts-panel" aria-label="Active parts">
      <div class="panel-head">
        <div><span class="eyebrow">RIG</span><strong>Active parts</strong></div>
        {#if currentScene}<span class="scene-chip">{currentScene.name}</span>{/if}
      </div>
      <div class="parts">
        {#each activeParts as part (part.partId)}
          <article class="stage-part" class:muted={part.mute || !part.enabled} class:solo={part.solo}>
            <span class="part-state">{!part.enabled ? 'OFF' : part.mute ? 'MUTE' : part.solo ? 'SOLO' : 'LIVE'}</span>
            <strong>{partName(part)}</strong>
            <span class="preset">{part.presetName || (part.hardware ? part.hardwarePatchName : '') || 'No preset name'}</span>
            <div class="part-detail">
              <span>{noteName(part.keyLow)}–{noteName(part.keyHigh)}</span>
              <span>{Math.round(part.volume * 100)}%</span>
            </div>
          </article>
        {/each}
        {#if activeParts.length === 0}
          <div class="empty">No active parts. Return to Build mode and load an instrument.</div>
        {/if}
      </div>
    </section>

    <section class="stage-panel controls-panel" aria-label="CTRL49 controls">
      <div class="panel-head">
        <div><span class="eyebrow">CTRL49</span><strong>{surface.name}</strong></div>
        <span class="page-count">PAGE {surface.pageIndex + 1} / {surface.pageCount}</span>
      </div>
      <div class="stage-controls">
        {#each surface.entries as entry, index (entry.slotId || `empty-${index}`)}
          <article class="stage-control" class:empty={!entry.assigned}
                   class:unresolved={entry.assigned && !entry.resolved}
                   class:active={entry.active || (surface.type === 'controls' && surface.activeSlot === index)}
                   class:moving={surface.type === 'controls' && movingSlot === index}
                   class:pending={entry.pending}>
            <span class="control-number">{index + 1}</span>
            <strong>{entry.assigned ? entry.displayName : '—'}</strong>
            <span class="control-part">{surface.type === 'controls' && movingSlot === index
              ? 'MOVING' : entry.partName || (entry.pending ? 'queued' : entry.active ? 'running' : '')}</span>
            <span class="control-value">
              {entry.assigned ? (entry.valueText || percent(entry.value)) : 'unassigned'}
            </span>
            {#if entry.assigned && Number.isFinite(entry.value)}
              <span class="value-track"><span style={`width:${percent(entry.value)}`}></span></span>
            {/if}
          </article>
        {/each}
      </div>
    </section>
  </div>

  <button type="button" class="stage-panic" onclick={() => hostPanic()}
          title="All notes off, every part">PANIC · ALL NOTES OFF</button>
</main>

<style>
  .stage {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr) auto;
    gap: 12px;
    padding: 12px 14px 14px;
    overflow: hidden;
    background: radial-gradient(circle at 50% -30%, #263441 0, #161b20 42%, #111519 100%);
    color: #e7edf2;
  }
  .stage-status { display: flex; align-items: center; gap: 18px; min-height: 20px; }
  .status-item { display: inline-flex; align-items: center; gap: 7px; color: #8f9ba5; font-size: 12px; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #64707a; box-shadow: 0 0 0 3px #64707a20; }
  .status-item.good .status-dot { background: #48c47a; box-shadow: 0 0 0 3px #48c47a20; }
  .status-item.warn { color: #e3b275; }
  .status-item.warn .status-dot { background: #e3a34f; box-shadow: 0 0 0 3px #e3a34f20; }
  .stage-lock { margin-left: auto; color: #a2d6b8; border: 1px solid #47755d; border-radius: 999px; padding: 4px 10px; font-size: 11px; letter-spacing: 0.12em; }
  .stage-lock.pending { color: #e3b275; border-color: #856739; }
  .stage-error { min-width: 0; display: inline-flex; align-items: center; gap: 7px; color: #ffc3c3; font-size: 12px; }
  .stage-error > span { max-width: 430px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stage-error button { width: 24px; height: 24px; padding: 0; border: 1px solid #7d4a4a; background: #321f21; color: #ffc3c3; cursor: pointer; }

  .transport-card { display: flex; align-items: center; gap: 18px; min-height: 64px; padding: 8px 12px; border: 1px solid #33414d; border-radius: 8px; background: #151c22d9; }
  .play { width: 48px; height: 48px; border: 1px solid #3f5669; border-radius: 50%; background: #22303b; color: #bad8ee; font-size: 18px; cursor: pointer; }
  .play.playing { background: #234c39; border-color: #4e8b68; color: #c9f0d8; }
  .position, .tempo { display: flex; align-items: baseline; gap: 8px; }
  .position strong { font-size: 30px; font-variant-numeric: tabular-nums; letter-spacing: 0.03em; }
  .tempo strong { font-size: 25px; font-variant-numeric: tabular-nums; }
  .position span, .tempo span { color: #96a3ad; font-size: 10px; letter-spacing: 0.12em; }
  .clock { margin-left: auto; color: #a2b0ba; font-size: 12px; letter-spacing: 0.08em; }
  .clock.warn { color: #e4a15a; }

  .setlist-grid { display: grid; grid-template-columns: 92px minmax(220px, 1.2fr) minmax(180px, 0.8fr) 92px; gap: 8px; min-height: 112px; }
  .step-button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; border: 1px solid #415563; border-radius: 8px; background: #1a232a; color: #d7e1e8; font-size: 12px; letter-spacing: 0.08em; cursor: pointer; }
  .step-button.next { border-color: #47759a; background: #1d3446; color: #dcecf7; }
  .step-button:disabled { opacity: 0.3; cursor: default; }
  .arrow { font-size: 24px; line-height: 1; }
  .song-card { position: relative; display: flex; flex-direction: column; justify-content: center; gap: 5px; padding: 12px 16px; border: 1px solid #303c46; border-radius: 8px; background: #171e24; min-width: 0; }
  .song-card strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .current-song { border-color: #497ba1; background: linear-gradient(135deg, #1c3344, #172128); }
  .current-song strong { font-size: 23px; }
  .next-song strong { font-size: 17px; color: #c2ccd3; }
  .eyebrow { color: #82b3d8; font-size: 10px; font-weight: 700; letter-spacing: 0.16em; }
  .scene-name { color: #8997a2; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .song-card p { margin: 2px 0 0; color: #c2cbd1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .song-count { position: absolute; right: 12px; top: 10px; color: #91a9ba; font-size: 12px; }

  .stage-body { min-height: 0; display: grid; grid-template-columns: minmax(260px, 0.8fr) minmax(520px, 1.7fr); gap: 12px; }
  .stage-panel { min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid #2f3b45; border-radius: 8px; background: #141a1fd9; overflow: hidden; }
  .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .panel-head > div { display: flex; flex-direction: column; gap: 3px; }
  .panel-head strong { font-size: 15px; }
  .scene-chip, .page-count { color: #a9b7c1; border: 1px solid #41515d; border-radius: 999px; padding: 4px 8px; font-size: 11px; }
  .parts { min-height: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; gap: 8px; overflow-y: auto; }
  .stage-part { position: relative; display: flex; flex-direction: column; gap: 5px; min-height: 72px; padding: 10px; border: 1px solid #35434e; border-left: 4px solid #4b8fbd; border-radius: 6px; background: #192128; }
  .stage-part.muted { opacity: 0.55; border-left-color: #9b5e5e; }
  .stage-part.solo { border-left-color: #d1aa4c; }
  .stage-part strong, .preset { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preset { color: #a5b0b9; font-size: 12px; }
  .part-state { position: absolute; top: 9px; right: 9px; color: #94cdb0; font-size: 10px; letter-spacing: 0.1em; }
  .part-detail { display: flex; justify-content: space-between; color: #96a3ad; font-size: 11px; }
  .empty { color: #77838d; padding: 16px 4px; }

  .stage-controls { min-height: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; overflow-y: auto; }
  .stage-control { position: relative; min-height: 84px; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 10px 10px 9px 30px; border: 1px solid #35434e; border-radius: 6px; background: #192128; overflow: hidden; }
  .stage-control.active { border-color: #d2ad58; box-shadow: inset 0 0 0 1px #d2ad5840; }
  .stage-control.moving { border-color: #e8ca75; box-shadow: inset 0 0 0 2px #e8ca7560, 0 0 12px #e8ca7526; }
  .stage-control.moving .control-value { color: #ffe49a; }
  .stage-control.pending { border-color: #b08b4a; }
  .stage-control.unresolved { border-color: #7f5050; background: #281c1e; }
  .stage-control.empty { opacity: 0.38; }
  .stage-control strong, .control-part, .control-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stage-control strong { font-size: 12px; }
  .control-number { position: absolute; left: 9px; top: 10px; color: #6f9dc0; font-size: 11px; font-weight: 700; }
  .control-part { color: #96a3ad; font-size: 11px; min-height: 14px; }
  .control-value { color: #d6e0e6; font-size: 13px; font-variant-numeric: tabular-nums; }
  .value-track { display: block; height: 3px; margin-top: 2px; background: #222d35; border-radius: 2px; overflow: hidden; }
  .value-track span { display: block; height: 100%; background: #4b91c2; }

  .stage-panic { justify-self: end; min-width: 190px; height: 36px; border: 1px solid #8f5151; border-radius: 5px; background: #2b1c1e; color: #f4bebe; font-size: 12px; letter-spacing: 0.08em; cursor: pointer; }

  @media (max-width: 900px) {
    .stage { overflow-y: auto; grid-template-rows: auto auto auto auto auto; }
    .setlist-grid { grid-template-columns: 68px minmax(180px, 1fr) 68px; }
    .next-song { display: none; }
    .stage-body { grid-template-columns: 1fr; }
    .stage-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
