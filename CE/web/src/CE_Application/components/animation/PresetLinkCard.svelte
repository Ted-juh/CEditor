<script>
  /**
   * An animation that follows an animation preset (utils/animationPresetModel.js): what it follows,
   * what it has changed itself — each with Revert, marked as the properties panel marks a control
   * set's overrides — and Apply to preset, Clear overrides and Detach, as a control set has them.
   * Where your library has a newer version than the panel carries, it offers to bring it in.
   */
  import {
    animationPresetLibrary, panelAnimationPresets, applyToPreset, clearAnimationOverrides, detachAnimation,
    revertAnimationOverride, updatePanelPreset,
  } from '../../stores/animationPresetLibrary.js';
  import { followedAnimation, presetLink, presetOverrides } from '../../utils/animationPresetModel.js';

  let { controlId = '', name = '', node = null, onreport = () => {} } = $props();

  let link = $derived(presetLink(node));
  let carried = $derived(link ? $panelAnimationPresets.find((preset) => preset.id === link.id) ?? null : null);
  let mine = $derived(link ? $animationPresetLibrary.find((preset) => preset.id === link.id) ?? null : null);
  let preset = $derived(carried ?? mine);
  let followed = $derived(followedAnimation(node, preset));
  let overrides = $derived(presetOverrides(node, followed));
  let newer = $derived(!!(carried && mine && mine.revision > carried.revision));

  const LABELS = { duration: 'Duration', delay: 'Delay', easing: 'Easing', trigger: 'Runs when', targets: 'What it changes', frames: 'Frames', iterations: 'Repeat', direction: 'Direction', enabled: 'On', kind: 'Kind' };
  const label = (key) => LABELS[key] ?? key;
  function shown(value) {
    if (value === undefined) return '—';
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > 28 ? `${text.slice(0, 27)}…` : text;
  }

  function pushToPreset() {
    const result = applyToPreset(controlId, name);
    onreport(result.reason ?? `${result.preset.name} is version ${result.preset.revision}: ${result.followers} animation${result.followers === 1 ? '' : 's'} follow it.`);
  }

  function bringUpToDate() {
    const result = updatePanelPreset(link.id);
    onreport(result.reason ?? `${preset?.name ?? 'The preset'} brought up to date here: ${result.followers} animation${result.followers === 1 ? '' : 's'} follow it.`);
  }
</script>

{#if link}
  <div class="link" data-preset-link={link.id}>
    {#if preset && followed}
      <div class="head">
        <span class="what" title={`Animation preset ${preset.name}, version ${link.revision}${mine ? ', in your library' : ', carried by this panel'}`}>
          Follows <b>{preset.name}</b> <span class="ver">v{link.revision}</span>
        </span>
        <span class="tools">
          <button type="button" class="tb" disabled={!overrides.length} title="Make this animation's settings the preset's, for every animation that follows it" onclick={pushToPreset}>Apply to preset</button>
          <button type="button" class="tb" disabled={!overrides.length} title="Put every setting back to the preset's" onclick={() => clearAnimationOverrides(controlId, name)}>Clear overrides</button>
          <button type="button" class="tb" title="Keep these settings and stop following the preset" onclick={() => detachAnimation(controlId, name)}>Detach</button>
        </span>
      </div>
      {#if newer}
        <div class="newer">
          Your library has version {mine.revision}.
          <button type="button" class="tb" onclick={bringUpToDate}>Bring it in</button>
        </div>
      {/if}
      {#if overrides.length}
        <ul class="overrides" aria-label="Changed here">
          {#each overrides as key (key)}
            <li class="override" data-override={key}>
              <span class="key">{label(key)}</span>
              <span class="val" title={`Here: ${JSON.stringify(node?.[key])}\nPreset: ${JSON.stringify(followed?.[key])}`}>{shown(node?.[key])} <i>· preset {shown(followed?.[key])}</i></span>
              <button type="button" class="tb rv" onclick={() => revertAnimationOverride(controlId, name, key)}>Revert</button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="same">As the preset has it.</p>
      {/if}
    {:else}
      <div class="head">
        <span class="what">Follows a preset this panel no longer carries.</span>
        <span class="tools"><button type="button" class="tb" onclick={() => detachAnimation(controlId, name)}>Detach</button></span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .link { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 5px; padding: 7px 9px; border: 1px solid #23415A; border-radius: 6px; background: #13212D; font-size: 13px; color: #CFE3F2; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .what b { font-weight: 600; color: #E8F4FF; }
  .ver { font-size: 11px; color: #8FB4D3; }
  .tools { display: flex; gap: 5px; flex-wrap: wrap; }
  .tb { height: 24px; padding: 0 8px; border: 1px solid #2E5677; border-radius: 5px; background: #16314A; color: #D6ECFF; font: 400 12px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer; white-space: nowrap; }
  .tb:hover:not(:disabled) { border-color: #5AA9E6; }
  .tb:disabled { opacity: 0.45; cursor: default; }
  .newer { display: flex; align-items: center; gap: 8px; color: #F6D58A; font-size: 12px; }
  .overrides { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
  /* Marked as the properties panel marks an override of a control set: a bar, and the name in bold. */
  .override { position: relative; display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding-left: 7px; }
  .override::before { content: ''; position: absolute; left: 0; top: 2px; bottom: 2px; width: 2px; border-radius: 1px; background: #2A8FD6; }
  .key { font-weight: 600; color: #E8F4FF; }
  .val { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 400 12px/1.3 'IBM Plex Mono', ui-monospace, monospace; color: #CFE3F2; }
  .val i { font-style: normal; color: #8FB4D3; }
  .rv { height: 22px; }
  .same { margin: 0; font-size: 12px; color: #8FB4D3; }
</style>
