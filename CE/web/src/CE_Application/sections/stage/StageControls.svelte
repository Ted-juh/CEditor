<script>
  /**
   * The controller page on stage: its eight controls as knobs you can also turn here, lit while
   * the hardware moves them, and the scenes as big buttons, with a morph filling underneath the
   * one it is moving towards.
   */
  import Knob from '../../components/controls/Knob.svelte';
  import HostPickupIndicator from '../HostPickupIndicator.svelte';
  import { setControlSlotValue, launchScene } from '../../stores/instrumentHost.js';

  let { surface, controller, movingSlot = -1, pageId = '', performance } = $props();

  const percent = (value) => `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
  const scenes = $derived((performance?.scenes ?? []).slice(0, 8));
  const morph = $derived(performance?.snapshotMorph ?? {});
</script>

<section class="stage-panel controls-panel" aria-label="Controls" data-testid="stage-controls">
  <div class="panel-head">
    <div class="titles"><span class="eyebrow" data-testid="stage-controller-name"
      title={controller.profileName ? `Selected controller profile: ${controller.profileName}` : 'Controls'}>
      Controls{controller.profileName ? ` · ${controller.profileName}` : ''}</span><strong>{surface.name}</strong></div>
    <span class="page-count">PAGE {surface.pageIndex + 1} / {surface.pageCount}</span>
  </div>
  <div class="knobs">
    {#each surface.entries as entry, index (entry.slotId || `empty-${index}`)}
      <div class="stage-control" class:empty={!entry.assigned} class:unresolved={entry.assigned && !entry.resolved}
           class:active={entry.active || (surface.type === 'controls' && surface.activeSlot === index)}
           class:moving={surface.type === 'controls' && movingSlot === index} class:pending={entry.pending}
           data-testid="stage-control">
        {#if surface.type === 'controls' && entry.assigned}
          <Knob value={Math.max(0, Math.min(1, Number(entry.value) || 0))} min={0} max={1} size={64} step={0.005}
                label={entry.displayName} testid="stage-knob" format={() => entry.valueText || percent(entry.value)}
                onchange={(v) => pageId && setControlSlotValue(pageId, entry.slotId, v)} />
        {:else}
          <span class="tile" class:on={entry.active} class:waiting={entry.pending}>{entry.assigned ? index + 1 : '—'}</span>
        {/if}
        <span class="name">{entry.assigned ? entry.displayName : 'unassigned'}</span>
        <span class="value">
          {surface.type === 'controls' && movingSlot === index ? 'MOVING'
            : entry.assigned ? (entry.valueText || (surface.type === 'controls' ? percent(entry.value) : entry.pending ? 'waiting' : entry.active ? 'playing' : '')) : ''}
          <HostPickupIndicator direction={entry.pickupDirection} />
        </span>
      </div>
    {/each}
  </div>
  {#if scenes.length > 0}
    <div class="scenes" role="group" aria-label="Scenes">
      {#each scenes as scene, index (scene.sceneId)}
        <button type="button" class="ctl scene" class:now={performance.currentSceneId === scene.sceneId}
                class:queued={performance.queuedSceneId === scene.sceneId} data-testid="stage-scene"
                title={`Scene ${index + 1}: press ${index + 1} on the keyboard`}
                onclick={() => launchScene(scene.sceneId)}>
          <span>{index + 1} · {scene.name}</span>
          {#if morph.active && morph.sceneId === scene.sceneId}<i style={`width:${Math.round(morph.progress * 100)}%`}></i>{/if}
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .controls-panel { display: flex; flex-direction: column; min-height: 0; }
  .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
  .titles { display: flex; flex-direction: column; min-width: 0; }
  .titles strong { font-size: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .eyebrow { font: 700 11px var(--stage-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--stage-dim);
             overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .page-count { font: 600 12px var(--stage-mono); color: var(--stage-dim); white-space: nowrap; }
  /* One row of eight on any stage-sized window; wraps to fours only when it has to. */
  .knobs { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; margin-top: 8px; }
  .stage-control { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 2px; border-radius: 8px;
                   border: 1px solid transparent; min-width: 0; }
  .stage-control.moving { border-color: var(--stage-hw); background: var(--stage-hw-surface); }
  .stage-control.active { border-color: var(--stage-line-strong); }
  .stage-control.empty { opacity: .45; }
  .stage-control.unresolved .name { color: var(--stage-warn); }
  .tile { width: 58px; height: 58px; border-radius: 10px; display: grid; place-items: center; font: 700 18px var(--stage-mono);
          background: var(--stage-raised); color: var(--stage-soft); border: 1px solid var(--stage-line); }
  .tile.on { background: var(--stage-live); color: #04140a; border-color: var(--stage-live); }
  .tile.waiting { border-color: var(--stage-now); color: var(--stage-now); }
  .name { font-size: 13px; font-weight: 600; color: var(--stage-soft); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .value { font: 700 14px var(--stage-mono); color: var(--stage-text); display: inline-flex; gap: 4px; align-items: center; white-space: nowrap; }
  .scenes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 10px; }
  button.scene { position: relative; overflow: hidden; font: 700 15px var(--stage-font); padding: 13px 6px; border-radius: 8px; cursor: pointer;
                 background: var(--stage-raised); color: var(--stage-soft); border: 1px solid var(--stage-line); white-space: nowrap; text-overflow: ellipsis; }
  button.scene span { position: relative; }
  button.scene.now { color: var(--stage-text); border-color: var(--stage-now); box-shadow: inset 0 0 0 1px var(--stage-now); }
  button.scene.queued { border-color: var(--stage-next); color: var(--stage-next); }
  button.scene i { position: absolute; left: 0; bottom: 0; height: 4px; background: var(--stage-now); }
  button.scene:focus-visible { outline: 2px solid var(--stage-next); outline-offset: 2px; }
</style>
