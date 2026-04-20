<script>
  import { Cog, Image, Type } from 'lucide-svelte';
  import GeneralSettings from '../settings/GeneralSettings.svelte';
  import FontsSettings from '../settings/FontsSettings.svelte';
  import IconsSettings from '../settings/IconsSettings.svelte';

  const sections = [
    { id: 'general', label: 'General', icon: Cog, available: true },
    { id: 'fonts', label: 'Fonts', icon: Type, available: true },
    { id: 'icons', label: 'Icons', icon: Image, available: true },
  ];

  let activeSection = $state('general');
</script>

<div class="settings-view">
  <aside class="settings-sidebar">
    <div class="sidebar-title">Settings</div>
    {#each sections as section}
      <button
        class="sidebar-item"
        class:active={activeSection === section.id}
        class:disabled={!section.available}
        onclick={() => section.available && (activeSection = section.id)}
      >
        <section.icon size={15} strokeWidth={1.7} />
        <span>{section.label}</span>
        {#if !section.available}
          <small>Soon</small>
        {/if}
      </button>
    {/each}
  </aside>

  <main class="settings-content">
    {#if activeSection === 'general'}
      <GeneralSettings />
    {:else if activeSection === 'fonts'}
      <FontsSettings />
    {:else if activeSection === 'icons'}
      <IconsSettings />
    {:else}
      <div class="placeholder">
        <span>That settings section is not wired yet.</span>
      </div>
    {/if}
  </main>
</div>

<style>
  .settings-view {
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: 220px 1fr;
    overflow: hidden;
    background:
      radial-gradient(circle at top right, rgba(91, 155, 213, 0.14), transparent 28%),
      linear-gradient(180deg, #1A1A1A 0%, #151515 100%);
  }

  .settings-sidebar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 18px 14px;
    border-right: 1px solid #2E2E2E;
    background: rgba(24, 24, 24, 0.92);
  }

  .sidebar-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #7C7C7C;
    padding: 4px 8px 10px;
  }

  .sidebar-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 38px;
    padding: 0 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 9px;
    color: #CFCFCF;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    text-align: left;
  }

  .sidebar-item:hover:not(.disabled) {
    background: #232323;
    border-color: #343434;
  }

  .sidebar-item.active {
    background: #094771;
    border-color: #0B6EB5;
    color: #FFF;
  }

  .sidebar-item.disabled {
    opacity: 0.5;
    cursor: default;
  }

  .sidebar-item small {
    margin-left: auto;
    font-size: 10px;
    color: inherit;
    opacity: 0.7;
  }

  .settings-content {
    overflow: auto;
  }

  .placeholder {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #676767;
    font-size: 13px;
  }
</style>
