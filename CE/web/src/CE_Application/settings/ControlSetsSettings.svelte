<script>
  import { onDestroy, untrack } from 'svelte';
  import Copy from 'lucide-svelte/icons/copy';
  import Download from 'lucide-svelte/icons/download';
  import Plus from 'lucide-svelte/icons/plus';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Upload from 'lucide-svelte/icons/upload';
  import Images from 'lucide-svelte/icons/images';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import PanelPreviewSurface from '../editor/PanelPreviewSurface.svelte';
  import ControlSetGallery from '../panels/ControlSetGallery.svelte';
  import ControlSetCard from './ControlSetCard.svelte';
  import { SET_STYLES, groupControlSets } from '../utils/controlSetGroups.js';
  import { buildSolidStyle } from '../utils/backgroundCSS.js';
  import { createControlSetStarter } from '../models/controlSetStarter.js';
  import { BASE_CONTROL_SET, BUILT_IN_CONTROL_SETS, DEFAULT_CONTROL_SET_ID, NEW_PANEL_CONTROL_SET_ID, getControlSet, isRetiredControlSet, normalizeControlSetDefinition, offeredControlSetsWith, resolveToken } from '../models/controlSets.js';
  import { PHYSICAL_DIRECTIONS } from '../models/physicalControlSets.js';
  import { MATERIAL_KINDS } from '../utils/materialFilter.js';
  import { controlSetFileName } from '../models/controlSetPackage.js';
  import {
    controlSetLibrary, duplicateControlSet, exportControlSetEnvelope, importControlSetText,
    removeControlSetFromLibrary, updateControlSetInLibrary,
  } from '../stores/controlSetLibrary.js';
  import { generalSettings, updateGeneralSettings } from '../stores/appSettings.js';
  import { activePanelId, panels } from '../stores/panels.js';
  import { requestControlSetApply } from '../stores/controlSets.js';
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
  // What the Library's cards show of each set: one kind of control at a time, chosen above them.
  const CARD_FAMILIES = [
    ['Knob', 'Knobs'], ['Slider', 'Sliders'], ['Button', 'Buttons'], ['ToggleButton', 'Switches'], ['Meter', 'Meters'], ['DrumPads', 'Pads'],
  ];
  const DESIGN_SOURCES = PHYSICAL_DIRECTIONS.map((entry) => getControlSet(entry.id)).filter(Boolean);

  // Opens on the set the panel uses: it opened on the default for new panels, so the Library always
  // showed Graphite whatever the panel was drawn with. The panel is the one `activePanelId` names:
  // `activePanel` is empty while the Settings tab is in front, which is always, here.
  let targetPanel = $derived($panels.find((entry) => entry.id === $activePanelId) ?? null);
  let panelSetId = $derived(targetPanel ? String(targetPanel.controlSet?.id || DEFAULT_CONTROL_SET_ID) : '');
  let selectedId = $state(untrack(() => panelSetId || $generalSettings.defaultControlSetId || NEW_PANEL_CONTROL_SET_ID));
  let draft = $state(null);
  let loadedId = $state('');
  let fileInput = $state(null);
  let status = $state('');
  let galleryOpen = $state(false);
  let familySources = $state({});
  let query = $state('');
  // The mechanisms fold away by default: twelve odd ones out, opened when wanted.
  let folded = $state(new Set(['mechanical']));
  let previewWidth = $state(376);
  let cardFamily = $state('Knob');
  let cardStyle = $state('');
  let importGeneration = 0;

  onDestroy(() => { importGeneration += 1; });
  let allSets = $derived([
    ...$controlSetLibrary.map((set) => ({ ...set, origin: 'library' })),
    // The built-ins offered, and a retired one only where the panel or the default for new panels
    // still uses it (models/controlSets.js RETIRED_CONTROL_SET_IDS).
    ...[...new Map([...offeredControlSetsWith(panelSetId), ...offeredControlSetsWith($generalSettings.defaultControlSetId)].map((set) => [set.id, set])).values()]
      .filter((set) => !$controlSetLibrary.some((custom) => custom.id === set.id))
      .map((set) => ({ ...set, origin: 'built-in' })),
  ]);
  // The default for new panels can be one of your own sets: createPanel carries it into the new
  // document (models/controlSets.js newPanelControlSet), so the panel keeps it wherever it opens.
  let defaultSetId = $derived($generalSettings.defaultControlSetId || NEW_PANEL_CONTROL_SET_ID);
  let mySets = $derived(allSets.filter((set) => set.origin === 'library'));
  let builtInSets = $derived(allSets.filter((set) => set.origin === 'built-in'));
  let selectedSet = $derived(allSets.find((set) => set.id === selectedId) ?? allSets[0]);
  let isCustom = $derived(selectedSet?.origin === 'library');
  let groups = $derived(groupControlSets({ librarySets: mySets, builtInSets, panelSetId, query, style: cardStyle }));
  let panelName = $derived(String(targetPanel?.name ?? ''));

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

  /**
   * Apply opens the Apply window (layout/ApplyControlSetDialog.svelte), where you choose what
   * changes. Your own set is saved first, so what is applied is what the preview shows.
   */
  function applyToPanel(id = selectedId) {
    if (!targetPanel) { status = 'Open a panel to apply a set.'; return; }
    if (isCustom && draft?.id === id) updateControlSetInLibrary(draft.id, draft);
    requestControlSetApply(id, $activePanelId);
  }

  function toggleGroup(id) {
    const next = new Set(folded);
    if (next.has(id)) next.delete(id); else next.add(id);
    folded = next;
  }
