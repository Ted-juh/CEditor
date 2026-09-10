<script>
  /**
   * The Screen tab.
   *
   * Candidate 4 of the display-panel plan; `docs/design/screen-tab-design.md` has the argument.
   * Three things are worth knowing before editing this file.
   *
   * FIRST, the tab exists because of a defect. `composeLayout` DROPS a zone whose row is past the
   * last row and CLAMPS one whose columns run past the last column — and a clamped zone still
   * paints, one cell wide against the right edge, which reads as a bug in the renderer rather than
   * a number out of range. Nothing in the application checks it, and the trigger is the Rows and
   * Cols fields at the top of the same properties panel. `utils/screenModel.js` runs the check, and
   * `test/screenModel.test.js` proves the description by feeding the same zones to the real
   * `composeLayout` rather than by asserting the prose.
   *
   * SECOND, ONE TAB, TWO COORDINATE SYSTEMS. `LcdDisplay` places zones on a character grid,
   * `PixelDisplay` places elements on a pixel grid, and everything above that — layouts, page
   * rules, which page shows — is the same engine (Pixel's own comment says so). The model speaks in
   * rects over a grid and converts at the edges. The one asymmetry that is NOT papered over is in
   * `ScreenStage`: pixel elements are already draggable in their renderer, LCD zones are not, so the
   * stage uses the shipped drag for one and adds an overlay for the other.
   *
   * THIRD, THE PROPERTIES PANEL IS UNTOUCHED. `DisplayEditor` and `PixelDisplayEditor` still draw
   * every section and still edit every field. Nothing is relocated yet; `allScreenFieldLabels()` is
   * ready for the day the panel's rows come out, because moving a group without its search index is
   * losing it rather than moving it.
   */
  import { onMount } from 'svelte';
  import PageList from './screen/PageList.svelte';
  import ScreenStage from './screen/ScreenStage.svelte';
  import ItemSettings from './screen/ItemSettings.svelte';
  import { activePanel, selectedComponentIds } from '../stores/panels.js';
  import { applyControlPatch, updateControlProperty, getSection } from '../stores/controls.js';
  import { flatControls } from '../utils/containment.js';
  import { controlSources } from '../utils/controlSources.js';
  import { ZONE_SHOW_KINDS } from '../utils/lcdZones.js';
  import { lcdDesignLayoutIds, setLcdDesignLayout } from '../stores/lcdDesignLayout.js';
  import {
    editorTarget,
    activateEditorTarget,
    armEditorTargetIfIdle,
    clearEditorTarget,
    targetOfKind,
  } from '../stores/editorTarget.js';
  import {
    screenKindOf,
    screenSectionOf,
    screenGrid,
    layoutsOf,
    findScreenLayout,
    itemPathBase,
    rectPatch,
    placementIssue,
    placementIssues,
    unusedCells,
    reorderRules,
    SCREEN_SECTION_BY_KIND,
    SCREEN_ITEM_BY_KIND,
  } from '../utils/screenModel.js';

  // The element kinds PixelDisplayEditor offers, mirrored so this tab does not import a Svelte file
  // for a list of strings. Kept short on purpose: the exotic kinds (bitmap, wave, scope) are set up
  // in the panel, where their own editors live.
  const PIXEL_KINDS = [
    'static', 'name', 'value', 'pct', 'midiValue', 'note', 'text', 'state', 'edit', 'icon', 'clock',
    'hbar', 'vbar', 'hslider', 'vslider', 'needle', 'wave', 'scope', 'adsr', 'anim', 'bitmap',
  ];

  let mine = $derived(targetOfKind($editorTarget, 'screen'));
  let panelControls = $derived(flatControls($activePanel?.controls ?? []));

  let control = $derived(
    mine?.controlId
      ? panelControls.find((entry) => entry._children?.Core?.id === mine.controlId) ?? null
      : null
  );

  let controlId = $derived(control?._children?.Core?.id ?? '');
  let controlName = $derived(control?._children?.Core?.name || control?._children?.Core?.controlType || '');
  let kind = $derived(screenKindOf(control));
  let screen = $derived(screenSectionOf(control));
  let grid = $derived(screenGrid(screen, kind || 'lcd'));
  let names = $derived(SCREEN_ITEM_BY_KIND[kind] ?? SCREEN_ITEM_BY_KIND.lcd);

  let layouts = $derived(layoutsOf(screen, kind || 'lcd'));
  // The design-layout store is what the canvas already reads, so picking a page here shows it there
  // too. It is view state and never saved — that is the store's whole reason to exist.
  let wantedLayoutId = $derived(String($lcdDesignLayoutIds[controlId] ?? ''));
  let layout = $derived(findScreenLayout(layouts, wantedLayoutId));
  let items = $derived(layout?.items ?? []);

  let rawIndex = $state(-1);
  let selectedIndex = $derived(rawIndex >= 0 && rawIndex < items.length ? rawIndex : (items.length ? 0 : -1));
  let selected = $derived(selectedIndex >= 0 ? items[selectedIndex] : null);
  let selectedIssue = $derived(selected ? placementIssue(selected, grid, kind || 'lcd') : null);

  let issues = $derived(placementIssues(items, grid, kind || 'lcd'));
  let spare = $derived(unusedCells(items, grid, kind || 'lcd'));

  let pages = $derived(screen?.pages ?? {});
  let rules = $derived(Array.isArray(pages?.selectorMap) ? pages.selectorMap : []);
  let layoutNameById = $derived(new Map(layouts.map((entry) => [entry.id, entry.name])));

  let testValue = $state('');

  let sources = $derived([
    { value: '', label: '(source)' },
    { value: '@active', label: '★ Active control' },
    { value: '@edit', label: '✎ This screen’s text' },
    ...controlSources($activePanel?.controls, 'any', controlId).map((entry) => ({ value: entry.id, label: entry.name })),
  ]);

  let itemKinds = $derived(kind === 'pixel' ? PIXEL_KINDS : ZONE_SHOW_KINDS);

  // Opening the tab arms it on whatever is selected right now, and that is the only moment it
  // retargets — from then on it stays put and the header says what it is holding.
    // Arm from the selection only when NOTHING is armed — not merely when nothing of this kind is.
  // A target of another kind means another tab is being opened right now, and stealing it is how
  // the properties panel's opener buttons looked broken. See stores/editorTarget.js.
