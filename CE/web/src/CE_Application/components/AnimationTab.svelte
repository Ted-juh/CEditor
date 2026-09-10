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
  import { onMount } from 'svelte';
  import Plus from 'lucide-svelte/icons/plus';
  import AnimationList from './animation/AnimationList.svelte';
  import TargetList from './animation/TargetList.svelte';
  import EasingCurve from './animation/EasingCurve.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import Segmented from '../properties/Segmented.svelte';
  import PropertySelect from '../properties/PropertySelect.svelte';
  import { activePanel, selectedComponentIds } from '../stores/panels.js';
  import { updateControlProperty, getSection } from '../stores/controls.js';
  import { flatControls } from '../utils/containment.js';
  import {
    editorTarget,
    activateEditorTarget,
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
    TRIGGER_TYPES,
    EASING_NAMES,
    targetStatus,
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

  let targets = $derived(selected ? describeTargets(selected, partNames) : []);
  let deadCount = $derived(rows.reduce((sum, row) => sum + deadTargetCount(row, partNames), 0));

  let rawTargetIndex = $state(-1);
  let targetIndex = $derived(rawTargetIndex >= 0 && rawTargetIndex < targets.length ? rawTargetIndex : -1);

  // What the "add a target" row is set to.
  let newPart = $state('');
  let newProperty = $state(OFFERED_PROPERTIES[0].path);
  let partForAdd = $derived(newPart || partNames[0] || '');
  let offeredForAdd = $derived(OFFERED_PROPERTIES.find((entry) => entry.path === newProperty) ?? OFFERED_PROPERTIES[0]);
  // Tell the user before they add it, not after.
  let addStatus = $derived(targetStatus(buildTarget(partForAdd, offeredForAdd), partNames));

  onMount(() => {
    if (mine) return;
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) activateEditorTarget('animation', first);
  });

  function armFromSelection() {
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) activateEditorTarget('animation', first);
  }

  function setProp(prop, value) {
    if (!controlId || !selectedName) return;
    updateControlProperty(controlId, `Animations.${selectedName}.${prop}`, value);
  }

  function writeTargets(next) {
    if (!controlId || !selectedName) return;
    updateControlProperty(controlId, `Animations.${selectedName}.targets`, next);
  }

  function add() {
    if (!selected) return;
    const target = buildTarget(partForAdd, offeredForAdd);
    if (!target) return;
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
          ontoggle={(row) => {
            if (controlId) updateControlProperty(controlId, `Animations.${row.name}.enabled`, !row.enabled);
          }}
        />
      </div>

      {#if selected}
        <div class="setcol">
          <div class="colh">{selected.name}</div>
          <div class="setbox">
            <div class="grp">Timing</div>
            <div class="r">
              <label for="anim-dur">Duration</label>
              <div class="cell"><NumberCell label="ms" value={selected.duration} min={0} step={10}
                onchange={(value) => setProp('duration', Math.max(0, Math.round(value)))} /></div>
            </div>
            <div class="r">
              <label for="anim-delay">Delay</label>
              <div class="cell"><NumberCell label="ms" value={selected.delay} min={0} step={10}
                onchange={(value) => setProp('delay', Math.max(0, Math.round(value)))} /></div>
            </div>

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

          <div class="addbox">
            <div class="r">
              <label for="anim-part">Part</label>
              <PropertySelect options={partNames.map((name) => ({ value: name, label: name }))}
                              value={partForAdd} ariaLabel="Part"
                              onchange={(value) => { newPart = value; }} />
            </div>
            <div class="r">
              <label for="anim-what">Change</label>
              <PropertySelect options={OFFERED_PROPERTIES.map((entry) => ({ value: entry.path, label: entry.label }))}
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
