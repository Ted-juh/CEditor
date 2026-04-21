<script>
  import {
    MousePointer2,
    Move,
    ZoomIn,
    RectangleHorizontal,
    Type,
    SlidersHorizontal,
    ChevronDown,
    Square,
    LayoutGrid,
    Activity,
    AudioLines,
    PanelBottom,
    PanelRight,
    PanelLeftClose,
  } from 'lucide-svelte';

  let {
    showDisplayPanel = true,
    showPropertiesPanel = true,
    showTreePanel = true,
    onToggleDisplay = () => {},
    onToggleProperties = () => {},
    onToggleTree = () => {},
  } = $props();

  let activeTool = $state('select');

  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Select' },
    { id: 'move',   icon: Move,          label: 'Move' },
    { id: 'zoom',   icon: ZoomIn,        label: 'Zoom' },
  ];

  const components = [
    { id: 'button',   icon: RectangleHorizontal, label: 'Button' },
    { id: 'label',    icon: Type,                label: 'Label' },
    { id: 'range',    icon: SlidersHorizontal,   label: 'Range' },
    { id: 'slider',   icon: SlidersHorizontal,   label: 'Slider' },
    { id: 'combobox', icon: ChevronDown,         label: 'ComboBox' },
    { id: 'backdrop', icon: Square,              label: 'Backdrop' },
    { id: 'grid',     icon: LayoutGrid,          label: 'Grid' },
    { id: 'envelope', icon: Activity,            label: 'Envelope' },
    { id: 'filter',   icon: AudioLines,          label: 'Filter' },
  ];
</script>

<div class="icon-panel">
  <div class="tool-section">
    {#each tools as tool}
      <button
        class="icon-btn"
        class:active={activeTool === tool.id}
        title={tool.label}
        onclick={() => activeTool = tool.id}
      >
        <tool.icon size={18} strokeWidth={1.5} />
      </button>
    {/each}
  </div>

  <div class="separator"></div>

  <div class="component-section">
    {#each components as comp}
      <button
        class="icon-btn"
        title={comp.label}
      >
        <comp.icon size={18} strokeWidth={1.5} />
      </button>
    {/each}
  </div>

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

  .tool-section,
  .component-section,
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

  .icon-btn:hover {
    background: #3A3A3A;
    color: #DDD;
  }

  .icon-btn.active {
    background: #094771;
    color: #FFF;
  }
</style>
