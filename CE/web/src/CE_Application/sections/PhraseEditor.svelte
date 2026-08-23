<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import {
    PHRASE_MODES, PHRASE_MODE_LABELS, PHRASE_DIRECTIONS, PHRASE_DIRECTION_LABELS,
    PHRASE_SEEDS, phraseSeedPattern, phrasePattern, phraseSteps, phraseRows,
    hiddenCellCount, trimPattern, rowToNote, rowLabel, noteLabel, phraseUseFlats,
    phraseMode, cellsInStep, MIN_STEPS, MAX_STEPS, MIN_ROWS, MAX_ROWS,
    cellAt, setCell, cellChance, cellRatchet, cellLength, MAX_RATCHET,
    phrasePatterns, phrasePatternNames, storePattern, loadPattern, MAX_PATTERNS,
  } from '../utils/phraseLayout.js';
  import SongChainCells from '../properties/SongChainCells.svelte';
  import { SCALES, SCALE_LABELS, NOTE_SHARP, NOTE_FLAT, useFlats } from '../utils/chordPadLayout.js';
  import { DIVISION_IDS, DIVISION_LABELS } from '../utils/transportLayout.js';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import TransportSyncCells from '../properties/TransportSyncCells.svelte';
  import Music from 'lucide-svelte/icons/music';
  import Clock from 'lucide-svelte/icons/clock';
  import LayoutGrid from 'lucide-svelte/icons/layout-grid';
  import ListMusic from 'lucide-svelte/icons/list-music';
  import Palette from 'lucide-svelte/icons/palette';

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

  let patterns = $derived.by(() => { try { return phrasePatterns(control); } catch { return []; } });
  let patternNames = $derived.by(() => {
    const names = patterns.map((x) => x.name);
    // The chain picks from slots that may not exist yet, so it always offers
    // the full set rather than only the filled ones.
    return Array.from({ length: MAX_PATTERNS }, (_, i) => names[i] ?? `Pattern ${i + 1}`);
  });

  function applySeed(id) {
    // The random seed wants randomness; everything else ignores the supplier.
    set('pattern', phraseSeedPattern(id, steps, rows, () => Math.random()));
  }
</script>

