<script>
  /**
   * Chords: one set of chords, and the layers that play them.
   *
   *   The set      — chords you build (root, shape, inversion, voicing, bass) or learn by
   *                  playing. Everything else points at these.
   *   Follow key   — every key plays a shape built on itself (the old chorder), in a range.
   *   Key map      — chosen keys play chosen set chords exactly; they win over following.
   *
   * Each layer has a light: off keeps its settings and stops it playing. What a key will do is
   * drawn with the engine's own rules (chordBuilder.js mirrors MidiFxChain), so clicking a key
   * on either keyboard shows what you will hear.
   */
  import ScrubValue from './ScrubValue.svelte';
  import Segmented from './Segmented.svelte';
  import MiniKeys from './MiniKeys.svelte';
  import PropertyToggle from '../../properties/PropertyToggle.svelte';
  import HostConfirmButton from '../HostConfirmButton.svelte';
  import {
    CHORD_SHAPES, DIATONIC_SHAPES, NOTE_NAMES, HOST_SCALES, shapeLabel, noteLabel,
    buildChord, chordForKey, chordName, chordsOfKey, withoutSetChord, withKeyMapped,
  } from '../../utils/chordBuilder.js';

  let {
    fx, set, partId, slotId = '', scales = [], learn = { armed: false },
    onlearn = () => {}, oncancel = () => {}, onclear = () => {},
  } = $props();

  const MAX_SET = 32;
  const LOW = 36, HIGH = 96;
  const NOTE_CHOICES = Array.from({ length: 128 }, (_, n) => [n, noteLabel(n)]);
  const ROOT_CHOICES = NOTE_CHOICES.slice(24, 97);
  const INVERSIONS = [
    { value: 0, label: 'root' }, { value: 1, label: '1st' }, { value: 2, label: '2nd' }, { value: 3, label: '3rd' },
  ];
  const VOICINGS = [
    { value: 'close', label: 'close', title: 'Notes packed together' },
    { value: 'open', label: 'open', title: 'The second voice up an octave' },
    { value: 'drop 2', label: 'drop 2', title: 'The second-highest voice down an octave' },
    { value: 'wide', label: 'wide', title: 'Lowest down and highest up an octave' },
  ];

  let tab = $state('follow');
  let editing = $state(-1);
  let previewKey = $state(60);
  let mapKeySel = $state(-1);

  const nameOf = (c) => (c?.name ? c.name : chordName(c?.notes));
  const followLit = $derived(fx.chordFollow && fx.chord !== 'off');
  const keyMapLit = $derived(fx.chordKeyMap && fx.keyMap.length > 0);
  const learning = $derived(learn.armed && learn.partId === partId);
  const edited = $derived(fx.chordSet[editing] ?? null);
  const isDiatonic = $derived(fx.chord === 'diatonic' || fx.chord === 'diatonic 7th');
  const keysOf = (index) => fx.keyMap.filter((m) => m.chord === index).map((m) => noteLabel(m.key));

  // --- the set -------------------------------------------------------------------------------
  function writeSet(chordSet, extra = {}) { set({ chordSet, ...extra }); }
  function addChord() {
    if (fx.chordSet.length >= MAX_SET) return;
    const made = { name: '', root: 60, quality: 'triad', inversion: 0, voicing: 'close', bass: false };
    writeSet([...fx.chordSet, { ...made, notes: buildChord(made) }]);
    editing = fx.chordSet.length;
  }
  function fillFromKey() {
    const room = MAX_SET - fx.chordSet.length;
    const chords = chordsOfKey(fx.scaleType, fx.scaleRoot).slice(0, room);
    if (chords.length) writeSet([...fx.chordSet, ...chords]);
  }
  function editChord(fields) {
    const c = { ...edited, ...fields };
    // A learned chord that is given a shape becomes a built one, rooted where it was.
    if (c.root < 0) c.root = c.notes[0] ?? 60;
    if (!c.quality) c.quality = 'triad';
    c.notes = buildChord(c);
    writeSet(fx.chordSet.map((x, i) => (i === editing ? c : x)));
  }
  function renameChord(name) {
    writeSet(fx.chordSet.map((x, i) => (i === editing ? { ...x, name: name.trim().slice(0, 40) } : x)));
  }
  function removeChord(index) {
    set(withoutSetChord(fx, index));
    editing = -1;
  }

  // --- follow --------------------------------------------------------------------------------
  const followPreview = $derived(chordForKey(fx, previewKey));
  const followMarks = $derived(Object.fromEntries(followPreview.notes.map((n) => [n, n === previewKey ? 'root' : 'on'])));

  // --- key map -------------------------------------------------------------------------------
  const mapMarks = $derived(Object.fromEntries(fx.keyMap.map((m) => [m.key, 'mapped'])));
  const mapLabels = $derived(Object.fromEntries(fx.keyMap.map((m) => [m.key, nameOf(fx.chordSet[m.chord])])));
  const mappedHere = $derived(fx.keyMap.find((m) => m.key === mapKeySel)?.chord ?? -1);
  function mapSelected(index) {
    set({ keyMap: withKeyMapped(fx, mapKeySel, index), ...(index >= 0 ? { chordKeyMap: true } : {}) });
  }

  function toggleLayer(which) {
    if (which === 'follow') {
      if (followLit) set({ chordFollow: false });
      else set({ chordFollow: true, chord: fx.chord === 'off' ? 'triad' : fx.chord });
    } else {
      set({ chordKeyMap: !fx.chordKeyMap });
    }
  }
