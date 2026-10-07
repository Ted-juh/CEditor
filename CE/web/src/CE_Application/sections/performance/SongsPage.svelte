<script>
  /**
   * Songs: the set on the left, the chosen song on the right. A song is built from sections,
   * each a scene held for a number of bars, drawn to scale on a timeline you drag: a block to
   * reorder it, its right edge to change its length. Soundcheck, preload and the rig check are
   * things done to the whole set before the show, so they sit together at the bottom.
   */
  import {
    hostState, addSetlistItem, removeSetlistItem, moveSetlistItem, setSetlistItem, setSetlistOptions,
    setlistGo, checkSetlistSoundcheck, startSoundcheck, finishSoundcheck,
    addArrangementItem, removeArrangementItem, setArrangementItem, moveArrangementItem,
    setArrangementOptions, startArrangement, stopArrangement,
  } from '../../stores/instrumentHost.js';
  import { barsFromDrag, dropIndex, rulerMarks, sceneColour, songSummary, totalBars } from '../../utils/songSections.js';
  import { parseSongLength } from '../../utils/stageScreen.js';
  import ScrubValue from '../../components/controls/ScrubValue.svelte';
  import Segmented from '../../components/controls/Segmented.svelte';
  import ControllerPagePick from './ControllerPagePick.svelte';
  import PropertyToggle from '../../properties/PropertyToggle.svelte';
  import HostConfirmButton from '../HostConfirmButton.svelte';
  import SetlistSoundcheckRow from '../SetlistSoundcheckRow.svelte';

  let { performance, rackCaptures = [], preloadFor = () => null, onShowMixer = () => {} } = $props();

  const songs = $derived(performance.setlist.items);
  const current = $derived(performance.setlist.currentIndex);
  let pickedSongId = $state('');
  let knownSongCount = 0;
  const song = $derived(songs.find((s) => s.itemId === pickedSongId) ?? songs[Math.max(0, current)] ?? songs[0] ?? null);
  const songIndex = $derived(song ? songs.indexOf(song) : -1);
  $effect(() => {
    // A song just added is the one about to be written.
    const count = songs.length;
    if (count > knownSongCount && knownSongCount > 0) pickedSongId = songs[count - 1].itemId;
    knownSongCount = count;
  });

  const sceneIndex = (sceneId) => performance.scenes.findIndex((s) => s.sceneId === sceneId);
  const sceneName = (sceneId) => performance.scenes.find((s) => s.sceneId === sceneId)?.name ?? '';
  // Its sections are what plays while this song is current; editing them mid-way is refused.
  const playingThis = $derived(performance.arrangement.playing && song != null && performance.arrangement.songId === song.itemId);
  const plannedTotal = $derived(songs.every((s) => s.plannedSeconds > 0) && songs.length > 0
    ? songs.reduce((sum, s) => sum + s.plannedSeconds, 0) : 0);
  const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  function addSong() {
    const last = songs.at(-1);
    addSetlistItem(last?.sceneId || performance.scenes[0]?.sceneId || '', `Song ${songs.length + 1}`);
  }
  function play(fromTop = true) {
    if (!song) return;
    if (songIndex !== current) setlistGo(songIndex);
    if (song.sections.length > 0 && fromTop) startArrangement(0);
  }

  // ---- the set: drag a song by its grip to reorder, or Alt+arrows on a focused row --------
  let listElement = $state(null);
  let songDrag = $state(null);   // { itemId, from, to }
  function beginSongDrag(event, item, index) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    songDrag = { itemId: item.itemId, from: index, to: index };
  }
  function moveSongDrag(event) {
    if (!songDrag || !listElement) return;
    const rows = [...listElement.querySelectorAll('[data-song-row]')];
    const mids = rows.filter((_, i) => i !== songDrag.from).map((row) => { const r = row.getBoundingClientRect(); return r.top + r.height / 2; });
    songDrag = { ...songDrag, to: dropIndex(mids, event.clientY, -1) };
  }
  function endSongDrag() {
    if (songDrag && songDrag.to !== songDrag.from) moveSetlistItem(songDrag.itemId, songDrag.to);
    songDrag = null;
  }
  function songKey(event, item, index) {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    moveSetlistItem(item.itemId, Math.max(0, Math.min(songs.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1))));
  }

  // ---- the timeline: a block drags to reorder, its edge drags to change its bars ----------
  let stripElement = $state(null);
  let pickedSectionId = $state('');
  const section = $derived(song?.sections.find((s) => s.itemId === pickedSectionId) ?? null);
  let edgeDrag = $state(null);    // { itemId, startX, startBars, pxPerBar, bars }
  let blockDrag = $state(null);   // { itemId, from, startX, to, moved }
  const shownBars = (item) => (edgeDrag?.itemId === item.itemId ? edgeDrag.bars : item.bars);
  const shownTotal = $derived(song ? song.sections.reduce((sum, s) => sum + shownBars(s), 0) : 0);
  const ruler = $derived(rulerMarks(shownTotal));

  function beginEdge(event, item) {
    if (playingThis) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const width = stripElement?.getBoundingClientRect().width ?? 1;
    edgeDrag = { itemId: item.itemId, startX: event.clientX, startBars: item.bars,
                 pxPerBar: width / Math.max(1, totalBars(song.sections)), bars: item.bars };
  }
  function moveEdge(event) {
    if (!edgeDrag) return;
    edgeDrag = { ...edgeDrag, bars: barsFromDrag(edgeDrag.startBars, event.clientX - edgeDrag.startX, edgeDrag.pxPerBar) };
  }
  function endEdge() {
    if (edgeDrag && edgeDrag.bars !== edgeDrag.startBars) setArrangementItem(edgeDrag.itemId, { bars: edgeDrag.bars }, song.itemId);
    edgeDrag = null;
  }
  function beginBlock(event, item, index) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    blockDrag = { itemId: item.itemId, from: index, to: index, startX: event.clientX, moved: false };
  }
  function moveBlock(event) {
    if (!blockDrag || playingThis) return;
    const moved = blockDrag.moved || Math.abs(event.clientX - blockDrag.startX) > 6;
    if (!moved) return;
    const blocks = [...(stripElement?.querySelectorAll('[data-section-block]') ?? [])];
    const mids = blocks.filter((_, i) => i !== blockDrag.from).map((b) => { const r = b.getBoundingClientRect(); return r.left + r.width / 2; });
    blockDrag = { ...blockDrag, moved, to: dropIndex(mids, event.clientX, -1) };
  }
  function endBlock() {
    if (!blockDrag) return;
    if (blockDrag.moved && blockDrag.to !== blockDrag.from) moveArrangementItem(blockDrag.itemId, blockDrag.to, song.itemId);
    else if (!blockDrag.moved) pickedSectionId = pickedSectionId === blockDrag.itemId ? '' : blockDrag.itemId;
    blockDrag = null;
  }
  function blockKey(event, item, index) {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pickedSectionId = item.itemId; return; }
    if (playingThis || !event.altKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveArrangementItem(item.itemId, Math.max(0, Math.min(song.sections.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1))), song.itemId);
    }
  }
  function addSection(sceneId) {
    if (!sceneId || !song) return;
    addArrangementItem(sceneId, undefined, song.itemId, 8);
  }
