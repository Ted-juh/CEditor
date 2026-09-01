<script>
  /**
   * MidiChainPanel.svelte — a part's MIDI inserts, in the order the player put them.
   *
   * What this replaces was welded into the part view: a fixed row of note-shaping fields
   * and exactly one arpeggiator, in an order the code had chosen. Here the chain is a list
   * you compose — add a module, drag it earlier, bypass it, keep two of them — which is why
   * "chorder into arp" and "arp into chorder" are both reachable, and they are genuinely
   * different instruments.
   *
   * Each slot opens its own editor, and the editors are the ones that already existed: the
   * arpeggiator keeps its note and velocity grids, the chorder keeps its learn flow. What
   * changed is who they belong to — a slot, not the part — so a part can carry two
   * arpeggiators drawing two different patterns.
   */
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import {
    hostState, hostArpStep, hostChordLearn,
    midiSlotTypes, midiSlotLabels,
    addMidiSlot, removeMidiSlot, moveMidiSlot, setMidiSlotBypassed, setMidiSlotOptions,
    learnKeyChord, cancelKeyChordLearn, clearKeyChord,
  } from '../stores/instrumentHost.js';

  let { part } = $props();

  let chain = $derived(part?.midiChain ?? []);
  // The scale names the build understands come from the native side, like everywhere else.
  let scales = $derived($hostState.performance.scales);
  let openSlotId = $state('');
  let openSlot = $derived(chain.find((slot) => slot.slotId === openSlotId) ?? null);

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const keyName = (n) => `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;

  const set = (slot, fields) => setMidiSlotOptions(part.partId, slot.slotId, fields);

  /** What a slot is doing, in a few words, so a collapsed chain still reads. */
  function summary(slot) {
    if (slot.type === 'arp')
      return slot.arp.enabled
        ? `${slot.arp.mode} · ${slot.arp.stepsPerBeat}/beat · ${slot.arp.octaves} oct`
        : 'off';
    if (slot.type === 'transpose')
      return slot.fx.transpose === 0 ? 'no change' : `${slot.fx.transpose > 0 ? '+' : ''}${slot.fx.transpose} semitones`;
    if (slot.type === 'scale')
      return slot.fx.constrainToScale ? `${NOTE_NAMES[slot.fx.scaleRoot]} ${slot.fx.scaleType}` : 'off';
    if (slot.type === 'chord')
      return slot.fx.chord === 'off' ? 'off'
        : slot.fx.chord === 'custom keys' ? `custom · ${slot.fx.keyChords.length} keys`
        : slot.fx.chord;
    if (slot.type === 'velocity')
      return slot.fx.velocityFixed > 0 ? `fixed ${slot.fx.velocityFixed}` : `× ${slot.fx.velocityScale}`;
    return 'transpose · scale · chord · velocity';
  }

  // --- the arp grids, per slot ---------------------------------------------------------
  const NOTE_ROWS_DEGREE = 8;
  const NOTE_ROWS_FREE = 25;
  let noteRows = $derived(openSlot?.arp.patternSemitones ? NOTE_ROWS_FREE : NOTE_ROWS_DEGREE);

  let velDraft = $state(null);
  let velEl = $state(null);
  let velDragging = $state(false);
  let velPattern = $derived(velDraft ?? openSlot?.arp.velocityPattern ?? []);

  let noteDraft = $state(null);
  let noteEl = $state(null);
  let noteDragging = $state(false);
  let notePainting = $state(false);
  let notePattern = $derived(noteDraft ?? openSlot?.arp.degreePattern ?? []);

  function velCell(event) {
    const rect = velEl.getBoundingClientRect();
    const count = Math.max(1, velPattern.length || 16);
    const step = Math.max(0, Math.min(count - 1,
      Math.floor(((event.clientX - rect.left) / rect.width) * count)));
    // The bottom band snaps to a rest: nobody can hit a one-pixel floor.
    const raw = Math.max(0, Math.min(127,
      Math.round((1 - (event.clientY - rect.top) / rect.height) * 127)));
    return { step, velocity: raw < 7 ? 0 : raw };
  }

  function velDown(event) {
    if (!openSlot) return;
    event.preventDefault();
    velDraft = velPattern.length > 0 ? [...velPattern] : Array.from({ length: 16 }, () => 100);
    velDragging = true;
    velEl.setPointerCapture?.(event.pointerId);
    const { step, velocity } = velCell(event);
    velDraft[step] = velocity;
  }
  function velMove(event) {
    if (!velDragging || velDraft === null) return;
    const { step, velocity } = velCell(event);
    velDraft[step] = velocity;
  }
  function velUp() {
    if (!velDragging) return;
    velDragging = false;
    if (velDraft !== null && openSlot) set(openSlot, { velocityPattern: [...velDraft] });
    velDraft = null;
  }

  function noteCell(event) {
    const rect = noteEl.getBoundingClientRect();
    const count = Math.max(1, notePattern.length || 16);
    const step = Math.max(0, Math.min(count - 1,
      Math.floor(((event.clientX - rect.left) / rect.width) * count)));
    const row = Math.max(0, Math.min(noteRows - 1,
      noteRows - 1 - Math.floor(((event.clientY - rect.top) / rect.height) * noteRows)));
    return { step, row };
  }

  function noteDown(event) {
    if (!openSlot) return;
    event.preventDefault();
    noteDraft = notePattern.length > 0 ? [...notePattern] : Array.from({ length: 16 }, () => -1);
    noteDragging = true;
    noteEl.setPointerCapture?.(event.pointerId);
    const { step, row } = noteCell(event);
    if (noteDraft[step] === row) { noteDraft[step] = -1; notePainting = false; }
    else { noteDraft[step] = row; notePainting = true; }
  }
  function noteMove(event) {
    if (!noteDragging || !notePainting || noteDraft === null) return;
    const { step, row } = noteCell(event);
    noteDraft[step] = row;
  }
  function noteUp() {
    if (!noteDragging) return;
    noteDragging = false;
    if (noteDraft !== null && openSlot) set(openSlot, { degreePattern: [...noteDraft] });
    noteDraft = null;
  }

  function resizePatterns(slot, length) {
    const degrees = slot.arp.degreePattern;
    const velocities = slot.arp.velocityPattern;
    set(slot, {
      degreePattern: Array.from({ length }, (_, i) => degrees[i] ?? -1),
      velocityPattern: velocities.length > 0
        ? Array.from({ length }, (_, i) => velocities[i] ?? 100)
        : [],
    });
  }
</script>

<div class="midi-chain" data-testid="host-midi-chain">
  <div class="fx-head">
    <strong>MIDI chain</strong>
    <select value="" aria-label="Add a MIDI module"
            onchange={(e) => { if (e.currentTarget.value) addMidiSlot(part.partId, e.currentTarget.value);
                               e.currentTarget.value = ''; }}>
      <option value="" disabled>+ Add module…</option>
      {#each midiSlotTypes as type (type)}
        <option value={type}>{midiSlotLabels[type]}</option>
      {/each}
    </select>
  </div>

  {#if chain.length === 0}
    <div class="empty-hint">No MIDI modules — notes reach the instrument untouched.</div>
  {/if}

  {#each chain as slot, index (slot.slotId)}
    <div class="slot" class:bypassed={slot.bypassed} class:open={openSlotId === slot.slotId}>
      <div class="slot-head">
        <span class="slot-index">{index + 1}</span>
        <button type="button" class="ghost slot-name"
                onclick={() => (openSlotId = openSlotId === slot.slotId ? '' : slot.slotId)}>
          {midiSlotLabels[slot.type]}
          <span class="slot-summary">{summary(slot)}</span>
        </button>
        <button type="button" class="ghost" title="Earlier in the chain" disabled={index === 0}
                onclick={() => moveMidiSlot(part.partId, slot.slotId, index - 1)}>▲</button>
        <button type="button" class="ghost" title="Later in the chain" disabled={index === chain.length - 1}
                onclick={() => moveMidiSlot(part.partId, slot.slotId, index + 1)}>▼</button>
        <PropertyToggle compact label="Byp" value={slot.bypassed} ariaLabel={`Bypass ${midiSlotLabels[slot.type]}`}
                        onchange={(on) => setMidiSlotBypassed(part.partId, slot.slotId, on)} />
        <button type="button" class="ghost danger" title="Remove this module"
                onclick={() => removeMidiSlot(part.partId, slot.slotId)}>×</button>
      </div>

      {#if openSlotId === slot.slotId}
        <div class="slot-body">
          {#if slot.type === 'transpose' || slot.type === 'fx'}
            <label class="mini-field">Semitones
              <input type="number" min="-48" max="48" value={slot.fx.transpose}
                     onchange={(e) => set(slot, { transpose: Number(e.currentTarget.value) })} />
            </label>
          {/if}

          {#if slot.type === 'scale' || slot.type === 'fx'}
            <label class="mini-field">Scale
              <select value={slot.fx.constrainToScale ? slot.fx.scaleType : ''}
                      onchange={(e) => set(slot, e.currentTarget.value
                                             ? { constrainToScale: true, scaleType: e.currentTarget.value }
                                             : { constrainToScale: false })}>
                <option value="">off</option>
                {#each scales as name (name)}
                  <option value={name}>{name}</option>
                {/each}
              </select>
            </label>
            <label class="mini-field">Root
              <select value={slot.fx.scaleRoot}
                      onchange={(e) => set(slot, { scaleRoot: Number(e.currentTarget.value) })}>
                {#each NOTE_NAMES as name, i (name)}
                  <option value={i}>{name}</option>
                {/each}
              </select>
            </label>
          {/if}

          {#if slot.type === 'chord' || slot.type === 'fx'}
            <label class="mini-field">Chord
              <select value={slot.fx.chord}
                      onchange={(e) => set(slot, { chord: e.currentTarget.value })}>
                {#each ['off', 'power fifth', 'triad', 'triad (1st inv)', 'seventh', 'octave', 'diatonic', 'diatonic 7th', 'custom keys'] as type (type)}
                  <option value={type}>{type}</option>
                {/each}
              </select>
            </label>
            {#if slot.fx.chord === 'diatonic' || slot.fx.chord === 'diatonic 7th'}
              <span class="hint">plays the chord OF each scale degree — set this module's scale for real harmony</span>
            {/if}
            {#if slot.fx.chord === 'custom keys'}
              <div class="key-chords" data-testid="key-chords">
                {#if $hostChordLearn.armed && $hostChordLearn.partId === part.partId}
                  <button type="button" class="ghost learn armed" data-testid="chord-learn-armed"
                          onclick={() => cancelKeyChordLearn()}>
                    {$hostChordLearn.stage === 'chord'
                      ? `now play the chord for ${keyName($hostChordLearn.key)}…`
                      : 'tap the target key…'}</button>
                {:else}
                  <button type="button" class="ghost learn" data-testid="chord-learn"
                          title="Click, tap the target key, then play the chord"
                          onclick={() => learnKeyChord(part.partId)}>+ learn chord</button>
                {/if}
                {#each slot.fx.keyChords as keyChord (keyChord.key)}
                  <span class="key-badge">
                    {keyName(keyChord.key)} · {keyChord.offsets.length}
                    <button type="button" class="ghost danger"
                            onclick={() => clearKeyChord(part.partId, keyChord.key)}>×</button>
                  </span>
                {/each}
              </div>
            {/if}
          {/if}

          {#if slot.type === 'velocity' || slot.type === 'fx'}
            <label class="mini-field">Vel scale
              <input type="number" min="0.1" max="2" step="0.05" value={slot.fx.velocityScale}
                     onchange={(e) => set(slot, { velocityScale: Number(e.currentTarget.value) })} />
            </label>
            <label class="mini-field">Fixed vel (0 = off)
              <input type="number" min="0" max="127" value={slot.fx.velocityFixed}
                     onchange={(e) => set(slot, { velocityFixed: Number(e.currentTarget.value) })} />
            </label>
          {/if}

          {#if slot.type === 'arp'}
            <div class="arp-controls">
              <PropertyToggle compact label={slot.arp.enabled ? 'On' : 'Off'} value={slot.arp.enabled}
                              ariaLabel="Arpeggiator" onchange={(on) => set(slot, { enabled: on })} />
              <label class="mini-field">Mode
                <select value={slot.arp.mode} aria-label="Arpeggiator mode"
                        onchange={(e) => set(slot, { mode: e.currentTarget.value })}>
                  {#each ['up', 'down', 'up-down', 'down-up', 'order', 'random', 'chord', 'pattern'] as mode (mode)}
                    <option value={mode}>{mode}</option>
                  {/each}
                </select>
              </label>
              <label class="mini-field">Rate
                <select value={slot.arp.stepsPerBeat} aria-label="Arpeggiator rate"
                        onchange={(e) => set(slot, { stepsPerBeat: Number(e.currentTarget.value) })}>
                  {#each [1, 2, 3, 4, 6, 8, 12, 16] as rate (rate)}
                    <option value={rate}>{rate}/beat</option>
                  {/each}
                </select>
              </label>
              <label class="mini-field">Octaves
                <select value={slot.arp.octaves} aria-label="Arpeggiator octaves"
                        onchange={(e) => set(slot, { octaves: Number(e.currentTarget.value) })}>
                  {#each [1, 2, 3, 4] as octaves (octaves)}
                    <option value={octaves}>{octaves}</option>
                  {/each}
                </select>
              </label>
              <label class="mini-field">Gate — {Math.round(slot.arp.gate * 100)}%
                <input type="range" min="0.05" max="1" step="0.05" value={slot.arp.gate}
                       aria-label="Arpeggiator gate"
                       oninput={(e) => set(slot, { gate: Number(e.currentTarget.value) })} />
              </label>
              <label class="mini-field">Swing — {Math.round(slot.arp.swing * 100)}%
                <input type="range" min="0" max="0.75" step="0.01" value={slot.arp.swing}
                       aria-label="Arpeggiator swing"
                       oninput={(e) => set(slot, { swing: Number(e.currentTarget.value) })} />
              </label>
              <PropertyToggle compact label={slot.arp.latch ? 'Latched' : 'Latch'} value={slot.arp.latch}
                              ariaLabel="Latch the held chord" onchange={(on) => set(slot, { latch: on })} />
            </div>

            {#if slot.arp.enabled && slot.arp.mode === 'pattern'}
              <!-- Draw the melody: a column is a step, the lit row is which note plays. -->
              <div class="grid-row">
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="note-grid" class:empty={notePattern.length === 0}
                     data-testid="arp-note-grid" bind:this={noteEl}
                     onpointerdown={noteDown} onpointermove={noteMove}
                     onpointerup={noteUp} onpointercancel={noteUp}>
                  {#each (notePattern.length > 0 ? notePattern : Array.from({ length: 16 }, () => -1)) as degree, i (i)}
                    <div class="note-col" class:playing={notePattern.length > 0
                                                         && $hostArpStep[part.partId] === i}>
                      {#each Array.from({ length: noteRows }, (_, r) => noteRows - 1 - r) as row (row)}
                        <div class="note-cell" class:on={degree === row}
                             class:octave={!slot.arp.patternSemitones && row >= 4 && degree !== row}
                             class:ground={slot.arp.patternSemitones && row === 12 && degree !== row}></div>
                      {/each}
                    </div>
                  {/each}
                </div>
                <div class="grid-side">
                  {#if notePattern.length > 0}
                    <select value={notePattern.length} aria-label="Melody length"
                            onchange={(e) => resizePatterns(slot, Number(e.currentTarget.value))}>
                      {#each [4, 8, 12, 16, 24, 32] as length (length)}
                        <option value={length}>{length} steps</option>
                      {/each}
                    </select>
                    <button type="button" class="ghost"
                            onclick={() => set(slot, { degreePattern: [] })}>clear</button>
                  {:else}
                    <span class="hint">{slot.arp.patternSemitones
                      ? 'rows are semitones around your lowest key'
                      : 'rows are notes of your held chord'}</span>
                  {/if}
                  <span class="row-mode">
                    <button type="button" class:on={!slot.arp.patternSemitones}
                            title="Rows are chord degrees — the drawing re-voices with what you hold"
                            onclick={() => set(slot, { patternSemitones: false })}>chord</button>
                    <button type="button" class:on={slot.arp.patternSemitones}
                            data-testid="arp-rows-free"
                            title="Rows are semitones around your lowest key"
                            onclick={() => set(slot, { patternSemitones: true })}>free</button>
                  </span>
                </div>
              </div>
            {/if}

            {#if slot.arp.enabled}
              <!-- Dynamics per step; a bar on the floor is a rest the engine skips. -->
              <div class="grid-row">
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="vel-grid" class:empty={velPattern.length === 0}
                     data-testid="arp-grid" bind:this={velEl}
                     onpointerdown={velDown} onpointermove={velMove}
                     onpointerup={velUp} onpointercancel={velUp}>
                  {#each (velPattern.length > 0 ? velPattern : Array.from({ length: 16 }, () => 100)) as velocity, i (i)}
                    <div class="vel-col" class:playing={velPattern.length > 0
                                                        && $hostArpStep[part.partId] === i}
                         class:rest={velPattern.length > 0 && velocity === 0}>
                      <div class="vel-bar" style={`height: ${Math.max(velocity / 127 * 100, velocity === 0 ? 0 : 4)}%`}></div>
                    </div>
                  {/each}
                </div>
                <div class="grid-side">
                  {#if velPattern.length > 0}
                    <button type="button" class="ghost" title="Back to the velocities you played"
                            onclick={() => set(slot, { velocityPattern: [] })}>as played</button>
                  {:else}
                    <span class="hint">as played — draw to shape it</span>
                  {/if}
                </div>
              </div>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .midi-chain { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #2c343d;
                padding-top: 8px; }
  .fx-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .slot { border: 1px solid #2c343d; border-radius: 5px; background: #1c2126; }
  .slot.open { border-color: #3d81c4; }
  .slot-head { display: flex; align-items: center; gap: 6px; padding: 5px 6px; }
  .slot-index { color: #66707b; font-size: 10px; width: 12px; }
  /* Green runs, red is bypassed — the same language as the insert rows.
     The selector carries .slot-head for weight, not for reach: this name is also a .ghost
     button, and .ghost sets a colour of its own at equal specificity further down, so a plain
     .slot-name rule loses to it on source order. That is the third colour in this file to be
     eaten by .ghost; a semantic colour on a utility-classed element has to out-specify it. */
  .slot-name { flex: 1; text-align: left; display: flex; align-items: baseline; gap: 8px;
               font-size: 12px; }
  .slot-head .slot-name { color: #8fc4a8; }
  .slot.bypassed .slot-name { color: #d68a8a; }
  .slot-summary { color: #7d8894; font-size: 10px; }
  .slot-body { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 8px 8px; }
  .mini-field { display: flex; flex-direction: column; gap: 3px; color: #9aa5b1; font-size: 11px; }
  .arp-controls { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; width: 100%; }
  .hint { color: #66707b; font-size: 10px; max-width: 150px; }
  .empty-hint { color: #66707b; font-size: 12px; }
  .key-chords { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; width: 100%; }
  .key-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; color: #7fb4e0;
               background: #22303c; border-radius: 3px; padding: 1px 4px; }
  .learn { font-size: 10px; color: #9aa5b1; }
  .learn.armed { color: #d9a13c; border-color: #d9a13c; animation: learn-pulse 1s ease-in-out infinite; }
  @keyframes learn-pulse { 50% { opacity: 0.45; } }
  .grid-row { display: flex; gap: 8px; align-items: stretch; width: 100%; }
  .note-grid { flex: 1; display: flex; gap: 1px; height: 150px; background: #10161c;
               border: 1px solid #232c36; border-radius: 4px; padding: 2px;
               cursor: crosshair; touch-action: none; }
  .vel-grid { flex: 1; display: flex; gap: 1px; height: 72px; background: #10161c;
              border: 1px solid #232c36; border-radius: 4px; padding: 2px;
              cursor: crosshair; touch-action: none; }
  /* "nothing drawn yet". NOT .ghost — that is the button utility below, same specificity
     and declared later, so it would take the grid's own background and border with it. */
  .note-grid.empty, .vel-grid.empty { opacity: 0.45; }
  .note-col { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 4px; }
  .note-col.playing { background: #24384c; border-radius: 1px; }
  .note-cell { flex: 1; background: #161e27; border-radius: 1px; }
  .note-cell.octave { background: #131a22; }
  .note-cell.ground { background: #1f2a36; }
  .note-cell.on { background: #4aa88c; }
  .note-col.playing .note-cell.on { background: #7fd4b8; }
  .vel-col { flex: 1; display: flex; align-items: flex-end; background: #161e27;
             border-radius: 1px; min-width: 4px; }
  .vel-col.playing { background: #24384c; }
  .vel-col.rest { background: #12181f; }
  .vel-bar { width: 100%; background: #3d81c4; border-radius: 1px 1px 0 0; }
  .vel-col.playing .vel-bar { background: #7fb4e0; }
  .grid-side { display: flex; flex-direction: column; gap: 4px; justify-content: flex-start; }
  .row-mode { display: flex; gap: 2px; }
  .row-mode button { flex: 1; font-size: 10px; padding: 2px 4px; background: #1c2630;
                     color: #9aa5b1; border: 1px solid #2c3742; border-radius: 3px; cursor: pointer; }
  .row-mode button.on { background: #2c6ca8; color: #fff; border-color: #2c6ca8; }
  .ghost { background: none; border: 1px solid #2c3742; border-radius: 3px; color: #9aa5b1;
           cursor: pointer; font-size: 11px; padding: 2px 6px; }
  .ghost:disabled { opacity: 0.35; cursor: default; }
  .ghost.danger { color: #d68a8a; }
</style>
