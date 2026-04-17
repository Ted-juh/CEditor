<script>
  import { activePanel } from '../stores/panels.js';
  import PresetFooter from '../properties/PresetFooter.svelte';
  import { getPresetScopeOptions } from '../utils/presetScopes.js';

  let { contextMode = 'panel', tabId = '', control = null } = $props();

  let panel = $derived($activePanel);
</script>

{#if contextMode === 'panel' && tabId === 'background'}
  <PresetFooter
    domain="panel:background"
    mode="panel"
    {panel}
    scopeOptions={getPresetScopeOptions('panel:background')}
  />
{:else if contextMode === 'panel' && tabId === 'grid'}
  <PresetFooter
    domain="panel:grid"
    mode="panel"
    {panel}
    scopeOptions={getPresetScopeOptions('panel:grid')}
  />
{:else if contextMode === 'component' && tabId === 'background'}
  <PresetFooter
    domain="component:background"
    mode="component"
    {control}
    scopeOptions={getPresetScopeOptions('component:background')}
  />
{:else if contextMode === 'component' && tabId === 'border'}
  <PresetFooter
    domain="component:border"
    mode="component"
    {control}
    scopeOptions={getPresetScopeOptions('component:border')}
  />
{:else if contextMode === 'component' && tabId === 'text'}
  <PresetFooter
    domain="component:text"
    mode="component"
    {control}
    scopeOptions={getPresetScopeOptions('component:text')}
  />
{:else if contextMode === 'component' && tabId === 'icon'}
  <PresetFooter
    domain="component:icon"
    mode="component"
    {control}
    scopeOptions={getPresetScopeOptions('component:icon')}
  />
{:else if contextMode === 'component' && tabId === 'effects'}
  <PresetFooter
    domain="component:effects"
    mode="component"
    {control}
    scopeOptions={getPresetScopeOptions('component:effects')}
  />
{/if}
