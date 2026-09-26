<script>
  /**
   * Strum, drawn. Each note of an example chord is a bar on a beat grid: where it starts, and how
   * hard it plays. The picture is computed by the engine's own rules (noteModuleViews.js mirrors
   * StrumEngine), so what you see is what you will hear. The feel is a handle on the curve.
   */
  import ScrubValue from './ScrubValue.svelte';
  import Segmented from './Segmented.svelte';
  import { strumNotes, beatsToMs, guitarVoicing } from '../../utils/noteModuleViews.js';
  import PropertyToggle from '../../properties/PropertyToggle.svelte';

  let { mod, set, tempo = 120, beatChoices = [] } = $props();

  // An open E major guitar chord: six notes wide enough to show every stroke clearly.
  const GUITAR_CHORD = [40, 47, 52, 56, 59, 64];
  // Guitar mode shows what it does to a chord played on the keys: C major, re-fretted.
  const example = $derived(mod.strumGuitar ? guitarVoicing([60, 64, 67]).map((v) => v.note) : GUITAR_CHORD);
  const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const name = (n) => NAMES[n % 12] + (Math.floor(n / 12) - 1);

  const STROKES = [
    { value: 'ascending', label: '↑ Up', title: 'Low to high' },
    { value: 'descending', label: '↓ Down', title: 'High to low' },
    { value: 'alternate', label: '↕ Alternate', title: 'Up, then down on the next chord' },
    { value: 'outside in', label: '⇥ Outside in', title: 'Outer notes first, meeting in the middle' },
    { value: 'inside out', label: '⇤ Inside out', title: 'Middle notes first, spreading outwards' },
    { value: 'random', label: '✳ Scatter', title: 'A new order every chord, like a harp' },
  ];
  const spreadChoices = $derived([[0, 'off'], ...beatChoices.slice(0, 7)]);

  let secondStroke = $state(false);
  const params = $derived({ pattern: mod.strumPattern, spreadBeats: mod.strumBeats,
                            feel: mod.strumCurve, velocityRamp: mod.strumVelocityRamp });
  const played = $derived(strumNotes(params, example, 100, secondStroke));

  // Geometry. The grid always shows a little past the spread, so the last note is not on the edge.
  const W = 560, LEFT = 44, ROW = 20, TOP = 8;
  const span = $derived(Math.max(0.0625, mod.strumBeats) * 1.35);
  const x = (beats) => LEFT + (beats / span) * (W - LEFT - 12);
  const rowY = (note) => TOP + (example.length - 1 - example.indexOf(note)) * ROW;
  const gridStep = $derived(span > 0.5 ? 0.125 : span > 0.2 ? 0.0625 : 0.03125);
  const ticks = $derived(Array.from({ length: Math.floor(span / gridStep) + 1 }, (_, i) => i * gridStep));
  const curve = $derived([...played].sort((a, b) => a.rank - b.rank)
    .map((n) => `${x(n.atBeats)},${rowY(n.note) + ROW / 2 - 2}`).join(' '));
  const handle = $derived(played[Math.floor(played.length / 2)]);

  const feelName = (v) => (v < -0.15 ? 'slow start' : v > 0.15 ? 'quick start' : 'even');

  let dragging = null;
  function handleDown(e) {
    dragging = { x: e.clientX, feel: mod.strumCurve, scale: (e.currentTarget.ownerSVGElement.getBoundingClientRect().width || W) / W };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function handleMove(e) {
    if (!dragging) return;
    // Right = the middle note later = slower start = negative feel.
    const feel = Math.max(-1, Math.min(1, dragging.feel - (e.clientX - dragging.x) / (140 * dragging.scale)));
    set({ strumCurve: Math.round(feel * 20) / 20 });
  }
  function handleUp() { dragging = null; }
</script>

<div class="editor" data-testid="strum-editor">
  <svg class="picture" viewBox={`0 0 ${W} ${TOP + example.length * ROW + 18}`} role="img"
       aria-label="When each note of the chord sounds, and how hard" data-testid="strum-picture">
    {#each ticks as t (t)}
      <line x1={x(t)} x2={x(t)} y1={TOP - 4} y2={TOP + example.length * ROW}
            class:bar={Math.abs(t % 0.25) < 1e-6} class="tick" />
    {/each}
    {#if mod.strumBeats > 0}
      <line x1={x(mod.strumBeats)} x2={x(mod.strumBeats)} y1={TOP - 4} y2={TOP + example.length * ROW} class="spread-end" />
    {/if}
    {#each played as n (n.note)}
      {@const y = rowY(n.note)}
      <text x="4" y={y + ROW / 2 + 3} class="note-name">{name(n.note)}</text>
      <rect x={x(n.atBeats)} y={y + 2} width={Math.max(8, W - 12 - x(n.atBeats))} height={ROW - 6} rx="3" class="note" />
      <rect x={x(n.atBeats)} y={y + 2} width="3" height={ROW - 6} rx="1" class="onset" />
      <rect x={x(n.atBeats) + 6} y={y + 2 + (ROW - 6) * (1 - n.velocity / 127)} width="4"
            height={(ROW - 6) * n.velocity / 127} class="velocity" />
      <text x={x(n.atBeats) + 14} y={y + ROW / 2 + 3} class="vel-text">{n.velocity}</text>
    {/each}
    {#if mod.strumBeats > 0 && played.length > 2}
      <polyline points={curve} class="curve" />
      <circle cx={x(handle.atBeats)} cy={rowY(handle.note) + ROW / 2 - 2} r="7" class="handle"
              role="slider" tabindex="0" aria-label="Strum feel" aria-valuemin="-1" aria-valuemax="1"
              aria-valuenow={mod.strumCurve} aria-valuetext={feelName(mod.strumCurve)}
              onpointerdown={handleDown} onpointermove={handleMove} onpointerup={handleUp} onpointercancel={handleUp}
              onkeydown={(e) => {
                if (e.key === 'ArrowLeft') set({ strumCurve: Math.min(1, Math.round((mod.strumCurve + 0.05) * 20) / 20) });
                if (e.key === 'ArrowRight') set({ strumCurve: Math.max(-1, Math.round((mod.strumCurve - 0.05) * 20) / 20) });
              }}>
        <title>Drag sideways to change the feel</title>
      </circle>
    {/if}
    <text x={LEFT} y={TOP + example.length * ROW + 13} class="axis">chord struck</text>
    {#if mod.strumBeats > 0}
      <text x={x(mod.strumBeats)} y={TOP + example.length * ROW + 13} class="axis end"
            text-anchor="middle">+{spreadChoices.find(([v]) => Math.abs(v - mod.strumBeats) < 1e-6)?.[1] ?? mod.strumBeats}</text>
    {/if}
  </svg>

  <div class="controls">
    <div class="mf wide"><span class="lbl">Stroke</span>
      <Segmented options={STROKES} value={mod.strumPattern} label="Stroke" testid="strum-stroke"
                 onchange={(v) => { secondStroke = false; set({ strumPattern: v }); }} />
      {#if mod.strumPattern === 'alternate'}
        <button type="button" class="ctl link" onclick={() => (secondStroke = !secondStroke)}>
          show the {secondStroke ? 'first (up)' : 'next (down)'} stroke</button>
      {/if}
    </div>
    <div class="mf"><span class="lbl">Spread</span>
      <ScrubValue value={mod.strumBeats} choices={spreadChoices} label="Strum spread" testid="strum-spread"
                  onchange={(v) => set({ strumBeats: v })} />
      <span class="sub">{mod.strumBeats > 0 ? `${beatsToMs(mod.strumBeats, tempo)} ms at ${Math.round(tempo)} BPM` : 'chords play at once'}</span>
    </div>
    <div class="mf"><span class="lbl">Feel</span>
      <ScrubValue value={mod.strumCurve} min={-1} max={1} step={0.05} label="Strum feel" testid="strum-feel"
                  format={(v) => feelName(v)} title="Drag up for a quicker start, down for a slower one; or drag the handle in the picture"
                  onchange={(v) => set({ strumCurve: v })} />
      <span class="sub">{mod.strumCurve > 0 ? '+' : ''}{mod.strumCurve.toFixed(2)}</span>
    </div>
    <div class="mf"><span class="lbl">Guitar</span>
      <PropertyToggle compact label="Six strings" value={mod.strumGuitar}
                      title="Re-fret every chord onto six guitar strings before strumming: C played on the keys comes out as the open C chord"
                      onchange={(on) => set({ strumGuitar: on })} />
      <span class="sub">{mod.strumGuitar ? 'C on the keys → x32010' : 'notes as played'}</span>
    </div>
    <div class="mf"><span class="lbl">Last note</span>
      <ScrubValue value={mod.strumVelocityRamp} min={-64} max={64} step={1} unit="vel" label="Last-note velocity change"
                  testid="strum-ramp" format={(v) => `${v > 0 ? '+' : ''}${v}`}
                  onchange={(v) => set({ strumVelocityRamp: v })} />
      <span class="sub">{mod.strumVelocityRamp === 0 ? 'all as played' : mod.strumVelocityRamp < 0 ? 'fades through the stroke' : 'builds through the stroke'}</span>
    </div>
  </div>
  <span class="hint">Note lengths are kept: a note that starts later also ends later.</span>
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 10px; width: 100%; }
  .picture { width: 100%; max-width: 640px; background: var(--host-field, #12171b); border: 1px solid var(--host-line-soft, #2c353e); border-radius: 5px; }
  .tick { stroke: var(--host-line-soft, #2c353e); stroke-width: 1; }
  .tick.bar { stroke: var(--host-line, #3b4652); }
  .spread-end { stroke: var(--host-pending, #d7a44e); stroke-width: 1; stroke-dasharray: 3 3; }
  .note { fill: var(--host-accent-surface, #243746); stroke: var(--host-accent, #5b9bd5); stroke-width: 1; }
  .onset { fill: var(--host-accent-strong, #79b9ee); }
  .velocity { fill: #ff9408; opacity: 0.85; }
  .note-name, .axis, .vel-text { font: 10px var(--host-font-mono, monospace); fill: var(--host-text-dim, #7f8b96); }
  .vel-text { fill: var(--host-text-soft, #aab5be); }
  .axis.end { fill: var(--host-pending, #d7a44e); }
  .curve { fill: none; stroke: var(--host-text-soft, #aab5be); stroke-width: 1.5; stroke-dasharray: 2 3; }
  .handle { fill: var(--host-accent-strong, #79b9ee); stroke: var(--host-bg-deep, #101418); stroke-width: 2; cursor: ew-resize; }
  .handle:focus-visible { outline: none; stroke: #fff; }
  .controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; }
  .mf { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .mf.wide { flex-basis: 100%; }
  .lbl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: var(--host-text-dim, #7f8b96); }
  .sub { font-size: 11px; color: var(--host-text-faint, #65717c); }
  .hint { font-size: 11px; color: var(--host-text-faint, #65717c); }
  .link { align-self: flex-start; background: none; border: 0; padding: 0; color: var(--host-accent-strong, #79b9ee); font-size: 11px; cursor: pointer; text-decoration: underline; }
</style>
