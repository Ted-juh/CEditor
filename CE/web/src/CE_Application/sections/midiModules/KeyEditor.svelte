<script>
  /**
   * Key: the part's song key, and this module's transpose and scale.
   *
   * The song key belongs to the part. Every module that follows it (Chords, the arpeggiator,
   * Echo's scale climb, this one) takes its scale from there when the chain reaches the engine
   * (perf::withSongKey), so changing the key once changes it everywhere. A module can keep a
   * key of its own instead.
   */
  import ScrubValue from '../../components/controls/ScrubValue.svelte';
  import Segmented from '../../components/controls/Segmented.svelte';
  import MiniKeys from '../../components/controls/MiniKeys.svelte';
  import { HOST_SCALES, NOTE_NAMES } from '../../utils/chordBuilder.js';

  let {
    fx, set, part, scales = [], chain = [], labels = {}, onsetkey = () => {}, onsetslot = () => {},
  } = $props();

  const ROOTS = NOTE_NAMES.map((label, value) => ({ value, label }));
  const scaleNames = $derived(scales.length ? scales : Object.keys(HOST_SCALES));
  const follows = $derived(fx.followSongKey);
  const root = $derived(follows ? part.keyRoot : fx.scaleRoot);
  const scale = $derived(follows ? part.keyScale : fx.scaleType);
  const inScale = $derived(new Set((HOST_SCALES[scale] ?? []).map((d) => (d + root) % 12)));
  const marks = $derived(Object.fromEntries(Array.from({ length: 36 }, (_, i) => 48 + i)
    .filter((n) => inScale.has(n % 12)).map((n) => [n, n % 12 === root ? 'root' : 'on'])));
  const fold = $derived(!fx.constrainToScale ? 'pass' : fx.scaleFold);
  const FOLDS = [
    { value: 'snap', label: 'snap to the scale', title: 'Moved to the nearest note of the scale' },
    { value: 'drop', label: 'drop', title: 'Not played at all' },
    { value: 'pass', label: 'let through', title: 'Played as they are' },
  ];
  // The modules in this part that read a scale, and whether each follows the song key.
  const readers = $derived(chain.filter((s) => ['key', 'chord', 'arp', 'echo', 'fx'].includes(s.type)));
</script>

<div class="editor" data-testid="key-editor">
  <section class="block">
    <div class="head"><span class="lbl">Song key</span>
      <span class="sub">for the whole part: {NOTE_NAMES[part.keyRoot]} {part.keyScale}</span></div>
    <Segmented options={ROOTS} value={part.keyRoot} label="Song key root" testid="song-key-root"
               onchange={(v) => onsetkey({ root: v })} />
    <div class="chips" role="group" aria-label="Song key scale" data-testid="song-key-scale">
      {#each scaleNames as name (name)}
        <button type="button" class="ctl chip" aria-pressed={part.keyScale === name} data-value={name}
                onclick={() => onsetkey({ scale: name })}>{name}</button>
      {/each}
    </div>
    <div class="chips" data-testid="key-readers">
      <span class="lbl">Follows it</span>
      {#each readers as s (s.slotId)}
        <button type="button" class="ctl chip reader" aria-pressed={s.fx.followSongKey} data-slot={s.slotId}
                title={s.fx.followSongKey ? 'Follows the song key: click to give it its own' : 'Has its own key: click to follow the song key'}
                onclick={() => onsetslot(s, { followSongKey: !s.fx.followSongKey })}>{labels[s.type] ?? s.type}</button>
      {/each}
    </div>
  </section>

  <section class="block">
    <div class="row">
      <div class="mf"><span class="lbl">This module's key</span>
        <Segmented options={[{ value: true, label: 'the song key' }, { value: false, label: 'its own' }]} value={follows}
                   label="This module's key" testid="key-follows" onchange={(v) => set({ followSongKey: v })} />
      </div>
    </div>
    {#if !follows}
      <Segmented options={ROOTS} value={fx.scaleRoot} label="Own key root" testid="own-key-root"
                 onchange={(v) => set({ scaleRoot: v })} />
      <div class="chips" role="group" aria-label="Own key scale">
        {#each scaleNames as name (name)}
          <button type="button" class="ctl chip" aria-pressed={fx.scaleType === name} onclick={() => set({ scaleType: name })}>{name}</button>
        {/each}
      </div>
    {/if}
    <MiniKeys low={48} high={83} {marks} testid="key-keys" label={`${NOTE_NAMES[root]} ${scale} on the keyboard`} />
    <div class="row">
      <div class="mf"><span class="lbl">Notes outside it</span>
        <Segmented options={FOLDS} value={fold} label="Notes outside the scale" testid="key-fold"
                   onchange={(v) => set(v === 'pass' ? { constrainToScale: false } : { constrainToScale: true, scaleFold: v })} />
      </div>
      <div class="mf"><span class="lbl">Transpose</span>
        <ScrubValue value={fx.transpose} min={-24} max={24} label="Transpose" testid="key-transpose"
                    format={(v) => (v === 0 ? 'none' : `${v > 0 ? '+' : ''}${v}`)} onchange={(v) => set({ transpose: v })} />
      </div>
      <div class="mf"><span class="lbl">By</span>
        <Segmented options={[{ value: 'chromatic', label: 'semitones' }, { value: 'diatonic', label: 'scale steps' }]}
                   value={fx.transposeMode} label="Transpose by" testid="key-by" onchange={(v) => set({ transposeMode: v })} />
      </div>
    </div>
    {#if fx.transposeMode === 'diatonic' && fx.transpose !== 0}
      <span class="sub">In {NOTE_NAMES[root]} {scale}, {fx.transpose > 0 ? '+' : ''}{fx.transpose} step{Math.abs(fx.transpose) === 1 ? '' : 's'} moves each note along the scale, not by a fixed interval.</span>
    {/if}
  </section>
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 12px; width: 100%; }
  .block { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid var(--host-line-soft, #2c353e);
           border-radius: 6px; background: var(--host-surface, #171c21); }
  .head, .row { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .head { align-items: baseline; }
  .mf { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .lbl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: var(--host-text-dim, #7f8b96); }
  .sub { font-size: 11px; color: var(--host-text-faint, #65717c); }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .chip { font: 500 12px var(--host-font, sans-serif); color: var(--host-text-soft, #aab5be); cursor: pointer;
          background: var(--host-surface-raised, #20272e); border: 1px solid var(--host-line, #3b4652); border-radius: 12px; padding: 3px 10px; }
  .chip:hover { border-color: var(--host-accent, #5b9bd5); }
  .chip[aria-pressed='true'] { color: var(--host-accent-strong, #79b9ee); border-color: var(--host-accent, #5b9bd5); background: var(--host-accent-surface, #243746); }
  .chip.reader[aria-pressed='false'] { border-style: dashed; color: var(--host-text-faint, #65717c); }
</style>
