<script>
  /**
   * One audition bar. The preview (click a sound, hear it) and the audition on load play the
   * same phrase from the same settings: a note, a chord, a scale or a riff from a root, at a
   * velocity and length — or the line you were just playing. "Also on load" plays it each time a
   * sound is loaded into the part.
   *
   * It answers the two questions a preview that swaps sources underneath you has to keep
   * answering: what am I hearing, and what is it playing.
   */
  import {
    hostState, hostAudition, hostLibrary, setPresetAudition, setAuditionPhrase, auditionRecord, stopAudition,
  } from '../../stores/instrumentHost.js';
  import { noteName } from '../../utils/pianoGeometry.js';
  import Segmented from '../../components/controls/Segmented.svelte';
  import ScrubValue from '../../components/controls/ScrubValue.svelte';
  import MiniKeys from '../../components/controls/MiniKeys.svelte';
  import { cacheSize } from './soundsText.js';
  import { sounds } from './soundsBrowser.svelte.js';

  let { layout = 'dock', auditionOn = false, onToggleAudition = () => {} } = $props();

  const page = $derived(layout === 'page');
  const settings = $derived($hostState.rack.presetAudition);
  const selected = $derived(sounds.selected);
  const phrase = $derived($hostAudition.phrase === 'recent' ? 'recent' : settings.phrase);
  const PHRASES = $derived([
    { value: 'single', label: 'Note', title: 'One note' },
    { value: 'chord', label: 'Chord', title: 'A major chord' },
    { value: 'scale', label: 'Scale', title: 'A major scale' },
    { value: 'riff', label: 'Riff', title: 'A short phrase across the register' },
    { value: 'recent', label: `Your last ${$hostAudition.bars} bars`, title: 'The line you were just playing, at your tempo' },
  ]);
  function choosePhrase(value) {
    if (value === 'recent') { setAuditionPhrase('recent'); return; }
    setPresetAudition({ phrase: value });
    setAuditionPhrase('phrase');
  }
  const set = (fields) => setPresetAudition(fields);
  const playable = $derived(selected && selected.available && !selected.isEffect && selected.type === 'preset');
</script>

<div class="audition" class:page data-testid="audition-bar">
  <button type="button" class="ctl play" disabled={!playable} data-testid="audition-play"
          title={selected?.instant ? 'Play the stored preview now' : 'Load and play — this one has no preview yet'}
          onclick={() => selected && auditionRecord(selected.recordId)}>▶</button>

  <div class="now">
    <span class="now-name">{$hostAudition.recordId
      ? (sounds.records.find((r) => r.recordId === $hostAudition.recordId)?.name ?? selected?.name ?? '—')
      : (selected?.name ?? 'Nothing selected')}</span>
    <span class="now-stage" data-testid="audition-stage">
      {#if $hostAudition.stage === 'snapshot'}
        <i class="pip snap"></i>preview · the plug-in is still loading
      {:else if $hostAudition.stage === 'loading'}
        <i class="pip none"></i>{$hostAudition.detail || 'loading…'}
      {:else if $hostAudition.stage === 'live'}
        <i class="pip live"></i>the real thing{$hostAudition.detail ? ` · ${$hostAudition.detail}` : ''}
      {:else if $hostAudition.stage === 'silent'}
        <i class="pip none"></i>{$hostAudition.detail}
      {:else if selected?.type === 'rack' || selected?.sourceType === 'hardwarePatch'}
        <i class="pip none"></i>loads rather than previews
      {:else if selected}
        <i class="pip" class:snap={selected.instant} class:none={!selected.instant}></i>
        {selected.instant ? 'previews instantly' : 'no preview yet — would load first'}
      {/if}
    </span>
  </div>

  <div class="field"><span class="lbl">Play with</span>
    <Segmented options={PHRASES} value={phrase} label="Audition phrase" testid="audition-phrase" onchange={choosePhrase} />
  </div>
  {#if phrase !== 'recent'}
    <div class="field"><span class="lbl">Root</span>
      <span class="root">
        {#if page}
          <MiniKeys low={36} high={83} selected={settings.rootNote} label="Audition root note: click a key"
                    testid="audition-root-keys" onkey={(rootNote) => set({ rootNote })} />
        {/if}
        <ScrubValue value={settings.rootNote} min={0} max={127} format={noteName} label="Audition root note"
                    testid="audition-root" compact={!page} onchange={(rootNote) => set({ rootNote })} />
      </span>
    </div>
    <div class="field"><span class="lbl">Velocity</span>
      <ScrubValue value={settings.velocity} min={1} max={127} label="Audition velocity" testid="audition-velocity"
                  compact onchange={(velocity) => set({ velocity })} />
    </div>
    <div class="field"><span class="lbl">Length</span>
      <ScrubValue value={settings.noteLengthMs} min={40} max={4000} step={10} unit="ms" label="Audition note length"
                  testid="audition-length" onchange={(noteLengthMs) => set({ noteLengthMs })} />
    </div>
    {#if settings.phrase === 'scale' || settings.phrase === 'riff'}
      <div class="field"><span class="lbl">Gap</span>
        <ScrubValue value={settings.gapMs} min={0} max={2000} step={10} unit="ms" label="Gap between notes"
                    testid="audition-gap" onchange={(gapMs) => set({ gapMs })} />
      </div>
    {/if}
  {/if}

  <span class="spacer"></span>
  <button type="button" class="toggle audition-toggle" class:on={auditionOn} aria-pressed={auditionOn}
          data-testid="host-audition" title="Play the phrase each time a sound loads into the part"
          onclick={onToggleAudition}>♪ Also on load</button>
  <span class="cache" title="Previews are a cache — the least recently heard are dropped first">
    {$hostLibrary.counts.snapshots} previews{cacheSize($hostLibrary.counts.snapshotBytes)}
  </span>
  <button type="button" class="ghost" onclick={() => stopAudition()}>Stop</button>
</div>

<style>
  .audition { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: none;
              padding: 6px 10px; border-top: 1px solid var(--host-line-soft); background: var(--host-bg-deep); }
  .audition.page { padding: 8px 14px; gap: 14px; }
  button.play { width: 30px; height: 30px; padding: 0; border-radius: 50%; cursor: pointer;
                background: #7fb4e01f; border: 1px solid #4a86bd; color: #7fb4e0; font-size: 12px; }
  .page button.play { width: 38px; height: 38px; font-size: 14px; }
  button.play:disabled { opacity: .4; cursor: default; }
  .now { display: flex; flex-direction: column; gap: 1px; min-width: 170px; max-width: 260px; }
  .now-name { font-weight: 600; font-size: 12px; color: var(--host-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .now-stage { display: flex; align-items: center; gap: 5px; color: var(--host-text-dim); font-size: 10.5px; }
  .pip { width: 7px; height: 7px; border-radius: 50%; background: var(--host-line); flex: 0 0 7px; }
  .pip.snap { background: #7fb4e0; }
  .pip.live { background: #35c46f; }
  .pip.none { background: #566372; }
  .field { display: flex; flex-direction: column; gap: 2px; }
  .lbl { font: 600 9.5px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: var(--host-text-dim); }
  .root { display: flex; align-items: center; gap: 6px; }
  .root :global(svg.keys) { width: 260px; height: 34px; }
  .spacer { flex: 1; }
  .cache { color: var(--host-text-dim); font-size: 10.5px; }
</style>
