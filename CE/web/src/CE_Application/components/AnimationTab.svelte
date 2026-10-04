<script>
  /**
   * The Animation tab.
   *
   * Candidate 8 of the display-panel plan. See docs/design/animation-tab-design.md.
   *
   * Two things to know before editing this file.
   *
   * FIRST, the tab exists because the editor let you build animations that never run and said
   * nothing. Its first version caught targets the runtime ignores (Fill colour and Text colour,
   * until the runtime grew a colour bucket). The animation overhaul made triggers real, which
   * brought two new ways to be silently wrong: a From/To naming a state the control does not have,
   * and two animations tying for one property so the earlier never plays. The tab names all three.
   * utils/animationModel.js has the rules, and its test runs the real runtime to check them.
   *
   * SECOND, THE PROPERTIES PANEL STILL EDITS EVERYTHING it always did, JSON box and all; only its
   * Kind hint changed, to name keyframes and send them here, since this tab has the only editor for
   * their frames. allAnimationFieldLabels() is there for the day the panel's rows do come out,
   * because the panel builds its search box from the rows it draws.
   *
   * THIRD, THERE ARE TWO KINDS WITH KEYFRAMES IN THEM, and they are not the same thing. `keyframes`
   * (utils/keyframeAnimation.js) is one list of frames played by CSS on one part: a pulse, a blink.
   * `sequence` (utils/keyframeModel.js) is a track per target along a time axis, played by anime.js
   * over the document's values — the only kind that reaches a value channel or a filmstrip frame,
   * and the one a value trigger scrubs. They were built on two branches under one name; the merge
   * kept both. The Frames editor belongs to the first, the track timeline to the second.
   *
   * The Animation sections in Display and PixelDisplay are a different feature — playing a GIF or
   * sprite sheet on a dot-matrix screen — and have nothing to do with this one. The candidate list
   * grouped them by name.
   */
  import { onDestroy, onMount } from 'svelte';
  import Plus from 'lucide-svelte/icons/plus';
  import Play from 'lucide-svelte/icons/play';
  import Square from 'lucide-svelte/icons/square';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import AnimationList from './animation/AnimationList.svelte';
  import TargetList from './animation/TargetList.svelte';
  import EasingCurve from './animation/EasingCurve.svelte';
  import StateChips from './animation/StateChips.svelte';
  import AnimationStage from './animation/AnimationStage.svelte';
  import BezierEditor from './animation/BezierEditor.svelte';
  import FramesEditor from './animation/FramesEditor.svelte';
  import Timeline from './animation/Timeline.svelte';
  import KeyframeTimeline from './animation/KeyframeTimeline.svelte';
  import * as anime from '../utils/animeTimeline.js';
  import { addKeyframe, removeKeyframe, updateKeyframe, normalizeKeyframes, keyframesDuration, sampleKeyframes, isColourTarget } from '../utils/keyframeModel.js';
  import { scrubKeyframes, clearKeyframeScrub, playKeyframesPreview } from '../utils/keyframePlayer.js';
  import { setDebugDock } from '../stores/debugDock.js';
  import { displayTabRequest } from '../stores/displayTab.js';
  import { animationActivity } from '../stores/animationActivity.js';
  import NumberCell from '../properties/NumberCell.svelte';
  import Segmented from '../properties/Segmented.svelte';
  import PropertySelect from '../properties/PropertySelect.svelte';
  import { activePanel, selectedComponentIds } from '../stores/panels.js';
  import { updateControlProperty, removeControlNode, getSection, applyControlPatch } from '../stores/controls.js';
  import { ANIMATION_PRESETS, PRESET_BY_ID, presetPatch, presetBlockedBecause } from '../utils/animationPresets.js';
  import { beginHistoryTransaction, commitHistoryTransaction } from '../stores/history.js';
  import { flatControls } from '../utils/containment.js';
  import {
    editorTarget,
    activateEditorTarget,
    armEditorTargetIfIdle,
    clearEditorTarget,
    targetOfKind,
  } from '../stores/editorTarget.js';
  import {
    readAnimations,
    animationsEnabled,
    describeTargets,
    deadTargetCount,
    addTarget,
    removeTarget,
    moveTarget,
    buildTarget,
    OFFERED_PROPERTIES,
    OFFERED_ROOT_PROPERTIES,
    CONTROL_ITSELF,
    TRIGGER_TYPES,
    EASING_CHOICES,
    CUSTOM_EASING,
    SPRING_EASING,
    SPRING_LIMITS,
    easingPatch,
    cleanSpring,
    ANIMATION_KINDS,
    SEQUENCE_KIND,
    EASING_NAMES,
    offeredTargetsFor,
    resolvedPartsOf,
    baseValueAt,
    sequenceTargetStatus,
    KEYFRAME_TRIGGER_TYPES,
    KEYFRAME_TRIGGER_LABELS,
    keyframeTargets,
    kindPatch,
    targetStatus,
    newAnimationShape,
    cleanAnimationName,
    uniqueAnimationName,
    renameBlockedBecause,
    controlStateNames,
    triggerStateChoices,
    unknownTriggerStates,
    findClashes,
    clashesFor,
    VALUE_ORIGINS,
    animationDebugPayload,
  } from '../utils/animationModel.js';

  let mine = $derived(targetOfKind($editorTarget, 'animation'));
  let panelControls = $derived(flatControls($activePanel?.controls ?? []));

  let control = $derived(
    mine?.controlId
      ? panelControls.find((entry) => entry._children?.Core?.id === mine.controlId) ?? null
      : null
  );

  let controlId = $derived(control?._children?.Core?.id ?? '');
  let controlName = $derived(control?._children?.Core?.name || control?._children?.Core?.controlType || '');
  let section = $derived(getSection(control, 'Animations'));
  let partNames = $derived(Object.keys(getSection(control, 'Parts')?._children ?? {}));

  let rows = $derived(control ? readAnimations(control) : []);
  let allOn = $derived(control ? animationsEnabled(control) : true);

  let wantedName = $state('');
  let selectedName = $derived(rows.some((row) => row.name === wantedName) ? wantedName : (rows[0]?.name ?? ''));
  let selected = $derived(rows.find((row) => row.name === selectedName) ?? null);

  let sequence = $derived(selected?.kind === SEQUENCE_KIND);
  // For "does this part exist" on a sequence, generator-made parts count: a filmstrip's frame
  // lives on one, and the document never holds it.
  let knownPartNames = $derived(sequence ? [...new Set([...partNames, ...Object.keys(resolvedPartsOf(control))])] : partNames);
  let targets = $derived(selected ? describeTargets(selected, knownPartNames) : []);
  let deadCount = $derived(rows.reduce((sum, row) => sum + deadTargetCount(row, partNames), 0));

  // Triggers name states by the control's own States keys; anything else never matches.
  let stateNames = $derived(control ? controlStateNames(control) : []);
  let stateChoices = $derived(triggerStateChoices(stateNames));
  let unknownStates = $derived(selected ? unknownTriggerStates(selected, stateNames) : []);
  let unknownFrom = $derived(unknownStates.filter((name) => selected?.from.includes(name)));
  let unknownTo = $derived(unknownStates.filter((name) => selected?.to.includes(name)));
  let unknownCount = $derived(rows.reduce((sum, row) => sum + unknownTriggerStates(row, stateNames).length, 0));

  // Two animations tying for one property: the later always plays, the earlier never does there.
  let clashes = $derived(findClashes(rows, partNames));
  let selectedClashes = $derived(selected ? clashesFor(selected.name, clashes) : []);

  let keyframes = $derived(selected?.kind === 'keyframes');
  const KIND_LABELS = { transition: 'Transition', keyframes: 'Keyframes', sequence: 'Sequence' };
  const KIND_TITLES = {
    transition: 'Eases between two styles when something changes',
    keyframes: 'Plays a shape of its own on one part — a pulse, a blink — looping, on the beat, or from a script',
    sequence: 'Tracks along a time axis, one per change, each with its own keyframes; a value trigger scrubs it',
  };

  const ORIGIN_LABELS = { any: 'Any', user: 'Mine', external: 'Outside' };
  const ORIGIN_TITLES = {
    any: 'Every change of the value',
    user: 'Only while the pointer or keyboard is on the control — a drag is never animated either way',
    external: 'Only changes from outside: MIDI coming back, host automation, a script',
  };

  let rawTargetIndex = $state(-1);
  let targetIndex = $derived(rawTargetIndex >= 0 && rawTargetIndex < targets.length ? rawTargetIndex : -1);

  // What the "add a target" row is set to.
  let newPart = $state('');
  let newProperty = $state(OFFERED_PROPERTIES[0].path);
  // A change lands on one of the control's parts or on the control itself. A control with no parts
  // of its own has only the second — and until this was offered, the Add button was simply dead
  // for it, with nothing to say why.
  let onControl = $derived(newPart === CONTROL_ITSELF || !partNames.length);
  let partForAdd = $derived(onControl ? '' : (newPart || partNames[0] || ''));
  let partOptions = $derived([
    ...partNames.map((name) => ({ value: name, label: name })),
    { value: CONTROL_ITSELF, label: 'The control itself' },
  ]);
  // What the Change dropdown offers: the part's properties or the control's own, and for a
  // sequence the control's value channels and a frame track per filmstrip part.
  let offered = $derived(offeredTargetsFor(control, selected?.kind, { onControl }));
  let offeredForAdd = $derived(offered.find((entry) => entry.path === newProperty) ?? offered[0]);
  // Tell the user before they add it, not after.
  let addStatus = $derived(sequence
    ? sequenceTargetStatus(buildTarget(partForAdd, offeredForAdd), knownPartNames, { triggerType: selected?.triggerType ?? 'stateChange' })
    : targetStatus(buildTarget(partForAdd, offeredForAdd), partNames));

    // Arm from the selection only when NOTHING is armed — not merely when nothing of this kind is.
  // A target of another kind means another tab is being opened right now, and stealing it is how
  // the properties panel's opener buttons looked broken. See stores/editorTarget.js.
