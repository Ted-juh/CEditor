<script>
  /**
   * The arpeggiator as one lane. Each column is a step; the rows under it say how hard it
   * plays, how many quick repeats it makes, whether it ties into the next, which octave, and
   * how likely it is to play at all. In Drawn mode the melody sits on top of the same columns.
   * The playhead is the engine's own step (instrumentHostArpStep), never a timer in here.
   *
   * Rows the player has not touched stay empty, which the engine reads as "plain" — so a fresh
   * arp plays the velocities you played, every step once, until something is drawn.
   */
  import ScrubValue from '../../components/controls/ScrubValue.svelte';
  import Segmented from '../../components/controls/Segmented.svelte';
  import PropertyToggle from '../../properties/PropertyToggle.svelte';
  import HostConfirmButton from '../HostConfirmButton.svelte';
  import {
    ARP_MODES, RATE_CHOICES, LANE_LENGTHS, ARP_PATTERNS, laneLength, resizeLane, setLaneCell,
    nextRepeats, nextOctave, nextChance, clearLane,
  } from '../../utils/arpLane.js';

  let { arp, set, playStep = -1, identity = '' } = $props();

  const FEELS = [
    { value: 'straight', label: 'straight' },
    { value: 'triplet', label: 'triplet', title: 'Each step two thirds as long' },
    { value: 'dotted', label: 'dotted', title: 'Each step one and a half times as long' },
  ];
  const OCTAVES = [1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }));

  const length = $derived(laneLength(arp));
  const steps = $derived(Array.from({ length }, (_, i) => i));
  const drawn = $derived(arp.mode === 'pattern');
  const noteRows = $derived(arp.patternSemitones ? 25 : 8);
  const rowOf = (field, i, fallback) => {
    const row = arp[field] ?? [];
    return row.length ? (row[i % row.length] ?? fallback) : fallback;
  };
  let pattern = $state('');

  // --- velocity and melody: drawn by dragging across the columns ------------------------------
  let draft = $state(null);          // { field, values } while a drag is under way
  let painting = true;
  const values = (field, fallback) =>
    draft?.field === field ? draft.values
      : (arp[field]?.length ? arp[field] : Array.from({ length }, () => fallback));

  function cellFrom(event, el, rows) {
    const rect = el.getBoundingClientRect();
    const step = Math.max(0, Math.min(length - 1, Math.floor(((event.clientX - rect.left) / rect.width) * length)));
    const y = (event.clientY - rect.top) / rect.height;
    return { step, y: Math.max(0, Math.min(1, y)), row: Math.max(0, Math.min(rows - 1, rows - 1 - Math.floor(y * rows))) };
  }
  function velPaint(event, el) {
    const { step, y } = cellFrom(event, el, 1);
    const raw = Math.round((1 - y) * 127);
    draft.values[step] = raw < 7 ? 0 : raw;   // the bottom band snaps to a rest
  }
  function melodyPaint(event, el, first) {
    const { step, row } = cellFrom(event, el, noteRows);
    if (first) painting = draft.values[step] !== row;
    draft.values[step] = painting ? row : -1;
  }
  function dragStart(event, field, fallback, paint) {
    event.preventDefault();
    const el = event.currentTarget;
    el.setPointerCapture?.(event.pointerId);
    draft = { field, values: [...values(field, fallback)] };
    paint(event, el, true);
    const move = (e) => { if (draft) paint(e, el, false); };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (draft) set({ ...resizeLane(arp, length), [draft.field]: [...draft.values] });
      draft = null;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  const cycle = (rowName, i, value) => { pattern = ''; set({ ...resizeLane(arp, length), ...setLaneCell(arp, rowName, i, value) }); };
  const applyPattern = (p) => { pattern = p.id; set(p.fields); };
  const modeShape = (shape) => (shape ?? []).map((y, i, all) => ({ x: 3 + i * (28 / all.length), y: 16 - y * 2.6 }));
</script>

<div class="editor" data-testid="arp-editor">
  <div class="row">
    <div class="mf"><span class="lbl">Arp</span>
      <PropertyToggle compact label={arp.enabled ? 'On' : 'Off'} value={arp.enabled} ariaLabel="Arpeggiator"
                      onchange={(on) => set({ enabled: on })} />
    </div>
    <div class="mf"><span class="lbl">Mode</span>
      <div class="modes" role="group" aria-label="Arpeggiator mode" data-testid="arp-mode">
        {#each ARP_MODES as m (m.value)}
          <button type="button" class="ctl mode" aria-pressed={arp.mode === m.value} data-value={m.value}
                  title={m.label} onclick={() => set({ mode: m.value })}>
            <svg viewBox="0 0 34 18" aria-hidden="true">
              {#if m.shape}
                {#each modeShape(m.shape) as p, i (i)}<rect x={p.x} y={p.y} width="5" height="2.6" rx="1" />{/each}
              {:else}
                {#each [4, 9, 14] as y (y)}<rect x="14" {y} width="7" height="2.6" rx="1" />{/each}
              {/if}
            </svg>
            <span>{m.label}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="row">
    <div class="mf"><span class="lbl">Rate</span>
      <ScrubValue value={arp.stepsPerBeat} choices={RATE_CHOICES} label="Arpeggiator rate" testid="arp-rate"
                  onchange={(v) => set({ stepsPerBeat: v })} />
    </div>
    <div class="mf"><span class="lbl">Feel</span>
      <Segmented options={FEELS} value={arp.feel} label="Arpeggiator feel" testid="arp-feel" onchange={(v) => set({ feel: v })} />
    </div>
    <div class="mf"><span class="lbl">Octaves</span>
      <Segmented options={OCTAVES} value={arp.octaves} label="Arpeggiator octaves" testid="arp-octaves" onchange={(v) => set({ octaves: v })} />
    </div>
    <div class="mf"><span class="lbl">Gate</span>
      <ScrubValue value={Math.round(arp.gate * 100)} min={5} max={100} step={5} unit="%" label="Arpeggiator gate" testid="arp-gate"
                  onchange={(v) => set({ gate: v / 100 })} />
    </div>
    <div class="mf"><span class="lbl">Swing</span>
      <ScrubValue value={Math.round(arp.swing * 100)} min={0} max={75} label="Arpeggiator swing" testid="arp-swing"
                  format={(v) => (v === 0 ? 'off' : `${v}%`)} onchange={(v) => set({ swing: v / 100 })} />
    </div>
    <div class="mf"><span class="lbl">Hold</span>
      <PropertyToggle compact label={arp.latch ? 'Latched' : 'Latch'} value={arp.latch} ariaLabel="Latch the held chord"
                      onchange={(on) => set({ latch: on })} />
    </div>
  </div>

  <div class="lane" data-testid="arp-lane" style:--steps={length}>
    {#if drawn}
      <span class="rl">Melody
        <span class="rows-mode">
          <button type="button" class="ctl" aria-pressed={!arp.patternSemitones} title="Rows are notes of the chord you hold"
                  onclick={() => set({ patternSemitones: false })}>chord</button>
          <button type="button" class="ctl" aria-pressed={arp.patternSemitones} data-testid="arp-rows-free"
                  title="Rows are semitones around your lowest key" onclick={() => set({ patternSemitones: true })}>free</button>
        </span>
      </span>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="melody" data-testid="arp-melody" style:--rows={noteRows}
           onpointerdown={(e) => dragStart(e, 'degreePattern', -1, melodyPaint)}>
        {#each steps as i (i)}
          {@const degree = values('degreePattern', -1)[i] ?? -1}
          <div class="mcol" class:play={playStep === i} class:beat={i % 4 === 0}>
            {#each Array.from({ length: noteRows }, (_, r) => noteRows - 1 - r) as r (r)}
              <i class:on={degree === r} class:ground={arp.patternSemitones && r === 12}></i>
            {/each}
          </div>
        {/each}
      </div>
    {/if}

    <span class="rl">Velocity{#if !arp.velocityPattern.length}<small>as played</small>{/if}</span>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="vel" data-testid="arp-velocity" class:unset={!arp.velocityPattern.length && draft?.field !== 'velocityPattern'}
         onpointerdown={(e) => dragStart(e, 'velocityPattern', 100, velPaint)}>
      {#each steps as i (i)}
        {@const v = values('velocityPattern', 100)[i] ?? 100}
        <div class="vcol" class:play={playStep === i} class:beat={i % 4 === 0} class:rest={v === 0}>
          <i style:height={`${Math.max(v === 0 ? 0 : 4, (v / 127) * 100)}%`} class:accent={v >= 110}></i>
        </div>
      {/each}
    </div>

    <span class="rl">Repeats</span>
    <div class="cells" data-row="repeats">
      {#each steps as i (i)}
        {@const n = rowOf('ratchetPattern', i, 1)}
        <button type="button" class="ctl cell" class:set={n > 1} class:play={playStep === i} data-step={i}
                title={`Step ${i + 1}: ${n} ${n === 1 ? 'hit' : 'hits'} — click for more`}
                onclick={() => cycle('repeats', i, nextRepeats(n))}>
          <span class="dots">{#each Array(n) as _, k (k)}<i></i>{/each}</span>
        </button>
      {/each}
    </div>

    <span class="rl">Tie</span>
    <div class="cells" data-row="tie">
      {#each steps as i (i)}
        {@const t = rowOf('tiePattern', i, 0)}
        <button type="button" class="ctl cell" class:set={t === 1} class:play={playStep === i} data-step={i}
                title={`Step ${i + 1}: ${t ? 'held into the next step' : 'plays its gate'}`}
                onclick={() => cycle('tie', i, t ? 0 : 1)}>{t ? '⁀' : ''}</button>
      {/each}
    </div>

    <span class="rl">Octave</span>
    <div class="cells" data-row="octave">
      {#each steps as i (i)}
        {@const o = rowOf('octavePattern', i, 0)}
        <button type="button" class="ctl cell" class:set={o !== 0} class:play={playStep === i} data-step={i}
                title={`Step ${i + 1}: ${o === 0 ? 'no jump' : `${o > 0 ? '+' : ''}${o} octave`}`}
                onclick={() => cycle('octave', i, nextOctave(o))}>{o === 0 ? '·' : o > 0 ? `+${o}` : o}</button>
      {/each}
    </div>

    <span class="rl">Chance</span>
    <div class="cells" data-row="chance">
      {#each steps as i (i)}
        {@const c = rowOf('chancePattern', i, 100)}
        <button type="button" class="ctl cell" class:set={c < 100} class:play={playStep === i} data-step={i}
                title={`Step ${i + 1}: plays ${c}% of the time`}
                onclick={() => cycle('chance', i, nextChance(c))}>{c < 100 ? c : ''}</button>
      {/each}
    </div>
  </div>

  <div class="row">
    <div class="mf"><span class="lbl">Steps</span>
      <ScrubValue value={length} choices={LANE_LENGTHS.map((n) => [n, String(n)])} label="Lane length" testid="arp-length"
                  onchange={(n) => set(resizeLane(arp, n))} />
    </div>
    <HostConfirmButton {identity} title="Clear the lane back to plain steps" type="button" class="ctl pill"
                       onclick={() => { pattern = ''; set(clearLane()); }}>Clear lane</HostConfirmButton>
    <span class="sub">Drag the velocity bars (bottom = rest); click the other cells to step through their values.</span>
  </div>

  <div class="mf"><span class="lbl">Patterns</span>
    <div class="patterns" data-testid="arp-patterns">
      {#each ARP_PATTERNS as p (p.id)}
        <button type="button" class="ctl chip" aria-pressed={pattern === p.id} data-value={p.id} title={p.title}
                onclick={() => applyPattern(p)}>{p.label}</button>
      {/each}
    </div>
  </div>
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 12px; width: 100%; }
  .row { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; }
  .mf { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .lbl, .rl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: var(--host-text-dim, #7f8b96); }
  .sub { font-size: 11px; color: var(--host-text-faint, #65717c); }

  .modes { display: flex; flex-wrap: wrap; gap: 4px; }
  .mode { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 7px 3px; cursor: pointer;
          font: 500 11px var(--host-font, sans-serif); color: var(--host-text-soft, #aab5be);
          background: var(--host-surface-raised, #20272e); border: 1px solid var(--host-line-soft, #2c353e); border-radius: 4px; }
  .mode svg { width: 34px; height: 18px; }
  .mode svg rect { fill: currentColor; }
  .mode:hover { border-color: var(--host-line-strong, #526170); }
  .mode[aria-pressed='true'] { background: var(--host-accent-surface, #243746); color: var(--host-accent-strong, #79b9ee); border-color: var(--host-accent, #5b9bd5); }

  .lane { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 4px 8px; align-items: center; max-width: 760px; }
  .rl { display: flex; flex-direction: column; gap: 2px; }
  .rl small { font: 400 9px var(--host-font-mono, monospace); letter-spacing: 0; text-transform: none; color: var(--host-text-faint, #65717c); }
  .cells, .vel, .melody { display: grid; grid-template-columns: repeat(var(--steps), minmax(0, 1fr)); gap: 2px; }
  .vel, .melody { touch-action: none; cursor: crosshair; user-select: none; }
  .vcol { height: 64px; display: flex; align-items: flex-end; padding: 2px; box-sizing: border-box;
          background: var(--host-field, #12171b); border: 1px solid var(--host-line-soft, #2c353e); border-radius: 3px; }
  .vcol i { display: block; width: 100%; border-radius: 2px; background: var(--host-accent, #5b9bd5); }
  .vcol i.accent { background: #ff9408; }
  .vel.unset .vcol i { opacity: .35; }
  .vcol.rest { background: repeating-linear-gradient(135deg, var(--host-field, #12171b) 0 4px, #1a2026 4px 8px); }
  .mcol { display: grid; grid-template-rows: repeat(var(--rows), 1fr); gap: 1px; height: calc(var(--rows) * 7px + 20px); }
  .mcol i { background: var(--host-field, #12171b); border-radius: 1px; }
  .mcol i.ground { background: #1d2a34; }
  .mcol i.on { background: var(--host-accent-strong, #79b9ee); }
  .beat.vcol, .beat.mcol { border-color: var(--host-line, #3b4652); }
  .cell { min-width: 0; height: 22px; padding: 0; cursor: pointer; display: grid; place-items: center;
          font: 600 10px var(--host-font-mono, monospace); color: var(--host-text-soft, #aab5be);
          background: var(--host-field, #12171b); border: 1px solid var(--host-line-soft, #2c353e); border-radius: 3px; }
  .cell.set { background: var(--host-accent-surface, #243746); color: var(--host-accent-strong, #79b9ee); border-color: #35536b; }
  .cell:hover { border-color: var(--host-line-strong, #526170); }
  .play { box-shadow: 0 0 0 2px var(--host-active, #58a879); }
  .dots { display: flex; gap: 2px; }
  .dots i { width: 4px; height: 4px; border-radius: 50%; background: currentColor; display: block; }
  .rows-mode { display: inline-flex; gap: 2px; margin-top: 3px; }
  .rows-mode button { font: 500 10px var(--host-font, sans-serif); padding: 1px 5px; border-radius: 3px; cursor: pointer;
                      color: var(--host-text-soft, #aab5be); background: var(--host-field, #12171b); border: 1px solid var(--host-line-soft, #2c353e); }
  .rows-mode button[aria-pressed='true'] { color: var(--host-accent-strong, #79b9ee); border-color: var(--host-accent, #5b9bd5); }
  .patterns { display: flex; flex-wrap: wrap; gap: 5px; }
  .chip { font: 500 12px var(--host-font, sans-serif); color: var(--host-text-soft, #aab5be); cursor: pointer;
          background: var(--host-surface-raised, #20272e); border: 1px solid var(--host-line, #3b4652); border-radius: 12px; padding: 3px 10px; }
  .chip:hover { border-color: var(--host-accent, #5b9bd5); }
  .chip[aria-pressed='true'] { color: var(--host-accent-strong, #79b9ee); border-color: var(--host-accent, #5b9bd5); background: var(--host-accent-surface, #243746); }
  :global(.pill.ctl) { font: 500 12px var(--host-font, sans-serif); color: var(--host-text-soft, #aab5be); cursor: pointer;
                       background: var(--host-surface-raised, #20272e); border: 1px solid var(--host-line, #3b4652); border-radius: 12px; padding: 3px 10px; }
</style>
