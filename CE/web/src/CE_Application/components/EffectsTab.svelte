<script>
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import Pin from 'lucide-svelte/icons/pin';
  import EffectStackList from './effects/EffectStackList.svelte';
  import EffectSettings from './effects/EffectSettings.svelte';
  import EffectLooks from './effects/EffectLooks.svelte';
  import { activePanel, selectedComponentIds } from '../stores/panels.js';
  import { selectedControl, applyControlPatch, updateControlProperty } from '../stores/controls.js';
  import { effectsDockSelection, effectsDockState } from '../stores/effectsDock.js';
  import { stateEditScope, setStateEditScopeBase, setStateEditScopeState } from '../stores/stateEditScope.js';
  import { resolveStateScopedControl } from '../utils/interactionRuntime.js';
  import { flatControls } from '../utils/containment.js';
  import { DOMAINS, availableDomains, buildDomain, findOrderTies, readSection, reorderTextStack, reorderComponentShadows } from '../utils/effectStack.js';
  import { matchLook, looksFor } from '../utils/effectLooks.js';
  import { EFFECT_SURFACES, resolvedSurfaceEffects, effectSurfacePath, effectSurfacePatch } from '../utils/surfaceEffects.js';
  import '../properties/propertyTheme.css';

  setContext('propertyFilterStore', writable(''));
  setContext('propertySectionScope', () => 'effects-dock');
  let panelControls = $derived(flatControls($activePanel?.controls ?? []));
  let rawControl = $derived($effectsDockState.followSelection ? $selectedControl
    : panelControls.find((entry) => entry._children?.Core?.id === $effectsDockState.pinnedId) ?? null);
  let control = $derived(resolveStateScopedControl(rawControl, $stateEditScope.mode === 'state' ? $stateEditScope.stateName : ''));
  let stateNames = $derived(Object.keys(rawControl?._children?.States?._children ?? {}));
  let domainsHere = $derived(availableDomains(control));
  let domain = $derived(domainsHere.includes($effectsDockState.domain) ? $effectsDockState.domain : (domainsHere[0] ?? 'text'));
  let surfaces = $derived(EFFECT_SURFACES.filter((entry) => entry.id === 'component'
    || (entry.id === 'background' && control?._children?.Background)
    || (entry.id === 'border' && control?._children?.Background?._children?.Border)
    || (!['background', 'border'].includes(entry.id) && control?._children?.Background?._children?.Fill)));
  let surface = $derived(surfaces.some((entry) => entry.id === $effectsDockState.surface) ? $effectsDockState.surface : 'component');
  let editingControl = $derived(domain === 'component' ? { ...control, _children: {
    ...control?._children, Effects: resolvedSurfaceEffects(control, surface),
  } } : control);
  let selectionKey = $derived(domain === 'component' ? `${domain}:${surface}` : domain);
  let built = $derived(buildDomain(editingControl, domain));
  let ties = $derived(domain === 'text' ? findOrderTies(built.rows) : []);
  let allRows = $derived([...built.rows, ...built.unordered]);
  let selectedRow = $derived(allRows.find((row) => row.key === $effectsDockSelection[selectionKey]) ?? allRows[0] ?? null);
  let selectedValues = $derived(selectedRow ? readSection(editingControl, selectedRow.root) : null);
  let stackIndex = $derived(selectedRow ? built.rows.findIndex((row) => row.key === selectedRow.key) : -1);
  let looks = $derived(looksFor(domain));
  let currentLook = $derived(control ? matchLook(editingControl, domain) : '');
  let controlName = $derived(control?._children?.Core?.name || control?._children?.Core?.controlType || '');

  function togglePin() {
    effectsDockState.update((state) => ({ ...state,
      followSelection: !state.followSelection,
      pinnedId: state.followSelection ? control?._children?.Core?.id ?? null : state.pinnedId,
    }));
  }
  function changeDomain(domain) {
    effectsDockState.update((state) => ({ ...state, domain }));
  }
  function selectRow(key) {
    effectsDockSelection.update((value) => ({ ...value, [selectionKey]: key }));
  }
  function applyPatch(patch) {
    if (control) applyControlPatch(control._children.Core.id,
      domain === 'component' ? effectSurfacePatch(control, surface, patch) : patch);
  }
  function setField(row, key, value) {
    if (!control?._children?.Core?.id || !row?.root) return;
    if (domain === 'component') applyPatch({ [`${row.root}.${key}`]: value });
    else updateControlProperty(control._children.Core.id, `${row.root}.${key}`, value);
  }
  function toggleRow(row) {
    if (control?._children?.Core?.id && row?.enabledPath && !row.alwaysOn)
      applyPatch({ [row.enabledPath]: !row.enabled });
  }
  function reorder(key, toIndex) {
    const id = control?._children?.Core?.id;
    if (!id) return;
    const patch = domain === 'component'
      ? reorderComponentShadows(editingControl, built.rows.findIndex((row) => row.key === key), toIndex)
      : reorderTextStack(built.rows, key, toIndex);
    if (Object.keys(patch).length) {
      applyPatch(patch);
      if (domain === 'component') selectRow(`shadow:${Math.max(0, Math.min(built.rows.length - 1, toIndex))}`);
    }
  }
  function applyLook(look) {
    if (control && look) applyPatch(look.patch);
  }
</script>

