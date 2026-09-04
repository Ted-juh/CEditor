<script>
  /**
   * PerformancePanel.svelte — the Stage 6 performance system (VIP-successor §18.8).
   *
   * Three views over ONE engine, which is the whole point of the stage: the pattern editor
   * writes lanes and steps, the clip and scene grid launches them, and the setlist walks
   * whole rigs. None of them keeps its own state — every control sends a command and the
   * next `instrumentHostState` push is what gets drawn, so a launch that the engine is still
   * holding for its quantization boundary renders as "pending" rather than as a lie.
   *
   * The playhead is the one thing that reads rather than commands: clip phase comes from the
   * native side's own position, because §18.8.13's rule is that timing never depends on the
   * WebView's frame rate — the animation follows the engine, it does not drive it.
   */
  import {
    hostState,
    addPattern, removePattern, renamePattern, setPatternOptions,
    addLane, removeLane, setLaneOptions, clearLane, euclidFill,
    setStep, toggleStep,
    addClip, removeClip, setClipOptions, launchClip, stopClip, stopAllClips,
    armCapture, disarmCapture,
    addScene, removeScene, captureScene, setSceneOptions, setSceneClip, launchScene,
    addSetlistItem, removeSetlistItem, setSetlistItem, setlistGo, setlistNext, setlistPrev,
  } from '../stores/instrumentHost.js';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let tab = $state('patterns');
  let selectedPatternId = $state('');
  let selectedLaneId = $state('');
  let selectedStepIndex = $state(-1);

  let performance = $derived($hostState.performance);
  let patterns = $derived(performance.patterns);
  let parts = $derived($hostState.rack.parts);

  let selectedPattern = $derived(
    patterns.find((p) => p.patternId === selectedPatternId) ?? patterns[0] ?? null);
  let selectedLane = $derived(
    selectedPattern?.lanes.find((l) => l.laneId === selectedLaneId) ?? selectedPattern?.lanes[0] ?? null);
  let selectedStep = $derived(
    selectedLane && selectedStepIndex >= 0 ? selectedLane.steps[selectedStepIndex] ?? null : null);

  // The clip a lane belongs to, for arming capture straight from the editor.
  let clipForSelectedPattern = $derived(
    performance.clips.find((c) => c.patternId === selectedPattern?.patternId) ?? null);

  const quantizeOptions = ['immediate', '1/16', '1/8', 'beat', '1/2 bar', 'bar', '2 bars', '4 bars'];
  const laneTypes = ['note', 'chord', 'drum', 'cc', 'parameter'];
  const noteName = (note) => {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return `${names[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
  };

  // --- the piano roll (note and chord lanes) -------------------------------------------
  // Pitch was a number you typed per step; now it is a row you click. Two octaves are
  // visible per lane, shifted with the octave buttons; the window opens where the lane's
  // notes already live. Note lanes are monophonic — clicking another row MOVES the step's
  // note; clicking the lit cell rests the step; dragging paints. Chord lanes stack: each
  // click toggles that pitch in the step's chord.
  const ROLL_ROWS = 25;
  const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
  let rollBase = $state({});
  let rollDrag = $state(null);   // { laneId, painting, lastIndex }

  function stepPitches(lane, step) {
    if (!step.active) return [];
    return lane.type === 'chord' && step.chordNotes.length > 0 ? step.chordNotes : [step.note];
  }

  function rollBaseFor(lane) {
    if (rollBase[lane.laneId] !== undefined) return rollBase[lane.laneId];
    const notes = lane.steps.flatMap((step) => stepPitches(lane, step));
    const low = notes.length > 0 ? Math.min(...notes) : 48;   // an empty lane opens at C2
    return Math.max(0, Math.min(127 - ROLL_ROWS + 1, Math.floor(low / 12) * 12));
  }

  function shiftRoll(lane, octaves) {
    rollBase[lane.laneId] = Math.max(0, Math.min(127 - ROLL_ROWS + 1,
      rollBaseFor(lane) + octaves * 12));
  }

  function rollCellFromEvent(lane, event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.max(0, Math.min(lane.stepCount - 1,
      Math.floor(((event.clientX - rect.left) / rect.width) * lane.stepCount)));
    const row = Math.max(0, Math.min(ROLL_ROWS - 1,
      ROLL_ROWS - 1 - Math.floor(((event.clientY - rect.top) / rect.height) * ROLL_ROWS)));
    return { index, note: rollBaseFor(lane) + row };
  }

  function rollDown(lane, event) {
    if (event.button === 2) return;   // right-click keeps its meaning: select the step
    event.preventDefault();
    selectedLaneId = lane.laneId;
    const { index, note } = rollCellFromEvent(lane, event);
    selectedStepIndex = index;
    const step = lane.steps[index];

    if (lane.type === 'chord') {
      const chord = stepPitches(lane, step);
      const nextChord = chord.includes(note)
        ? chord.filter((n) => n !== note)
        : [...chord, note].sort((a, b) => a - b);
      setStep(selectedPattern.patternId, lane.laneId, index,
              { active: nextChord.length > 0, chord: nextChord });
      return;   // chords are click-built, not painted
    }

    if (step.active && step.note === note) {
      setStep(selectedPattern.patternId, lane.laneId, index, { active: false });
      rollDrag = { laneId: lane.laneId, painting: false, lastIndex: index };
    } else {
      setStep(selectedPattern.patternId, lane.laneId, index, { active: true, note });
      rollDrag = { laneId: lane.laneId, painting: true, lastIndex: index };
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function rollMove(lane, event) {
    if (!rollDrag?.painting || rollDrag.laneId !== lane.laneId) return;
    const { index, note } = rollCellFromEvent(lane, event);
    if (index === rollDrag.lastIndex && lane.steps[index]?.active
        && lane.steps[index]?.note === note) return;
    rollDrag = { ...rollDrag, lastIndex: index };
    setStep(selectedPattern.patternId, lane.laneId, index, { active: true, note });
  }

  const rollUp = () => (rollDrag = null);

  // Velocity bars for the selected note/chord/drum lane, and value bars for cc/parameter
  // lanes: same bar-per-step gesture the arp grid uses.
  let barDrag = $state(null);   // { laneId, field, lastIndex }

  function barFromEvent(lane, event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.max(0, Math.min(lane.stepCount - 1,
      Math.floor(((event.clientX - rect.left) / rect.width) * lane.stepCount)));
    const height = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    return { index, height };
  }

  function barDown(lane, field, event) {
    event.preventDefault();
    barDrag = { laneId: lane.laneId, field, lastIndex: -1 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    barApply(lane, field, event);
  }

  function barApply(lane, field, event) {
    const { index, height } = barFromEvent(lane, event);
    const step = lane.steps[index];
    if (field === 'velocity') {
      if (!step?.active) return;   // velocity without a note is noise
      setStep(selectedPattern.patternId, lane.laneId, index,
              { velocity: Math.max(1, Math.round(height * 127)) });
    } else {
      setStep(selectedPattern.patternId, lane.laneId, index,
              { active: true, value: Math.round(height * 100) / 100 });
    }
  }

  function barMove(lane, field, event) {
    if (!barDrag || barDrag.laneId !== lane.laneId || barDrag.field !== field) return;
    barApply(lane, field, event);
  }

  const barUp = () => (barDrag = null);

  // The playhead column, coarse on purpose: the clip's engine-reported phase mapped onto
  // this lane's own loop (lanes are polymetric, so each maps separately).
  function playingColumn(lane) {
    const clip = clipForSelectedPattern;
    if (!clip?.active || !selectedPattern || !(selectedPattern.lengthPpq > 0)) return -1;
    const laneBeats = lane.stepCount / Math.max(1, lane.stepsPerBeat);
    if (!(laneBeats > 0)) return -1;
    const beatsIn = (clip.phase * selectedPattern.lengthPpq) % laneBeats;
    return Math.floor((beatsIn / laneBeats) * lane.stepCount) % lane.stepCount;
  }

  function laneLabel(lane) {
    if (lane.type === 'parameter')
      return `${lane.name || 'Automation'} — ${lane.parameterId || 'unassigned'}`;
    if (lane.type === 'drum') return `${lane.name || 'Drum'} — ${noteName(lane.drumNote)}`;
    if (lane.type === 'cc') return `${lane.name || 'CC'} — CC${lane.ccNumber}`;
    return lane.name || 'Notes';
  }

  function stepValueLabel(lane, step) {
    if (lane.type === 'cc' || lane.type === 'parameter') return step.value.toFixed(2);
    if (lane.type === 'drum') return String(step.velocity);
    return noteName(step.note);
  }
</script>

<div class="perf-panel" data-testid="host-performance-panel">
  <div class="perf-tabs">
    {#each [['patterns', 'Patterns'], ['clips', 'Clips & scenes'], ['setlist', 'Setlist']] as [id, label] (id)}
      <button type="button" class="toggle" class:on={tab === id} onclick={() => (tab = id)}
              data-testid={`perf-tab-${id}`}>{label}</button>
    {/each}
    <span class="perf-spacer"></span>
    {#if performance.capture.armed}
      <button type="button" class="toggle on recording" onclick={() => disarmCapture()}
              title="Capture is armed — played notes are written into the armed lane">
        ● Capturing
      </button>
    {/if}
  </div>

  {#if tab === 'patterns'}
    <div class="perf-body">
      <div class="pattern-list">
        <div class="perf-head">
          <strong>Patterns</strong>
          <button type="button" onclick={() => addPattern()} data-testid="perf-add-pattern">+ Pattern</button>
        </div>
        {#if patterns.length === 0}
          <div class="empty-hint">No patterns yet — one pattern holds any number of lanes.</div>
        {/if}
        {#each patterns as pattern (pattern.patternId)}
          <div class="pattern-row" class:on={selectedPattern?.patternId === pattern.patternId}>
            <button type="button" class="ghost pattern-name"
                    onclick={() => { selectedPatternId = pattern.patternId; selectedLaneId = ''; selectedStepIndex = -1; }}>
              {pattern.name}
            </button>
            <span class="pattern-detail">{pattern.lanes.length} {pattern.lanes.length === 1 ? 'lane' : 'lanes'}</span>
            <button type="button" class="ghost" title="Make a launchable clip from this pattern"
                    onclick={() => addClip(pattern.patternId)}>+ Clip</button>
            <button type="button" class="ghost danger" title="Remove this pattern and its clips"
                    onclick={() => removePattern(pattern.patternId)}>×</button>
          </div>
        {/each}
      </div>

      {#if selectedPattern}
        <div class="pattern-editor">
          <div class="perf-head">
            <input type="text" class="pattern-title" value={selectedPattern.name}
                   onchange={(e) => renamePattern(selectedPattern.patternId, e.currentTarget.value)} />
            <label class="mini-field" title="Delays every second step of each lane's own grid">
              Swing
              <input type="range" min="0" max="0.75" step="0.01" value={selectedPattern.swing}
                     onchange={(e) => setPatternOptions(selectedPattern.patternId,
                                                       { swing: Number(e.currentTarget.value) })} />
            </label>
            <select value="" aria-label="Add a lane"
                    onchange={(e) => { if (e.currentTarget.value) addLane(selectedPattern.patternId, { type: e.currentTarget.value }); e.currentTarget.value = ''; }}>
              <option value="" disabled>+ Add lane…</option>
              {#each laneTypes as type (type)}
                <option value={type}>{type}</option>
              {/each}
            </select>
          </div>

          {#each selectedPattern.lanes as lane (lane.laneId)}
            <div class="lane" class:on={selectedLane?.laneId === lane.laneId}
                 class:unresolved={!lane.resolved}>
              <div class="lane-head">
                <button type="button" class="ghost lane-name"
                        onclick={() => { selectedLaneId = lane.laneId; selectedStepIndex = -1; }}>
                  {laneLabel(lane)}
                </button>
                <span class="lane-target" title={lane.resolved ? '' : 'unresolved — this target is gone or carries a different plug-in'}>
                  {lane.targetName || (lane.resolved ? '' : 'missing')}
                </span>
                <PropertyToggle compact label="Mute" value={lane.muted}
                                ariaLabel={`Mute ${laneLabel(lane)}`}
                                onchange={(on) => setLaneOptions(selectedPattern.patternId, lane.laneId, { muted: on })} />
                <button type="button" class="ghost danger" title="Remove this lane"
                        onclick={() => removeLane(selectedPattern.patternId, lane.laneId)}>×</button>
              </div>

              {#if lane.type === 'note' || lane.type === 'chord'}
                <!-- The roll: rows are pitches, click places the note there, the lit cell
                     clicked again rests the step, dragging paints. Chord lanes stack
                     pitches per column instead of moving one. -->
                <div class="roll-wrap">
                  <div class="roll-ruler">
                    {#each Array.from({ length: ROLL_ROWS }, (_, r) => rollBaseFor(lane) + ROLL_ROWS - 1 - r) as rowNote (rowNote)}
                      <span class="ruler-cell" class:black={BLACK_KEYS.has(rowNote % 12)}>
                        {rowNote % 12 === 0 ? noteName(rowNote) : ''}</span>
                    {/each}
                  </div>
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="piano-roll" data-testid={`piano-roll-${lane.laneId}`}
                       onpointerdown={(e) => rollDown(lane, e)}
                       onpointermove={(e) => rollMove(lane, e)}
                       onpointerup={rollUp} onpointercancel={rollUp}
                       oncontextmenu={(e) => {
                         e.preventDefault();
                         selectedLaneId = lane.laneId;
                         selectedStepIndex = rollCellFromEvent(lane, e).index;
                       }}>
                    {#each lane.steps as step, index (index)}
                      <div class="roll-col" class:beat={index % lane.stepsPerBeat === 0}
                           class:playing={playingColumn(lane) === index}
                           class:selected={selectedLane?.laneId === lane.laneId && selectedStepIndex === index}>
                        {#each Array.from({ length: ROLL_ROWS }, (_, r) => rollBaseFor(lane) + ROLL_ROWS - 1 - r) as rowNote (rowNote)}
                          <div class="roll-cell"
                               class:black={BLACK_KEYS.has(rowNote % 12)}
                               class:on={stepPitches(lane, step).includes(rowNote)}
                               class:tie={step.tie && stepPitches(lane, step).includes(rowNote)}></div>
                        {/each}
                      </div>
                    {/each}
                  </div>
                  <div class="roll-side">
                    <button type="button" class="ghost" title="One octave up"
                            onclick={() => shiftRoll(lane, 1)}>▲</button>
                    <button type="button" class="ghost" title="One octave down"
                            onclick={() => shiftRoll(lane, -1)}>▼</button>
                  </div>
                </div>
                {#if selectedLane?.laneId === lane.laneId}
                  <!-- Dynamics under the melody, exactly the arp's gesture. -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="bar-lane" data-testid={`velocity-lane-${lane.laneId}`}
                       title="Velocity per step — drag"
                       onpointerdown={(e) => barDown(lane, 'velocity', e)}
                       onpointermove={(e) => barMove(lane, 'velocity', e)}
                       onpointerup={barUp} onpointercancel={barUp}>
                    {#each lane.steps as step, index (index)}
                      <div class="bar-col" class:idle={!step.active}
                           class:playing={playingColumn(lane) === index}>
                        {#if step.active}
                          <div class="bar-fill" style={`height: ${Math.max(step.velocity / 127 * 100, 4)}%`}></div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              {:else if lane.type === 'cc' || lane.type === 'parameter'}
                <!-- A value curve is bars, not a slider hidden behind each step. Dragging a
                     column writes and activates it; the step options still deactivate. -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="bar-lane tall" data-testid={`value-lane-${lane.laneId}`}
                     title="Value per step — drag"
                     onpointerdown={(e) => barDown(lane, 'value', e)}
                     onpointermove={(e) => barMove(lane, 'value', e)}
                     onpointerup={barUp} onpointercancel={barUp}
                     oncontextmenu={(e) => {
                       e.preventDefault();
                       selectedLaneId = lane.laneId;
                       selectedStepIndex = barFromEvent(lane, e).index;
                     }}>
                  {#each lane.steps as step, index (index)}
                    <div class="bar-col" class:idle={!step.active}
                         class:beat={index % lane.stepsPerBeat === 0}
                         class:playing={playingColumn(lane) === index}>
                      {#if step.active}
                        <div class="bar-fill value" style={`height: ${Math.max(step.value * 100, 3)}%`}></div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="step-grid" style={`--steps: ${lane.stepCount}`}>
                  {#each lane.steps as step, index (index)}
                    <button type="button" class="step"
                            class:active={step.active}
                            class:tie={step.tie}
                            class:beat={index % lane.stepsPerBeat === 0}
                            class:selected={selectedLane?.laneId === lane.laneId && selectedStepIndex === index}
                            title={step.active ? `${stepValueLabel(lane, step)} · vel ${step.velocity} · ${step.probability}%` : `step ${index + 1}`}
                            onclick={() => {
                              selectedLaneId = lane.laneId;
                              selectedStepIndex = index;
                              toggleStep(selectedPattern.patternId, lane.laneId, index);
                            }}
                            oncontextmenu={(e) => { e.preventDefault(); selectedLaneId = lane.laneId; selectedStepIndex = index; }}>
                      {#if step.active}<span class="step-mark">{step.ratchets > 1 ? step.ratchets : ''}</span>{/if}
                    </button>
                  {/each}
                </div>
                {#if selectedLane?.laneId === lane.laneId && lane.type === 'drum'}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="bar-lane" data-testid={`velocity-lane-${lane.laneId}`}
                       title="Velocity per step — drag"
                       onpointerdown={(e) => barDown(lane, 'velocity', e)}
                       onpointermove={(e) => barMove(lane, 'velocity', e)}
                       onpointerup={barUp} onpointercancel={barUp}>
                    {#each lane.steps as step, index (index)}
                      <div class="bar-col" class:idle={!step.active}
                           class:playing={playingColumn(lane) === index}>
                        {#if step.active}
                          <div class="bar-fill" style={`height: ${Math.max(step.velocity / 127 * 100, 4)}%`}></div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              {/if}
            </div>
          {/each}

          {#if selectedLane}
            <div class="lane-options" data-testid="perf-lane-options">
              <label class="mini-field">Steps
                <input type="number" min="1" max="64" value={selectedLane.stepCount}
                       onchange={(e) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId,
                                                       { stepCount: Number(e.currentTarget.value) })} />
              </label>
              <label class="mini-field" title="Steps per beat — a lane's own rate, which is what makes polymeter free">
                Rate
                <select value={selectedLane.stepsPerBeat}
                        onchange={(e) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId,
                                                        { stepsPerBeat: Number(e.currentTarget.value) })}>
                  {#each [1, 2, 3, 4, 6, 8, 12, 16] as rate (rate)}
                    <option value={rate}>{rate}/beat</option>
                  {/each}
                </select>
              </label>
              {#if selectedLane.type !== 'parameter'}
                <label class="mini-field">Part
                  <select value={selectedLane.targetPartId}
                          onchange={(e) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId,
                                                          { targetPartId: e.currentTarget.value })}>
                    {#each parts as part (part.partId)}
                      <option value={part.partId}>{part.pluginName || 'Empty part'}</option>
                    {/each}
                  </select>
                </label>
              {/if}
              {#if selectedLane.type === 'drum'}
                <label class="mini-field">Note
                  <input type="number" min="0" max="127" value={selectedLane.drumNote}
                         onchange={(e) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId,
                                                         { drumNote: Number(e.currentTarget.value) })} />
                </label>
              {/if}
              {#if selectedLane.type === 'cc'}
                <label class="mini-field">CC
                  <input type="number" min="0" max="127" value={selectedLane.ccNumber}
                         onchange={(e) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId,
                                                         { ccNumber: Number(e.currentTarget.value) })} />
                </label>
              {/if}
              {#if selectedLane.type === 'cc' || selectedLane.type === 'parameter'}
                <PropertyToggle compact label="Glide" value={selectedLane.glide}
                                ariaLabel="Interpolate between steps"
                                onchange={(on) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId, { glide: on })} />
              {/if}
              <label class="mini-field" title="Spread N hits evenly over the lane's steps">
                Euclid
                <input type="number" min="0" max={selectedLane.stepCount} value={selectedLane.euclidPulses}
                       onchange={(e) => euclidFill(selectedPattern.patternId, selectedLane.laneId,
                                                   Number(e.currentTarget.value))} />
              </label>
              <button type="button" class="ghost"
                      onclick={() => clearLane(selectedPattern.patternId, selectedLane.laneId)}>Clear</button>
              {#if clipForSelectedPattern}
                <button type="button" class="toggle"
                        class:on={performance.capture.armed && performance.capture.laneId === selectedLane.laneId}
                        title="Arm this lane: played notes are quantized onto its grid"
                        onclick={() => (performance.capture.armed && performance.capture.laneId === selectedLane.laneId
                                          ? disarmCapture()
                                          : armCapture(clipForSelectedPattern.clipId, selectedLane.laneId))}
                        data-testid="perf-arm-capture">● Capture</button>
              {/if}
            </div>
          {/if}

          {#if selectedStep && selectedLane}
            <div class="step-options" data-testid="perf-step-options">
              <strong>Step {selectedStepIndex + 1}</strong>
              {#if selectedLane.type === 'note' || selectedLane.type === 'chord'}
                <label class="mini-field">Note
                  <input type="number" min="0" max="127" value={selectedStep.note}
                         onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                  { note: Number(e.currentTarget.value) })} />
                </label>
              {/if}
              {#if selectedLane.type === 'cc' || selectedLane.type === 'parameter'}
                <label class="mini-field">Value
                  <input type="range" min="0" max="1" step="0.01" value={selectedStep.value}
                         onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                  { value: Number(e.currentTarget.value) })} />
                </label>
              {:else}
                <label class="mini-field">Velocity
                  <input type="number" min="1" max="127" value={selectedStep.velocity}
                         onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                  { velocity: Number(e.currentTarget.value) })} />
                </label>
                <label class="mini-field">Gate
                  <input type="range" min="0.05" max="4" step="0.05" value={selectedStep.gate}
                         onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                  { gate: Number(e.currentTarget.value) })} />
                </label>
                <label class="mini-field" title="Retriggers inside this step">Ratchet
                  <input type="number" min="1" max="8" value={selectedStep.ratchets}
                         onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                  { ratchets: Number(e.currentTarget.value) })} />
                </label>
                <PropertyToggle compact label="Tie" value={selectedStep.tie} ariaLabel="Tie to the previous step"
                                onchange={(on) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex, { tie: on })} />
              {/if}
              <label class="mini-field" title="Rolled from the pattern's seed, so the same seed replays the same show">
                Chance
                <input type="number" min="0" max="100" value={selectedStep.probability}
                       onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                { probability: Number(e.currentTarget.value) })} />
              </label>
              <label class="mini-field" title="Nudge, as a fraction of a step">Nudge
                <input type="range" min="-0.5" max="0.5" step="0.01" value={selectedStep.microtiming}
                       onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                { microtiming: Number(e.currentTarget.value) })} />
              </label>
              <label class="mini-field" title="Play only on every Nth loop">Every
                <input type="number" min="1" max="16" value={selectedStep.every}
                       onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                { every: Number(e.currentTarget.value) })} />
              </label>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if tab === 'clips'}
    <div class="perf-body">
      <div class="clip-column">
        <div class="perf-head">
          <strong>Clips</strong>
          <button type="button" class="ghost" onclick={() => stopAllClips()}>Stop all</button>
        </div>
        {#if performance.clips.length === 0}
          <div class="empty-hint">No clips yet — make one from a pattern.</div>
        {/if}
        {#each performance.clips as clip (clip.clipId)}
          <div class="clip-row" class:active={clip.active} class:pending={clip.pending}
               data-testid="perf-clip">
            <button type="button" class="clip-launch"
                    title={clip.active ? 'Stop at the next boundary' : 'Launch at the next boundary'}
                    onclick={() => (clip.active ? stopClip(clip.clipId) : launchClip(clip.clipId))}>
              {clip.pending ? '⧗' : clip.active ? '■' : '▶'}
            </button>
            <span class="clip-name">{clip.name}</span>
            <span class="clip-phase" aria-hidden="true">
              <span class="clip-phase-fill" style={`width: ${Math.round(clip.phase * 100)}%`}></span>
            </span>
            <select value={clip.launchQuantize} aria-label={`${clip.name} launch quantization`}
                    onchange={(e) => setClipOptions(clip.clipId, { launchQuantize: e.currentTarget.value })}>
              {#each quantizeOptions as option (option)}
                <option value={option}>{option}</option>
              {/each}
            </select>
            <PropertyToggle compact label="Loop" value={clip.loop} ariaLabel={`${clip.name} loops`}
                            onchange={(on) => setClipOptions(clip.clipId, { loop: on })} />
            <button type="button" class="ghost danger" onclick={() => removeClip(clip.clipId)}>×</button>
          </div>
        {/each}
      </div>

      <div class="scene-column">
        <div class="perf-head">
          <strong>Scenes</strong>
          <button type="button" onclick={() => addScene()} data-testid="perf-add-scene">+ Scene</button>
        </div>
        {#if performance.scenes.length === 0}
          <div class="empty-hint">
            A scene recalls clips, mixer state and macros together — add one to capture the rig as it stands.
          </div>
        {/if}
        {#each performance.scenes as scene (scene.sceneId)}
          <div class="scene-row" data-testid="perf-scene">
            <button type="button" class="clip-launch" title="Launch this scene at its boundary"
                    onclick={() => launchScene(scene.sceneId)}>▶</button>
            <span class="clip-name">{scene.name}</span>
            <span class="scene-detail">{scene.clipIds.length} clips · {scene.numSlots} slots · {scene.numMacros} macros</span>
            <select value={scene.launchQuantize} aria-label={`${scene.name} launch quantization`}
                    onchange={(e) => setSceneOptions(scene.sceneId, { launchQuantize: e.currentTarget.value })}>
              {#each quantizeOptions as option (option)}
                <option value={option}>{option}</option>
              {/each}
            </select>
            <button type="button" class="ghost" title="Replace this scene's contents with the rig as it stands"
                    onclick={() => captureScene(scene.sceneId)}>Capture</button>
            <button type="button" class="ghost" title="Add to the setlist"
                    onclick={() => addSetlistItem(scene.sceneId)}>+ Set</button>
            <button type="button" class="ghost danger" onclick={() => removeScene(scene.sceneId)}>×</button>
          </div>
          {#if performance.clips.length > 0}
            <div class="scene-clips">
              {#each performance.clips as clip (clip.clipId)}
                <button type="button" class="chip" class:on={scene.clipIds.includes(clip.clipId)}
                        title={`Include ${clip.name} in ${scene.name}`}
                        onclick={() => setSceneClip(scene.sceneId, clip.clipId,
                                                    !scene.clipIds.includes(clip.clipId))}>
                  {clip.name}
                </button>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  {#if tab === 'setlist'}
    <div class="perf-body setlist-body" data-testid="perf-setlist">
      <div class="perf-head">
        <strong>Setlist</strong>
        <button type="button" class="ghost" onclick={() => setlistPrev()}>← Prev</button>
        <button type="button" class="ghost" onclick={() => setlistNext()} data-testid="perf-setlist-next">Next →</button>
      </div>
      {#if performance.setlist.items.length === 0}
        <div class="empty-hint">
          Nothing in the setlist — add scenes to it, then walk them with Prev and Next on stage.
        </div>
      {/if}
      {#each performance.setlist.items as item, index (item.itemId)}
        <div class="setlist-item" class:current={performance.setlist.currentIndex === index}
             class:missing={item.missing}>
          <button type="button" class="ghost setlist-go" onclick={() => setlistGo(index)}>{index + 1}</button>
          <input type="text" class="setlist-name" value={item.name}
                 onchange={(e) => setSetlistItem(item.itemId, { name: e.currentTarget.value })} />
          <span class="setlist-scene">
            {item.missing ? 'scene is gone' : item.sceneName}
          </span>
          <input type="text" class="setlist-notes" placeholder="notes for the stage…" value={item.notes}
                 onchange={(e) => setSetlistItem(item.itemId, { notes: e.currentTarget.value })} />
          <label class="mini-field" title="0 keeps the current tempo">Tempo
            <input type="number" min="0" max="300" value={item.tempo}
                   onchange={(e) => setSetlistItem(item.itemId, { tempo: Number(e.currentTarget.value) })} />
          </label>
          <button type="button" class="ghost danger" onclick={() => removeSetlistItem(item.itemId)}>×</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .perf-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px 14px 0;
    padding: 10px;
    border: 1px solid #3b4652;
    border-radius: 6px;
    background: #171a1d;
    max-height: 460px;
    overflow-y: auto;
  }

  .perf-tabs { display: flex; align-items: center; gap: 6px; }
  .perf-spacer { flex: 1; }
  .recording { color: #e4b3b3; border-color: #7a4a4a; }

  .perf-body { display: flex; gap: 16px; align-items: flex-start; }
  .perf-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .empty-hint { color: #7d8894; padding: 8px 2px; font-size: 12px; }

  .pattern-list { flex: 0 0 240px; display: flex; flex-direction: column; gap: 4px; }
  .pattern-row { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .pattern-row.on .pattern-name { color: #d6dbe0; border-color: #5b9bd5; }
  .pattern-name { flex: 1; text-align: left; }
  .pattern-detail { color: #7d8894; font-size: 11px; }

  .pattern-editor { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .pattern-title { flex: 1; min-width: 120px; }

  .lane {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid #2c343d;
    border-radius: 4px;
    padding: 6px;
    background: #1c2126;
  }
  .lane.on { border-color: #5b9bd5; }
  .lane.unresolved { border-color: #7a4a4a; }
  .lane-head { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .lane-name { flex: 0 0 auto; }
  .lane-target { flex: 1; color: #7d8894; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lane.unresolved .lane-target { color: #d6a3a3; }

  .roll-wrap { display: flex; gap: 3px; align-items: stretch; }
  .roll-ruler { display: flex; flex-direction: column; width: 26px; flex: 0 0 auto; }
  .ruler-cell { flex: 1; font-size: 7px; color: #66707b; line-height: 1;
                display: flex; align-items: center; }
  .ruler-cell.black { background: #12171d; }
  .piano-roll { flex: 1; display: flex; gap: 1px; height: 150px; background: #10161c;
                border: 1px solid #232c36; border-radius: 4px; padding: 2px;
                cursor: crosshair; touch-action: none; }
  .roll-col { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 4px; }
  .roll-col.beat { border-left: 1px solid #232c36; }
  .roll-col.playing { background: #24384c; border-radius: 1px; }
  .roll-col.selected { outline: 1px solid #3d81c4; outline-offset: -1px; }
  .roll-cell { flex: 1; background: #161e27; border-radius: 1px; }
  .roll-cell.black { background: #131a22; }
  .roll-cell.on { background: #3d81c4; }
  .roll-cell.on.tie { background: #7fb4e0; }
  .roll-col.playing .roll-cell.on { background: #9cd0f7; }
  .roll-side { display: flex; flex-direction: column; gap: 2px; justify-content: center; }
  .bar-lane { display: flex; gap: 1px; height: 34px; margin-top: 3px; background: #10161c;
              border: 1px solid #232c36; border-radius: 4px; padding: 2px;
              cursor: crosshair; touch-action: none; }
  .bar-lane.tall { height: 72px; }
  .bar-col { flex: 1; display: flex; align-items: flex-end; background: #161e27;
             border-radius: 1px; min-width: 4px; }
  .bar-col.idle { opacity: 0.35; }
  .bar-col.playing { background: #24384c; }
  .bar-fill { width: 100%; background: #4aa88c; border-radius: 1px 1px 0 0; }
  .bar-fill.value { background: #b4854a; }
  .step-grid {
    display: grid;
    grid-template-columns: repeat(var(--steps), minmax(0, 1fr));
    gap: 2px;
  }
  .step {
    height: 26px;
    padding: 0;
    background: #14171a;
    border: 1px solid #2c343d;
    border-radius: 3px;
    color: #7d8894;
    font-size: 10px;
  }
  .step.beat { border-color: #3b4652; }
  .step.active { background: #2f6ea8; border-color: #5b9bd5; color: #eef4fa; }
  .step.tie { background: #24485f; }
  .step.selected { outline: 1px solid #d5a93a; outline-offset: -1px; }
  .step-mark { pointer-events: none; }

  .lane-options, .step-options {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    flex-wrap: wrap;
    border-top: 1px solid #2c343d;
    padding-top: 6px;
  }
  .mini-field { display: flex; flex-direction: column; gap: 3px; color: #9aa5b1; font-size: 11px; }
  .mini-field input[type='number'] { width: 62px; }
  .mini-field input[type='range'] { width: 90px; }

  .clip-column, .scene-column { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .clip-row, .scene-row { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .clip-launch { padding: 2px 8px; }
  .clip-row.active .clip-launch { color: #9fd6a3; border-color: #4a7a52; }
  .clip-row.pending .clip-launch { color: #e0cf9a; border-color: #7a6a3a; }
  .clip-name { flex: 0 0 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .clip-phase { flex: 1; height: 4px; background: #14171a; border-radius: 2px; overflow: hidden; min-width: 30px; }
  .clip-phase-fill { display: block; height: 100%; background: #5b9bd5; }
  .scene-detail { flex: 1; color: #7d8894; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scene-clips { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 6px 30px; }
  .chip {
    padding: 1px 6px;
    font-size: 11px;
    background: none;
    border: 1px solid #3b4652;
    color: #7d8894;
  }
  .chip.on { color: #d6dbe0; border-color: #5b9bd5; background: #24313d; }

  .setlist-body { flex-direction: column; }
  .setlist-item { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .setlist-item.current { background: #24313d; border-radius: 4px; }
  .setlist-go { flex: 0 0 26px; }
  .setlist-name { flex: 0 0 140px; }
  .setlist-scene { flex: 0 0 120px; color: #7d8894; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .setlist-item.missing .setlist-scene { color: #d6a3a3; }
  .setlist-notes { flex: 1; min-width: 80px; }

  button {
    background: #232a31;
    border: 1px solid #3b4652;
    border-radius: 4px;
    color: #d6dbe0;
    padding: 4px 10px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  button:hover:not(:disabled) { border-color: #5b9bd5; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.toggle { padding: 3px 7px; color: #7d8894; }
  button.toggle.on { color: #d6dbe0; border-color: #5b9bd5; background: #24313d; }
  button.ghost { background: none; border-color: transparent; color: #7d8894; }
  button.ghost:hover { color: #d6dbe0; border-color: #3b4652; }
  button.ghost.danger:hover { color: #e4b3b3; border-color: #7a4a4a; }

  input, select {
    background: #14171a;
    border: 1px solid #3b4652;
    border-radius: 4px;
    color: #d6dbe0;
    padding: 3px 6px;
    font: inherit;
    font-size: 12px;
  }
</style>
