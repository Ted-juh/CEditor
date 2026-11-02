<script>
  // The Component tab of a custom component placed on a panel (the instance side; its id is still
  // 'properties'). Which component this copy is and where it came from, a notice when the library
  // has a newer version (quoting what changed), the copy's values and its settings. The library
  // comparison and what to do with changes made in this copy's own designer are under More.
  // utils/componentCopy.js has the reasoning; the update, save, reset and detach operations are
  // the ones the Source card used (utils/customComponentSourceLink.js), and keep its rules: a
  // destructive one takes a second click that says what is lost, "Update all" never forces, and
  // each update is one store write, so one undo step.
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import Gauge from 'lucide-svelte/icons/gauge';
  import ListChecks from 'lucide-svelte/icons/list-checks';
  import { activePanel } from '../stores/panels.js';
  import { applyControlPatch, getSection, replaceControlsById, updateControlProperty } from '../stores/controls.js';
  import { customComponentLibrary } from '../stores/customComponentLibrary.js';
  import { openComponentExport } from '../stores/componentExport.js';
  import { propertiesTabRequest } from '../stores/propertiesTab.js';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import { flatControls } from '../utils/containment.js';
  import { aarrggbbToHex, mergeHexKeepAlpha } from '../utils/colourHex.js';
  import {
    copyDifferences, copySettingRows, copyStanding, copyValuePatch, copyValueRows, imageSource,
    parseCopyValue, resetCopyPatch,
  } from '../utils/componentCopy.js';
  import {
    detachCustomComponentPatch, diffCustomComponentAgainstSource, packageFamily,
    pushCustomComponentToSource, rebaseCustomComponentOnSource, relinkCustomComponentPatch,
  } from '../utils/customComponentSourceLink.js';

  let { control = null } = $props();

  let controlId = $derived(getSection(control, 'Core')?.id ?? '');
  // No picture of the component on its card: the library's renderer (PackageShot), drawing this
  // copy here, left the properties panel deaf to clicks on its tabs once the Component Designer
  // opened on it, with or without an id of its own. The canvas beside it shows the copy anyway.
  let standing = $derived(control ? copyStanding(control, $customComponentLibrary ?? []) : null);
  let report = $derived(standing?.report ?? null);
  let library = $derived(standing?.latest?.component ?? null);
  let values = $derived(copyValueRows(control, library));
  let settings = $derived(copySettingRows(control));
  let differences = $derived(copyDifferences(report));
  let customized = $derived(values.some((row) => row.customized) || settings.some((row) => row.customized));

  // The other copies of the same package on this panel, and which an update would not hurt.
  let siblings = $derived.by(() => {
    if (!report?.family) return [];
    return flatControls($activePanel?.controls ?? [])
      .filter((entry) => entry?._children?.Core?.controlType === 'CustomComponent'
        && packageFamily(entry._children.Designer?.sourcePackage?.id ?? entry._children.Designer?.packageId) === report.family)
      .map((entry) => ({ control: entry, report: diffCustomComponentAgainstSource(entry, $customComponentLibrary ?? []) }));
  });
  let updatable = $derived(siblings.filter((entry) => entry.report.status === 'update'));
  let blocked = $derived(siblings.filter((entry) => entry.report.status === 'diverged'));
  let pushPlan = $derived(report?.status === 'edited' ? pushCustomComponentToSource(control, report) : null);

  let moreOpen = $state(false);
  let confirming = $state('');
  let status = $state('');
  $effect(() => {
    // A different copy, a different question.
    controlId;
    confirming = '';
    status = '';
  });

  function ask(what) {
    confirming = confirming === what ? '' : what;
  }

  function update(options = {}) {
    if (!report?.latest || !control) return;
    const result = rebaseCustomComponentOnSource(control, report.latest, { report, ...options });
    confirming = '';
    if (result.refused) { status = result.refused; return; }
    replaceControlsById(new Map([[controlId, result.control]]));
    status = `Now ${report.latest.version}`
      + (result.discarded ? ` · replaced ${result.discarded} change${result.discarded === 1 ? '' : 's'} of its own` : '');
  }

  function updateAll() {
    const replacements = new Map();
    for (const entry of updatable) {
      const result = rebaseCustomComponentOnSource(entry.control, entry.report.latest, { report: entry.report });
      if (result.control) replacements.set(entry.control._children.Core.id, result.control);
    }
    replaceControlsById(replacements);
    status = `Updated ${replacements.size} cop${replacements.size === 1 ? 'y' : 'ies'}`
      + (blocked.length ? ` · ${blocked.length} left alone: they have changes of their own` : '');
  }

  function push() {
    confirming = '';
    if (!pushPlan || pushPlan.refused) { status = pushPlan?.refused ?? 'Nothing to save.'; return; }
    const entry = customComponentLibrary.saveControl(pushPlan.component, pushPlan.metadata);
    if (!entry) { status = 'Could not save to the library.'; return; }
    applyControlPatch(controlId, relinkCustomComponentPatch(control, entry));
    status = `Saved as ${entry.name} ${entry.version}: the other copies can update to it`;
  }

  function resetToLibrary() {
    update({ discardLocalEdits: true, keepOverrides: false });
  }

  function resetSettings() {
    confirming = '';
    const patch = resetCopyPatch(control, library);
    if (Object.keys(patch).length) applyControlPatch(controlId, patch);
    status = 'Values and settings are back to how the component starts';
  }

  function detach() {
    confirming = '';
    applyControlPatch(controlId, detachCustomComponentPatch());
    status = 'Detached: it stays as it is, without library updates';
  }

  function setValue(row, raw) {
    if (!controlId) return;
    applyControlPatch(controlId, copyValuePatch(row.name, parseCopyValue(raw, row.type, row.value)));
  }

  function setSetting(row, value) {
    if (controlId && row.path) updateControlProperty(controlId, row.path, value);
  }

  function typedColour(row, text, write) {
    const clean = String(text ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(clean)) write(clean.toUpperCase());
    else if (/^[0-9a-fA-F]{6}$/.test(clean)) write(mergeHexKeepAlpha(row.value, clean));
  }

  function chooseImage(row) {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const targetId = controlId;
      const reader = new FileReader();
      reader.onload = () => { if (controlId === targetId) setSetting(row, String(reader.result ?? '')); };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function numberText(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(Math.round(number * 1000) / 1000) : String(value ?? '');
  }

  function shown(value) {
    if (value === undefined) return '—';
    if (value === null) return 'none';
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text.startsWith('data:')) return 'an image';
    return text.length > 24 ? `${text.slice(0, 23)}…` : text;
  }

  const openDevice = () => propertiesTabRequest.set({ tabId: 'devicebindings' });
