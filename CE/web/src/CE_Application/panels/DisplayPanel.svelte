<script>
  /**
   * Display Panel — bottom dock with mini displays/tools.
   * Tabs for: Colors, Gradient, Notepad, Viewer, Tools, Console.
   */
  import AlignCenter from 'lucide-svelte/icons/align-center';
  import Cable from 'lucide-svelte/icons/cable';
  import Image from 'lucide-svelte/icons/image';
  import Palette from 'lucide-svelte/icons/palette';
  import Play from 'lucide-svelte/icons/play';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import StickyNote from 'lucide-svelte/icons/sticky-note';
  import SwatchBook from 'lucide-svelte/icons/swatch-book';
  import Terminal from 'lucide-svelte/icons/terminal';
  import ColorChooser from '../components/ColorChooser.svelte';
  import ColorSettings from '../components/ColorSettings.svelte';
  import GradientMiniPreview from '../components/GradientMiniPreview.svelte';
  import SwatchGrid from '../components/SwatchGrid.svelte';
  import GradientTab from './GradientTab.svelte';
  import { activePanel, updatePanel } from '../stores/panels.js';
  import { colorTarget, applyColorToTarget, clearColorTarget } from '../stores/colorTarget.js';
  import { gradientTarget, applyGradientToTarget, clearGradientTarget } from '../stores/gradientTarget.js';
  import { displayTabRequest } from '../stores/displayTab.js';
  import { deepClone } from '../utils/deepClone.js';
  import { readStoredJson, readStoredNumber, writeStoredJson } from '../utils/localStorageState.js';
  import { syncExternalTarget } from '../utils/targetSync.js';
  import { splitColourAlpha, alphaToHex } from '../utils/colorMath.js';
  import { flatControls } from '../utils/containment.js';

  let props = $props();
  let onTabChange = $derived(props.onTabChange);
  let visible = $derived(props.visible ?? true);

  const DISPLAY_TAB_STORAGE_KEY = 'ce.displayPanel.activeTab';
  const DEFAULT_DISPLAY_TAB = 'colors';
  const DISPLAY_TAB_IDS = new Set(['colors', 'gradient', 'effects', 'notepad', 'viewer', 'align', 'device', 'preview', 'console']);
  const LAZY_TAB_LOADERS = {
    notepad: () => import('./NotepadTab.svelte').then((module) => ({ default: module.default })),
    viewer: () => import('./ViewerTab.svelte').then((module) => ({ default: module.default })),
    align: () => import('../components/AlignmentPanel.svelte').then((module) => ({ default: module.default })),
    device: () => import('../components/ParameterBrowserTab.svelte').then((module) => ({ default: module.default })),
    preview: () => import('../components/InteractionPreviewTab.svelte').then((module) => ({ default: module.default })),
    console: async () => {
      const [debugModule, consoleModule] = await Promise.all([
        import('../components/DebugPanel.svelte'),
        import('../components/ConsolePanel.svelte'),
      ]);
      return {
        debug: debugModule.default,
        console: consoleModule.default,
      };
    },
  };
  const lazyTabCache = new Map();
  const lazyTabPromises = new Map();

  function sanitizeStoredDisplayTab(value) {
    const normalized = String(value ?? DEFAULT_DISPLAY_TAB);
    if (!DISPLAY_TAB_IDS.has(normalized)) return DEFAULT_DISPLAY_TAB;
    // Preview is intentionally not restored on startup because it mounts
    // a live interactive surface and should only run on demand.
    if (normalized === 'preview') return DEFAULT_DISPLAY_TAB;
    return normalized;
  }

  let activeTab = $state(sanitizeStoredDisplayTab(readStoredJson(DISPLAY_TAB_STORAGE_KEY, DEFAULT_DISPLAY_TAB)));
  let activeTabComponent = $state(null);
  let activeTabError = $state('');
  $effect(() => {
    writeStoredJson(
      DISPLAY_TAB_STORAGE_KEY,
      activeTab === 'preview' ? DEFAULT_DISPLAY_TAB : activeTab
    );
  });

  function getLazyTabComponent(tabId) {
    return lazyTabCache.get(tabId) ?? null;
  }

  function ensureLazyTabComponent(tabId) {
    if (!LAZY_TAB_LOADERS[tabId]) {
      return Promise.resolve(null);
    }

    if (lazyTabCache.has(tabId)) {
      return Promise.resolve(lazyTabCache.get(tabId));
    }

    if (!lazyTabPromises.has(tabId)) {
      lazyTabPromises.set(
        tabId,
        LAZY_TAB_LOADERS[tabId]()
          .then((componentSet) => {
            lazyTabCache.set(tabId, componentSet);
            return componentSet;
          })
          .finally(() => {
            lazyTabPromises.delete(tabId);
          })
      );
    }

    return lazyTabPromises.get(tabId);
  }

  $effect(() => {
    let cancelled = false;

    if (!LAZY_TAB_LOADERS[activeTab]) {
      activeTabComponent = null;
      activeTabError = '';
      return () => {
        cancelled = true;
      };
    }

    const existing = getLazyTabComponent(activeTab);
    if (existing) {
      activeTabComponent = existing;
      activeTabError = '';
      return () => {
        cancelled = true;
      };
    }

    activeTabComponent = null;
    activeTabError = '';

    ensureLazyTabComponent(activeTab)
      .then((componentSet) => {
        if (cancelled) return;
        activeTabComponent = componentSet;
      })
      .catch((error) => {
        if (cancelled) return;
        activeTabError = error?.message ?? 'load failed';
      });

    return () => {
      cancelled = true;
    };
  });

  // --- External tab switch requests ---
  $effect(() => {
    const req = $displayTabRequest;
    if (req) {
      handleTabClick(req.tab);
      displayTabRequest.set(null);
    }
  });

  // --- Central color state ---
  // Panel colours are stored AARRGGBB — splitColourAlpha keeps the alpha out
  // of the RGB channels (feeding 'FF333333' to a 6-char consumer shows red).
  const initialPanelColour = splitColourAlpha($activePanel?.bgColour);
  let userPickedColor = $state(initialPanelColour.color);
  let userPickedAlpha = $state(initialPanelColour.alpha);

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
  // Drag quantisation for the colour bands. 0 = smooth (no design tool ships
  // a snapping colour picker by default); persisted so a chosen step sticks.
  const STEP_SIZE_STORAGE_KEY = 'ce.displayPanel.stepSize';
  let stepSize = $state(readStoredNumber(STEP_SIZE_STORAGE_KEY, 0));
  $effect(() => { writeStoredJson(STEP_SIZE_STORAGE_KEY, stepSize); });

  // --- Shared swatches (used by Colors / Gradient / Notepad tabs) ---
  // Persisted: a swatch library that evaporates on reload is not a library.
  const SWATCHES_STORAGE_KEY = 'ce.displayPanel.swatches';
  function readStoredSlots(key) {
    const stored = readStoredJson(key, null);
    const slots = Array(24).fill(null);
    if (Array.isArray(stored)) {
      for (let i = 0; i < Math.min(24, stored.length); i++) slots[i] = stored[i] ?? null;
    }
    return slots;
  }
  let swatches = $state(readStoredSlots(SWATCHES_STORAGE_KEY));
  $effect(() => { writeStoredJson(SWATCHES_STORAGE_KEY, $state.snapshot(swatches)); });

  // --- Gradient presets (Gradient tab) ---
  // Owned here, not by GradientTab: the tab unmounts on every tab switch —
  // and the stop-colour flow forces a switch — which used to wipe all 24.
  const GRADIENT_PRESETS_STORAGE_KEY = 'ce.displayPanel.gradientPresets';
  let gradientPresets = $state(readStoredSlots(GRADIENT_PRESETS_STORAGE_KEY));
  $effect(() => { writeStoredJson(GRADIENT_PRESETS_STORAGE_KEY, $state.snapshot(gradientPresets)); });

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
  let gradientShape = $state('rectangle');

  // Bumped whenever the active panel changes — child tabs watch this as
  // their reset signal so they can re-sync from the new active panel.
  let panelResetKey = $state(0);

  // Ref to the notepad tab so the cross-tab "back from color pick" flow
  // can call `applyTextColor(hex, range)` on it.
  let notepadTabRef = $state(null);

  // Sync from store when active panel changes (panel switch). Any in-flight
  // editing mode belonged to the previous panel and ends here.
  let lastPanelId = $state(null);
  $effect(() => {
    const panel = $activePanel;
    if (panel && panel.id !== lastPanelId) {
      lastPanelId = panel.id;
      currentGradient = panel.bgGradient ? deepClone(panel.bgGradient) : deepClone(defaultGradient);
      editingGradientStop = null;
      pickingNotepadColor = false;
      savedNotepadSelection = null;
      const parsed = splitColourAlpha(panel.bgColour);
      userPickedColor = parsed.color;
      userPickedAlpha = parsed.alpha;
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

    // Default — write to panel bgColour. Full AARRGGBB, matching how the
    // panel stores it — the old 6-char write silently dropped the alpha and
    // left the stored format flip-flopping between the two write paths.
    const panel = $activePanel;
    if (panel) updatePanel(panel.id, { bgColour: alphaToHex(userPickedAlpha) + userPickedColor, modified: true });
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
    resetUserColor();
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
    if (p) {
      const parsed = splitColourAlpha(p.bgColour);
      userPickedColor = parsed.color;
      userPickedAlpha = parsed.alpha;
    }
  }

  function resetGradientFromPanel() {
    const p = $activePanel;
    if (p) {
      currentGradient = p.bgGradient
        ? deepClone(p.bgGradient)
        : deepClone(defaultGradient);
    }
  }

  // Targets can now be cleared from outside (selection change, panel switch —
  // see colorTarget.js/gradientTarget.js). When that happens the chooser must
  // fall back to panel defaults instead of keeping the orphaned colour.
  let hadColorTarget = false;
  $effect(() => {
    const t = $colorTarget;
    if (!t && hadColorTarget) resetUserColor();
    hadColorTarget = !!t;
  });
  let hadGradientTarget = false;
  $effect(() => {
    const t = $gradientTarget;
    if (!t && hadGradientTarget) resetGradientFromPanel();
    hadGradientTarget = !!t;
  });

  // Closing the dock ends every in-flight editing mode. The dock stays
  // mounted while hidden (App keeps it alive with display:none), so without
  // this a target armed before closing kept writing after reopening.
  let wasVisible = true;
  $effect(() => {
    const v = visible;
    if (wasVisible && !v) {
      if (editingGradientStop !== null) {
        commitStopColor();
        editingGradientStop = null;
      }
      savedNotepadSelection = null;
      pickingNotepadColor = false;
      if ($colorTarget) clearColorTarget();
      if ($gradientTarget) clearGradientTarget();
      resetUserColor();
      resetGradientFromPanel();
    }
    wasVisible = v;
  });

  // --- Context header: what is this dock editing right now? ---
  const PANEL_PROP_LABELS = {
    bgColour: 'Panel background',
    gridColour: 'Panel grid colour',
  };

  function friendlyPath(path) {
    return String(path ?? '')
      .replace(/\.(colour|color)$/i, '')
      .split('.')
      .map((seg) => seg.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
      .join(' › ');
  }

  function controlLabel(controlId) {
    const control = flatControls($activePanel?.controls ?? [])
      .find((c) => c._children?.Core?.id === controlId);
    return control?._children?.Core?.name ?? 'control';
  }

  function describeTarget(target) {
    if (!target) return null;
    if (target.label) return target.label;
    if (target.type === 'control') return `${controlLabel(target.controlId)} — ${friendlyPath(target.path)}`;
    if (target.type === 'panel') return PANEL_PROP_LABELS[target.prop] ?? friendlyPath(target.prop);
    return 'selection';
  }

  let colorContextLabel = $derived.by(() => {
    if (editingGradientStop !== null) return `Gradient stop ${editingGradientStop + 1}`;
    if (pickingNotepadColor) return 'Notepad text colour';
    return describeTarget($colorTarget) ?? 'Panel background';
  });
  let colorContextActive = $derived(editingGradientStop !== null || pickingNotepadColor || !!$colorTarget);

  let gradientContextLabel = $derived(describeTarget($gradientTarget) ?? 'Panel background gradient');
  let gradientContextActive = $derived(!!$gradientTarget);

  function handleColorDone() {
    if (editingGradientStop !== null) { handleBackToGradient(); return; }
    if (pickingNotepadColor) { handleBackToNotepad(); return; }
    if ($colorTarget) {
      clearColorTarget();
      resetUserColor();
    }
  }

  function handleGradientDone() {
    if ($gradientTarget) {
      clearGradientTarget();
      resetGradientFromPanel();
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
    { id: 'colors',   label: 'Colors',   icon: Palette },
    { id: 'gradient', label: 'Gradient', icon: SwatchBook },
    { id: 'effects',  label: 'Effects',  icon: Sparkles },
    { id: 'notepad',  label: 'Notepad',  icon: StickyNote },
    { id: 'viewer',   label: 'Viewer',   icon: Image },
    { id: 'align',    label: 'Align',    icon: AlignCenter },
    { id: 'device',   label: 'Device',   icon: Cable },
    { id: 'preview',  label: 'Preview',  icon: Play },
    { id: 'console',  label: 'Console',  icon: Terminal },
  ];
</script>

<div class="display-panel">
  <div class="studio-rail" aria-label="Display studios">
    {#each tabs as tab (tab.id)}
      <button
        class="studio-tab"
        class:active={activeTab === tab.id}
        aria-label={tab.label}
        title={tab.label}
        onclick={() => handleTabClick(tab.id)}
      >
        <tab.icon size={15} strokeWidth={1.6} />
        <span>{tab.label}</span>
      </button>
    {/each}
  </div>

  <div class="studio-content">
    {#if activeTab === 'colors'}
      <div class="tab-pane">
        <div class="context-bar" class:active={colorContextActive}>
          <span class="context-label">Editing: <strong>{colorContextLabel}</strong></span>
          {#if colorContextActive}
            <button class="context-done" onclick={handleColorDone}>Done</button>
          {/if}
        </div>
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
    {:else if activeTab === 'gradient'}
      <div class="tab-pane">
        <div class="context-bar" class:active={gradientContextActive}>
          <span class="context-label">Editing: <strong>{gradientContextLabel}</strong></span>
          {#if gradientContextActive}
            <button class="context-done" onclick={handleGradientDone}>Done</button>
          {/if}
        </div>
        <div class="context-content">
          <GradientTab
            gradient={currentGradient}
            shape={gradientShape}
            {swatches}
            {gradientPresets}
            onchange={handleGradientChange}
            oneditstopcolor={handleEditStopColor}
            onshapechange={(shape) => gradientShape = shape}
            onswatchdblclick={handleSwatchDblClick}
            onswatchrightclick={handleSwatchRightClick}
          />
        </div>
      </div>
    {:else if activeTab === 'notepad' && activeTabComponent?.default}
      {@const NotepadTab = activeTabComponent.default}
      <div class="tab-pane">
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
    {:else if activeTab === 'viewer' && activeTabComponent?.default}
      {@const ViewerTab = activeTabComponent.default}
      <div class="tab-pane">
        <ViewerTab resetKey={panelResetKey} oncolorpicked={handleViewerColorPicked} />
      </div>
    {:else if activeTab === 'effects'}
      <div class="tab-pane">
      <div class="placeholder">Effects editor — full editing coming soon. Use Properties Panel for quick toggles.</div>
      </div>
    {:else if activeTab === 'align' && activeTabComponent?.default}
      {@const AlignmentPanel = activeTabComponent.default}
      <div class="tab-pane">
        <AlignmentPanel />
      </div>
    {:else if activeTab === 'device' && activeTabComponent?.default}
      {@const ParameterBrowserTab = activeTabComponent.default}
      <div class="tab-pane">
        <ParameterBrowserTab />
      </div>
    {:else if activeTab === 'preview' && activeTabComponent?.default}
      {@const PreviewTabComponent = activeTabComponent.default}
      <div class="tab-pane">
        <PreviewTabComponent />
      </div>
    {:else if activeTab === 'console' && activeTabComponent?.debug && activeTabComponent?.console}
      {@const DebugPanel = activeTabComponent.debug}
      {@const ConsolePanel = activeTabComponent.console}
      <div class="tab-pane">
        <div class="console-split">
          <div class="debug-side">
            <DebugPanel />
          </div>
          <div class="console-divider"></div>
          <div class="console-side">
            <ConsolePanel />
          </div>
        </div>
      </div>
    {:else if activeTabError}
      <div class="tab-pane">
        <div class="placeholder">Failed To Load: {activeTabError}</div>
      </div>
    {:else}
      <div class="tab-pane">
        <div class="placeholder">Loading {tabs.find((tab) => tab.id === activeTab)?.label ?? 'tab'}…</div>
      </div>
    {/if}
  </div>
</div>

<style>
  .display-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1E1E1E;
  }

  /* Horizontal tab strip along the top (was a vertical rail on the left). */
  .studio-rail {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 3px;
    width: 100%;
    padding: 4px 5px;
    background: #1A1A1A;
    flex-shrink: 0;
    border-bottom: 1px solid #333;
    box-sizing: border-box;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .studio-tab {
    min-width: 40px;
    height: 32px;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #888;
    font-size: 11px;
    line-height: 1;
    padding: 0 10px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.1s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .studio-tab span {
    max-width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .studio-tab:hover {
    color: #CCC;
    background: #262626;
    border-color: #333;
  }

  .studio-tab.active {
    color: #DDD;
    background: #094771;
    border-color: #5B9BD5;
  }

  .studio-content {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .tab-pane {
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Slim "what am I editing" strip above the Colors / Gradient editors. */
  .context-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: 22px;
    padding: 0 8px;
    background: #1A1A1A;
    border-bottom: 1px solid #2A2A2A;
    font-size: 10px;
    color: #777;
  }

  .context-bar.active {
    background: #102436;
    border-bottom-color: #274a68;
    color: #9EC1DF;
  }

  .context-label strong {
    font-weight: 600;
    color: inherit;
  }

  .context-done {
    background: #094771;
    border: 1px solid #5B9BD5;
    color: #EEE;
    font-size: 10px;
    line-height: 1;
    padding: 2px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
  }

  .context-done:hover {
    background: #5B9BD5;
    color: #FFF;
  }

  .context-content {
    flex: 1;
    min-height: 0;
  }

  /* Colors layout */
  .colors-layout {
    display: flex;
    flex: 1;
    min-height: 0;
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

  .console-split {
    display: flex;
    height: 100%;
    min-height: 0;
  }

  .debug-side {
    width: 36%;
    min-width: 240px;
    max-width: 520px;
    flex-shrink: 0;
  }

  .console-divider {
    width: 1px;
    background: #333;
    flex-shrink: 0;
  }

  .console-side {
    flex: 1;
    min-width: 0;
  }
</style>
