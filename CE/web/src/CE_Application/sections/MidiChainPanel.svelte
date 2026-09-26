<script>
  import { onDestroy } from 'svelte';
  import HostConfirmButton from './HostConfirmButton.svelte';
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
  import ResponseCurveDesigner from '../components/ResponseCurveDesigner.svelte';
  import StrumEditor from './midiModules/StrumEditor.svelte';
  import HumanizeEditor from './midiModules/HumanizeEditor.svelte';
  import ChordsEditor from './midiModules/ChordsEditor.svelte';
  import ArpEditor from './midiModules/ArpEditor.svelte';
  import { RATE_CHOICES } from '../utils/arpLane.js';
  import { shapeLabel } from '../utils/chordBuilder.js';
  import { HUMANIZE_FEELS, humanizeFeelOf, beatsToMs } from '../utils/noteModuleViews.js';
  import {
    hostState, hostArpStep, hostChordLearn,
    midiSlotTypes, midiSlotLabels,
    addMidiSlot, removeMidiSlot, moveMidiSlot, setMidiSlotBypassed, setMidiSlotOptions,
    reorderIndexForDrop,
    hostNote,
    learnKeyChord, cancelKeyChordLearn, clearKeyChord, hostChordsLive, chordPad, chordStep,
  } from '../stores/instrumentHost.js';

  let { part } = $props();

  let chain = $derived(part?.midiChain ?? []);
  // The scale names the build understands come from the native side, like everywhere else.
  let scales = $derived($hostState.performance.scales);
  // The pictures label time in milliseconds at the tempo actually set.
  let tempo = $derived($hostState.performance.transport?.tempo ?? 120);
  let openSlotId = $state('');
  let openSlot = $derived(chain.find((slot) => slot.slotId === openSlotId) ?? null);

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const STRUM_LABELS = {
    ascending: 'low → high', descending: 'high → low', alternate: 'alternate',
    'outside in': 'outside → in', 'inside out': 'inside → out', random: 'harp scatter',
  };
  const MPE_FORMAT_LABELS = {
    mpe: 'MPE', 'poly aftertouch': 'Poly AT', 'channel pressure': 'Channel AT', cc: 'CC',
  };
  const keyName = (n) => `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;

  const set = (slot, fields) => setMidiSlotOptions(part.partId, slot.slotId, fields);

  /** What a slot is doing, in a few words, so a collapsed chain still reads. */
  function summary(slot) {
    if (slot.type === 'arp')
      return slot.arp.enabled
        ? [slot.arp.mode === 'pattern' ? 'drawn' : slot.arp.mode,
           `${RATE_CHOICES.find(([n]) => n === slot.arp.stepsPerBeat)?.[1] ?? `${slot.arp.stepsPerBeat}/beat`}`
             + (slot.arp.feel === 'triplet' ? 'T' : slot.arp.feel === 'dotted' ? '.' : ''),
           `${slot.arp.octaves} oct`,
           ...(slot.arp.ratchetPattern.some((n) => n > 1) ? ['repeats'] : []),
           ...(slot.arp.latch ? ['latched'] : [])].join(' · ')
        : 'off';
    if (slot.type === 'transpose')
      return slot.fx.transpose === 0 ? 'no change'
        : `${slot.fx.transpose > 0 ? '+' : ''}${slot.fx.transpose} ${slot.fx.transposeMode === 'diatonic'
            ? `scale steps · ${NOTE_NAMES[slot.fx.scaleRoot]} ${slot.fx.scaleType}` : 'semitones'}`;
    if (slot.type === 'scale')
      return slot.fx.constrainToScale ? `${NOTE_NAMES[slot.fx.scaleRoot]} ${slot.fx.scaleType}` : 'off';
    if (slot.type === 'chord') {
      const follows = slot.fx.chordFollow && slot.fx.chord !== 'off';
      const maps = slot.fx.chordKeyMap && slot.fx.keyMap.length > 0;
      const pads = slot.fx.chordPads && slot.fx.padMap.some((p) => p >= 0);
      const steps = slot.fx.chordProgression && slot.fx.progression.length > 0;
      if (!follows && !maps && !pads && !steps) return 'off';
      const details = [];
      if (follows) {
        details.push(`follow ${shapeLabel(slot.fx.chord)}`);
        if (slot.fx.chordInversion > 0) details.push(`inv ${slot.fx.chordInversion}`);
        if (slot.fx.chordVoicing !== 'close') details.push(slot.fx.chordVoicing);
        if (slot.fx.chordVoiceLeading) details.push('voice lead');
      }
      if (maps) details.push(`${slot.fx.keyMap.length} mapped ${slot.fx.keyMap.length === 1 ? 'key' : 'keys'}`);
      if (pads) details.push(`${slot.fx.padMap.filter((p) => p >= 0).length} pads`);
      if (steps) details.push(`${slot.fx.progression.length}-step progression`);
      return details.join(' · ');
    }
    if (slot.type === 'velocity') {
      if (slot.fx.velocityFixed > 0) return `fixed ${slot.fx.velocityFixed}`;
      const shaped = slot.fx.velocityCurve !== 'linear'
        || slot.fx.velocityInputMin !== 1 || slot.fx.velocityInputMax !== 127
        || slot.fx.velocityOutputMin !== 1 || slot.fx.velocityOutputMax !== 127;
      const velocity = shaped ? slot.fx.velocityCurve : `× ${slot.fx.velocityScale}`;
      return slot.fx.expressionEnabled ? `${velocity} · + expression` : velocity;
    }
    // The later note modules. Each says "off" in the state that changes nothing, because a
    // module that is doing nothing should say so rather than look configured.
    if (slot.type === 'echo')
      return slot.mod.echoRepeats === 0 ? 'off'
        : `${slot.mod.echoRepeats}× · ${beatLabel(slot.mod.echoStepBeats)}`
          + (slot.mod.echoTranspose ? ` · ${slot.mod.echoTranspose > 0 ? '+' : ''}${slot.mod.echoTranspose}st` : '');
    if (slot.type === 'strum')
      return slot.mod.strumBeats === 0 ? 'off'
        : `${beatLabel(slot.mod.strumBeats)} · ${STRUM_LABELS[slot.mod.strumPattern] ?? slot.mod.strumPattern}`;
    if (slot.type === 'humanize')
      return slot.mod.humanizeTimingBeats === 0 && slot.mod.humanizeVelocity === 0
          && slot.mod.humanizeGatePercent === 0 ? 'off'
        : (HUMANIZE_FEELS.find((f) => f.id === humanizeFeelOf({ timing: slot.mod.humanizeTimingBeats,
              velocity: slot.mod.humanizeVelocity, gate: slot.mod.humanizeGatePercent }))?.label
            ?? `${beatsToMs(slot.mod.humanizeTimingBeats, tempo)} ms · ±${slot.mod.humanizeVelocity} vel`)
          + (slot.mod.humanizeGatePercent ? ` · ±${slot.mod.humanizeGatePercent}% gate` : '')
          + (slot.mod.humanizePreserveChords ? ' · chord lock' : '')
          + (slot.mod.humanizeProtectBeats ? ' · beat anchors' : '');
    if (slot.type === 'chance')
      return slot.mod.chance >= 1 ? 'every note' : `${Math.round(slot.mod.chance * 100)}%`;
    if (slot.type === 'length')
      return slot.mod.legato ? 'legato'
        : slot.mod.lengthBeats === 0 ? 'as played' : beatLabel(slot.mod.lengthBeats);
    if (slot.type === 'latch')
      return slot.mod.latchOn ? 'holding' : 'off';
    if (slot.type === 'mpe')
      return slot.mod.mpeEnabled
        ? `${MPE_FORMAT_LABELS[slot.mod.mpeInput]} → ${MPE_FORMAT_LABELS[slot.mod.mpeOutput]}`
        : 'off';
    if (slot.type === 'articulation')
      return slot.mod.articulationEnabled
        ? `${slot.mod.articulations.length} mapped`
        : 'off';
    return 'transpose · scale · chord · velocity';
  }

  function addArticulation(slot) {
    if (slot.mod.articulations.length >= 32) return;
    const triggerNote = Math.min(127, 24 + slot.mod.articulations.length);
    const articulationId = globalThis.crypto?.randomUUID?.()
      ?? `articulation-${Date.now()}-${slot.mod.articulations.length}`;
    set(slot, {
      articulationEnabled: true,
      articulations: [...slot.mod.articulations, {
        articulationId, name: `Articulation ${slot.mod.articulations.length + 1}`,
        triggerNote, triggerChannel: 0, type: 'keyswitch', outputChannel: 0,
        keyswitchNote: triggerNote, keyswitchVelocity: 100,
        program: 0, bankMsb: -1, bankLsb: -1, controller: 0, controllerValue: 127,
      }],
    });
  }

  function updateArticulation(slot, articulationId, fields) {
    set(slot, { articulations: slot.mod.articulations.map((entry) =>
      entry.articulationId === articulationId ? { ...entry, ...fields } : entry) });
  }

  function removeArticulation(slot, articulationId) {
    set(slot, { articulations: slot.mod.articulations.filter((entry) =>
      entry.articulationId !== articulationId) });
  }

  const auditionTimers = new Map();

  function auditionArticulation(entry) {
    const channel = entry.triggerChannel || part.channel || 1;
    const key = `${channel}:${entry.triggerNote}`;
    const previous = auditionTimers.get(key);
    if (previous) {
      clearTimeout(previous);
      hostNote(entry.triggerNote, 0, false, channel);
    }
    hostNote(entry.triggerNote, 100, true, channel);
    const timer = setTimeout(() => {
      if (auditionTimers.get(key) !== timer) return;
      auditionTimers.delete(key);
      hostNote(entry.triggerNote, 0, false, channel);
    }, 80);
    auditionTimers.set(key, timer);
  }

  onDestroy(() => {
    for (const [key, timer] of auditionTimers) {
      clearTimeout(timer);
      const [channel, note] = key.split(':').map(Number);
      hostNote(note, 0, false, channel);
    }
    auditionTimers.clear();
  });

  /** Beats as a musician reads them. Everything in these modules is timed in beats rather
      than milliseconds — a strum that is right at 90bpm is wrong at 160 — so the labels have
      to be musical too, or the numbers mean nothing on the way in. */
  const BEAT_CHOICES = [
    [0.0625, '1/64'], [0.125, '1/32'], [0.25, '1/16'], [0.375, '1/16.'],
    [0.5, '1/8'], [0.75, '1/8.'], [1, '1/4'], [1.5, '1/4.'], [2, '1/2'], [4, 'bar'],
  ];
  const beatLabel = (beats) =>
    BEAT_CHOICES.find(([value]) => Math.abs(value - beats) < 1e-6)?.[1]
      ?? `${Number(beats).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} beats`;

  // --- dragging a module to reorder the chain ----------------------------------------------
  //
  // The arrows still work and are still the keyboard's way to do this; the grip is the one
  // that reads as an order you can rearrange. Same shape as the insert chain in
  // InstrumentHostView, same shared arithmetic — reorderIndexForDrop owns the off-by-one when
  // a row travels downwards, which is the only part of this that can be quietly wrong.
  let slotDrag = $state({ id: '', overId: '', after: false });

  function slotDragStart(event, slotId) {
    slotDrag = { id: slotId, overId: '', after: false };
    event.dataTransfer?.setData('text/plain', slotId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function slotDragEnd() { slotDrag = { id: '', overId: '', after: false }; }

  const inLowerHalf = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientY > box.top + box.height / 2;
  };

  function slotDragOver(event, overId) {
    if (!slotDrag.id) return;
    event.preventDefault();
    // Must match the source's effectAllowed, or the browser cancels the drop silently.
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    slotDrag = { ...slotDrag, overId, after: inLowerHalf(event) };
  }

  function slotDrop(event, overId) {
    if (!slotDrag.id) return;
    event.preventDefault();
    const index = reorderIndexForDrop(chain.findIndex((s) => s.slotId === slotDrag.id),
                                      chain.findIndex((s) => s.slotId === overId),
                                      inLowerHalf(event));
    if (index >= 0) moveMidiSlot(part.partId, slotDrag.id, index);
    slotDragEnd();
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
    <div class="slot" class:bypassed={slot.bypassed} class:open={openSlotId === slot.slotId}
         class:drop-before={slotDrag.overId === slot.slotId && !slotDrag.after}
         class:drop-after={slotDrag.overId === slot.slotId && slotDrag.after}
         class:lifted={slotDrag.id === slot.slotId}
         data-testid="midi-slot"
         role="presentation"
         ondragover={(e) => slotDragOver(e, slot.slotId)}
         ondrop={(e) => slotDrop(e, slot.slotId)}>
      <div class="slot-head">
        <span class="slot-grip" draggable="true" title="Drag to reorder" aria-hidden="true"
              ondragstart={(e) => slotDragStart(e, slot.slotId)}
              ondragend={slotDragEnd}>⠿</span>
        <span class="slot-index">{index + 1}</span>
        <span class="slot-light" class:on={!slot.bypassed} title={slot.bypassed ? 'Bypassed' : 'On'} aria-hidden="true"></span>
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
        <HostConfirmButton identity={JSON.stringify([part.partId, slot.slotId])} type="button" class="ghost danger" title="Remove this module"
                onclick={() => removeMidiSlot(part.partId, slot.slotId)}>×</HostConfirmButton>
      </div>

      {#if openSlotId === slot.slotId}
        <div class="slot-body">
          {#if slot.type === 'transpose' || slot.type === 'fx'}
            <label class="mini-field">Mode
              <select value={slot.fx.transposeMode}
                      onchange={(e) => set(slot, { transposeMode: e.currentTarget.value })}>
                <option value="chromatic">Chromatic</option>
                <option value="diatonic">Diatonic / key-aware</option>
              </select>
            </label>
            <label class="mini-field">{slot.fx.transposeMode === 'diatonic' ? 'Scale steps' : 'Semitones'}
              <input type="number" min={slot.fx.transposeMode === 'diatonic' ? -28 : -48}
                     max={slot.fx.transposeMode === 'diatonic' ? 28 : 48} value={slot.fx.transpose}
                     onchange={(e) => set(slot, { transpose: Number(e.currentTarget.value) })} />
            </label>
            {#if slot.fx.transposeMode === 'diatonic'}
              <label class="mini-field">Key
                <select value={slot.fx.scaleRoot}
                        onchange={(e) => set(slot, { scaleRoot: Number(e.currentTarget.value) })}>
                  {#each NOTE_NAMES as name, i (name)}
                    <option value={i}>{name}</option>
                  {/each}
                </select>
              </label>
              <label class="mini-field">Scale
                <select value={slot.fx.scaleType}
                        onchange={(e) => set(slot, { scaleType: e.currentTarget.value })}>
                  {#each scales as name (name)}
                    <option value={name}>{name}</option>
                  {/each}
                </select>
              </label>
              <span class="hint">Moves by scale degree: in C major, +2 turns C→E, D→F and E→G.</span>
            {/if}
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
            <ChordsEditor fx={slot.fx} set={(fields) => set(slot, fields)} partId={part.partId} slotId={slot.slotId}
                          {scales} learn={$hostChordLearn}
                          onlearn={() => learnKeyChord(part.partId, slot.slotId)}
                          oncancel={() => cancelKeyChordLearn()}
                          onclear={(key) => clearKeyChord(part.partId, key, slot.slotId)}
                          live={$hostChordsLive[part.partId]}
                          onpad={(pad, velocity) => chordPad(part.partId, slot.slotId, pad, velocity)}
                          onstep={(move) => chordStep(part.partId, slot.slotId, move)} />
          {/if}

          {#if slot.type === 'velocity' || slot.type === 'fx'}
            <div class="response-editor" data-testid="velocity-expression-designer">
              <div class="response-profile">
                <label class="mini-field profile-name">Device calibration
                  <input type="text" maxlength="80" value={slot.fx.responseProfileName}
                         placeholder="e.g. CTRL49 studio"
                         onchange={(e) => set(slot, { responseProfileName: e.currentTarget.value })} />
                </label>
                <span class="hint">This named calibration is saved with the part. When several MIDI inputs are enabled, isolate its controller with the part’s MIDI channel/range.</span>
              </div>

              <div class="response-block">
                <div class="response-row">
                  <strong>Velocity</strong>
                  <label class="mini-field">Curve
                    <select value={slot.fx.velocityCurve}
                            onchange={(e) => set(slot, { velocityCurve: e.currentTarget.value })}>
                      <option value="linear">Linear</option>
                      <option value="soft">Soft touch</option>
                      <option value="hard">Hard touch</option>
                      <option value="s curve">S curve</option>
                      <option value="custom">Custom · 9 point</option>
                    </select>
                  </label>
                  <label class="mini-field range-pair">Device range
                    <span><input type="number" min="1" max="127" value={slot.fx.velocityInputMin}
                                 aria-label="Velocity device range minimum"
                                 onchange={(e) => set(slot, { velocityInputMin: Number(e.currentTarget.value) })} />
                      – <input type="number" min="1" max="127" value={slot.fx.velocityInputMax}
                               aria-label="Velocity device range maximum"
                               onchange={(e) => set(slot, { velocityInputMax: Number(e.currentTarget.value) })} /></span>
                  </label>
                  <label class="mini-field range-pair">Instrument range
                    <span><input type="number" min="1" max="127" value={slot.fx.velocityOutputMin}
                                 aria-label="Velocity instrument range minimum"
                                 onchange={(e) => set(slot, { velocityOutputMin: Number(e.currentTarget.value) })} />
                      – <input type="number" min="1" max="127" value={slot.fx.velocityOutputMax}
                               aria-label="Velocity instrument range maximum"
                               onchange={(e) => set(slot, { velocityOutputMax: Number(e.currentTarget.value) })} /></span>
                  </label>
                  <label class="mini-field">Final scale
                    <input type="number" min="0.1" max="2" step="0.05" value={slot.fx.velocityScale}
                           onchange={(e) => set(slot, { velocityScale: Number(e.currentTarget.value) })} />
                  </label>
                  <label class="mini-field">Fixed (0 = off)
                    <input type="number" min="0" max="127" value={slot.fx.velocityFixed}
                           onchange={(e) => set(slot, { velocityFixed: Number(e.currentTarget.value) })} />
                  </label>
                </div>
                <ResponseCurveDesigner label="Velocity" curve={slot.fx.velocityCurve}
                  points={slot.fx.velocityCurveValues}
                  onchange={(points) => set(slot, { velocityCurveValues: points })}
                  onmakecustom={(points) => set(slot, {
                    velocityCurve: 'custom', velocityCurveValues: points,
                  })} />
              </div>

              <div class="response-block expression" class:off={!slot.fx.expressionEnabled}>
                <div class="response-row">
                  <strong>Expression</strong>
                  <PropertyToggle compact label={slot.fx.expressionEnabled ? 'On' : 'Off'}
                                  value={slot.fx.expressionEnabled} ariaLabel="Expression response mapping"
                                  onchange={(on) => set(slot, { expressionEnabled: on })} />
                  <label class="mini-field">Source
                    <select value={slot.fx.expressionSource}
                            onchange={(e) => set(slot, { expressionSource: e.currentTarget.value })}>
                      <option value="cc">MIDI CC</option>
                      <option value="channel pressure">Channel aftertouch</option>
                      <option value="poly aftertouch">Poly aftertouch</option>
                    </select>
                  </label>
                  {#if slot.fx.expressionSource === 'cc'}
                    <label class="mini-field">CC
                      <input type="number" min="0" max="127" value={slot.fx.expressionCc}
                             onchange={(e) => set(slot, { expressionCc: Number(e.currentTarget.value) })} />
                    </label>
                  {/if}
                  <label class="mini-field">Curve
                    <select value={slot.fx.expressionCurve}
                            onchange={(e) => set(slot, { expressionCurve: e.currentTarget.value })}>
                      <option value="linear">Linear</option>
                      <option value="soft">Soft touch</option>
                      <option value="hard">Hard touch</option>
                      <option value="s curve">S curve</option>
                      <option value="custom">Custom · 9 point</option>
                    </select>
                  </label>
                  <label class="mini-field range-pair">Device range
                    <span><input type="number" min="0" max="127" value={slot.fx.expressionInputMin}
                                 aria-label="Expression device range minimum"
                                 onchange={(e) => set(slot, { expressionInputMin: Number(e.currentTarget.value) })} />
                      – <input type="number" min="0" max="127" value={slot.fx.expressionInputMax}
                               aria-label="Expression device range maximum"
                               onchange={(e) => set(slot, { expressionInputMax: Number(e.currentTarget.value) })} /></span>
                  </label>
                  <label class="mini-field range-pair">Instrument range
                    <span><input type="number" min="0" max="127" value={slot.fx.expressionOutputMin}
                                 aria-label="Expression instrument range minimum"
                                 onchange={(e) => set(slot, { expressionOutputMin: Number(e.currentTarget.value) })} />
                      – <input type="number" min="0" max="127" value={slot.fx.expressionOutputMax}
                               aria-label="Expression instrument range maximum"
                               onchange={(e) => set(slot, { expressionOutputMax: Number(e.currentTarget.value) })} /></span>
                  </label>
                </div>
                <ResponseCurveDesigner label="Expression" curve={slot.fx.expressionCurve}
                  points={slot.fx.expressionCurveValues}
                  onchange={(points) => set(slot, { expressionCurveValues: points })}
                  onmakecustom={(points) => set(slot, {
                    expressionCurve: 'custom', expressionCurveValues: points,
                  })} />
                <span class="hint">Only the selected expression message is reshaped. Put the MPE Transformer before or after this insert when format conversion is also needed.</span>
              </div>
            </div>
          {/if}

          {#if slot.type === 'echo'}
            <label class="mini-field">Repeats
              <input type="number" min="0" max="8" value={slot.mod.echoRepeats}
                     onchange={(e) => set(slot, { echoRepeats: Number(e.currentTarget.value) })} />
            </label>
            <label class="mini-field">Every
              <select value={slot.mod.echoStepBeats}
                      onchange={(e) => set(slot, { echoStepBeats: Number(e.currentTarget.value) })}>
                {#each BEAT_CHOICES as [value, label] (value)}
                  <option value={value}>{label}</option>
                {/each}
              </select>
            </label>
            <label class="mini-field">Decay
              <input type="range" min="0.1" max="1" step="0.05" value={slot.mod.echoFeedback}
                     aria-label="Echo decay"
                     oninput={(e) => set(slot, { echoFeedback: Number(e.currentTarget.value) })} />
            </label>
            <label class="mini-field">Climb
              <input type="number" min="-12" max="12" value={slot.mod.echoTranspose}
                     title="Semitones added to each repeat"
                     onchange={(e) => set(slot, { echoTranspose: Number(e.currentTarget.value) })} />
            </label>
          {/if}

          {#if slot.type === 'strum'}
            <StrumEditor mod={slot.mod} set={(fields) => set(slot, fields)} tempo={tempo} beatChoices={BEAT_CHOICES} />
          {/if}

          {#if slot.type === 'humanize'}
            <HumanizeEditor mod={slot.mod} set={(fields) => set(slot, fields)} tempo={tempo} />
          {/if}

          {#if slot.type === 'chance'}
            <label class="mini-field">Notes played
              <input type="range" min="0" max="1" step="0.05" value={slot.mod.chance}
                     aria-label="Chance a note plays"
                     oninput={(e) => set(slot, { chance: Number(e.currentTarget.value) })} />
            </label>
            <span class="dim">{Math.round(slot.mod.chance * 100)}% of them</span>
          {/if}

          {#if slot.type === 'length'}
            <label class="mini-field">Length
              <select value={slot.mod.lengthBeats} disabled={slot.mod.legato}
                      onchange={(e) => set(slot, { lengthBeats: Number(e.currentTarget.value) })}>
                <option value={0}>as played</option>
                {#each BEAT_CHOICES as [value, label] (value)}
                  <option value={value}>{label}</option>
                {/each}
              </select>
            </label>
            <label class="mini-field">Legato
              <PropertyToggle compact label="Hold to the next note" value={slot.mod.legato}
                              ariaLabel="Hold each note until the next"
                              onchange={(on) => set(slot, { legato: on })} />
            </label>
          {/if}

          {#if slot.type === 'latch'}
            <label class="mini-field">Latch
              <PropertyToggle compact label="Keep the chord sounding" value={slot.mod.latchOn}
                              ariaLabel="Latch held notes"
                              onchange={(on) => set(slot, { latchOn: on })} />
            </label>
            <span class="dim">Play another chord to replace it.</span>
          {/if}

          {#if slot.type === 'mpe'}
            <div class="mpe-controls" data-testid="mpe-transformer-controls">
              <PropertyToggle compact label={slot.mod.mpeEnabled ? 'On' : 'Off'}
                              value={slot.mod.mpeEnabled} ariaLabel="MPE transformer"
                              onchange={(on) => set(slot, { mpeEnabled: on })} />
              <label class="mini-field">Input
                <select value={slot.mod.mpeInput}
                        onchange={(e) => set(slot, { mpeInput: e.currentTarget.value })}>
                  <option value="mpe">MPE member channels</option>
                  <option value="poly aftertouch">Poly aftertouch</option>
                  <option value="channel pressure">Channel aftertouch</option>
                  <option value="cc">MIDI CC</option>
                </select>
              </label>
              {#if slot.mod.mpeInput === 'mpe'}
                <label class="mini-field">MPE input axis
                  <select value={slot.mod.mpeInputAxis}
                          onchange={(e) => set(slot, { mpeInputAxis: e.currentTarget.value })}>
                    <option value="pressure">Pressure · Channel AT</option>
                    <option value="timbre">Timbre · CC74</option>
                    <option value="pitch bend">Pitch · bend</option>
                  </select>
                </label>
              {:else if slot.mod.mpeInput === 'cc'}
                <label class="mini-field">Input CC
                  <input type="number" min="0" max="127" value={slot.mod.mpeInputCc}
                         onchange={(e) => set(slot, { mpeInputCc: Number(e.currentTarget.value) })} />
                </label>
              {/if}
              <span class="mpe-arrow" aria-hidden="true">→</span>
              <label class="mini-field">Output
                <select value={slot.mod.mpeOutput}
                        onchange={(e) => set(slot, { mpeOutput: e.currentTarget.value })}>
                  <option value="mpe">MPE member channels</option>
                  <option value="poly aftertouch">Poly aftertouch</option>
                  <option value="channel pressure">Channel aftertouch</option>
                  <option value="cc">MIDI CC</option>
                </select>
              </label>
              {#if slot.mod.mpeOutput === 'mpe'}
                <label class="mini-field">MPE output axis
                  <select value={slot.mod.mpeOutputAxis}
                          onchange={(e) => set(slot, { mpeOutputAxis: e.currentTarget.value })}>
                    <option value="pressure">Pressure · Channel AT</option>
                    <option value="timbre">Timbre · CC74</option>
                    <option value="pitch bend">Pitch · bend</option>
                  </select>
                </label>
              {:else if slot.mod.mpeOutput === 'cc'}
                <label class="mini-field">Output CC
                  <input type="number" min="0" max="127" value={slot.mod.mpeOutputCc}
                         onchange={(e) => set(slot, { mpeOutputCc: Number(e.currentTarget.value) })} />
                </label>
              {/if}
            </div>
            <div class="mpe-routing">
              {#if slot.mod.mpeInput === 'mpe' || slot.mod.mpeOutput === 'mpe'}
                <label class="mini-field">First member
                  <input type="number" min="1" max="16" value={slot.mod.mpeMemberFirst}
                         onchange={(e) => set(slot, { mpeMemberFirst: Number(e.currentTarget.value) })} />
                </label>
                <label class="mini-field">Last member
                  <input type="number" min="1" max="16" value={slot.mod.mpeMemberLast}
                         onchange={(e) => set(slot, { mpeMemberLast: Number(e.currentTarget.value) })} />
                </label>
              {/if}
              {#if slot.mod.mpeOutput === 'channel pressure' || slot.mod.mpeOutput === 'cc'
                    || (slot.mod.mpeInput === 'mpe' && slot.mod.mpeOutput === 'poly aftertouch')}
                <label class="mini-field">Output channel
                  <input type="number" min="1" max="16" value={slot.mod.mpeOutputChannel}
                         onchange={(e) => set(slot, { mpeOutputChannel: Number(e.currentTarget.value) })} />
                </label>
              {/if}
              {#if (slot.mod.mpeInput === 'mpe' || slot.mod.mpeInput === 'poly aftertouch')
                    && (slot.mod.mpeOutput === 'channel pressure' || slot.mod.mpeOutput === 'cc')}
                <label class="mini-field">Poly → mono
                  <select value={slot.mod.mpeCollapse}
                          onchange={(e) => set(slot, { mpeCollapse: e.currentTarget.value })}>
                    <option value="latest">Latest gesture</option>
                    <option value="highest">Highest gesture</option>
                    <option value="average">Average voices</option>
                  </select>
                </label>
              {/if}
              <span class="hint mpe-hint">MPE uses one member channel per note: bend for pitch, CC74 for timbre, and channel aftertouch for pressure. Converting to one channel is necessarily lossy.</span>
            </div>
          {/if}

          {#if slot.type === 'articulation'}
            <div class="articulation-editor">
              <div class="articulation-toolbar">
                <PropertyToggle compact
                                label={slot.mod.articulationEnabled ? 'On' : 'Off'}
                                value={slot.mod.articulationEnabled}
                                ariaLabel="Articulation manager"
                                onchange={(on) => set(slot, { articulationEnabled: on })} />
                <label class="mini-field map-name">Map name
                  <input type="text" maxlength="80" value={slot.mod.articulationMapName}
                         placeholder="e.g. BBCSO Core"
                         onchange={(e) => set(slot, { articulationMapName: e.currentTarget.value })} />
                </label>
                <button type="button" class="ghost" disabled={slot.mod.articulations.length >= 32}
                        onclick={() => addArticulation(slot)}>+ Articulation</button>
                <span class="hint articulation-hint">Trigger notes are control keys: they work outside this part's playable key zone. Generated keyswitch, program and CC messages bypass transpose, scale and chorder modules.</span>
              </div>

              {#if slot.mod.articulations.length === 0}
                <div class="empty-hint">No articulations mapped. Add one, choose its trigger key, then choose what the instrument expects.</div>
              {/if}

              <div class="articulation-list">
                {#each slot.mod.articulations as articulation, articulationIndex (articulation.articulationId)}
                  <div class="articulation-row">
                    <button type="button" class="articulation-trigger"
                            title={`Send ${keyName(articulation.triggerNote)} now`}
                            onclick={() => auditionArticulation(articulation)}>
                      <span>{keyName(articulation.triggerNote)}</span>
                      <small>play</small>
                    </button>
                    <label class="mini-field articulation-name">Name
                      <input type="text" maxlength="80" value={articulation.name}
                             onchange={(e) => updateArticulation(slot, articulation.articulationId,
                                                                  { name: e.currentTarget.value })} />
                    </label>
                    <label class="mini-field">Trigger note
                      <input type="number" min="0" max="127" value={articulation.triggerNote}
                             title={keyName(articulation.triggerNote)}
                             onchange={(e) => updateArticulation(slot, articulation.articulationId,
                                                                  { triggerNote: Number(e.currentTarget.value) })} />
                    </label>
                    <label class="mini-field">Trigger channel
                      <select value={articulation.triggerChannel}
                              onchange={(e) => updateArticulation(slot, articulation.articulationId,
                                                                   { triggerChannel: Number(e.currentTarget.value) })}>
                        <option value={0}>part input</option>
                        {#each Array.from({ length: 16 }, (_, i) => i + 1) as channel (channel)}
                          <option value={channel}>{channel}</option>
                        {/each}
                      </select>
                    </label>
                    <label class="mini-field">Sends
                      <select value={articulation.type}
                              onchange={(e) => updateArticulation(slot, articulation.articulationId,
                                                                   { type: e.currentTarget.value })}>
                        <option value="keyswitch">Keyswitch</option>
                        <option value="program change">Bank + program</option>
                        <option value="cc">MIDI CC</option>
                      </select>
                    </label>
                    <label class="mini-field">Output channel
                      <select value={articulation.outputChannel}
                              onchange={(e) => updateArticulation(slot, articulation.articulationId,
                                                                   { outputChannel: Number(e.currentTarget.value) })}>
                        <option value={0}>same</option>
                        {#each Array.from({ length: 16 }, (_, i) => i + 1) as channel (channel)}
                          <option value={channel}>{channel}</option>
                        {/each}
                      </select>
                    </label>

                    {#if articulation.type === 'keyswitch'}
                      <label class="mini-field">Keyswitch note
                        <input type="number" min="0" max="127" value={articulation.keyswitchNote}
                               title={keyName(articulation.keyswitchNote)}
                               onchange={(e) => updateArticulation(slot, articulation.articulationId,
                                                                    { keyswitchNote: Number(e.currentTarget.value) })} />
                      </label>
                      <label class="mini-field">Velocity
                        <input type="number" min="1" max="127" value={articulation.keyswitchVelocity}
                               onchange={(e) => updateArticulation(slot, articulation.articulationId,
                                                                    { keyswitchVelocity: Number(e.currentTarget.value) })} />
                      </label>
                    {:else if articulation.type === 'program change'}
                      <label class="mini-field">Bank MSB
                        <input type="number" min="-1" max="127" value={articulation.bankMsb}
                               title="-1 sends no Bank MSB"
                               onchange={(e) => updateArticulation(slot, articulation.articulationId,
                                                                    { bankMsb: Number(e.currentTarget.value) })} />
                      </label>
                      <label class="mini-field">Bank LSB
                        <input type="number" min="-1" max="127" value={articulation.bankLsb}
                               title="-1 sends no Bank LSB"
                               onchange={(e) => updateArticulation(slot, articulation.articulationId,
                                                                    { bankLsb: Number(e.currentTarget.value) })} />
                      </label>
                      <label class="mini-field">Program · 1–128
                        <input type="number" min="1" max="128" value={articulation.program + 1}
                               onchange={(e) => updateArticulation(slot, articulation.articulationId,
                                                                    { program: Number(e.currentTarget.value) - 1 })} />
                      </label>
                    {:else}
                      <label class="mini-field">CC
                        <input type="number" min="0" max="127" value={articulation.controller}
                               onchange={(e) => updateArticulation(slot, articulation.articulationId,
                                                                    { controller: Number(e.currentTarget.value) })} />
                      </label>
                      <label class="mini-field">Value
                        <input type="number" min="0" max="127" value={articulation.controllerValue}
                               onchange={(e) => updateArticulation(slot, articulation.articulationId,
                                                                    { controllerValue: Number(e.currentTarget.value) })} />
                      </label>
                    {/if}

                    <HostConfirmButton identity={JSON.stringify([slot.slotId, articulation.articulationId])} type="button" class="ghost danger articulation-remove"
                            title={`Remove ${articulation.name || `articulation ${articulationIndex + 1}`}`}
                            onclick={() => removeArticulation(slot, articulation.articulationId)}>×</HostConfirmButton>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if slot.type === 'arp'}
            <ArpEditor arp={slot.arp} set={(fields) => set(slot, fields)} identity={slot.slotId}
                       playStep={$hostArpStep[part.partId] ?? -1} />
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .midi-chain { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--host-line-soft);
                padding-top: 8px; }
  .fx-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .slot { border: 1px solid var(--host-line-soft); border-radius: var(--host-radius-panel); background: var(--host-surface-raised); }
  .slot.open { border-color: var(--host-accent); }
  /* The insertion line, drawn on the side the module will land. An inset shadow rather than a
     real element, so nothing shifts under the pointer while you are aiming at it. */
  .slot.drop-before { box-shadow: inset 0 2px 0 0 #5b9bd5; }
  .slot.drop-after  { box-shadow: inset 0 -2px 0 0 #5b9bd5; }
  .slot.lifted { opacity: 0.45; }
  .slot-grip { flex: none; cursor: grab; color: #66707b; font-size: 13px; line-height: 1; user-select: none; }
  .slot-grip:hover { color: #d6dbe0; }
  .slot-head { display: flex; align-items: center; gap: 6px; padding: 5px 6px; }
  .slot-light { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--host-text-faint, #65717c); }
  .slot-light.on { background: var(--host-active, #58a879); box-shadow: 0 0 5px var(--host-active, #58a879); }
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
  .mpe-controls, .mpe-routing { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; width: 100%; }
  .mpe-routing { padding-top: 7px; border-top: 1px solid var(--host-line-soft); }
  .mpe-controls select { min-width: 142px; }
  .mpe-controls input, .mpe-routing input { width: 54px; }
  .mpe-arrow { align-self: center; color: var(--host-accent); font-size: 18px; }
  .mpe-hint { max-width: 360px; line-height: 1.4; }
  .articulation-editor { width: 100%; display: flex; flex-direction: column; gap: 8px; }
  .articulation-toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; }
  .articulation-toolbar .map-name { flex: 0 1 240px; }
  .articulation-toolbar .map-name input { width: 220px; }
  .articulation-hint { max-width: 620px; line-height: 1.4; }
  .articulation-list { display: flex; flex-direction: column; gap: 5px; width: 100%; }
  .articulation-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px;
                      padding: 7px; border: 1px solid var(--host-line-soft);
                      border-radius: var(--host-radius-panel); background: #111820; }
  .articulation-row input[type="number"] { width: 64px; }
  .articulation-row select { min-width: 94px; }
  .articulation-name { flex: 1 1 150px; }
  .articulation-name input { width: 100%; min-width: 130px; }
  .articulation-trigger { width: 48px; height: 39px; display: flex; flex-direction: column;
                          justify-content: center; align-items: center; border: 1px solid var(--host-accent);
                          border-radius: var(--host-radius-control); background: var(--host-accent-surface);
                          color: var(--host-text); cursor: pointer; }
  .articulation-trigger span { font: 600 11px var(--host-font-mono, monospace); }
  .articulation-trigger small { color: var(--host-text-dim); font-size: 8px; text-transform: uppercase; }
  .slot :global(.articulation-remove) { align-self: center; margin-left: auto; }
  .response-editor { width: 100%; display: flex; flex-direction: column; gap: 10px; }
  .response-profile { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
  .profile-name { flex: 0 1 260px; }
  .profile-name input { width: 240px; }
  .response-profile .hint { max-width: 540px; }
  .response-block { padding: 8px; display: flex; gap: 10px; flex-wrap: wrap;
                    border: 1px solid var(--host-line-soft); border-radius: var(--host-radius-panel);
                    background: #111820; }
  .response-block.expression.off { opacity: 0.65; }
  .response-row { flex: 1 1 330px; min-width: 300px; display: flex; align-content: flex-start;
                  align-items: flex-end; flex-wrap: wrap; gap: 8px; }
  .response-row > strong { width: 100%; color: var(--host-text); font-size: 12px; }
  .response-row select { min-width: 120px; }
  .response-row input[type="number"] { width: 58px; }
  .range-pair > span { display: flex; align-items: center; gap: 4px; color: var(--host-text-dim); }
  .hint { color: #66707b; font-size: 10px; max-width: 150px; }
  .empty-hint { color: #66707b; font-size: 12px; }
  .ghost { background: none; border: 1px solid var(--host-line-soft); border-radius: var(--host-radius-control); color: var(--host-text-soft);
           cursor: pointer; font-size: 11px; padding: 2px 6px; }
  .ghost:disabled { opacity: 0.35; cursor: default; }
  .slot :global(.ghost.danger) { color: var(--host-danger); }
</style>
