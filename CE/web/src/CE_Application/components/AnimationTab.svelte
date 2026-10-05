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
   * FOURTH, THE LAYOUT IS ONE BAND AND A STRIP, AND IT DOES NOT SCROLL. The dock this tab lives in
   * is wide and short (about 420 px when it opens), and the first layout stacked a stage, a track
   * list, a timeline, a keyframe form and a second timeline under each other in 8 to 10 px type,
   * so most of the tab was below the fold. The owner's words were "quite shitty, not user
   * friendly, too small letters" and "way too much scrolling to the bottom". So: four columns
   * side by side (which animation, its settings, what it does, the thing in hand), every easing
   * and preset in a strip along the bottom, type at 13 to 14 px, and a list that can grow (the
   * tracks, the animations) scrolling inside its own box. The mockup that was agreed is the
   * Design artifact "Animation tab redesign"; docs/design/animation-tab-design.md has the record.
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
  import Crosshair from 'lucide-svelte/icons/crosshair';
  import X from 'lucide-svelte/icons/x';
  import AnimationList from './animation/AnimationList.svelte';
  import TargetList from './animation/TargetList.svelte';
  import EasingCurve from './animation/EasingCurve.svelte';
  import StateChips from './animation/StateChips.svelte';
  import AnimationStage from './animation/AnimationStage.svelte';
  import BezierEditor from './animation/BezierEditor.svelte';
  import FramesEditor from './animation/FramesEditor.svelte';
  import SequenceTimeline from './animation/SequenceTimeline.svelte';
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

  // The row that asks what to add (a part, and what to change on it) is closed until Add is
  // pressed, and then stays open until Done: adding three tracks in a row is the common case.
  let adding = $state(false);
  // The fourth column shows the thing in hand, or the control itself, live.
  let side = $state('details');

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
    ? targets.map((row) => ({ label: trackLabel(row), path: row.path, keyframes: normalizeKeyframes(row.target), works: row.status.works, detail: row.status.detail ?? '' }))
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
      return own ? `${own.label} · control` : row.path;
    }
    const entry = OFFERED_PROPERTIES.find((e) => e.path === rest.join('.'));
    return `${entry?.label ?? rest.join('.')} · ${partName}`;
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
    // The new keyframe is the thing in hand: show its time and value, not the preview.
    side = 'details';
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
  let presetReport = $state('');
  let selectionIds = $derived([...($selectedComponentIds ?? [])]);

  function addPreset(presetId, toSelection = false) {
    const preset = PRESET_BY_ID[presetId];
    if (!preset || !controlId) return;
    // On the armed control alone, say why it cannot go on rather than doing nothing.
    if (!toSelection) {
      const blocked = presetBlockedBecause(control, preset);
      if (blocked) { presetReport = blocked; return; }
    }
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

  // --- The easing strip ----------------------------------------------------------------------------
  // Every curve, always on screen. What a click sets depends on the kind: a transition or a
  // keyframes animation has one easing; a sequence has one per keyframe, the curve it arrives
  // with, and only the named curves (a keyframe stores a name).
  let activeEasing = $derived(sequence ? (keyframeAt?.keyframe.easing ?? '') : (selected?.easing ?? ''));
  let easingNote = $derived(!selected
    ? 'no animation selected'
    : sequence ? (keyframeAt ? 'into the selected keyframe' : 'select a keyframe first') : 'of this animation');

  function easingApplies(name) {
    if (!selected) return false;
    return !sequence || (!!keyframeAt && EASING_NAMES.includes(name));
  }

  /** What a thumbnail draws: the animation's own curve when it is the one in use, else the default of that name. */
  function easingShape(name, on) {
    if (EASING_NAMES.includes(name)) return name;
    if (on && selected && !sequence) return selected.animation;
    return easingPatch(selected && !sequence ? selected : { animation: {}, easing: 'outQuad' }, name);
  }

  function pickEasing(name) {
    if (!easingApplies(name)) return;
    if (sequence) {
      if (keyframeAt.keyframe.easing !== name) patchSelectedKeyframe({ easing: name });
      return;
    }
    if (selected.easing !== name) setProps(easingPatch(selected, name));
    // Custom and spring have settings of their own, in the details column.
    if (name === CUSTOM_EASING || name === SPRING_EASING) side = 'details';
  }

  function toggleAll() {
    if (!controlId) return;
    updateControlProperty(controlId, 'Animations.enabled', !allOn);
  }

  const titleCase = (value) => String(value).replace(/\b\w/g, (c) => c.toUpperCase());
</script>

{#snippet addbox()}
  <div class="addbox">
    <label class="addfield">
      <span>On</span>
      <PropertySelect options={partOptions}
                      value={onControl ? CONTROL_ITSELF : partForAdd} ariaLabel="Part" disabled={offeredForAdd?.scope === 'control'}
                      onchange={(value) => { newPart = value; }} />
    </label>
    <label class="addfield">
      <span>Change</span>
      <PropertySelect options={offered.map((entry) => ({ value: entry.path, label: entry.label }))}
                      value={offeredForAdd?.path ?? newProperty} ariaLabel="What to change"
                      onchange={(value) => { newProperty = value; }} />
    </label>
    <button type="button" class="addbtn" disabled={!offeredForAdd} onclick={add}>
      <Plus size={13} /> {sequence ? 'Add this track' : 'Add this change'}
    </button>
    <button type="button" class="mk quiet" onclick={() => { adding = false; }}>Done</button>
    {#if !addStatus.works}
      <p class="warn">
        <b>{titleCase(offeredForAdd.label)} does nothing.</b>
        {addStatus.detail}
      </p>
    {/if}
  </div>
{/snippet}

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
    <div class="band">

      <!-- 1. Which animation -->
      <aside class="col listcol">
        <div class="who">
          <b title={controlName}>{controlName}</b>
          <em>{rows.length} {rows.length === 1 ? 'animation' : 'animations'}</em>
          {#if !($selectedComponentIds?.has?.(controlId))}
            <i class="stale" title="Not the control that is selected now — the tab stays where you opened it">not selected</i>
          {/if}
          <span class="headtools">
            <button type="button" class="ic" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}
                    title="Use selection: point this tab at the control that is selected now" aria-label="Use selection"><Crosshair size={14} /></button>
            <button type="button" class="ic" onclick={clearEditorTarget} title="Clear: stop editing this control" aria-label="Clear"><X size={14} /></button>
          </span>
        </div>
        {#if deadCount || clashes.length || unknownCount}
          <div class="alarms">
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
          </div>
        {/if}

        <div class="listwrap">
          <AnimationList
            {rows}
            {partNames}
            {stateNames}
            {clashes}
            fired={$animationActivity[controlId] ?? null}
            {selectedName}
            onselect={(name) => { wantedName = name; rawTargetIndex = -1; selectedKeyframe = null; }}
            onrename={beginRename}
            onremove={removeAnimation}
            ontoggle={(row) => {
              if (controlId) updateControlProperty(controlId, `Animations.${row.name}.enabled`, !row.enabled);
            }}
          />
        </div>

        <div class="newrow">
          {#if renaming}
            <input class="txt" type="text" value={renameDraft} aria-label="New name"
                   onfocus={(event) => event.currentTarget.select()}
                   onchange={(event) => { renameDraft = event.currentTarget.value; }}
                   oninput={(event) => { renameDraft = event.currentTarget.value; }}
                   onkeydown={(event) => { if (event.key === 'Enter') commitRename(); if (event.key === 'Escape') renaming = ''; }} />
            <button type="button" class="mk" disabled={!!renameError} onclick={commitRename}>Rename</button>
            <button type="button" class="mk quiet" onclick={() => { renaming = ''; }}>Cancel</button>
          {:else}
            <input class="txt" type="text" value={newName} placeholder="new animation" aria-label="New animation name"
                   onfocus={(event) => event.currentTarget.select()}
                   oninput={(event) => { newName = event.currentTarget.value; }}
                   onkeydown={(event) => { if (event.key === 'Enter') addAnimation(); }} />
            <button type="button" class="mk go" disabled={!newName.trim()} onclick={addAnimation}>
              <Plus size={13} /> Add
            </button>
          {/if}
        </div>
        {#if renameError}<p class="renerr">{renameError}</p>{/if}

        <div class="listfoot">
          <label class="allon">
            <span>All animations</span>
            <span class="allseg"><Segmented options={[{ value: false, label: 'Off' }, { value: true, label: 'On' }]}
                       value={allOn} ariaLabel="All animations" onchange={toggleAll} /></span>
          </label>
        </div>
      </aside>

      {#if selected}
        <!-- 2. Its settings: timing on the left, what starts it on the right -->
        <section class="col setcol">
          <div class="setbox">
            <div class="r kindrow">
                <span class="lab" title="A transition eases between two styles when something changes; keyframes play a shape of their own on one part; a sequence runs a track per change along a time axis">Kind</span>
                <Segmented options={ANIMATION_KINDS.map((value) => ({ value, label: KIND_LABELS[value], title: KIND_TITLES[value] }))}
                           value={ANIMATION_KINDS.includes(selected.kind) ? selected.kind : 'transition'} ariaLabel="Kind"
                           onchange={(value) => { stopPlaying(); selectedKeyframe = null; setProps(kindPatch(selected, value, control)); }} />
            </div>
            <div class="grpcol">
              <div class="grp">Timing</div>
              <div class="r">
                <label for="anim-dur">{sequence ? 'Length' : 'Duration'}</label>
                <div class="cell"><NumberCell label="ms" value={sequence ? axisLength : selected.duration} min={sequence ? 100 : 0} step={10}
                  onchange={(value) => setProp('duration', Math.max(sequence ? 100 : 0, Math.round(value)))} /></div>
              </div>
              {#if sequence}
                <div class="r">
                  <span class="lab">Repeat</span>
                  <Segmented options={[{ value: 'off', label: 'Once' }, { value: 'on', label: 'Loop' }]}
                             value={selected.loop ? 'on' : 'off'} ariaLabel="Loop"
                             onchange={(value) => setProp('loop', value === 'on')} />
                </div>
                <div class="r">
                  <span class="lab" title="When it reaches the end while the state that started it is still there">At the end</span>
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
              {#if keyframes}
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
              {/if}
              <button type="button" class="dbg" onclick={debugSelected}
                      title="Show this animation as it is stored, in the Console tab's debug pane">Debug</button>
            </div>

            <div class="grpcol">
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
                           onfocus={(event) => event.currentTarget.select()}
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
                  <p class="hint">Played by a script — <code>ce.anim.play("{controlName}", "{selected.name}")</code> — or with Play in the Preview.</p>
                {:else}
                  <p class="hint">Plays all the time the control is shown in Preview.</p>
                {/if}
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
                    <p class="hint">Plays from the start each time the control enters a To state.</p>
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
                           onfocus={(event) => event.currentTarget.select()}
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
            </div>
          </div>
        </section>

        <!-- 3. What it does: tracks, changes or frames, by kind -->
        <section class="col editcol">
          {#if keyframes}
            <div class="pane">
              <div class="panehead">
                <b>Frames</b>
                <span class="count">{selected.frames.length}</span>
                <label class="playson">
                  <span>Plays on</span>
                  <PropertySelect options={[{ value: '', label: 'The control itself' }, ...partNames.map((name) => ({ value: name, label: name }))]}
                                  value={selected.part} ariaLabel="Plays on"
                                  onchange={(value) => setProp('targets', keyframeTargets(value))} />
                </label>
              </div>
              <div class="panebody">
                {#if targets.some((entry) => !entry.status.works)}
                  <p class="warn">{targets.find((entry) => !entry.status.works).status.detail}</p>
                {/if}
                <FramesEditor frames={selected.frames} onchange={(next) => setProp('frames', next)} />
                <p class="hint">Scale, turn, move and fade, and two colours: fill recolours a solid fill, a shape or a line; text, its text. A gradient or an image keeps its own colours.</p>
              </div>
            </div>
          {:else if sequence}
            <div class="transport">
              <button type="button" class="mk go" class:on={playing} onclick={togglePlay} title={playing ? 'Stop' : 'Play on the canvas'} aria-label={playing ? 'Stop' : 'Play'}>
                {#if playing}<Square size={13} />{:else}<Play size={13} />{/if} {playing ? 'Stop' : 'Play'}
              </button>
              <span class="time" aria-live="off" title="Where the playhead is">{playhead} ms <s>of {axisLength}</s></span>
              <button type="button" class="mk" disabled={!targets.length} onclick={addKeyframeAtPlayhead} title="Add a keyframe to the selected track at the playhead">
                <Plus size={13} /> Keyframe at {playhead} ms
              </button>
              {#if selectedKeyframeTime !== null}
                <span class="kfat" class:moving={!!draggedKeyframe} aria-live="off" title="Where the selected keyframe is. It follows the keyframe while you drag it.">
                  <i aria-hidden="true"></i> selected keyframe {selectedKeyframeTime} ms
                </span>
              {/if}
            </div>
            <SequenceTimeline
              {tracks}
              duration={axisLength}
              time={playhead}
              selected={selectedKeyframe}
              selectedTrack={targetIndex}
              {adding}
              addrow={addbox}
              ontime={scrubTo}
              onmove={moveKeyframes}
              ondrag={(at) => { draggedKeyframe = at; }}
              onselect={(at) => { selectedKeyframe = at; if (at) { rawTargetIndex = at.track; side = 'details'; } }}
              onselecttrack={(index) => { rawTargetIndex = index; }}
              onremove={drop}
              onreorder={reorder}
              ontoggleadd={() => { adding = !adding; }}
              ondelete={(at) => { selectedKeyframe = at; deleteSelectedKeyframe(); }}
            />
          {:else}
            <div class="pane">
              <div class="panehead">
                <b>What it eases</b>
                <span class="count">{targets.length}</span>
                <button type="button" class="addtoggle" class:on={adding} aria-expanded={adding}
                        title="Add a change: pick a part and what to ease" onclick={() => { adding = !adding; }}>
                  <Plus size={13} aria-hidden="true" /> Add
                </button>
              </div>
              {#if adding}{@render addbox()}{/if}
              <div class="panebody">
                <TargetList
                  rows={targets}
                  selectedIndex={targetIndex}
                  onselect={(index) => { rawTargetIndex = index; }}
                  onremove={drop}
                  onreorder={reorder}
                />
              </div>
            </div>
          {/if}
        </section>

        <!-- 4. The thing in hand, or the control itself -->
        <aside class="col sidecol">
          <div class="sideswitch">
            <Segmented options={[{ value: 'details', label: 'Details' }, { value: 'preview', label: 'Preview', title: 'The control, live: hover, press and drag it, or Play' }]}
                       value={side} ariaLabel="Side panel" onchange={(value) => { side = value; }} />
          </div>
          {#if side === 'preview'}
            <AnimationStage {control} row={selected} />
          {:else if keyframeAt}
            <div class="kfbox">
              <p class="where"><i aria-hidden="true"></i> {tracks[keyframeAt.track]?.label ?? 'Keyframe'}</p>
              <div class="r">
                <label for="kf-time">Time</label>
                <div class="cell"><NumberCell label="ms" value={selectedKeyframeTime ?? keyframeAt.keyframe.time} min={0} step={10}
                  onchange={(value) => patchSelectedKeyframe({ time: Math.max(0, Math.round(value)) })} /></div>
              </div>
              <div class="r">
                <label for="kf-value">Value</label>
                {#if keyframeAt.colour}
                  <input class="txt" id="kf-value" type="text" value={keyframeAt.keyframe.value} aria-label="Colour, AARRGGBB"
                         onfocus={(event) => event.currentTarget.select()}
                         onchange={(event) => patchSelectedKeyframe({ value: event.currentTarget.value })} />
                {:else}
                  <div class="cell"><NumberCell label="" value={keyframeAt.keyframe.value} step={1}
                    onchange={(value) => patchSelectedKeyframe({ value })} /></div>
                {/if}
              </div>
              <div class="r">
                <span class="lab" title="The curve it arrives with. Pick it in the Easing strip below.">Arrives</span>
                <span class="val">{keyframeAt.keyframe.easing}</span>
              </div>
              <button type="button" class="mk danger" onclick={deleteSelectedKeyframe}><Trash2 size={13} /> Delete keyframe</button>
            </div>
          {:else if !sequence && selected.easing === CUSTOM_EASING}
            <div class="curvebox">
              <BezierEditor points={selected.curve.points} onchange={(points) => setProps({ easing: CUSTOM_EASING, bezier: points })} />
              <p class="hint">A script's ce.anim moves the same way given these four as its curve:
                <code>{selected.curve.points.map((v) => Math.round(v * 1000) / 1000).join(', ')}</code>.</p>
            </div>
          {:else if !sequence && selected.easing === SPRING_EASING}
            <div class="curvebox">
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
              <p class="hint">A script's ce.anim moves the same way with curve <code>"spring"</code>,
                damping <code>{selected.curve.damping}</code> and frequency <code>{selected.curve.frequency}</code>.</p>
            </div>
          {:else}
            <p class="note">{sequence
              ? 'Click a keyframe to edit its time and value here. The playhead moves from the ruler only; double-click a keyframe to send the playhead to it.'
              : 'Pick an easing in the strip below. Custom and spring open their settings here.'}</p>
          {/if}
        </aside>
      {:else}
        <section class="col editcol">
          <p class="note">No animation selected. Name one on the left and add it, or pick a preset below.</p>
        </section>
      {/if}
    </div>

    <!-- The strip: every easing, and the presets -->
    <div class="strip">
      <div class="striplab">
        <b>Easing</b>
        <span>{easingNote}</span>
      </div>
      <div class="easings" role="group" aria-label="Easing">
        {#each EASING_CHOICES as name (name)}
          {@const on = easingApplies(name) && activeEasing === name}
          <button type="button" class="easing" class:on class:off={!easingApplies(name)}
                  aria-pressed={on}
                  title={easingApplies(name) ? (EASING_TITLES[name] ?? `Use ${name}`) : easingNote}
                  onclick={() => pickEasing(name)}>
            <EasingCurve easing={easingShape(name, on)} active={on} width={58} height={34} label={`${name} easing curve`} />
            <span>{name}</span>
          </button>
        {/each}
      </div>
      <div class="sep" aria-hidden="true"></div>
      <div class="striplab presetlab">
        <b>Presets</b>
        {#if presetReport}
          <span class="report" title={presetReport}>{presetReport}</span>
        {:else}
          <span class="hint">{selectionIds.length > 1 ? `Shift+click: all ${selectionIds.length} selected` : 'adds an animation'}</span>
        {/if}
      </div>
      <div class="presets" role="group" aria-label="Presets">
        {#each ANIMATION_PRESETS as entry (entry.id)}
          <button type="button" class="preset" title={entry.summary}
                  onclick={(event) => addPreset(entry.id, event.shiftKey && selectionIds.length > 1)}>{entry.label}</button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  /* One band and a strip, sized to the dock: nothing here scrolls the tab itself. A column that
     is too tall for a short dock scrolls on its own, and the track list scrolls inside its box.
     Type is 13 to 14 px and never under 12; the old tab's labels were 8 to 10. */
  .anim-tab {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    background: #0F1215;
    color: #E8EEF3;
    font: 400 13px/1.35 'IBM Plex Sans', system-ui, sans-serif;
    --pp-field-height: 30px;
    --pp-field-font: 13px;
    --pp-field-label-font: 12px;
    --pp-segment-font: 13px;
    --pp-field-steps: 16px;
    --pp-field-radius: 6px;
    --pp-field-bg: #12161A;
    --pp-field-border: #3A434D;
    --pp-field-fg: #E8EEF3;
  }

  .band { flex: 1; min-height: 0; display: flex; }
  .col { box-sizing: border-box; min-height: 0; min-width: 0; padding: 10px 12px; overflow: hidden auto; scrollbar-color: #4A5560 transparent; }

  /* 1. the list */
  .listcol { flex: 0 0 256px; display: flex; flex-direction: column; gap: 8px; border-right: 1px solid #2B323A; background: #151A1E; }
  .who { display: flex; align-items: center; gap: 8px; min-width: 0; white-space: nowrap; }
  .who b { font-size: 15px; font-weight: 600; color: #E8EEF3; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .who em { font-style: normal; font-size: 12px; color: #AEB9C4; }
  .headtools { margin-left: auto; display: flex; gap: 2px; flex: none; }
  .ic {
    width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; padding: 0;
    border: 1px solid transparent; border-radius: 5px; background: transparent; color: #AEB9C4; cursor: pointer;
  }
  .ic:hover:not(:disabled) { border-color: #3A434D; color: #E8EEF3; }
  .ic:disabled { opacity: 0.4; cursor: default; }
  .who .stale { font-style: normal; font-size: 12px; color: #F6D58A; border: 1px solid #7A5C16; border-radius: 4px; padding: 0 5px; }
  .alarms { display: flex; flex-wrap: wrap; gap: 4px; }
  .alarm {
    font-size: 12px; font-weight: 600; color: #1A1206; background: #E5A029;
    padding: 2px 7px; border-radius: 4px; white-space: nowrap;
  }
  .listwrap { flex: 1; min-height: 60px; display: flex; flex-direction: column; }
  .newrow { display: flex; gap: 6px; }
  .newrow .txt { flex: 1; }
  .renerr { margin: 0; font-size: 12px; color: #F6D58A; }
  .listfoot { display: flex; align-items: center; gap: 6px; }
  .allon { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; color: #AEB9C4; flex: 1; min-width: 0; }
  .allseg { display: flex; flex: 0 0 84px; }

  /* 2. settings */
  /* It gives way before the editor does: on a narrow window it is one column that scrolls itself. */
  .setcol { flex: 0 2 620px; min-width: 290px; border-right: 1px solid #2B323A; background: #171B1F; container-type: inline-size; }
  .setbox { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 6px 18px; align-items: start; }
  /* Narrow: timing above, then what starts it. The column scrolls itself. */
  @container (max-width: 520px) { .setbox { grid-template-columns: minmax(0, 1fr); } }
  .kindrow { grid-column: 1 / -1; }
  .grpcol { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .grp { font-size: 12px; font-weight: 600; color: #AEB9C4; }
  .r { display: grid; grid-template-columns: 68px minmax(0, 1fr); align-items: center; gap: 8px; min-height: 30px; }
  .r.top { align-items: start; }
  .r.top > .lab { padding-top: 6px; }
  .r label, .r .lab { font-size: 13px; color: #AEB9C4; }
  .cell { display: flex; min-width: 0; }
  .r .val { font: 400 13px/1 'IBM Plex Mono', ui-monospace, monospace; color: #E8EEF3; }
  .txt {
    box-sizing: border-box; min-width: 0; width: 100%; height: 30px; padding: 0 8px;
    border: 1px solid #3A434D; border-radius: 6px; background: #12161A; color: #E8EEF3;
    font: 400 13px/1 'IBM Plex Sans', system-ui, sans-serif; outline: none;
  }
  .txt:focus { border-color: #7CC4FF; }
  .hint { margin: 0; font-size: 12px; line-height: 1.4; color: #AEB9C4; }
  .hint code { font-family: 'IBM Plex Mono', ui-monospace, monospace; color: #E8EEF3; }
  .note { margin: 0; font-size: 13px; line-height: 1.45; color: #AEB9C4; }
  .warn {
    margin: 0; padding: 6px 8px; font-size: 12px; line-height: 1.4;
    border: 1px solid #7A5C16; border-radius: 6px; background: #2E2410; color: #F6D58A;
  }
  .warn b { font-weight: 600; color: #FFF1C9; }
  .warn.clashwarn.wins { border-color: #2B323A; background: #171B1F; color: #AEB9C4; }
  .dbg {
    align-self: flex-start; height: 24px; padding: 0 8px; border: 1px solid #3A434D; border-radius: 5px;
    background: transparent; color: #AEB9C4; font: 400 12px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer;
  }
  .dbg:hover { color: #E8EEF3; border-color: #5B6670; }

  /* buttons */
  .mk {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 30px; padding: 0 12px; flex: none;
    border: 1px solid #3A434D; border-radius: 6px; background: #1E2328; color: #E8EEF3;
    font: 500 13px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer; white-space: nowrap;
  }
  .mk:hover:not(:disabled) { border-color: #5B6670; }
  .mk:disabled { opacity: 0.45; cursor: default; }
  .mk.go { border-color: #2E7D6B; background: #10362F; color: #BFF3E6; }
  .mk.go:hover:not(:disabled) { border-color: #3DDBB4; }
  .mk.on { border-color: #F5B83D; color: #F5B83D; }
  .mk.quiet { border-color: transparent; background: transparent; color: #AEB9C4; padding: 0 8px; }
  .mk.quiet:hover:not(:disabled) { color: #E8EEF3; border-color: #3A434D; }
  .mk.danger { border-color: #8A3B3B; background: #331818; color: #FFC9C9; }
  .addtoggle {
    display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; margin-left: auto;
    border: 1px solid #2E7D6B; border-radius: 6px; background: #10362F; color: #BFF3E6;
    font: 500 13px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer;
  }
  .addtoggle:hover { border-color: #3DDBB4; }
  .addtoggle.on { background: #17493F; }

  /* 3. the editor */
  .editcol { flex: 1 1 520px; min-width: 380px; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
  .transport { display: flex; align-items: center; gap: 12px; flex: none; min-width: 0; }
  .transport .time { font: 400 14px/1 'IBM Plex Mono', ui-monospace, monospace; color: #E8EEF3; white-space: nowrap; }
  .transport .time s { text-decoration: none; color: #AEB9C4; margin-left: 4px; }
  /* The selected keyframe's own time: the red of a selected diamond, so it is read as that one. */
  .kfat { margin-left: auto; display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: #AEB9C4; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .kfat i, .kfbox .where i { width: 8px; height: 8px; background: #FF6B6B; outline: 2px solid #FFFFFF; transform: rotate(45deg); flex: 0 0 auto; }
  .kfat.moving { color: #E8EEF3; }

  .pane { flex: 1; min-height: 0; display: flex; flex-direction: column; border: 1px solid #2B323A; border-radius: 8px; background: #12161A; overflow: hidden; }
  .panehead { flex: none; display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 6px 0 12px; border-bottom: 1px solid #2B323A; background: #171B1F; font-size: 13px; }
  .panehead b { font-weight: 600; }
  .panehead .count { color: #AEB9C4; }
  .panebody { flex: 1; min-height: 0; overflow: hidden auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; scrollbar-color: #4A5560 #12161A; }
  .playson { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 13px; color: #AEB9C4; width: 260px; }
  .playson span { white-space: nowrap; }

  .addbox { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 6px 12px; border-bottom: 1px solid #2B323A; background: #1A2026; }
  .addfield { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #AEB9C4; flex: 1 1 150px; max-width: 240px; min-width: 0; }
  .addbtn {
    display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px;
    border: 1px solid #2E7D6B; border-radius: 6px; background: #10362F; color: #BFF3E6;
    font: 500 13px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer; white-space: nowrap;
  }
  .addbtn:hover:not(:disabled) { border-color: #3DDBB4; }
  .addbtn:disabled { opacity: 0.45; cursor: default; }
  .addbox .warn { flex: 1 1 100%; }

  /* 4. details / preview */
  .sidecol { flex: 0 0 256px; display: flex; flex-direction: column; gap: 10px; border-left: 1px solid #2B323A; background: #151A1E; }
  .sideswitch { display: flex; flex: none; }
  .kfbox, .curvebox { display: flex; flex-direction: column; gap: 7px; }
  .kfbox .r, .curvebox .r { grid-template-columns: 64px minmax(0, 1fr); }
  .kfbox .where { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 13px; color: #AEB9C4; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* the strip */
  .strip {
    flex: none; height: 78px; box-sizing: border-box; display: flex; align-items: center; gap: 14px;
    padding: 0 12px; border-top: 1px solid #2B323A; background: #151A1E; overflow: auto hidden; scrollbar-color: #4A5560 transparent;
  }
  .striplab { flex: 0 0 136px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .striplab b { font-size: 14px; font-weight: 600; }
  .striplab span { font-size: 12px; line-height: 1.25; color: #AEB9C4; max-height: 2.5em; overflow: hidden; }
  .striplab .report { color: #BFF3E6; }
  .presetlab { flex-basis: 150px; }
  .easings { display: flex; gap: 5px; flex: none; }
  .easing {
    width: 70px; height: 62px; box-sizing: border-box; padding: 3px 0 2px;
    display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    border: 1px solid #2B323A; border-radius: 6px; background: #171B1F; color: #E8EEF3;
    font: 400 12px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer;
  }
  .easing:hover { border-color: #5B6670; }
  .easing.on { border-color: #5AA9E6; background: #173A5A; }
  .easing.off { color: #8A96A3; cursor: default; }
  .easing.off :global(svg) { opacity: 0.4; }
  .easing :global(.curve) { border: 0; background: transparent; }
  .sep { flex: 0 0 1px; align-self: stretch; margin: 10px 0; background: #2B323A; }
  .presets { flex: 1 1 300px; min-width: 300px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
  .preset {
    height: 28px; padding: 0 8px; border: 1px solid #3A434D; border-radius: 6px; background: #1E2328; color: #E8EEF3;
    font: 400 13px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .preset:hover { border-color: #5B6670; }

  /* nothing armed */
  .empty { margin: auto; max-width: 440px; padding: 16px; text-align: center; display: flex; flex-direction: column; gap: 10px; align-items: center; }
  .empty strong { font-size: 15px; font-weight: 600; }
  .empty p { margin: 0; font-size: 13px; line-height: 1.5; color: #AEB9C4; }
  .arm {
    height: 32px; padding: 0 14px; border: 1px solid #2E7D6B; border-radius: 6px; background: #10362F; color: #BFF3E6;
    font: 500 13px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer;
  }
  .arm:disabled { opacity: 0.45; cursor: default; }
</style>
