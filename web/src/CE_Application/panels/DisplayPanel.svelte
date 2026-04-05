<script>
  /**
   * Display Panel — bottom dock with mini displays/tools.
   * Tabs for: Colors, Gradient, Notepad, Viewer, Tools, Console.
   */
  import ColorChooser from '../components/ColorChooser.svelte';
  import ColorSettings from '../components/ColorSettings.svelte';
  import GradientEditor from '../components/GradientEditor.svelte';
  import GradientSettings from '../components/GradientSettings.svelte';
  import GradientMiniPreview from '../components/GradientMiniPreview.svelte';
  import NotepadEditor from '../components/NotepadEditor.svelte';
  import NotepadSettings from '../components/NotepadSettings.svelte';
  import ViewerEditor from '../components/ViewerEditor.svelte';
  import ViewerSettings from '../components/ViewerSettings.svelte';
  import ConsolePanel from '../components/ConsolePanel.svelte';
  import AlignmentPanel from '../components/AlignmentPanel.svelte';
  import { activePanel, updatePanel } from '../stores/panels.js';
  import { colorTarget, applyColorToTarget, clearColorTarget } from '../stores/colorTarget.js';
  import { displayTabRequest } from '../stores/displayTab.js';

  let props = $props();
  let onTabChange = $derived(props.onTabChange);

  let activeTab = $state('colors');

  // --- External tab switch requests ---
  $effect(() => {
    const req = $displayTabRequest;
    if (req) {
      handleTabClick(req.tab);
      displayTabRequest.set(null);
    }
  });

  // --- Central color state ---
  let userPickedColor = $state($activePanel?.bgColour ?? '333333');
  let userPickedAlpha = $state(1);

  // --- Color target: switch to Colors tab and set color when a swatch activates a target ---
  // Plain variable (not $state) so it doesn't become a reactive dependency of the effect.
  let _lastHandledTarget = null;
  $effect(() => {
    const target = $colorTarget;
    if (target && target._initialColor && target !== _lastHandledTarget) {
      _lastHandledTarget = target;
      activeTab = 'colors';
      userPickedColor = target._initialColor;
      userPickedAlpha = target._initialAlpha ?? 1;
    }
    if (!target) {
      _lastHandledTarget = null;
    }
  });
  let stepSize = $state(10);

  // --- Shared swatches (used by both Colors and Gradient tabs) ---
  let swatches = $state(Array(24).fill(null));

  // --- Gradient state ---
  let gradientSelectedStop = $state(0);
  let gradientShape = $state('rectangle');
  let gradientSwatches = $state(Array(24).fill(null));

  const defaultGradient = {
    type: 'linear', angle: 90, centerX: 50, centerY: 50,
    radiusX: 50, radiusY: 50, edge: 0,
    stops: [{ color: 'FF0000', position: 0 }, { color: '0000FF', position: 100 }],
  };

  // THE gradient. This is the single source of truth for the UI.
  // Synced FROM store on panel switch. Written TO store on every change.
  let currentGradient = $state(JSON.parse(JSON.stringify(defaultGradient)));

  // --- Notepad state ---
  let notepadNotes = $state([{ name: 'Note 1', content: '' }]);
  let notepadActiveIndex = $state(0);
  let notepadEditorRef = $state(null);

  // --- Viewer state ---
  let viewerImages = $state([]);
  let viewerActiveIndex = $state(0);
  let viewerEditorRef = $state(null);
  let viewerStatus = $state('');
  let viewerHoverColor = $state(null);

  // Sync from store when active panel changes (panel switch)
  let lastPanelId = $state(null);
  $effect(() => {
    const panel = $activePanel;
    if (panel && panel.id !== lastPanelId) {
      lastPanelId = panel.id;
      currentGradient = panel.bgGradient ? JSON.parse(JSON.stringify(panel.bgGradient)) : JSON.parse(JSON.stringify(defaultGradient));
      // Sync notepad
      const np = panel.notepad;
      if (np) {
        notepadNotes = JSON.parse(JSON.stringify(np.notes));
        notepadActiveIndex = np.activeNoteIndex ?? 0;
      } else {
        notepadNotes = [{ name: 'Note 1', content: '' }];
        notepadActiveIndex = 0;
      }
      // Sync viewer
      const vw = panel.viewer;
      if (vw) {
        viewerImages = JSON.parse(JSON.stringify(vw.images));
        viewerActiveIndex = vw.activeImageIndex ?? 0;
      } else {
        viewerImages = [];
        viewerActiveIndex = 0;
      }
    }
  });

  // Stop color editing mode
  let editingGradientStop = $state(null);

  // Notepad color picking mode
  let pickingNotepadColor = $state(false);
  let savedNotepadSelection = $state(null);
  let notepadTextColor = $state('DDDDDD');

  // Live gradient for the mini-preview during stop color editing
  let liveGradient = $derived((() => {
    if (editingGradientStop === null) return currentGradient;
    const newStops = currentGradient.stops.map((s, i) =>
      i === editingGradientStop ? { ...s, color: userPickedColor } : s
    );
    return { ...currentGradient, stops: newStops };
  })());

  // --- Color change handler ---
  function handleColorChange(hex) {
    if (hex.length >= 8) {
      userPickedAlpha = parseInt(hex.slice(0, 2), 16) / 255;
      userPickedColor = hex.slice(2, 8);
    } else {
      userPickedAlpha = 1;
      userPickedColor = hex.slice(0, 6);
    }

    // If editing a gradient stop, update the stop color instead of panel bgColour
    if (editingGradientStop !== null) {
      // Don't write to store on every change — liveGradient handles the preview.
      // The store is committed on "back to gradient".
    } else if (pickingNotepadColor) {
      // Preview only — color is applied on "back to notepad".
    } else if ($colorTarget) {
      // External color target (swatch binding) — route to target
      applyColorToTarget(hex);
    } else {
      const panel = $activePanel;
      if (panel) {
        updatePanel(panel.id, { bgColour: userPickedColor, modified: true });
      }
    }
  }

  // --- Notepad change handler ---
  function handleNotepadChange(updatedNotes) {
    notepadNotes = updatedNotes;
    const panel = $activePanel;
    if (panel) {
      updatePanel(panel.id, {
        notepad: { notes: JSON.parse(JSON.stringify(updatedNotes)), activeNoteIndex: notepadActiveIndex },
        modified: true,
      });
    }
  }

  // --- Viewer change handler ---
  function handleViewerChange(updatedImages) {
    viewerImages = updatedImages;
    const panel = $activePanel;
    if (panel) {
      updatePanel(panel.id, {
        viewer: { images: JSON.parse(JSON.stringify(updatedImages)), activeImageIndex: viewerActiveIndex },
        modified: true,
      });
    }
  }

  // --- Viewer eyedropper: save picked color to first empty swatch ---
  function handleViewerColorPicked(hex) {
    const emptyIdx = swatches.findIndex(s => s === null);
    if (emptyIdx !== -1) {
      swatches[emptyIdx] = hex;
      viewerStatus = `#${hex} saved to swatch ${emptyIdx + 1}`;
    } else {
      viewerStatus = `#${hex} — no empty swatch (double-click one to clear)`;
    }
  }

  // --- Gradient change handler ---
  function handleGradientChange(newGradient) {
    currentGradient = newGradient;
    const panel = $activePanel;
    if (panel) {
      updatePanel(panel.id, { bgGradient: newGradient, modified: true });
    }
  }

  // --- Edit stop color: switch to Colors tab with split view ---
  function handleEditStopColor(stopIndex) {
    if (currentGradient.stops[stopIndex]) {
      editingGradientStop = stopIndex;
      userPickedColor = currentGradient.stops[stopIndex].color;
      userPickedAlpha = 1;
      activeTab = 'colors';
    }
  }

  // --- Commit edited stop color into currentGradient ---
  function commitStopColor() {
    if (editingGradientStop === null) return;
    const newStops = currentGradient.stops.map((s, i) =>
      i === editingGradientStop ? { ...s, color: userPickedColor } : s
    );
    currentGradient = { ...currentGradient, stops: newStops };
    // Persist to store
    const panel = $activePanel;
    if (panel) {
      updatePanel(panel.id, { bgGradient: currentGradient, modified: true });
    }
  }

  // --- Back from gradient stop editing ---
  function handleBackToGradient() {
    commitStopColor();
    const panel = $activePanel;
    if (panel) {
      userPickedColor = panel.bgColour;
      userPickedAlpha = 1;
    }
    editingGradientStop = null;
    activeTab = 'gradient';
    if (onTabChange) onTabChange('gradient');
  }

  // --- Pick color from Colors section for notepad text ---
  function handlePickNotepadColor() {
    // Save the current selection in the editor so we can restore & apply later
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedNotepadSelection = sel.getRangeAt(0).cloneRange();
    }
    pickingNotepadColor = true;
    activeTab = 'colors';
    if (onTabChange) onTabChange('colors');
  }

  // --- Back from color picking to notepad ---
  function handleBackToNotepad() {
    const pickedColor = userPickedColor;
    notepadTextColor = pickedColor;
    const range = savedNotepadSelection;
    savedNotepadSelection = null;

    // Restore color chooser to panel bgColour
    const panel = $activePanel;
    if (panel) {
      userPickedColor = panel.bgColour;
      userPickedAlpha = 1;
    }
    pickingNotepadColor = false;
    activeTab = 'notepad';
    if (onTabChange) onTabChange('notepad');

    // Apply foreColor after the tab is visible
    requestAnimationFrame(() => {
      const el = notepadEditorRef?.getEditorElement?.();
      if (el && range) {
        el.focus();
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('foreColor', false, '#' + pickedColor);
      }
    });
  }

  // --- Tab change: clear editing mode if leaving colors ---
  function handleTabClick(tabId) {
    if (editingGradientStop !== null && tabId !== 'colors') {
      commitStopColor();
      editingGradientStop = null;
      const panel = $activePanel;
      if (panel) {
        userPickedColor = panel.bgColour;
        userPickedAlpha = 1;
      }
    }
    if (pickingNotepadColor && tabId !== 'colors') {
      // Leaving colors without going back — discard
      savedNotepadSelection = null;
      pickingNotepadColor = false;
      const panel = $activePanel;
      if (panel) {
        userPickedColor = panel.bgColour;
        userPickedAlpha = 1;
      }
    }
    // Clear color target when leaving colors tab
    if ($colorTarget && tabId !== 'colors') {
      clearColorTarget();
      const panel = $activePanel;
      if (panel) {
        userPickedColor = panel.bgColour;
        userPickedAlpha = 1;
      }
    }
    activeTab = tabId;
    if (onTabChange) onTabChange(tabId);
  }

  // --- Swatch handlers (shared) ---
  function handleSwatchClick(index) {
    if (swatches[index]) {
      handleColorChange('FF' + swatches[index]);
    } else {
      swatches[index] = userPickedColor;
    }
  }

  function handleSwatchDblClick(index) {
    swatches[index] = null;
  }

  function handleSwatchRightClick(index, e) {
    e.preventDefault();
    swatches[index] = userPickedColor;
  }

  // --- Gradient swatch handler (assigns color to selected stop) ---
  function handleGradientSwatchClick(index) {
    const grad = currentGradient;
    const panel = $activePanel;
    if (swatches[index]) {
      if (panel) {
        const newStops = grad.stops.map((s, i) =>
          i === gradientSelectedStop ? { ...s, color: swatches[index] } : s
        );
        updatePanel(panel.id, { bgGradient: { ...grad, stops: newStops }, modified: true });
      }
    } else {
      if (grad.stops[gradientSelectedStop]) {
        swatches[index] = grad.stops[gradientSelectedStop].color;
      }
    }
  }

  // --- Notepad swatch handler (apply color as text foreColor, or store) ---
  function handleNotepadSwatchClick(index) {
    if (swatches[index]) {
      notepadTextColor = swatches[index];
      const el = notepadEditorRef?.getEditorElement?.();
      if (el) {
        el.focus();
        document.execCommand('foreColor', false, '#' + swatches[index]);
      }
    } else {
      swatches[index] = notepadTextColor;
    }
  }

  // --- Gradient preset swatch handlers (store/load entire gradients) ---
  function handleGradientPresetClick(index) {
    if (gradientSwatches[index]) {
      // Load: apply stored gradient
      currentGradient = JSON.parse(JSON.stringify(gradientSwatches[index]));
      handleGradientChange(currentGradient);
    } else {
      // Store: save current gradient
      gradientSwatches[index] = JSON.parse(JSON.stringify(currentGradient));
    }
  }

  function handleGradientPresetDblClick(index) {
    gradientSwatches[index] = null;
  }

  function handleGradientPresetRightClick(index, e) {
    e.preventDefault();
    gradientSwatches[index] = JSON.parse(JSON.stringify(currentGradient));
  }

  const tabs = [
    { id: 'colors',   label: 'Colors' },
    { id: 'gradient', label: 'Gradient' },
    { id: 'notepad',  label: 'Notepad' },
    { id: 'viewer',   label: 'Viewer' },
    { id: 'align',    label: 'Align' },
    { id: 'console',  label: 'Console' },
  ];
