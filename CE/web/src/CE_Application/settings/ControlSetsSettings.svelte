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
  import { BASE_CONTROL_SET, BUILT_IN_CONTROL_SETS, DEFAULT_CONTROL_SET_ID, NEW_PANEL_CONTROL_SET_ID, controlSetOptionLabel, getControlSet, illustratedKinds, illustratedValueNote, normalizeControlSetDefinition, offeredControlSetsWith, resolveToken } from '../models/controlSets.js';
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
  import { availableFonts } from '../stores/appSettings.js';
  import { activateColorTarget } from '../stores/colorTarget.js';
  import { displayTabRequest } from '../stores/displayTab.js';
  import { placeFamilyControlForEditing } from '../stores/setFromControl.js';
  import {
    DERIVED_ROLE_GROUP, ROLE_GROUPS, familyLabel, familySourceLabel, groupedFamilies, setLettering, withFamilyReset, withLamp, withLettering,
  } from '../models/setEditing.js';
  import { deepClone } from '../utils/deepClone.js';

  // Every colour role and every family a set holds (models/setEditing.js), grouped; the groups the
  // page opens on, the rest folded.
  let openRoleGroups = $state(new Set(['panel', 'controls']));
  let openFamilyGroups = $state(new Set(['rotary', 'buttons', 'meters']));
  const WEIGHTS = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold']];
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
  // Every group opens unfolded. The mechanisms used to fold away, twelve odd ones out; the two kept
  // (Illustrated) show, with the line that says how they differ.
  let folded = $state(new Set());
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
  // Iris, Satellite or a copy of one: the kinds it draws as whole illustrations, which its page names
  // (models/controlSets.js ILLUSTRATED_CONTROL_SET_IDS). Empty for every other set.
  let illustrated = $derived(draft ? illustratedKinds(draft) : []);
  const listed = (words) => words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : (words[0] ?? '');
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
    status = `Created “${copy.name}”.`;
  }

  function createSet() {
    // A copy of what a new panel starts on: the designed Graphite, not Classic, which has none of
    // the designs and is kept only so that old documents keep their look.
    const copy = duplicateControlSet(getControlSet(NEW_PANEL_CONTROL_SET_ID), 'New Control Set');
    if (copy) choose(copy.id);
  }

  function saveDraft() {
    const saved = updateControlSetInLibrary(draft?.id, draft);
    status = saved ? `Saved “${saved.name}”.` : 'Built-in sets are read-only. Duplicate the set to edit it.';
  }

  function removeSelected() {
    if (!isCustom || !draft) return;
    if (typeof window !== 'undefined' && !window.confirm(`Delete “${draft.name}” from the library?`)) return;
    const wasDefault = $generalSettings.defaultControlSetId === draft.id;
    removeControlSetFromLibrary(draft.id);
    if (wasDefault) updateGeneralSettings({ defaultControlSetId: NEW_PANEL_CONTROL_SET_ID, defaultControlSetChosen: false });
    choose(wasDefault ? NEW_PANEL_CONTROL_SET_ID : ($generalSettings.defaultControlSetId || NEW_PANEL_CONTROL_SET_ID));
    status = 'Removed from the library.';
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
    const copy = duplicateControlSet(next, `${builtInName} Copy`);
    if (!copy) return;
    choose(copy.id);
    status = `Built-in sets are read-only. “${copy.name}” was created; Save Set stores further changes.`;
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

  /** A role's swatch: the Colors dock edits it, as every colour is edited. */
  function pickRole(key, label) {
    if (!draft) return;
    const raw = String(resolveToken(key, draft) ?? 'FFFFFFFF').replace('#', '');
    activateColorTarget({
      type: 'callback',
      label: `${draft.name} › ${label}`,
      _swatchKey: `controlset:${key}`,
      apply: (hex) => setToken(key, hex),
    }, /^[0-9a-f]{8}$/i.test(raw) ? raw.toUpperCase() : `FF${raw.slice(-6).toUpperCase()}`);
    displayTabRequest.set({ tab: 'colors' });
  }

  function toggleIn(setState, id) {
    const next = new Set(setState);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }

  let lettering = $derived(draft ? setLettering(draft) : { family: '', weightValue: 400, letterSpacing: 0 });
  function setLetteringField(patch) { edit((next) => withLettering(next, patch)); }
  function setLampField(patch) { edit((next) => withLamp(next, patch)); }

  // Where a family goes back to: the built-in the set descends from, or the set's own built-in self.
  let resetSource = $derived(draft ? (getControlSet(draft.basedOn) ?? (isCustom ? null : getControlSet(draft.id))) : null);
  function resetFamily(type) {
    if (!resetSource) return;
    edit((next) => withFamilyReset(next, type, resetSource));
    const { [type]: _, ...rest } = familySources;
    familySources = rest;
  }

  /**
   * Edit on Panel: the family's control placed on the open panel, drawn with this set, to style and
   * then Apply to Set. Your own set is saved first, so the panel draws what this page shows.
   */
  function editOnPanel(type) {
    if (!targetPanel) { status = 'Open a panel to edit a family on it.'; return; }
    if (isCustom && draft) updateControlSetInLibrary(draft.id, draft);
    const placed = placeFamilyControlForEditing(draft?.id ?? selectedId, type, targetPanel.id);
    if (!placed) status = 'The family\'s control could not be placed on this panel.';
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
            {#if group.note}<p class="group-note">{group.note}</p>{/if}
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
        <p class="empty">{query.trim() ? `No set matches “${query.trim()}”.` : 'No sets in this style.'}</p>
      {/each}
    </div>
  </aside>

  {#if draft && previewPanel}
    <div class="column editor">
      <header class="editor-head">
        <div class="title">
          <h2>{draft.name}{#if draft.id === panelSetId}<span class="on-panel">In use</span>{/if}{#if illustrated.length}<span class="illustrated-tag">Illustrated set</span>{/if}</h2>
          <p>{isCustom ? 'User set. Save Set stores changes; Export writes it to a file.' : 'Built-in set. Editing creates a copy.'}</p>
        </div>
        <div class="actions">
          <button onclick={duplicateSelected}><Copy size={14} /> Duplicate</button>
          <button onclick={downloadSelected}><Download size={14} /> Export</button>
          {#if isCustom}<button class="danger" onclick={removeSelected}><Trash2 size={14} /> Delete</button>{/if}
          {#if isCustom}<button class="primary" onclick={saveDraft}>Save Set</button>{/if}
        </div>
      </header>
      {#if illustrated.length}
        <!-- How an illustrated set differs (the owner approved the mock-up). -->
        <div class="illustrated-callout" data-illustrated-callout>
          <b>{draft.name} works differently from the other sets.</b>
          <ul>
            <li>Its {listed(illustrated.map((kind) => kind.noun))} are drawn as whole illustrations. Colours, size and depth can be changed (Core › Control design); the parts on the {listed(illustrated.map((kind) => kind.tab))} {illustrated.length > 1 ? 'tabs' : 'tab'} do not apply, and Convert to Parts is not available.</li>
            <li>The value moves the mechanism{illustratedValueNote(draft) ? `: ${illustratedValueNote(draft)}` : ' instead of a pointer over a scale'}.</li>
            <li>Pads and Number steppers are ordinary parts and can be edited as in any other set.</li>
          </ul>
        </div>
      {/if}

      <div class="scroll fields">
        <section>
          <h3>Identity</h3>
          <div class="identity">
            <label><span>Name</span><input type="text" value={draft.name} onchange={(event) => edit((next) => ({ ...next, name: event.target.value }))} /></label>
            <label><span>Description</span><textarea rows="2" value={draft.description} onchange={(event) => edit((next) => ({ ...next, description: event.target.value }))}></textarea></label>
          </div>
        </section>

        <section>
          <h3>Colour roles</h3>
          <p>Every colour a set gives its controls. A swatch opens the Colors dock; a code can be typed.</p>
          {#each ROLE_GROUPS as group (group.id)}
            <button type="button" class="fold-head" aria-expanded={openRoleGroups.has(group.id)} data-role-group={group.id}
              onclick={() => (openRoleGroups = toggleIn(openRoleGroups, group.id))}>
              {#if openRoleGroups.has(group.id)}<ChevronDown size={12} />{:else}<ChevronRight size={12} />{/if}{group.label} <span>{group.roles.length}</span>
            </button>
            {#if openRoleGroups.has(group.id)}
              <div class="colour-grid">
                {#each group.roles as [key, label] (key)}
                  <label><button type="button" class="swatch" style:background={colourValue(key)} title={`Edit ${label} in the Colors dock`} aria-label={`Edit ${label} in the Colors dock`} onclick={() => pickRole(key, label)}></button><span class="role">{label}</span>
                    <input class="code" type="text" value={colourValue(key).toUpperCase()} spellcheck="false" aria-label={`${label} colour code`} onchange={(event) => setToken(key, event.target.value)} /></label>
                {/each}
              </div>
            {/if}
          {/each}
          <button type="button" class="fold-head" aria-expanded={openRoleGroups.has('derived')} onclick={() => (openRoleGroups = toggleIn(openRoleGroups, 'derived'))}>
            {#if openRoleGroups.has('derived')}<ChevronDown size={12} />{:else}<ChevronRight size={12} />{/if}{DERIVED_ROLE_GROUP.label} <span>{DERIVED_ROLE_GROUP.roles.length}</span>
          </button>
          {#if openRoleGroups.has('derived')}
            <div class="colour-grid derived">
              {#each DERIVED_ROLE_GROUP.roles as [key, label] (key)}
                <div class="derived-role" title="Worked out from the set's other colours on every read"><span class="swatch" style:background={colourValue(key)}></span><span class="role">{label}</span><span class="code">{colourValue(key).toUpperCase()}</span></div>
              {/each}
            </div>
          {/if}
        </section>

        <section>
          <h3>Lettering</h3>
          <p>The typeface of every family's text: captions, legends, readouts.</p>
          <div class="material-row">
            <label><span>Typeface</span><select aria-label="Lettering typeface" value={lettering.family} onchange={(event) => setLetteringField({ family: event.target.value })}>
              {#if lettering.family && !$availableFonts.some((font) => font.value === lettering.family)}<option value={lettering.family}>{lettering.family}</option>{/if}
              {#each $availableFonts as font (font.value)}<option value={font.value}>{font.label}</option>{/each}
            </select></label>
            <label><span>Weight</span><select aria-label="Lettering weight" value={lettering.weightValue} onchange={(event) => setLetteringField({ weightValue: Number(event.target.value) })}>
              {#each WEIGHTS as [value, label] (value)}<option {value}>{label}</option>{/each}
            </select></label>
            <label><span>Letter spacing</span><input type="number" step="0.1" aria-label="Lettering spacing" value={lettering.letterSpacing} onchange={(event) => setLetteringField({ letterSpacing: Number(event.target.value) })} /></label>
          </div>
        </section>

        <section>
          <h3>Lamp</h3>
          <p>Where the light on finishes and materials comes from.</p>
          <div class="material-row">
            <label><span>From (degrees)</span><input type="number" min="0" max="360" step="5" aria-label="Lamp direction" value={draft.lamp?.azimuth ?? 225} onchange={(event) => setLampField({ azimuth: event.target.value })} /></label>
            <label><span>Height (degrees)</span><input type="number" min="0" max="90" step="1" aria-label="Lamp height" value={draft.lamp?.elevation ?? 48} onchange={(event) => setLampField({ elevation: event.target.value })} /></label>
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
          <p>Each family takes its design from one of the 36 synthesizer templates or an Own design; <b>Reset</b> returns it to the set it was copied from. <b>Edit on Panel</b> places one on the open panel to style, then Apply to Set.</p>
          {#each groupedFamilies(draft) as group (group.id)}
            <button type="button" class="fold-head" aria-expanded={openFamilyGroups.has(group.id)} data-family-group={group.id}
              onclick={() => (openFamilyGroups = toggleIn(openFamilyGroups, group.id))}>
              {#if openFamilyGroups.has(group.id)}<ChevronDown size={12} />{:else}<ChevronRight size={12} />{/if}{group.label} <span>{group.types.length}</span>
            </button>
            {#if openFamilyGroups.has(group.id)}
              <div class="family-rows">
                {#each group.types as type (type)}
                  {@const own = draft.chosenFamilies?.[type] === 'own'}
                  <div class="family-row" data-family={type}>
                    <span class="family-name">{familyLabel(type)}</span>
                    <select aria-label={`${familyLabel(type)} design`} value={own ? 'own' : (familySources[type] ?? '')} onchange={(event) => event.target.value && event.target.value !== 'own' && setFamilySource(type, event.target.value)}>
                      {#if own}<option value="own">{familySourceLabel(draft, type)}</option>{:else}<option value="">Keep current design</option>{/if}
                      {#each DESIGN_SOURCES as source (source.id)}<option value={source.id}>{source.name}</option>{/each}
                    </select>
                    <button type="button" onclick={() => editOnPanel(type)} disabled={!targetPanel} title={targetPanel ? `Place one of ${draft.name}'s ${familyLabel(type).toLowerCase()} on ${panelName} to style, then Apply to Set` : 'Open a panel first'}>Edit on Panel</button>
                    <button type="button" onclick={() => resetFamily(type)} disabled={!resetSource?.families?.[type]} title={resetSource ? `Back to ${resetSource.name}'s ${familyLabel(type).toLowerCase()}` : 'This set has nothing to go back to'}>Reset</button>
                  </div>
                {/each}
              </div>
            {/if}
          {/each}
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
              <optgroup label="My sets">{#each mySets as set (set.id)}<option value={set.id}>{controlSetOptionLabel(set)}</option>{/each}</optgroup>
            {/if}
            <optgroup label="Built in">{#each builtInSets as set (set.id)}<option value={set.id}>{controlSetOptionLabel(set)}</option>{/each}</optgroup>
            {#if !allSets.some((set) => set.id === defaultSetId)}
              <option value={defaultSetId}>{defaultSetId} (not installed; new panels use {BASE_CONTROL_SET.name})</option>
            {/if}
          </select>
        </label>
        <button onclick={() => galleryOpen = true}><Images size={15} /> Browse the 36 templates</button>
        <button onclick={() => fileInput?.click()}><Upload size={15} /> Import Set…</button>
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
  select,input[type='text'],input[type='search'],input[type='number'],textarea { color:#e9e9e9; background:#161616; border:1px solid #3b3b3b; border-radius:6px; padding:6px 9px; }
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
  .group-note { margin:2px 10px 6px 24px; color:#B9B9B9; font-size:11px; line-height:1.45; }
  .illustrated-tag { margin-left:8px; font-size:10px; font-weight:600; color:#E6C27A; border:1px solid #6B5A33; border-radius:9px; padding:1px 7px; vertical-align:middle; }
  .illustrated-callout { margin:10px 14px 0; padding:9px 12px; border:1px solid #5A4C2E; border-left:3px solid #E6C27A; border-radius:5px; background:#2A2620; color:#DCD6C8; font-size:12px; line-height:1.5; }
  .illustrated-callout b { color:#F0E3C2; }
  .illustrated-callout ul { margin:4px 0 0; padding-left:18px; }
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
  .fold-head { display:flex; align-items:center; justify-content:flex-start; gap:5px; width:100%; margin:6px 0 4px; padding:2px 0; border:0; background:none; color:#a9b9c6; font:inherit; font-size:11px; font-weight:600; cursor:pointer; text-align:left; }
  .fold-head span { color:#6f6f6f; font-weight:400; }
  .colour-grid .swatch { padding:0; cursor:pointer; }
  .colour-grid .derived-role { display:flex; gap:6px; align-items:center; padding:4px 6px; background:#242424; border-radius:5px; opacity:.75; font-size:11px; }
  .colour-grid.derived .code { color:#9a9a9a; }
  .family-rows { display:flex; flex-direction:column; }
  .family-row { display:grid; grid-template-columns:minmax(110px,1fr) minmax(0,1.4fr) auto auto; gap:6px; align-items:center; padding:4px 0; border-top:1px solid #2a2a2a; }
  .family-row:first-child { border-top:0; }
  .family-row .family-name { color:#ddd; font-size:11.5px; }
  .family-row button { height:24px; padding:0 9px; border:1px solid #3b3b3b; border-radius:4px; background:#262626; color:#ddd; font:inherit; font-size:11px; cursor:pointer; white-space:nowrap; }
  .family-row button:hover:not(:disabled) { border-color:#5B9BD5; }
  .family-row button:disabled { opacity:.45; cursor:default; }
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
