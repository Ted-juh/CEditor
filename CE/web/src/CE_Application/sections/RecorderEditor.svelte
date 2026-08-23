<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import {
    recorderTake, takeEventCount, takePasses, lastPass, undoPass, clearTake,
    quantizeTake, RECORDER_STATE_LABELS, RECORDER_STATES, recorderState,
    isRecordingState, toggleRecordState, takeIsEmpty, MIN_BARS, MAX_BARS, MAX_EVENTS,
    rowLabelFor, takeNoteRange, recorderUseFlats,
    editNote, deleteNote, nudgeTake, transposeTake,
    recorderSlots, slotIndex, storeSlot, loadSlot, MAX_SLOTS, countInBars,
  } from '../utils/noteRecorderLayout.js';
  import { SCALES, SCALE_LABELS, NOTE_SHARP, NOTE_FLAT, useFlats } from '../utils/chordPadLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import TransportSyncCells from '../properties/TransportSyncCells.svelte';
  import SongChainCells from '../properties/SongChainCells.svelte';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import Magnet from 'lucide-svelte/icons/magnet';
  import Wrench from 'lucide-svelte/icons/wrench';
  import Bookmark from 'lucide-svelte/icons/bookmark';
  import Monitor from 'lucide-svelte/icons/monitor';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let p = $derived(getSection(control, 'Recorder'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Recorder.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clampInt(v, lo, hi, f) { const n = Math.round(num(v, f)); return n < lo ? lo : n > hi ? hi : n; }
  function clampNum(v, lo, hi, f) { const n = num(v, f); return n < lo ? lo : n > hi ? hi : n; }

  let take = $derived.by(() => { try { return recorderTake(control); } catch { return { events: [], pending: {} }; } });
  let count = $derived(takeEventCount(take));
  let passes = $derived(takePasses(take).length);
  let state = $derived.by(() => { try { return recorderState(control); } catch { return 'idle'; } });
  let flats = $derived(useFlats(num(p?.key, 0), String(p?.scale ?? 'minor')));
  let keyNames = $derived(flats ? NOTE_FLAT : NOTE_SHARP);
  let scaleKeys = $derived(Object.keys(SCALES));

  // What was actually captured, as a range — the single most useful thing to
  // see without playing it back.
  let span = $derived.by(() => {
    if (!count) return '—';
    const r = takeNoteRange(take.events, 1);
    const f = recorderUseFlats(control);
    return `${rowLabelFor(r.lo, f)} – ${rowLabelFor(r.hi, f)}`;
  });

  // Note repair. Addressed by index into the sorted list, because a take has no
  // stable ids and adding them would only be for this.
  let selNote = $state(0);
  let notes = $derived(take.events);
  let sel = $derived(notes[Math.min(selNote, Math.max(0, notes.length - 1))] ?? null);
  let selIdx = $derived(Math.min(selNote, Math.max(0, notes.length - 1)));
  function patchNote(patch) { set('take', editNote(take, selIdx, patch)); }

  let slots = $derived.by(() => { try { return recorderSlots(control); } catch { return []; } });
  let liveSlot = $derived.by(() => { try { return slotIndex(control); } catch { return -1; } });

  function applyQuantize() {
    set('take', quantizeTake(take, {
      grid: clampInt(p.grid, 1, 64, 16),
      strength: clampNum(p.quantizeStrength, 0, 1, 0),
      keyPc: p.snapToScale === true ? clampInt(p.key, 0, 11, 0) : null,
      scaleName: p.snapToScale === true ? String(p.scale ?? 'minor') : null,
      quantizeLength: p.quantizeLength === true,
    }));
  }
</script>

{#if p}
  <PropertySection title="Recorder" icon={CircleDot}>
    <PropertyCell label="" span={4} hint="Arming waits for the top of the loop, so the take starts on the loop's downbeat." compact>
      <div class="transport">
        <button type="button" class="btn rec" class:on={isRecordingState(state) || state === 'armed'}
                onclick={() => set('state', toggleRecordState(state, !takeIsEmpty(take)))}>
          {state === 'idle' ? (count ? 'Overdub' : 'Record') : 'Stop'}
        </button>
        <button type="button" class="btn" class:on={p.playing !== false}
                onclick={() => set('playing', !(p.playing !== false))}>{p.playing !== false ? 'Playing' : 'Muted'}</button>
        <button type="button" class="btn" disabled={!count} onclick={() => set('take', undoPass(take))}>Undo pass</button>
        <button type="button" class="btn" disabled={!count} onclick={() => { set('take', clearTake()); set('state', 'idle'); }}>Clear</button>
      </div>
    </PropertyCell>
    <PropertyCell label="" span={4} hint="" compact>
      <div class="note">
        <b>{RECORDER_STATE_LABELS[state]}</b> · {count} {count === 1 ? 'note' : 'notes'}{passes > 1 ? ` in ${passes} passes` : ''} · {span}
        {#if count >= MAX_EVENTS}<br />Full — {MAX_EVENTS} notes is the cap.{/if}
      </div>
    </PropertyCell>

    <PropertyCell label="Capture" span={2} hint="Which sources feed the take. The panel source taps every note-emitting control here.">
      <select class="val" value={p.source ?? 'both'} onchange={(e) => set('source', e.target.value)}>
        <option value="both">MIDI input + panel</option>
        <option value="input">MIDI input only</option>
        <option value="panel">Panel only</option>
      </select>
    </PropertyCell>
    <PropertyCell label="One pass" span={1} hint="Stop at the end of the first lap instead of layering until you press stop.">
      <PropertyToggle value={p.once === true} onchange={() => set('once', !(p.once === true))} />
    </PropertyCell>
    <PropertyCell label="Count-in" span={1} compact hint="Bars to wait after arming before capture starts. It still begins on a loop boundary.">
      <NumberCell label="Count" min={0} max={4} step={1} value={countInBars(control)} onchange={(v) => set('countIn', clampInt(v, 0, 4, 0))} />
    </PropertyCell>

    <TransportSyncCells
      {control} section="Recorder"
      hint="The loop is a number of bars, so it keeps its musical length when the tempo changes."
    >
      {#snippet children()}
        <PropertyCell label="Bars" span={1} compact hint="Loop length in bars.">
          <NumberCell label="Bars" min={MIN_BARS} max={MAX_BARS} step={1} value={num(p.bars, 2)} defaultValue={2} onchange={(v) => set('bars', clampInt(v, MIN_BARS, MAX_BARS, 2))} />
        </PropertyCell>
      {/snippet}
    </TransportSyncCells>
    {#if p.syncToTransport !== true}
      <PropertyCell label="Length" span={1} compact hint="Loop length in seconds, free-running.">
        <NumberCell label="Len" min={0.25} max={60} step={0.25} value={num(p.seconds, 4)} defaultValue={4} onchange={(v) => set('seconds', clampNum(v, 0.25, 60, 4))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Channel" span={1} compact hint="The channel playback sends on. Captured notes keep their own channel in the take; this is where they go out.">
      <NumberCell label="Ch" min={1} max={16} step={1} value={num(p.channel, 1)} defaultValue={1} onchange={(v) => set('channel', clampInt(v, 1, 16, 1))} />
    </PropertyCell>
    <PropertyCell label="Transpose" span={1} compact hint="Semitones. A note landing outside 0–127 is dropped, not clamped.">
      <NumberCell label="Semi" min={-48} max={48} step={1} value={num(p.transpose, 0)} defaultValue={0} onchange={(v) => set('transpose', clampInt(v, -48, 48, 0))} />
    </PropertyCell>
    <PropertyCell label="Velocity ×" span={1} compact hint="Scales every recorded velocity on the way out.">
      <NumberCell label="Vel" min={0.1} max={2} step={0.05} value={num(p.velocityScale, 1)} defaultValue={1} onchange={(v) => set('velocityScale', clampNum(v, 0.1, 2, 1))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Quantise" icon={Magnet}>
    <PropertyCell label="" span={4} hint="" compact>
      <div class="note">
        Strength pulls the timing toward the grid; full snap removes the feel.
      </div>
    </PropertyCell>
    <PropertyCell label="Grid" span={1} compact hint="Divisions per loop. 16 over one bar is sixteenth notes.">
      <NumberCell label="Grid" min={1} max={64} step={1} value={num(p.grid, 16)} defaultValue={16} onchange={(v) => set('grid', clampInt(v, 1, 64, 16))} />
    </PropertyCell>
    <PropertyCell label="Strength" span={1} compact hint="0 keeps it exactly as played; 1 snaps hard to the grid.">
      <NumberCell label="Str" min={0} max={1} step={0.05} value={num(p.quantizeStrength, 0)} defaultValue={0} onchange={(v) => set('quantizeStrength', clampNum(v, 0, 1, 0))} />
    </PropertyCell>
    <PropertyCell label="Lengths too" span={1} hint="Off by default: quantising lengths turns a legato line into blocks, which is a separate decision from fixing the timing.">
      <PropertyToggle value={p.quantizeLength === true} onchange={() => set('quantizeLength', !(p.quantizeLength === true))} />
    </PropertyCell>
    <PropertyCell label="Into key" span={1} hint="Pitch-correct the take to the nearest note of the scale. Ties go down.">
      <PropertyToggle value={p.snapToScale === true} onchange={() => set('snapToScale', !(p.snapToScale === true))} />
    </PropertyCell>
    {#if p.snapToScale === true}
      <PropertyCell label="Key" span={1} hint="">
        <select class="val" value={num(p.key, 0)} onchange={(e) => set('key', clampInt(e.target.value, 0, 11, 0))}>
          {#each keyNames as nm, i (i)}<option value={i}>{nm}</option>{/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Scale" span={1} hint="">
        <select class="val" value={p.scale ?? 'minor'} onchange={(e) => set('scale', e.target.value)}>
          {#each scaleKeys as k (k)}<option value={k}>{SCALE_LABELS[k] ?? k}</option>{/each}
        </select>
      </PropertyCell>
    {/if}
    <PropertyCell label="" span={4} hint="Rewrites the take. Not live — a live quantise would move notes under the playhead while they sound." compact>
      <button type="button" class="btn wide" disabled={!count} onclick={applyQuantize}>Apply to the take</button>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Repair" icon={Wrench}>
    <PropertyCell label="" span={4} hint="" compact>
      <div class="note">
        Nudge the whole take, or fix a single note.
      </div>
    </PropertyCell>
    <PropertyCell label="Whole take" span={4} hint="Nudge moves everything; shift transposes the stored take, not only its playback.">
      <div class="transport">
        <button type="button" class="btn" disabled={!count} onclick={() => set('take', nudgeTake(take, -0.01))}>◀ nudge</button>
        <button type="button" class="btn" disabled={!count} onclick={() => set('take', nudgeTake(take, 0.01))}>nudge ▶</button>
        <button type="button" class="btn" disabled={!count} onclick={() => set('take', transposeTake(take, -12))}>−8ve</button>
        <button type="button" class="btn" disabled={!count} onclick={() => set('take', transposeTake(take, 12))}>+8ve</button>
      </div>
    </PropertyCell>
    {#if count}
      <PropertyCell label="Note" span={1} compact hint="Which recorded note the fields below edit, in time order.">
        <NumberCell label="Note" min={1} max={count} step={1} value={selIdx + 1} onchange={(v) => { selNote = clampInt(v, 1, count, 1) - 1; }} />
      </PropertyCell>
      <PropertyCell label="" span={2} hint="" compact>
        <div class="note">{sel ? `${rowLabelFor(sel.note, recorderUseFlats(control))} at ${(sel.t * 100).toFixed(1)}%` : '—'}</div>
      </PropertyCell>
      {#if sel}
        <PropertyCell label="Position" span={1} compact hint="Where in the loop it starts, as a percentage.">
          <NumberCell label="Pos" min={0} max={99.9} step={0.5} value={Number((sel.t * 100).toFixed(1))} onchange={(v) => patchNote({ t: clampNum(v, 0, 99.9, 0) / 100 })} />
        </PropertyCell>
        <PropertyCell label="Pitch" span={1} compact hint="MIDI note number.">
          <NumberCell label="Note" min={0} max={127} step={1} value={sel.note} onchange={(v) => patchNote({ note: clampInt(v, 0, 127, 60) })} />
        </PropertyCell>
        <PropertyCell label="Velocity" span={1} compact hint="">
          <NumberCell label="Vel" min={1} max={127} step={1} value={sel.velocity} onchange={(v) => patchNote({ velocity: clampInt(v, 1, 127, 100) })} />
        </PropertyCell>
        <PropertyCell label="Length" span={1} compact hint="As a fraction of the loop.">
          <NumberCell label="Len" min={0.1} max={100} step={1} value={Number((sel.dur * 100).toFixed(1))} onchange={(v) => patchNote({ dur: clampNum(v, 0.1, 100, 10) / 100 })} />
        </PropertyCell>
        <PropertyCell label="" span={4} hint="" compact>
          <button type="button" class="btn" onclick={() => set('take', deleteNote(take, selIdx))}>Delete this note</button>
        </PropertyCell>
      {/if}
    {/if}
  </PropertySection>

  <PropertySection title="Takes" icon={Bookmark}>
    <PropertyCell label="" span={4} hint="Storing and loading are copies in each direction." compact>
      <div class="note">
        {slots.length ? `${slots.length} stored${liveSlot >= 0 ? ` · slot ${liveSlot + 1} was loaded last` : ''}.` : 'No stored takes yet.'}
      </div>
    </PropertyCell>
    <PropertyCell label="" span={4} hint="" compact>
      <div class="slots">
        {#each Array.from({ length: MAX_SLOTS }, (_, i) => i) as i (i)}
          {@const has = slots[i] && slots[i].events.length}
          <div class="slot" class:filled={has} class:live={i === liveSlot}>
            <span class="sn">{i + 1}</span>
            <button type="button" class="mini" title="Store the live take here" disabled={!count} onclick={() => set('slots', storeSlot(slots, i, take))}>Store</button>
            <button type="button" class="mini" title="Load this take" disabled={!has} onclick={() => { set('take', loadSlot(slots, i)); set('slot', i); }}>Load</button>
            <span class="sc">{has ? `${slots[i].events.length}` : '—'}</span>
          </div>
        {/each}
      </div>
    </PropertyCell>
    <SongChainCells
      chain={p.chain ?? []}
      slotNames={Array.from({ length: MAX_SLOTS }, (_, i) => slots[i]?.name ?? `Take ${i + 1}`)}
      enabled={p.chainOn === true}
      loop={p.chainLoop !== false}
      unit="lap"
      onchange={(next) => set('chain', next)}
      ontoggle={(v) => set('chainOn', v)}
      onloop={(v) => set('chainLoop', v)}
    />
    <PropertyCell label="" span={4} hint="" compact>
      <div class="note">A chain never advances while recording.</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Display" icon={Monitor}>
    <PropertyCell label="Click to arm" span={1} hint="Clicking the roll in preview arms and stops it. Turn off for a display-only recorder driven by a script.">
      <PropertyToggle value={p.editable !== false} onchange={() => set('editable', !(p.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Header" span={1} hint="Show the state / count / length strip.">
      <PropertyToggle value={p.showHeader !== false} onchange={() => set('showHeader', !(p.showHeader !== false))} />
    </PropertyCell>
    <PropertyCell label="Pitch labels" span={1} hint="The note names down the left.">
      <PropertyToggle value={p.showGutter !== false} onchange={() => set('showGutter', !(p.showGutter !== false))} />
    </PropertyCell>
    <PropertyCell label="Min rows" span={1} compact hint="The roll fits itself to the take, but never shows fewer rows than this.">
      <NumberCell label="Rows" min={4} max={48} step={1} value={num(p.minSpan, 12)} defaultValue={12} onchange={(v) => set('minSpan', clampInt(v, 4, 48, 12))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Colours" span={4} hint="Face, notes, recording (also colours the newest overdub pass), playhead, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'faceColour', label: 'Face', value: p.faceColour ?? 'FF141420', target: { type: 'control', controlId: core?.id, path: 'Recorder.faceColour' } },
        { key: 'noteColour', label: 'Notes', value: p.noteColour ?? 'FF56CCF2', target: { type: 'control', controlId: core?.id, path: 'Recorder.noteColour' } },
        { key: 'recordColour', label: 'Rec', value: p.recordColour ?? 'FFEB5757', target: { type: 'control', controlId: core?.id, path: 'Recorder.recordColour' } },
        { key: 'playheadColour', label: 'Play', value: p.playheadColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'Recorder.playheadColour' } },
        { key: 'labelColour', label: 'Labels', value: p.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Recorder.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .note { font-size: 11px; color: #9a9aa4; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 5px 7px; line-height: 1.5; }
  .transport { display: flex; flex-wrap: wrap; gap: 5px; }
  .slots { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }
  .slot { display: flex; align-items: center; gap: 4px; border: 1px solid #2a2a36; border-radius: 4px; padding: 3px 5px; background: #12121a; }
  .slot.filled { border-color: #3a3a48; }
  .slot.live { border-color: #56CCF2; }
  .sn { font-size: 10.5px; color: #7a7a84; width: 10px; }
  .sc { font-size: 10.5px; color: #7a7a84; margin-left: auto; }
  .mini { background: #1A1A1A; border: 1px solid #333; color: #C8C8CE; font-size: 10.5px; padding: 2px 6px; border-radius: 3px; cursor: pointer; }
  .mini:hover:not(:disabled) { border-color: #4a4a58; }
  .mini:disabled { opacity: 0.35; cursor: default; }
  .btn { background: #1A1A1A; border: 1px solid #333; color: #C8C8CE; font-size: 11px; padding: 4px 10px; border-radius: 4px; cursor: pointer; }
  .btn:hover:not(:disabled) { border-color: #4a4a58; color: #E8E8EE; }
  .btn:disabled { opacity: 0.4; cursor: default; }
  .btn.on { border-color: #56CCF2; color: #E8E8EE; }
  .btn.rec.on { border-color: #EB5757; color: #EB5757; }
  .btn.wide { width: 100%; }
</style>