{#if p}
  <PropertySection title="Phrase Sequencer" icon={Music}>
    <PropertyCell label="Run" span={1} hint="Advance the sequence in preview / player. Stopped, the grid still shows the pattern.">
      <PropertyToggle value={p.running !== false} onchange={() => set('running', !(p.running !== false))} />
    </PropertyCell>
    <PropertyCell label="Rows are" span={3} hint="Scale degrees = the pattern transposes and re-harmonises with the key. Chromatic = a plain piano roll.">
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
    <PropertyCell label="Octave" span={1} compact hint="Octave of row 0 (3 → C3).">
      <NumberCell label="Oct" value={num(p.baseOctave, 3)} step={1} min={-1} max={8} onchange={(v) => set('baseOctave', clampInt(v, -1, 8, 3))} />
    </PropertyCell>
    <PropertyCell label="Transpose" span={1} compact hint="Semitones, applied after the row → pitch map. Use this to move the whole line without changing the key it is written in.">
      <NumberCell label="Trans" value={num(p.transpose, 0)} step={1} min={-48} max={48} onchange={(v) => set('transpose', clampInt(v, -48, 48, 0))} />
    </PropertyCell>

    <PropertyCell label="Steps" span={1} compact hint="Pattern length. Shrinking never destroys cells — they are kept and come back if you grow it again.">
      <NumberCell label="Steps" value={num(p.steps, 16)} step={1} min={MIN_STEPS} max={MAX_STEPS} onchange={(v) => set('steps', clampInt(v, MIN_STEPS, MAX_STEPS, 16))} />
    </PropertyCell>
    <PropertyCell label="Rows" span={1} compact hint="How many degrees the grid shows. 8 gives an octave of a seven-note scale plus the tonic above.">
      <NumberCell label="Rows" value={num(p.rows, 8)} step={1} min={MIN_ROWS} max={MAX_ROWS} onchange={(v) => set('rows', clampInt(v, MIN_ROWS, MAX_ROWS, 8))} />
    </PropertyCell>
    <PropertyCell label="Direction" span={2} hint="Ping-pong turns round at the ends without repeating them. Random repeats identically each pass — change the seed.">
      <select class="val" value={p.direction ?? 'forward'} onchange={(e) => set('direction', e.target.value)}>
        {#each PHRASE_DIRECTIONS as d (d)}<option value={d}>{PHRASE_DIRECTION_LABELS[d] ?? d}</option>{/each}
      </select>
    </PropertyCell>
    {#if String(p.direction ?? 'forward') === 'random'}
      <PropertyCell label="Seed" span={1} compact hint="Changes which order Random produces. Same seed, same order — every time.">
        <NumberCell label="Seed" value={num(p.seed, 0)} step={1} min={0} max={9999} onchange={(v) => set('seed', clampInt(v, 0, 9999, 0))} />
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
        <span class="nc-wrap">
          <NumberCell value={selStep + 1} step={1} min={1} max={steps} onchange={(v) => { selStep = clampInt(v, 1, steps, 1) - 1; }} />
        </span>
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
      <PropertyCell label="Chance" span={1} compact hint="How often the step plays, 0–100%. The same seed and position always give the same result.">
        <NumberCell label="Chance" value={Math.round(cellChance(selCell) * 100)} step={5} min={0} max={100} onchange={(v) => patchCell({ chance: clampInt(v, 0, 100, 100) / 100 })} />
      </PropertyCell>
      <PropertyCell label="Ratchet" span={1} compact hint="How many times the step retriggers inside itself. A tied note is never ratcheted.">
        <NumberCell label="Ratch" value={cellRatchet(selCell)} step={1} min={1} max={MAX_RATCHET} onchange={(v) => patchCell({ ratchet: clampInt(v, 1, MAX_RATCHET, 1) })} />
      </PropertyCell>
      <PropertyCell label="Length" span={1} compact hint="This note's gate as a multiple of the step — 2 holds it for two steps. Blank uses the pattern gate.">
        <NumberCell label="Len" value={cellLength(selCell) ?? 1} step={0.25} min={0.05} max={4} defaultValue={1} onchange={(v) => patchCell({ length: clampNum(v, 0.05, 4, 1) })} />
      </PropertyCell>
      <PropertyCell label="Tie" span={1} hint="Hold this note through from the step before. Needs a note on the same row in the previous step.">
        <PropertyToggle value={selCell.tie === true} onchange={() => patchCell({ tie: !(selCell.tie === true) })} />
      </PropertyCell>
      <PropertyCell label="Velocity" span={1} compact hint="This cell's own velocity. Blank follows the pattern's.">
        <NumberCell label="Vel" value={selCell.velocity ?? 100} step={1} min={1} max={127} defaultValue={100} onchange={(v) => patchCell({ velocity: clampInt(v, 1, 127, 100) })} />
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

  <PropertySection title="Timing" icon={Clock}>
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
      <PropertyCell label="Rate" span={1} compact hint="Steps per second.">
        <NumberCell label="Rate" value={num(p.rate, 8)} step={0.5} min={0.1} max={40} onchange={(v) => set('rate', clampNum(v, 0.1, 40, 8))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Gate" span={1} compact hint="Note length as a fraction of the step; 1 = legato. A note that the next step ties is exempt.">
      <NumberCell label="Gate" value={num(p.gate, 0.8)} step={0.05} min={0.05} max={1} onchange={(v) => set('gate', clampNum(v, 0.05, 1, 0.8))} />
    </PropertyCell>
    <PropertyCell label="Swing from" span={1} hint="Transport = inherit the clock's swing. Own = this sequencer's own setting. Free-running always uses its own.">
      <select class="val" value={p.swingSource ?? 'transport'} onchange={(e) => set('swingSource', e.target.value)}>
        <option value="transport">The transport</option>
        <option value="own">Its own</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Swing" span={1} compact hint="Delays every odd step by up to half a step. Shares the Arpeggiator's swing setting.">
      <NumberCell label="Swing" value={num(p.swing, 0)} step={0.05} min={0} max={1} onchange={(v) => set('swing', clampNum(v, 0, 1, 0))} />
    </PropertyCell>
    <PropertyCell label="Velocity" span={1} compact hint="The default a cell uses when it has none of its own.">
      <NumberCell label="Vel" value={num(p.velocity, 100)} step={1} min={1} max={127} onchange={(v) => set('velocity', clampInt(v, 1, 127, 100))} />
    </PropertyCell>
    <PropertyCell label="Channel" span={1} compact hint="MIDI channel 1–16.">
      <NumberCell label="Ch" value={num(p.channel, 1)} step={1} min={1} max={16} onchange={(v) => set('channel', clampInt(v, 1, 16, 1))} />
    </PropertyCell>
    <PropertyCell label="Bar line" span={1} compact hint="Shade every Nth step, so 16 steps read as four beats.">
      <NumberCell label="Every" value={num(p.accentEvery, 4)} step={1} min={1} max={16} onchange={(v) => set('accentEvery', clampInt(v, 1, 16, 4))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Pattern" icon={LayoutGrid}>
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

  <PropertySection title="Patterns & song" icon={ListMusic}>
    <PropertyCell label="" span={4} hint="Storing and loading are copies, so editing the grid never rewrites a stored pattern behind your back.">
      <div class="slots">
        {#each Array.from({ length: MAX_PATTERNS }, (_, i) => i) as i (i)}
          {@const filled = patterns[i] && Object.keys(patterns[i].cells).length}
          <div class="slot" class:filled>
            <span class="sn">{i + 1}</span>
            <button type="button" class="seed" onclick={() => set('patterns', storePattern(patterns, i, phrasePattern(control)))}>Store</button>
            <button type="button" class="seed" disabled={!filled} onclick={() => set('pattern', loadPattern(patterns, i))}>Load</button>
            <span class="sc">{filled || '—'}</span>
          </div>
        {/each}
      </div>
    </PropertyCell>
    <SongChainCells
      chain={p.chain ?? []}
      slotNames={patternNames}
      enabled={p.chainOn === true}
      loop={p.chainLoop !== false}
      unit="pass"
      onchange={(next) => set('chain', next)}
      ontoggle={(v) => set('chainOn', v)}
      onloop={(v) => set('chainLoop', v)}
    />
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Colours" span={4} hint="Face, empty cell, note, playhead, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'faceColour', label: 'Face', value: p.faceColour ?? 'FF141420', target: { type: 'control', controlId: core?.id, path: 'Phrase.faceColour' } },
        { key: 'cellColour', label: 'Empty', value: p.cellColour ?? 'FF20202C', target: { type: 'control', controlId: core?.id, path: 'Phrase.cellColour' } },
        { key: 'noteColour', label: 'Note', value: p.noteColour ?? 'FF39D98A', target: { type: 'control', controlId: core?.id, path: 'Phrase.noteColour' } },
        { key: 'playColour', label: 'Play', value: p.playColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'Phrase.playColour' } },
        { key: 'labelColour', label: 'Labels', value: p.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Phrase.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .note { font-size: 11px; color: #9a9aa4; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 5px 7px; line-height: 1.5; }
  .preview { font-size: 11.5px; color: #C8C8CE; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 6px 8px; line-height: 1.6; font-family: ui-monospace, Menlo, monospace; overflow-x: auto; white-space: nowrap; }
  .rowmap { font-size: 11px; color: #9a9aa4; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 5px 7px; line-height: 1.6; }
  .pair { display: flex; gap: 4px; }
  .pair .val:first-child { width: 58px; flex: none; }
  .seeds { display: flex; flex-wrap: wrap; gap: 5px; }
  .slots { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }
  .slot { display: flex; align-items: center; gap: 4px; border: 1px solid #2a2a36; border-radius: 4px; padding: 3px 5px; background: #12121a; }
  .slot.filled { border-color: #3a3a48; }
  .sn { font-size: 10.5px; color: #7a7a84; width: 10px; }
  .sc { font-size: 10.5px; color: #7a7a84; margin-left: auto; }
  .seed:disabled { opacity: 0.4; cursor: default; }
  .seed { background: #1A1A1A; border: 1px solid #333; color: #C8C8CE; font-size: 11px; padding: 3px 8px; border-radius: 4px; cursor: pointer; }
  .seed:hover { border-color: #4a4a58; color: #E8E8EE; }
  .link { background: none; border: none; color: #8FC7F5; font-size: 11px; padding: 0 0 0 4px; cursor: pointer; text-decoration: underline; }
</style>
