<script>
  /**
   * The animation preset library (stores/animationPresetLibrary.js), and the form that saves one.
   *
   * Library: Mine (your library, on this machine) and This panel (what the panel carries, which is
   * what its linked animations follow), each preset with Apply, Export and Remove; Import a .ceanim;
   * and, when the panel carries presets you lack — a panel someone sent you — the offer to add them.
   * Then each component's built-in presets (stores/animationPresetLibrary.js COMPONENT_PRESETS), under
   * its name and by group: Knob › Numbers, Ticks, Touch… Each says what plays it and what it does,
   * and applies linked, as yours do. The older built-ins stay the buttons on the strip.
   *
   * Save: a name, a category and tags; this animation or all of the control's (a recipe); your
   * library or this panel only; its colours, or the control's. It says what the preset needs and
   * which kinds of control it goes on before it is saved.
   */
  import X from 'lucide-svelte/icons/x';
  import { activePanel } from '../../stores/panels.js';
  import {
    animationPresetLibrary, panelAnimationPresets, presetsToAdopt, adoptPanelPresets, applyAnimationPreset, COMPONENT_PRESETS,
    importPresetText, removeFromLibrary, removeFromPanel, saveAnimationPreset, updatePanelPreset,
  } from '../../stores/animationPresetLibrary.js';
  import { buildPreset, presetFileText, presetFitsTypes, presetLink, presetNeeds } from '../../utils/animationPresetModel.js';
  import { flatControls } from '../../utils/containment.js';
  import { COMPONENT_TYPES, createControl } from '../../models/componentTypes.js';
  import { openTypedDocument, saveTypedDocumentAs } from '../../stores/typedDocuments.js';
  import { effectFromPreset } from '../../utils/sceneModel.js';
  import EffectPreview from './EffectPreview.svelte';

  let {
    mode = 'library',
    control = null,
    selectedName = '',
    // The controls Apply puts a preset on: the selection, or the control the tab is on.
    targets = [],
    onclose = () => {},
    onreport = () => {},
  } = $props();

  let controlId = $derived(control?._children?.Core?.id ?? '');
  let followers = $derived.by(() => {
    const counts = new Map();
    for (const entry of flatControls($activePanel?.controls ?? [])) {
      for (const node of Object.values(entry?._children?.Animations?._children ?? {})) {
        const link = presetLink(node);
        if (link) counts.set(link.id, (counts.get(link.id) ?? 0) + 1);
      }
    }
    return counts;
  });
  let mineIds = $derived(new Set($animationPresetLibrary.map((preset) => preset.id)));
  // The row whose preview plays (EffectPreview.svelte): pointed at, or with focus inside it. A preset
  // of transitions has none: what it eases is a state change, which a stand-in does not have.
  let previewId = $state('');
  const previewOn = (id) => ({
    onpointerenter: () => { previewId = id; },
    onpointerleave: () => { if (previewId === id) previewId = ''; },
    onfocusin: () => { previewId = id; },
    onfocusout: () => { if (previewId === id) previewId = ''; },
  });
  let panelById = $derived(new Map($panelAnimationPresets.map((preset) => [preset.id, preset])));

  const sizeWord = (preset) => (preset.size === 'recipe' ? `recipe of ${Object.keys(preset.animations).length}` : 'effect');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function apply(preset) {
    const { applied, refused } = applyAnimationPreset(targets, preset.id);
    const parts = [];
    if (applied.length) parts.push(`${preset.name} on ${plural(applied.length, 'control')}, linked`);
    if (refused.length) parts.push(`not on ${refused.length}: ${refused[0].reason}`);
    onreport(parts.join('; ') || 'Nothing to put it on.');
  }

  async function exportPreset(preset) {
    const result = await saveTypedDocumentAs('animationPreset', preset.name, presetFileText(preset));
    if (result.ok) onreport(`${preset.name} saved as ${result.name || 'a .ceanim file'}.`);
    else if (!result.cancelled) onreport(`${preset.name} could not be saved.`);
  }

  async function importPreset() {
    const result = await openTypedDocument('animationPreset');
    if (!result.ok) { if (!result.cancelled) onreport('That file could not be read.'); return; }
    const imported = importPresetText(result.data);
    onreport(imported.error ?? `${imported.preset.name} ${imported.replaced ? 'updated' : 'added'} in your library.`);
  }

  function adopt() {
    const added = adoptPanelPresets();
    onreport(`${plural(added.length, 'preset')} added to your library.`);
  }

  function removeHere(preset) {
    const result = removeFromPanel(preset.id);
    onreport(result.reason ?? `${preset.name} is no longer carried by this panel.`);
  }

  // --- Save ----------------------------------------------------------------------------------------
  let animationNames = $derived(Object.keys(control?._children?.Animations?._children ?? {}));
  let saveName = $state('');
  let category = $state('');
  let tagText = $state('');
  let what = $state('one');
  let where = $state('mine');
  let colours = $state('keep');
  $effect(() => { if (mode === 'save' && !saveName) saveName = selectedName ? selectedName.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()) : ''; });

  let names = $derived(what === 'all' ? animationNames : (selectedName ? [selectedName] : []));
  let draft = $derived(mode === 'save' && control ? buildPreset(control, names, { colours }).preset : null);
  let needs = $derived(draft ? presetNeeds(draft) : null);
  let fits = $derived.by(() => {
    if (!draft) return [];
    return presetFitsTypes(draft, Object.keys(COMPONENT_TYPES), createControl).map((type) => COMPONENT_TYPES[type]?.label ?? type);
  });

  function save() {
    const tags = tagText.split(',').map((tag) => tag.trim()).filter(Boolean);
    const { preset, reason } = saveAnimationPreset(controlId, names, { name: saveName.trim(), category: category.trim(), tags, colours, where });
    if (!preset) { onreport(reason); return; }
    onreport(`${preset.name} saved${where === 'mine' ? ' to your library' : ' in this panel'}; ${plural(Object.keys(preset.animations).length, 'animation')} follow${Object.keys(preset.animations).length === 1 ? 's' : ''} it.`);
    onclose();
  }