<section class="effects-tab property-theme" aria-label="Effects display panel">
    <header class="target-bar">
      <strong>{controlName || 'Effects'}</strong>{#if control}<span>/ Effects</span>{/if}
      {#if control && !$selectedComponentIds?.has(control._children.Core.id)}<span class="stale">Not selected</span>{/if}
      <div class="headtools">
        <button type="button" class:pinned={!$effectsDockState.followSelection} aria-pressed={!$effectsDockState.followSelection}
          disabled={!control && $effectsDockState.followSelection} onclick={togglePin}
          title={$effectsDockState.followSelection ? 'Keep editing this control when the selection changes' : 'Follow the editor selection'}>
          <Pin size={12} />{$effectsDockState.followSelection ? 'Follow selection' : 'Pinned'}
        </button>
      </div>
    </header>
  {#if !control}
    <div class="empty">
      {#if !$effectsDockState.followSelection}The pinned component is no longer available. Unpin to follow the editor selection.
      {:else}Select a component to edit its effects here.{/if}
    </div>
  {:else if !domainsHere.length}
    <div class="empty">This component has no effects. Select a component with text, component, or screen effects.</div>
  {:else}
    <div class="toolbar">
      <div class="domains" role="tablist" aria-label="Effect kind">
        {#each DOMAINS.filter((entry) => domainsHere.includes(entry.id)) as entry (entry.id)}
          <button type="button" role="tab" class:on={entry.id === domain} aria-selected={entry.id === domain}
            onclick={() => changeDomain(entry.id)}>{entry.label}</button>
        {/each}
      </div>
      {#if domain === 'component'}
        <label>Apply to
          <select aria-label="Effect target" value={surface}
            onchange={(event) => effectsDockState.update((state) => ({ ...state, surface: event.target.value }))}>
            {#each surfaces as entry}<option value={entry.id}>{entry.label}</option>{/each}
          </select>
        </label>
      {/if}
      <label>State
        <select aria-label="Edit state" value={$stateEditScope.mode === 'state' ? $stateEditScope.stateName : ''}
          onchange={(event) => event.target.value ? setStateEditScopeState(event.target.value) : setStateEditScopeBase()}>
          <option value="">Base</option>
          {#if $stateEditScope.mode === 'state' && !stateNames.includes($stateEditScope.stateName)}
            <option value={$stateEditScope.stateName}>{$stateEditScope.stateName}</option>
          {/if}
          {#each stateNames as name}<option value={name}>{name}</option>{/each}
        </select>
      </label>
    </div>
    <div class="cols" class:has-looks={looks.length > 0}>
      <div class="stackcol">
        <div class="colh"><span>{built.rows.length ? 'Stack' : 'Effects'}</span>{#if built.rows.length}<span>Front → back</span>{/if}</div>
        <EffectStackList control={editingControl} {domain} rows={built.rows} unordered={built.unordered} {ties}
          selectedKey={selectedRow?.key ?? ''} onselect={selectRow} ontoggle={toggleRow} onreorder={reorder} />
      </div>
      <div class="fxcol">
        {#key `${control._children.Core.id}:${domain}:${surface}:${selectedRow?.key}`}
          <EffectSettings row={selectedRow} values={selectedValues} controlId={control._children.Core.id}
            colourRoot={domain === 'component' ? effectSurfacePath(surface, selectedRow?.root ?? '') : selectedRow?.root}
            {stackIndex} stackSize={built.rows.length} onset={setField} ontoggle={toggleRow} onreorder={reorder} />
        {/key}
      </div>
      {#if looks.length}
        <div class="lookcol">
          <div class="colh">Quick selection</div>
          <EffectLooks {domain} current={currentLook} onapply={applyLook} />
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .effects-tab { height: 100%; min-height: 0; min-width: 0; display: flex; flex-direction: column; background: #1E1E1E; color: #DDD; font-size: 11px; container: effects-dock / inline-size; }
  .target-bar, .toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 4px 8px; border-bottom: 1px solid #333; flex: 0 0 auto; }
  .target-bar { background: #222; }
  .target-bar strong { font-weight: 600; overflow-wrap: anywhere; }
  .target-bar span, .toolbar label { color: #999; }
  .target-bar .stale { color: #D7AF65; }
  .headtools { margin-left: auto; display: flex; gap: 4px; }
  .headtools button { display: flex; align-items: center; gap: 5px; }
  .headtools button.pinned { background: #094771; color: #FFF; }
  button { min-height: 22px; padding: 2px 7px; border: 1px solid #333; border-radius: 3px; background: #1A1A1A; color: #AAA; font: inherit; cursor: pointer; }
  button:hover { border-color: #5B9BD5; color: #FFF; }
  button:disabled { opacity: .4; cursor: default; }
  .domains { display: flex; gap: 3px; margin-right: auto; }
  .domains button.on { background: #094771; border-color: #0B6EB5; color: #FFF; }
  .toolbar label { display: flex; align-items: center; gap: 5px; }
  select { height: 24px; max-width: 150px; padding: 0 6px; border: 1px solid #333; border-radius: 3px; background: #1A1A1A; color: #DDD; font: inherit; }
  .cols { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 0; flex: 1; }
  .cols.has-looks { grid-template-columns: 220px minmax(0, 1fr) 150px; }
  .stackcol { overflow: auto; min-width: 0; border-right: 1px solid #333; padding: 6px; }
  .colh { display: flex; justify-content: space-between; gap: 4px; color: #888; font-size: 10px; padding: 0 2px 6px; }
  .fxcol { min-width: 0; overflow: auto; padding: 2px 4px; }
  .lookcol { min-width: 0; overflow: auto; padding: 6px; border-left: 1px solid #333; }
  .empty { padding: 12px; color: #AAA; }
  @container effects-dock (max-width: 700px) {
    .cols, .cols.has-looks { grid-template-columns: 160px minmax(0, 1fr); overflow: auto; align-content: start; }
    .stackcol { max-height: 230px; }
    .fxcol { overflow: visible; }
    .lookcol { grid-column: 1 / -1; border-left: 0; border-top: 1px solid #333; overflow: visible; }
    .colh { font-size: 9px; }
  }
</style>
