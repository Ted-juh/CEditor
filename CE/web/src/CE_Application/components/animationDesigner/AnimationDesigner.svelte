<script>
  /**
   * The Animation Designer: a document tab of its own for one panel's animation (the design record,
   * step 5; the owner's mockup, "Animation Designer: the full editor").
   *
   *   header     the panel, the transport: Play, the time, 0.25× / 0.5× / 1×, Snap, Loop
   *   library    the effects (sceneModel.js SCENE_EFFECTS) and your own (Mine), to drag onto a
   *              control on the stage or a track, or to click onto the control picked
   *   stage      the panel, drawn live and posed at the playhead (stores/sceneStage.js); a click picks
   *              a control, Hover and Press try a trigger. Nothing on it reaches the synth: its
   *              controls are never touched, only shown, and no script runs for it
   *   settings   the selected clip (ClipSettings.svelte)
   *   scenes     the panel's scenes, and each control's own keyframe animations and text effects —
   *              "separate AND as a scene": one animation, two views, never a copy
   *   timeline   the scene's tracks and clips (SceneTimeline.svelte)
   *
   * It plays only under the playhead (the owner's rule): Play moves the playhead, and the stage is
   * posed at each moment, at the chosen speed. Undo is its own (registerHistoryContext), over what it
   * edits: the panel's scenes and its controls' Animations sections.
   */
  import { onDestroy, setContext } from 'svelte';
  import { get, writable } from 'svelte/store';
  import Play from 'lucide-svelte/icons/play';
  import Square from 'lucide-svelte/icons/square';
  import Plus from 'lucide-svelte/icons/plus';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import PanelPreviewSurface from '../../editor/PanelPreviewSurface.svelte';
  import SceneTimeline from './SceneTimeline.svelte';
  import ClipSettings from './ClipSettings.svelte';
  import { panels, updatePanel, activeEditorTab } from '../../stores/panels.js';
  import { applyControlPatchesById } from '../../stores/controls.js';
  import { registerHistoryContext, scheduleSnapshot } from '../../stores/history.js';
  import { updatePanelPreviewSession } from '../../stores/interactionPreview.js';
  import { animationPresetLibrary, saveEffectAsPreset } from '../../stores/animationPresetLibrary.js';
  import { fileCache } from '../../stores/fileCache.js';
  import { SCENE_STAGE } from '../../stores/sceneStage.js';
  import { cleanSceneList, SCENE_TRIGGER_TYPES } from '../../utils/sceneFormat.js';
  import {
    SCENE_EFFECTS, SCENE_EFFECT_CATEGORIES, sceneEffect, effectFromPreset, newScene, newClip, addClip, moveClip,
    resizeClip, removeClip, duplicateClip, setClipEffect, setClipTarget, tracksOf, controlScenes, clipAnimation,
  } from '../../utils/sceneModel.js';
  import { flatControls, flatControlsWithPanelRects } from '../../utils/containment.js';
  import { buildSolidStyle, buildGradientStyle, buildLayerStyle } from '../../utils/backgroundCSS.js';
  import { buildGridStyle } from '../../utils/gridCSS.js';

  let { panelId } = $props();

  let panel = $derived($panels.find((entry) => entry.id === panelId) ?? null);
  let controls = $derived(panel?.controls ?? []);
  let flat = $derived(flatControls(controls));
  let panelScenes = $derived(cleanSceneList(panel?.animationScenes));
  let ownScenes = $derived(controlScenes(controls));

  let sceneId = $state('');
  let scene = $derived(panelScenes.find((entry) => entry.id === sceneId) ?? ownScenes.find((entry) => entry.id === sceneId) ?? panelScenes[0] ?? ownScenes[0] ?? null);
  let tracks = $derived(scene ? tracksOf(scene, controls) : []);
  let clipId = $state('');
  let clip = $derived(scene?.clips.find((entry) => entry.id === clipId) ?? null);
  let clipControl = $derived(clip ? flat.find((entry) => entry._children?.Core?.id === clip.controlId) ?? null : null);
  let pickedId = $state('');
  let picked = $derived(flat.find((entry) => entry._children?.Core?.id === pickedId) ?? null);
  let note = $state('');

  // --- The playhead -------------------------------------------------------------------------------
  let at = $state(0);
  let playing = $state(false);
  let speed = $state(1);
  let snap = $state(10);
  let frame = 0;
  let lastTick = 0;

  function tick(now) {
    if (!playing || !scene) return;
    const dt = lastTick ? (now - lastTick) * speed : 0;
    lastTick = now;
    let next = at + dt;
    if (next >= scene.length) {
      if (scene.loop) next %= scene.length;
      else { at = scene.length; stop(); return; }
    }
    at = next;
    frame = requestAnimationFrame(tick);
  }
  function play() {
    if (!scene) return;
    if (at >= scene.length) at = 0;
    playing = true;
    lastTick = 0;
    frame = requestAnimationFrame(tick);
  }
  function stop() {
    playing = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  onDestroy(stop);
  const seconds = (ms) => (ms / 1000).toFixed(2);

  // The stage poses every control at the playhead; only the controls inside it see this.
  const stage = writable({ scene: null, at: 0, playing: false, phase: 'a' });
  setContext(SCENE_STAGE, stage);
  $effect(() => { stage.set({ scene, at, playing: false, phase: 'a' }); });

  // --- Undo -----------------------------------------------------------------------------------------
  /** What the Designer edits, as plain data: the panel's scenes, and each animated control's Animations. */
  function designerState() {
    const current = get(panels).find((entry) => entry.id === panelId);
    if (!current) return null;
    const animations = {};
    for (const control of flatControls(current.controls ?? [])) {
      const section = control?._children?.Animations;
      if (!section) continue;
      if (Object.values(section._children ?? {}).some((node) => ['keyframes', 'text'].includes(String(node?.kind)))) {
        animations[control._children.Core.id] = section;
      }
    }
    return JSON.parse(JSON.stringify({ scenes: current.animationScenes ?? [], animations }));
  }
  $effect(() => registerHistoryContext({
    kind: 'animationDesigner',
    id: panelId,
    isActive: () => { const tab = get(activeEditorTab); return tab?.type === 'animation' && tab.id === panelId; },
    snapshot: designerState,
    restore: (snapshot) => {
      if (!snapshot) return;
      const copy = JSON.parse(JSON.stringify(snapshot));
      updatePanel(panelId, { animationScenes: copy.scenes });
      const patches = new Map(Object.entries(copy.animations).map(([id, section]) => [id, { Animations: section }]));
      if (patches.size) applyControlPatchesById(patches, panelId);
    },
  }));

  // --- Writing --------------------------------------------------------------------------------------
  function writeScenes(list, tag) {
    updatePanel(panelId, { animationScenes: list });
    scheduleSnapshot(tag);
  }

  /** A control's own animation, rewritten from its one clip: only the settings that changed. */
  function writeOwn(previous, next, tag) {
    const [before] = previous.clips;
    const [after] = next.clips;
    const base = `Animations.${previous.animation}`;
    const patch = {};
    if (after.start !== before.start) patch[`${base}.delay`] = after.start;
    if (after.effect.kind !== 'text' && after.length !== before.length) patch[`${base}.duration`] = after.length;
    if (after.target !== before.target) patch[`${base}.targets`] = [{ path: after.target }];
    for (const key of new Set([...Object.keys(before.effect), ...Object.keys(after.effect)])) {
      if (JSON.stringify(before.effect[key]) !== JSON.stringify(after.effect[key])) patch[`${base}.${key}`] = after.effect[key];
    }
    if (!Object.keys(patch).length) return;
    applyControlPatchesById(new Map([[previous.controlId, patch]]), panelId);
    scheduleSnapshot(tag);
  }

  function changeScene(next, tag) {
    if (!scene || !next) return;
    if (scene.own) writeOwn(scene, next, tag);
    else writeScenes(panelScenes.map((entry) => (entry.id === next.id ? next : entry)), tag);
  }

  // --- Scenes ---------------------------------------------------------------------------------------
  function addScene() {
    const next = newScene(`Scene ${panelScenes.length + 1}`, { type: panelScenes.length ? 'script' : 'panelOpen' });
    writeScenes([...panelScenes, next], 'scene:add');
    sceneId = next.id;
    clipId = '';
    at = 0;
  }
  function removeScene() {
    if (!scene || scene.own) return;
    writeScenes(panelScenes.filter((entry) => entry.id !== scene.id), 'scene:remove');
    sceneId = '';
    clipId = '';
  }
  function selectScene(id) {
    stop();
    sceneId = id;
    clipId = '';
    at = 0;
  }
  const TRIGGER_LABELS = { panelOpen: 'Panel opens', state: 'A control enters a state', event: 'A gesture on a control', beat: 'The beat', script: 'A script asks' };

  // --- Clips ----------------------------------------------------------------------------------------
  function effectFor(id) {
    if (String(id).startsWith('mine:')) {
      const preset = $animationPresetLibrary.find((entry) => entry.id === String(id).slice(5));
      return preset ? effectFromPreset(preset) : null;
    }
    return sceneEffect(id);
  }

  /** An effect onto a control at a time: a new clip, in the scene shown, or a new scene if none. */
  function placeEffect(effectId, controlId, start = at, target = null) {
    const entry = effectFor(effectId);
    const control = flat.find((c) => c._children?.Core?.id === controlId);
    if (!entry || !control) return;
    if (scene?.own) { note = 'A control\'s own animation has one clip. Make a scene (+ Scene) to put effects together.'; return; }
    let place = target ?? entry.target ?? 'Transform';
    if (entry.effect.kind === 'text' && !String(place).startsWith('Parts.')) place = 'Text';
    if (place === 'Text' && !control._children?.Text) { note = `${control._children.Core.name || controlId} has no words of its own: a text effect plays on a Label, or on a part with text.`; return; }
    let base = scene;
    let list = panelScenes;
    if (!base) {
      base = newScene('Scene 1', { type: 'panelOpen' });
      list = [...panelScenes, base];
      sceneId = base.id;
    }
    const added = newClip({ controlId, target: place, start: Math.max(0, Math.round(start / snap) * snap), length: entry.length ?? 600, effect: entry.effect, label: entry.label });
    const next = addClip(base, added);
    writeScenes(list.map((s) => (s.id === next.id ? next : s)), 'clip:add');
    clipId = added.id;
    pickedId = controlId;
    note = '';
  }

  function onmove(id, start, { copy } = {}) { changeScene(copy ? duplicateClip(scene, id, start, snap) : moveClip(scene, id, start, snap), copy ? 'clip:copy' : `clip:move:${id}`); }
  function onresize(id, length) { changeScene(resizeClip(scene, id, length, snap), `clip:length:${id}`); }
  function ondelete(id) { if (scene?.own) return; changeScene(removeClip(scene, id), 'clip:remove'); if (clipId === id) clipId = ''; }

  // --- The library ----------------------------------------------------------------------------------
  let category = $state('All');
  let mine = $derived($animationPresetLibrary
    .map((preset) => ({ preset, entry: effectFromPreset(preset) }))
    .filter(({ entry }) => entry)
    .map(({ preset, entry }) => ({ id: `mine:${preset.id}`, label: preset.name, category: 'Mine', ...entry })));
  let shownEffects = $derived(category === 'Mine' ? mine : category === 'All' ? [...SCENE_EFFECTS, ...mine] : SCENE_EFFECTS.filter((entry) => entry.category === category));
  function dragEffect(event, id) {
    event.dataTransfer?.setData('application/x-ce-effect', id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  // --- The stage ------------------------------------------------------------------------------------
  let stageBox = $state(null);
  let boxSize = $state({ width: 600, height: 400 });
  $effect(() => {
    if (!stageBox || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => { boxSize = { width: stageBox.clientWidth, height: stageBox.clientHeight }; });
    observer.observe(stageBox);
    return () => observer.disconnect();
  });
  let scale = $derived(panel ? Math.max(0.1, Math.min((boxSize.width - 24) / panel.width, (boxSize.height - 24) / panel.height, 2)) : 1);
  let rects = $derived(flatControlsWithPanelRects(controls));
  let bgLayers = $derived(panel ? {
    solid: buildSolidStyle(panel),
    gradient: buildGradientStyle(panel),
    image: buildLayerStyle(panel, 'Image', panel.bgImage ? $fileCache[panel.bgImage] : null),
    texture: buildLayerStyle(panel, 'Texture', panel.bgTexture ? $fileCache[panel.bgTexture] : null),
  } : {});
  let gridStyle = $derived(panel ? buildGridStyle(panel, { gridEnabled: false }) : '');

  /** The topmost control under a point on the stage, or null. */
  function controlAt(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / scale;
    const y = (event.clientY - box.top) / scale;
    for (let i = rects.length - 1; i >= 0; i -= 1) {
      const t = rects[i]._children.Transform;
      if (x >= t.x && y >= t.y && x <= t.x + (t.width ?? 0) && y <= t.y + (t.height ?? 0)) return rects[i]._children.Core.id;
    }
    return null;
  }
  let pickedRect = $derived(rects.find((entry) => entry._children.Core.id === pickedId)?._children.Transform ?? null);
  let dropOver = $state(false);
  function stageDrop(event) {
    dropOver = false;
    const id = event.dataTransfer?.getData('application/x-ce-effect');
    const controlId = controlAt(event);
    if (!id || !controlId) return;
    event.preventDefault();
    placeEffect(id, controlId, at);
  }
  /** Hover or Press on the picked control, for a moment: its own animations show what they do. */
  function tryTrigger(flags) {
    if (!pickedId) { note = 'Pick a control on the stage first.'; return; }
    updatePanelPreviewSession(pickedId, flags);
    setTimeout(() => updatePanelPreviewSession(pickedId, Object.fromEntries(Object.keys(flags).map((key) => [key, false]))), 900);
  }

  // --- Clip settings --------------------------------------------------------------------------------
  function savePreset(name) {
    if (!clip) return;
    const { preset, reason } = saveEffectAsPreset(clipAnimation(clip), { name, category: clip.effect.kind === 'text' ? 'Text' : 'Move' });
    note = reason ?? `${preset.name} is in your library (Mine), to drop on any control.`;
  }
</script>

<div class="ad" data-animation-designer={panelId}>
  <header class="head">
    <div class="title">
      <b>Animation Designer</b>
      <span>{panel?.name ?? 'No panel'} · plays here under the playhead; in Preview and the plug-in from step 5b</span>
    </div>
    <div class="transport">
      <button type="button" class="tbtn" data-play aria-label={playing ? 'Stop' : 'Play scene'} disabled={!scene} onclick={() => (playing ? stop() : play())}>
        {#if playing}<Square size={14} />{:else}<Play size={14} />{/if} {playing ? 'Stop' : 'Play scene'}
      </button>
      <span class="time" data-time>{seconds(at)} / {seconds(scene?.length ?? 0)} s</span>
      <span class="seg" role="group" aria-label="Speed">
        {#each [0.25, 0.5, 1] as value (value)}
          <button type="button" class:on={speed === value} aria-pressed={speed === value} onclick={() => { speed = value; }}>{value}×</button>
        {/each}
      </span>
      <label class="snap">Snap
        <select value={String(snap)} onchange={(event) => { snap = Number(event.currentTarget.value); }}>
          {#each [10, 50, 100] as value (value)}<option value={String(value)}>{value} ms</option>{/each}
        </select>
      </label>
      {#if note}<span class="note" role="status">{note}</span>{/if}
    </div>
  </header>

  <aside class="lib" aria-label="Library">
    <div class="ph">Library</div>
    <div class="cats" role="group" aria-label="Library filter">
      {#each SCENE_EFFECT_CATEGORIES as name (name)}
        <button type="button" class:on={category === name} aria-pressed={category === name} onclick={() => { category = name; }}>{name}</button>
      {/each}
    </div>
    <div class="cards">
      {#each shownEffects as entry (entry.id)}
        <button type="button" class="card" draggable="true" data-effect={entry.id}
                title={pickedId ? `Click: onto ${picked?._children?.Core?.name ?? pickedId} at the playhead. Or drag onto a control or a track.` : 'Drag onto a control on the stage or a track, or pick a control and click'}
                ondragstart={(event) => dragEffect(event, entry.id)} onclick={() => (pickedId ? placeEffect(entry.id, pickedId) : (note = 'Pick a control on the stage, or drag the effect onto one.'))}>
          <span class="cn">{entry.label}</span><span class="cc">{entry.category}</span>
        </button>
      {:else}
        <p class="empty">Nothing here yet. Save an effect as a preset and it is here.</p>
      {/each}
    </div>
    <p class="hint">Drag an effect onto a control, or onto a track.</p>
  </aside>

  <section class="stage" aria-label="Stage">
    <div class="stagebar">
      <span>Try a trigger:</span>
      <button type="button" class="tb" onclick={() => tryTrigger({ hover: true })}>Hover</button>
      <button type="button" class="tb" onclick={() => tryTrigger({ hover: true, pressed: true })}>Press</button>
      <span class="safe">Nothing on the stage reaches the synth</span>
    </div>
    <div class="stagebox" bind:this={stageBox}>
      {#if panel}
        <div class="board" style={`width:${panel.width * scale}px;height:${panel.height * scale}px`}>
          <PanelPreviewSurface {panel} {scale} {bgLayers} {gridStyle} />
          <!-- Clicks pick, and a dropped effect lands on the control under it; the controls under
               this layer are never touched, so nothing is turned, pressed or sent. -->
          <div class="pick" class:drop={dropOver} role="button" tabindex="-1" aria-label="Pick a control"
               data-pick
               onclick={(event) => { pickedId = controlAt(event) ?? ''; }}
               onkeydown={() => {}}
               ondragover={(event) => { if (event.dataTransfer?.types?.includes('application/x-ce-effect')) { event.preventDefault(); dropOver = true; } }}
               ondragleave={() => { dropOver = false; }}
               ondrop={stageDrop}>
            {#if pickedRect}
              <span class="picked" style={`left:${pickedRect.x * scale}px;top:${pickedRect.y * scale}px;width:${(pickedRect.width ?? 0) * scale}px;height:${(pickedRect.height ?? 0) * scale}px`}>
                <i>{picked?._children?.Core?.name ?? pickedId}</i>
              </span>
            {/if}
          </div>
        </div>
      {:else}
        <p class="empty">This panel is not open.</p>
      {/if}
    </div>
  </section>

  <aside class="set" aria-label="Clip settings">
    <div class="ph">{clip ? 'Clip' : 'Settings'}</div>
    <ClipSettings {clip} control={clipControl} own={!!scene?.own} sceneName={scene?.own ? '' : scene?.name ?? ''}
                  onpatch={(patch) => changeScene(setClipEffect(scene, clip.id, patch), `clip:effect:${clip.id}`)}
                  ontarget={(target) => changeScene(setClipTarget(scene, clip.id, target), `clip:target:${clip.id}`)}
                  onstart={(start) => changeScene(moveClip(scene, clip.id, start, 1), `clip:move:${clip.id}`)}
                  onlength={(length) => changeScene(resizeClip(scene, clip.id, length, 1), `clip:length:${clip.id}`)}
                  ondelete={() => ondelete(clip.id)}
                  onsavepreset={savePreset} />
  </aside>

  <section class="bottom">
    <nav class="scenes" aria-label="Scenes">
      <div class="ph">Scenes <button type="button" class="tb add" data-add-scene onclick={addScene}><Plus size={12} /> Scene</button></div>
      {#each panelScenes as entry (entry.id)}
        <button type="button" class="srow" class:sel={scene?.id === entry.id} data-scene={entry.id} onclick={() => selectScene(entry.id)}>
          <span class="sn">{entry.name}</span><span class="st">{TRIGGER_LABELS[entry.trigger.type]}</span>
        </button>
      {/each}
      {#if ownScenes.length}
        <div class="sub">Controls' own</div>
        {#each ownScenes as entry (entry.id)}
          <button type="button" class="srow own" class:sel={scene?.id === entry.id} data-scene={entry.id} onclick={() => selectScene(entry.id)}>
            <span class="sn">{entry.name}</span>
          </button>
        {/each}
      {/if}
      {#if scene && !scene.own}
        <div class="sedit">
          <input class="txt" type="text" value={scene.name} aria-label="Scene name"
                 onchange={(event) => changeScene({ ...scene, name: event.currentTarget.value }, 'scene:name')} />
          <select class="txt" value={scene.trigger.type} aria-label="Scene trigger"
                  onchange={(event) => changeScene({ ...scene, trigger: { ...scene.trigger, type: event.currentTarget.value, controlId: scene.trigger.controlId ?? pickedId } }, 'scene:trigger')}>
            {#each SCENE_TRIGGER_TYPES as type (type)}<option value={type}>{TRIGGER_LABELS[type]}</option>{/each}
          </select>
          {#if scene.trigger.type === 'state' || scene.trigger.type === 'event'}
            <select class="txt" value={scene.trigger.controlId ?? ''} aria-label="Trigger control"
                    onchange={(event) => changeScene({ ...scene, trigger: { ...scene.trigger, controlId: event.currentTarget.value } }, 'scene:trigger')}>
              {#each flat as control (control._children.Core.id)}<option value={control._children.Core.id}>{control._children.Core.name || control._children.Core.id}</option>{/each}
            </select>
          {/if}
          <span class="srowtools">
            <label class="chk"><input type="checkbox" checked={scene.loop} onchange={(event) => changeScene({ ...scene, loop: event.currentTarget.checked }, 'scene:loop')} /> Loop</label>
            <button type="button" class="tb" aria-label="Remove scene" onclick={removeScene}><Trash2 size={12} /></button>
          </span>
        </div>
      {/if}
    </nav>
    <SceneTimeline {scene} {tracks} {at} {snap} selectedClipId={clipId} readOnlyAdd={!!scene?.own}
                   onseek={(t) => { stop(); at = t; }}
                   onselect={(id) => { clipId = id; pickedId = scene?.clips.find((c) => c.id === id)?.controlId ?? pickedId; }}
                   {onmove} {onresize} {ondelete}
                   ondropeffect={({ effectId, controlId, target, start }) => placeEffect(effectId, controlId, start, target)} />
  </section>
</div>

<style>
  .ad {
    height: 100%; min-height: 0; display: grid; overflow: hidden;
    grid-template-columns: 236px minmax(0, 1fr) 380px;
    grid-template-rows: auto minmax(220px, 1fr) minmax(190px, 36%);
    background: #0F1215; color: #E8EEF3; font: 400 13px/1.35 'IBM Plex Sans', system-ui, sans-serif;
  }
  .head { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 8px 12px; border-bottom: 1px solid #2B323A; background: #151A1E; }
  .title { display: flex; flex-direction: column; min-width: 0; }
  .title b { font-size: 15px; font-weight: 600; }
  .title span { font-size: 12px; color: #8A96A3; }
  .transport { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .tbtn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border: 1px solid #2E7D6B; border-radius: 6px; background: #10362F; color: #BFF3E6; font: 500 13px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer; }
  .tbtn:disabled { opacity: 0.45; cursor: default; }
  .time { font: 500 13px/1 'IBM Plex Mono', ui-monospace, monospace; color: #E8EEF3; min-width: 104px; }
  .seg { display: inline-flex; border: 1px solid #3A434D; border-radius: 6px; overflow: hidden; }
  .seg button { height: 28px; padding: 0 9px; border: 0; background: #1E2328; color: #CCD3DA; font: inherit; font-size: 12px; cursor: pointer; }
  .seg button.on { background: #173A5A; color: #E8F4FF; }
  .snap { display: inline-flex; align-items: center; gap: 6px; color: #AEB9C4; font-size: 12px; }
  .snap select, .txt { height: 28px; box-sizing: border-box; padding: 0 6px; border: 1px solid #3A434D; border-radius: 5px; background: #12161A; color: #E8EEF3; font: inherit; font-size: 12px; min-width: 0; }
  .note { color: #F6D58A; font-size: 12px; max-width: 420px; }
  .ph { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 8px 10px; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #8A96A3; border-bottom: 1px solid #20262C; }
  .lib, .set { min-height: 0; display: flex; flex-direction: column; background: #151A1E; }
  .lib { border-right: 1px solid #2B323A; }
  .set { border-left: 1px solid #2B323A; }
  .set :global(.cs), .set :global(.none) { padding: 10px; overflow: auto; }
  .set { overflow: auto; }
  .cats { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 10px; }
  .cats button { height: 24px; padding: 0 8px; border: 1px solid #3A434D; border-radius: 12px; background: #1E2328; color: #CCD3DA; font: inherit; font-size: 12px; cursor: pointer; }
  .cats button.on { border-color: #5AA9E6; background: #173A5A; color: #E8F4FF; }
  .cards { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 4px; padding: 0 10px 8px; }
  .card { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 32px; padding: 0 9px; border: 1px solid #2B323A; border-radius: 6px; background: #1A1F24; color: #E8EEF3; font: inherit; text-align: left; cursor: grab; }
  .card:hover { border-color: #5B6670; }
  .cn { text-transform: capitalize; }
  .cc { font-size: 11px; color: #8A96A3; }
  .hint, .empty { margin: 0; padding: 8px 10px; font-size: 12px; color: #8A96A3; }
  .stage { min-height: 0; display: flex; flex-direction: column; background: #0B0E10; }
  .stagebar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid #20262C; color: #AEB9C4; font-size: 12px; }
  .safe { margin-left: auto; color: #8A96A3; }
  .stagebox { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .board { position: relative; flex: none; box-shadow: 0 0 0 1px #2B323A; }
  .pick { position: absolute; inset: 0; cursor: crosshair; outline: none; }
  .pick.drop { background: rgba(90, 169, 230, 0.08); }
  .picked { position: absolute; box-sizing: border-box; border: 2px solid #5AA9E6; border-radius: 3px; pointer-events: none; }
  .picked i { position: absolute; left: -2px; top: -20px; padding: 1px 6px; border-radius: 3px; background: #5AA9E6; color: #0B1620; font: 600 11px/1.4 'IBM Plex Sans', system-ui, sans-serif; font-style: normal; white-space: nowrap; }
  .bottom { grid-column: 1 / -1; min-height: 0; display: grid; grid-template-columns: 236px minmax(0, 1fr); border-top: 1px solid #2B323A; }
  .scenes { min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 2px; padding-bottom: 8px; border-right: 1px solid #2B323A; background: #151A1E; }
  .srow { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; margin: 0 6px; padding: 5px 8px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #E8EEF3; font: inherit; text-align: left; cursor: pointer; }
  .srow:hover { background: #1E2328; }
  .srow.sel { border-color: #5AA9E6; background: #173A5A; }
  .srow.own .sn { color: #CCD3DA; }
  .sn { font-weight: 600; font-size: 13px; }
  .st { font-size: 11px; color: #8A96A3; }
  .sub { margin: 6px 14px 2px; font-size: 11px; color: #8A96A3; }
  .sedit { display: flex; flex-direction: column; gap: 5px; margin: 8px 8px 0; padding-top: 8px; border-top: 1px solid #20262C; }
  .srowtools { display: flex; align-items: center; justify-content: space-between; }
  .chk { display: inline-flex; gap: 5px; align-items: center; color: #CCD3DA; font-size: 12px; }
  .tb { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; border: 1px solid #3A434D; border-radius: 5px; background: #1E2328; color: #E8EEF3; font: 400 12px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer; text-transform: none; letter-spacing: 0; }
  .tb:hover { border-color: #5B6670; }
  .tb.add { font-weight: 500; }
</style>
