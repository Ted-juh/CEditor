<script>
  /**
   * The Animation tab.
   *
   * Candidate 8 of the display-panel plan. See docs/design/animation-tab-design.md.
   *
   * Two things to know before editing this file.
   *
   * FIRST, the tab exists because the properties panel offers things that do not work. Its
   * "Property" dropdown has seven choices and two of them — Fill colour and Text colour — are not
   * on the list the runtime accepts, so picking one gives you an animation that never runs, with no
   * message anywhere. utils/animationModel.js has the rule, and its test runs the real runtime over
   * all seven to check the rule still matches.
   *
   * SECOND, THE PROPERTIES PANEL IS UNTOUCHED. AnimationsEditor still draws every section and still
   * edits every field, JSON box and all. Nothing has been moved. allAnimationFieldLabels() is there
   * for the day the panel's rows do come out, because the panel builds its search box from the rows
   * it draws.
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
  import * as anime from '../utils/animeTimeline.js';
  import AnimationList from './animation/AnimationList.svelte';
  import TargetList from './animation/TargetList.svelte';
  import EasingCurve from './animation/EasingCurve.svelte';
  import KeyframeTimeline from './animation/KeyframeTimeline.svelte';
  import { addKeyframe, removeKeyframe, updateKeyframe, normalizeKeyframes, keyframesDuration, sampleKeyframes, isColourTarget } from '../utils/keyframeModel.js';
  import { scrubKeyframes, clearKeyframeScrub, playKeyframesPreview } from '../utils/keyframePlayer.js';
  import NumberCell from '../properties/NumberCell.svelte';
  import Segmented from '../properties/Segmented.svelte';
  import PropertySelect from '../properties/PropertySelect.svelte';
  import { activePanel, selectedComponentIds } from '../stores/panels.js';
  import { updateControlProperty, removeControlNode, getSection } from '../stores/controls.js';
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
    offeredTargetsFor,
    resolvedPartsOf,
    TRIGGER_TYPES,
    EASING_NAMES,
    ANIMATION_KINDS,
    springPoints,
    animationWithKind,
    baseValueAt,
    targetStatus,
    newAnimationShape,
    cleanAnimationName,
    uniqueAnimationName,
    renameBlockedBecause,
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
  // For "does this part exist", generator-made parts count: a filmstrip's frame lives on one.
  let knownPartNames = $derived([...new Set([...partNames, ...Object.keys(resolvedPartsOf(control))])]);
  // What the Change dropdown offers for this control: the part properties, its value channels,
  // and a frame track per filmstrip part.
  let offered = $derived(offeredTargetsFor(control));

  let rows = $derived(control ? readAnimations(control) : []);
  let allOn = $derived(control ? animationsEnabled(control) : true);

  let wantedName = $state('');
  let selectedName = $derived(rows.some((row) => row.name === wantedName) ? wantedName : (rows[0]?.name ?? ''));
  let selected = $derived(rows.find((row) => row.name === selectedName) ?? null);

  let targets = $derived(selected ? describeTargets(selected, knownPartNames) : []);
  let deadCount = $derived(rows.reduce((sum, row) => sum + deadTargetCount(row, partNames), 0));

  let rawTargetIndex = $state(-1);
  let targetIndex = $derived(rawTargetIndex >= 0 && rawTargetIndex < targets.length ? rawTargetIndex : -1);

  // What the "add a target" row is set to.
  let newPart = $state('');
  let newProperty = $state(OFFERED_PROPERTIES[0].path);
  let partForAdd = $derived(newPart || partNames[0] || '');
  let offeredForAdd = $derived(offered.find((entry) => entry.path === newProperty) ?? offered[0]);
  // Tell the user before they add it, not after.
  let addStatus = $derived(targetStatus(buildTarget(partForAdd, offeredForAdd), knownPartNames, { kind: selected?.kind ?? 'transition', triggerType: selected?.triggerType ?? 'stateChange' }));

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

  /** One store write, so switching kind is one undo step even when it fills in what the kind needs. */
  function setKind(kind) {
    if (!controlId || !selectedName || !selected) return;
    updateControlProperty(controlId, `Animations.${selectedName}`, animationWithKind(selected.animation, kind, control));
  }

  function writeTargets(next) {
    if (!controlId || !selectedName) return;
    updateControlProperty(controlId, `Animations.${selectedName}.targets`, next);
  }

  // --- Keyframes: the time axis, the playhead on the canvas, and one keyframe at a time ---------

  const KIND_LABELS = { transition: 'Transition', spring: 'Spring', keyframes: 'Keyframes' };
  let isKeyframes = $derived(selected?.kind === 'keyframes');
  let axisLength = $derived(isKeyframes ? keyframesDuration(selected.animation) : 0);
  let tracks = $derived(isKeyframes
    ? targets.map((row) => ({ label: trackLabel(row), path: row.path, keyframes: normalizeKeyframes(row.target) }))
    : []);
  let playhead = $state(0);
  let selectedKeyframe = $state(null); // { track, index }
  let keyframeAt = $derived.by(() => {
    if (!isKeyframes || !selectedKeyframe) return null;
    const target = selected.targets[selectedKeyframe.track];
    const frames = target ? normalizeKeyframes(target) : [];
    const keyframe = frames[selectedKeyframe.index];
    return keyframe ? { ...selectedKeyframe, target, keyframe, colour: isColourTarget(target) } : null;
  });
  let playing = $state(false);
  let stopPreview = null;

  function trackLabel(row) {
    const [, partName, ...rest] = row.path.startsWith('Parts.') ? row.path.split('.') : ['', '', row.path];
    const whole = offered.find((entry) => entry.scope === 'control' && entry.path === row.path);
    if (whole) return whole.label;
    const entry = OFFERED_PROPERTIES.find((e) => e.path === rest.join('.')) ?? OFFERED_PROPERTIES.find((e) => e.path === row.path);
    const what = entry?.label ?? rest.join('.') ?? row.path;
    return partName ? `${partName} · ${what}` : what;
  }

  /** The canvas shows the pose at the playhead, in any view. */
  function scrubTo(ms) {
    playhead = Math.max(0, Math.round(ms));
    if (controlId && selected && isKeyframes) scrubKeyframes(controlId, selectedName, selected.animation, playhead);
  }

  function stopPlaying() {
    stopPreview?.();
    stopPreview = null;
    playing = false;
  }

  function togglePlay() {
    if (!controlId || !selected || !isKeyframes) return;
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
    if (!selected || !isKeyframes) return;
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
    if (follow) selectedKeyframe = follow;
  }

  // While a keyframes animation is open, the canvas shows its pose at the playhead — on arrival,
  // after every edit (the scrub rebuilds when the definition changes), and as the playhead moves.
  // Anything else open on the control takes the pose off again. While playing, the preview owns
  // the overlay and this stays out of its way.
  $effect(() => {
    if (!controlId) return;
    if (playing) return;
    if (!isKeyframes || !selected) {
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
    // On a keyframes animation a new track starts with one keyframe holding the authored value,
    // as the kind switch seeds, so adding it changes nothing on screen until a second one.
    if (isKeyframes) {
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
    // fields, then drop the old one. `name` travels inside the value too and has to follow.
    const source = rows.find((row) => row.name === from)?.animation;
    if (!source) return;
    updateControlProperty(controlId, `Animations.${to}`, { ...source, name: to });
    removeControlNode(controlId, `Animations.${from}`);
    wantedName = to;
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
      </div>

      {#if selected}
        <div class="setcol">
          <div class="colh">{selected.name}</div>
          <div class="setbox">
            <div class="grp">Timing</div>
            <div class="r">
              <label for="anim-kind">Kind</label>
              <Segmented options={ANIMATION_KINDS.map((value) => ({ value, label: KIND_LABELS[value] }))}
                         value={ANIMATION_KINDS.includes(selected.kind) ? selected.kind : 'transition'} ariaLabel="Kind"
                         onchange={(value) => setKind(value)} />
            </div>
            <div class="r">
              <label for="anim-dur">{selected.kind === 'spring' ? 'Settle' : isKeyframes ? 'Length' : 'Duration'}</label>
              <div class="cell"><NumberCell label="ms" value={isKeyframes ? axisLength : selected.duration} min={isKeyframes ? 100 : 0} step={10}
                onchange={(value) => setProp('duration', Math.max(isKeyframes ? 100 : 0, Math.round(value)))} /></div>
            </div>
            {#if isKeyframes}
              <div class="r">
                <label for="anim-loop">Loop</label>
                <Segmented options={[{ value: 'off', label: 'Once' }, { value: 'on', label: 'Loop' }]}
                           value={selected.loop ? 'on' : 'off'} ariaLabel="Loop"
                           onchange={(value) => setProp('loop', value === 'on')} />
              </div>
              <div class="r">
                <label for="anim-hold">After</label>
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
            <div class="r">
              <label for="anim-trigger">Trigger</label>
              <Segmented options={TRIGGER_TYPES.map((value) => ({ value, label: value === 'stateChange' ? 'State' : 'Value' }))}
                         value={selected.triggerType} ariaLabel="Trigger"
                         onchange={(value) => setProp('trigger.type', value)} />
            </div>
            {#if selected.triggerType === 'stateChange'}
              <div class="r">
                <label for="anim-from">From</label>
                <input class="txt" id="anim-from" type="text" value={selected.from.join(', ')}
                       placeholder="* for any"
                       onchange={(event) => setProp('trigger.from', event.currentTarget.value.split(',').map((v) => v.trim()).filter(Boolean))} />
              </div>
              <div class="r">
                <label for="anim-to">To</label>
                <input class="txt" id="anim-to" type="text" value={selected.to.join(', ')}
                       placeholder="hover, pressed"
                       onchange={(event) => setProp('trigger.to', event.currentTarget.value.split(',').map((v) => v.trim()).filter(Boolean))} />
              </div>
            {:else}
              <div class="r">
                <label for="anim-source">Source</label>
                <input class="txt" id="anim-source" type="text" value={selected.source}
                       onchange={(event) => setProp('trigger.source', event.currentTarget.value)} />
              </div>
            {/if}

            {#if isKeyframes}
              <div class="grp">Sequence</div>
              <p class="note">A keyframe per diamond. Drag one along the axis; click it to set its time, value and the easing it arrives with. Only transform, opacity and colour tracks animate (the same ones a transition can smooth).</p>
            {:else if selected.kind === 'spring'}
              <div class="grp">Spring</div>
              <div class="r">
                <label for="anim-damping">Damping</label>
                <div class="cell"><NumberCell label="damp" value={selected.damping} min={0.5} step={0.5}
                  onchange={(value) => setProp('damping', Math.max(0.5, value))} /></div>
              </div>
              <div class="r">
                <label for="anim-frequency">Frequency</label>
                <div class="cell"><NumberCell label="freq" value={selected.frequency} min={1} step={1}
                  onchange={(value) => setProp('frequency', Math.max(1, value))} /></div>
              </div>
              <div class="spring">
                <EasingCurve points={springPoints(selected.damping, selected.frequency)} active width={204} height={64}
                             label={`spring, damping ${selected.damping}, frequency ${selected.frequency}`} />
                <p class="note">Overshoots and settles over the settle time. The same curve as <code>ce.anim.spring</code>; less damping or more frequency means more bounce.</p>
              </div>
            {:else}
              <div class="grp">Easing</div>
              <div class="easings">
                {#each EASING_NAMES as name (name)}
                  <button type="button" class="easing" class:on={selected.easing === name}
                          title={`Use ${name}`} onclick={() => setProp('easing', name)}>
                    <EasingCurve {name} active={selected.easing === name} width={64} height={44} />
                    <span>{name}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <div class="targetcol">
          <div class="colh">
            Changes
            <s>{targets.length} {targets.length === 1 ? 'target' : 'targets'}</s>
          </div>
          <TargetList
            rows={targets}
            selectedIndex={targetIndex}
            onselect={(index) => { rawTargetIndex = index; }}
            onremove={drop}
            onreorder={reorder}
          />

          {#if isKeyframes}
            <div class="seq">
              <div class="transport">
                <button type="button" class="mk" class:on={playing} onclick={togglePlay} title={playing ? 'Stop' : 'Play on the canvas'} aria-label={playing ? 'Stop' : 'Play'}>
                  {#if playing}<Square size={10} />{:else}<Play size={10} />{/if}
                </button>
                <span class="time" aria-live="off">{playhead} ms <s>of {axisLength}</s></span>
                <button type="button" class="mk" disabled={!targets.length} onclick={addKeyframeAtPlayhead} title="Add a keyframe to the selected track at the playhead">
                  <Plus size={10} /> Keyframe at {playhead} ms
                </button>
              </div>
              <KeyframeTimeline
                {tracks}
                duration={axisLength}
                time={playhead}
                selected={selectedKeyframe}
                ontime={scrubTo}
                onmove={moveKeyframes}
                onselect={(at) => { selectedKeyframe = at; if (at) rawTargetIndex = at.track; if (at) scrubTo(tracks[at.track]?.keyframes[at.index]?.time ?? playhead); }}
              />
              {#if keyframeAt}
                <div class="kfbox">
                  <div class="r">
                    <label for="kf-time">Time</label>
                    <div class="cell"><NumberCell label="ms" value={keyframeAt.keyframe.time} min={0} step={10}
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
                <p class="note">Click a keyframe to edit it. The first keyframe on a track is where it starts; a track with one keyframe holds that value.</p>
              {/if}
            </div>
          {/if}

          <div class="addbox">
            <div class="r">
              <label for="anim-part">Part</label>
              <PropertySelect options={partNames.map((name) => ({ value: name, label: name }))}
                              value={partForAdd} ariaLabel="Part" disabled={offeredForAdd?.scope === 'control'}
                              onchange={(value) => { newPart = value; }} />
            </div>
            <div class="r">
              <label for="anim-what">Change</label>
              <PropertySelect options={offered.map((entry) => ({ value: entry.path, label: entry.label }))}
                              value={newProperty} ariaLabel="What to change"
                              onchange={(value) => { newProperty = value; }} />
            </div>

            {#if !addStatus.works}
              <p class="warn">
                <b>{titleCase(offeredForAdd.label)} does nothing.</b>
                {addStatus.detail}
              </p>
            {/if}

            <button type="button" class="addbtn" disabled={!partNames.length} onclick={add}>
              <Plus size={11} /> Add this change
            </button>
          </div>
        </div>
      {/if}
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
  .r > label {
    font: 400 9.5px/1.15 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
    text-align: right;
  }

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
  .spring { margin-top: 7px; }
  .note { margin: 6px 0 0; font-size: 10.5px; line-height: 1.4; color: #8E99A4; }
  .note code { color: #B9C4CE; }
  .seq { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
  .transport { display: flex; align-items: center; gap: 8px; }
  .transport .time { font-size: 11px; color: #EAF5FF; font-variant-numeric: tabular-nums; }
  .transport .time s { text-decoration: none; color: #6E7A86; margin-left: 4px; }
  .mk.on { border-color: #F5B83D; color: #F5B83D; }
  .mk.danger { align-self: flex-start; color: #E5A029; }
  .kfbox { border: 1px solid #2A3038; border-radius: 4px; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; background: #15181B; }
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
</style>