</script>

<div class="editor" data-testid="chords-editor">
  <!-- The set -->
  <section class="block">
    <div class="head">
      <span class="lbl">Chord set</span>
      <span class="sub">{fx.chordSet.length} of {MAX_SET}</span>
      <span class="grow"></span>
      <button type="button" class="ctl pill" data-testid="chord-add" disabled={fx.chordSet.length >= MAX_SET}
              onclick={addChord}>+ chord</button>
      <button type="button" class="ctl pill" data-testid="chord-fill" disabled={!HOST_SCALES[fx.scaleType] || HOST_SCALES[fx.scaleType].length !== 7}
              title={`Add the seven chords of ${NOTE_NAMES[fx.scaleRoot]} ${fx.scaleType}`}
              onclick={fillFromKey}>+ chords of {NOTE_NAMES[fx.scaleRoot]} {fx.scaleType}</button>
    </div>
    {#if fx.chordSet.length === 0}
      <p class="empty">No chords yet. Build one, fill the set from the key, or learn one by playing it (Key map below).</p>
    {:else}
      <div class="set-strip" data-testid="chord-set">
        {#each fx.chordSet as c, i (i)}
          <button type="button" class="ctl set-card" aria-pressed={editing === i} data-index={i}
                  onclick={() => (editing = editing === i ? -1 : i)}>
            <b>{nameOf(c)}</b>
            <small>{c.notes.map((n) => NOTE_NAMES[n % 12]).join(' ')}</small>
            {#if keysOf(i).length}<span class="card-keys">{keysOf(i).join(' ')}</span>{/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if edited}
      <div class="builder" data-testid="chord-builder">
        <div class="row">
          <div class="mf"><span class="lbl">Root</span>
            <ScrubValue value={edited.root >= 0 ? edited.root : (edited.notes[0] ?? 60)} choices={ROOT_CHOICES}
                        label="Chord root" testid="chord-root" onchange={(v) => editChord({ root: v })} />
          </div>
          <div class="mf"><span class="lbl">Name</span>
            <input class="name" type="text" value={edited.name} placeholder={chordName(edited.notes)}
                   aria-label="Chord name" data-testid="chord-name"
                   onfocus={(e) => e.currentTarget.select()}
                   onchange={(e) => renameChord(e.currentTarget.value)} />
          </div>
          <span class="grow"></span>
          <HostConfirmButton title="Remove this chord from the set" identity={JSON.stringify([partId, slotId, editing])}
                             type="button" class="ctl pill danger" onclick={() => removeChord(editing)}>Remove</HostConfirmButton>
        </div>
        <div class="tiles" role="group" aria-label="Chord shape" data-testid="chord-shape">
          {#each CHORD_SHAPES as s (s.id)}
            <button type="button" class="ctl tile" aria-pressed={edited.quality === s.id} data-shape={s.id}
                    title={s.title} onclick={() => editChord({ quality: s.id })}>{s.label}</button>
          {/each}
        </div>
        {#if !edited.quality}<span class="sub">Made from the notes you played — pick a shape to rebuild it on {noteLabel(edited.notes[0] ?? 60)}.</span>{/if}
        <div class="row">
          <div class="mf"><span class="lbl">Inversion</span>
            <Segmented options={INVERSIONS} value={edited.inversion} label="Inversion"
                       onchange={(v) => editChord({ inversion: v })} />
          </div>
          <div class="mf"><span class="lbl">Voicing</span>
            <Segmented options={VOICINGS} value={edited.voicing} label="Voicing"
                       onchange={(v) => editChord({ voicing: v })} />
          </div>
          <div class="mf"><span class="lbl">Bass</span>
            <PropertyToggle compact label="Root below" value={edited.bass}
                            onchange={(on) => editChord({ bass: on })} />
          </div>
        </div>
        <MiniKeys low={LOW} high={HIGH} testid="chord-builder-keys" label="The chord's notes"
                  marks={Object.fromEntries(edited.notes.map((n) => [n, 'on']))} />
      </div>
    {/if}
  </section>

  <!-- The layers -->
  <section class="block">
    <div class="layer-tabs" role="tablist" aria-label="Layers">
      <div class="layer" class:active={tab === 'follow'}>
        <button type="button" class="ctl light" class:lit={followLit} aria-pressed={followLit}
                aria-label="Follow key on or off" data-testid="layer-light-follow"
                onclick={() => toggleLayer('follow')}></button>
        <button type="button" role="tab" aria-selected={tab === 'follow'} class="ctl tab-name"
                data-testid="layer-tab-follow" onclick={() => (tab = 'follow')}>
          Follow key <small>{followLit ? shapeLabel(fx.chord) : 'off'}</small></button>
      </div>
      <div class="layer" class:active={tab === 'keys'}>
        <button type="button" class="ctl light" class:lit={keyMapLit} aria-pressed={keyMapLit}
                aria-label="Key map on or off" data-testid="layer-light-keys"
                onclick={() => toggleLayer('keys')}></button>
        <button type="button" role="tab" aria-selected={tab === 'keys'} class="ctl tab-name"
                data-testid="layer-tab-keys" onclick={() => (tab = 'keys')}>
          Key map <small>{fx.keyMap.length} {fx.keyMap.length === 1 ? 'key' : 'keys'}{fx.chordKeyMap ? '' : ' · off'}</small></button>
      </div>
    </div>

    <div class="panel" role="tabpanel" style:display={tab === 'follow' ? 'flex' : 'none'} data-testid="layer-follow">
      <span class="sub">Every key plays this shape built on itself.</span>
      <div class="tiles" role="group" aria-label="Follow shape" data-testid="follow-shape">
        {#each [...CHORD_SHAPES, ...DIATONIC_SHAPES] as s (s.id)}
          <button type="button" class="ctl tile" class:wide={s.id.startsWith('diatonic')}
                  aria-pressed={followLit && fx.chord === s.id} data-shape={s.id} title={s.title}
                  onclick={() => set({ chord: s.id, chordFollow: true })}>{s.label}</button>
        {/each}
      </div>
      {#if isDiatonic}
        <div class="row">
          <div class="mf"><span class="lbl">Key</span>
            <ScrubValue value={fx.scaleRoot} choices={NOTE_NAMES.map((n, i) => [i, n])} label="Key root"
                        testid="follow-key-root" onchange={(v) => set({ scaleRoot: v })} />
          </div>
          <label class="mf"><span class="lbl">Scale</span>
            <select value={fx.scaleType} onchange={(e) => set({ scaleType: e.currentTarget.value })}>
              {#each scales as name (name)}<option value={name}>{name}</option>{/each}
            </select>
          </label>
        </div>
      {/if}
      <div class="row">
        <div class="mf"><span class="lbl">Inversion</span>
          <Segmented options={INVERSIONS} value={fx.chordInversion} label="Follow inversion" testid="follow-inversion"
                     onchange={(v) => set({ chordInversion: v })} />
        </div>
        <div class="mf"><span class="lbl">Voicing</span>
          <Segmented options={VOICINGS} value={fx.chordVoicing} label="Follow voicing" testid="follow-voicing"
                     onchange={(v) => set({ chordVoicing: v })} />
        </div>
        <div class="mf"><span class="lbl">Motion</span>
          <PropertyToggle compact label="Voice leading" value={fx.chordVoiceLeading}
                          title="Choose the nearest inversion and octave to the previous chord"
                          onchange={(on) => set({ chordVoiceLeading: on })} />
        </div>
        <div class="mf"><span class="lbl">Bass</span>
          <PropertyToggle compact label="Root below" value={fx.chordBass}
                          onchange={(on) => set({ chordBass: on })} />
        </div>
      </div>
      <div class="row">
        <div class="mf"><span class="lbl">Lowest key</span>
          <ScrubValue value={fx.chordFollowLow} choices={NOTE_CHOICES} label="Follow from" testid="follow-low"
                      onchange={(v) => set({ chordFollowLow: Math.min(v, fx.chordFollowHigh) })} />
        </div>
        <div class="mf"><span class="lbl">Highest key</span>
          <ScrubValue value={fx.chordFollowHigh} choices={NOTE_CHOICES} label="Follow to" testid="follow-high"
                      onchange={(v) => set({ chordFollowHigh: Math.max(v, fx.chordFollowLow) })} />
        </div>
        <div class="mf"><span class="lbl">Top voice</span>
          <ScrubValue value={fx.chordTopAccent} min={0} max={40} label="Top voice accent" testid="chord-accent"
                      format={(v) => (v === 0 ? 'as played' : `+${v}`)}
                      title="Play the highest note of every chord this much harder, so the melody line sings"
                      onchange={(v) => set({ chordTopAccent: v })} />
        </div>
      </div>
      <MiniKeys low={LOW} high={HIGH} testid="follow-keys" label="Click a key to hear what it plays"
                marks={followMarks} range={[fx.chordFollowLow, fx.chordFollowHigh]} selected={previewKey}
                onkey={(n) => (previewKey = n)} />
      <span class="preview" data-testid="follow-preview">
        {noteLabel(previewKey)} plays
        <b>{followPreview.notes.length > 1 ? chordName(followPreview.notes) : 'itself'}</b>
        {#if followPreview.source === 'map'}(from the key map){:else if followPreview.notes.length > 1}({followPreview.notes.map(noteLabel).join(' ')}){:else if fx.chordFollow && fx.chord !== 'off'}— outside the range{/if}
      </span>
    </div>

    <div class="panel" role="tabpanel" style:display={tab === 'keys' ? 'flex' : 'none'} data-testid="layer-keys">
      <span class="sub">Chosen keys play a chord from the set, exactly. They win over Follow key.</span>
      <div class="row">
        {#if learning}
          <button type="button" class="ctl pill learn armed" data-testid="chord-learn-armed" onclick={oncancel}>
            {learn.stage === 'chord' ? `now play the chord for ${noteLabel(learn.key)}…` : 'tap the key that should play it…'}</button>
        {:else}
          <button type="button" class="ctl pill learn" data-testid="chord-learn"
                  title="Tap the target key, then play the chord: it joins the set and the key plays it"
                  onclick={onlearn}>● learn by playing</button>
        {/if}
        <span class="sub">or click a key below and pick a chord</span>
      </div>
      <MiniKeys low={LOW} high={HIGH} testid="keymap-keys" label="Mapped keys"
                marks={mapMarks} labels={mapLabels} selected={mapKeySel} onkey={(n) => (mapKeySel = n)} />
      {#if mapKeySel >= 0}
        <div class="row assign" data-testid="keymap-assign">
          <span class="lbl">{noteLabel(mapKeySel)} plays</span>
          {#each fx.chordSet as c, i (i)}
            <button type="button" class="ctl tile" aria-pressed={mappedHere === i} data-index={i}
                    onclick={() => mapSelected(i)}>{nameOf(c)}</button>
          {/each}
          <button type="button" class="ctl tile" aria-pressed={mappedHere < 0} onclick={() => mapSelected(-1)}>itself</button>
          {#if fx.chordSet.length === 0}<span class="sub">— the set is empty; add a chord above first</span>{/if}
        </div>
      {/if}
      {#if fx.keyMap.length}
        <div class="row" data-testid="key-chords">
          {#each fx.keyMap as m (m.key)}
            <span class="key-badge">{noteLabel(m.key)} → {nameOf(fx.chordSet[m.chord])}
              <HostConfirmButton title="Forget this key's chord" identity={JSON.stringify([partId, slotId, m.key])}
                                 type="button" class="ctl x" onclick={() => onclear(m.key)}>×</HostConfirmButton>
            </span>
          {/each}
        </div>
      {/if}
    </div>
  </section>
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 12px; width: 100%; }
  .block { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid var(--host-line-soft, #2c353e);
           border-radius: 6px; background: var(--host-surface, #171c21); }
  .head, .row { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .head { align-items: center; }
  .grow { flex: 1; }
  .mf { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .lbl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: var(--host-text-dim, #7f8b96); }
  .sub, .empty { font-size: 11px; color: var(--host-text-faint, #65717c); margin: 0; }
  .pill { font: 500 12px var(--host-font, sans-serif); color: var(--host-text-soft, #aab5be); background: var(--host-surface-raised, #20272e);
          border: 1px solid var(--host-line, #3b4652); border-radius: 12px; padding: 3px 10px; cursor: pointer; }
  .pill:hover:not(:disabled) { border-color: var(--host-accent, #5b9bd5); }
  .pill:disabled { opacity: .4; cursor: default; }
  :global(.pill.danger) { color: var(--host-danger, #e06c6c); }
  .learn.armed { color: #d9a13c; border-color: #d9a13c; animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .55; } }

  .set-strip { display: flex; gap: 6px; flex-wrap: wrap; }
  .set-card { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; min-width: 64px; padding: 5px 9px;
              background: var(--host-field, #12171b); border: 1px solid var(--host-line, #3b4652); border-radius: 5px; cursor: pointer;
              color: var(--host-text, #d9e0e6); text-align: left; }
  .set-card b { font: 600 13px var(--host-font, sans-serif); }
  .set-card small { font: 10px var(--host-font-mono, monospace); color: var(--host-text-dim, #7f8b96); }
  .card-keys { font: 600 9px var(--host-font-mono, monospace); color: #ff9408; }
  .set-card[aria-pressed='true'] { border-color: var(--host-accent, #5b9bd5); box-shadow: inset 0 0 0 1px var(--host-accent, #5b9bd5);
                                   background: var(--host-accent-surface, #243746); }
  .builder { display: flex; flex-direction: column; gap: 8px; padding: 8px; border-radius: 5px; background: var(--host-field, #12171b); }
  .name { width: 120px; font: 500 12px var(--host-font, sans-serif); padding: 4px 7px; color: var(--host-text, #d9e0e6);
          background: var(--host-bg-deep, #101418); border: 1px solid var(--host-line, #3b4652); border-radius: 3px; }

  .tiles { display: flex; gap: 4px; flex-wrap: wrap; }
  .tile { min-width: 42px; padding: 5px 8px; font: 600 12px var(--host-font, sans-serif); color: var(--host-text-soft, #aab5be);
          background: var(--host-surface-raised, #20272e); border: 1px solid var(--host-line-soft, #2c353e); border-radius: 4px; cursor: pointer; }
  .tile.wide { min-width: 64px; }
  .tile:hover { border-color: var(--host-line-strong, #526170); color: var(--host-text, #d9e0e6); }
  .tile[aria-pressed='true'] { background: var(--host-accent-surface, #243746); color: var(--host-accent-strong, #79b9ee);
                               border-color: var(--host-accent, #5b9bd5); }

  .layer-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--host-line-soft, #2c353e); }
  .layer { display: flex; align-items: center; gap: 6px; padding: 4px 10px 6px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .layer.active { border-bottom-color: var(--host-accent, #5b9bd5); }
  .layer .light { flex: none; box-sizing: border-box; width: 11px; height: 11px; min-width: 0; min-height: 0; padding: 0;
                  border-radius: 50%; border: 1px solid var(--host-line-strong, #526170);
                  background: var(--host-bg-deep, #101418); box-shadow: none; cursor: pointer; }
  .layer .light.lit { background: var(--host-active, #58a879); border-color: var(--host-active, #58a879); box-shadow: 0 0 6px var(--host-active, #58a879); }
  .layer .tab-name { background: none; border: 0; box-shadow: none; min-height: 0; padding: 0; cursor: pointer; font: 600 12px var(--host-font, sans-serif); color: var(--host-text-soft, #aab5be); }
  .layer.active .tab-name { color: var(--host-text, #d9e0e6); }
  .tab-name small { font-weight: 400; color: var(--host-text-dim, #7f8b96); margin-left: 4px; }
  .panel { flex-direction: column; gap: 10px; padding-top: 4px; }
  .preview { font-size: 12px; color: var(--host-text-soft, #aab5be); }
  .preview b { color: var(--host-accent-strong, #79b9ee); }
  .assign { align-items: center; }
  .key-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: #ffb45a;
               border: 1px solid #5a4020; border-radius: 10px; padding: 1px 4px 1px 8px; }
  :global(.key-badge .x) { background: none; border: 0; color: var(--host-text-dim, #7f8b96); cursor: pointer; padding: 0 3px; }
  select { font: 12px var(--host-font, sans-serif); color: var(--host-text, #d9e0e6); background: var(--host-field, #12171b);
           border: 1px solid var(--host-line, #3b4652); border-radius: 3px; padding: 3px 5px; }
</style>
