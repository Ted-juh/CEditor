<script>
  import { untrack } from 'svelte';
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
  import { BUILT_IN_CONTROL_SETS, getControlSet } from '../models/controlSets.js';
  import { PHYSICAL_DIRECTIONS } from '../models/physicalControlSets.js';
  import { MATERIAL_KINDS } from '../utils/materialFilter.js';
  import { controlSetFileName } from '../models/controlSetPackage.js';
  import {
    controlSetLibrary, duplicateControlSet, exportControlSetEnvelope, importControlSetText,
    removeControlSetFromLibrary, updateControlSetInLibrary,
  } from '../stores/controlSetLibrary.js';
  import { generalSettings, updateGeneralSettings } from '../stores/appSettings.js';
  import { activePanelId } from '../stores/panels.js';
  import { setPanelControlSet } from '../stores/controlSets.js';
  import { deepClone } from '../utils/deepClone.js';

  const COLOUR_ROLES = [
    ['surface', 'Panel surface'], ['control.body', 'Control body'], ['control.cap', 'Knob / fader cap'],
    ['control.fill', 'Value fill'], ['accent', 'Accent'], ['text.primary', 'Primary text'],
    ['display.screen', 'Display glass'], ['display.lit', 'Display light'],
  ];
  const FAMILY_ROLES = [
    ['Knob', 'Knobs'], ['Slider', 'Sliders'], ['Button', 'Buttons'],
    ['ToggleButton', 'Switches'], ['DrumPads', 'Drum pads'], ['StepSequencer', 'Steppers'],
  ];
  const DESIGN_SOURCES = PHYSICAL_DIRECTIONS.map((entry) => getControlSet(entry.id)).filter(Boolean);

  let selectedId = $state(untrack(() => $generalSettings.defaultControlSetId || 'graphite'));
  let draft = $state(null);
  let loadedId = $state('');
  let fileInput = $state(null);
  let status = $state('');
  let galleryOpen = $state(false);
  let familySources = $state({});
  let allSets = $derived([
    ...$controlSetLibrary.map((set) => ({ ...set, origin: 'library' })),
    ...BUILT_IN_CONTROL_SETS.filter((set) => !$controlSetLibrary.some((custom) => custom.id === set.id))
      .map((set) => ({ ...set, origin: 'built-in' })),
  ]);
  let selectedSet = $derived(allSets.find((set) => set.id === selectedId) ?? allSets[0]);
  let isCustom = $derived(selectedSet?.origin === 'library');

  $effect(() => {
    const id = selectedId;
    const set = selectedSet;
    if (!set || loadedId === id) return;
    draft = deepClone(set);
    delete draft.origin;
    familySources = {};
    loadedId = id;
    status = '';
  });

  let previewPanel = $derived.by(() => {
    if (!draft) return null;
    const sourceId = BUILT_IN_CONTROL_SETS.some((set) => set.id === draft.id) ? draft.id : 'graphite';
    const sample = createControlSetStarter(sourceId);
    return { ...sample, name: `${draft.name} preview`, controlSet: { id: draft.id }, controlSets: [draft] };
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
    const copy = duplicateControlSet(getControlSet('graphite'), 'New Control Set');
    if (copy) choose(copy.id);
  }

  function saveDraft() {
    const saved = updateControlSetInLibrary(draft?.id, draft);
    status = saved ? `Saved ${saved.name}.` : 'This built-in is protected. Duplicate it to edit.';
  }

  function removeSelected() {
    if (!isCustom || !draft) return;
    if (typeof window !== 'undefined' && !window.confirm(`Delete “${draft.name}” from your library?`)) return;
    removeControlSetFromLibrary(draft.id);
    choose($generalSettings.defaultControlSetId === draft.id ? 'graphite' : ($generalSettings.defaultControlSetId || 'graphite'));
    status = 'Removed from your library.';
  }

  function setToken(key, event) {
    const old = String(draft?.tokens?.[key] ?? 'FFFFFFFF').replace('#', '');
    const alpha = old.length === 8 ? old.slice(0, 2) : 'FF';
    draft = { ...draft, tokens: { ...draft.tokens, [key]: `${alpha}${event.target.value.slice(1).toUpperCase()}` } };
  }

  function colourValue(key) {
    const raw = String(draft?.tokens?.[key] ?? 'FFFFFFFF').replace('#', '');
    return `#${(raw.length === 8 ? raw.slice(2) : raw).padStart(6, '0').slice(-6)}`;
  }

  function setMaterial(patch) {
    const current = draft?.panel?.material ?? { enabled: false, kind: 'blast', strength: 50, shine: 40, grain: 100, lampFollowsSet: true };
    draft = { ...draft, panel: { ...(draft.panel ?? {}), material: { ...current, ...patch } } };
  }

  function setFamilySource(family, sourceId) {
    const source = getControlSet(sourceId);
    if (!source?.families?.[family]) return;
    draft = { ...draft, families: { ...(draft.families ?? {}), [family]: deepClone(source.families[family]) } };
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
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = importControlSetText(await file.text(), { carry: false });
      if (!result.ok) status = result.error;
      else { choose(result.set.id); status = `Imported ${result.set.name} into your library.`; }
    } catch (error) { status = error?.message ?? 'Import failed.'; }
    event.target.value = '';
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
        <select value={$generalSettings.defaultControlSetId} onchange={(event) => updateGeneralSettings({ defaultControlSetId: event.target.value })}>
          {#each BUILT_IN_CONTROL_SETS as set}<option value={set.id}>{set.name}</option>{/each}
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
            {#each $controlSetLibrary as set}<button class:active={selectedId === set.id} onclick={() => choose(set.id)}><b>{set.name}</b><span>Editable</span></button>{/each}
          </div></div>
        {/if}
        <div class="library-group"><small>BUILT IN</small><div class="library-row">
          {#each BUILT_IN_CONTROL_SETS as set}<button class:active={selectedId === set.id} onclick={() => choose(set.id)}><b>{set.name}</b><span>{set.description}</span></button>{/each}
        </div></div>
      </div>
    </aside>

    {#if draft && previewPanel}
      <div class="editor">
        <div class="editor-head">
          <div><h2>{draft.name}</h2><p>{isCustom ? 'Personal set · edits can be saved and exported' : 'Built-in template · duplicate it to edit'}</p></div>
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
              <label><span>Name</span><input type="text" value={draft.name} disabled={!isCustom} oninput={(event) => draft = { ...draft, name: event.target.value }} /></label>
              <label><span>Description</span><textarea rows="2" disabled={!isCustom} value={draft.description} oninput={(event) => draft = { ...draft, description: event.target.value }}></textarea></label>
            </section>

            <section>
              <h3>Shared colours</h3>
              <div class="colour-grid">
                {#each COLOUR_ROLES as [key, label]}
                  <label><input type="color" value={colourValue(key)} disabled={!isCustom} oninput={(event) => setToken(key, event)} /><span>{label}</span></label>
                {/each}
              </div>
            </section>

            <section>
              <h3>Surface material</h3>
              <div class="material-row">
                <label class="check"><input type="checkbox" checked={draft.panel?.material?.enabled === true} disabled={!isCustom} onchange={(event) => setMaterial({ enabled: event.target.checked })} /> Enabled</label>
                <label><span>Finish</span><select disabled={!isCustom} value={draft.panel?.material?.kind ?? 'blast'} onchange={(event) => setMaterial({ kind: event.target.value })}>{#each MATERIAL_KINDS as kind}<option value={kind}>{kind}</option>{/each}</select></label>
                <label><span>Depth</span><input type="range" min="0" max="150" value={draft.panel?.material?.strength ?? 50} disabled={!isCustom} oninput={(event) => setMaterial({ strength: Number(event.target.value) })} /></label>
                <label><span>Shine</span><input type="range" min="0" max="150" value={draft.panel?.material?.shine ?? 40} disabled={!isCustom} oninput={(event) => setMaterial({ shine: Number(event.target.value) })} /></label>
              </div>
            </section>

            <section>
              <h3>Control families</h3>
              <p>Mix mechanisms from the 36 synthesizer templates. The complete family definition is copied into your set.</p>
              <div class="family-grid">
                {#each FAMILY_ROLES as [family, label]}
                  <label><span>{label}</span><select disabled={!isCustom} value={familySources[family] ?? ''} onchange={(event) => setFamilySource(family, event.target.value)}>
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
  input[type='color'] { width:30px; height:24px; padding:1px; border:1px solid #555; border-radius:4px; background:#111; }
  .material-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; align-items:end; } .check { flex-direction:row; align-items:center; padding-bottom:8px; }
  input[type='range'] { accent-color:#2486c5; width:100%; } .family-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .preview-card { border-top:1px solid #303030; background:#161616; padding:13px; } .preview-card header { display:flex; justify-content:space-between; font-size:11px; margin-bottom:10px; } .preview-card header span { color:#777; }
  .preview-viewport { width:min(360px,100%); height:272px; overflow:hidden; border:1px solid #424242; border-radius:7px; background:#222; } .preview-scale { width:880px; height:636px; transform:scale(.425); transform-origin:top left; }
  .status { margin-top:10px; color:#9fccec; font-size:11px; line-height:1.4; }
  @media (max-width:900px) { .colour-grid,.family-grid { grid-template-columns:1fr; } }
</style>