</script>

<div class="perf-body setlist-body songs-page" data-testid="perf-setlist">
  <div class="songs-grid">
    <!-- The set ---------------------------------------------------------------------------- -->
    <section class="set" aria-label="The set">
      <div class="set-head">
        <span class="label">The set · {songs.length} {songs.length === 1 ? 'song' : 'songs'}{plannedTotal ? ` · ${clock(plannedTotal)}` : ''}</span>
        <button type="button" class="primary" data-testid="setlist-add-song" title="Add a song to the end of the set" onclick={addSong}>+ Song</button>
      </div>
      {#if songs.length === 0}
        <div class="empty-hint">No songs yet. <strong>+ Song</strong> starts one; give it sections from your scenes.</div>
      {/if}
      <div class="song-list" bind:this={listElement} role="listbox" aria-label="Songs">
        {#each songs as item, index (item.itemId)}
          {@const preload = preloadFor(item)}
          <div class="song-row" class:picked={song?.itemId === item.itemId} class:now={current === index}
               class:dragging={songDrag?.itemId === item.itemId}
               class:drop-above={songDrag && songDrag.to === index && songDrag.from > index}
               class:drop-below={songDrag && songDrag.to === index && songDrag.from < index}
               data-song-row data-testid="song-row" role="option" aria-selected={song?.itemId === item.itemId} tabindex="0"
               onclick={() => (pickedSongId = item.itemId)} onkeydown={(e) => songKey(e, item, index)}>
            <span class="n">{index + 1}</span>
            <span class="song-text">
              <b>{item.name}</b>
              <small>{songSummary(item, item.sceneName)}</small>
            </span>
            {#if current === index}<span class="chip now" title="The song on stage now">now</span>{/if}
            {#if preload}<span class={`chip ${preload.state}`} title={preload.error}>{preload.state === 'ready' ? 'ready' : preload.state}</span>{/if}
            <span class="grip" title="Drag to move; or Alt+↑/↓" role="presentation"
                  onpointerdown={(e) => beginSongDrag(e, item, index)} onpointermove={moveSongDrag}
                  onpointerup={endSongDrag} onpointercancel={() => (songDrag = null)}>⋮⋮</span>
          </div>
        {/each}
      </div>
    </section>

    <!-- The song --------------------------------------------------------------------------- -->
    {#if song}
      <section class="song" aria-label="Song" data-testid="song-editor">
        <div class="song-head">
          <label class="field name-field">Song
            <input type="text" class="setlist-name" value={song.name} aria-label={`Song name ${songIndex + 1}`}
                   data-testid="setlist-song-name" onchange={(e) => setSetlistItem(song.itemId, { name: e.currentTarget.value })} />
          </label>
          <div class="field" title="Keep the current tempo, or set the song's">Tempo
            <ScrubValue value={song.tempo} min={0} max={300} step={1} fineStep={0.1} label={`Tempo for ${song.name}`}
                        testid="setlist-tempo" format={(v) => (v > 0 ? `${Math.round(v * 10) / 10}` : 'keep')}
                        onchange={(tempo) => setSetlistItem(song.itemId, { tempo })} />
          </div>
          <div class="field" title="How long the song should take on stage. The stage's timers count toward it.">Length
            <ScrubValue value={song.plannedSeconds} min={0} max={3600} step={15} fineStep={1}
                        label={`Planned length for ${song.name}`} testid="setlist-length"
                        format={(s) => (s > 0 ? clock(s) : 'none')} parse={parseSongLength}
                        onchange={(plannedSeconds) => setSetlistItem(song.itemId, { plannedSeconds })} />
          </div>
          <div class="field">Controller page
            <ControllerPagePick pages={$hostState.rack.pages} keepTitle="Keep the controller page that is showing"
                                value={song.pageId} label={`${song.name} controller page`} testid="song-page"
                                onchange={(pageId) => setSetlistItem(song.itemId, { pageId })} />
          </div>
          <span class="spacer"></span>
          {#if playingThis}
            <button type="button" data-testid="song-stop" onclick={() => stopArrangement()}>■ Stop</button>
          {:else}
            <button type="button" class="primary" data-testid="song-play"
                    title={song.sections.length ? 'Make this the current song and play its sections from the top' : 'Make this the current song'}
                    onclick={() => play()}>{song.sections.length ? '▶ Play from the top' : 'Go to this song'}</button>
          {/if}
        </div>

        <div class="timeline">
          <div class="timeline-head">
            <span class="label">Sections{song.sections.length ? ` · ${shownTotal} bars` : ''}</span>
            {#if song.sections.length}
              <span class="hint">{playingThis ? 'Playing: stop to change the sections' : 'Drag a block to move it · drag its edge to change its bars · click to edit'}</span>
            {/if}
            <span class="spacer"></span>
            {#if song.sections.length}
              <PropertyToggle compact label="Loop" value={song.sectionsLoop} disabled={playingThis}
                              onchange={(loop) => setArrangementOptions({ loop }, song.itemId)} />
            {/if}
          </div>
          {#if song.sections.length === 0}
            <div class="no-sections">
              <span>No sections: the song stays on</span>
              <select class="setlist-scene" value={song.sceneId} data-testid="setlist-scene" aria-label={`${song.name} scene`}
                      onchange={(e) => setSetlistItem(song.itemId, { sceneId: e.currentTarget.value })}>
                <option value="">no scene (keep the sound)</option>
                {#if song.missing}<option value={song.sceneId}>scene is gone</option>{/if}
                {#each performance.scenes as scene (scene.sceneId)}<option value={scene.sceneId}>{scene.name}</option>{/each}
              </select>
              <span>until you add one.</span>
            </div>
          {:else}
            <div class="ruler" aria-hidden="true">
              {#each ruler.marks as bar (bar)}<span style={`left:${((bar - 1) / Math.max(1, shownTotal)) * 100}%`}>{bar}</span>{/each}
            </div>
            <div class="strip" bind:this={stripElement}>
              {#each song.sections as item, index (item.itemId)}
                {@const colour = sceneColour(sceneIndex(item.sceneId))}
                {@const playing = playingThis && performance.arrangement.currentIndex === index}
                <div class="block" class:picked={pickedSectionId === item.itemId} class:playing class:missing={item.missing}
                     class:moving={blockDrag?.itemId === item.itemId && blockDrag.moved}
                     class:drop-before={blockDrag?.moved && blockDrag.to === index && blockDrag.from > index}
                     class:drop-after={blockDrag?.moved && blockDrag.to === index && blockDrag.from < index}
                     style={`flex:${shownBars(item)} 1 0; --block:${colour}`}
                     data-section-block data-testid="song-section" role="button" tabindex="0"
                     aria-label={`${item.name}, ${item.sceneName || 'missing scene'}, ${shownBars(item)} bars`}
                     onpointerdown={(e) => beginBlock(e, item, index)} onpointermove={moveBlock}
                     onpointerup={endBlock} onpointercancel={() => (blockDrag = null)} onkeydown={(e) => blockKey(e, item, index)}>
                  <b>{item.name}</b>
                  <small>{item.missing ? 'scene is gone' : item.sceneName} · {shownBars(item)}</small>
                  {#if playing}<i class="progress" style={`width:${performance.arrangement.progress * 100}%`}></i>{/if}
                  {#if !playingThis}
                    <span class="edge" data-testid="song-section-edge" title="Drag to change its bars"
                          role="presentation" onpointerdown={(e) => beginEdge(e, item)} onpointermove={moveEdge}
                          onpointerup={endEdge} onpointercancel={() => (edgeDrag = null)}></span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
          {#if !playingThis}
            <div class="add-row">
              <select class="add-section" data-testid="song-add-section" aria-label="Add a section" value=""
                      onchange={(e) => { addSection(e.currentTarget.value); e.currentTarget.value = ''; }}>
                <option value="">+ Section from a scene…</option>
                {#each performance.scenes as scene (scene.sceneId)}<option value={scene.sceneId}>{scene.name}</option>{/each}
              </select>
              {#if performance.scenes.length === 0}<span class="hint">Make scenes in the Launcher first.</span>{/if}
            </div>
          {/if}
          {#if section && !playingThis}
            <div class="section-editor" data-testid="song-section-editor">
              <label class="field">Section
                <input type="text" value={section.name} aria-label="Section name"
                       onchange={(e) => setArrangementItem(section.itemId, { name: e.currentTarget.value }, song.itemId)} />
              </label>
              <label class="field">Scene
                <select value={section.sceneId} aria-label="Section scene"
                        onchange={(e) => setArrangementItem(section.itemId, { sceneId: e.currentTarget.value }, song.itemId)}>
                  {#if section.missing}<option value={section.sceneId}>scene is gone</option>{/if}
                  {#each performance.scenes as scene (scene.sceneId)}<option value={scene.sceneId}>{scene.name}</option>{/each}
                </select>
              </label>
              <div class="field">Bars
                <ScrubValue value={section.bars} min={1} max={128} step={1} label={`${section.name} bars`} testid="song-section-bars"
                            onchange={(bars) => setArrangementItem(section.itemId, { bars }, song.itemId)} />
              </div>
              <span class="spacer"></span>
              <button type="button" class="ghost danger" data-testid="song-section-remove"
                      onclick={() => { removeArrangementItem(section.itemId, song.itemId); pickedSectionId = ''; }}>Remove section</button>
            </div>
          {/if}
        </div>

        <label class="field notes-field">Notes for the stage
          <textarea class="setlist-notes" rows="3" placeholder="lyrics, cues (CHORUS: scene 2)…"
                    value={song.notes} aria-label={`Stage notes for ${song.name}`}
                    onchange={(e) => setSetlistItem(song.itemId, { notes: e.currentTarget.value })}></textarea>
        </label>

        <div class="song-foot">
          <label class="field" title="A full-rack capture from the library to load for this song">Rig
            <select value={song.rackRecordId} onchange={(e) => setSetlistItem(song.itemId, { rackRecordId: e.currentTarget.value })}>
              <option value="">The current rig</option>
              {#each rackCaptures as record (record.recordId)}
                <option value={record.recordId} disabled={!record.available}>{record.name}</option>
              {/each}
            </select>
          </label>
          <span class="spacer"></span>
          <HostConfirmButton identity={JSON.stringify([song.itemId])} title="Remove this song from the set" aria-label="Remove song"
                             type="button" class="ghost danger" onclick={() => removeSetlistItem(song.itemId)}>Remove song</HostConfirmButton>
        </div>
      </section>
    {/if}
  </div>

  <!-- Before the show: things done to the whole set ------------------------------------------ -->
  {#if songs.length > 0}
    <section class="before-show" aria-label="Before the show">
      <div class="show-head">
        <span class="label">Before the show</span>
        <button type="button" class="ghost" title="Check saved rig references without loading plug-ins or sending MIDI"
                onclick={() => checkSetlistSoundcheck()}>Check setlist</button>
        <button type="button" class="ghost" onclick={onShowMixer}>Mixer</button>
        <span class="field inline" title="Warm upcoming full-rack captures before they are needed">Preload
          <Segmented options={[{ value: 0, label: 'Off' }, { value: 1, label: 'Next song' }, { value: 2, label: 'Next 2' }]}
                     value={performance.setlist.preloadAhead} label="Preload ahead" testid="setlist-preload"
                     onchange={(preloadAhead) => setSetlistOptions({ preloadAhead })} />
        </span>
      </div>
      {#each songs as item, index (item.itemId)}
        <div class="check-row">
          <span class="check-name" title={item.name}>{index + 1} · {item.name}</span>
          <SetlistSoundcheckRow {item} soundcheck={$hostState.soundcheck} onMeasure={startSoundcheck} onStop={finishSoundcheck} />
        </div>
      {/each}
    </section>
  {/if}
</div>

<style>
  .songs-page { flex-direction: column; gap: 14px; width: 100%; }
  .songs-grid { display: grid; grid-template-columns: minmax(200px, 250px) minmax(0, 1fr); gap: 14px; width: 100%; align-items: start; }
  .set, .song, .before-show { border: 1px solid var(--host-line); border-radius: var(--host-radius-panel, 8px); background: var(--host-bg-deep, #12171b); padding: 10px; min-width: 0; }
  .before-show { width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; }
  .set-head, .song-head, .timeline-head, .song-foot, .add-row, .section-editor { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .set-head { justify-content: space-between; margin-bottom: 6px; }
  .label { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .12em; text-transform: uppercase; color: var(--host-text-dim, #6c7783); }
  .hint { font-size: 11px; color: var(--host-text-dim, #6c7783); }
  .spacer { flex: 1; }
  .show-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
  .check-row { display: grid; grid-template-columns: minmax(90px, 180px) minmax(0, 1fr); gap: 10px; align-items: center; }
  .check-name { font-size: 12px; color: var(--host-text-soft, #9aa5b1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .song-list { display: flex; flex-direction: column; gap: 2px; }
  .song-row { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto auto 14px; gap: 6px; align-items: center; padding: 7px 8px;
              border-radius: 6px; border: 1px solid transparent; cursor: pointer; }
  .song-row:hover { background: var(--host-surface-hover, #1d252d); }
  .song-row.picked { background: var(--host-accent-surface, #1f3530); border-color: var(--host-accent, #80d8bc); }
  .song-row.dragging { opacity: .5; }
  .song-row.drop-above { box-shadow: inset 0 2px 0 var(--host-accent, #80d8bc); }
  .song-row.drop-below { box-shadow: inset 0 -2px 0 var(--host-accent, #80d8bc); }
  .song-row:focus-visible { outline: 2px solid var(--host-accent-strong, #80d8bc); outline-offset: 1px; }
  .n { font: 11px var(--host-font-mono, monospace); color: var(--host-text-dim, #6c7783); }
  .song-text { display: flex; flex-direction: column; min-width: 0; }
  .song-text b { font-size: 13px; color: var(--host-text, #d6dbe0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .song-text small { font-size: 10.5px; color: var(--host-text-dim, #6c7783); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip { font: 600 9.5px var(--host-font-mono, monospace); padding: 1px 6px; border-radius: 8px; border: 1px solid var(--host-line); color: var(--host-text-soft, #9aa5b1); }
  .chip.now { border-color: #b8782a; color: #ffb347; }
  .chip.ready { border-color: #2f5a3a; color: #8fd19e; }
  .chip.degraded { border-color: #7a5a2a; color: #d9a441; }
  .grip { cursor: grab; color: #4a5866; font-size: 12px; touch-action: none; user-select: none; }
  .song { display: flex; flex-direction: column; gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #aab4bd; }
  .field.inline { flex-direction: row; align-items: center; gap: 6px; }
  .name-field input { font-size: 16px; font-weight: 650; width: 220px; }
  .timeline { display: flex; flex-direction: column; gap: 6px; }
  .no-sections { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--host-text-soft, #9aa5b1);
                 padding: 10px; border: 1px dashed var(--host-line); border-radius: 6px; }
  .setlist-scene { width: 180px; }
  .ruler { position: relative; height: 14px; font: 10px var(--host-font-mono, monospace); color: var(--host-text-dim, #6c7783); }
  .ruler span { position: absolute; top: 0; padding-left: 3px; border-left: 1px solid var(--host-line); }
  .strip { display: flex; gap: 3px; height: 58px; }
  .block { position: relative; min-width: 34px; display: flex; flex-direction: column; justify-content: space-between; padding: 6px 12px 6px 8px;
           border-radius: 6px; background: var(--block); color: #0d1115; overflow: hidden; cursor: grab; touch-action: none; user-select: none; box-sizing: border-box; }
  .block b { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .block small { font: 600 10px var(--host-font-mono, monospace); opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .block.picked { box-shadow: 0 0 0 2px #fff inset; }
  .block.playing { box-shadow: 0 0 0 2px #58d68d inset; }
  .block.missing { background: repeating-linear-gradient(135deg, #3a4450 0 6px, #2c343d 6px 12px); color: #d9a441; }
  .block.moving { opacity: .55; }
  .block.drop-before { box-shadow: -3px 0 0 #fff; }
  .block.drop-after { box-shadow: 3px 0 0 #fff; }
  .block:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
  .block .progress { position: absolute; left: 0; bottom: 0; height: 4px; background: #0d1115aa; }
  .block .edge { position: absolute; right: 0; top: 0; bottom: 0; width: 9px; cursor: ew-resize; touch-action: none; }
  .block .edge::after { content: ''; position: absolute; right: 3px; top: 14px; bottom: 14px; width: 3px; border-radius: 2px; background: #0d111588; }
  .add-section { width: 220px; }
  .section-editor { padding: 8px 10px; border: 1px solid var(--host-line); border-radius: 6px; background: var(--host-surface, #171c21); }
  .notes-field textarea { width: 100%; box-sizing: border-box; resize: vertical; font-size: 12px; }
  @media (max-width: 760px) {
    .songs-grid { grid-template-columns: minmax(0, 1fr); }
    .name-field input { width: 100%; }
  }
</style>