onMount(() => {
    if (mine) return;
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) armEditorTargetIfIdle('screen', first);
  });

  function armFromSelection() {
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) activateEditorTarget('screen', first);
  }

  function pickLayout(id) {
    setLcdDesignLayout(controlId, id);
    rawIndex = -1;
  }

  function patch(next) {
    if (!controlId || !next || !Object.keys(next).length) return;
    applyControlPatch(controlId, next);
  }

  function setField(key, value) {
    if (!controlId || !layout || selectedIndex < 0) return;
    const base = itemPathBase(kind, layout, selectedIndex);
    if (base) updateControlProperty(controlId, `${base}.${key}`, value);
  }

  function setRect(index, rect) {
    if (!controlId || !layout || index < 0) return;
    const base = itemPathBase(kind, layout, index);
    patch(rectPatch(kind, base, rect, items[index]));
  }

  function repair(rect) {
    setRect(selectedIndex, rect);
  }

  function reorder(from, to) {
    if (!controlId || !screen) return;
    const section = SCREEN_SECTION_BY_KIND[kind];
    updateControlProperty(controlId, `${section}.pages.selectorMap`, reorderRules(rules, from, to));
  }
</script>

<div class="screen-tab">
  {#if !control}
    <div class="empty">
      <strong>Nothing armed.</strong>
      <p>
        Select an LCD or pixel display on the canvas, then use the button below. This tab stays on
        the control you open it with, so it will not change under you while you work.
      </p>
      <button type="button" class="arm" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}>
        {($selectedComponentIds?.size) ? 'Edit the selected control’s screen' : 'Select a control first'}
      </button>
    </div>
  {:else if !kind}
    <div class="empty">
      <strong>{controlName} has no screen.</strong>
      <p>This tab edits an LcdDisplay or a PixelDisplay — the two components that compose a screen out of regions.</p>
      <button type="button" class="arm" onclick={armFromSelection}>Use the selection</button>
    </div>
  {:else}
    <div class="head">
      <span class="who">
        editing <b>{controlName}</b>
        <em>{grid.unitsX} × {grid.unitsY} {grid.unit === 'px' ? 'px' : 'cells'}</em>
        {#if !($selectedComponentIds?.has?.(controlId))}
          <i class="stale" title="This is not the control currently selected — the tab stays where you opened it">not selected</i>
        {/if}
      </span>

      <div class="headtools">
        <button type="button" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}
                title="Point this tab at the control that is selected now">Use selection</button>
        <button type="button" onclick={clearEditorTarget} title="Stop editing this control">Clear</button>
      </div>
    </div>

    <div class="cols">
      <div class="pagecol">
        <div class="colh">Pages <s>{layouts.length}</s></div>
        {#if layouts.length}
          <PageList
            {kind}
            {grid}
            {layouts}
            selectedLayoutId={layout?.id ?? ''}
            {rules}
            {layoutNameById}
            {testValue}
            onpick={pickLayout}
            onreorder={reorder}
            ontest={(value) => { testValue = value; }}
          />
        {:else}
          <p class="none">This screen has no layouts. Add one in the properties panel and it appears here.</p>
        {/if}
      </div>

      <div class="screencol">
        <div class="colh">
          {layout?.name ?? 'Screen'}
          <s>{items.length} {items.length === 1 ? names.one : names.many}</s>
        </div>
        <ScreenStage
          {control}
          allControls={$activePanel?.controls ?? []}
          {kind}
          {screen}
          {grid}
          {items}
          {selectedIndex}
          onselect={(index) => { rawIndex = index; }}
          onmove={setRect}
        />
        {#if issues.length}
          <div class="check bad">
            <b>{issues.length === 1 ? `One ${names.one} is` : `${issues.length} ${names.many} are`} not where {issues.length === 1 ? 'its' : 'their'} numbers say.</b>
            {#each issues as issue (issue.index)}
              <span class="line">{names.one} {issue.index + 1} {issue.message}.</span>
            {/each}
            <span class="fixes">
              {#each issues as issue (issue.index)}
                <button type="button" onclick={() => setRect(issue.index, issue.repair)}>
                  {names.one} {issue.index + 1}: {issue.repairLabel}
                </button>
              {/each}
            </span>
          </div>
        {:else if items.length}
          <div class="check good">
            <b>Every {names.one} is on the screen.</b>
            {#if spare !== null}{spare === 0 ? `All ${grid.unitsX * grid.unitsY} cells are covered.` : `${spare} of ${grid.unitsX * grid.unitsY} cells are unused.`}{/if}
          </div>
        {/if}
      </div>

      <div class="setcol">
        <div class="colh">{selected ? `${names.one} ${selectedIndex + 1}` : names.one}</div>
        <ItemSettings
          {kind}
          item={selected}
          index={selectedIndex}
          {grid}
          kinds={itemKinds}
          {sources}
          issue={selectedIssue}
          onset={setField}
          onrect={(rect) => setRect(selectedIndex, rect)}
          onrepair={repair}
        />
      </div>
    </div>
  {/if}
</div>

<style>
  .screen-tab {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
    background: #15181B;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-bottom: 1px solid #2A2A2A;
    flex: 0 0 auto;
  }

  .who {
    font: 500 9.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .who b { color: #8FEDE3; font-weight: 600; }
  .who em { font-style: normal; margin-left: 6px; color: #8A949C; }
  .who .stale {
    font-style: normal;
    margin-left: 6px;
    color: #E5A029;
    border: 1px solid #4A3A1C;
    background: #241d10;
    border-radius: 2px;
    padding: 2px 4px;
  }

  .headtools { margin-left: auto; display: flex; gap: 4px; }
  .headtools button {
    border: 1px solid #333B42;
    background: #12171A;
    color: #9AA6AE;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 5px 8px;
    border-radius: 3px;
    cursor: pointer;
  }
  .headtools button:hover:not(:disabled) { border-color: #4A555E; color: #E8EEF5; }
  .headtools button:disabled { opacity: 0.4; cursor: default; }

  .cols {
    display: flex;
    gap: 10px;
    padding: 10px;
    align-items: flex-start;
    min-width: 0;
    flex: 1 1 auto;
  }

  .pagecol { flex: 0 0 236px; min-width: 0; }
  .screencol { flex: 1 1 0; min-width: 300px; }
  .setcol { flex: 0 0 258px; min-width: 0; }

  .colh {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #616C75;
    margin-bottom: 7px;
    white-space: nowrap;
    overflow: hidden;
  }
  .colh s { margin-left: auto; text-decoration: none; font-size: 8.5px; letter-spacing: 0.06em; }

  .check {
    margin-top: 7px;
    border: 1px solid #2E3540;
    border-radius: 4px;
    background: #12171A;
    padding: 6px 8px;
    font: 400 9.5px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #8A949C;
  }
  .check b { display: block; color: #C3D0DA; font-weight: 600; }
  .check .line { display: block; }
  .check.good { border-color: #2C5A44; background: #10201A; color: #93C4AC; }
  .check.good b { color: #A9E7C9; }
  .check.bad { border-color: #6B4A1E; background: #221D12; color: #D9BE8A; }
  .check.bad b { color: #F0D48A; }

  .fixes { display: flex; gap: 4px; margin-top: 5px; flex-wrap: wrap; }
  .fixes button {
    border: 1px solid #6B4A1E;
    background: #2A2213;
    color: #F0D48A;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 4px 7px;
    border-radius: 3px;
    cursor: pointer;
  }
  .fixes button:hover { border-color: #E5A029; color: #FFF1D2; }

  .none {
    margin: 0;
    padding: 14px 10px;
    border: 1px dashed #2E3540;
    border-radius: 4px;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #69737B;
  }

  .empty { padding: 22px; max-width: 46ch; color: #8A949C; }
  .empty strong { display: block; font: 600 13px/1.4 'IBM Plex Sans', system-ui, sans-serif; color: #E8EEF5; }
  .empty p { margin: 8px 0 14px; font: 400 12px/1.6 'IBM Plex Sans', system-ui, sans-serif; }

  .arm {
    border: 1px solid #0E7C70;
    background: #0B2320;
    color: #8FEDE3;
    font: 600 11px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 8px 12px;
    border-radius: 3px;
    cursor: pointer;
  }
  .arm:disabled { opacity: 0.45; cursor: default; border-color: #333B42; background: #12171A; color: #69737B; }

  @media (max-width: 1100px) {
    .cols { flex-wrap: wrap; }
    .screencol { flex: 1 1 100%; order: -1; }
  }
</style>
