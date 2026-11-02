<script>
  import { onDestroy, untrack } from 'svelte';
  import Copy from 'lucide-svelte/icons/copy';
  import Download from 'lucide-svelte/icons/download';
  import Plus from 'lucide-svelte/icons/plus';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Upload from 'lucide-svelte/icons/upload';
  import Images from 'lucide-svelte/icons/images';
  import PanelPreviewSurface from '../editor/PanelPreviewSurface.svelte';
  import ControlSetGallery from '../panels/ControlSetGallery.svelte';
  import { buildSolidStyle } from '../utils/backgroundCSS.js';
  import { createControlSetStarter } from '../models/controlSetStarter.js';
  import { BASE_CONTROL_SET, BUILT_IN_CONTROL_SETS, NEW_PANEL_CONTROL_SET_ID, getControlSet, normalizeControlSetDefinition, resolveToken } from '../models/controlSets.js';
  import { PHYSICAL_DIRECTIONS } from '../models/physicalControlSets.js';
  import { MATERIAL_KINDS } from '../utils/materialFilter.js';
  import { controlSetFileName } from '../models/controlSetPackage.js';
  import {
    controlSetLibrary, duplicateControlSet, exportControlSetEnvelope, importControlSetText,
    removeControlSetFromLibrary, updateControlSetInLibrary,
  } from '../stores/controlSetLibrary.js';
  import { generalSettings, updateGeneralSettings } from '../stores/appSettings.js';
  import { activePanel, activePanelId } from '../stores/panels.js';
  import { setPanelControlSet } from '../stores/controlSets.js';
  import { deepClone } from '../utils/deepClone.js';

  const COLOUR_ROLES = [
    ['panel.surface', 'Panel surface'], ['surface', 'Button surface'], ['control.body', 'Control body'], ['control.cap', 'Knob / fader cap'],
    ['control.fill', 'Value fill'], ['accent', 'Accent'], ['text.primary', 'Primary text'],
    ['display.screen', 'Display glass'], ['display.lit', 'Display light'],
  ];
  const FAMILY_ROLES = [
    ['Knob', 'Knobs'], ['Slider', 'Sliders'], ['Button', 'Buttons'],
    ['ToggleButton', 'Switches'], ['DrumPads', 'Drum pads'], ['StepSequencer', 'Steppers'], ['Label', 'Labels'],
  ];
  const DESIGN_SOURCES = PHYSICAL_DIRECTIONS.map((entry) => getControlSet(entry.id)).filter(Boolean);

  // Opens on the set the panel in front uses: it opened on the default for new panels, so the
  // Library always showed Graphite whatever the panel was drawn with.
  let panelSetId = $derived(String($activePanel?.controlSet?.id ?? ''));
  let selectedId = $state(untrack(() => String($activePanel?.controlSet?.id ?? '') || $generalSettings.defaultControlSetId || NEW_PANEL_CONTROL_SET_ID));
  let draft = $state(null);
  let loadedId = $state('');
  let fileInput = $state(null);
  let status = $state('');
  let galleryOpen = $state(false);
  let familySources = $state({});
  let importGeneration = 0;

  onDestroy(() => { importGeneration += 1; });
  let allSets = $derived([
    ...$controlSetLibrary.map((set) => ({ ...set, origin: 'library' })),
    ...BUILT_IN_CONTROL_SETS.filter((set) => !$controlSetLibrary.some((custom) => custom.id === set.id))
      .map((set) => ({ ...set, origin: 'built-in' })),
  ]);
  // The default for new panels can be one of your own sets: createPanel carries it into the new
  // document (models/controlSets.js newPanelControlSet), so the panel keeps it wherever it opens.
  let defaultSetId = $derived($generalSettings.defaultControlSetId || NEW_PANEL_CONTROL_SET_ID);
  let mySets = $derived(allSets.filter((set) => set.origin === 'library'));
  let builtInSets = $derived(allSets.filter((set) => set.origin === 'built-in'));
  let selectedSet = $derived(allSets.find((set) => set.id === selectedId) ?? allSets[0]);
  let isCustom = $derived(selectedSet?.origin === 'library');

  $effect(() => {
    const id = selectedId;
    const set = selectedSet;
    if (!set || loadedId === id) return;
    draft = deepClone(set);
    delete draft.origin;
    familySources = { ...(draft.chosenFamilies ?? {}) };
    loadedId = id;
    status = '';
  });

  let previewPanel = $derived.by(() => {
    if (!draft) return null;
    // Normalised, so what the set derives from its colours (its sections, its instruments' face and
    // voices) follows the swatches while they are edited, not only after a save.
    const set = normalizeControlSetDefinition(draft) ?? draft;
    const isBuiltIn = (id) => BUILT_IN_CONTROL_SETS.some((entry) => entry.id === id);
    // The sample's layout is a built-in's (the set's own, the one it was copied from, or Graphite);
    // its controls are pinned to and drawn with THIS set. They were the stock Graphite Classic sample,
    // pinned to Graphite Classic, so nothing chosen for one of your own sets (a family, a colour)
    // ever showed in its preview.
    const layoutId = isBuiltIn(draft.id) ? draft.id : (isBuiltIn(draft.basedOn) ? draft.basedOn : NEW_PANEL_CONTROL_SET_ID);
    const sample = createControlSetStarter(layoutId, { set });
    return { ...sample, name: `${draft.name} preview`, controlSet: { id: draft.id }, controlSets: [set] };
  });

  function choose(id) {
    selectedId = id;
    loadedId = '';
  }

  function duplicateSelected() {
    const copy = duplicateControlSet(draft ?? selectedSet);
    if (!copy) return;
    choose(copy.id);
    status = `${copy.name} is now editable.`;
  }

  function createSet() {
    // A copy of what a new panel starts on: the designed Graphite, not Classic, which has none of
    // the designs and is kept only so that old documents keep their look.
    const copy = duplicateControlSet(getControlSet(NEW_PANEL_CONTROL_SET_ID), 'New Control Set');
    if (copy) choose(copy.id);
  }

  function saveDraft() {
    const saved = updateControlSetInLibrary(draft?.id, draft);
    status = saved ? `Saved ${saved.name}.` : 'This built-in is protected. Duplicate it to edit.';
  }

  function removeSelected() {
    if (!isCustom || !draft) return;
    if (typeof window !== 'undefined' && !window.confirm(`Delete “${draft.name}” from your library?`)) return;
    const wasDefault = $generalSettings.defaultControlSetId === draft.id;
    removeControlSetFromLibrary(draft.id);
    if (wasDefault) updateGeneralSettings({ defaultControlSetId: NEW_PANEL_CONTROL_SET_ID, defaultControlSetChosen: false });
    choose(wasDefault ? NEW_PANEL_CONTROL_SET_ID : ($generalSettings.defaultControlSetId || NEW_PANEL_CONTROL_SET_ID));
    status = 'Removed from your library.';
  }

  /**
   * Every edit goes through here. A built-in set is protected, and its fields were disabled: the
   * colours, the material and the families looked editable and did nothing. Now the first change to
   * one makes your own copy, with the change in it, and the page goes on with the copy.
   */
  function edit(mutate) {
    if (!draft) return;
    const next = mutate(deepClone(draft));
    if (!next) return;
    if (isCustom) { draft = next; return; }
    const builtInName = draft.name;
    const copy = duplicateControlSet(next, `${builtInName} (mine)`);
    if (!copy) return;
    choose(copy.id);
    status = `${builtInName} is built in, so your change went into your own copy, “${copy.name}”. Save set keeps later changes; Apply to panel uses it.`;
  }

  /** A colour typed as a code (#RRGGBB, RRGGBB or AARRGGBB): no colour picker pops up. */
  function setToken(key, text) {
    const clean = String(text ?? '').replace('#', '').trim();
    if (!/^([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(clean)) return;
    edit((next) => {
      const old = String(next?.tokens?.[key] ?? 'FFFFFFFF').replace('#', '');
      const value = (clean.length === 8 ? clean : `${old.length === 8 ? old.slice(0, 2) : 'FF'}${clean}`).toUpperCase();
      next.tokens = { ...next.tokens, [key]: value };
      // The panel's own fill reads `panel.colour` (utils/backgroundCSS.js), so the panel behind the
      // labels follows the swatch too.
      if (key === 'panel.surface') next.panel = { ...(next.panel ?? {}), colour: value };
      return next;
    });
  }

  function colourValue(key) {
    // A role may be an alias ('{surface}', '{accent}'): show the colour it gives, not its name.
    const raw = String(resolveToken(key, draft) ?? 'FFFFFFFF').replace('#', '');
    return `#${(raw.length === 8 ? raw.slice(2) : raw).padStart(6, '0').slice(-6)}`;
  }

  function setMaterial(patch) {
    edit((next) => {
      const current = next?.panel?.material ?? { enabled: false, kind: 'blast', strength: 50, shine: 40, grain: 100, lampFollowsSet: true };
      next.panel = { ...(next.panel ?? {}), material: { ...current, ...patch } };
      return next;
    });
  }

  function setFamilySource(family, sourceId) {
    const source = getControlSet(sourceId);
    if (!source?.families?.[family]) return;
    // Recorded as the author's choice, so the set's own derived designs never overwrite it
    // (models/personalSetDesigns.js), and the record of what they last wrote no longer applies.
    edit((next) => {
      const { [family]: _, ...designed } = next.designed ?? {};
      return {
        ...next,
        families: { ...(next.families ?? {}), [family]: deepClone(source.families[family]) },
        chosenFamilies: { ...(next.chosenFamilies ?? {}), [family]: sourceId },
        designed,
      };
    });
    familySources = { ...familySources, [family]: sourceId };
  }

  function downloadSelected() {
    const envelope = exportControlSetEnvelope(selectedId);
    if (!envelope) return;
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = controlSetFileName(envelope.set);
    link.click();
    URL.revokeObjectURL(url);
    status = `Exported ${link.download}.`;
  }

  async function importFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    const generation = ++importGeneration;
    try {
      const result = importControlSetText(await file.text(), { carry: false });
      if (generation !== importGeneration) return;
      if (!result.ok) status = result.error;
      else { choose(result.set.id); status = `Imported ${result.set.name} into your library.`; }
    } catch (error) {
      if (generation === importGeneration) status = error?.message ?? 'Import failed.';
    }
  }

  function applyToPanel(id = selectedId) {
    status = setPanelControlSet($activePanelId, id) ? 'Applied to the current panel.' : 'Open a panel to apply a set.';
  }
</script>

{#if galleryOpen}
  <ControlSetGallery initialId={selectedId} onapply={(id) => { choose(id); applyToPanel(id); }} onclose={() => galleryOpen = false} />
{/if}

<div class="control-set-settings">
  <section class="settings-card default-card">
    <div class="card-head"><h2>Control Sets</h2><p>Choose the starting design for new panels and manage reusable visual systems.</p></div>
    <div class="default-row">
      <label><span>Default for new panels</span>
        <select value={defaultSetId} onchange={(event) => updateGeneralSettings({ defaultControlSetId: event.target.value, defaultControlSetChosen: true })}>
          {#if mySets.length}
            <optgroup label="My sets">{#each mySets as set (set.id)}<option value={set.id}>{set.name}</option>{/each}</optgroup>
          {/if}
          <optgroup label="Built in">{#each builtInSets as set (set.id)}<option value={set.id}>{set.name}</option>{/each}</optgroup>
          {#if !allSets.some((set) => set.id === defaultSetId)}
            <option value={defaultSetId}>{defaultSetId} (not installed; new panels use {BASE_CONTROL_SET.name})</option>
          {/if}
        </select>
      </label>
      <button class="primary" onclick={() => galleryOpen = true}><Images size={15} /> Browse 36 templates</button>
      <button onclick={() => fileInput?.click()}><Upload size={15} /> Import</button>
      <input bind:this={fileInput} hidden type="file" accept=".json,application/json" onchange={importFile} />
    </div>
  </section>

  <div class="workspace">
    <aside class="library">
      <header><strong>Library</strong><button title="Create set" aria-label="Create control set" onclick={createSet}><Plus size={15} /></button></header>
      <div class="library-scroll">
        {#if $controlSetLibrary.length}
          <div class="library-group"><small>MY SETS</small><div class="library-row">
            {#each $controlSetLibrary as set}<button class:active={selectedId === set.id} class:on-panel={panelSetId === set.id} onclick={() => choose(set.id)}><b>{set.name}</b><span>{panelSetId === set.id ? 'On this panel' : 'Editable'}</span></button>{/each}
          </div></div>
        {/if}
        <div class="library-group"><small>BUILT IN</small><div class="library-row">
          {#each BUILT_IN_CONTROL_SETS as set}<button class:active={selectedId === set.id} class:on-panel={panelSetId === set.id} onclick={() => choose(set.id)}><b>{set.name}</b><span>{panelSetId === set.id ? 'On this panel' : set.description}</span></button>{/each}
        </div></div>
      </div>
    </aside>

    {#if draft && previewPanel}
      <div class="editor">
        <div class="editor-head">
          <div><h2>{draft.name}{#if draft.id === panelSetId}<span class="on-panel">on this panel</span>{/if}</h2><p>{isCustom ? 'Personal set · edits can be saved and exported' : 'Built-in template · change anything and it becomes your own copy'}</p></div>
          <div class="actions">
            <button onclick={duplicateSelected}><Copy size={14} /> Duplicate</button>
            <button onclick={downloadSelected}><Download size={14} /> Export</button>
            {#if isCustom}<button class="danger" onclick={removeSelected}><Trash2 size={14} /> Delete</button>{/if}
            <button onclick={() => applyToPanel()}>Apply to panel</button>
            {#if isCustom}<button class="primary" onclick={saveDraft}>Save set</button>{/if}
          </div>
        </div>

        <div class="edit-grid">
          <div class="fields">
            <section>
              <h3>Identity</h3>
              <label><span>Name</span><input type="text" value={draft.name} onchange={(event) => edit((next) => ({ ...next, name: event.target.value }))} /></label>
              <label><span>Description</span><textarea rows="2" value={draft.description} onchange={(event) => edit((next) => ({ ...next, description: event.target.value }))}></textarea></label>
            </section>

            <section>
              <h3>Shared colours</h3>
              <div class="colour-grid">
                {#each COLOUR_ROLES as [key, label]}
                  <label><span class="swatch" style:background={colourValue(key)}></span><span class="role">{label}</span>
                    <input class="code" type="text" value={colourValue(key).toUpperCase()} spellcheck="false" aria-label={`${label} colour code`} onchange={(event) => setToken(key, event.target.value)} /></label>
                {/each}
              </div>
            </section>

            <section>
              <h3>Surface material</h3>
              <div class="material-row">
                <label class="check"><input type="checkbox" checked={draft.panel?.material?.enabled === true} onchange={(event) => setMaterial({ enabled: event.target.checked })} /> Enabled</label>
                <label><span>Finish</span><select value={draft.panel?.material?.kind ?? 'blast'} onchange={(event) => setMaterial({ kind: event.target.value })}>{#each MATERIAL_KINDS as kind}<option value={kind}>{kind}</option>{/each}</select></label>
                <label><span>Depth</span><input type="range" min="0" max="150" value={draft.panel?.material?.strength ?? 50} onchange={(event) => setMaterial({ strength: Number(event.target.value) })} /></label>
                <label><span>Shine</span><input type="range" min="0" max="150" value={draft.panel?.material?.shine ?? 40} onchange={(event) => setMaterial({ shine: Number(event.target.value) })} /></label>
              </div>
            </section>

            <section>
              <h3>Control families</h3>
              <p>Mix mechanisms from the 36 synthesizer templates. The complete family definition is copied into your set.</p>
              <div class="family-grid">
                {#each FAMILY_ROLES as [family, label]}
                  <label><span>{label}</span><select value={familySources[family] ?? ''} onchange={(event) => setFamilySource(family, event.target.value)}>
                    <option value="">Keep current design</option>
                    {#each DESIGN_SOURCES as source}<option value={source.id}>{source.name}</option>{/each}
                  </select></label>
                {/each}
              </div>
            </section>
          </div>

          <aside class="preview-card">
            <header><strong>Live preview</strong><span>Representative controls</span></header>
            <div class="preview-viewport"><div class="preview-scale">
              {#key JSON.stringify(draft)}<PanelPreviewSurface panel={previewPanel} scale={1} bgLayers={{ solid: buildSolidStyle(previewPanel) }} gridStyle="" />{/key}
            </div></div>
            {#if status}<p class="status">{status}</p>{/if}
          </aside>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .control-set-settings { display:flex; flex-direction:column; gap:12px; padding:18px; color:#ddd; min-width:0; }
  .settings-card,.workspace { border:1px solid #303030; border-radius:12px; background:linear-gradient(180deg,#222,#181818); overflow:hidden; }
  .card-head { padding:12px 14px 10px; border-bottom:1px solid #2b2b2b; } h2,h3,p { margin:0; }
  .card-head h2,.editor-head h2 { font-size:17px; color:#f4f4f4; } .card-head p,.editor-head p { margin-top:4px; font-size:11px; color:#8d8d8d; }
  .default-row { display:flex; flex-wrap:wrap; align-items:end; gap:9px; padding:13px 14px; } .default-row label { flex:1 1 260px; }
  label { display:flex; flex-direction:column; gap:6px; font-size:11px; color:#aaa; } select,input,textarea,button { font:inherit; }
  select,input[type='text'],textarea { color:#e9e9e9; background:#161616; border:1px solid #3b3b3b; border-radius:6px; padding:7px 9px; }
  textarea { resize:vertical; } button { display:flex; align-items:center; justify-content:center; gap:6px; color:#ddd; background:#292929; border:1px solid #444; border-radius:7px; padding:7px 10px; cursor:pointer; white-space:nowrap; }
  button:hover { border-color:#5b9bd5; } button.primary { background:#0b5f99; border-color:#177fc3; color:white; } button.danger { color:#efaaaa; }
  .workspace { min-height:620px; display:flex; flex-direction:column; }
  .library { background:#191919; border-bottom:1px solid #303030; padding:10px; min-width:0; }
  .library header { display:flex; align-items:center; justify-content:space-between; padding:3px 4px 9px; } .library header button { padding:5px; }
  .library-scroll { display:flex; gap:14px; overflow:auto; padding-bottom:3px; } .library-group { flex:0 0 auto; } .library-group > small { display:block; padding:0 4px 5px; color:#727272; font-size:9px; letter-spacing:.12em; }
  .library-row { display:flex; gap:5px; } .library-row button { display:flex; flex-direction:column; align-items:flex-start; width:132px; text-align:left; border-color:transparent; background:#222; padding:7px 8px; white-space:normal; }
  .library-row button.active { background:#093f63; border-color:#116998; } .library b { font-size:11px; } .library span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#8e8e8e; font-size:9px; }
  .editor { min-width:0; } .editor-head { display:flex; flex-wrap:wrap; justify-content:space-between; gap:10px 18px; align-items:center; padding:13px 15px; border-bottom:1px solid #303030; }
  .actions { display:flex; gap:6px; flex-wrap:wrap; } .edit-grid { display:flex; flex-direction:column; }
  .fields { padding:13px; display:flex; flex-direction:column; gap:11px; } .fields section { padding:12px; background:#1b1b1b; border:1px solid #343434; border-radius:9px; }
  .fields h3 { font-size:12px; color:#eee; margin-bottom:10px; } .fields section > p { color:#858585; font-size:10px; margin:-5px 0 10px; }
  .fields section > label + label { margin-top:9px; } input:disabled,textarea:disabled,select:disabled { opacity:.55; }
  .colour-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; } .colour-grid label { flex-direction:row; align-items:center; padding:5px 7px; background:#242424; border-radius:6px; }
  .colour-grid .swatch { width:22px; height:22px; flex:0 0 auto; border:1px solid #555; border-radius:4px; }
  .colour-grid .role { flex:1; min-width:0; } .colour-grid .code { width:82px; flex:0 0 auto; padding:4px 6px; font-family:ui-monospace,monospace; font-size:11px; }
  .on-panel { margin-left:8px; font-size:10px; font-weight:600; color:#8fd1a6; border:1px solid #3c5a46; border-radius:9px; padding:1px 7px; vertical-align:middle; }
  .library-row button.on-panel span { color:#8fd1a6; }
  .material-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; align-items:end; } .check { flex-direction:row; align-items:center; padding-bottom:8px; }
  input[type='range'] { accent-color:#2486c5; width:100%; } .family-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .preview-card { border-top:1px solid #303030; background:#161616; padding:13px; } .preview-card header { display:flex; justify-content:space-between; font-size:11px; margin-bottom:10px; } .preview-card header span { color:#777; }
  .preview-viewport { width:min(360px,100%); height:272px; overflow:hidden; border:1px solid #424242; border-radius:7px; background:#222; } .preview-scale { width:880px; height:636px; transform:scale(.425); transform-origin:top left; }
  .status { margin-top:10px; color:#9fccec; font-size:11px; line-height:1.4; }
  @media (max-width:900px) { .colour-grid,.family-grid { grid-template-columns:1fr; } }
</style>