</script>

<div class="lib" role="dialog" aria-label={mode === 'save' ? 'Save as animation preset' : 'Animation preset library'} data-preset-library={mode}>
  <div class="top">
    <b>{mode === 'save' ? 'Save as animation preset' : 'Animation presets'}</b>
    <button type="button" class="x" aria-label="Close" onclick={onclose}><X size={14} /></button>
  </div>

  {#if mode === 'save'}
    <div class="form">
      <label class="f"><span>Name</span><input class="txt" type="text" bind:value={saveName} aria-label="Preset name" /></label>
      <label class="f"><span>Category</span><input class="txt" type="text" bind:value={category} placeholder="Hover, Text, Paint…" aria-label="Preset category" /></label>
      <label class="f"><span>Tags</span><input class="txt" type="text" bind:value={tagText} placeholder="comma, separated" aria-label="Preset tags" /></label>
      <div class="f"><span>Saves</span>
        <div class="seg">
          <button type="button" class:on={what === 'one'} aria-pressed={what === 'one'} disabled={!selectedName} onclick={() => { what = 'one'; }}>This animation</button>
          <button type="button" class:on={what === 'all'} aria-pressed={what === 'all'} disabled={animationNames.length < 2} onclick={() => { what = 'all'; }}>All {animationNames.length} (a recipe)</button>
        </div>
      </div>
      <div class="f"><span>Keep it in</span>
        <div class="seg">
          <button type="button" class:on={where === 'mine'} aria-pressed={where === 'mine'} onclick={() => { where = 'mine'; }}>My library</button>
          <button type="button" class:on={where === 'panel'} aria-pressed={where === 'panel'} onclick={() => { where = 'panel'; }}>This panel only</button>
        </div>
      </div>
      <div class="f"><span>Colours</span>
        <div class="seg">
          <button type="button" class:on={colours === 'keep'} aria-pressed={colours === 'keep'} onclick={() => { colours = 'keep'; }}>Keep its colours</button>
          <button type="button" class:on={colours === 'control'} aria-pressed={colours === 'control'} onclick={() => { colours = 'control'; }}>Leave colour to the control</button>
        </div>
      </div>
      {#if needs}
        <p class="needs" data-needs>
          {#if needs.parts.length || needs.states.length || needs.sections.length > 1}
            Needs {[
              ...(needs.states.length ? [`the state${needs.states.length > 1 ? 's' : ''} ${needs.states.join(', ')}`] : []),
              ...(needs.parts.length ? [`the part${needs.parts.length > 1 ? 's' : ''} ${needs.parts.join(', ')}`] : []),
              ...needs.sections.filter((section) => section !== 'Animations').map((section) => `a ${section}`),
            ].join(' and ')}.
          {:else}
            Needs nothing but the control.
          {/if}
          Goes on {fits.length ? `${fits.length} kind${fits.length === 1 ? '' : 's'} of control: ${fits.slice(0, 8).join(', ')}${fits.length > 8 ? '…' : ''}` : 'no built-in kind of control: a custom component with the same parts'}.
          The animation{names.length > 1 ? 's' : ''} you save will follow it.
        </p>
      {/if}
      <div class="acts">
        <button type="button" class="go" disabled={!names.length || !saveName.trim()} onclick={save}>Save</button>
        <button type="button" class="tb" onclick={onclose}>Cancel</button>
      </div>
    </div>
  {:else}
    {#if $presetsToAdopt.length}
      <div class="adopt" data-adopt>
        This panel carries {plural($presetsToAdopt.length, 'preset')} you do not have.
        <button type="button" class="tb" onclick={adopt}>Add to my library</button>
      </div>
    {/if}
    <div class="sect">
      <div class="sh"><b>Mine</b> <span>{$animationPresetLibrary.length}</span>
        <button type="button" class="tb imp" onclick={importPreset}>Import…</button>
      </div>
      {#each $animationPresetLibrary as preset (preset.id)}
        {@const carried = panelById.get(preset.id)}
        {@const shown = effectFromPreset(preset)}
        <div class="row" data-preset={preset.id} {...previewOn(`mine:${preset.id}`)}>
          {#if shown}<EffectPreview entry={shown} active={previewId === `mine:${preset.id}`} />{:else}<span class="nopv" aria-hidden="true"></span>{/if}
          <span class="nm" title={[preset.category, ...preset.tags].filter(Boolean).join(' · ')}>{preset.name}</span>
          <span class="meta">{preset.category ? `${preset.category} · ` : ''}{sizeWord(preset)} · v{preset.revision}</span>
          <span class="btns">
            {#if carried && carried.revision < preset.revision}
              <button type="button" class="tb" title="Bring this panel's copy and what follows it up to this version" onclick={() => onreport(updatePanelPreset(preset.id).reason ?? `${preset.name} brought up to date here.`)}>Update panel</button>
            {/if}
            <button type="button" class="tb" disabled={!targets.length} onclick={() => apply(preset)}>Apply</button>
            <button type="button" class="tb" onclick={() => exportPreset(preset)}>Export…</button>
            <button type="button" class="tb" title="Take it out of your library; panels that use it keep their copy" onclick={() => { removeFromLibrary(preset.id); onreport(`${preset.name} taken out of your library.`); }}>Remove</button>
          </span>
        </div>
      {:else}
        <p class="none">None yet. Save one from an animation, or import a .ceanim file.</p>
      {/each}
    </div>
    <div class="sect">
      <div class="sh"><b>This panel</b> <span>{$panelAnimationPresets.length}</span></div>
      {#each $panelAnimationPresets as preset (preset.id)}
        {@const shown = effectFromPreset(preset)}
        <div class="row" data-panel-preset={preset.id} {...previewOn(`panel:${preset.id}`)}>
          {#if shown}<EffectPreview entry={shown} active={previewId === `panel:${preset.id}`} />{:else}<span class="nopv" aria-hidden="true"></span>{/if}
          <span class="nm">{preset.name}</span>
          <span class="meta">{plural(followers.get(preset.id) ?? 0, 'follower')} · {mineIds.has(preset.id) ? 'in your library' : 'only here'}</span>
          <span class="btns">
            <button type="button" class="tb" disabled={!targets.length} onclick={() => apply(preset)}>Apply</button>
            <button type="button" class="tb" onclick={() => exportPreset(preset)}>Export…</button>
            <button type="button" class="tb" disabled={(followers.get(preset.id) ?? 0) > 0} title={(followers.get(preset.id) ?? 0) > 0 ? 'Animations follow it here: detach them first' : 'Stop carrying it in this panel'} onclick={() => removeHere(preset)}>Remove</button>
          </span>
        </div>
      {:else}
        <p class="none">This panel uses none.</p>
      {/each}
    </div>
    {#each COMPONENT_PRESETS as component (component.component)}
      <details class="sect builtin" open data-builtin-component={component.component}>
        <summary class="sh"><b>{component.component}</b> <span>{plural(component.groups.reduce((n, group) => n + group.entries.length, 0), 'built-in preset')}</span></summary>
        {#each component.groups as group (group.id)}
          <div class="gh" data-builtin-group={group.id}><b>{group.label}</b> <span>{group.note}</span></div>
          {#each group.entries as entry (entry.id)}
            {@const carried = panelById.get(entry.id)}
            {@const shown = effectFromPreset(entry.preset)}
            <div class="row" data-builtin-preset={entry.id} {...previewOn(`builtin:${entry.id}`)}>
              {#if shown}<EffectPreview entry={shown} active={previewId === `builtin:${entry.id}`} />{:else}<span class="nopv" aria-hidden="true"></span>{/if}
              <span class="nm">{entry.name} <i>{entry.how}</i></span>
              <span class="meta" title={entry.what}>{entry.on === 'label' ? `on its name Label: ${entry.what}` : entry.what}</span>
              <span class="btns">
                {#if carried && carried.revision < entry.preset.revision}
                  <button type="button" class="tb" title="Bring this panel's copy and what follows it up to this version" onclick={() => onreport(updatePanelPreset(entry.id).reason ?? `${entry.name} brought up to date here.`)}>Update panel</button>
                {/if}
                <button type="button" class="tb" disabled={!targets.length} onclick={() => apply(entry.preset)}>Apply</button>
              </span>
            </div>
          {/each}
        {/each}
      </details>
    {/each}
  {/if}
</div>

<style>
  .lib {
    position: absolute; right: 12px; bottom: 84px; z-index: 30; width: min(520px, calc(100% - 24px)); max-height: calc(100% - 100px);
    box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; overflow: auto;
    border: 1px solid #3A434D; border-radius: 8px; background: #181D22; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
    font: 400 13px/1.35 'IBM Plex Sans', system-ui, sans-serif; color: #E8EEF3;
  }
  .top { display: flex; align-items: center; justify-content: space-between; }
  .top b { font-size: 14px; font-weight: 600; }
  .x { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 1px solid transparent; border-radius: 5px; background: transparent; color: #AEB9C4; cursor: pointer; }
  .x:hover { border-color: #3A434D; color: #E8EEF3; }
  .form { display: flex; flex-direction: column; gap: 7px; }
  .f { display: grid; grid-template-columns: 82px minmax(0, 1fr); align-items: center; gap: 8px; }
  .f > span { color: #AEB9C4; }
  .txt { height: 28px; box-sizing: border-box; padding: 0 8px; border: 1px solid #3A434D; border-radius: 5px; background: #12161A; color: #E8EEF3; font: inherit; min-width: 0; }
  .txt:focus { outline: none; border-color: #14B8A6; }
  .seg { display: flex; flex-wrap: wrap; gap: 4px; }
  .seg button { height: 26px; padding: 0 9px; border: 1px solid #3A434D; border-radius: 5px; background: #1E2328; color: #CCD3DA; font: inherit; font-size: 12px; cursor: pointer; }
  .seg button.on { border-color: #5AA9E6; background: #173A5A; color: #E8F4FF; }
  .seg button:disabled { opacity: 0.4; cursor: default; }
  .needs { margin: 0; padding: 6px 8px; border-radius: 5px; background: #12161A; color: #AEB9C4; font-size: 12px; }
  .acts { display: flex; gap: 6px; justify-content: flex-end; }
  .go { height: 28px; padding: 0 14px; border: 1px solid #2E7D6B; border-radius: 6px; background: #10362F; color: #BFF3E6; font: 500 13px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer; }
  .go:disabled { opacity: 0.45; cursor: default; }
  .tb { height: 24px; padding: 0 8px; border: 1px solid #3A434D; border-radius: 5px; background: #1E2328; color: #E8EEF3; font: 400 12px/1 'IBM Plex Sans', system-ui, sans-serif; cursor: pointer; white-space: nowrap; }
  .tb:hover:not(:disabled) { border-color: #5B6670; }
  .tb:disabled { opacity: 0.4; cursor: default; }
  .adopt { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; border: 1px solid #7A5C16; border-radius: 5px; background: #2A2312; color: #F6D58A; font-size: 12px; }
  .sect { display: flex; flex-direction: column; gap: 4px; }
  .sh { display: flex; align-items: center; gap: 6px; }
  .sh span { color: #8A96A3; font-size: 12px; }
  .sh .imp { margin-left: auto; }
  .row { display: grid; grid-template-columns: 46px minmax(0, 1fr) auto; grid-template-rows: auto auto; column-gap: 8px; padding: 5px 6px; border-radius: 5px; background: #1E2328; }
  .row > :global(.pv), .nopv { grid-column: 1; grid-row: 1 / span 2; align-self: center; }
  .nm { grid-column: 2; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { grid-column: 2; grid-row: 2; font-size: 12px; color: #8A96A3; }
  .btns { grid-column: 3; grid-row: 1 / span 2; display: flex; align-items: center; gap: 4px; }
  .none { margin: 0; font-size: 12px; color: #8A96A3; }
  .builtin > summary { cursor: pointer; list-style: revert; }
  .gh { display: flex; align-items: baseline; gap: 6px; margin-top: 6px; padding: 0 2px; }
  .gh b { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #CCD3DA; }
  .gh span { font-size: 12px; color: #8A96A3; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm i { font-style: normal; font-weight: 400; font-size: 12px; color: #7FC4B8; margin-left: 4px; }
  .meta { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
