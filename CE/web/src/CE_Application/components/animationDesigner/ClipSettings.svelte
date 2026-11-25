<script>
  /**
   * One clip's settings in the Animation Designer: where on its control it plays, when and for how
   * long, its easing, and the effect itself — the text effect editor for words, the frames editor for
   * moves and paint, the same two the dock's Animation tab uses. A clip of a control's own animation
   * writes that animation; a scene clip writes the scene.
   */
  import NumberCell from '../../properties/NumberCell.svelte';
  import PropertySelect from '../../properties/PropertySelect.svelte';
  import TextEffectEditor from '../animation/TextEffectEditor.svelte';
  import FramesEditor from '../animation/FramesEditor.svelte';
  import ValueFramesEditor from './ValueFramesEditor.svelte';
  import { EASING_NAMES } from '../../utils/easing.js';
  import { resolvedPartsOf } from '../../utils/animationModel.js';
  import { targetLabel } from '../../utils/sceneModel.js';

  let {
    clip = null,
    control = null,
    own = false,
    sceneName = '',
    onpatch = () => {},
    ontarget = () => {},
    onstart = () => {},
    onlength = () => {},
    ondelete = () => {},
    onsavepreset = () => {},
  } = $props();

  let isValue = $derived(clip?.effect?.kind === 'value');
  let places = $derived.by(() => {
    if (!control) return [];
    // A value effect plays on what the value draws, and only there.
    if (isValue) return [{ value: 'Value', label: targetLabel('Value') }];
    const out = [{ value: 'Transform', label: 'Whole control' }];
    if (control._children?.Text) out.push({ value: 'Text', label: 'Text' });
    for (const name of Object.keys(resolvedPartsOf(control) ?? {})) out.push({ value: `Parts.${name}`, label: targetLabel(`Parts.${name}`) });
    return out;
  });
  let isText = $derived(clip?.effect?.kind === 'text');
  let gradient = $derived(!!(control?._children?.Background?._children?.Fill?.gradientEnabled));
  let controlName = $derived(String(control?._children?.Core?.name || clip?.controlId || ''));
  let presetName = $state('');
  $effect(() => { presetName = clip ? `${controlName} ${isText ? (clip.effect.effect ?? 'text') : isValue ? (clip.label || 'value') : 'effect'}` : ''; });

  /** The text effect editor writes animation fields; `targets` is this clip's place. */
  function textPatch(patch) {
    const { targets, ...rest } = patch;
    if (targets) {
      const path = String(targets[0]?.path ?? 'Text');
      ontarget(path.startsWith('Parts.') ? `Parts.${path.split('.')[1]}` : (path === 'Transform' ? 'Transform' : 'Text'));
    }
    if (Object.keys(rest).length) onpatch(rest);
  }
</script>

{#if clip}
  <div class="cs" data-clip-settings={clip.id}>
    <div class="top">
      <b>{clip.label || (isText ? `${clip.effect.effect ?? 'Text'} ${clip.effect.way ?? 'in'}` : isValue ? 'Value' : 'Keyframes')}</b>
      <span class="who">{controlName}</span>
    </div>
    <div class="r">
      <span class="lab">Plays on</span>
      <PropertySelect ariaLabel="Plays on" value={clip.target} options={places} onchange={(value) => ontarget(value)} />
    </div>
    <div class="grp">Timing</div>
    <div class="r two">
      <span class="lab">Start</span>
      <div class="cell"><NumberCell label="ms" value={clip.start} min={0} step={10} onchange={(value) => onstart(Math.max(0, Math.round(value)))} /></div>
    </div>
    <div class="r two">
      <span class="lab" title={isText ? 'How much of the timeline it takes; each piece has its own length below' : 'How long it lasts'}>Length</span>
      <div class="cell"><NumberCell label="ms" value={clip.length} min={10} step={10} onchange={(value) => onlength(Math.max(10, Math.round(value)))} /></div>
    </div>
    {#if isText}
      <div class="r two">
        <span class="lab">Each piece</span>
        <div class="cell"><NumberCell label="ms" value={clip.effect.duration ?? 400} min={10} step={10} onchange={(value) => onpatch({ duration: Math.max(10, Math.round(value)) })} /></div>
      </div>
    {/if}
    <div class="r">
      <span class="lab">Easing</span>
      <PropertySelect ariaLabel="Easing" value={EASING_NAMES.includes(clip.effect.easing) ? clip.effect.easing : 'outCubic'}
                      options={EASING_NAMES.map((name) => ({ value: name, label: name }))} onchange={(value) => onpatch({ easing: value })} />
    </div>
    <div class="grp">{isText ? 'The words' : isValue ? 'Where the value is drawn' : 'Frames'}</div>
    {#if isText}
      <TextEffectEditor row={{ animation: { ...clip.effect, kind: 'text', targets: [{ path: clip.target }] } }} {control} onpatch={textPatch} />
    {:else if isValue}
      <ValueFramesEditor frames={clip.effect.frames ?? []} onchange={(frames) => onpatch({ frames })} />
    {:else}
      <FramesEditor frames={clip.effect.frames ?? []} {gradient} onchange={(frames) => onpatch({ frames })} />
    {/if}
    <div class="grp">Script</div>
    <p class="mono" title="What a script names this place by">{controlName}{clip.target === 'Transform' || clip.target === 'Value' ? '' : `.${clip.target}`}</p>
    {#if !own && sceneName}<p class="mono dim" title="What a script plays this scene with">ce.anim.play("{sceneName}")</p>{/if}
    <div class="acts">
      <input class="txt" type="text" bind:value={presetName} aria-label="Preset name" />
      <button type="button" class="tb" data-save-clip-preset disabled={!presetName.trim()} onclick={() => onsavepreset(presetName.trim())}
              title={isValue ? 'Keep this effect in your library, to drop on any knob or slider' : 'Keep this effect in your library, to drop on any control'}>Save as preset</button>
      {#if !own}<button type="button" class="tb danger" onclick={ondelete}>Remove clip</button>{/if}
    </div>
  </div>
{:else}
  <p class="none">Select a clip on the timeline to see its settings.</p>
{/if}

<style>
  .cs { display: flex; flex-direction: column; gap: 6px; font: 400 13px/1.35 'IBM Plex Sans', system-ui, sans-serif; color: #E8EEF3; }
  .top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .top b { font-size: 15px; font-weight: 600; text-transform: capitalize; }
  .who { color: #8A96A3; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .grp { margin-top: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #8A96A3; }
  .r { display: grid; grid-template-columns: 82px minmax(0, 1fr); align-items: center; gap: 8px; min-height: 30px; }
  .lab { color: #AEB9C4; }
  .cell { min-width: 0; }
  .mono { margin: 0; font: 400 12px/1.4 'IBM Plex Mono', ui-monospace, monospace; color: #CFE3F2; word-break: break-all; }
  .dim { color: #8A96A3; }
  .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .txt { flex: 1; min-width: 120px; height: 28px; box-sizing: border-box; padding: 0 8px; border: 1px solid #3A434D; border-radius: 5px; background: #12161A; color: #E8EEF3; font: inherit; }
  .tb { height: 28px; padding: 0 10px; border: 1px solid #3A434D; border-radius: 5px; background: #1E2328; color: #E8EEF3; font: 400 12px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer; }
  .tb:hover:not(:disabled) { border-color: #5B6670; }
  .tb:disabled { opacity: 0.45; cursor: default; }
  .tb.danger:hover { border-color: #8A4A4A; color: #F2B8B8; }
  .none { margin: 0; color: #8A96A3; font-size: 13px; }
</style>
