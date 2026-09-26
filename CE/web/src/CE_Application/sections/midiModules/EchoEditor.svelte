<script>
  /**
   * Echo, drawn: the note and its repeats on a timeline. Size is loudness, height is pitch, the
   * gap is time (in milliseconds at the tempo). noteModuleViews.echoNotes mirrors
   * NoteEchoEngine, so the picture is what plays.
   */
  import ScrubValue from './ScrubValue.svelte';
  import Segmented from './Segmented.svelte';
  import PropertyToggle from '../../properties/PropertyToggle.svelte';
  import { echoNotes, beatsToMs } from '../../utils/noteModuleViews.js';

  let { mod, set, tempo = 120, beatChoices = [], scale = { type: 'major', root: 0 } } = $props();

  const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const FEELS = [{ value: 'straight', label: 'straight' }, { value: 'dotted', label: 'dotted' }, { value: 'triplet', label: 'triplet' }];
  const notes = $derived(echoNotes(mod, 60, 110, scale));
  const W = 560, H = 170, L = 16, R = 16, T = 26, B = 26;
  const span = $derived(Math.max(2, Math.ceil(notes.at(-1).at + notes.at(-1).length + 0.5)));
  const x = (b) => L + (b / span) * (W - L - R);
  const low = $derived(Math.min(...notes.map((n) => n.note)) - 2);
  const high = $derived(Math.max(...notes.map((n) => n.note)) + 2);
  const y = (n) => H - B - ((n - low) / Math.max(1, high - low)) * (H - T - B);
  const stepBeats = $derived(notes.length > 1 ? notes[1].at : mod.echoStepBeats);
</script>

<div class="editor" data-testid="echo-editor">
  <svg class="picture" viewBox={`0 0 ${W} ${H}`} role="img" data-testid="echo-picture"
       aria-label="The note and its repeats: when, how loud, which pitch">
    {#each Array.from({ length: span * 4 + 1 }, (_, i) => i / 4) as b (b)}
      <line x1={x(b)} x2={x(b)} y1={T - 8} y2={H - B} class="grid" class:beat={Number.isInteger(b)} />
      {#if Number.isInteger(b) && b < span}<text x={x(b) + 2} y={H - 8} class="axis">{b === 0 ? 'played' : `beat ${b + 1}`}</text>{/if}
    {/each}
    {#each notes as n, i (i)}
      <rect x={x(n.at)} y={y(n.note) - 3} width={Math.max(4, x(n.at + n.length) - x(n.at))} height="6" rx="3"
            class="len" class:first={i === 0} />
      <circle cx={x(n.at)} cy={y(n.note)} r={3 + n.velocity / 16} class="hit" class:first={i === 0} />
      <text x={x(n.at) - 4} y={y(n.note) - 8 - n.velocity / 16} class="label">{NAMES[n.note % 12]} {n.velocity}</text>
    {/each}
  </svg>

  <div class="row">
    <div class="mf"><span class="lbl">Repeats</span>
      <ScrubValue value={mod.echoRepeats} min={0} max={8} label="Echo repeats" testid="echo-repeats"
                  format={(v) => (v === 0 ? 'off' : String(v))} onchange={(v) => set({ echoRepeats: v })} />
    </div>
    <div class="mf"><span class="lbl">Every</span>
      <ScrubValue value={mod.echoStepBeats} choices={beatChoices} label="Echo time" testid="echo-time"
                  onchange={(v) => set({ echoStepBeats: v })} />
      <span class="sub">{beatsToMs(stepBeats, tempo)} ms at {Math.round(tempo)}</span>
    </div>
    <div class="mf"><span class="lbl">Feel</span>
      <Segmented options={FEELS} value={mod.echoFeel} label="Echo feel" testid="echo-feel" onchange={(v) => set({ echoFeel: v })} />
    </div>
    <div class="mf"><span class="lbl">Each one</span>
      <ScrubValue value={Math.round(mod.echoFeedback * 100)} min={10} max={100} step={5} unit="%" label="Echo loudness per repeat"
                  testid="echo-feedback" title="How loud each repeat is, compared with the one before"
                  onchange={(v) => set({ echoFeedback: v / 100 })} />
    </div>
    <div class="mf"><span class="lbl">Never below</span>
      <ScrubValue value={mod.echoFloor} min={1} max={127} label="Echo floor" testid="echo-floor"
                  format={(v) => (v <= 1 ? 'off' : String(v))} onchange={(v) => set({ echoFloor: v })} />
    </div>
  </div>
  <div class="row">
    <div class="mf"><span class="lbl">Climb</span>
      <ScrubValue value={mod.echoTranspose} min={-12} max={12} label="Echo climb" testid="echo-climb"
                  format={(v) => (v === 0 ? 'none' : `${v > 0 ? '+' : ''}${v}`)} onchange={(v) => set({ echoTranspose: v })} />
    </div>
    <div class="mf"><span class="lbl">Climb by</span>
      <Segmented options={[{ value: true, label: 'scale steps' }, { value: false, label: 'semitones' }]} value={mod.echoScaleClimb}
                 label="Echo climbs by" testid="echo-climb-by" onchange={(v) => set({ echoScaleClimb: v })} />
      {#if mod.echoScaleClimb}<span class="sub">in {NAMES[scale.root]} {scale.type}, the part's key</span>{/if}
    </div>
    <div class="mf"><span class="lbl">Length</span>
      <PropertyToggle compact label="Each one shorter" value={mod.echoShorter} onchange={(on) => set({ echoShorter: on })} />
    </div>
  </div>
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 10px; width: 100%; }
  .picture { width: 100%; max-width: 640px; background: var(--host-field, #12171b); border: 1px solid var(--host-line-soft, #2c353e); border-radius: 5px; }
  .grid { stroke: var(--host-line-soft, #2c353e); }
  .grid.beat { stroke: var(--host-line, #3b4652); }
  .axis { font: 9px var(--host-font-mono, monospace); fill: var(--host-text-faint, #65717c); }
  .label { font: 10px var(--host-font-mono, monospace); fill: var(--host-text-soft, #aab5be); }
  .len { fill: var(--host-accent, #5b9bd5); opacity: .45; }
  .hit { fill: var(--host-accent, #5b9bd5); }
  .first { fill: var(--host-accent-strong, #79b9ee); }
  .row { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-start; }
  .mf { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .lbl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: var(--host-text-dim, #7f8b96); }
  .sub { font-size: 11px; color: var(--host-text-faint, #65717c); }
</style>
