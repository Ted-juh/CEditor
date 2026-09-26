<script>
  /**
   * Chords: one set of chords, and the layers that play them.
   *
   *   The set      — chords you build (root, shape, inversion, voicing, bass) or learn by
   *                  playing. Everything else points at these.
   *   Follow key   — every key plays a shape built on itself (the old chorder), in a range.
   *   Key map      — chosen keys play chosen set chords exactly; they win over everything.
   *   Pads         — 8 pads x 4 banks, each a set chord: here, or on the CTRL49's own pads.
   *   Progression  — keys in a range play the set's chords in an order, stepping on each
   *                  press or with the sustain pedal. It wins over following.
   *
   * Each layer has a light: off keeps its settings and stops it playing. What a key will do is
   * drawn with the engine's own rules (chordBuilder.js mirrors MidiFxChain), so clicking a key
   * on either keyboard shows what you will hear.
   */
  import ScrubValue from '../../components/controls/ScrubValue.svelte';
  import Segmented from '../../components/controls/Segmented.svelte';
  import MiniKeys from '../../components/controls/MiniKeys.svelte';
  import PropertyToggle from '../../properties/PropertyToggle.svelte';
  import HostConfirmButton from '../HostConfirmButton.svelte';
  import {
    CHORD_SHAPES, DIATONIC_SHAPES, NOTE_NAMES, HOST_SCALES, shapeLabel, noteLabel,
    buildChord, chordForKey, chordName, chordsOfKey, withoutSetChord, withKeyMapped,
  } from '../../utils/chordBuilder.js';

  let {
    fx: ownFx, songKey = null, set, partId, slotId = '', scales = [], learn = { armed: false },
    onlearn = () => {}, oncancel = () => {}, onclear = () => {},
    live = { chord: -1, step: 0, pads: 0 }, onpad = () => {}, onstep = () => {},
  } = $props();

  // Following the song key, the module plays in the part's key; everything below reads that.
  const fx = $derived(ownFx.followSongKey && songKey
    ? { ...ownFx, scaleType: songKey.scale, scaleRoot: songKey.root } : ownFx);
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
  let bank = $state(0);
  let padSel = $state(-1);

  const BANKS = ['A', 'B', 'C', 'D'].map((label, value) => ({ value, label, title: `Pad bank ${label}` }));
  const ADVANCE = [
    { value: 'key', label: 'each key press', title: 'Every key in the range plays the next chord' },
    { value: 'pedal', label: 'sustain pedal', title: 'The pedal steps to the next chord; keys in the range play the current one' },
  ];

  const nameOf = (c) => (c?.name ? c.name : chordName(c?.notes));
  const followLit = $derived(fx.chordFollow && fx.chord !== 'off');
  const keyMapLit = $derived(fx.chordKeyMap && fx.keyMap.length > 0);
  const learning = $derived(learn.armed && learn.partId === partId);
  const edited = $derived(fx.chordSet[editing] ?? null);
  const isDiatonic = $derived(fx.chord === 'diatonic' || fx.chord === 'diatonic 7th');
  const keysOf = (index) => fx.keyMap.filter((m) => m.chord === index).map((m) => noteLabel(m.key));
  const padsLit = $derived(fx.chordPads && fx.padMap.some((p) => p >= 0));
  const progLit = $derived(fx.chordProgression && fx.progression.length > 0);
  const layers = $derived([
    { id: 'follow', name: 'Follow key', lit: followLit, note: followLit ? shapeLabel(fx.chord) : 'off' },
    { id: 'keys', name: 'Key map', lit: keyMapLit,
      note: `${fx.keyMap.length} ${fx.keyMap.length === 1 ? 'key' : 'keys'}${fx.chordKeyMap ? '' : ' · off'}` },
    { id: 'pads', name: 'Pads', lit: padsLit,
      note: `${fx.padMap.filter((p) => p >= 0).length} pads${fx.chordPads ? '' : ' · off'}` },
    { id: 'prog', name: 'Progression', lit: progLit,
      note: `${fx.progression.length} ${fx.progression.length === 1 ? 'step' : 'steps'}${fx.chordProgression ? '' : ' · off'}` },
  ]);
  // A chord's colour is its root around the circle of fifths: the CTRL49 pads use the same rule.
  const chordHue = (c) => ((((c.root >= 0 ? c.root : (c.notes[0] ?? 0)) % 12) * 7) % 12) * 30;

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

  // --- pads --------------------------------------------------------------------------------
  function assignPad(index) {
    const padMap = [...fx.padMap];
    padMap[padSel] = index;
    set({ padMap, ...(index >= 0 ? { chordPads: true } : {}) });
  }
  function fillBank() {
    const padMap = [...fx.padMap];
    for (let i = 0; i < 8; i += 1) padMap[bank * 8 + i] = i < fx.chordSet.length ? i : -1;
    set({ padMap, chordPads: true });
  }
  function padDown(e, pad, playable) {
    padSel = pad;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (playable) onpad(pad, 100);
  }

  // --- progression ---------------------------------------------------------------------------
  const addStep = (index) => {
    if (fx.progression.length < 32) set({ progression: [...fx.progression, index], chordProgression: true });
  };
  const removeStep = (at) => set({ progression: fx.progression.filter((_, i) => i !== at) });
  function moveStep(at, by) {
    const to = at + by;
    if (to < 0 || to >= fx.progression.length) return;
    const progression = [...fx.progression];
    [progression[at], progression[to]] = [progression[to], progression[at]];
    set({ progression });
  }

  function toggleLayer(which) {
    if (which === 'follow') {
      if (followLit) set({ chordFollow: false });
      else set({ chordFollow: true, chord: fx.chord === 'off' ? 'triad' : fx.chord });
    } else if (which === 'keys') {
      set({ chordKeyMap: !fx.chordKeyMap });
    } else if (which === 'pads') {
      set({ chordPads: !fx.chordPads });
    } else {
      set({ chordProgression: !fx.chordProgression });
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
      {#each layers as layer (layer.id)}
        <div class="layer" class:active={tab === layer.id}>
          <button type="button" class="ctl light" class:lit={layer.lit} aria-pressed={layer.lit}
                  aria-label={`${layer.name} on or off`} data-testid={`layer-light-${layer.id}`}
                  onclick={() => toggleLayer(layer.id)}></button>
          <button type="button" role="tab" aria-selected={tab === layer.id} class="ctl tab-name"
                  data-testid={`layer-tab-${layer.id}`} onclick={() => (tab = layer.id)}>
            {layer.name} <small>{layer.note}</small></button>
        </div>
      {/each}
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
      {#if isDiatonic && ownFx.followSongKey}
        <span class="sub" data-testid="chords-song-key">In {NOTE_NAMES[fx.scaleRoot]} {fx.scaleType}, the part's song key.
          <button type="button" class="ctl link" onclick={() => set({ followSongKey: false })}>use a key of its own</button></span>
      {:else if isDiatonic}
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
        {#if followPreview.source === 'map'}(from the key map){:else if followPreview.source === 'progression'}(from the progression){:else if followPreview.notes.length > 1}({followPreview.notes.map(noteLabel).join(' ')}){:else if fx.chordFollow && fx.chord !== 'off'}— outside the range{/if}
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
    <div class="panel" role="tabpanel" style:display={tab === 'pads' ? 'flex' : 'none'} data-testid="layer-pads">
      <span class="sub">Eight pads in four banks, each playing a chord from the set. Press a pad to hear it.
        On the CTRL49, any pad with nothing assigned on a control page plays these, in the keyboard's own bank.</span>
      <div class="row">
        <div class="mf"><span class="lbl">Bank</span>
          <Segmented options={BANKS} value={bank} label="Pad bank" testid="pad-bank"
                     onchange={(v) => { bank = v; padSel = -1; }} />
        </div>
        <button type="button" class="ctl pill" data-testid="pad-fill" disabled={fx.chordSet.length === 0}
                onclick={fillBank}>fill bank {BANKS[bank].label} with the set</button>
      </div>
      <div class="pads" data-testid="pad-grid">
        {#each Array(8) as _, i (i)}
          {@const pad = bank * 8 + i}
          {@const chord = fx.chordSet[fx.padMap[pad]] ?? null}
          <button type="button" class="ctl pad" class:sel={padSel === pad} class:lit={((live.pads >>> pad) & 1) === 1}
                  class:empty={!chord} data-pad={pad} style:--hue={chord ? chordHue(chord) : 0}
                  onpointerdown={(e) => padDown(e, pad, !!chord)}
                  onpointerup={() => { if (chord) onpad(pad, 0); }}
                  onpointercancel={() => { if (chord) onpad(pad, 0); }}>
            <span class="pad-num">{BANKS[bank].label}{i + 1}</span>
            <b>{chord ? nameOf(chord) : '—'}</b>
          </button>
        {/each}
      </div>
      {#if padSel >= 0}
        <div class="row assign" data-testid="pad-assign">
          <span class="lbl">{BANKS[Math.floor(padSel / 8)].label}{(padSel % 8) + 1} plays</span>
          {#each fx.chordSet as c, i (i)}
            <button type="button" class="ctl tile" aria-pressed={fx.padMap[padSel] === i} data-index={i}
                    onclick={() => assignPad(i)}>{nameOf(c)}</button>
          {/each}
          <button type="button" class="ctl tile" aria-pressed={fx.padMap[padSel] < 0} onclick={() => assignPad(-1)}>nothing</button>
          {#if fx.chordSet.length === 0}<span class="sub">— the set is empty; add a chord above first</span>{/if}
        </div>
      {/if}
    </div>

    <div class="panel" role="tabpanel" style:display={tab === 'prog' ? 'flex' : 'none'} data-testid="layer-prog">
      <span class="sub">Keys in the range play these chords in order: one song from one finger. The highlighted step plays next.</span>
      <div class="steps" data-testid="prog-steps">
        {#each fx.progression as s, i (i)}
          <span class="step" class:next={live.step === i} data-step={i}>
            <small>{i + 1}</small><b>{nameOf(fx.chordSet[s])}</b>
            <button type="button" class="ctl x" title="Earlier" onclick={() => moveStep(i, -1)}>‹</button>
            <button type="button" class="ctl x" title="Later" onclick={() => moveStep(i, 1)}>›</button>
            <button type="button" class="ctl x" title="Remove this step" onclick={() => removeStep(i)}>×</button>
          </span>
        {/each}
        {#if fx.progression.length === 0}<span class="sub">No steps yet. Add chords from the set below.</span>{/if}
      </div>
      <div class="row assign" data-testid="prog-add">
        <span class="lbl">Add</span>
        {#each fx.chordSet as c, i (i)}
          <button type="button" class="ctl tile" data-index={i} onclick={() => addStep(i)}>+ {nameOf(c)}</button>
        {/each}
      </div>
      <div class="row">
        <div class="mf"><span class="lbl">Next chord on</span>
          <Segmented options={ADVANCE} value={fx.progressionAdvance} label="Progression advance" testid="prog-advance"
                     onchange={(v) => set({ progressionAdvance: v })} />
        </div>
        <div class="mf"><span class="lbl">Lowest key</span>
          <ScrubValue value={fx.progressionLow} choices={NOTE_CHOICES} label="Progression from" testid="prog-low"
                      onchange={(v) => set({ progressionLow: Math.min(v, fx.progressionHigh) })} />
        </div>
        <div class="mf"><span class="lbl">Highest key</span>
          <ScrubValue value={fx.progressionHigh} choices={NOTE_CHOICES} label="Progression to" testid="prog-high"
                      onchange={(v) => set({ progressionHigh: Math.max(v, fx.progressionLow) })} />
        </div>
        <div class="mf"><span class="lbl">Step</span>
          <div class="step-buttons">
            <button type="button" class="ctl pill" data-testid="prog-back" onclick={() => onstep({ delta: -1 })}>◀</button>
            <button type="button" class="ctl pill" data-testid="prog-restart" onclick={() => onstep({ step: 0 })}>restart</button>
            <button type="button" class="ctl pill" data-testid="prog-next" onclick={() => onstep({ delta: 1 })}>▶</button>
          </div>
        </div>
      </div>
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
  .pads { display: grid; grid-template-columns: repeat(4, minmax(0, 110px)); gap: 8px; }
  .pad { position: relative; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-start;
         aspect-ratio: 1.4; padding: 7px 9px; border-radius: 7px; cursor: pointer; text-align: left;
         color: var(--host-text, #d9e0e6); background: linear-gradient(160deg, #232b33, #171c21);
         border: 1px solid hsl(var(--hue) 60% 40%); box-shadow: inset 0 -4px 0 hsl(var(--hue) 80% 45% / .8); touch-action: none; }
  .pad.empty { border-color: var(--host-line-soft, #2c353e); box-shadow: none; color: var(--host-text-faint, #65717c); }
  .pad b { font: 700 16px var(--host-font, sans-serif); }
  .pad-num { font: 600 10px var(--host-font-mono, monospace); color: var(--host-text-dim, #7f8b96); }
  .pad.sel { outline: 2px solid var(--host-accent-strong, #79b9ee); outline-offset: 1px; }
  .pad.lit { background: hsl(var(--hue) 70% 30%); box-shadow: 0 0 18px -4px hsl(var(--hue) 90% 55%), inset 0 -4px 0 hsl(var(--hue) 90% 55%); }
  .steps { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .step { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 8px; border-radius: 5px;
          border: 1px solid var(--host-line, #3b4652); background: var(--host-field, #12171b); }
  .step small { font: 10px var(--host-font-mono, monospace); color: var(--host-text-dim, #7f8b96); }
  .step b { font: 600 13px var(--host-font, sans-serif); }
  .step.next { border-color: var(--host-active, #58a879); box-shadow: 0 0 0 1px var(--host-active, #58a879); }
  .step .x { background: none; border: 0; color: var(--host-text-dim, #7f8b96); cursor: pointer; padding: 0 3px; font-size: 13px; }
  .step .x:hover { color: var(--host-text, #d9e0e6); }
  .step-buttons { display: flex; gap: 4px; }
  .link { background: none; border: 0; padding: 0; color: var(--host-accent-strong, #79b9ee); font-size: 11px; cursor: pointer; text-decoration: underline; }
  select { font: 12px var(--host-font, sans-serif); color: var(--host-text, #d9e0e6); background: var(--host-field, #12171b);
           border: 1px solid var(--host-line, #3b4652); border-radius: 3px; padding: 3px 5px; }
</style>