onMount(() => {
    if (mine) return;
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) armEditorTargetIfIdle('animation', first);
  });

  function armFromSelection() {
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) activateEditorTarget('animation', first);
  }

  function setProp(prop, value) {
    if (!controlId || !selectedName) return;
    updateControlProperty(controlId, `Animations.${selectedName}.${prop}`, value);
  }

  /** Several fields of the selected animation in one write — one undo step, one re-render. */
  function setProps(patch) {
    if (!controlId || !selectedName || !selected) return;
    updateControlProperty(controlId, `Animations.${selectedName}`, { ...selected.animation, ...patch });
  }

  /** A drag or an arrow key on the timeline: one write, so one undo step. */
  function retimeAnimation(name, { delay, duration }) {
    const row = rows.find((entry) => entry.name === name);
    if (!controlId || !row) return;
    updateControlProperty(controlId, `Animations.${name}`, { ...row.animation, delay, duration });
  }

  /** The animation as it is stored, in the Console tab's debug pane — and the tab, so it is seen. */
  function debugSelected() {
    if (!selected) return;
    setDebugDock(animationDebugPayload(controlId, selected));
    displayTabRequest.set({ tab: 'console' });
  }

  const EASING_TITLES = {
    [CUSTOM_EASING]: 'Draw your own curve: two control points you drag',
    [SPRING_EASING]: 'A spring that overshoots and settles; set how stiff and how bouncy',
  };

  function writeTargets(next) {
    if (!controlId || !selectedName) return;
    updateControlProperty(controlId, `Animations.${selectedName}.targets`, next);
  }

  // --- Sequences: the time axis, the playhead on the canvas, and one keyframe at a time ----------

  let axisLength = $derived(sequence ? keyframesDuration(selected.animation) : 0);
  let tracks = $derived(sequence
    ? targets.map((row) => ({ label: trackLabel(row), path: row.path, keyframes: normalizeKeyframes(row.target) }))
    : []);
  let playhead = $state(0);
  let selectedKeyframe = $state(null); // { track, index }
  let keyframeAt = $derived.by(() => {
    if (!sequence || !selectedKeyframe) return null;
    const target = selected.targets[selectedKeyframe.track];
    const frames = target ? normalizeKeyframes(target) : [];
    const keyframe = frames[selectedKeyframe.index];
    return keyframe ? { ...selectedKeyframe, target, keyframe, colour: isColourTarget(target) } : null;
  });
  let playing = $state(false);
  let stopPreview = null;
  // The keyframe in the hand, while it is being dragged: { track, index, time }. The document is
  // written once, on release, so this is what the readouts show until then.
  let draggedKeyframe = $state(null);
  // The selected keyframe's time, live. The transport's other number is the playhead's, and the
  // "Keyframe at … ms" button says where a NEW one would go; neither says where this one is.
  let selectedKeyframeTime = $derived(
    draggedKeyframe && keyframeAt && draggedKeyframe.track === keyframeAt.track && draggedKeyframe.index === keyframeAt.index
      ? draggedKeyframe.time
      : (keyframeAt?.keyframe.time ?? null)
  );

  function trackLabel(row) {
    const [, partName, ...rest] = row.path.startsWith('Parts.') ? row.path.split('.') : ['', '', row.path];
    const whole = offered.find((entry) => entry.scope === 'control' && entry.path === row.path);
    if (whole) return whole.label;
    if (!partName) {
      const own = OFFERED_ROOT_PROPERTIES.find((e) => e.path === row.path);
      return own ? `Control · ${own.label}` : row.path;
    }
    const entry = OFFERED_PROPERTIES.find((e) => e.path === rest.join('.'));
    return `${partName} · ${entry?.label ?? rest.join('.')}`;
  }

  /** The canvas shows the pose at the playhead, in any view. */
  function scrubTo(ms) {
    playhead = Math.max(0, Math.round(ms));
    if (controlId && selected && sequence) scrubKeyframes(controlId, selectedName, selected.animation, playhead);
  }

  function stopPlaying() {
    stopPreview?.();
    stopPreview = null;
    playing = false;
  }

  function togglePlay() {
    if (!controlId || !selected || !sequence) return;
    if (playing) {
      stopPlaying();
      scrubTo(playhead);
      return;
    }
    playing = true;
    stopPreview = playKeyframesPreview(controlId, selectedName, selected.animation, {
      ontime: (ms) => { playhead = Math.round(ms); },
      ondone: () => { playing = false; stopPreview = null; },
    });
  }

  function writeTrack(trackIndex, nextTarget) {
    writeTargets(selected.targets.map((target, index) => (index === trackIndex ? nextTarget : target)));
  }

  /** A keyframe on the selected track at the playhead, holding whatever the pose there is. */
  function addKeyframeAtPlayhead() {
    if (!selected || !sequence) return;
    const trackIndex = targetIndex >= 0 ? targetIndex : 0;
    const target = selected.targets[trackIndex];
    if (!target) return;
    const pose = sampleKeyframes(anime, selected.animation, playhead);
    const value = pose[target.path] ?? baseValueAt(control, target.path) ?? 0;
    const next = addKeyframe(target, { time: playhead, value });
    writeTrack(trackIndex, next);
    selectedKeyframe = { track: trackIndex, index: normalizeKeyframes(next).findIndex((k) => k.time === playhead) };
    rawTargetIndex = trackIndex;
  }

  function deleteSelectedKeyframe() {
    if (!keyframeAt) return;
    writeTrack(keyframeAt.track, removeKeyframe(keyframeAt.target, keyframeAt.index));
    selectedKeyframe = null;
  }

  function patchSelectedKeyframe(patch) {
    if (!keyframeAt) return;
    const result = updateKeyframe(keyframeAt.target, keyframeAt.index, patch);
    writeTrack(keyframeAt.track, result.target);
    selectedKeyframe = result.index >= 0 ? { track: keyframeAt.track, index: result.index } : null;
    if (patch.time != null) scrubTo(patch.time);
  }

  /** The timeline dragged some keyframes; each lands where it was dropped, as one store write. */
  function moveKeyframes(moves) {
    if (!selected) return;
    const next = [...selected.targets];
    let follow = null;
    for (const move of moves) {
      const target = next[move.track];
      if (!target) continue;
      const result = updateKeyframe(target, move.index, { time: move.time });
      next[move.track] = result.target;
      if (selectedKeyframe?.track === move.track && selectedKeyframe?.index === move.index) follow = { track: move.track, index: result.index };
    }
    writeTargets(next);
    // The selection follows the keyframe; the playhead does not. It moves from the ruler only.
    if (follow) selectedKeyframe = follow;
  }

  // While a sequence is open, the canvas shows its pose at the playhead — on arrival, after every
  // edit (the scrub rebuilds when the definition changes), and as the playhead moves. Anything
  // else open on the control takes the pose off again. While playing, the preview owns the
  // overlay and this stays out of its way.
  $effect(() => {
    if (!controlId) return;
    if (playing) return;
    if (!sequence || !selected) {
      clearKeyframeScrub(controlId);
      return;
    }
    scrubKeyframes(controlId, selectedName, selected.animation, playhead);
  });

  // Another control, or the tab closing, takes the pose off the one before. This depends on the
  // id alone, so it does not run (and clear what the effect above just posed) on every edit.
  $effect(() => {
    const id = controlId;
    return () => {
      stopPlaying();
      if (id) clearKeyframeScrub(id);
    };
  });
  onDestroy(() => { stopPlaying(); if (controlId) clearKeyframeScrub(controlId); });

  function add() {
    if (!selected) return;
    const target = buildTarget(partForAdd, offeredForAdd);
    if (!target) return;
    // On a sequence a new track starts with one keyframe holding the authored value, as the kind
    // switch seeds, so adding it changes nothing on screen until a second one.
    if (sequence) {
      const base = baseValueAt(control, target.path);
      target.keyframes = base === undefined ? [] : [{ time: 0, value: base, easing: 'outQuad' }];
    }
    writeTargets(addTarget(selected.targets, target));
    rawTargetIndex = selected.targets.length;
  }

  function drop(index) {
    if (!selected) return;
    writeTargets(removeTarget(selected.targets, index));
    rawTargetIndex = -1;
  }

  function reorder(from, to) {
    if (!selected) return;
    writeTargets(moveTarget(selected.targets, from, to));
  }

  // --- Making and unmaking an animation --------------------------------------------------------
  // This used to stay in the properties panel, which is fine while the panel still draws it and a
  // gap the moment it does not. The shape is animationModel's, so both surfaces make the same thing.
  let newName = $state('');
  let renaming = $state('');
  let renameDraft = $state('');
  let renameError = $derived(
    renaming ? renameBlockedBecause(rows.map((row) => row.name), renaming, renameDraft) : ''
  );

  function addAnimation() {
    if (!controlId) return;
    const name = uniqueAnimationName(rows.map((row) => row.name), newName);
    if (!name) return;
    updateControlProperty(controlId, `Animations.${name}`, newAnimationShape(name));
    newName = '';
    wantedName = name;
    rawTargetIndex = -1;
  }

  function removeAnimation(name) {
    if (!controlId || !name) return;
    removeControlNode(controlId, `Animations.${name}`);
    if (wantedName === name) wantedName = '';
    rawTargetIndex = -1;
  }

  function beginRename(name) {
    renaming = name;
    renameDraft = name;
  }

  function commitRename() {
    const from = renaming;
    const to = cleanAnimationName(renameDraft);
    renaming = '';
    if (!controlId || !from || renameBlockedBecause(rows.map((row) => row.name), from, to)) return;
    if (to === from) return;
    // An animation is a keyed child, so a rename is a move: write the new key with the old value's
    // fields, then drop the old one. `name` travels inside the value too and has to follow. Two
    // writes, one edit: the transaction makes them one undo step, so Ctrl+Z cannot leave the
    // animation under both names, or under neither.
    const source = rows.find((row) => row.name === from)?.animation;
    if (!source) return;
    const step = beginHistoryTransaction();
    updateControlProperty(controlId, `Animations.${to}`, { ...source, name: to });
    removeControlNode(controlId, `Animations.${from}`);
    commitHistoryTransaction(step);
    wantedName = to;
  }

  // --- Presets -----------------------------------------------------------------------------------
  // A preset is an animation AND the state change it animates (utils/animationPresets.js). It goes on
  // the armed control, or on every selected control at once — one undo step either way.
  let presetId = $state(ANIMATION_PRESETS[0].id);
  let presetReport = $state('');
  let preset = $derived(PRESET_BY_ID[presetId] ?? ANIMATION_PRESETS[0]);
  let presetBlocked = $derived(control ? presetBlockedBecause(control, preset) : '');
  let selectionIds = $derived([...($selectedComponentIds ?? [])]);

  function addPreset(toSelection) {
    const ids = toSelection ? selectionIds : [controlId];
    const step = beginHistoryTransaction();
    const added = [];
    const skipped = [];
    for (const id of ids) {
      const target = panelControls.find((entry) => entry._children?.Core?.id === id);
      const result = presetPatch(target, presetId);
      const label = target?._children?.Core?.name || id;
      if (!result.patch) { skipped.push(`${label} (${result.reason})`); continue; }
      applyControlPatch(id, result.patch);
      added.push(label);
      if (id === controlId) wantedName = result.name;
    }
    commitHistoryTransaction(step);
    presetReport = [
      added.length ? `${preset.label} added to ${added.length === 1 ? added[0] : `${added.length} controls`}.` : '',
      skipped.length ? `Skipped ${skipped.join('; ')}.` : '',
    ].filter(Boolean).join(' ');
  }

  function toggleAll() {
    if (!controlId) return;
    updateControlProperty(controlId, 'Animations.enabled', !allOn);
  }

  const titleCase = (value) => String(value).replace(/\b\w/g, (c) => c.toUpperCase());
