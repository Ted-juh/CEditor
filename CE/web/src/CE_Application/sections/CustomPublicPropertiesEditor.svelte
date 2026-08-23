<script>
  import Cable from 'lucide-svelte/icons/cable';
  import LayoutDashboard from 'lucide-svelte/icons/layout-dashboard';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import X from 'lucide-svelte/icons/x';
  import Share2 from 'lucide-svelte/icons/share-2';
  import LogIn from 'lucide-svelte/icons/log-in';
  import LogOut from 'lucide-svelte/icons/log-out';
  import Pencil from 'lucide-svelte/icons/pencil';
  import CircleOff from 'lucide-svelte/icons/circle-off';
  import { getSection, applyControlPatch, updateControlProperty } from '../stores/controls.js';
  import { valueAtPath } from '../stores/controlTreeUtils.js';
  import { fingerprintCustomComponent } from '../utils/customComponentPackage.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let designer = $derived(getSection(control, 'Designer'));
  let channels = $derived(getSection(control, 'ValueChannels'));
  let published = $derived(getSection(control, 'PublishedProperties'));
  let api = $derived(getSection(control, 'ExternalAPI'));
  let rawInputEntries = $derived(Object.entries(published?.inputs ?? {}).filter(([, entry]) => entry?.enabled !== false));
  let rawOutputEntries = $derived(Object.entries(published?.outputs ?? {}).filter(([, entry]) => entry?.enabled !== false));
  let rawPropertyEntries = $derived(Object.entries(published?.editableProperties ?? {}).filter(([, entry]) => entry?.enabled !== false));
  let inputEntries = $derived(
    rawInputEntries.filter(([, entry]) => hasValidChannel(entry))
  );
  let outputEntries = $derived(
    rawOutputEntries.filter(([, entry]) => hasValidChannel(entry))
  );
  let propertyEntries = $derived(
    rawPropertyEntries.filter(([, entry]) => hasValidPropertyPath(entry))
  );
  let surfaceCount = $derived(inputEntries.length + outputEntries.length + propertyEntries.length);
  let customizedInputs = $derived(inputEntries.filter(([, entry]) => isChannelCustomized(entry)));
  let customizedProperties = $derived(propertyEntries.filter(([, entry]) => isPropertyCustomized(entry)));
  let customizedCount = $derived(customizedInputs.length + customizedProperties.length);
  let issueEntries = $derived.by(() => [
    ...rawInputEntries
      .filter(([, entry]) => !hasValidChannel(entry))
      .map(([name, entry]) => ({ label: entry?.label || name, detail: `Input target ${entry?.channel || 'is missing'}` })),
    ...rawOutputEntries
      .filter(([, entry]) => !hasValidChannel(entry))
      .map(([name, entry]) => ({ label: entry?.label || name, detail: `Output target ${entry?.channel || 'is missing'}` })),
    ...rawPropertyEntries
      .filter(([, entry]) => !hasValidPropertyPath(entry))
      .map(([name, entry]) => ({ label: entry?.label || name, detail: `Property path ${entry?.path || 'is missing'}` })),
  ]);
  let contractLabel = $derived(api?.addressableName || core?.name || 'Custom Component');
  let sourcePackage = $derived(designer?.sourcePackage ?? null);
  let currentFingerprint = $derived(control ? fingerprintCustomComponent(control) : '');
  let sourceMatches = $derived(!!sourcePackage?.fingerprint && sourcePackage.fingerprint === currentFingerprint);
  let sourceAssetCount = $derived(sourcePackage?.assetManifest?.counts?.total ?? 0);

  function hasValidChannel(entry) {
    return !!entry?.channel && !!channels?._children?.[entry.channel];
  }

  function hasValidPropertyPath(entry) {
    const path = String(entry?.path ?? '').trim();
    return !!path && valueAtPath(control, path) !== undefined;
  }

  function channelEntry(name) {
    return channels?._children?.[name] ?? {};
  }

  function channelValue(name) {
    const channel = channelEntry(name);
    return channel.currentValue ?? channel.defaultValue ?? defaultValueForType(channel?.type);
  }

  function defaultValueForType(type) {
    const kind = String(type ?? 'float').trim().toLowerCase();
    if (kind === 'bool') return false;
    if (kind === 'enum' || kind === 'text' || kind === 'color' || kind === 'colour' || kind === 'image') return '';
    return 0;
  }

  function parseValue(value, type, fallback = undefined) {
    const kind = String(type ?? 'float').trim().toLowerCase();
    if (kind === 'bool') return value === true || value === 'true' || value === '1';
    if (kind === 'int' || kind === 'note') {
      const numeric = Math.round(Number(value));
      return Number.isFinite(numeric) ? numeric : (fallback ?? 0);
    }
    if (kind === 'float') {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : (fallback ?? 0);
    }
    return String(value ?? '');
  }

  function entryMin(entry, channel) {
    return entry?.min ?? channel?.min ?? undefined;
  }

  function entryMax(entry, channel) {
    return entry?.max ?? channel?.max ?? undefined;
  }

  function entryStep(entry, channel, type) {
    return entry?.step ?? channel?.step ?? (type === 'int' || type === 'note' ? 1 : 0.01);
  }

  function entryValues(entry, channel = null) {
    if (Array.isArray(entry?.values) && entry.values.length) return entry.values;
    if (Array.isArray(channel?.values) && channel.values.length) return channel.values;
    return [];
  }

  function hasEntryDefault(entry) {
    return entry && Object.prototype.hasOwnProperty.call(entry, 'defaultValue');
  }

  function sameValue(left, right) {
    return String(left ?? '') === String(right ?? '');
  }

  function isChannelCustomized(entry) {
    if (!entry?.channel || !hasEntryDefault(entry)) return false;
    return !sameValue(channelValue(entry.channel), entry.defaultValue);
  }

  function isPropertyCustomized(entry) {
    const path = String(entry?.path ?? '').trim();
    if (!path || !hasEntryDefault(entry)) return false;
    return !sameValue(propertyValue(path), entry.defaultValue);
  }

  function setChannelValue(channelName, rawValue) {
    if (!core?.id || !channelName) return;
    const channel = channelEntry(channelName);
    const value = parseValue(rawValue, channel?.type, channel?.defaultValue);
    applyControlPatch(core.id, {
      [`ValueChannels.${channelName}.defaultValue`]: value,
      [`ValueChannels.${channelName}.currentValue`]: value,
    });
  }

  function resetChannelValue(channelName, entry = null) {
    if (!core?.id || !channelName) return;
    const channel = channelEntry(channelName);
    const value = hasEntryDefault(entry)
      ? entry.defaultValue
      : (channel?.defaultValue ?? defaultValueForType(channel?.type));
    applyControlPatch(core.id, {
      [`ValueChannels.${channelName}.defaultValue`]: value,
      [`ValueChannels.${channelName}.currentValue`]: value,
    });
  }

  function setPropertyValue(path, rawValue, type, fallback = undefined) {
    if (!core?.id || !path) return;
    updateControlProperty(core.id, path, parseValue(rawValue, type, fallback));
  }

  function resetPropertyValue(entry) {
    const path = String(entry?.path ?? '').trim();
    if (!core?.id || !path || !hasEntryDefault(entry)) return;
    updateControlProperty(core.id, path, entry.defaultValue);
  }

  function clearPropertyValue(entry) {
    const path = String(entry?.path ?? '').trim();
    if (!core?.id || !path) return;
    updateControlProperty(core.id, path, '');
  }

  function propertyValue(path) {
    return valueAtPath(control, path);
  }

  async function setPropertyFile(entry, file) {
    const path = String(entry?.path ?? '').trim();
    if (!core?.id || !path || !file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    updateControlProperty(core.id, path, dataUrl);
  }

  function resetAllPublicValues() {
    if (!core?.id) return;
    const patch = {};
    for (const [, entry] of inputEntries) {
      if (!entry?.channel || !hasEntryDefault(entry)) continue;
      patch[`ValueChannels.${entry.channel}.defaultValue`] = entry.defaultValue;
      patch[`ValueChannels.${entry.channel}.currentValue`] = entry.defaultValue;
    }
    for (const [, entry] of propertyEntries) {
      const path = String(entry?.path ?? '').trim();
      if (!path || !hasEntryDefault(entry)) continue;
      patch[path] = entry.defaultValue;
    }
    if (Object.keys(patch).length) applyControlPatch(core.id, patch);
  }

  function openPublicApiEditor() {
    if (!core?.id) return;
    // Jump to the author-side Publish tab in contract mode (opens the
    // Designer workspace first when needed — Stage A6 rule).
    applyControlPatch(core.id, {
      'Designer.focusSection': 'publish',
      'Designer.focusApiMode': 'contract',
    });
  }

  function openDesignerEditor() {
    if (!core?.id) return;
    applyControlPatch(core.id, {
      'Designer.focusSection': 'publish',
      'Designer.focusApiMode': 'package',
    });
  }
</script>

<PropertySection title="Public API" icon={Share2}>
  <PropertyCell label="Name" span={1} hint="The name this component is addressed by when a panel places it.">
    <div class="contract-card">
      <strong>{contractLabel}</strong>
      <span>{surfaceCount} public item{surfaceCount === 1 ? '' : 's'}</span>
    </div>
  </PropertyCell>
  <PropertyCell label="Inputs" span={1} hint="Published input values this component accepts.">
    <div class="metric">{inputEntries.length}</div>
  </PropertyCell>
  <PropertyCell label="Outputs" span={1} hint="Published output values this component can send to other components.">
    <div class="metric">{outputEntries.length}</div>
  </PropertyCell>
  <PropertyCell label="Props" span={1} hint="Editable style/content properties exposed by the component author.">
    <div class="metric">{propertyEntries.length}</div>
  </PropertyCell>
  {#if customizedCount}
    <PropertyCell label="Customized" span={2} hint="Published values and editable properties that differ from their package defaults.">
      <div class="customized-card">
        <strong>{customizedCount}</strong>
        <span>{customizedInputs.length} input{customizedInputs.length === 1 ? '' : 's'} · {customizedProperties.length} prop{customizedProperties.length === 1 ? '' : 's'}</span>
      </div>
    </PropertyCell>
    <PropertyCell label="Reset" span={2} hint="Restore all public controls that have package defaults.">
      <button class="jump-btn" onclick={resetAllPublicValues} disabled={!customizedCount}>
        <RotateCcw size={14} strokeWidth={1.7} />
        <span>Reset Public Defaults</span>
      </button>
    </PropertyCell>
  {/if}
  <PropertyCell label="Designer" span={2} hint="Open the full custom component designer for this placed component.">
    <button class="jump-btn" onclick={openDesignerEditor} disabled={!core?.id}>
      <LayoutDashboard size={14} strokeWidth={1.7} />
      <span>Open Designer</span>
    </button>
  </PropertyCell>
  <PropertyCell label="Authoring" span={2} hint="Open the Public API authoring tab to change what this package exposes.">
    <button class="jump-btn" onclick={openPublicApiEditor} disabled={!core?.id}>
      <Cable size={14} strokeWidth={1.7} />
      <span>Open Public API Editor</span>
    </button>
  </PropertyCell>
  {#if issueEntries.length}
    <PropertyCell label="Needs Fix" span={4} hint="The package exposes entries that no longer point to a valid channel or property path.">
      <div class="issue-list">
        {#each issueEntries as issue}
          <span>
            <strong>{issue.label}</strong>
            <em>{issue.detail}</em>
          </span>
        {/each}
      </div>
    </PropertyCell>
  {/if}
  {#if sourcePackage}
    <PropertyCell label="Source" span={4} hint="Reusable package identity kept when this custom component was inserted or loaded from the library.">
      <div class="source-card" class:changed={!sourceMatches}>
        <strong>{sourcePackage.name} {sourcePackage.version}</strong>
        <span>{sourcePackage.category || 'custom'} · {sourcePackage.capabilities?.primaryKind ?? 'custom'} · readiness {sourcePackage.readiness?.score ?? 0}%</span>
        <span>{sourcePackage.publicApiSummary?.counts?.total ?? 0} public item{(sourcePackage.publicApiSummary?.counts?.total ?? 0) === 1 ? '' : 's'} · {sourceAssetCount} asset{sourceAssetCount === 1 ? '' : 's'}</span>
        <em>{sourceMatches ? 'matches source package' : 'edited since source package load'}</em>
        <small>{sourcePackage.fingerprint}</small>
      </div>
    </PropertyCell>
  {/if}
</PropertySection>

{#if inputEntries.length}
  <PropertySection title="Published Inputs" icon={LogIn}>
    {#each inputEntries as [name, entry] (name)}
      {@const channel = channelEntry(entry.channel)}
      {@const type = String(entry.type ?? channel?.type ?? 'float').trim().toLowerCase()}
      <PropertyCell label={entry.label || name} span={type === 'bool' ? 2 : 4} hint={`Channel ${entry.channel}`}>
        <div class="control-row">
          {#if isChannelCustomized(entry)}
            <span class="dirty-dot" title="Customized from package default"></span>
          {/if}
          {#if type === 'bool'}
            <PropertyToggle value={channelValue(entry.channel) === true} onchange={() => setChannelValue(entry.channel, !(channelValue(entry.channel) === true))} />
          {:else if type === 'enum' && entryValues(entry, channel).length}
            <select class="val" value={channelValue(entry.channel)} onchange={(event) => setChannelValue(entry.channel, event.target.value)}>
              {#each entryValues(entry, channel) as option}
                <option value={option}>{option}</option>
              {/each}
            </select>
          {:else if type === 'color' || type === 'colour'}
            <SwatchCluster swatches={[
              { key: `input_${name}`, label: 'Colour', value: channelValue(entry.channel), target: { type: 'callback', apply: (hex) => setChannelValue(entry.channel, hex) } },
            ]} />
            <input
              class="val"
              type="text"
              value={channelValue(entry.channel)}
              onchange={(event) => setChannelValue(entry.channel, event.target.value)}
            />
          {:else}
            <input
              class="val"
              type={type === 'text' ? 'text' : 'number'}
              min={entryMin(entry, channel)}
              max={entryMax(entry, channel)}
              step={entryStep(entry, channel, type)}
              value={channelValue(entry.channel)}
              onchange={(event) => setChannelValue(entry.channel, event.target.value)}
            />
          {/if}
          <button class="icon-btn" type="button" title="Reset value" aria-label="Reset value" onclick={() => resetChannelValue(entry.channel, entry)}>
            <RotateCcw size={13} strokeWidth={1.8} />
          </button>
        </div>
      </PropertyCell>
    {/each}
  </PropertySection>
{/if}

{#if propertyEntries.length}
  <PropertySection title="Editable Properties" icon={Pencil}>
    {#each propertyEntries as [name, entry] (name)}
      {@const type = String(entry.type ?? 'text').trim().toLowerCase()}
      {@const path = String(entry.path ?? '').trim()}
      <PropertyCell label={entry.label || name} span={type === 'bool' ? 2 : 4} hint={path}>
        <div class="control-row">
          {#if isPropertyCustomized(entry)}
            <span class="dirty-dot" title="Customized from package default"></span>
          {/if}
          {#if type === 'bool'}
            <PropertyToggle value={propertyValue(path) === true} onchange={() => setPropertyValue(path, !(propertyValue(path) === true), type, entry.defaultValue)} />
          {:else if type === 'enum' && entryValues(entry).length}
            <select class="val" value={propertyValue(path) ?? ''} onchange={(event) => setPropertyValue(path, event.target.value, type, entry.defaultValue)}>
              {#each entryValues(entry) as option}
                <option value={option}>{option}</option>
              {/each}
            </select>
          {:else if type === 'color' || type === 'colour'}
            <SwatchCluster swatches={[
              { key: `prop_${name}`, label: 'Colour', value: propertyValue(path), target: { type: 'callback', apply: (hex) => setPropertyValue(path, hex, type, entry.defaultValue) } },
            ]} />
            <input
              class="val"
              type="text"
              value={propertyValue(path) ?? ''}
              onchange={(event) => setPropertyValue(path, event.target.value, type, entry.defaultValue)}
            />
          {:else if type === 'image'}
            <input
              class="val"
              type="text"
              value={propertyValue(path) ?? ''}
              onchange={(event) => setPropertyValue(path, event.target.value, type, entry.defaultValue)}
            />
            <input class="file-input" type="file" accept="image/*" title="Load image" onchange={(event) => setPropertyFile(entry, event.target.files?.[0])} />
            <button class="icon-btn" type="button" title="Clear image" aria-label="Clear image" onclick={() => clearPropertyValue(entry)}>
              <X size={13} strokeWidth={1.8} />
            </button>
          {:else}
            <input
              class="val"
              type={type === 'float' || type === 'int' || type === 'note' ? 'number' : 'text'}
              min={entryMin(entry)}
              max={entryMax(entry)}
              step={entryStep(entry, null, type)}
              value={propertyValue(path) ?? ''}
              onchange={(event) => setPropertyValue(path, event.target.value, type, entry.defaultValue)}
            />
          {/if}
          {#if hasEntryDefault(entry)}
            <button class="icon-btn" type="button" title="Reset property" aria-label="Reset property" onclick={() => resetPropertyValue(entry)}>
              <RotateCcw size={13} strokeWidth={1.8} />
            </button>
          {/if}
        </div>
      </PropertyCell>
    {/each}
  </PropertySection>
{/if}

{#if outputEntries.length}
  <PropertySection title="Published Outputs" icon={LogOut}>
    <PropertyCell label="Available" span={4} hint="Published output values can be linked to other custom components and panel routes.">
      <div class="output-list">
        {#each outputEntries as [name, entry] (name)}
          <span>
            <strong>{entry.label || name}</strong>
            <em>{entry.channel}</em>
          </span>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>
{/if}

{#if !surfaceCount}
  <PropertySection title="Nothing exposed" icon={CircleOff}>
    <PropertyCell label="" span={4} hint="This component exposes no public inputs, outputs, or editable properties." compact>
      <div class="empty-state">No public controls exposed.</div>
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .contract-card,
  .source-card,
  .customized-card,
  .empty-state {
    width: 100%;
    min-height: 30px;
    border: 1px solid #33404A;
    border-radius: 5px;
    background: #151C21;
    color: #D8E2EA;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 7px;
    box-sizing: border-box;
    font-size: 11px;
  }

  .source-card {
    min-height: 58px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 3px;
    border-color: #2F573E;
    background: #141F18;
    color: #A9DCB8;
  }

  .source-card.changed {
    border-color: #665234;
    background: #211D15;
    color: #E8C08A;
  }

  .source-card strong,
  .source-card span,
  .source-card em,
  .source-card small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
  }

  .source-card strong {
    color: #F4F7FA;
  }

  .source-card span,
  .source-card em,
  .source-card small {
    color: inherit;
  }

  .source-card small {
    opacity: 0.78;
  }

  .contract-card strong {
    color: #F4F7FA;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .contract-card span,
  .customized-card span,
  .empty-state {
    color: #93A6B3;
  }

  .customized-card strong {
    color: #F0D48A;
  }

  .metric {
    width: 100%;
    min-height: 30px;
    border: 1px solid #353535;
    border-radius: 5px;
    background: #202020;
    color: #E6E6E6;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
  }

  .jump-btn {
    width: 100%;
    min-height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid #344E64;
    border-radius: 5px;
    background: #17242D;
    color: #D8E8F2;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
  }

  .jump-btn:hover:not(:disabled) {
    background: #20313B;
    border-color: #466B84;
  }

  .jump-btn:disabled {
    color: #6A6A6A;
    cursor: not-allowed;
  }

  .control-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .dirty-dot {
    width: 7px;
    height: 7px;
    min-width: 7px;
    border-radius: 50%;
    background: #D6B36C;
    box-shadow: 0 0 0 2px rgba(214, 179, 108, 0.12);
  }

  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }

  .file-input {
    max-width: 116px;
    min-width: 84px;
    color: #9BAAB4;
    font-size: 10px;
  }

  .icon-btn {
    width: 28px;
    height: 28px;
    min-width: 28px;
    border: 1px solid #38434A;
    border-radius: 5px;
    background: #181F23;
    color: #B8C7D0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .icon-btn:hover:not(:disabled) {
    border-color: #526776;
    background: #202A30;
    color: #E4EDF3;
  }

  .output-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    width: 100%;
  }

  .issue-list {
    width: 100%;
    display: grid;
    gap: 5px;
  }

  .issue-list span {
    min-width: 0;
    border: 1px solid #614437;
    border-radius: 5px;
    background: #201916;
    padding: 5px 6px;
    display: grid;
    gap: 2px;
  }

  .output-list span {
    max-width: 170px;
    border: 1px solid #344E64;
    border-radius: 5px;
    background: #10161A;
    padding: 4px 6px;
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .output-list strong,
  .output-list em,
  .issue-list strong,
  .issue-list em {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
  }

  .output-list strong {
    color: #F4F7FA;
    font-size: 10px;
  }

  .output-list em {
    color: #7F95A5;
    font-size: 9px;
  }

  .issue-list strong {
    color: #F0D0C0;
    font-size: 10px;
  }

  .issue-list em {
    color: #C0927C;
    font-size: 9px;
  }
</style>
