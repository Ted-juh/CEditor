<script>
  /**
   * Display Panel — bottom dock with mini displays/tools.
   * Tabs for: Colors, Gradient, Notepad, Viewer, Tools, Console.
   */
  import ColorChooser from '../components/ColorChooser.svelte';
  import ColorSettings from '../components/ColorSettings.svelte';
  import GradientMiniPreview from '../components/GradientMiniPreview.svelte';
  import ConsolePanel from '../components/ConsolePanel.svelte';
  import AlignmentPanel from '../components/AlignmentPanel.svelte';
  import SwatchGrid from '../components/SwatchGrid.svelte';
  import ViewerTab from './ViewerTab.svelte';
  import NotepadTab from './NotepadTab.svelte';
  import GradientTab from './GradientTab.svelte';
  import { activePanel, updatePanel } from '../stores/panels.js';
  import { colorTarget, applyColorToTarget, clearColorTarget } from '../stores/colorTarget.js';
  import { gradientTarget, applyGradientToTarget, clearGradientTarget } from '../stores/gradientTarget.js';
  import { displayTabRequest } from '../stores/displayTab.js';
  import { deepClone } from '../utils/deepClone.js';
  import { syncExternalTarget } from '../utils/targetSync.js';

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
  const colorTargetGuard = { current: null };
  $effect(() => {
    syncExternalTarget($colorTarget, colorTargetGuard, (t) => !!t._initialColor, (t) => {
      activeTab = 'colors';
      userPickedColor = t._initialColor;
      userPickedAlpha = t._initialAlpha ?? 1;
    });
  });
  let stepSize = $state(10);

  // --- Shared swatches (used by Colors / Gradient / Notepad tabs) ---
  let swatches = $state(Array(24).fill(null));

  const defaultGradient = {
    type: 'linear', angle: 90, centerX: 50, centerY: 50,
    radiusX: 50, radiusY: 50, edge: 0,
    stops: [{ color: 'FF0000', position: 0 }, { color: '0000FF', position: 100 }],
  };

  // THE gradient. This is the single source of truth for the UI.
  // Synced FROM store on panel switch. Written TO store on every change.
  // Lives here rather than inside GradientTab because the Colors-tab stop
  // editing flow (liveGradient mini-preview) also reads it.
  let currentGradient = $state(deepClone(defaultGradient));

  // Bumped whenever the active panel changes — child tabs watch this as
  // their reset signal so they can re-sync from the new active panel.
  let panelResetKey = $state(0);

  // Ref to the notepad tab so the cross-tab "back from color pick" flow
  // can call `applyTextColor(hex, range)` on it.
  let notepadTabRef = $state(null);

  // Sync from store when active panel changes (panel switch)
  let lastPanelId = $state(null);
  $effect(() => {
    const panel = $activePanel;
    if (panel && panel.id !== lastPanelId) {
      lastPanelId = panel.id;
      currentGradient = panel.bgGradient ? deepClone(panel.bgGradient) : deepClone(defaultGradient);
      panelResetKey++;
    }
  });

  // --- Gradient target: sync from external control gradient ---
  const gradTargetGuard = { current: null };
  $effect(() => {
    syncExternalTarget($gradientTarget, gradTargetGuard, (t) => !!t._initialGradient, (t) => {
      currentGradient = deepClone(t._initialGradient);
      activeTab = 'gradient';
      onTabChange?.('gradient');
    });
  });

  // Stop color editing mode
  let editingGradientStop = $state(null);

  // Notepad color picking mode (cross-tab flow: pick color on Colors tab,
  // then apply as text foreColor in the notepad editor).
  let pickingNotepadColor = $state(false);
  let savedNotepadSelection = $state(null);

  // Live gradient for the mini-preview during stop color editing
  let liveGradient = $derived((() => {
    if (editingGradientStop === null) return currentGradient;
    const newStops = currentGradient.stops.map((s, i) =>
      i === editingGradientStop ? { ...s, color: userPickedColor } : s
    );
    return { ...currentGradient, stops: newStops };
  })());

  // --- Color change handler ---
  // Routes a new color to the right destination based on current editing
  // mode. Gradient-stop and notepad-pick modes defer the write (their
  // "back" buttons commit); target and default modes write immediately.
  function handleColorChange(hex) {
    if (hex.length >= 8) {
      userPickedAlpha = parseInt(hex.slice(0, 2), 16) / 255;
      userPickedColor = hex.slice(2, 8);
    } else {
      userPickedAlpha = 1;
      userPickedColor = hex.slice(0, 6);
    }

    // Deferred modes — preview only, commit happens on "back to X"
    if (editingGradientStop !== null || pickingNotepadColor) return;

    // External color target (swatch binding) — route to target
    if ($colorTarget) { applyColorToTarget(hex); return; }

    // Default — write to panel bgColour
    const panel = $activePanel;
    if (panel) updatePanel(panel.id, { bgColour: userPickedColor, modified: true });
  }

  // --- Viewer eyedropper: save picked color to first empty swatch ---
  // Called from ViewerTab's eyedropper. Returns a status message for the
  // child to display, since the swatch array lives here.
  function handleViewerColorPicked(hex) {
    const emptyIdx = swatches.findIndex(s => s === null);
    if (emptyIdx !== -1) {
      swatches[emptyIdx] = hex;
      return `#${hex} saved to swatch ${emptyIdx + 1}`;
    }
    return `#${hex} — no empty swatch (double-click one to clear)`;
  }

  // --- Gradient change handler ---
  function handleGradientChange(newGradient) {
    currentGradient = newGradient;
    // Route to gradient target if active (e.g. border gradient)
    if ($gradientTarget && applyGradientToTarget(newGradient)) return;
    // Default: write to panel bgGradient
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
    // Route to gradient target if active
    if ($gradientTarget && applyGradientToTarget(currentGradient)) return;
    // Default: persist to panel store
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
    const range = savedNotepadSelection;
    savedNotepadSelection = null;

    // Restore color chooser to panel bgColour
    resetUserColor();
    pickingNotepadColor = false;
    activeTab = 'notepad';
    onTabChange?.('notepad');

    // Apply foreColor after the tab is visible — NotepadTab handles the
    // focus, selection restore, and execCommand internally.
    notepadTabRef?.applyTextColor(pickedColor, range);
  }

  // --- Tab change: commit/discard any in-flight editing mode ---
  // Each "mode" (editing a gradient stop, picking notepad color, an active
  // color/gradient target) is active only while its home tab is visible.
  // Leaving that tab must either commit or clear the mode and restore the
  // chooser/gradient to the panel defaults.
  function resetUserColor() {
    const p = $activePanel;
    if (p) { userPickedColor = p.bgColour; userPickedAlpha = 1; }
  }

  function resetGradientFromPanel() {
    const p = $activePanel;
    if (p) {
      currentGradient = p.bgGradient
        ? deepClone(p.bgGradient)
        : deepClone(defaultGradient);
    }
  }

  function handleTabClick(tabId) {
    if (tabId !== 'colors') {
      if (editingGradientStop !== null) {
        commitStopColor();
        editingGradientStop = null;
        resetUserColor();
      }
      if (pickingNotepadColor) {
        // Leaving colors without going back — discard the pick
        savedNotepadSelection = null;
        pickingNotepadColor = false;
        resetUserColor();
      }
      if ($colorTarget) {
        clearColorTarget();
        resetUserColor();
      }
    }
    if (tabId !== 'gradient' && $gradientTarget) {
      clearGradientTarget();
      resetGradientFromPanel();
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

  const tabs = [
    { id: 'colors',   label: 'Colors' },
    { id: 'gradient', label: 'Gradient' },
    { id: 'effects',  label: 'Effects' },
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
          <SwatchGrid
            {swatches}
            onclick={handleSwatchClick}
            ondblclick={handleSwatchDblClick}
            oncontextmenu={handleSwatchRightClick}
          />
        </div>
      </div>
    </div>

    <div class="tab-pane" style:display={activeTab === 'gradient' ? 'block' : 'none'}>
      <GradientTab
        gradient={currentGradient}
        {swatches}
        onchange={handleGradientChange}
        oneditstopcolor={handleEditStopColor}
        onswatchdblclick={handleSwatchDblClick}
        onswatchrightclick={handleSwatchRightClick}
      />
    </div>

    <div class="tab-pane" style:display={activeTab === 'notepad' ? 'block' : 'none'}>
      <NotepadTab
        {swatches}
        resetKey={panelResetKey}
        bind:this={notepadTabRef}
        onswatchstore={(i, color) => swatches[i] = color}
        onswatchdblclick={handleSwatchDblClick}
        onswatchrightclick={handleSwatchRightClick}
        onpickcolor={handlePickNotepadColor}
      />
    </div>
    <div class="tab-pane" style:display={activeTab === 'viewer' ? 'block' : 'none'}>
      <ViewerTab resetKey={panelResetKey} oncolorpicked={handleViewerColorPicked} />
    </div>
    <div class="tab-pane" style:display={activeTab === 'effects' ? 'block' : 'none'}>
      <div class="placeholder">Effects editor — full editing coming soon. Use Properties Panel for quick toggles.</div>
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

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #444;
    font-size: 12px;
  }
</style>
