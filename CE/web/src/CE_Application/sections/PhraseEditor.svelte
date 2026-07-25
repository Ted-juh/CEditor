<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import {
    PHRASE_MODES, PHRASE_MODE_LABELS, PHRASE_DIRECTIONS, PHRASE_DIRECTION_LABELS,
    PHRASE_SEEDS, phraseSeedPattern, phrasePattern, phraseSteps, phraseRows,
    hiddenCellCount, trimPattern, rowToNote, rowLabel, noteLabel, phraseUseFlats,
    phraseMode, cellsInStep, MIN_STEPS, MAX_STEPS, MIN_ROWS, MAX_ROWS,
    cellAt, setCell, cellChance, cellRatchet, cellLength, MAX_RATCHET,
  } from '../utils/phraseLayout.js';
  import { SCALES, SCALE_LABELS, NOTE_SHARP, NOTE_FLAT, useFlats } from '../utils/chordPadLayout.js';
  import { DIVISION_IDS, DIVISION_LABELS } from '../utils/transportLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import TransportSyncCells from '../properties/TransportSyncCells.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let p = $derived(getSection(control, 'Phrase'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Phrase.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clampInt(v, lo, hi, f) { const n = Math.round(num(v, f)); return n < lo ? lo : n > hi ? hi : n; }
  function clampNum(v, lo, hi, f) { const n = num(v, f); return n < lo ? lo : n > hi ? hi : n; }

  let isChromatic = $derived(phraseMode(control) === 'chromatic');
  let flats = $derived(useFlats(num(p?.key, 0), String(p?.scale ?? 'minor')));
  let keyNames = $derived(flats ? NOTE_FLAT : NOTE_SHARP);
  let scaleKeys = $derived(Object.keys(SCALES));
  let steps = $derived.by(() => { try { return phraseSteps(control); } catch { return 16; } });
  let rows = $derived.by(() => { try { return phraseRows(control); } catch { return 8; } });
  let hidden = $derived.by(() => {
    try { return hiddenCellCount(phrasePattern(control), steps, rows); } catch { return 0; }
  });
  // What the grid's rows currently mean, in actual pitches. Sequencing degrees
  // is only readable if you can see what they came out as.
  let rowMap = $derived.by(() => {
    try {
      const out = [];
      for (let r = rows - 1; r >= 0; r -= 1) {
        out.push(`${rowLabel(control, r)} = ${noteLabel(rowToNote(control, r), phraseUseFlats(control))}`);
      }
      return out;
    } catch { return []; }
  });
  // The line the pattern currently plays, so the inspector shows the music and
  // not just the settings.
  let walk = $derived.by(() => {
    try {
      const pattern = phrasePattern(control);
      const f = phraseUseFlats(control);
      const out = [];
      for (let s = 0; s < Math.min(steps, 32); s += 1) {
        const cells = cellsInStep(pattern, s, rows);
        out.push(cells.length
          ? cells.map((c) => noteLabel(rowToNote(control, c.row), f)).join('+')
          : '·');
      }
      return out.join(' ') + (steps > 32 ? ' …' : '');
    } catch { return ''; }
  });

  // Per-cell editing. The grid is where you place notes; this is where you say
  // what a placed note DOES — probability, ratchet, its own length. A cell is
  // picked by step and row rather than by clicking the tiny preview, because
  // the preview cell can be four pixels wide.
  let selStep = $state(0);
  let selRow = $state(0);
  let selCell = $derived.by(() => {
    try { return cellAt(phrasePattern(control), selStep, selRow); } catch { return null; }
  });
  function patchCell(patch) {
    set('pattern', setCell(phrasePattern(control), selStep, selRow, patch));
  }
  // Every cell that is doing something other than "play normally" — so you can
  // find the ones you set without hunting the grid.
  let specialCells = $derived.by(() => {
    try {
      const out = [];
      for (const [key, cell] of Object.entries(phrasePattern(control))) {
        const bits = [];
        if (cellChance(cell) < 1) bits.push(`${Math.round(cellChance(cell) * 100)}%`);
        if (cellRatchet(cell) > 1) bits.push(`×${cellRatchet(cell)}`);
        if (cellLength(cell) !== null) bits.push(`len ${cellLength(cell)}`);
        if (cell?.tie === true) bits.push('tie');
        if (bits.length) {
          const [st, rw] = key.split(':').map(Number);
          out.push(`${st + 1}/${rowLabel(control, rw)}: ${bits.join(' ')}`);
        }
      }
      return out.sort();
    } catch { return []; }
  });

  function applySeed(id) {
    // The random seed wants randomness; everything else ignores the supplier.
    set('pattern', phraseSeedPattern(id, steps, rows, () => Math.random()));
  }
  function colRgb(v, fb) { const t = String(v ?? fb).replace(/^#/, ''); return `#${t.length >= 6 ? t.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) {
    const t = String(cur ?? '').replace(/^#/, '');
    const al = /^[0-9a-fA-F]{8}$/.test(t) ? t.slice(0, 2) : 'FF';
    set(prop, `${al}${hex.replace('#', '').toUpperCase()}`);
  }
</script>

{#if p}
  <PropertySection title="Phrase Sequencer">
    <PropertyCell label="Run" span={1} hint="Advance the sequence in preview / player. Stopped, the grid still shows the pattern.">
      <PropertyToggle value={p.running !== false} onchange={() => set('running', !(p.running !== false))} />
    </PropertyCell>
    <PropertyCell label="Rows are" span={3} hint="Scale degrees make the pattern a SHAPE: change the key and it transposes, change major to minor and it re-harmonises, and no row can produce a note outside the key. Chromatic turns it into a plain piano roll.">
      <select class="val" value={p.mode ?? 'degree'} onchange={(e) => set('mode', e.target.value)}>
        {#each PHRASE_MODES as m (m)}<option value={m}>{PHRASE_MODE_LABELS[m] ?? m}</option>{/each}
      </select>
    </PropertyCell>

    <PropertyCell label="Key" span={1} hint="Tonic. Row 0 is this note at the base octave.">
      <select class="val" value={String(num(p.key, 0))} onchange={(e) => set('key', clampInt(e.target.value, 0, 11, 0))}>
        {#each keyNames as nm, i (i)}<option value={String(i)}>{nm}</option>{/each}
      </select>
    </PropertyCell>
    {#if !isChromatic}
      <PropertyCell label="Scale" span={1} hint="Which degrees the rows step through.">
        <select class="val" value={p.scale ?? 'minor'} onchange={(e) => set('scale', e.target.value)}>
          {#each scaleKeys as k (k)}<option value={k}>{SCALE_LABELS[k] ?? k}</option>{/each}
        </select>
      </PropertyCell>
    {/if}
    <PropertyCell label="Octave" span={1} hint="Octave of row 0 (3 → C3).">
      <input class="val" type="number" min="-1" max="8" step="1" value={num(p.baseOctave, 3)} onchange={(e) => set('baseOctave', clampInt(e.target.value, -1, 8, 3))} />
    </PropertyCell>
    <PropertyCell label="Transpose" span={1} hint="Semitones, applied after the row → pitch map. Use this to move the whole line without changing the key it is written in.">
      <input class="val" type="number" min="-48" max="48" step="1" value={num(p.transpose, 0)} onchange={(e) => set('transpose', clampInt(e.target.value, -48, 48, 0))} />
    </PropertyCell>

    <PropertyCell label="Steps" span={1} hint="Pattern length. Shrinking never destroys cells — they are kept and come back if you grow it again.">
      <input class="val" type="number" min={MIN_STEPS} max={MAX_STEPS} step="1" value={num(p.steps, 16)} onchange={(e) => set('steps', clampInt(e.target.value, MIN_STEPS, MAX_STEPS, 16))} />
    </PropertyCell>
    <PropertyCell label="Rows" span={1} hint="How many degrees the grid shows. 8 gives an octave of a seven-note scale plus the tonic above.">
      <input class="val" type="number" min={MIN_ROWS} max={MAX_ROWS} step="1" value={num(p.rows, 8)} onchange={(e) => set('rows', clampInt(e.target.value, MIN_ROWS, MAX_ROWS, 8))} />
    </PropertyCell>
    <PropertyCell label="Direction" span={2} hint="Ping-pong turns round at the ends without repeating them. Random is deterministic from the step index, so it repeats identically each pass — change the seed for a different order.">
      <select class="val" value={p.direction ?? 'forward'} onchange={(e) => set('direction', e.target.value)}>
        {#each PHRASE_DIRECTIONS as d (d)}<option value={d}>{PHRASE_DIRECTION_LABELS[d] ?? d}</option>{/each}
      </select>
    </PropertyCell>
    {#if String(p.direction ?? 'forward') === 'random'}
      <PropertyCell label="Seed" span={1} hint="Changes which order Random produces. Same seed, same order — every time.">
        <input class="val" type="number" min="0" max="9999" step="1" value={num(p.seed, 0)} onchange={(e) => set('seed', clampInt(e.target.value, 0, 9999, 0))} />
      </PropertyCell>
    {/if}

    {#if hidden > 0}
      <PropertyCell label="" span={4} hint="">
        <div class="note">
          {hidden} {hidden === 1 ? 'cell is' : 'cells are'} outside the current grid — kept, not deleted, and back
          if you grow it again.
          <button type="button" class="link" onclick={() => set('pattern', trimPattern(phrasePattern(control), steps, rows))}>Delete them</button>
        </div>
      </PropertyCell>
    {/if}
    <PropertyCell label="Cell" span={2} hint="Which cell the fields below edit. Step is 1-based, as the grid counts it.">
      <div class="pair">
        <input class="val" type="number" min="1" max={steps} step="1" value={selStep + 1} onchange={(e) => { selStep = clampInt(e.target.value, 1, steps, 1) - 1; }} />
        <select class="val" value={String(selRow)} onchange={(e) => { selRow = clampInt(e.target.value, 0, rows - 1, 0); }}>
          {#each Array.from({ length: rows }, (_, i) => rows - 1 - i) as r (r)}
            <option value={String(r)}>{rowLabel(control, r)} — {noteLabel(rowToNote(control, r), phraseUseFlats(control))}</option>
          {/each}
        </select>
      </div>
    </PropertyCell>
    <PropertyCell label="" span={2} hint="">
      <div class="note">{selCell ? 'Editing that cell.' : 'Nothing there — place a note on the grid first.'}</div>
    </PropertyCell>
    {#if selCell}
      <PropertyCell label="Chance" span={1} hint="How often it plays, 0–100%. Deterministic from the position and the seed, so the same lap always sounds the same and two sequencers on one clock agree — a maybe-note is drawn hollow so the grid doesn't claim a note that stays silent.">
        <input class="val" type="number" min="0" max="100" step="5" value={Math.round(cellChance(selCell) * 100)} onchange={(e) => patchCell({ chance: clampInt(e.target.value, 0, 100, 100) / 100 })} />
      </PropertyCell>
      <PropertyCell label="Ratchet" span={1} hint="How many times it retriggers inside its own step. A tied note is never ratcheted — holding it and retriggering it are opposite instructions.">
        <input class="val" type="number" min="1" max={MAX_RATCHET} step="1" value={cellRatchet(selCell)} onchange={(e) => patchCell({ ratchet: clampInt(e.target.value, 1, MAX_RATCHET, 1) })} />
      </PropertyCell>
      <PropertyCell label="Length" span={1} hint="This note's own gate, as a multiple of the STEP — 2 holds it for two steps. Blank uses the pattern gate. This is how you write a long note without a chain of ties.">
        <input class="val" type="number" min="0.05" max="4" step="0.25" placeholder="—" value={cellLength(selCell) ?? ''} onchange={(e) => patchCell({ length: e.target.value === '' ? null : clampNum(e.target.value, 0.05, 4, 1) })} />
      </PropertyCell>
      <PropertyCell label="Tie" span={1} hint="Hold this note through from the step before instead of retriggering. Needs a note on the same row in the previous step, or it is just a retrigger.">
        <PropertyToggle value={selCell.tie === true} onchange={() => patchCell({ tie: !(selCell.tie === true) })} />
      </PropertyCell>
      <PropertyCell label="Velocity" span={1} hint="This cell's own velocity. Blank follows the pattern's.">
        <input class="val" type="number" min="1" max="127" step="1" placeholder="—" value={selCell.velocity ?? ''} onchange={(e) => patchCell({ velocity: e.target.value === '' ? null : clampInt(e.target.value, 1, 127, 100) })} />
      </PropertyCell>
    {/if}
    {#if specialCells.length}
      <PropertyCell label="" span={4} hint="Every cell doing something other than playing normally, so you can find what you set without hunting the grid.">
        <div class="preview">{specialCells.join('   ·   ')}</div>
      </PropertyCell>
    {/if}

    <PropertyCell label="" span={4} hint="The notes this pattern currently plays, step by step. A dot is a rest.">
      <div class="preview">{walk || '—'}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Timing">
    <TransportSyncCells
      synced={p.syncToTransport === true}
      onchange={(v) => set('syncToTransport', v)}
      span={1}
      hint="Take the step length from the panel's Transport instead of a free-running rate."
    >
      {#snippet children()}
        <PropertyCell label="Division" span={2} hint="Step length in musical time.">
          <select class="val" value={String(p.division ?? '1/16')} onchange={(e) => set('division', e.target.value)}>
            {#each DIVISION_IDS as d (d)}<option value={d}>{d} · {DIVISION_LABELS[d]}</option>{/each}
          </select>
        </PropertyCell>
      {/snippet}
    </TransportSyncCells>
    {#if p.syncToTransport !== true}
      <PropertyCell label="Rate" span={1} hint="Steps per second.">
        <input class="val" type="number" min="0.1" max="40" step="0.5" value={num(p.rate, 8)} onchange={(e) => set('rate', clampNum(e.target.value, 0.1, 40, 8))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Gate" span={1} hint="Note length as a fraction of the step. 1 = legato. A note the next step TIES is exempt — a tie would be pointless if the gate cut it.">
      <input class="val" type="number" min="0.05" max="1" step="0.05" value={num(p.gate, 0.8)} onchange={(e) => set('gate', clampNum(e.target.value, 0.05, 1, 0.8))} />
    </PropertyCell>
    <PropertyCell label="Swing from" span={1} hint="Where the shuffle comes from. Synced to the transport it inherits the clock's swing by default, so everything on that clock shuffles together. Its own keeps this part separate. Free-running always uses its own — there is no clock to inherit from.">
      <select class="val" value={p.swingSource ?? 'transport'} onchange={(e) => set('swingSource', e.target.value)}>
        <option value="transport">The transport</option>
        <option value="own">Its own</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Swing" span={1} hint="Delays every odd step by up to half a step. Shares the Arpeggiator's swing function, so an Arp and a Phrase at the same swing land together.">
      <input class="val" type="number" min="0" max="1" step="0.05" value={num(p.swing, 0)} onchange={(e) => set('swing', clampNum(e.target.value, 0, 1, 0))} />
    </PropertyCell>
    <PropertyCell label="Velocity" span={1} hint="The default a cell uses when it has none of its own.">
      <input class="val" type="number" min="1" max="127" step="1" value={num(p.velocity, 100)} onchange={(e) => set('velocity', clampInt(e.target.value, 1, 127, 100))} />
    </PropertyCell>
    <PropertyCell label="Channel" span={1} hint="MIDI channel 1–16.">
      <input class="val" type="number" min="1" max="16" step="1" value={num(p.channel, 1)} onchange={(e) => set('channel', clampInt(e.target.value, 1, 16, 1))} />
    </PropertyCell>
    <PropertyCell label="Bar line" span={1} hint="Shade every Nth step, so 16 steps read as four beats rather than sixteen identical boxes.">
      <input class="val" type="number" min="1" max="16" step="1" value={num(p.accentEvery, 4)} onchange={(e) => set('accentEvery', clampInt(e.target.value, 1, 16, 4))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Pattern">
    <PropertyCell label="Start from" span={4} hint="A blank grid is a blank page. These replace the pattern — the hardest part of a step sequencer is the first four notes.">
      <div class="seeds">
        {#each PHRASE_SEEDS as sd (sd.id)}
          <button type="button" class="seed" title={sd.hint} onclick={() => applySeed(sd.id)}>{sd.label}</button>
        {/each}
      </div>
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Click a cell in preview to toggle a note; drag across to paint a run of them.">
      <PropertyToggle value={p.editable !== false} onchange={() => set('editable', !(p.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Header" span={1} hint="Show the key / length / rate strip.">
      <PropertyToggle value={p.showHeader !== false} onchange={() => set('showHeader', !(p.showHeader !== false))} />
    </PropertyCell>
    <PropertyCell label="Row labels" span={1} hint="The degree (or pitch) labels down the left.">
      <PropertyToggle value={p.showGutter !== false} onchange={() => set('showGutter', !(p.showGutter !== false))} />
    </PropertyCell>
    <PropertyCell label="" span={4} hint="What each row currently means, highest first.">
      <div class="rowmap">{rowMap.join('   ·   ')}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Face" span={1} hint=""><input class="col" type="color" value={colRgb(p.faceColour, 'FF141420')} oninput={(e) => setCol('faceColour', p.faceColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Empty cell" span={1} hint=""><input class="col" type="color" value={colRgb(p.cellColour, 'FF20202C')} oninput={(e) => setCol('cellColour', p.cellColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Note" span={1} hint=""><input class="col" type="color" value={colRgb(p.noteColour, 'FF39D98A')} oninput={(e) => setCol('noteColour', p.noteColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Playhead" span={1} hint=""><input class="col" type="color" value={colRgb(p.playColour, 'FFF2C94C')} oninput={(e) => setCol('playColour', p.playColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Labels" span={1} hint=""><input class="col" type="color" value={colRgb(p.labelColour, 'FFB9B9B9')} oninput={(e) => setCol('labelColour', p.labelColour, e.target.value)} /></PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { width: 100%; background: #141420; border: 1px solid #2a2a36; color: #E8E8EE; font-size: 12px; padding: 3px 6px; border-radius: 4px; }
  .note { font-size: 11px; color: #9a9aa4; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 5px 7px; line-height: 1.5; }
  .preview { font-size: 11.5px; color: #C8C8CE; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 6px 8px; line-height: 1.6; font-family: ui-monospace, Menlo, monospace; overflow-x: auto; white-space: nowrap; }
  .rowmap { font-size: 11px; color: #9a9aa4; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 5px 7px; line-height: 1.6; }
  .pair { display: flex; gap: 4px; }
  .pair .val:first-child { width: 58px; flex: none; }
  .seeds { display: flex; flex-wrap: wrap; gap: 5px; }
  .seed { background: #1A1A1A; border: 1px solid #333; color: #C8C8CE; font-size: 11px; padding: 3px 8px; border-radius: 4px; cursor: pointer; }
  .seed:hover { border-color: #4a4a58; color: #E8E8EE; }
  .link { background: none; border: none; color: #8FC7F5; font-size: 11px; padding: 0 0 0 4px; cursor: pointer; text-decoration: underline; }
  .col { width: 26px; height: 20px; padding: 0; border: 1px solid #2a2a36; background: #141420; border-radius: 3px; }
</style>