</script>

{#if control && standing}
<div class="component-tab" data-testid="component-tab" data-state={standing.state}>
  <div class="id-card">
    <div class="who">
      <b>{standing.name}</b>
      <span class="line">{standing.line}
        {#if standing.state === 'edited' || standing.state === 'diverged'}<i class="pill edited">changed here</i>{/if}
      </span>
    </div>
    {#if standing.state === 'local' || standing.state === 'missing'}
      <button type="button" class="btn" data-testid="component-tab-export" onclick={() => openComponentExport()}
              title="Save it to your library or a file, so other panels can use it">Export…</button>
    {/if}
  </div>

  {#if standing.newer.length}
    <div class="notice" class:warn={standing.state === 'diverged'} data-testid="component-tab-update">
      <b>↑ Version {standing.newer[0].version} is in your library</b>
      {#each standing.newer.filter((entry) => entry.changes) as entry (entry.version)}
        <p class="changes">{#if standing.newer.length > 1}<em>{entry.version}:</em> {/if}“{entry.changes}”</p>
      {/each}
      {#if standing.state === 'update'}
        <div class="row">
          <button type="button" class="btn primary" data-testid="component-tab-update-this" onclick={() => update()}>Update this copy</button>
          {#if updatable.length > 1}
            <button type="button" class="btn" onclick={updateAll} title="Only copies without changes of their own are updated">Update all {updatable.length} on this panel</button>
          {/if}
        </div>
        <p class="hint">Its value and settings stay as you set them.</p>
      {:else}
        <p class="hint">This copy has {report.localEdits} change{report.localEdits === 1 ? '' : 's'} of its own, made in its designer. Updating replaces {report.localEdits === 1 ? 'it' : 'them'}; its value and settings stay.</p>
        <div class="row">
          <button type="button" class="btn warn" onclick={() => ask('force')}>Update anyway…</button>
          {#if updatable.length}
            <button type="button" class="btn" onclick={updateAll} title="Only copies without changes of their own are updated">Update the other {updatable.length}</button>
          {/if}
        </div>
        {#if confirming === 'force'}
          <div class="confirm"><span>Replaces this copy's {report.localEdits} change{report.localEdits === 1 ? '' : 's'} with version {standing.newer[0].version}.</span>
            <button type="button" class="btn warn" onclick={() => update({ discardLocalEdits: true })}>Replace and update</button></div>
        {/if}
      {/if}
    </div>
  {/if}

  {#if status}<p class="status" role="status">{status}</p>{/if}

  <PropertySection title={values.length === 1 ? 'Value' : 'Values'} icon={Gauge}>
    <PropertyCell label="" span={4} compact hint="Where each value starts on this panel. Bind it to a synth parameter on the Device tab.">
      <div class="cell-body">
        {#each values as row (row.name)}
          <div class="field-row" data-value={row.name}>
            <span class="label" title={row.label}>{row.label}</span>
            <div class="editor">
              {#if ['bool', 'boolean', 'toggle'].includes(row.type)}
                <PropertyToggle compact value={row.value === true} ariaLabel={row.label} onchange={(on) => setValue(row, on)} />
              {:else if ['enum', 'choice', 'select'].includes(row.type) && row.values.length}
                <select class="val" value={row.value ?? ''} onchange={(event) => setValue(row, event.currentTarget.value)} aria-label={row.label}>
                  {#each row.values as option, index (index)}<option value={option}>{option}</option>{/each}
                </select>
              {:else if ['color', 'colour'].includes(row.type)}
                <span class="swatch-box"><SwatchCluster swatches={[{ key: `value_${row.name}`, label: row.label, value: row.value, target: { type: 'control', controlId, path: `ValueChannels.${row.name}.defaultValue` } }]} /></span>
                <input class="val code" type="text" value={aarrggbbToHex(row.value).toUpperCase()} spellcheck="false"
                       onchange={(event) => typedColour(row, event.currentTarget.value, (hex) => setValue(row, hex))} aria-label={`${row.label} colour code`} />
              {:else if ['text', 'string'].includes(row.type)}
                <input class="val" type="text" value={row.value ?? ''} onchange={(event) => setValue(row, event.currentTarget.value)} aria-label={row.label} />
              {:else}
                <input class="val" type="number" value={numberText(row.value)} min={row.min} max={row.max} step={row.step ?? 'any'}
                       onchange={(event) => setValue(row, event.currentTarget.value)} aria-label={row.label} />
              {/if}
            </div>
            <button type="button" class="reset" title="Back to where the component starts it" aria-label={`Reset ${row.label}`}
                    disabled={!row.customized} onclick={() => applyControlPatch(controlId, copyValuePatch(row.name, row.resetTo))}><RotateCcw size={12} /></button>
            <button type="button" class="bound" class:off={!row.bound} onclick={openDevice}
                    title={row.bound ? `Bound to ${row.bound} on the Device tab` : 'Not bound: bind it to a synth parameter on the Device tab'}>
              {row.bound ? `Bound: ${row.bound}` : 'Not bound'}
            </button>
          </div>
        {:else}
          <p class="hint">It has no value of its own for a synth parameter: it shows, and its settings change how.</p>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Settings" icon={ListChecks}>
    <PropertyCell label="" span={4} compact hint="What this copy can set for itself. The component's Settings tab, in its designer, chooses them.">
      <div class="cell-body">
        {#each settings as row (row.name)}
          <div class="field-row" data-setting={row.name}>
            <span class="label" title={`${row.label}: ${row.what}`}>{row.label}</span>
            <div class="editor">
              {#if row.missing}
                <span class="gone">points at something the component no longer has</span>
              {:else if row.kind === 'colour'}
                <span class="swatch-box"><SwatchCluster swatches={[{ key: `setting_${row.name}`, label: row.label, value: row.value, target: { type: 'control', controlId, path: row.path } }]} /></span>
                <input class="val code" type="text" value={aarrggbbToHex(row.value).toUpperCase()} spellcheck="false"
                       onchange={(event) => typedColour(row, event.currentTarget.value, (hex) => setSetting(row, hex))} aria-label={`${row.label} colour code`} />
              {:else if row.kind === 'image'}
                {#if imageSource(row.value)}<img class="thumb" src={imageSource(row.value)} alt="" />{:else}<span class="thumb"></span>{/if}
                <button type="button" class="btn" onclick={() => chooseImage(row)}>Choose image…</button>
              {:else if row.kind === 'bool'}
                <PropertyToggle compact value={row.value === true} ariaLabel={row.label} onchange={(on) => setSetting(row, on)} />
              {:else if row.kind === 'number'}
                <input class="val" type="number" value={numberText(row.value)} min={row.min} max={row.max} step={row.step ?? 'any'}
                       onchange={(event) => { const n = Number(event.currentTarget.value); if (Number.isFinite(n)) setSetting(row, n); }} aria-label={row.label} />
              {:else if row.kind === 'choice'}
                <select class="val" value={row.value ?? ''} onchange={(event) => setSetting(row, event.currentTarget.value)} aria-label={row.label}>
                  {#each row.values as option, index (index)}<option value={option}>{option}</option>{/each}
                </select>
              {:else}
                <input class="val" type="text" value={row.value ?? ''} onchange={(event) => setSetting(row, event.currentTarget.value)} aria-label={row.label} />
              {/if}
            </div>
            <button type="button" class="reset" title="Back to how the component starts it" aria-label={`Reset ${row.label}`}
                    disabled={!row.customized} onclick={() => setSetting(row, row.resetTo)}><RotateCcw size={12} /></button>
          </div>
        {:else}
          <p class="hint">None: this copy looks as the component was drawn. The component's Settings tab, in its designer, chooses what a copy can change.</p>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  {#if standing.linked || customized}
    <div class="more">
      <button type="button" class="fold" aria-expanded={moreOpen} data-testid="component-tab-more" onclick={() => { moreOpen = !moreOpen; }}>
        {#if moreOpen}<ChevronDown size={12} />{:else}<ChevronRight size={12} />{/if} More
      </button>
      {#if moreOpen}
        <div class="more-body">
          {#if standing.linked && differences.length}
            <p class="hint">
              {#if standing.state === 'edited' || standing.state === 'diverged'}
                {report.localEdits} change{report.localEdits === 1 ? '' : 's'} on this copy, not in the library{standing.state === 'diverged' ? `, and what ${standing.newer[0]?.version ?? 'the library'} changes` : ''}:
              {:else}
                What version {standing.latest?.version} changes:
              {/if}
            </p>
            <div class="diffs">
              {#each differences.slice(0, 12) as row (row.path)}
                <div class="diff" title={row.path}><span class="what">{row.what}</span><span>{shown(row.here)}</span><span class="arrow">→</span><span>{shown(row.library)}</span></div>
              {/each}
              {#if differences.length > 12}<p class="hint">…and {differences.length - 12} more.</p>{/if}
            </div>
          {:else if standing.state === 'library'}
            <p class="hint">Up to date with version {standing.version} in your library.</p>
          {/if}
          <div class="row">
            {#if pushPlan && !pushPlan.refused}
              <button type="button" class="btn primary" onclick={() => ask('push')}>Save to library as {pushPlan.version}…</button>
            {/if}
            {#if standing.linked && standing.latest && standing.state !== 'library'}
              <button type="button" class="btn" onclick={() => ask('reset')}>Reset to library</button>
            {/if}
            {#if customized}
              <button type="button" class="btn" onclick={() => ask('settings')}>Reset settings</button>
            {/if}
            {#if standing.linked}
              <button type="button" class="btn ghost" onclick={() => ask('detach')}>Detach</button>
            {/if}
          </div>
          {#if confirming === 'push'}
            <div class="confirm"><span>Saves this copy's {report.localEdits} change{report.localEdits === 1 ? '' : 's'} as {standing.name} {pushPlan?.version}. The other copies can then update to it; this copy's value and settings stay its own.</span>
              <button type="button" class="btn primary" onclick={push}>Save</button></div>
          {:else if confirming === 'reset'}
            <div class="confirm"><span>Makes this copy library {standing.latest?.version} exactly: its own changes, value and settings go; its position, name and bindings stay.</span>
              <button type="button" class="btn warn" onclick={resetToLibrary}>Reset</button></div>
          {:else if confirming === 'settings'}
            <div class="confirm"><span>Puts every value and setting of this copy back to how the component starts it.</span>
              <button type="button" class="btn warn" onclick={resetSettings}>Reset settings</button></div>
          {:else if confirming === 'detach'}
            <div class="confirm"><span>It stays exactly as it is, but stops following {standing.name} in your library: no more updates.</span>
              <button type="button" class="btn warn" onclick={detach}>Detach</button></div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
{/if}

<style>
  .component-tab { display: flex; flex-direction: column; gap: 6px; }
  .id-card {
    display: flex; align-items: center; gap: 10px; padding: 7px 8px;
    border: 1px solid rgba(255, 255, 255, 0.09); border-radius: 6px; background: rgba(255, 255, 255, 0.03);
  }
  .who { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .who b { font-size: 13.5px; color: #E5EDF6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .line { font-size: 11px; color: rgba(205, 231, 246, 0.6); }
  .pill { font-style: normal; font-size: 10px; padding: 0 6px; border-radius: 9px; margin-left: 4px; white-space: nowrap; }
  .pill.edited { border: 1px solid rgba(232, 192, 138, 0.5); color: #E8C08A; }
  .notice {
    border: 1px solid #2B5B86; background: #132331; border-radius: 6px; padding: 7px 9px;
    display: flex; flex-direction: column; gap: 5px;
  }
  .notice b { color: #9FD0FF; font-size: 12px; }
  .notice.warn { border-color: #7A6532; background: #2A2416; }
  .notice.warn b { color: #F0C674; }
  .changes { margin: 0; font-style: italic; color: #CFE0EE; font-size: 12px; line-height: 1.35; }
  .changes em { font-style: normal; color: #8FB3CF; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .btn {
    display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px; flex: 0 0 auto;
    border: 1px solid #3A3A3A; border-radius: 4px; background: #2C2C2C; color: #DDD; font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer;
  }
  .btn:hover { border-color: #0B6EB5; }
  .btn.primary { background: #094771; border-color: #0B6EB5; color: #fff; }
  .btn.warn { border-color: #7A6532; color: #F0C674; }
  .btn.ghost { background: transparent; }
  .status { margin: 0; font-size: 11px; color: #8FD1A6; }
  .hint { margin: 0; font-size: 11px; line-height: 1.4; color: rgba(205, 231, 246, 0.55); }
  .cell-body { display: flex; flex-direction: column; gap: 6px; width: 100%; min-width: 0; }
  .field-row { display: grid; grid-template-columns: minmax(70px, 34%) minmax(0, 1fr) 22px; column-gap: 8px; row-gap: 3px; align-items: center; }
  .field-row .label { font-size: 11.5px; color: #CFD8E0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .editor { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .val { flex: 1; box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val.code { flex: 0 0 92px; font-family: ui-monospace, monospace; font-size: 11.5px; }
  .reset {
    width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center;
    border: none; background: none; color: rgba(205, 231, 246, 0.6); cursor: pointer; border-radius: 3px;
  }
  .reset:hover:not(:disabled) { color: #fff; background: rgba(255, 255, 255, 0.08); }
  .reset:disabled { opacity: 0.25; cursor: default; }
  .bound {
    grid-column: 2 / 4; justify-self: start;
    font: inherit; font-size: 10px; height: 18px; padding: 0 6px; border-radius: 3px; cursor: pointer;
    border: 1px solid #2E4C66; background: transparent; color: #8FB3CF;
  }
  .bound.off { border-color: #3A3A3A; color: #888; }
  /* The display panel's swatch (it opens the Colors tool on this field), one square: the cluster
     stretches to its row, and its caption is in the row's label already. */
  .swatch-box { flex: 0 0 26px; width: 26px; display: flex; overflow: hidden; }
  .swatch-box :global(.swx i) { display: none; }
  .thumb { width: 24px; height: 24px; flex: 0 0 auto; border-radius: 3px; border: 1px solid #444; object-fit: cover; background: #151515; }
  .gone { font-size: 11px; color: #E5A029; }
  .more { border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 6px; }
  .fold {
    display: inline-flex; align-items: center; gap: 4px; border: none; background: none; padding: 0; cursor: pointer;
    color: rgba(205, 231, 246, 0.6); font: inherit; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  }
  .fold:hover { color: #E5EDF6; }
  .more-body { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
  .diffs { display: flex; flex-direction: column; gap: 2px; }
  .diff { display: grid; grid-template-columns: minmax(0, 1fr) auto 12px auto; gap: 6px; font-size: 11px; color: #BBB; }
  .diff .what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .diff .arrow { color: #777; text-align: center; }
  .confirm {
    display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
    border: 1px solid #3A3A3A; border-radius: 5px; padding: 6px 8px; background: #202020; font-size: 11px; color: #CCC; line-height: 1.35;
  }
</style>
