<script>
  /**
   * The Effects tab.
   *
   * Four columns — the stack, the specimen, the selected effect, a shelf of looks — over three
   * domains: Text effects, layer Effects and screen Lighting. See `docs/design/effects-tab-design.md`
   * for the argument; the two things worth knowing before editing this file are in
   * `utils/effectStack.js` (the stack is the renderer's own, not a second copy) and in
   * `stores/editorTarget.js` (this tab does NOT follow the selection, deliberately).
   *
   * THE PROPERTIES PANEL IS UNTOUCHED. Every section this tab edits is still in the panel and
   * still editable there — nothing has been relocated yet. That is on purpose: the tab has to be
   * shown to work before anything is taken away, and until then the two are simply two ways into
   * the same properties. Removing the panel's copies is a later, separate change, and the panel's
   * search index depends on it (`allEffectFieldLabels` exists ready for that day).
   */
  import { onMount } from 'svelte';
  import EffectStackList from './effects/EffectStackList.svelte';
  import EffectSpecimen from './effects/EffectSpecimen.svelte';
  import EffectSettings from './effects/EffectSettings.svelte';
  import EffectLooks from './effects/EffectLooks.svelte';
  import { activePanel, selectedComponentIds } from '../stores/panels.js';
  import { applyControlPatch, updateControlProperty } from '../stores/controls.js';
  import { flatControls } from '../utils/containment.js';
  import {
    editorTarget,
    activateEditorTarget,
    armEditorTargetIfIdle,
    setEditorTargetDomain,
    clearEditorTarget,
    targetOfKind,
  } from '../stores/editorTarget.js';
  import {
    DOMAINS,
    availableDomains,
    buildDomain,
    findOrderTies,
    readSection,
    reorderTextStack,
    reorderComponentShadows,
  } from '../utils/effectStack.js';
  import { matchLook } from '../utils/effectLooks.js';

  let selectedKey = $state('');
  let soloed = $state([]);
  let muted = $state([]);
  let activeState = $state('base');

  let mine = $derived(targetOfKind($editorTarget, 'effects'));
  let panelControls = $derived(flatControls($activePanel?.controls ?? []));

  let control = $derived(
    mine?.controlId
      ? panelControls.find((entry) => entry._children?.Core?.id === mine.controlId) ?? null
      : null
  );

  let domainsHere = $derived(availableDomains(control));
  let domain = $derived(
    domainsHere.includes(mine?.domain) ? mine.domain : (domainsHere[0] ?? 'text')
  );

  let built = $derived(buildDomain(control, domain));
  let ties = $derived(domain === 'text' ? findOrderTies(built.rows) : []);
  let allRows = $derived([...built.rows, ...built.unordered]);
  let selectedRow = $derived(allRows.find((row) => row.key === selectedKey) ?? allRows[0] ?? null);
  let selectedValues = $derived(selectedRow ? readSection(control, selectedRow.root) : null);
  let stackIndex = $derived(selectedRow ? built.rows.findIndex((row) => row.key === selectedRow.key) : -1);
  let currentLook = $derived(control ? matchLook(control, domain) : '');

  let controlName = $derived(
    control?._children?.Core?.name || control?._children?.Core?.controlType || ''
  );

  // Opening the tab arms it on whatever is selected right now, and that is the only moment it
  // retargets — from then on it stays put and the header says what it is holding. See
  // editorTarget.js for why that is the opposite of the Colors tab.
    // Arm from the selection only when NOTHING is armed — not merely when nothing of this kind is.
  // A target of another kind means another tab is being opened right now, and stealing it is how
  // the properties panel's opener buttons looked broken. See stores/editorTarget.js.
onMount(() => {
    if (mine) return;
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) armEditorTargetIfIdle('effects', first);
  });

  // A row that vanishes (domain switch, or a shadow deleted from the array) must not leave the
  // settings column pointed at nothing.
  $effect(() => {
    if (selectedKey && !allRows.some((row) => row.key === selectedKey)) selectedKey = '';
  });

  function armFromSelection() {
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) activateEditorTarget('effects', first, domain);
  }

  function setField(row, key, value) {
    if (!control?._children?.Core?.id || !row?.root) return;
    updateControlProperty(control._children.Core.id, `${row.root}.${key}`, value);
  }

  function toggleRow(row) {
    if (!control?._children?.Core?.id || !row?.enabledPath || row.alwaysOn) return;
    updateControlProperty(control._children.Core.id, row.enabledPath, !row.enabled);
  }

  function reorder(key, toIndex) {
    const id = control?._children?.Core?.id;
    if (!id) return;
    const patch = domain === 'component'
      ? reorderComponentShadows(control, built.rows.findIndex((row) => row.key === key), toIndex)
      : reorderTextStack(built.rows, key, toIndex);
    if (Object.keys(patch).length) applyControlPatch(id, patch);
  }

  function toggleIn(list, key) {
    return list.includes(key) ? list.filter((entry) => entry !== key) : [...list, key];
  }

  function applyLook(look) {
    const id = control?._children?.Core?.id;
    if (!id || !look) return;
    applyControlPatch(id, look.patch);
  }
