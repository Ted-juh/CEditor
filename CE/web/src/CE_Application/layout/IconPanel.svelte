<script>
  import {
    BadgeCheck,
    CircleDot,
    Container,
    RectangleHorizontal,
    RefreshCw,
    SlidersHorizontal,
    SlidersVertical,
    Square,
    ListCollapse,
    TimerReset,
    ToggleLeft,
    Type,
    PanelBottom,
    PanelRight,
    PanelLeftClose,
  } from 'lucide-svelte';
  import { addControl } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';

  let {
    showDisplayPanel = true,
    showPropertiesPanel = true,
    showTreePanel = true,
    onToggleDisplay = () => {},
    onToggleProperties = () => {},
    onToggleTree = () => {},
  } = $props();

  let hasActivePanel = $derived(!!$activePanel);

  const insertGroups = [
    [
      { type: 'Background',      icon: Square,             label: 'Insert Background' },
      { type: 'Label',           icon: Type,               label: 'Insert Label' },
      { type: 'Container',       icon: Container,          label: 'Insert Container' },
    ],
    [
      { type: 'MomentaryButton', icon: RectangleHorizontal, label: 'Insert Momentary Button' },
      { type: 'ToggleButton',    icon: ToggleLeft,          label: 'Insert Toggle Button' },
      { type: 'RadioButtonGroup', icon: CircleDot,          label: 'Insert Radio Button Group' },
      { type: 'CyclicButton',    icon: RefreshCw,           label: 'Insert Cyclic Button' },
      { type: 'Combobox',        icon: ListCollapse,        label: 'Insert Combobox' },
      { type: 'TimedButton',     icon: TimerReset,          label: 'Insert Timed Button' },
      { type: 'OneShotButton',   icon: BadgeCheck,          label: 'Insert One-Shot Button' },
    ],
    [
      { type: 'Range',           icon: SlidersHorizontal,   label: 'Insert Range' },
      { type: 'Slider',          icon: SlidersVertical,     label: 'Insert Slider' },
    ],
  ];

  function handleInsert(type) {
    if (!hasActivePanel) return;
    addControl(type);
  }
</script>

<div class="icon-panel">
  {#each insertGroups as group, groupIndex}
    <div class="insert-section">
      {#each group as component}
        <button
          class="icon-btn"
          title={hasActivePanel ? component.label : `${component.label} (open a panel first)`}
          onclick={() => handleInsert(component.type)}
          disabled={!hasActivePanel}
        >
          <component.icon size={18} strokeWidth={1.5} />
        </button>
      {/each}
    </div>

    {#if groupIndex < insertGroups.length - 1}
      <div class="separator"></div>
    {/if}
  {/each}

  <div class="spacer"></div>

  <div class="separator"></div>

  <div class="panel-toggles">
    <button
      class="icon-btn"
      class:active={showDisplayPanel}
      title="Toggle Display Panel"
      onclick={onToggleDisplay}
    >
      <PanelBottom size={18} strokeWidth={1.5} />
    </button>
    <button
      class="icon-btn"
      class:active={showTreePanel}
      title="Toggle Component Tree"
      onclick={onToggleTree}
    >
      <PanelLeftClose size={18} strokeWidth={1.5} />
    </button>
    <button
      class="icon-btn"
      class:active={showPropertiesPanel}
      title="Toggle Properties Panel"
      onclick={onToggleProperties}
    >
      <PanelRight size={18} strokeWidth={1.5} />
    </button>
  </div>
</div>

<style>
  .icon-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    background: #252525;
    border-right: 1px solid #1A1A1A;
    padding: 34px 0 6px 0;
    gap: 2px;
    overflow-y: auto;
  }

  .insert-section,
  .panel-toggles {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 100%;
    padding: 0 4px;
  }

  .spacer {
    flex: 1;
  }

  .separator {
    width: 28px;
    height: 1px;
    background: #444;
    margin: 6px 0;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #999;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.1s;
  }

  .icon-btn:hover:not(:disabled) {
    background: #3A3A3A;
    color: #DDD;
  }

  .icon-btn.active {
    background: #094771;
    color: #FFF;
  }

  .icon-btn:disabled {
    color: #4E4E4E;
    cursor: not-allowed;
  }
</style>
