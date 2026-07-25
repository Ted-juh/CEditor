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
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import TransportSyncCells from '../properties/TransportSyncCells.svelte';
  import SongChainCells from '../properties/SongChainCells.svelte';

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
  function colRgb(v, fb) { const t = String(v ?? fb).replace(/^#/, ''); return `#${t.length >= 6 ? t.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) {
    const t = String(cur ?? '').replace(/^#/, '');
    const al = /^[0-9a-fA-F]{8}$/.test(t) ? t.slice(0, 2) : 'FF';
    set(prop, `${al}${hex.replace('#', '').toUpperCase()}`);
  }

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
  <PropertySection title="Recorder">
    <PropertyCell label="" span={4} hint="Arming waits for the top of the loop, so the take's downbeat is the loop's downbeat rather than wherever your hand was when you pressed.">
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
    <PropertyCell label="" span={4} hint="">
      <div class="note">
        <b>{RECORDER_STATE_LABELS[state]}</b> · {count} {count === 1 ? 'note' : 'notes'}{passes > 1 ? ` in ${passes} passes` : ''} · {span}
        {#if count >= MAX_EVENTS}<br />Full — {MAX_EVENTS} notes is the cap, so a stuck input can't grow the take forever.{/if}
      </div>
    </PropertyCell>

    <PropertyCell label="Capture" span={2} hint="The panel source taps every note-emitting control here — Chord Pad, Arp, Ribbon, Drum Pads, Phrase, Splitter. A recorder never captures another recorder: two of them would feed each other forever.">
      <select class="val" value={p.source ?? 'both'} onchange={(e) => set('source', e.target.value)}>
        <option value="both">MIDI input + panel</option>
        <option value="input">MIDI input only</option>
        <option value="panel">Panel only</option>
      </select>
    </PropertyCell>
    <PropertyCell label="One pass" span={1} hint="Stop at the end of the first lap instead of layering until you press stop.">
      <PropertyToggle value={p.once === true} onchange={() => set('once', !(p.once === true))} />
    </PropertyCell>
    <PropertyCell label="Count-in" span={1} hint="Bars to wait after arming before it starts capturing. The Transport's count-in counts the whole panel in from a stop; this one counts THIS recorder in from wherever the music already is — what you want when the band is playing and you want the next four bars. It still starts on a loop boundary, just a later one.">
      <input class="val" type="number" min="0" max="4" step="1" value={countInBars(control)} onchange={(e) => set('countIn', clampInt(e.target.value, 0, 4, 0))} />
    </PropertyCell>

    <TransportSyncCells
      {control} section="Recorder"
      hint="Synced, the loop is a number of BARS — so a tempo change keeps the phrase the same length in music, which is the whole reason to sync a recorded phrase rather than a recorded gesture."
    >
      {#snippet children()}
        <PropertyCell label="Bars" span={1} hint="Loop length in bars.">
          <input class="val" type="number" min={MIN_BARS} max={MAX_BARS} step="1" value={num(p.bars, 2)} onchange={(e) => set('bars', clampInt(e.target.value, MIN_BARS, MAX_BARS, 2))} />
        </PropertyCell>
      {/snippet}
    </TransportSyncCells>
    {#if p.syncToTransport !== true}
      <PropertyCell label="Length" span={1} hint="Loop length in seconds, free-running.">
        <input class="val" type="number" min="0.25" max="60" step="0.25" value={num(p.seconds, 4)} onchange={(e) => set('seconds', clampNum(e.target.value, 0.25, 60, 4))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Channel" span={1} hint="The channel playback sends on. Captured notes keep their own channel in the take; this is where they go out.">
      <input class="val" type="number" min="1" max="16" step="1" value={num(p.channel, 1)} onchange={(e) => set('channel', clampInt(e.target.value, 1, 16, 1))} />
    </PropertyCell>
    <PropertyCell label="Transpose" span={1} hint="Semitones. A note that lands outside 0–127 is dropped, not clamped — clamping piles strays onto one pitch, which sounds like a stuck key.">
      <input class="val" type="number" min="-48" max="48" step="1" value={num(p.transpose, 0)} onchange={(e) => set('transpose', clampInt(e.target.value, -48, 48, 0))} />
    </PropertyCell>
    <PropertyCell label="Velocity ×" span={1} hint="Scales every recorded velocity on the way out.">
      <input class="val" type="number" min="0.1" max="2" step="0.05" value={num(p.velocityScale, 1)} onchange={(e) => set('velocityScale', clampNum(e.target.value, 0.1, 2, 1))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Quantise">
    <PropertyCell label="" span={4} hint="">
      <div class="note">
        Strength is partial on purpose. Full snap makes a human take sound like a step sequencer —
        and if that is what you want, the Phrase Sequencer is better at it. Half pulls the timing
        toward the grid while keeping the feel.
      </div>
    </PropertyCell>
    <PropertyCell label="Grid" span={1} hint="Divisions per loop. 16 over one bar is sixteenth notes.">
      <input class="val" type="number" min="1" max="64" step="1" value={num(p.grid, 16)} onchange={(e) => set('grid', clampInt(e.target.value, 1, 64, 16))} />
    </PropertyCell>
    <PropertyCell label="Strength" span={1} hint="0 keeps it exactly as played; 1 snaps hard to the grid.">
      <input class="val" type="number" min="0" max="1" step="0.05" value={num(p.quantizeStrength, 0)} onchange={(e) => set('quantizeStrength', clampNum(e.target.value, 0, 1, 0))} />
    </PropertyCell>
    <PropertyCell label="Lengths too" span={1} hint="Off by default: quantising lengths turns a legato line into blocks, which is a separate decision from fixing the timing.">
      <PropertyToggle value={p.quantizeLength === true} onchange={() => set('quantizeLength', !(p.quantizeLength === true))} />
    </PropertyCell>
    <PropertyCell label="Into key" span={1} hint="Pitch-correct the take to the nearest note of the scale. Ties go down, deterministically — otherwise the same take quantises two different ways.">
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
    <PropertyCell label="" span={4} hint="Rewrites the take. Not live — a live quantise would move notes under the playhead while they sound.">
      <button type="button" class="btn wide" disabled={!count} onclick={applyQuantize}>Apply to the take</button>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Repair">
    <PropertyCell label="" span={4} hint="">
      <div class="note">
        Not a piano roll — the Phrase Sequencer is that. These are the repairs you want on a take
        you otherwise like: it is consistently a hair late, or one note landed wrong.
      </div>
    </PropertyCell>
    <PropertyCell label="Whole take" span={4} hint="Nudge moves everything; shift transposes the take itself rather than only its playback, so what you see is what is stored.">
      <div class="transport">
        <button type="button" class="btn" disabled={!count} onclick={() => set('take', nudgeTake(take, -0.01))}>◀ nudge</button>
        <button type="button" class="btn" disabled={!count} onclick={() => set('take', nudgeTake(take, 0.01))}>nudge ▶</button>
        <button type="button" class="btn" disabled={!count} onclick={() => set('take', transposeTake(take, -12))}>−8ve</button>
        <button type="button" class="btn" disabled={!count} onclick={() => set('take', transposeTake(take, 12))}>+8ve</button>
      </div>
    </PropertyCell>
    {#if count}
      <PropertyCell label="Note" span={2} hint="Which recorded note the fields below edit, in time order.">
        <input class="val" type="number" min="1" max={count} step="1" value={selIdx + 1} onchange={(e) => { selNote = clampInt(e.target.value, 1, count, 1) - 1; }} />
      </PropertyCell>
      <PropertyCell label="" span={2} hint="">
        <div class="note">{sel ? `${rowLabelFor(sel.note, recorderUseFlats(control))} at ${(sel.t * 100).toFixed(1)}%` : '—'}</div>
      </PropertyCell>
      {#if sel}
        <PropertyCell label="Position" span={1} hint="Where in the loop it starts, as a percentage.">
          <input class="val" type="number" min="0" max="99.9" step="0.5" value={Number((sel.t * 100).toFixed(1))} onchange={(e) => patchNote({ t: clampNum(e.target.value, 0, 99.9, 0) / 100 })} />
        </PropertyCell>
        <PropertyCell label="Pitch" span={1} hint="MIDI note number.">
          <input class="val" type="number" min="0" max="127" step="1" value={sel.note} onchange={(e) => patchNote({ note: clampInt(e.target.value, 0, 127, 60) })} />
        </PropertyCell>
        <PropertyCell label="Velocity" span={1} hint="">
          <input class="val" type="number" min="1" max="127" step="1" value={sel.velocity} onchange={(e) => patchNote({ velocity: clampInt(e.target.value, 1, 127, 100) })} />
        </PropertyCell>
        <PropertyCell label="Length" span={1} hint="As a fraction of the loop.">
          <input class="val" type="number" min="0.1" max="100" step="1" value={Number((sel.dur * 100).toFixed(1))} onchange={(e) => patchNote({ dur: clampNum(e.target.value, 0.1, 100, 10) / 100 })} />
        </PropertyCell>
        <PropertyCell label="" span={4} hint="">
          <button type="button" class="btn" onclick={() => set('take', deleteNote(take, selIdx))}>Delete this note</button>
        </PropertyCell>
      {/if}
    {/if}
  </PropertySection>

  <PropertySection title="Takes">
    <PropertyCell label="" span={4} hint="Storing and loading are copies in each direction — otherwise editing the live take would silently rewrite the stored one.">
      <div class="note">
        {slots.length ? `${slots.length} stored${liveSlot >= 0 ? ` · slot ${liveSlot + 1} was loaded last` : ''}.` : 'No stored takes yet.'}
      </div>
    </PropertyCell>
    <PropertyCell label="" span={4} hint="">
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
    <PropertyCell label="" span={4} hint="">
      <div class="note">A chain never advances while recording — swapping the take out from under a pass would lose it.</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Display">
    <PropertyCell label="Click to arm" span={1} hint="Clicking the roll in preview arms and stops it. Turn off for a display-only recorder driven by a script.">
      <PropertyToggle value={p.editable !== false} onchange={() => set('editable', !(p.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Header" span={1} hint="Show the state / count / length strip.">
      <PropertyToggle value={p.showHeader !== false} onchange={() => set('showHeader', !(p.showHeader !== false))} />
    </PropertyCell>
    <PropertyCell label="Pitch labels" span={1} hint="The note names down the left.">
      <PropertyToggle value={p.showGutter !== false} onchange={() => set('showGutter', !(p.showGutter !== false))} />
    </PropertyCell>
    <PropertyCell label="Min rows" span={1} hint="The roll fits itself to the take, but never shows fewer rows than this — a two-note take drawn as two fat bars reads badly.">
      <input class="val" type="number" min="4" max="48" step="1" value={num(p.minSpan, 12)} onchange={(e) => set('minSpan', clampInt(e.target.value, 4, 48, 12))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Face" span={1} hint=""><input class="col" type="color" value={colRgb(p.faceColour, 'FF141420')} oninput={(e) => setCol('faceColour', p.faceColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Notes" span={1} hint=""><input class="col" type="color" value={colRgb(p.noteColour, 'FF56CCF2')} oninput={(e) => setCol('noteColour', p.noteColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Recording" span={1} hint="Also colours the newest overdub pass, so you can see what you just added."><input class="col" type="color" value={colRgb(p.recordColour, 'FFEB5757')} oninput={(e) => setCol('recordColour', p.recordColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Playhead" span={1} hint=""><input class="col" type="color" value={colRgb(p.playheadColour, 'FFF2C94C')} oninput={(e) => setCol('playheadColour', p.playheadColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Labels" span={1} hint=""><input class="col" type="color" value={colRgb(p.labelColour, 'FFB9B9B9')} oninput={(e) => setCol('labelColour', p.labelColour, e.target.value)} /></PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { width: 100%; background: #141420; border: 1px solid #2a2a36; color: #E8E8EE; font-size: 12px; padding: 3px 6px; border-radius: 4px; }
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
  .col { width: 26px; height: 20px; padding: 0; border: 1px solid #2a2a36; background: #141420; border-radius: 3px; }
</style>
