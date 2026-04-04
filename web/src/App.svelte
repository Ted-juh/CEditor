<script>
  import MenuBar from './CE_Application/layout/MenuBar.svelte';
  import IconPanel from './CE_Application/layout/IconPanel.svelte';
  import EditorCanvas from './CE_Application/editor/EditorCanvas.svelte';
  import CommonPropertyBar from './CE_Application/layout/CommonPropertyBar.svelte';
  import ZoomBar from './CE_Application/layout/ZoomBar.svelte';
  import DisplayPanel from './CE_Application/panels/DisplayPanel.svelte';
  import PropertiesPanel from './CE_Application/panels/PropertiesPanel.svelte';
  import StatusBar from './CE_Application/layout/StatusBar.svelte';
  import { initPanelBridge } from './CE_Application/stores/panels.js';
  import { initConsoleBridge } from './CE_Application/stores/console.js';

  initPanelBridge();
  initConsoleBridge();

  let propertiesPanelWidth = $state(280);
  let isResizingProps = $state(false);
  let displayPanelHeight = $state(480);
  let isResizingDisplay = $state(false);
  let showDisplayPanel = $state(true);
  let showPropertiesPanel = $state(true);
  const tabDefaultHeights = { colors: 480, gradient: 580 };

  function handleDisplayTabChange(tabId) {
    const target = tabDefaultHeights[tabId];
    if (target) displayPanelHeight = target;
  }

  function startPropsResize(e) {
    isResizingProps = true;
    const startX = e.clientX;
    const startWidth = propertiesPanelWidth;

    function onMouseMove(e) {
      const delta = startX - e.clientX;
      propertiesPanelWidth = Math.max(220, Math.min(500, startWidth + delta));
    }

    function onMouseUp() {
      isResizingProps = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function startDisplayResize(e) {
    isResizingDisplay = true;
    const startY = e.clientY;
    const startHeight = displayPanelHeight;

    function onMouseMove(e) {
      const delta = startY - e.clientY;
      displayPanelHeight = Math.max(80, Math.min(900, startHeight + delta));
    }

    function onMouseUp() {
      isResizingDisplay = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
</script>

<div class="app" style="--props-width: {showPropertiesPanel ? propertiesPanelWidth + 'px' : '0px'}; --resize-width: {showPropertiesPanel ? '8px' : '0px'}">
  <div class="menubar-area">
    <MenuBar />
  </div>

  <div class="icon-panel-area">
    <IconPanel
      {showDisplayPanel}
      {showPropertiesPanel}
      onToggleDisplay={() => showDisplayPanel = !showDisplayPanel}
      onToggleProperties={() => showPropertiesPanel = !showPropertiesPanel}
    />
  </div>

  <div class="center-area">
    <div class="editor-canvas-area">
      <EditorCanvas />
    </div>
    <div class="common-bar-area">
      <CommonPropertyBar />
    </div>
    <div class="zoom-bar-area">
      <ZoomBar />
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="display-resize-handle" class:active={isResizingDisplay} onmousedown={startDisplayResize} style="display: {showDisplayPanel ? 'block' : 'none'}"></div>
    <div class="display-panel-area" style="flex: 0 0 {displayPanelHeight}px; display: {showDisplayPanel ? 'block' : 'none'}">
      <DisplayPanel onTabChange={handleDisplayTabChange} />
    </div>
  </div>

  {#if showPropertiesPanel}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resize-handle" class:active={isResizingProps} onmousedown={startPropsResize}></div>

    <div class="properties-area">
      <PropertiesPanel width={propertiesPanelWidth} />
    </div>
  {/if}

  <div class="statusbar-area">
    <StatusBar />
  </div>
</div>

<style>
  .app {
    width: 100vw;
    height: 100vh;
    display: grid;
    grid-template-columns: 48px 1fr var(--resize-width) var(--props-width);
    grid-template-rows: 28px 1fr 24px;
    grid-template-areas:
      "icon    menu    menu    menu"
      "icon    center  resize  props"
      "status  status  status  status";
    overflow: hidden;
    background: #1E1E1E;
    user-select: none;
  }

  .menubar-area    { grid-area: menu; }
  .icon-panel-area { grid-area: icon; }
  .center-area     { grid-area: center; display: flex; flex-direction: column; overflow: hidden; }
  .properties-area { grid-area: props; overflow: hidden; }
  .statusbar-area  { grid-area: status; }

  .resize-handle {
    grid-area: resize;
    cursor: col-resize;
    background: transparent;
    transition: background 0.15s;
  }
  .resize-handle:hover,
  .resize-handle.active {
    background: #5B9BD5;
  }

  .display-resize-handle {
    flex: 0 0 8px;
    cursor: row-resize;
    background: transparent;
    transition: background 0.15s;
  }
  .display-resize-handle:hover,
  .display-resize-handle.active {
    background: #5B9BD5;
  }

  .editor-canvas-area {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .common-bar-area {
    flex: 0 0 32px;
    border-top: 1px solid #333;
  }
  .zoom-bar-area {
    flex: 0 0 24px;
    border-top: 1px solid #2A2A2A;
  }
  .display-panel-area {
    border-top: 1px solid #333;
    overflow: hidden;
  }
</style>