</script>

<div class="anim-tab">
  {#if !control}
    <div class="empty">
      <strong>Nothing armed.</strong>
      <p>
        Select a control on the canvas, then use the button below. This tab stays on the control you
        open it with, so it will not change under you while you work.
      </p>
      <button type="button" class="arm" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}>
        {($selectedComponentIds?.size) ? 'Edit the selected control’s animations' : 'Select a control first'}
      </button>
    </div>
  {:else if !section}
    <div class="empty">
      <strong>{controlName} has no animations.</strong>
      <p>This tab edits a control's Animations section. Custom components have one.</p>
      <button type="button" class="arm" onclick={armFromSelection}>Use the selection</button>
    </div>
  {:else}
    <div class="head">
      <span class="who">
        editing <b>{controlName}</b>
        <em>{rows.length} {rows.length === 1 ? 'animation' : 'animations'}</em>
        {#if !($selectedComponentIds?.has?.(controlId))}
          <i class="stale" title="Not the control that is selected now — the tab stays where you opened it">not selected</i>
        {/if}
      </span>

      {#if deadCount}
        <span class="alarm" role="status">
          {deadCount} {deadCount === 1 ? 'target does' : 'targets do'} nothing
        </span>
      {/if}
      {#if clashes.length}
        <span class="alarm clashes" role="status"
              title={clashes.map((clash) => `${clash.loser} never plays where ${clash.winner} does: ${clash.why}`).join('\n')}>
          {clashes.length} {clashes.length === 1 ? 'clash' : 'clashes'}
        </span>
      {/if}
      {#if unknownCount}
        <span class="alarm unknown" role="status" title="A trigger names a state this control does not have, so it never matches">
          {unknownCount} unknown {unknownCount === 1 ? 'state' : 'states'}
        </span>
      {/if}

      <label class="allon">
        <span>All animations</span>
        <Segmented options={[{ value: false, label: 'Off' }, { value: true, label: 'On' }]}
                   value={allOn} ariaLabel="All animations" onchange={toggleAll} />
      </label>

      <div class="headtools">
        <button type="button" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}
                title="Point this tab at the control that is selected now">Use selection</button>
        <button type="button" onclick={clearEditorTarget} title="Stop editing this control">Clear</button>
      </div>
    </div>

    <div class="cols">
      <div class="listcol">
        <div class="colh">Animations <s>{rows.length}</s></div>
        <AnimationList
          {rows}
          {partNames}
          {stateNames}
          {clashes}
          fired={$animationActivity[controlId] ?? null}
          {selectedName}
          onselect={(name) => { wantedName = name; rawTargetIndex = -1; }}
          onrename={beginRename}
          onremove={removeAnimation}
          ontoggle={(row) => {
            if (controlId) updateControlProperty(controlId, `Animations.${row.name}.enabled`, !row.enabled);
          }}
        />

        <div class="newrow">
          {#if renaming}
            <input class="txt" type="text" value={renameDraft} aria-label="New name"
                   onchange={(event) => { renameDraft = event.currentTarget.value; }}
                   oninput={(event) => { renameDraft = event.currentTarget.value; }}
                   onkeydown={(event) => { if (event.key === 'Enter') commitRename(); if (event.key === 'Escape') renaming = ''; }} />
            <button type="button" class="mk" disabled={!!renameError} onclick={commitRename}>Rename</button>
            <button type="button" class="mk" onclick={() => { renaming = ''; }}>Cancel</button>
          {:else}
            <input class="txt" type="text" value={newName} placeholder="new animation" aria-label="New animation name"
                   oninput={(event) => { newName = event.currentTarget.value; }}
                   onkeydown={(event) => { if (event.key === 'Enter') addAnimation(); }} />
            <button type="button" class="mk" disabled={!newName.trim()} onclick={addAnimation}>
              <Plus size={11} /> Add
            </button>
          {/if}
        </div>
        {#if renameError}<p class="renerr">{renameError}</p>{/if}

        <div class="presets">
          <div class="colh">Presets</div>
          <PropertySelect options={ANIMATION_PRESETS.map((entry) => ({ value: entry.id, label: entry.label }))}
                          value={presetId} ariaLabel="Preset"
                          onchange={(value) => { presetId = value; presetReport = ''; }} />
          <p class="hint">{preset.summary}</p>
          {#if presetBlocked}<p class="renerr">{presetBlocked}</p>{/if}
          <div class="presetbtns">
            <button type="button" class="mk" disabled={!!presetBlocked} onclick={() => addPreset(false)}
                    title={`Add ${preset.label} to ${controlName}`}>
              <Plus size={11} /> Add
            </button>
            {#if selectionIds.length > 1}
              <button type="button" class="mk" onclick={() => addPreset(true)}
                      title="Add it to every selected control, as one undo step">
                <Plus size={11} /> Add to {selectionIds.length} selected
              </button>
            {/if}
          </div>
          {#if presetReport}<p class="hint report">{presetReport}</p>{/if}
        </div>
      </div>

      {#if selected}
        <div class="setcol">
          <div class="colh">
            {selected.name}
            <button type="button" class="dbg" onclick={debugSelected}
                    title="Show this animation as it is stored, in the Console tab's debug pane">Debug</button>
          </div>
          <div class="setbox">
            <div class="grp">Timing</div>
            <div class="r">
              <span class="lab" title="A transition eases between two styles when something changes; keyframes play a shape of their own on one part; a sequence runs a track per change along a time axis">Kind</span>
              <Segmented options={ANIMATION_KINDS.map((value) => ({ value, label: KIND_LABELS[value], title: KIND_TITLES[value] }))}
                         value={ANIMATION_KINDS.includes(selected.kind) ? selected.kind : 'transition'} ariaLabel="Kind"
                         onchange={(value) => { stopPlaying(); selectedKeyframe = null; setProps(kindPatch(selected, value, control)); }} />
            </div>
            <div class="r">
              <label for="anim-dur">{sequence ? 'Length' : 'Duration'}</label>
              <div class="cell"><NumberCell label="ms" value={sequence ? axisLength : selected.duration} min={sequence ? 100 : 0} step={10}
                onchange={(value) => setProp('duration', Math.max(sequence ? 100 : 0, Math.round(value)))} /></div>
            </div>
            {#if sequence}
              <div class="r">
                <span class="lab">Loop</span>
                <Segmented options={[{ value: 'off', label: 'Once' }, { value: 'on', label: 'Loop' }]}
                           value={selected.loop ? 'on' : 'off'} ariaLabel="Loop"
                           onchange={(value) => setProp('loop', value === 'on')} />
              </div>
              <div class="r">
                <span class="lab" title="When it reaches the end while the state that started it is still there">After</span>
                <Segmented options={[{ value: 'hold', label: 'Hold last' }, { value: 'return', label: 'Return' }]}
                           value={selected.hold ? 'hold' : 'return'} ariaLabel="After"
                           onchange={(value) => setProp('hold', value === 'hold')} />
              </div>
            {:else}
              <div class="r">
                <label for="anim-delay">Delay</label>
                <div class="cell"><NumberCell label="ms" value={selected.delay} min={0} step={10}
                  onchange={(value) => setProp('delay', Math.max(0, Math.round(value)))} /></div>
              </div>
            {/if}

            <div class="grp">Runs when</div>
            {#if keyframes}
              <div class="r">
                <span class="lab">Trigger</span>
                <PropertySelect options={KEYFRAME_TRIGGER_TYPES.map((value) => ({ value, label: KEYFRAME_TRIGGER_LABELS[value] }))}
                                value={selected.triggerType} ariaLabel="Keyframe trigger"
                                onchange={(value) => setProps({ trigger: { ...(selected.animation.trigger ?? {}), type: value } })} />
              </div>
              {#if selected.triggerType === 'stateChange'}
                <div class="r top">
                  <span class="lab">In</span>
                  <StateChips choices={stateChoices} value={selected.to} unknown={unknownTo} ariaLabel="To"
                              onchange={(next) => setProp('trigger.to', next)} />
                </div>
                {#if selected.iterations !== 'infinite'}
                  <div class="r top">
                    <span class="lab">From</span>
                    <StateChips choices={stateChoices} value={selected.from} unknown={unknownFrom} ariaLabel="From"
                                onchange={(next) => setProp('trigger.from', next)} />
                  </div>
                {/if}
                <p class="hint">{selected.iterations === 'infinite'
                  ? 'Loops while the control is in one of these states, and stops when it leaves.'
                  : 'Plays once each time the control enters one of these states.'}</p>
                {#if unknownStates.length}
                  <p class="warn unknownwarn">
                    <b>{unknownStates.length === 1 ? `“${unknownStates[0]}” is not a state` : `${unknownStates.length} names are not states`} of {controlName}.</b>
                    A trigger only matches the control's own States{stateNames.length ? ` (${stateNames.join(', ')})` : ''}.
                  </p>
                {/if}
              {:else if selected.triggerType === 'valueChange'}
                <div class="r">
                  <label for="anim-kf-source">Source</label>
                  <input class="txt" id="anim-kf-source" type="text" value={selected.source}
                         onchange={(event) => setProp('trigger.source', event.currentTarget.value)} />
                </div>
                <div class="r">
                  <span class="lab">Origin</span>
                  <Segmented options={VALUE_ORIGINS.map((value) => ({ value, label: ORIGIN_LABELS[value], title: ORIGIN_TITLES[value] }))}
                             value={selected.origin} ariaLabel="Origin"
                             onchange={(value) => setProp('trigger.origin', value)} />
                </div>
                <p class="hint">Plays once per change — not again while it is still playing, and never during a drag.</p>
              {:else if selected.triggerType === 'beat'}
                <div class="r">
                  <span class="lab">Every</span>
                  <div class="cell"><NumberCell label="beats" value={selected.trigger.every} min={1} step={1}
                    onchange={(value) => setProp('trigger.every', Math.max(1, Math.round(value)))} /></div>
                </div>
                <p class="hint">Plays on every {selected.trigger.every === 1 ? 'beat' : `${selected.trigger.every}th beat`} while the transport runs.</p>
              {:else if selected.triggerType === 'script'}
                <p class="hint">Played by a script — <code>ce.anim.play("{controlName}", "{selected.name}")</code> — or with Play on the stage.</p>
              {:else}
                <p class="hint">Plays all the time the control is shown in Preview.</p>
              {/if}
              <div class="r">
                <span class="lab">Repeat</span>
                <Segmented options={[{ value: 'count', label: 'Count' }, { value: 'infinite', label: 'Loop' }]}
                           value={selected.iterations === 'infinite' ? 'infinite' : 'count'} ariaLabel="Repeat"
                           onchange={(value) => setProp('iterations', value === 'infinite' ? 'infinite' : 1)} />
              </div>
              {#if selected.iterations !== 'infinite'}
                <div class="r">
                  <span class="lab">Times</span>
                  <div class="cell"><NumberCell label="×" value={selected.iterations} min={1} step={1}
                    onchange={(value) => setProp('iterations', Math.max(1, Math.round(value)))} /></div>
                </div>
              {/if}
              <div class="r">
                <span class="lab">Direction</span>
                <Segmented options={[{ value: 'normal', label: 'Forward' }, { value: 'alternate', label: 'Back and forth' }]}
                           value={selected.direction} ariaLabel="Direction"
                           onchange={(value) => setProp('direction', value)} />
              </div>
            {:else}
              <div class="r">
                <label for="anim-trigger">Trigger</label>
                <Segmented options={TRIGGER_TYPES.map((value) => ({ value, label: value === 'stateChange' ? 'State' : 'Value' }))}
                           value={selected.triggerType} ariaLabel="Trigger"
                           onchange={(value) => setProp('trigger.type', value)} />
              </div>
              {#if selected.triggerType === 'stateChange'}
                <div class="r top">
                  <span class="lab">From</span>
                  <StateChips choices={stateChoices} value={selected.from} unknown={unknownFrom} ariaLabel="From"
                              onchange={(next) => setProp('trigger.from', next)} />
                </div>
                <div class="r top">
                  <span class="lab">To</span>
                  <StateChips choices={stateChoices} value={selected.to} unknown={unknownTo} ariaLabel="To"
                              onchange={(next) => setProp('trigger.to', next)} />
                </div>
                {#if sequence}
                  <p class="hint">Plays from the start each time the control enters a To state. With Hold last, the final frame stays until that state is left.</p>
                {:else}
                  <div class="r">
                    <span class="lab" title="Play it backwards when a To state is left — how a hover lift settles">Leaving</span>
                    <Segmented options={[{ value: false, label: 'Snap back' }, { value: true, label: 'Play back' }]}
                               value={selected.reverse} ariaLabel="Also when leaving"
                               onchange={(value) => setProp('trigger.reverse', value)} />
                  </div>
                {/if}
                {#if unknownStates.length}
                  <p class="warn unknownwarn">
                    <b>{unknownStates.length === 1 ? `“${unknownStates[0]}” is not a state` : `${unknownStates.length} names are not states`} of {controlName}.</b>
                    A trigger only matches the control's own States{stateNames.length ? ` (${stateNames.join(', ')})` : ''}, so this part of it never plays.
                  </p>
                {/if}
              {:else}
                <div class="r">
                  <label for="anim-source">Source</label>
                  <input class="txt" id="anim-source" type="text" value={selected.source}
                         onchange={(event) => setProp('trigger.source', event.currentTarget.value)} />
                </div>
                {#if sequence}
                  <p class="hint">Follows the value instead of playing: at 30% of its range the control shows the pose 30% along the axis.</p>
                {:else}
                  <div class="r">
                    <span class="lab">Origin</span>
                    <Segmented options={VALUE_ORIGINS.map((value) => ({ value, label: ORIGIN_LABELS[value], title: ORIGIN_TITLES[value] }))}
                               value={selected.origin} ariaLabel="Origin"
                               onchange={(value) => setProp('trigger.origin', value)} />
                  </div>
                {/if}
              {/if}
            {/if}
            {#each selectedClashes as clash (clash.other + clash.role)}
              <p class="warn clashwarn" class:wins={clash.role === 'wins'}>{clash.text}</p>
            {/each}

            {#if sequence}
            <div class="grp">Sequence</div>
            <p class="note">A keyframe per diamond. Drag one along the axis; click it to set its time, value and the easing it arrives with. Besides what a transition can ease, a track can drive a value channel or a filmstrip's frame.</p>
            {:else}
            <div class="grp">Easing</div>
            <div class="easings">
              {#each EASING_CHOICES as name (name)}
                {@const on = selected.easing === name}
                <button type="button" class="easing" class:on
                        title={EASING_TITLES[name] ?? `Use ${name}`}
                        onclick={() => { if (!on) setProps(easingPatch(selected, name)); }}>
                  <EasingCurve easing={on ? selected.animation : (EASING_TITLES[name] ? easingPatch(selected, name) : name)}
                               active={on} width={64} height={44} label={`${name} easing curve`} />
                  <span>{name}</span>
                </button>
              {/each}
            </div>
            {#if selected.easing === CUSTOM_EASING}
              <BezierEditor points={selected.curve.points} onchange={(points) => setProps({ easing: CUSTOM_EASING, bezier: points })} />
            {:else if selected.easing === SPRING_EASING}
              <div class="r">
                <span class="lab" title="How quickly the bounce dies away">Damping</span>
                <div class="cell"><NumberCell label="damp" value={selected.curve.damping} step={0.5}
                  min={SPRING_LIMITS.damping[0]} max={SPRING_LIMITS.damping[1]}
                  onchange={(value) => setProps({ easing: SPRING_EASING, spring: cleanSpring({ ...selected.curve, damping: value }) })} /></div>
              </div>
              <div class="r">
                <span class="lab" title="How many times it swings before it settles">Bounce</span>
                <div class="cell"><NumberCell label="freq" value={selected.curve.frequency} step={1}
                  min={SPRING_LIMITS.frequency[0]} max={SPRING_LIMITS.frequency[1]}
                  onchange={(value) => setProps({ easing: SPRING_EASING, spring: cleanSpring({ ...selected.curve, frequency: value }) })} /></div>
              </div>
            {/if}
            {#if selected.easing === CUSTOM_EASING}
              <p class="hint">A script's ce.anim moves the same way given these four as its curve:
                <code>{selected.curve.points.map((v) => Math.round(v * 1000) / 1000).join(', ')}</code>.</p>
            {:else if selected.easing === SPRING_EASING}
              <p class="hint">A script's ce.anim moves the same way with curve <code>"spring"</code>,
                damping <code>{selected.curve.damping}</code> and frequency <code>{selected.curve.frequency}</code>.</p>
            {/if}
            {/if}
          </div>
        </div>

        <div class="targetcol">
          <div class="colh">Stage <s>hover, press, drag — or Play</s></div>
          <AnimationStage {control} row={selected} />

          {#if keyframes}
            <div class="colh">Frames <s>{selected.frames.length} {selected.frames.length === 1 ? 'frame' : 'frames'}</s></div>
            <div class="playson r">
              <span class="lab">Plays on</span>
              <PropertySelect options={[{ value: '', label: 'The control itself' }, ...partNames.map((name) => ({ value: name, label: name }))]}
                              value={selected.part} ariaLabel="Plays on"
                              onchange={(value) => setProp('targets', keyframeTargets(value))} />
            </div>
            {#if targets.some((entry) => !entry.status.works)}
              <p class="warn">{targets.find((entry) => !entry.status.works).status.detail}</p>
            {/if}
            <FramesEditor frames={selected.frames} onchange={(next) => setProp('frames', next)} />
            <p class="hint">Scale, turn, move and fade, and two colours: fill recolours a solid fill, a shape or a line; text, its text. A gradient or an image keeps its own colours.</p>
          {:else}
            <div class="colh">
              {sequence ? 'Tracks' : 'Changes'}
              <s>{targets.length} {sequence ? (targets.length === 1 ? 'track' : 'tracks') : (targets.length === 1 ? 'target' : 'targets')}</s>
            </div>
            <TargetList
              rows={targets}
              selectedIndex={targetIndex}
              onselect={(index) => { rawTargetIndex = index; }}
              onremove={drop}
              onreorder={reorder}
            />

            {#if sequence}
              <div class="seq">
                <div class="transport">
                  <button type="button" class="mk" class:on={playing} onclick={togglePlay} title={playing ? 'Stop' : 'Play on the canvas'} aria-label={playing ? 'Stop' : 'Play'}>
                    {#if playing}<Square size={10} />{:else}<Play size={10} />{/if}
                  </button>
                  <span class="time" aria-live="off" title="Where the playhead is">{playhead} ms <s>of {axisLength}</s></span>
                  <button type="button" class="mk" disabled={!targets.length} onclick={addKeyframeAtPlayhead} title="Add a keyframe to the selected track at the playhead">
                    <Plus size={10} /> Keyframe at {playhead} ms
                  </button>
                  {#if selectedKeyframeTime !== null}
                    <span class="kfat" class:moving={!!draggedKeyframe} aria-live="off" title="Where the selected keyframe is. It follows the keyframe while you drag it.">
                      <i aria-hidden="true"></i> selected keyframe {selectedKeyframeTime} ms
                    </span>
                  {/if}
                </div>
                <KeyframeTimeline
                  {tracks}
                  duration={axisLength}
                  time={playhead}
                  selected={selectedKeyframe}
                  ontime={scrubTo}
                  onmove={moveKeyframes}
                  ondrag={(at) => { draggedKeyframe = at; }}
                  onselect={(at) => { selectedKeyframe = at; if (at) rawTargetIndex = at.track; }}
                />
                {#if keyframeAt}
                  <div class="kfbox">
                    <div class="r">
                      <label for="kf-time">Time</label>
                      <div class="cell"><NumberCell label="ms" value={selectedKeyframeTime ?? keyframeAt.keyframe.time} min={0} step={10}
                        onchange={(value) => patchSelectedKeyframe({ time: Math.max(0, Math.round(value)) })} /></div>
                    </div>
                    <div class="r">
                      <label for="kf-value">Value</label>
                      {#if keyframeAt.colour}
                        <input class="txt" id="kf-value" type="text" value={keyframeAt.keyframe.value} aria-label="Colour, AARRGGBB"
                               onchange={(event) => patchSelectedKeyframe({ value: event.currentTarget.value })} />
                      {:else}
                        <div class="cell"><NumberCell label="" value={keyframeAt.keyframe.value} step={1}
                          onchange={(value) => patchSelectedKeyframe({ value })} /></div>
                      {/if}
                    </div>
                    <div class="r">
                      <label for="kf-easing">Arrives</label>
                      <PropertySelect options={EASING_NAMES.map((name) => ({ value: name, label: name }))}
                                      value={keyframeAt.keyframe.easing} ariaLabel="Easing into this keyframe"
                                      onchange={(value) => patchSelectedKeyframe({ easing: value })} />
                    </div>
                    <button type="button" class="mk danger" onclick={deleteSelectedKeyframe}><Trash2 size={10} /> Delete keyframe</button>
                  </div>
                {:else if targets.length}
                  <p class="note">Click a keyframe to edit it, drag it to move it. The playhead moves from the ruler only; double-click a keyframe to send the playhead to it. The first keyframe on a track is where it starts; a track with one keyframe holds that value.</p>
                {/if}
              </div>
            {/if}

            <div class="addbox">
              <div class="r">
                <label for="anim-part">Part</label>
                <PropertySelect options={partOptions}
                                value={onControl ? CONTROL_ITSELF : partForAdd} ariaLabel="Part" disabled={offeredForAdd?.scope === 'control'}
                                onchange={(value) => { newPart = value; }} />
              </div>
              <div class="r">
                <label for="anim-what">Change</label>
                <PropertySelect options={offered.map((entry) => ({ value: entry.path, label: entry.label }))}
                                value={offeredForAdd?.path ?? newProperty} ariaLabel="What to change"
                                onchange={(value) => { newProperty = value; }} />
              </div>

              {#if !addStatus.works}
                <p class="warn">
                  <b>{titleCase(offeredForAdd.label)} does nothing.</b>
                  {addStatus.detail}
                </p>
              {/if}

              <button type="button" class="addbtn" disabled={!offeredForAdd} onclick={add}>
                <Plus size={11} /> {sequence ? 'Add this track' : 'Add this change'}
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="timelinebox">
      <div class="colh">Timeline <s>from the moment each trigger fires — drag a bar to move it, its edge to resize</s></div>
      <Timeline {rows} {selectedName} fired={$animationActivity[controlId] ?? null}
                onselect={(name) => { wantedName = name; rawTargetIndex = -1; }}
                onretime={retimeAnimation} />
    </div>
  {/if}
</div>

<style>
  .anim-tab {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
    background: #15181B;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-bottom: 1px solid #2A2A2A;
    flex: 0 0 auto;
    flex-wrap: wrap;
  }

  .who {
    font: 500 9.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    white-space: nowrap;
  }
  .who b { color: #8FEDE3; font-weight: 600; }
  .who em { font-style: normal; margin-left: 6px; color: #8A949C; }
  .who .stale {
    font-style: normal;
    margin-left: 6px;
    color: #E5A029;
    border: 1px solid #4A3A1C;
    background: #241d10;
    border-radius: 2px;
    padding: 2px 4px;
  }

  .alarm {
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    color: #F0D48A;
    border: 1px solid #6B4A1E;
    background: #241d10;
    border-radius: 3px;
    padding: 4px 7px;
    white-space: nowrap;
  }

  .allon { margin-left: auto; display: flex; align-items: center; gap: 6px; width: 168px; }
  .allon > span {
    font: 400 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
    white-space: nowrap;
  }

  .headtools { display: flex; gap: 4px; }
  .headtools button {
    border: 1px solid #333B42;
    background: #12171A;
    color: #9AA6AE;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 5px 8px;
    border-radius: 3px;
    cursor: pointer;
  }
  .headtools button:hover:not(:disabled) { border-color: #4A555E; color: #E8EEF5; }
  .headtools button:disabled { opacity: 0.4; cursor: default; }

  .cols {
    display: flex;
    gap: 10px;
    padding: 10px;
    align-items: flex-start;
    min-width: 0;
    flex: 1 1 auto;
  }

  .listcol { flex: 0 0 224px; min-width: 0; }

  .newrow { display: flex; gap: 4px; margin-top: 6px; }
  .newrow .txt { flex: 1 1 auto; height: 24px; }
  .mk {
    display: inline-flex; align-items: center; gap: 3px;
    border: 1px solid #0E7C70; background: #0B2320; color: #8FEDE3;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 0 7px; border-radius: 3px; cursor: pointer; white-space: nowrap;
  }
  .mk:hover:not(:disabled) { border-color: #14B8A6; color: #C9FFF8; }
  .mk:disabled { opacity: 0.35; cursor: default; }
  .renerr { margin: 5px 0 0; font: 400 9px/1.4 'IBM Plex Sans', system-ui, sans-serif; color: #E5A029; }
  .setcol { flex: 0 0 300px; min-width: 0; }
  .timelinebox { padding: 0 10px 12px; }
  .dbg {
    margin-left: auto;
    border: 1px solid #333; background: #1A1D20; color: #8A949C;
    font: 600 8.5px/1 'IBM Plex Sans', system-ui, sans-serif; letter-spacing: 0.04em;
    padding: 3px 6px; border-radius: 3px; cursor: pointer; text-transform: none;
  }
  .dbg:hover { border-color: #5B9BD5; color: #D7ECFF; }
  .targetcol { flex: 1 1 0; min-width: 280px; }

  .colh {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #616C75;
    margin-bottom: 7px;
    white-space: nowrap;
    overflow: hidden;
  }
  .colh s { margin-left: auto; text-decoration: none; font-size: 8.5px; letter-spacing: 0.06em; }

  .setbox, .addbox {
    border: 1px solid #333;
    border-radius: 4px;
    background: #1A1D20;
    padding: 6px 8px 9px;
  }
  .addbox { margin-top: 8px; }

  .grp {
    font: 600 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #4B545C;
    margin: 9px 0 2px;
    padding-bottom: 3px;
    border-bottom: 1px solid #262B30;
  }
  .grp:first-child { margin-top: 2px; }

  .r {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    margin-top: 6px;
  }
  .r > label, .r > .lab {
    font: 400 9.5px/1.15 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
    text-align: right;
  }
  .r.top { align-items: start; }
  .r.top > .lab { padding-top: 5px; }

  .cell { min-width: 0; display: flex; }

  .txt {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: 26px;
    padding: 0 6px;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #DDD;
    font: 400 11px/1 'IBM Plex Sans', system-ui, sans-serif;
    outline: none;
  }
  .txt:focus { border-color: #5B9BD5; }

  .easings { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
  .easing {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 3px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
  }
  .easing:hover { border-color: #4A555E; }
  .easing.on { border-color: #5B9BD5; background: #173449; }
  .easing span {
    font: 500 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #8A949C;
  }
  .easing.on span { color: #EAF5FF; }
  .hint { margin: 6px 0 0; font: 400 9px/1.4 'IBM Plex Sans', system-ui, sans-serif; color: #616C75; }
  .hint code { font: 500 9px/1 'IBM Plex Mono', ui-monospace, monospace; color: #8FEDE3; }

  .warn {
    margin: 8px 0 0;
    border: 1px solid #6B4A1E;
    background: #221D12;
    border-radius: 4px;
    padding: 6px 8px;
    font: 400 9.5px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #D9BE8A;
  }
  .warn b { display: block; color: #F0D48A; font-weight: 600; }
  .clashwarn.wins { border-color: #2E3540; background: #12171A; color: #9AA6AE; }
  .playson { margin: 0 0 8px; }
  .presets { margin-top: 14px; }
  .presetbtns { display: flex; gap: 4px; margin-top: 6px; }
  .presetbtns .mk { height: 24px; }
  .report { color: #8FEDE3; }

  .addbtn {
    width: 100%;
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1px solid #0E7C70;
    background: #0B2320;
    color: #8FEDE3;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 7px;
    border-radius: 3px;
    cursor: pointer;
  }
  .addbtn:hover:not(:disabled) { border-color: #14B8A6; color: #C9FFF8; }
  .addbtn:disabled { opacity: 0.35; cursor: default; }

  .empty { padding: 22px; max-width: 46ch; color: #8A949C; }
  .empty strong { display: block; font: 600 13px/1.4 'IBM Plex Sans', system-ui, sans-serif; color: #E8EEF5; }
  .empty p { margin: 8px 0 14px; font: 400 12px/1.6 'IBM Plex Sans', system-ui, sans-serif; }

  .arm {
    border: 1px solid #0E7C70;
    background: #0B2320;
    color: #8FEDE3;
    font: 600 11px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 8px 12px;
    border-radius: 3px;
    cursor: pointer;
  }
  .arm:disabled { opacity: 0.45; cursor: default; border-color: #333B42; background: #12171A; color: #69737B; }

  @media (max-width: 1080px) {
    .cols { flex-wrap: wrap; }
    .targetcol { flex: 1 1 100%; }
  }

  /* The sequence editor: transport, track timeline, and the selected keyframe's box. */
  .note { margin: 6px 0 0; font-size: 10.5px; line-height: 1.4; color: #8E99A4; }
  .seq { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
  .transport { display: flex; align-items: center; gap: 8px; }
  .transport .time { font-size: 11px; color: #EAF5FF; font-variant-numeric: tabular-nums; }
  .transport .time s { text-decoration: none; color: #6E7A86; margin-left: 4px; }
  /* The selected keyframe's own time: the red of a selected diamond, so it is read as that one. */
  .transport .kfat { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #B9C4CE; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .transport .kfat i { width: 7px; height: 7px; background: #E5484D; transform: rotate(45deg); flex: 0 0 auto; }
  .transport .kfat.moving { color: #EAF5FF; }
  .mk.on { border-color: #F5B83D; color: #F5B83D; }
  .mk.danger { align-self: flex-start; color: #E5A029; }
  .kfbox { border: 1px solid #2A3038; border-radius: 4px; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; background: #15181B; }
</style>