</script>

<div class="display-panel">
  <div class="tab-bar">
    {#each tabs as tab}
      <button
        class="tab"
        class:active={activeTab === tab.id}
        onclick={() => handleTabClick(tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <div class="tab-content">
    <div class="tab-pane" style:display={activeTab === 'colors' ? 'block' : 'none'}>
      <div class="colors-layout">
        <div class="colors-preview" class:split={editingGradientStop !== null || pickingNotepadColor}>
          <ColorChooser
            color={userPickedColor}
            alpha={userPickedAlpha}
            {stepSize}
            onchange={handleColorChange}
          />
        </div>
        {#if editingGradientStop !== null && currentGradient}
          <div class="gradient-mini">
            <GradientMiniPreview
              gradient={liveGradient}
              shape={gradientShape}
              onBack={handleBackToGradient}
            />
          </div>
        {/if}
        {#if pickingNotepadColor}
          <div class="notepad-color-mini">
            <div class="notepad-color-preview" style="background: #{userPickedColor}"></div>
            <div class="notepad-color-hex">#{userPickedColor}</div>
            <button class="notepad-color-back" onclick={handleBackToNotepad}>
              Back to Notepad
            </button>
          </div>
        {/if}
        <div class="colors-sidebar">
          <div class="sidebar-settings">
            <ColorSettings
              color={userPickedColor}
              alpha={userPickedAlpha}
              bind:stepSize={stepSize}
              onApplyColor={handleColorChange}
            />
          </div>
          <div class="sidebar-swatches">
            <div class="swatches-label">Colors</div>
            <div class="swatches-grid">
              {#each swatches as swatch, i}
                <button
                  class="swatch"
                  class:empty={!swatch}
                  style={swatch ? `background: #${swatch}` : ''}
                  onclick={() => handleSwatchClick(i)}
                  ondblclick={() => handleSwatchDblClick(i)}
                  oncontextmenu={(e) => handleSwatchRightClick(i, e)}
                  title={swatch ? `#${swatch} — right-click to replace, double-click to clear` : 'Click to store current color'}
                ></button>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="tab-pane" style:display={activeTab === 'gradient' ? 'block' : 'none'}>
      <div class="gradient-layout">
        <div class="gradient-preview">
          <GradientEditor
            gradient={currentGradient}
            selectedStop={gradientSelectedStop}
            shape={gradientShape}
            onchange={handleGradientChange}
            onSelectStop={(i) => gradientSelectedStop = i}
          />
        </div>
        <div class="gradient-sidebar">
          <div class="sidebar-settings">
            <GradientSettings
              gradient={currentGradient}
              selectedStop={gradientSelectedStop}
              shape={gradientShape}
              onchange={handleGradientChange}
              onSelectStop={(i) => gradientSelectedStop = i}
              onEditStopColor={handleEditStopColor}
              onShapeChange={(s) => gradientShape = s}
              gradientSwatches={gradientSwatches}
              onGradientPresetClick={handleGradientPresetClick}
              onGradientPresetDblClick={handleGradientPresetDblClick}
              onGradientPresetRightClick={handleGradientPresetRightClick}
            />
          </div>
          <div class="sidebar-swatches">
            <div class="swatches-label">Colors</div>
            <div class="swatches-grid">
              {#each swatches as swatch, i}
                <button
                  class="swatch"
                  class:empty={!swatch}
                  style={swatch ? `background: #${swatch}` : ''}
                  onclick={() => handleGradientSwatchClick(i)}
                  ondblclick={() => handleSwatchDblClick(i)}
                  oncontextmenu={(e) => handleSwatchRightClick(i, e)}
                  title={swatch ? `#${swatch} — click to assign to selected stop` : 'Click to store stop color'}
                ></button>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="tab-pane" style:display={activeTab === 'notepad' ? 'block' : 'none'}>
      {#if $activePanel}
        <div class="notepad-layout">
          <div class="notepad-editor-area">
            <NotepadEditor
              bind:notes={notepadNotes}
              bind:activeNoteIndex={notepadActiveIndex}
              onchange={handleNotepadChange}
              bind:this={notepadEditorRef}
            />
          </div>
          <div class="notepad-sidebar">
            <div class="sidebar-settings">
              <NotepadSettings
                getEditorElement={() => notepadEditorRef?.getEditorElement?.()}
                onPickColor={handlePickNotepadColor}
              />
            </div>
            <div class="sidebar-swatches">
              <div class="swatches-label">Colors</div>
              <div class="swatches-grid">
                {#each swatches as swatch, i}
                  <button
                    class="swatch"
                    class:empty={!swatch}
                    style={swatch ? `background: #${swatch}` : ''}
                    onclick={() => handleNotepadSwatchClick(i)}
                    ondblclick={() => handleSwatchDblClick(i)}
                    oncontextmenu={(e) => handleSwatchRightClick(i, e)}
                    title={swatch ? `#${swatch} — click to apply as text color` : 'Click to store current color'}
                  ></button>
                {/each}
              </div>
            </div>
          </div>
        </div>
      {:else}
        <div class="placeholder">Open or create a panel to use the Notepad</div>
      {/if}
    </div>
    <div class="tab-pane" style:display={activeTab === 'viewer' ? 'block' : 'none'}>
      {#if $activePanel}
        <div class="viewer-layout">
          <div class="viewer-canvas-area">
            <ViewerEditor
              bind:images={viewerImages}
              bind:activeImageIndex={viewerActiveIndex}
              onchange={handleViewerChange}
              onColorPicked={handleViewerColorPicked}
              onColorHover={(hex) => viewerHoverColor = hex}
              bind:this={viewerEditorRef}
            />
          </div>
          <div class="viewer-sidebar">
            <div class="sidebar-settings">
              <ViewerSettings
                getViewerRef={() => viewerEditorRef}
                statusMessage={viewerStatus}
                hoverColor={viewerHoverColor}
              />
            </div>
          </div>
        </div>
      {:else}
        <div class="placeholder">Open or create a panel to use the Viewer</div>
      {/if}
    </div>
    <div class="tab-pane" style:display={activeTab === 'align' ? 'block' : 'none'}>
      <AlignmentPanel />
    </div>
    <div class="tab-pane" style:display={activeTab === 'console' ? 'block' : 'none'}>
      <ConsolePanel />
    </div>
  </div>
</div>

<style>
  .display-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1E1E1E;
  }

  .tab-bar {
    display: flex;
    gap: 1px;
    background: #1A1A1A;
    padding: 0 4px;
    flex-shrink: 0;
  }

  .tab {
    background: #252525;
    border: none;
    color: #888;
    font-size: 10px;
    padding: 4px 10px;
    cursor: pointer;
    border-top: 2px solid transparent;
    font-family: inherit;
    transition: all 0.1s;
  }

  .tab:hover {
    color: #CCC;
    background: #2A2A2A;
  }

  .tab.active {
    color: #DDD;
    background: #2D2D2D;
    border-top-color: #5B9BD5;
  }

  .tab-content {
    flex: 1;
    overflow: auto;
  }

  .tab-pane {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  /* Colors layout */
  .colors-layout {
    display: flex;
    height: 100%;
  }

  .colors-preview {
    width: 75%;
    flex-shrink: 0;
    border-right: 1px solid #333;
    transition: width 0.15s;
  }

  .colors-preview.split {
    width: 50%;
  }

  .gradient-mini {
    width: 25%;
    flex-shrink: 0;
    border-right: 1px solid #333;
  }

  .colors-sidebar {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Gradient layout (mirrors colors layout) */
  .gradient-layout {
    display: flex;
    height: 100%;
  }

  .gradient-preview {
    width: 75%;
    flex-shrink: 0;
    border-right: 1px solid #333;
  }

  .gradient-sidebar {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Notepad layout */
  .notepad-layout {
    display: flex;
    height: 100%;
  }

  .notepad-editor-area {
    width: 75%;
    flex-shrink: 0;
    border-right: 1px solid #333;
  }

  .notepad-sidebar {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Viewer layout */
  .viewer-layout {
    display: flex;
    height: 100%;
  }

  .viewer-canvas-area {
    width: 80%;
    flex-shrink: 0;
    border-right: 1px solid #333;
  }

  .viewer-sidebar {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Notepad color picker mini-panel (shown in Colors tab) */
  .notepad-color-mini {
    width: 25%;
    flex-shrink: 0;
    border-right: 1px solid #333;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
    background: #1E1E1E;
  }

  .notepad-color-preview {
    width: 48px;
    height: 48px;
    border-radius: 4px;
    border: 1px solid #555;
  }

  .notepad-color-hex {
    font-size: 10px;
    color: #888;
    font-family: monospace;
  }

  .notepad-color-back {
    background: #252525;
    border: 1px solid #5B9BD5;
    color: #DDD;
    font-size: 10px;
    padding: 4px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
  }
  .notepad-color-back:hover {
    background: #094771;
    color: #FFF;
  }

  /* Shared */
  .sidebar-settings {
    flex: 3;
    overflow: auto;
  }

  .sidebar-swatches {
    flex: 1;
    border-top: 1px solid #333;
    padding: 4px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }

  .swatches-label {
    font-size: 9px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .swatches-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 2px;
    width: 100%;
  }

  .swatch {
    aspect-ratio: 1;
    border: 1px solid #333;
    border-radius: 2px;
    cursor: pointer;
    padding: 0;
    min-width: 0;
    transition: border-color 0.1s;
  }

  .swatch:hover {
    border-color: #5B9BD5;
  }

  .swatch.empty {
    background: #333;
    border-style: dashed;
  }

  .swatch.empty:hover {
    border-color: #5B9BD5;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #444;
    font-size: 12px;
  }
</style>
