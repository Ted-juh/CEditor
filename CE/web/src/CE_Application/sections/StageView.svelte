<script>
  /**
   * The stage screen: the rig read from the drum riser while playing a set. Large type, the whole
   * setlist, the song's notes in full, where you are in the song, the controls and the parts, and
   * anything wrong with its fix on it. Keys and foot pedals run the set; panic is always on screen.
   *
   * Three layouts, remembered per machine: Full for the laptop, Minimal (now, next, the time)
   * for a tablet on the floor, Controls for playing mostly knobs. Daylight contrast for outdoors.
   */
  import { onDestroy, onMount } from 'svelte';
  import {
    hostState, hostSurface, hostMidiActivity, hostLastError, hostPanic,
    hostSurfaceLayout, hostAudioDevices, requestSurfaceLayout, requestAudioDevices,
    setlistPrev, setlistNext, setlistGo, transportPlay, transportStop, launchScene,
  } from '../stores/instrumentHost.js';
  import {
    changedSurfaceSlot, stageSetlistContext, stageSurfaceModel, surfaceSlotForMidiActivity, stageControllerContext,
  } from '../utils/stageViewModel.js';
  import {
    arrangementBlocks, formatDuration, pushHistory, stageKeyAction, stageTimers, stageTroubles,
  } from '../utils/stageScreen.js';
  import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';
  import StageControls from './stage/StageControls.svelte';
  import StageRig from './stage/StageRig.svelte';
  import StageTrouble from './stage/StageTrouble.svelte';

  const PREFS_KEY = 'ceditor.instrumentHost.stageScreen.v1';
  const prefs = readStoredJson(PREFS_KEY, {}) ?? {};
  let layout = $state(['full', 'minimal', 'controls'].includes(prefs.layout) ? prefs.layout : 'full');
  let daylight = $state(prefs.daylight === true);
  let notesSize = $state(Math.max(14, Math.min(40, Number(prefs.notesSize) || 20)));
  $effect(() => writeStoredJson(PREFS_KEY, { layout, daylight, notesSize }));

  let performance = $derived($hostState.performance);
  let transport = $derived(performance.transport);
  let setlist = $derived(stageSetlistContext(performance));
  let surface = $derived(stageSurfaceModel($hostState.rack, performance, $hostSurface));
  let surfacePageId = $derived(surface.type === 'controls' ? ($hostState.rack.pages[surface.pageIndex]?.pageId ?? '') : '');
  let controller = $derived(stageControllerContext($hostSurfaceLayout, $hostAudioDevices, $hostSurface, $hostState.audio.enabled));
  let currentScene = $derived(performance.scenes.find((s) => s.sceneId === performance.currentSceneId)
    ?? (setlist.current ? performance.scenes.find((s) => s.sceneId === setlist.current.sceneId) : null) ?? null);
  let activeParts = $derived($hostState.rack.parts.filter((part) => part.hasInstrument || part.hardware || part.unresolved));
  let troubles = $derived(stageTroubles($hostState.reliability));
  let troubledParts = $derived(new Set(troubles.filter((t) => t.kind === 'note')
    .flatMap((t) => t.actions.filter((a) => a.partId).map((a) => a.partId))));
  let blocks = $derived(arrangementBlocks(performance.arrangement));

  // The clocks and the CPU line move once a second; nothing else needs a timer.
  let now = $state(Date.now());
  let cpuHistory = $state([]);
  let clockTimer;
  onMount(() => {
    requestAudioDevices();
    // Preserve the profile selected in Build; request its default only when none is loaded.
    if (!$hostSurfaceLayout.profileId) requestSurfaceLayout();
    clockTimer = setInterval(() => {
      now = Date.now();
      cpuHistory = pushHistory(cpuHistory, $hostState.audio.cpu);
    }, 1000);
  });
  // A new song reads 0:00 the moment it starts, not up to a tick later with the last song's time.
  $effect(() => { if (performance.setlist.songStartedAtMs) now = Date.now(); });
  let timers = $derived(stageTimers(performance.setlist, now));
  const clockText = $derived(new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  // A control lights while the hardware (or a learned MIDI control) moves it.
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

  // A song in the list arms on the first tap and goes on the second, so a brush never changes
  // the song in the middle of a set.
  let armed = $state(-1);
  let armTimer;
  function tapSong(index) {
    if (index === setlist.currentIndex) return;
    if (armed === index) { armed = -1; clearTimeout(armTimer); setlistGo(index); return; }
    armed = index;
    clearTimeout(armTimer);
    armTimer = setTimeout(() => (armed = -1), 4000);
  }

  // Keys: the ones a USB foot switch or page turner sends run the set. Panic on the keyboard is
  // held for half a second, so a stray key cannot silence a show; the button is instant.
  let panicHold = null;
  let panicHint = $state(false);
  function key(event) {
    // A focused knob or fader already used its arrows; a modifier means a shortcut elsewhere.
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const action = stageKeyAction(event);
    if (!action) return;
    if (action.kind === 'panicHold') {
      event.preventDefault();
      if (event.repeat || panicHold) return;
      panicHint = true;
      panicHold = setTimeout(() => { hostPanic(); panicHold = 'fired'; panicHint = false; }, 500);
      return;
    }
    if (event.repeat) return;
    if (action.kind === 'playStop') { event.preventDefault(); transport.playing ? transportStop() : transportPlay(); }
    else if (action.kind === 'next' && setlist.canNext) { event.preventDefault(); setlistNext(); }
    else if (action.kind === 'previous' && setlist.canPrevious) { event.preventDefault(); setlistPrev(); }
    else if (action.kind === 'scene' && performance.scenes[action.index]) launchScene(performance.scenes[action.index].sceneId);
    else if (action.kind === 'notesSize') notesSize = Math.max(14, Math.min(40, notesSize + action.delta));
    else if (action.kind === 'disarm') armed = -1;
  }
  function keyUp(event) {
    if (event.key !== 'p' && event.key !== 'P') return;
    if (panicHold && panicHold !== 'fired') clearTimeout(panicHold);
    panicHold = null;
    panicHint = false;
  }

  let fullscreen = $state(false);
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }
  const onFullscreen = () => (fullscreen = Boolean(document.fullscreenElement));

  onDestroy(() => { clearTimeout(movementTimer); clearTimeout(armTimer); clearInterval(clockTimer); if (panicHold && panicHold !== 'fired') clearTimeout(panicHold); });

  const audioStatus = (audio) => {
    if (!audio.enabled) return 'Audio off';
    if (!audio.running) return 'Audio starting';
    return `${audio.deviceName || 'Audio'} · ${Math.round(audio.cpu * 100)}% CPU`;
  };
  const sparkPath = (values) => values.length < 2 ? ''
    : values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * 80).toFixed(1)},${(16 - v * 16).toFixed(1)}`).join(' ');
  // Cues written in capitals ("CHORUS: scene 2") stand out in the notes.
  const noteParts = (text) => String(text ?? '').split(/(\b[A-Z][A-Z0-9]{2,}(?:\s[0-9]+)?\b)/g)
    .map((part, i) => ({ text: part, cue: i % 2 === 1 }));
  const aheadText = (ms) => (ms === null ? '' : Math.abs(ms) < 5000 ? 'on time' : `${formatDuration(Math.abs(ms))} ${ms > 0 ? 'early' : 'late'}`);
</script>

<svelte:window onkeydown={key} onkeyup={keyUp} />
<svelte:document onfullscreenchange={onFullscreen} />

<main class={`stage ${layout}`} class:daylight data-testid="host-stage-view">
  <section class="stage-status" aria-label="Performance status">
    <span class="clock" data-testid="stage-clock">{clockText}</span>
    <span class="timer" title="Since the first song of the set">set <b data-testid="stage-set-timer">{formatDuration(timers.setMs)}</b>
      {#if timers.ahead !== null}<em class:late={timers.ahead < -5000}>{aheadText(timers.ahead)}</em>{/if}</span>
    <span class="timer" title="Since this song began">song <b data-testid="stage-song-timer">{formatDuration(timers.songMs)}</b>{#if timers.plannedMs}
      <em class:late={timers.over}>/ {formatDuration(timers.plannedMs)}</em>{/if}</span>
    <div class="status-item" class:good={$hostState.audio.running} class:warn={$hostState.audio.xruns > 0}>
      <span class="status-dot"></span>
      <span>{audioStatus($hostState.audio)}</span>
      {#if $hostState.audio.running && cpuHistory.length > 1}
        <svg class="spark" viewBox="0 0 80 16" aria-hidden="true"><path d={sparkPath(cpuHistory)} /></svg>
      {/if}
      {#if $hostState.audio.xruns > 0}<span class="xruns" title="Audio dropouts since the audio started">{$hostState.audio.xruns} dropouts</span>{/if}
    </div>
    <div class="status-item" class:good={controller.midiEnabled} title={controller.midiDetail} data-testid="stage-midi-status">
      <span class="status-dot"></span>
      <span>{controller.midiLabel}</span>
    </div>
    {#if controller.displayLabel}
      <div class="status-item" class:good={$hostSurface.state === 'connected'} class:warn={controller.displayWarning}
           title={$hostSurface.detail || 'Optional hardware-display integration'} data-testid="stage-display-status">
        <span class="status-dot"></span><span>{controller.displayLabel}</span>
      </div>
    {/if}
    {#if $hostLastError}
      <span class="stage-error" role="alert">
        <span>{$hostLastError}</span>
        <button type="button" class="ctl" aria-label="Dismiss error" onclick={() => hostLastError.set('')}>×</button>
      </span>
    {/if}
    <span class="spacer"></span>
    <span class="views" role="group" aria-label="Stage layout">
      {#each [['full', 'Full'], ['minimal', 'Minimal'], ['controls', 'Controls']] as [value, label] (value)}
        <button type="button" class="ctl view" aria-pressed={layout === value} data-testid={`stage-layout-${value}`}
                onclick={() => (layout = value)}>{label}</button>
      {/each}
      <button type="button" class="ctl view" aria-pressed={daylight} data-testid="stage-daylight"
              title="High contrast for bright rooms and outdoor stages" onclick={() => (daylight = !daylight)}>☀</button>
      <button type="button" class="ctl view" aria-pressed={fullscreen} data-testid="stage-fullscreen"
              title="Fill the screen" onclick={toggleFullscreen}>⤢</button>
    </span>
    <span class="stage-lock" class:pending={!$hostState.stageLocked}>
      {$hostState.stageLocked ? 'STAGE LOCKED' : 'LOCKING…'}
    </span>
    <button type="button" class="ctl stage-panic" class:hint={panicHint} data-testid="stage-panic"
            onclick={() => hostPanic()} title="All notes off, every part. On the keyboard: hold P.">PANIC</button>
  </section>

  <StageTrouble {troubles} />

  {#if layout === 'full'}
    <nav class="set-rail" aria-label="Setlist" data-testid="stage-setlist">
      <div class="rail-head"><span class="eyebrow">Setlist</span>
        <span class="count">{setlist.currentIndex >= 0 ? `${setlist.currentIndex + 1} / ${setlist.items.length}` : `${setlist.items.length} songs`}</span></div>
      <div class="songs">
        {#each setlist.items as item, index (item.itemId)}
          <button type="button" class="ctl song" class:done={index < setlist.currentIndex} class:now={index === setlist.currentIndex}
                  class:next={setlist.next === item} class:armed={armed === index} class:missing={item.missing}
                  data-testid="stage-song" aria-current={index === setlist.currentIndex ? 'true' : undefined}
                  title={index === setlist.currentIndex ? 'Playing now' : armed === index ? 'Tap again to go' : 'Tap to choose, again to go'}
                  onclick={() => tapSong(index)}>
            <span class="n">{index < setlist.currentIndex ? '✓' : index + 1}</span>
            <span class="t">{item.name}</span>
            <span class="d">{[item.tempo > 0 ? `${Math.round(item.tempo)} BPM` : '', item.plannedSeconds > 0 ? formatDuration(item.plannedSeconds * 1000) : ''].filter(Boolean).join(' · ')}</span>
          </button>
        {/each}
        {#if setlist.items.length === 0}<div class="empty">No setlist. Add songs in Build, under Performance.</div>{/if}
      </div>
      {#if timers.totalPlannedMs > 0}<div class="rail-foot">Planned set {formatDuration(timers.totalPlannedMs)}</div>{/if}
    </nav>
  {/if}

  <section class="hero" aria-label="Now playing" data-testid="stage-now">
    <div class="hero-main">
      <span class="eyebrow now-label">NOW{setlist.currentIndex >= 0 ? ` · ${setlist.currentIndex + 1} OF ${setlist.items.length}` : ''}</span>
      <strong class="song-name" data-testid="stage-song-name">{setlist.current ? setlist.current.name : setlist.items.length ? 'Ready' : 'No setlist'}</strong>
      <span class="scene-line">
        {#if setlist.current && setlist.loadingIndex === setlist.currentIndex}Loading rig…
        {:else if currentScene}Scene <b>{currentScene.name}</b>{#if performance.snapshotMorph.active} · morphing {Math.round(performance.snapshotMorph.progress * 100)}%{/if}
        {:else if !setlist.current}{setlist.items.length ? 'Press Next, → or Page Down to begin' : 'Add scenes in Build mode'}{/if}
      </span>
    </div>
    <div class="hero-tempo">
      <button type="button" class="ctl play" class:playing={transport.playing} aria-label={transport.playing ? 'Stop' : 'Play'}
              onclick={() => (transport.playing ? transportStop() : transportPlay())}>{transport.playing ? '■' : '▶'}</button>
      <span class="bpm" data-testid="stage-tempo">{Math.round(transport.tempo)}<small>BPM</small></span>
      <span class="pos">{transport.bar}.{transport.beat} · {transport.numerator}/{transport.denominator}</span>
      <span class="beats" aria-hidden="true" data-testid="stage-beats">
        {#each Array(Math.min(12, transport.numerator)) as _, i (i)}
          <i class:on={transport.playing && transport.beat === i + 1} class:one={i === 0}></i>
        {/each}
      </span>
      <span class="clock-src" class:warn={transport.clockLost}>
        {transport.externalClock ? (transport.clockLost ? 'NO CLOCK' : 'EXT CLOCK') : 'INTERNAL'}</span>
    </div>
    {#if blocks.playing && layout !== 'minimal'}
      <div class="arrangement" data-testid="stage-arrangement">
        <div class="blocks">
          {#each blocks.blocks as block (block.itemId)}
            <span class={`block ${block.state}`} style={`flex:${block.bars}`}>
              {#if block.state === 'now'}<i style={`width:${block.progress * 100}%`}></i>{/if}<em>{block.name}</em>
            </span>
          {/each}
        </div>
        <span class="block-meta"><b>{blocks.barsLeft}</b> {blocks.barsLeft === 1 ? 'bar' : 'bars'} to {blocks.nextName}</span>
      </div>
    {/if}
  </section>

  <section class="next-card" aria-label="Next song" data-testid="stage-next">
    <span class="eyebrow next-label">NEXT</span>
    {#if setlist.next}
      <strong class="next-name">{setlist.next.name}</strong>
      <span class="next-meta">{setlist.next.sceneName || 'Scene'}{setlist.next.tempo > 0 ? ` · ${Math.round(setlist.next.tempo)} BPM` : ''}{setlist.next.plannedSeconds > 0 ? ` · ${formatDuration(setlist.next.plannedSeconds * 1000)}` : ''}</span>
      {#if setlist.nextReadiness}
        <span class="next-readiness" class:ready={setlist.nextReadiness.state === 'ready'}
              class:warn={setlist.nextReadiness.state === 'warning'} role="status"
              title={setlist.nextReadiness.detail}
              aria-label={`${setlist.nextReadiness.label}. ${setlist.nextReadiness.detail}`}
              data-testid="stage-next-readiness">{setlist.nextReadiness.label}</span>
      {/if}
    {:else}
      <strong class="next-name">End of set</strong>
      <span class="next-meta">No following song</span>
    {/if}
    <div class="go">
      <button type="button" class="ctl big" disabled={!setlist.canPrevious} onclick={() => setlistPrev()}
              aria-label="Previous setlist item">◀ PREV<small>← · Page Up</small></button>
      <button type="button" class="ctl big primary" disabled={!setlist.canNext} onclick={() => setlistNext()}
              aria-label={setlist.currentIndex < 0 ? 'Start setlist' : 'Next setlist item'}>
        {setlist.currentIndex < 0 ? 'START' : 'NEXT'} ▶<small>→ · Page Down</small></button>
    </div>
  </section>

  {#if layout !== 'controls'}
    <section class="notes-card" aria-label="Song notes" data-testid="stage-notes">
      <div class="notes-head"><span class="eyebrow">Notes</span>
        <span class="size">
          <button type="button" class="ctl mini" aria-label="Smaller notes" onclick={() => (notesSize = Math.max(14, notesSize - 2))}>A−</button>
          <button type="button" class="ctl mini" aria-label="Bigger notes" onclick={() => (notesSize = Math.min(40, notesSize + 2))}>A+</button>
        </span></div>
      <div class="notes" style={`font-size:${notesSize}px`} data-testid="stage-notes-text">{#if setlist.current?.notes}{#each noteParts(setlist.current.notes) as part, i (i)}{#if part.cue}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}{:else}<span class="empty">No notes for this song. Write them in Build, on the setlist entry.</span>{/if}</div>
    </section>
  {/if}

  {#if layout !== 'minimal'}
    <StageControls {surface} {controller} {movingSlot} pageId={surfacePageId} {performance} />
  {/if}
  {#if layout === 'full'}
    <StageRig parts={activeParts} macros={$hostState.rack.macros} {troubledParts} show="parts" />
  {/if}
  {#if layout !== 'minimal'}
    <StageRig parts={activeParts} macros={$hostState.rack.macros} {troubledParts} show="macros" />
  {/if}

  <span class="keys-help" aria-hidden="true">Space play · → next · ← previous · 1–8 scenes · hold P panic · N notes size</span>
</main>

<style>
  .stage {
    --stage-bg: #0b0f13; --stage-panel: #121820; --stage-raised: #1a222c; --stage-field: #0e1318;
    --stage-line: #2a3542; --stage-line-soft: #1e2731; --stage-line-strong: #3e4c5b;
    --stage-text: #eef3f7; --stage-soft: #b3bfca; --stage-dim: #7c8997;
    --stage-now: #ffb347; --stage-now-deep: #6b4a1e; --stage-now-surface: #2a2216; --stage-next: #79b9ee; --stage-next-surface: #152a3d;
    --stage-live: #58d68d; --stage-warn: #f2c14e; --stage-warn-surface: #2b2410; --stage-warn-text: #f2c14e;
    --stage-panic: #ff4d4d; --stage-hw: #ff9408; --stage-hw-surface: #2a1b0c;
    --stage-font: var(--host-font, 'Archivo', 'Segoe UI', sans-serif); --stage-mono: var(--host-font-mono, 'JetBrains Mono', monospace);
    position: relative; flex: 1; min-height: 0; overflow: auto; box-sizing: border-box; padding: 12px; gap: 10px;
    display: grid; color: var(--stage-text); font-family: var(--stage-font);
    background: radial-gradient(120% 90% at 30% 0%, #16202b 0%, var(--stage-bg) 60%);
  }
  .stage.daylight {
    --stage-bg: #f4f6f8; --stage-panel: #ffffff; --stage-raised: #e8edf2; --stage-field: #f0f3f6;
    --stage-line: #b9c4cf; --stage-line-soft: #d4dce4; --stage-line-strong: #8d9aa7;
    --stage-text: #0b1015; --stage-soft: #2d3945; --stage-dim: #4e5b68;
    --stage-now: #b35a00; --stage-now-deep: #f0c48e; --stage-now-surface: #fbe9d4; --stage-next: #0a5ea8; --stage-next-surface: #dcebf8;
    --stage-live: #117a3c; --stage-warn: #a36b00; --stage-warn-surface: #fff4d6; --stage-warn-text: #8a5d00; --stage-hw-surface: #fde7cf;
    background: var(--stage-bg);
  }
  .stage.full { grid-template-columns: 250px minmax(0, 1fr) 360px; grid-template-rows: auto auto minmax(160px, auto) minmax(160px, 1fr) auto auto auto;
    grid-template-areas: 'status status status' 'trouble trouble trouble' 'rail hero next' 'rail hero notes' 'rail controls controls' 'rail parts macros' 'help help help'; }
  .stage.minimal { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1.4fr) minmax(0, 1fr) auto;
    grid-template-areas: 'status status' 'trouble trouble' 'hero hero' 'next notes' 'help help'; }
  .stage.controls { grid-template-columns: minmax(0, 1fr) 360px; grid-template-rows: auto auto auto auto minmax(0, 1fr) auto;
    grid-template-areas: 'status status' 'trouble trouble' 'hero next' 'controls controls' 'macros macros' 'help help'; }
  .stage-status { grid-area: status; }
  .stage :global(.trouble) { grid-area: trouble; }
  .set-rail { grid-area: rail; }
  .hero { grid-area: hero; }
  .next-card { grid-area: next; }
  .notes-card { grid-area: notes; }
  .stage :global(.controls-panel) { grid-area: controls; }
  .stage :global(.parts-panel) { grid-area: parts; }
  .stage :global(.macros-panel) { grid-area: macros; }
  /* These rows are sized by what is in them: a panel allowed to shrink to nothing has its knobs
     spill over the row beneath on a short screen. The rail and the notes scroll instead. */
  .stage :global(.controls-panel), .stage :global(.parts-panel), .stage :global(.macros-panel) { min-height: auto; }

  .stage :global(.stage-panel), .set-rail, .hero, .next-card, .notes-card {
    background: var(--stage-panel); border: 1px solid var(--stage-line-soft); border-radius: 10px; padding: 12px; min-width: 0; min-height: 0; box-sizing: border-box; }
  .eyebrow { font: 700 11px var(--stage-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--stage-dim); }

  .stage-status { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; min-width: 0; padding: 8px 12px;
                  background: var(--stage-panel); border: 1px solid var(--stage-line-soft); border-radius: 10px;
                  font: 13px var(--stage-mono); color: var(--stage-soft); }
  .clock { font-size: 22px; font-weight: 700; color: var(--stage-text); }
  .timer b { color: var(--stage-text); }
  .timer em { font-style: normal; color: var(--stage-dim); margin-left: 4px; }
  .timer em.late { color: var(--stage-warn); }
  .status-item { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
  .status-item > span:not(.status-dot) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--stage-dim); flex: none; }
  .status-item.good .status-dot { background: var(--stage-live); box-shadow: 0 0 6px var(--stage-live); }
  .status-item.warn .status-dot { background: var(--stage-warn); }
  .spark { width: 80px; height: 16px; flex: none; }
  .spark path { fill: none; stroke: var(--stage-live); stroke-width: 1.5; }
  .xruns { color: var(--stage-warn); }
  .stage-error { display: inline-flex; align-items: center; gap: 6px; max-width: 420px; color: var(--stage-warn); }
  .stage-error > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stage-error button { background: none; border: 0; color: inherit; font-size: 16px; cursor: pointer; }
  .spacer { flex: 1; }
  .views { display: inline-flex; gap: 2px; padding: 2px; background: var(--stage-field); border: 1px solid var(--stage-line-soft); border-radius: 6px; }
  button.view { font: 600 12px var(--stage-font); padding: 5px 9px; border: 0; border-radius: 4px; background: transparent; color: var(--stage-soft); cursor: pointer; }
  button.view[aria-pressed='true'] { background: var(--stage-now-surface); color: var(--stage-now); box-shadow: inset 0 0 0 1px var(--stage-now-deep); }
  .stage-lock { font: 700 11px var(--stage-mono); letter-spacing: .1em; color: var(--stage-now); border: 1px solid var(--stage-now-deep); padding: 4px 8px; border-radius: 4px; white-space: nowrap; }
  .stage-lock.pending { color: var(--stage-dim); border-color: var(--stage-line); }
  button.stage-panic { font: 800 17px var(--stage-font); letter-spacing: .08em; color: #fff; background: var(--stage-panic); border: 0;
                       border-radius: 7px; padding: 10px 20px; cursor: pointer; box-shadow: 0 0 0 2px #ff4d4d55; }
  button.stage-panic.hint { box-shadow: 0 0 0 4px #ff4d4daa; }

  .set-rail { display: flex; flex-direction: column; gap: 6px; }
  .rail-head { display: flex; justify-content: space-between; align-items: center; }
  .count { font: 12px var(--stage-mono); color: var(--stage-dim); }
  .songs { display: flex; flex-direction: column; gap: 3px; overflow-y: auto; min-height: 0; flex: 1; }
  button.song { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 1px 8px; align-items: center; padding: 9px 10px; border-radius: 7px;
                border: 1px solid transparent; background: none; color: var(--stage-soft); text-align: left; cursor: pointer; font: inherit; }
  button.song:hover { background: var(--stage-raised); }
  button.song .n { font: 12px var(--stage-mono); color: var(--stage-dim); }
  button.song .t { font-size: 15px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button.song .d { grid-column: 2; font: 11px var(--stage-mono); color: var(--stage-dim); }
  button.song .d:empty { display: none; }
  button.song.done { opacity: .45; }
  button.song.now { background: var(--stage-now-surface); border-color: var(--stage-now-deep); color: var(--stage-text); }
  button.song.now .n { color: var(--stage-now); }
  button.song.next { border-color: var(--stage-next-surface); }
  button.song.armed { border-color: var(--stage-warn); box-shadow: 0 0 0 1px var(--stage-warn); }
  button.song.missing .t { color: var(--stage-warn); }
  .rail-foot { font: 12px var(--stage-mono); color: var(--stage-dim); }
  .empty { color: var(--stage-dim); font-size: 13px; }

  .hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 22px; align-content: start; }
  .hero-main { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .now-label { color: var(--stage-now); }
  .song-name { font-size: 60px; line-height: 1.02; font-weight: 800; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stage.minimal .song-name { font-size: 96px; }
  .stage.minimal .hero { align-content: center; }
  .scene-line { font-size: 20px; color: var(--stage-soft); }
  .scene-line b { color: var(--stage-now); }
  .hero-tempo { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  button.play { width: 58px; height: 58px; border-radius: 50%; border: 2px solid var(--stage-live); background: transparent; color: var(--stage-live); font-size: 22px; cursor: pointer; }
  button.play.playing { background: var(--stage-live); color: #04140a; }
  .bpm { font: 700 54px var(--stage-mono); line-height: 1; }
  .stage.minimal .bpm { font-size: 80px; }
  .bpm small { font-size: 16px; color: var(--stage-dim); margin-left: 4px; }
  .pos { font: 600 22px var(--stage-mono); color: var(--stage-soft); }
  .beats { display: flex; gap: 8px; }
  .beats i { width: 20px; height: 20px; border-radius: 50%; background: var(--stage-raised); border: 1px solid var(--stage-line); display: block; }
  .beats i.on { background: var(--stage-now); border-color: var(--stage-now); box-shadow: 0 0 12px var(--stage-now); }
  .beats i.on.one { background: #fff; border-color: #fff; box-shadow: 0 0 14px #fff; }
  .stage.daylight .beats i.on.one { background: var(--stage-now); border-color: var(--stage-now); }
  .clock-src { font: 700 11px var(--stage-mono); letter-spacing: .1em; color: var(--stage-dim); }
  .clock-src.warn { color: var(--stage-warn); }
  .arrangement { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 5px; }
  .blocks { display: flex; gap: 3px; height: 30px; }
  .block { position: relative; overflow: hidden; border-radius: 4px; background: var(--stage-raised); display: flex; align-items: center; padding-left: 8px; min-width: 0; }
  .block em { position: relative; font: 600 12px var(--stage-font); font-style: normal; color: var(--stage-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .block i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--stage-now-surface); }
  .block.now { box-shadow: inset 0 0 0 1px var(--stage-now); }
  .block.now em { color: var(--stage-text); }
  .block.queued { box-shadow: inset 0 0 0 1px var(--stage-next); }
  .block.queued em { color: var(--stage-next); }
  .block.done { opacity: .5; }
  .block-meta { font: 13px var(--stage-mono); color: var(--stage-dim); }
  .block-meta b { color: var(--stage-text); }

  .next-card { display: flex; flex-direction: column; gap: 6px; }
  .next-label { color: var(--stage-next); }
  .next-name { font-size: 30px; font-weight: 750; line-height: 1.08; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .next-meta { font: 13px var(--stage-mono); color: var(--stage-dim); }
  .next-readiness { align-self: flex-start; font: 600 12px var(--stage-mono); padding: 4px 8px; border-radius: 12px; border: 1px solid var(--stage-line); color: var(--stage-soft); }
  .next-readiness.ready { border-color: var(--stage-live); color: var(--stage-live); }
  .next-readiness.warn { border-color: var(--stage-warn); color: var(--stage-warn); }
  .go { display: flex; gap: 8px; margin-top: auto; padding-top: 6px; }
  button.big { flex: 1; font: 800 18px var(--stage-font); letter-spacing: .04em; padding: 14px 8px; border-radius: 8px; cursor: pointer;
               background: var(--stage-raised); color: var(--stage-text); border: 1px solid var(--stage-line-strong); }
  button.big.primary { background: var(--stage-next-surface); border-color: var(--stage-next); color: var(--stage-next); }
  button.big:disabled { opacity: .4; cursor: default; }
  button.big small { display: block; font: 500 11px var(--stage-mono); letter-spacing: 0; color: var(--stage-dim); margin-top: 2px; }

  .notes-card { display: flex; flex-direction: column; gap: 6px; }
  .notes-head { display: flex; justify-content: space-between; align-items: center; }
  .size { display: inline-flex; gap: 4px; }
  button.mini { font: 700 12px var(--stage-font); padding: 3px 8px; border-radius: 5px; background: var(--stage-raised); color: var(--stage-soft); border: 1px solid var(--stage-line); cursor: pointer; }
  .notes { overflow-y: auto; line-height: 1.45; white-space: pre-wrap; color: var(--stage-text); min-height: 0; flex: 1; }
  .notes mark { background: none; color: var(--stage-now); font-weight: 750; }
  .notes .empty { font-size: 14px; }

  .keys-help { grid-area: help; justify-self: end; font: 11px var(--stage-mono); color: var(--stage-dim); opacity: .7; }
  .stage :global(button:focus-visible) { outline: 2px solid var(--stage-next); outline-offset: 2px; }

  /* A narrow window stacks everything in reading order: status, trouble, now, next, notes, the rest. */
  @media (max-width: 900px) {
    .stage.full, .stage.minimal, .stage.controls { grid-template-columns: minmax(0, 1fr); grid-template-rows: none;
      grid-template-areas: 'status' 'trouble' 'hero' 'next' 'notes' 'rail' 'controls' 'parts' 'macros'; }
    .song-name, .stage.minimal .song-name { font-size: 40px; }
    .bpm, .stage.minimal .bpm { font-size: 40px; }
    .hero { grid-template-columns: minmax(0, 1fr); }
    .hero-tempo { align-items: flex-start; }
    .keys-help { display: none; }
  }
</style>
