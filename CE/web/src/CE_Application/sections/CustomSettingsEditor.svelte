<script>
  // The Settings tab of a custom component: what a panel that uses it can change. It replaced
  // Publish (Contract, and Package & Library) when custom components were simplified; the reasoning
  // and the rules are in utils/componentSettings.js and utils/componentPanelValues.js.
  //
  // Two lists. Values: every value is the panel's unless its author keeps it in, one switch each.
  // Settings: what a copy can set for itself, added from the component's own layers. A setting
  // shows the component's own value and changing it here changes the component, so its default is
  // never a separate thing to fill in. A colour is changed in the dock's Colors tool, with its layer
  // selected, or by typing its code: colours are never a popup here.
  import ListChecks from 'lucide-svelte/icons/list-checks';
  import Gauge from 'lucide-svelte/icons/gauge';
  import Plus from 'lucide-svelte/icons/plus';
  import X from 'lucide-svelte/icons/x';
  import { applyControlPatch, getSection } from '../stores/controls.js';
  import { displayTabRequest } from '../stores/displayTab.js';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import { aarrggbbToHex, mergeHexKeepAlpha } from '../utils/colourHex.js';
  import {
    addSettingPatch, removeSettingPatch, settingLabelPatch, settingOptions, settingRows,
    settingValuePatch, valueForPanelPatch, valueRows,
  } from '../utils/componentSettings.js';

  let { control = null } = $props();

  let coreId = $derived(getSection(control, 'Core')?.id ?? '');
  let values = $derived(valueRows(control));
  let settings = $derived(settingRows(control));
  let options = $derived(settingOptions(control));
  let menuOpen = $state(false);
  let renaming = $state('');
  let justAdded = $state('');

  function apply(patch) {
    if (coreId && patch && Object.keys(patch).length) applyControlPatch(coreId, patch);
  }

  function setForPanel(row, on) {
    apply(valueForPanelPatch(control, row.name, on));
  }

  function setValue(row, value) {
    apply(settingValuePatch(control, row.name, value));
  }

  function rename(row, label) {
    renaming = '';
    if (String(label ?? '').trim() && label !== row.label) apply(settingLabelPatch(row.name, label));
  }

  function remove(row) {
    apply(removeSettingPatch(control, row.name));
  }

  function add(option) {
    menuOpen = false;
    const { name, patch } = addSettingPatch(control, option);
    apply(patch);
    justAdded = name;
  }

  // The Colors tool colours the fill of the layer selected on the designer's surface (B8): select
  // the setting's layer there and bring the tool forward. The colour is the component's own, so
  // the setting follows whatever the tool does to it.
  function editColourInTool(row) {
    if (!row.layer) return;
    apply({
      'Designer.selectedLayer': row.layer,
      'Designer.selectedLayers': [row.layer],
      'Designer.selectedSurfaceKind': 'layer',
      'Designer.selectedHitZone': '',
      'Designer.selectedKit': '',
    });
    displayTabRequest.set({ tab: 'colors' });
  }

  function typedColour(row, text) {
    const clean = String(text ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(clean)) setValue(row, clean.toUpperCase());
    else if (/^[0-9a-fA-F]{6}$/.test(clean)) setValue(row, mergeHexKeepAlpha(row.value, clean));
  }

  function chooseImage(row) {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      // The file is read after the click; a different component selected meanwhile must not get it.
      const targetId = coreId;
      const reader = new FileReader();
      reader.onload = () => { if (coreId === targetId) setValue(row, String(reader.result ?? '')); };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function numberFrom(text, fallback) {
    const number = Number(text);
    return Number.isFinite(number) ? number : fallback;
  }

  const imageSource = (value) => (/^(data:|https?:|file:|blob:)/.test(String(value ?? '')) ? String(value) : '');

  function revealMenu(node) {
    node.scrollIntoView?.({ block: 'nearest' });
  }

  function closeMenuOutside(event) {
    if (!menuOpen) return;
    if (!event.target?.closest?.('.add-setting')) menuOpen = false;
  }
</script>

<svelte:window onmousedown={closeMenuOutside} />

<div class="settings-editor" data-testid="component-settings">
  <p class="intro">What a panel that uses this component can change. Everything else stays as you drew it.</p>

  <PropertySection title="Values" icon={Gauge}>
    <PropertyCell label="" span={4} compact hint="Every value is the panel's to bind, link and automate, unless you keep it in.">
      <!-- One block: the cell lays its children out in a row. -->
      <div class="cell-body">
      <div class="rows">
        {#each values as row (row.name)}
          <div class="card value" class:kept-in={!row.forPanel} data-value={row.name}>
            <div class="head">
              <b>{row.label}</b>
              <span class="what">{row.summary}</span>
              <span class="for-panel">
                <PropertyToggle compact label="Panel can use it" value={row.forPanel}
                                title={row.forPanel ? 'A panel can bind this value to a synth parameter, link it, and the plug-in automates it. Click to keep it in.' : 'Only the component itself uses this value. Click to let the panel use it.'}
                                ariaLabel={`${row.label}: panel can use it`}
                                onchange={(on) => setForPanel(row, on)} />
              </span>
            </div>
          </div>
        {:else}
          <p class="hint">No values yet: a panel can place it and change its settings, but nothing binds to it. A knob or a button gets its value on the Interact tab.</p>
        {/each}
      </div>
      {#if values.length}
        <p class="hint">A panel binds a value to a synth parameter, links it to other components, and the plug-in automates it. Switch “Panel can use it” off for one that only the component itself uses. Values are made on the Interact tab.</p>
      {/if}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Settings the panel can change" icon={ListChecks}>
    <PropertyCell label="" span={4} compact hint="What each copy of the component on a panel can set for itself.">
      <div class="cell-body">
      <div class="rows">
        {#each settings as row (row.name)}
          <div class="card setting" class:new={justAdded === row.name} data-setting={row.name}>
            <div class="head">
              {#if renaming === row.name}
                <!-- svelte-ignore a11y_autofocus -->
                <input class="rename" type="text" value={row.label} autofocus
                       onblur={(event) => rename(row, event.currentTarget.value)}
                       onkeydown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') renaming = ''; }} />
              {:else}
                <button type="button" class="name" title="Rename: the name is what the panel's author sees" onclick={() => { renaming = row.name; }}>{row.label}</button>
              {/if}
              <span class="what">{row.what}</span>
              <button type="button" class="remove" title={`Stop the panel changing ${row.what}`} aria-label={`Remove ${row.label}`} onclick={() => remove(row)}><X size={12} /></button>
            </div>
            <div class="edit">
              {#if row.missing}
                <span class="gone">It points at something that no longer exists, so a panel would show a field that does nothing. Remove it with ✕.</span>
              {:else if row.kind === 'colour'}
                {#if row.layer && row.fill}
                  <button type="button" class="swatch" style:background={aarrggbbToHex(row.value)} title={`Colour ${row.layer} in the Colors tool`} aria-label={`Colour ${row.layer} in the Colors tool`} onclick={() => editColourInTool(row)}></button>
                {:else}
                  <span class="swatch" style:background={aarrggbbToHex(row.value)}></span>
                {/if}
                <input class="code" type="text" value={aarrggbbToHex(row.value).toUpperCase()} spellcheck="false"
                       onchange={(event) => typedColour(row, event.currentTarget.value)} aria-label={`${row.label} colour code`} />
                {#if row.layer && row.fill}<span class="tip">click the swatch: the Colors tool colours it</span>{/if}
              {:else if row.kind === 'image'}
                {#if imageSource(row.value)}<img class="thumb" src={imageSource(row.value)} alt="" />{:else}<span class="thumb"></span>{/if}
                <button type="button" class="btn" onclick={() => chooseImage(row)}>Choose image…</button>
              {:else if row.kind === 'bool'}
                <span class="bool"><PropertyToggle compact value={row.value === true} ariaLabel={row.label} onchange={(on) => setValue(row, on)} /></span>
              {:else if row.kind === 'number'}
                <input class="field number" type="number" value={row.value ?? ''} min={row.min} max={row.max} step={row.step ?? 'any'}
                       onchange={(event) => setValue(row, numberFrom(event.currentTarget.value, row.value))} aria-label={row.label} />
              {:else if row.kind === 'choice'}
                <select class="field" value={row.value ?? ''} onchange={(event) => setValue(row, event.currentTarget.value)} aria-label={row.label}>
                  {#each row.values as choice, index (index)}<option value={choice}>{choice}</option>{/each}
                </select>
              {:else}
                <input class="field" type="text" value={row.value ?? ''} onchange={(event) => setValue(row, event.currentTarget.value)} aria-label={row.label} />
              {/if}
            </div>
          </div>
        {:else}
          <p class="hint">None yet: a copy on a panel looks exactly as you drew it. Add what a panel should be able to change, a label's text or a colour, with the button below.</p>
        {/each}
      </div>

      <div class="add-setting">
        <button type="button" class="btn add" aria-expanded={menuOpen} data-testid="add-setting" onclick={() => { menuOpen = !menuOpen; }} disabled={!options.length}>
          <Plus size={12} /> Add a setting ▾
        </button>
        {#if menuOpen}
          <!-- In the flow, not floating: the properties panel scrolls and clips what floats past its edge. -->
          <div class="menu" role="menu" data-testid="add-setting-menu" use:revealMenu>
            {#each options as group (group.group)}
              <div class="group">{group.group}</div>
              {#each group.items as option (option.path)}
                <button type="button" role="menuitem" class="item" class:added={option.added} disabled={option.added}
                        title={option.added ? 'A setting already' : `Let the panel change ${option.detail} of ${option.name}`}
                        onclick={() => add(option)}>
                  <span>{option.name}</span><em>{option.added ? 'added' : option.detail}</em>
                </button>
              {/each}
            {/each}
          </div>
        {/if}
      </div>
      <p class="hint">A setting starts as the component looks now, and changing it here changes the component. Click a name to rename it: the name is what the panel's author sees.</p>
      </div>
    </PropertyCell>
  </PropertySection>
</div>

<style>
  .settings-editor { display: flex; flex-direction: column; gap: 6px; }
  .intro { margin: 0 0 2px; font-size: 12px; line-height: 1.4; color: rgba(205, 231, 246, 0.7); }
  .cell-body { display: block; width: 100%; min-width: 0; }
  .rows { display: flex; flex-direction: column; gap: 6px; width: 100%; }
  .card {
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.03);
    padding: 6px 8px;
    min-width: 0;
  }
  .card.new { border-color: rgba(91, 155, 213, 0.75); box-shadow: 0 0 0 1px rgba(91, 155, 213, 0.3); }
  .card.kept-in { opacity: 0.7; }
  .head { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .head b, .head .name { font-size: 12.5px; font-weight: 700; color: #E5EDF6; white-space: nowrap; }
  .head .name {
    border: none; background: none; padding: 0; font: inherit; font-weight: 700; cursor: text;
    border-bottom: 1px dashed transparent;
  }
  .head .name:hover { border-bottom-color: rgba(91, 155, 213, 0.8); }
  .head .rename {
    font: inherit; font-size: 12.5px; font-weight: 700; width: 140px;
    background: #1A1A1A; border: 1px solid #0B6EB5; border-radius: 3px; color: #E5EDF6; padding: 1px 4px;
  }
  .what { flex: 1; min-width: 0; font-size: 11px; color: rgba(205, 231, 246, 0.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .for-panel, .bool { display: inline-flex; flex: 0 0 auto; }
  .remove {
    border: none; background: none; color: rgba(205, 231, 246, 0.55); cursor: pointer; padding: 0 2px; display: inline-flex;
  }
  .remove:hover { color: #F28B82; }
  .edit { display: flex; align-items: center; gap: 8px; margin-top: 6px; min-width: 0; }
  /* The panel's field skin (properties/propertyTheme.css), as every .val in the properties panel. */
  .field, .code { flex: 1; box-sizing: border-box; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .field.number { flex: 0 0 110px; }
  .code { flex: 0 0 92px; font-family: ui-monospace, monospace; font-size: 11.5px; }
  .swatch { width: 22px; height: 22px; flex: 0 0 auto; border-radius: 3px; border: 1px solid rgba(255, 255, 255, 0.25); padding: 0; }
  button.swatch { cursor: pointer; }
  button.swatch:hover { box-shadow: 0 0 0 2px rgba(91, 155, 213, 0.6); }
  .tip { font-size: 10.5px; color: rgba(205, 231, 246, 0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .thumb { width: 26px; height: 26px; flex: 0 0 auto; border-radius: 3px; border: 1px solid #444; object-fit: cover; background: #151515; }
  .btn {
    display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px;
    border: 1px solid #3A3A3A; border-radius: 4px; background: #2C2C2C; color: #DDD; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .btn:hover:not(:disabled) { border-color: #0B6EB5; }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .gone { font-size: 11px; color: #E5A029; line-height: 1.35; }
  .hint { margin: 6px 0 0; font-size: 11px; line-height: 1.4; color: rgba(205, 231, 246, 0.55); }
  .add-setting { margin-top: 8px; }
  .menu {
    margin-top: 4px; width: min(300px, 100%); box-sizing: border-box;
    max-height: 340px; overflow-y: auto;
    background: #252526; border: 1px solid #454545; border-radius: 6px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6); padding: 5px 0;
  }
  .group { padding: 6px 12px 2px; font-size: 9.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #6FA8C7; }
  .item {
    display: flex; justify-content: space-between; gap: 10px; width: 100%; border: none; background: none; text-align: left;
    padding: 4px 12px 4px 20px; color: #DDD; font: inherit; font-size: 12px; cursor: pointer;
  }
  .item em { font-style: normal; font-size: 11px; color: #8F8F8F; }
  .item:hover:not(:disabled) { background: #094771; color: #fff; }
  .item:hover:not(:disabled) em { color: #cfe3f5; }
  .item.added { color: #6c6c6c; cursor: default; }
</style>