</script>

{#if galleryOpen}
  <ControlSetGallery initialId={selectedId} onapply={(id) => { choose(id); applyToPanel(id); }} onclose={() => galleryOpen = false} />
{/if}

<div class="cs-host">
<div class="control-set-settings">
  <aside class="column library" aria-label="Control set library">
    <header><strong>Library</strong><button class="icon" title="New control set" aria-label="Create control set" onclick={createSet}><Plus size={15} /></button></header>
    <input class="search" type="search" placeholder="Search sets…" aria-label="Search control sets" bind:value={query} />
    <div class="card-families" role="group" aria-label="What the cards show">
      {#each CARD_FAMILIES as [family, label] (family)}
        <button type="button" class:on={cardFamily === family} aria-pressed={cardFamily === family} data-card-family={family} onclick={() => cardFamily = family}>{label}</button>
      {/each}
    </div>
    <div class="card-families styles" role="group" aria-label="Which style">
      <button type="button" class:on={!cardStyle} aria-pressed={!cardStyle} data-card-style="" onclick={() => cardStyle = ''}>All</button>
      {#each SET_STYLES as [style, label] (style)}
        <button type="button" class:on={cardStyle === style} aria-pressed={cardStyle === style} data-card-style={style} onclick={() => cardStyle = style}>{label}</button>
      {/each}
    </div>
    <div class="scroll">
      {#each groups as group (group.id)}
        {@const open = query.trim() !== '' || cardStyle !== '' || !folded.has(group.id)}
        <section class="group" data-set-group={group.id}>
          <button type="button" class="group-head" aria-expanded={open} onclick={() => toggleGroup(group.id)}>
            {#if open}<ChevronDown size={13} />{:else}<ChevronRight size={13} />{/if}
            <span>{group.label}</span><small>{group.sets.length}</small>
          </button>
          {#if open}
            <!-- By era only while the whole Library shows: a style or a search leaves one or two per era. -->
            {#if group.eras && !cardStyle && !query.trim()}
              {#each group.eras as era (era.label)}
                <div class="era">{era.label}</div>
                <div class="cards">
                  {#each era.sets as set (set.id)}<ControlSetCard {set} family={cardFamily} active={selectedId === set.id} onPanel={panelSetId === set.id} onselect={choose} />{/each}
                </div>
              {/each}
            {:else}
              <div class="cards">
                {#each group.sets as set (set.id)}<ControlSetCard {set} family={cardFamily} active={selectedId === set.id} onPanel={panelSetId === set.id} onselect={choose} />{/each}
              </div>
            {/if}
          {/if}
        </section>
      {:else}
        <p class="empty">{query.trim() ? `No set matches “${query.trim()}”.` : 'No set has this style.'}</p>
      {/each}
    </div>
  </aside>

  {#if draft && previewPanel}
    <div class="column editor">
      <header class="editor-head">
        <div class="title">
          <h2>{draft.name}{#if draft.id === panelSetId}<span class="on-panel">on this panel</span>{/if}</h2>
          <p>{isCustom ? 'Your own set: edits are saved with Save set, and exported as a file' : 'Built in: change anything and it becomes your own copy'}</p>
        </div>
        <div class="actions">
          <button onclick={duplicateSelected}><Copy size={14} /> Duplicate</button>
          <button onclick={downloadSelected}><Download size={14} /> Export</button>
          {#if isCustom}<button class="danger" onclick={removeSelected}><Trash2 size={14} /> Delete</button>{/if}
          {#if isCustom}<button class="primary" onclick={saveDraft}>Save set</button>{/if}
        </div>
      </header>

      <div class="scroll fields">
        <section>
          <h3>Identity</h3>
          <div class="identity">
            <label><span>Name</span><input type="text" value={draft.name} onchange={(event) => edit((next) => ({ ...next, name: event.target.value }))} /></label>
            <label><span>Description</span><textarea rows="2" value={draft.description} onchange={(event) => edit((next) => ({ ...next, description: event.target.value }))}></textarea></label>
          </div>
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
    </div>

    <aside class="column side" aria-label="Preview and apply">
      <header><strong>Live preview</strong><span>{draft.name}</span></header>
      <div class="scroll side-body">
        <div class="preview-viewport" bind:clientWidth={previewWidth}
             style:height={`${Math.round((previewWidth / (previewPanel.width || 880)) * (previewPanel.height || 636))}px`}>
          <div class="preview-scale" style:width={`${previewPanel.width || 880}px`} style:height={`${previewPanel.height || 636}px`}
               style:transform={`scale(${previewWidth / (previewPanel.width || 880)})`}>
            {#key JSON.stringify(draft)}<PanelPreviewSurface panel={previewPanel} scale={1} bgLayers={{ solid: buildSolidStyle(previewPanel) }} gridStyle="" />{/key}
          </div>
        </div>
        <div class="side-tools">
        <button class="primary apply" onclick={() => applyToPanel()} disabled={!targetPanel} data-testid="control-set-apply">
          {targetPanel ? `Apply to ${panelName || 'the panel'}…` : 'Open a panel to apply a set'}
        </button>
        {#if status}<p class="status">{status}</p>{/if}

        <label class="default"><span>Default for new panels</span>
          <select value={defaultSetId} onchange={(event) => updateGeneralSettings({ defaultControlSetId: event.target.value, defaultControlSetChosen: true })}>
            {#if mySets.length}
              <optgroup label="My sets">{#each mySets as set (set.id)}<option value={set.id}>{set.name}</option>{/each}</optgroup>
            {/if}
            <optgroup label="Built in">{#each builtInSets as set (set.id)}<option value={set.id}>{set.name}{isRetiredControlSet(set.id) ? ' (no longer offered)' : ''}</option>{/each}</optgroup>
            {#if !allSets.some((set) => set.id === defaultSetId)}
              <option value={defaultSetId}>{defaultSetId} (not installed; new panels use {BASE_CONTROL_SET.name})</option>
            {/if}
          </select>
        </label>
        <button onclick={() => galleryOpen = true}><Images size={15} /> Browse the 36 templates</button>
        <button onclick={() => fileInput?.click()}><Upload size={15} /> Import a set…</button>
        <input bind:this={fileInput} hidden type="file" accept=".json,application/json" onchange={importFile} />
        </div>
      </div>
    </aside>
  {/if}
</div>
</div>

<style>
  /* Three columns, each scrolling on its own: the Library, the set's fields, and the preview with
     Apply beside them, always in sight. The preview used to sit under the fields, out of view.
     Laid out by the room the Settings page has, not the window's: the dock and the inspector can
     take most of a laptop screen. */
  .cs-host { container-type:inline-size; height:100%; }
  .control-set-settings {
    box-sizing:border-box; height:100%; min-height:560px; padding:14px; color:#ddd;
    display:grid; grid-template-columns:minmax(280px,340px) minmax(0,1fr) minmax(300px,400px); grid-template-rows:minmax(0,1fr); gap:12px;
  }
  .column { display:flex; flex-direction:column; min-width:0; min-height:0; border:1px solid #303030; border-radius:10px; background:#1b1b1b; overflow:hidden; }
  .column > header { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:9px 12px; border-bottom:1px solid #2b2b2b; font-size:12px; color:#eee; }
  .column > header span { color:#7d7d7d; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .scroll { flex:1 1 auto; min-height:0; overflow:auto; }
  h2,h3,p { margin:0; }
  label { display:flex; flex-direction:column; gap:6px; font-size:11px; color:#aaa; } select,input,textarea,button { font:inherit; }
  select,input[type='text'],input[type='search'],textarea { color:#e9e9e9; background:#161616; border:1px solid #3b3b3b; border-radius:6px; padding:6px 9px; }
  textarea { resize:vertical; }
  button { display:flex; align-items:center; justify-content:center; gap:6px; color:#ddd; background:#292929; border:1px solid #444; border-radius:7px; padding:6px 10px; cursor:pointer; white-space:nowrap; }
  button:hover:not(:disabled) { border-color:#5b9bd5; } button:disabled { opacity:.55; cursor:default; }
  button.primary { background:#0b5f99; border-color:#177fc3; color:white; } button.danger { color:#efaaaa; }
  button.icon { padding:4px 6px; }

  .search { margin:8px 10px 4px; }
  .card-families { display:flex; flex-wrap:wrap; gap:3px; padding:2px 10px 4px; }
  .card-families button { flex:1 1 auto; padding:3px 5px; border-radius:11px; border-color:#3a3a3a; background:#202020; color:#bbb; font-size:10px; }
  .card-families button.on { background:#094771; border-color:#0B6EB5; color:#fff; }
  .card-families.styles { padding-top:0; }
  .card-families.styles button.on { background:#3d3220; border-color:#a07a2c; color:#f4dfa8; }
  .group-head { width:100%; justify-content:flex-start; gap:5px; padding:7px 10px 3px; border:none; border-radius:0; background:none; color:#6FA8C7; font-size:9.5px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
  .group-head[aria-expanded='false'] { color:#8a8a8a; }
  .group-head small { margin-left:auto; color:#777; font-weight:600; letter-spacing:0; }
  .era { padding:5px 14px 1px; color:#8a8a8a; font-size:10px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(92px,1fr)); gap:6px; padding:4px 10px 8px; }
  .empty { padding:14px; color:#888; font-size:11px; }

  .editor-head { align-items:flex-start !important; flex-wrap:wrap; }
  .editor-head .title { min-width:0; }
  .editor-head h2 { font-size:15px; color:#f4f4f4; } .editor-head p { margin-top:3px; font-size:11px; color:#8d8d8d; }
  .actions { display:flex; gap:6px; flex-wrap:wrap; }
  .fields { padding:12px; display:flex; flex-direction:column; gap:10px; }
  .fields section { padding:11px 12px; background:#1e1e1e; border:1px solid #343434; border-radius:8px; }
  .fields h3 { font-size:12px; color:#eee; margin-bottom:9px; } .fields section > p { color:#858585; font-size:10px; margin:-4px 0 9px; }
  .identity { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,2fr); gap:9px; }
  .colour-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:6px; }
  .colour-grid label { flex-direction:row; align-items:center; padding:4px 6px; background:#242424; border-radius:5px; }
  .colour-grid .swatch { width:20px; height:20px; flex:0 0 auto; border:1px solid #555; border-radius:4px; }
  .colour-grid .role { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .colour-grid .code { width:78px; flex:0 0 auto; padding:3px 6px; font-family:ui-monospace,monospace; font-size:11px; }
  .material-row { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:9px; align-items:end; } .check { flex-direction:row; align-items:center; padding-bottom:8px; }
  input[type='range'] { accent-color:#2486c5; width:100%; }
  .family-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:8px; }
  .on-panel { margin-left:8px; font-size:10px; font-weight:600; color:#8fd1a6; border:1px solid #3c5a46; border-radius:9px; padding:1px 7px; vertical-align:middle; }

  .side-body { padding:12px; display:flex; flex-direction:column; gap:9px; }
  .preview-viewport { position:relative; width:100%; overflow:hidden; border:1px solid #424242; border-radius:7px; background:#222; flex:0 0 auto; }
  .preview-scale { transform-origin:top left; }
  .apply { height:32px; }
  .default { margin-top:6px; }
  .status { color:#9fccec; font-size:11px; line-height:1.4; }

  .side-tools { display:flex; flex-direction:column; gap:9px; min-width:0; }

  /* Less room: the preview and Apply above the fields, the Library beside both. */
  @container (max-width:1079px) {
    .control-set-settings { grid-template-columns:minmax(240px,300px) minmax(0,1fr); grid-template-rows:auto minmax(0,1fr); }
    .library { grid-row:1 / span 2; }
    .side { grid-column:2; grid-row:1; }
    .editor { grid-column:2; grid-row:2; }
    .side-body { flex-direction:row; flex-wrap:wrap; align-items:flex-start; }
    .side .preview-viewport { flex:1 1 240px; max-width:360px; }
    .side-tools { flex:1 1 200px; }
  }
  /* Little room: one column, the page scrolls as a whole. */
  @container (max-width:679px) {
    .control-set-settings { display:flex; flex-direction:column; height:auto; min-height:0; }
    .library { order:0; }
    .library .scroll { max-height:420px; }
    .scroll { overflow:visible; }
    .library .scroll { overflow:auto; }
    .side { order:1; }
    .editor { order:2; }
  }
</style>