</script>

<div class="effects-tab">
  {#if !control}
    <div class="empty">
      <strong>Nothing armed.</strong>
      <p>
        Select a control on the canvas, then use the button below. This tab stays on the control you
        open it with, so it will not change under you while you work.
      </p>
      <button type="button" class="arm" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}>
        {($selectedComponentIds?.size) ? 'Edit the selected control’s effects' : 'Select a control first'}
      </button>
    </div>
  {:else}
    <div class="head">
      <span class="who">
        editing <b>{controlName}</b>
        {#if !($selectedComponentIds?.has?.(control._children.Core.id))}
          <i class="stale" title="This is not the control currently selected — the tab stays where you opened it">not selected</i>
        {/if}
      </span>

      {#if domainsHere.length > 1}
        <div class="domains" role="tablist" aria-label="Effect kind">
          {#each DOMAINS.filter((entry) => domainsHere.includes(entry.id)) as entry (entry.id)}
            <button
              type="button"
              role="tab"
              class:on={entry.id === domain}
              aria-selected={entry.id === domain}
              onclick={() => setEditorTargetDomain(entry.id)}
            >{entry.label}</button>
          {/each}
        </div>
      {/if}

      <div class="headtools">
        <button type="button" class="retarget" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}
                title="Point this tab at the control that is selected now">Use selection</button>
        <button type="button" class="close" onclick={clearEditorTarget} title="Stop editing this control">Clear</button>
      </div>
    </div>

    <div class="cols">
      <div class="stackcol">
        <div class="colh">Stack <s>front → back</s></div>
        <EffectStackList
          {control} {domain}
          rows={built.rows}
          unordered={built.unordered}
          {ties}
          selectedKey={selectedRow?.key ?? ''}
          {soloed} {muted}
          onselect={(key) => { selectedKey = key; }}
          ontoggle={toggleRow}
          onsolo={(key) => { soloed = toggleIn(soloed, key); }}
          onmute={(key) => { muted = toggleIn(muted, key); }}
          onreorder={reorder}
        />
      </div>

      <div class="speccol">
        <div class="colh">Specimen <s>live · this control</s></div>
        <EffectSpecimen
          {control} {domain}
          rows={allRows}
          {soloed} {muted}
          {activeState}
          onstate={(name) => { activeState = name; }}
        />
      </div>

      <div class="fxcol">
        <div class="colh">{selectedRow?.label ?? 'Effect'}</div>
        <EffectSettings
          row={selectedRow}
          values={selectedValues}
          {stackIndex}
          stackSize={built.rows.length}
          onset={setField}
          ontoggle={toggleRow}
        />
      </div>

      <div class="lookcol">
        <div class="colh">Looks <s>your own text</s></div>
        <EffectLooks {control} {domain} current={currentLook} onapply={applyLook} />
      </div>
    </div>
  {/if}
</div>

<style>
  .effects-tab {
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
  .who .stale {
    font-style: normal;
    margin-left: 6px;
    color: #E5A029;
    border: 1px solid #4A3A1C;
    background: #241d10;
    border-radius: 2px;
    padding: 2px 4px;
  }

  .domains { display: flex; gap: 2px; }
  .domains button {
    border: 1px solid transparent;
    background: transparent;
    color: #96A6B2;
    font: 600 10px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 5px 9px;
    border-radius: 4px;
    cursor: pointer;
  }
  .domains button:hover { color: #DDE6EC; }
  .domains button.on { border-color: #0E7C70; background: #0B2320; color: #8FEDE3; }

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

  .stackcol { flex: 0 0 226px; min-width: 0; }
  .speccol { flex: 1 1 0; min-width: 260px; }
  .fxcol { flex: 0 0 268px; min-width: 0; }
  .lookcol { flex: 0 0 150px; min-width: 0; }

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
  .colh s { margin-left: auto; text-decoration: none; font-size: 8.5px; }

  .empty {
    padding: 22px;
    max-width: 46ch;
    color: #8A949C;
  }
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

  /* The dock is the only place this renders, and it is landscape. Below the width the four
     columns need, they wrap rather than squeeze the specimen out of existence. */
  @media (max-width: 1040px) {
    .cols { flex-wrap: wrap; }
    .speccol { flex: 1 1 100%; order: -1; }
  }
</style>
