<script>
  import AlignHorizontalJustifyStart from 'lucide-svelte/icons/align-horizontal-justify-start';
  import AlignHorizontalJustifyCenter from 'lucide-svelte/icons/align-horizontal-justify-center';
  import AlignHorizontalJustifyEnd from 'lucide-svelte/icons/align-horizontal-justify-end';
  import AlignVerticalJustifyStart from 'lucide-svelte/icons/align-vertical-justify-start';
  import AlignVerticalJustifyCenter from 'lucide-svelte/icons/align-vertical-justify-center';
  import AlignVerticalJustifyEnd from 'lucide-svelte/icons/align-vertical-justify-end';
  import AlignHorizontalDistributeStart from 'lucide-svelte/icons/align-horizontal-distribute-start';
  import AlignHorizontalDistributeCenter from 'lucide-svelte/icons/align-horizontal-distribute-center';
  import AlignHorizontalDistributeEnd from 'lucide-svelte/icons/align-horizontal-distribute-end';
  import AlignVerticalDistributeStart from 'lucide-svelte/icons/align-vertical-distribute-start';
  import AlignVerticalDistributeCenter from 'lucide-svelte/icons/align-vertical-distribute-center';
  import AlignVerticalDistributeEnd from 'lucide-svelte/icons/align-vertical-distribute-end';
  import AlignHorizontalSpaceBetween from 'lucide-svelte/icons/align-horizontal-space-between';
  import AlignVerticalSpaceBetween from 'lucide-svelte/icons/align-vertical-space-between';
  import Group from 'lucide-svelte/icons/group';
  import Frame from 'lucide-svelte/icons/frame';
  import MousePointerClick from 'lucide-svelte/icons/mouse-pointer-click';
  import BringToFront from 'lucide-svelte/icons/bring-to-front';
  import SendToBack from 'lucide-svelte/icons/send-to-back';
  import MoveUp from 'lucide-svelte/icons/move-up';
  import MoveDown from 'lucide-svelte/icons/move-down';
  import StretchHorizontal from 'lucide-svelte/icons/stretch-horizontal';
  import StretchVertical from 'lucide-svelte/icons/stretch-vertical';
  import Scaling from 'lucide-svelte/icons/scaling';
  import Magnet from 'lucide-svelte/icons/magnet';
  import FlipHorizontal2 from 'lucide-svelte/icons/flip-horizontal-2';
  import FlipVertical2 from 'lucide-svelte/icons/flip-vertical-2';
  import LayoutGrid from 'lucide-svelte/icons/layout-grid';
  import Circle from 'lucide-svelte/icons/circle';
  import Ruler from 'lucide-svelte/icons/ruler';

  import { selectedControl, getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds, keyObjectId } from '../stores/panels.js';
  import { activeComponentPropertiesTab } from '../stores/propertiesPanelContext.js';
  import {
    alignLeft, alignHCenter, alignRight,
    alignTop, alignVCenter, alignBottom,
    distributeLeftEdges, distributeHCenters, distributeRightEdges,
    distributeTopEdges, distributeVCenters, distributeBottomEdges,
    distributeHSpacing, distributeVSpacing,
    bringToFront, bringForward, sendBackward, sendToBack,
    matchWidth, matchHeight, matchBoth,
    snapSelectionToGrid, snapSelectionToGuides,
    flipHorizontal, flipVertical,
    tidyGrid, arrangeCircular,
  } from '../stores/alignment.js';
  import { guides } from '../stores/guides.js';
  import NumberCell from '../properties/NumberCell.svelte';

  let control = $derived($selectedControl);
  let activePropertiesTab = $derived(String($activeComponentPropertiesTab ?? ''));
  let contentLayout = $derived(getSection(control, 'ContentLayout'));
  let showContentLayoutQuickTools = $derived(activePropertiesTab === 'contentlayout' && !!contentLayout);
  let alignMode = $state('selection');
  let regionX = $state(0);
  let regionY = $state(0);
  let regionRef = $derived({ x: regionX, y: regionY });
  let useFixedH = $state(false);
  let useFixedV = $state(false);
  let fixedHGap = $state(10);
  let fixedVGap = $state(10);
  let spacingAlign = $state(false);
  let gridCols = $state(3);
  let gridGapX = $state(10);
  let gridGapY = $state(10);
  let circleRadius = $state(100);
  let circleStartAngle = $state(0);

  let selCount = $derived($selectedComponentIds.size);
  let canAlign = $derived(alignMode === 'region' || alignMode === 'guides' ? selCount >= 1 : selCount >= 2);
  let canDistribute = $derived(selCount >= 3);
  let canFixedSpace = $derived(selCount >= 2);
  let canOrder = $derived(selCount >= 1);
  let canMatch = $derived(selCount >= 2);
  let canFlip = $derived(selCount >= 2);
  let canGrid = $derived(selCount >= 2);
  let canCircle = $derived(selCount >= 2);
  let hasKeyObject = $derived($keyObjectId != null && $selectedComponentIds.has($keyObjectId));

  function setLayout(path, value) {
    const controlId = control?._children?.Core?.id;
    if (!controlId) return;

    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(`ContentLayout.${path}`, value);
    } else {
      updateControlProperty(controlId, `ContentLayout.${path}`, value);
    }
  }
</script>

<div class="align-panel">
  {#if showContentLayoutQuickTools}
    <div class="align-section quick-layout">
      <div class="section-label">Button Layout</div>
      <div class="btn-row">
        <button class="action-btn" class:active={contentLayout?.horizontalAlign === 'left'} title="Align content left" onclick={() => setLayout('horizontalAlign', 'left')}>
          <AlignHorizontalJustifyStart size={16} strokeWidth={1.5} />
        </button>
        <button class="action-btn" class:active={contentLayout?.horizontalAlign === 'center'} title="Center content horizontally" onclick={() => setLayout('horizontalAlign', 'center')}>
          <AlignHorizontalJustifyCenter size={16} strokeWidth={1.5} />
        </button>
        <button class="action-btn" class:active={contentLayout?.horizontalAlign === 'right'} title="Align content right" onclick={() => setLayout('horizontalAlign', 'right')}>
          <AlignHorizontalJustifyEnd size={16} strokeWidth={1.5} />
        </button>
      </div>
      <div class="btn-row">
        <button class="action-btn" class:active={contentLayout?.verticalAlign === 'top'} title="Align content top" onclick={() => setLayout('verticalAlign', 'top')}>
          <AlignVerticalJustifyStart size={16} strokeWidth={1.5} />
        </button>
        <button class="action-btn" class:active={contentLayout?.verticalAlign === 'center'} title="Center content vertically" onclick={() => setLayout('verticalAlign', 'center')}>
          <AlignVerticalJustifyCenter size={16} strokeWidth={1.5} />
        </button>
        <button class="action-btn" class:active={contentLayout?.verticalAlign === 'bottom'} title="Align content bottom" onclick={() => setLayout('verticalAlign', 'bottom')}>
          <AlignVerticalJustifyEnd size={16} strokeWidth={1.5} />
        </button>
      </div>
      <div class="layout-row">
        <span class="input-label">Gap</span>
        <span class="spacing-input sm nc-wrap">
          <NumberCell value={contentLayout?.gap ?? 8} defaultValue={8} onchange={(v) => setLayout('gap', v)} />
        </span>
        <span class="unit">px</span>
      </div>
      <div class="layout-row">
        <span class="input-label">Pad</span>
        <span class="spacing-input sm nc-wrap" title="Padding left">
          <NumberCell value={contentLayout?.paddingLeft ?? 8} defaultValue={8} onchange={(v) => setLayout('paddingLeft', v)} />
        </span>
        <span class="spacing-input sm nc-wrap" title="Padding right">
          <NumberCell value={contentLayout?.paddingRight ?? 8} defaultValue={8} onchange={(v) => setLayout('paddingRight', v)} />
        </span>
        <span class="spacing-input sm nc-wrap" title="Padding top">
          <NumberCell value={contentLayout?.paddingTop ?? 6} defaultValue={6} onchange={(v) => setLayout('paddingTop', v)} />
        </span>
        <span class="spacing-input sm nc-wrap" title="Padding bottom">
          <NumberCell value={contentLayout?.paddingBottom ?? 6} defaultValue={6} onchange={(v) => setLayout('paddingBottom', v)} />
        </span>
      </div>
    </div>
    <div class="section-divider"></div>
  {/if}

  <!-- Align To -->
  <div class="align-section">
    <div class="section-label">Align To</div>
    <div class="mode-group">
      <button class="mode-btn" class:active={alignMode === 'selection'} title="Align to Selection" onclick={() => alignMode = 'selection'}>
        <Group size={14} strokeWidth={1.5} />
        <span>Selection</span>
      </button>
      <button class="mode-btn" class:active={alignMode === 'region'} title="Align to Region" onclick={() => alignMode = 'region'}>
        <Frame size={14} strokeWidth={1.5} />
        <span>Region</span>
      </button>
      <button class="mode-btn" class:active={alignMode === 'key-object'} disabled={!hasKeyObject} title="Align to Key Object" onclick={() => alignMode = 'key-object'}>
        <MousePointerClick size={14} strokeWidth={1.5} />
        <span>Key Object</span>
      </button>
      <button class="mode-btn" class:active={alignMode === 'guides'} disabled={$guides.vertical.length === 0 && $guides.horizontal.length === 0} title="Align to Guide Lines" onclick={() => alignMode = 'guides'}>
        <Ruler size={14} strokeWidth={1.5} />
        <span>Guides</span>
      </button>
    </div>
  </div>

  {#if alignMode === 'region'}
    <div class="section-divider"></div>
    <div class="align-section">
      <div class="section-label">Position</div>
      <div class="region-row">
        <span class="input-label">X</span>
        <span class="spacing-input nc-wrap">
          <NumberCell value={regionX} onchange={(v) => regionX = v} />
        </span>
      </div>
      <div class="region-row">
        <span class="input-label">Y</span>
        <span class="spacing-input nc-wrap">
          <NumberCell value={regionY} onchange={(v) => regionY = v} />
        </span>
      </div>
    </div>
  {/if}

  <div class="section-divider"></div>

  <!-- Align -->
  <div class="align-section">
    <div class="section-label">Align</div>
    <div class="btn-row">
      <button class="action-btn" disabled={!canAlign} title="Align Left Edges" onclick={() => alignLeft(alignMode, regionRef)}>
        <AlignHorizontalJustifyStart size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={!canAlign} title="Align Horizontal Centers" onclick={() => alignHCenter(alignMode, regionRef)}>
        <AlignHorizontalJustifyCenter size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={!canAlign} title="Align Right Edges" onclick={() => alignRight(alignMode, regionRef)}>
        <AlignHorizontalJustifyEnd size={16} strokeWidth={1.5} />
      </button>
    </div>
    <div class="btn-row">
      <button class="action-btn" disabled={!canAlign} title="Align Top Edges" onclick={() => alignTop(alignMode, regionRef)}>
        <AlignVerticalJustifyStart size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={!canAlign} title="Align Vertical Centers" onclick={() => alignVCenter(alignMode, regionRef)}>
        <AlignVerticalJustifyCenter size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={!canAlign} title="Align Bottom Edges" onclick={() => alignBottom(alignMode, regionRef)}>
        <AlignVerticalJustifyEnd size={16} strokeWidth={1.5} />
      </button>
    </div>
  </div>

  <div class="section-divider"></div>

  <!-- Distribute Edges -->
  <div class="align-section">
    <div class="section-label">Distribute</div>
    <div class="btn-row">
      <button class="action-btn" disabled={!canDistribute} title="Distribute Left Edges" onclick={distributeLeftEdges}>
        <AlignHorizontalDistributeStart size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={!canDistribute} title="Distribute Horizontal Centers" onclick={distributeHCenters}>
        <AlignHorizontalDistributeCenter size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={!canDistribute} title="Distribute Right Edges" onclick={distributeRightEdges}>
        <AlignHorizontalDistributeEnd size={16} strokeWidth={1.5} />
      </button>
    </div>
    <div class="btn-row">
      <button class="action-btn" disabled={!canDistribute} title="Distribute Top Edges" onclick={distributeTopEdges}>
        <AlignVerticalDistributeStart size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={!canDistribute} title="Distribute Vertical Centers" onclick={distributeVCenters}>
        <AlignVerticalDistributeCenter size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={!canDistribute} title="Distribute Bottom Edges" onclick={distributeBottomEdges}>
        <AlignVerticalDistributeEnd size={16} strokeWidth={1.5} />
      </button>
    </div>
  </div>

  <div class="section-divider"></div>

  <!-- Distribute Spacing -->
  <div class="align-section">
    <div class="section-label">Spacing</div>
    <div class="spacing-row">
      <button class="action-btn" disabled={useFixedH ? !canFixedSpace : !canDistribute} title={useFixedH ? `H-spacing: ${fixedHGap}px` : 'Equal H-Spacing'} onclick={() => distributeHSpacing(useFixedH ? fixedHGap : null, spacingAlign)}>
        <AlignHorizontalSpaceBetween size={16} strokeWidth={1.5} />
      </button>
      <button class="toggle-btn" class:active={useFixedH} onclick={() => useFixedH = !useFixedH}>
        {useFixedH ? 'Fixed' : 'Auto'}
      </button>
      {#if useFixedH}
        <span class="spacing-input nc-wrap">
          <NumberCell value={fixedHGap} min={0} onchange={(v) => fixedHGap = v} />
        </span>
        <span class="unit">px</span>
      {/if}
    </div>
    <div class="spacing-row">
      <button class="action-btn" disabled={useFixedV ? !canFixedSpace : !canDistribute} title={useFixedV ? `V-spacing: ${fixedVGap}px` : 'Equal V-Spacing'} onclick={() => distributeVSpacing(useFixedV ? fixedVGap : null, spacingAlign)}>
        <AlignVerticalSpaceBetween size={16} strokeWidth={1.5} />
      </button>
      <button class="toggle-btn" class:active={useFixedV} onclick={() => useFixedV = !useFixedV}>
        {useFixedV ? 'Fixed' : 'Auto'}
      </button>
      {#if useFixedV}
        <span class="spacing-input nc-wrap">
          <NumberCell value={fixedVGap} min={0} onchange={(v) => fixedVGap = v} />
        </span>
        <span class="unit">px</span>
      {/if}
    </div>
    <div class="spacing-row">
      <button class="toggle-btn" class:active={spacingAlign} onclick={() => spacingAlign = !spacingAlign} title="Also align on the opposite axis">
        {spacingAlign ? 'Align' : 'Free'}
      </button>
    </div>
  </div>

  <div class="section-divider"></div>

  <!-- Z-Order -->
  <div class="align-section">
    <div class="section-label">Order</div>
    <div class="btn-row">
      <button class="action-btn" disabled={!canOrder} title="Bring to Front" onclick={bringToFront}>
        <BringToFront size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={!canOrder} title="Bring Forward" onclick={bringForward}>
        <MoveUp size={16} strokeWidth={1.5} />
      </button>
    </div>
    <div class="btn-row">
      <button class="action-btn" disabled={!canOrder} title="Send to Back" onclick={sendToBack}>
        <SendToBack size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={!canOrder} title="Send Backward" onclick={sendBackward}>
        <MoveDown size={16} strokeWidth={1.5} />
      </button>
    </div>
  </div>

  <div class="section-divider"></div>

  <!-- Match Size -->
  <div class="align-section">
    <div class="section-label">Size</div>
    <div class="btn-row">
      <button class="action-btn" disabled={!canMatch} title="Match Width" onclick={matchWidth}>
        <StretchHorizontal size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={!canMatch} title="Match Height" onclick={matchHeight}>
        <StretchVertical size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={!canMatch} title="Match Both" onclick={matchBoth}>
        <Scaling size={16} strokeWidth={1.5} />
      </button>
    </div>
    <div class="btn-row">
      <button class="action-btn" disabled={selCount < 1} title="Snap to Grid" onclick={snapSelectionToGrid}>
        <Magnet size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={selCount < 1 || ($guides.vertical.length === 0 && $guides.horizontal.length === 0)} title="Snap to Guides" onclick={snapSelectionToGuides}>
        <Ruler size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={!canFlip} title="Flip Horizontal" onclick={flipHorizontal}>
        <FlipHorizontal2 size={16} strokeWidth={1.5} />
      </button>
      <button class="action-btn" disabled={!canFlip} title="Flip Vertical" onclick={flipVertical}>
        <FlipVertical2 size={16} strokeWidth={1.5} />
      </button>
    </div>
  </div>

  <div class="section-divider"></div>

  <!-- Layout: Grid + Circle -->
  <div class="align-section">
    <div class="section-label">Layout</div>
    <div class="layout-row">
      <button class="action-btn" disabled={!canGrid} title="Arrange in Grid" onclick={() => tidyGrid(gridCols, gridGapX, gridGapY)}>
        <LayoutGrid size={16} strokeWidth={1.5} />
      </button>
      <span class="input-label">Cols</span>
      <span class="spacing-input sm nc-wrap">
        <NumberCell value={gridCols} min={1} onchange={(v) => gridCols = v} />
      </span>
      <span class="input-label">Gap</span>
      <span class="spacing-input sm nc-wrap">
        <NumberCell value={gridGapX} min={0} onchange={(v) => gridGapX = v} />
      </span>
      <span class="unit">x</span>
      <span class="spacing-input sm nc-wrap">
        <NumberCell value={gridGapY} min={0} onchange={(v) => gridGapY = v} />
      </span>
    </div>
    <div class="layout-row">
      <button class="action-btn" disabled={!canCircle} title="Arrange in Circle" onclick={() => arrangeCircular(circleRadius, circleStartAngle)}>
        <Circle size={16} strokeWidth={1.5} />
      </button>
      <span class="input-label">R</span>
      <span class="spacing-input sm nc-wrap">
        <NumberCell value={circleRadius} min={1} onchange={(v) => circleRadius = v} />
      </span>
      <span class="input-label">Angle</span>
      <span class="spacing-input sm nc-wrap">
        <NumberCell value={circleStartAngle} onchange={(v) => circleStartAngle = v} />
      </span>
      <span class="unit">&deg;</span>
    </div>
  </div>
</div>

<style>
  .align-panel {
    display: flex;
    flex-direction: row;
    gap: 0;
    padding: 8px 0;
    height: 100%;
    overflow-x: auto;
  }

  .align-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 12px;
    flex-shrink: 0;
  }

  .section-divider {
    width: 1px;
    background: #333;
    flex-shrink: 0;
  }

  .section-label {
    font-size: 9px;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .mode-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mode-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: #252525;
    border: none;
    color: #888;
    font-size: 10px;
    cursor: pointer;
    font-family: inherit;
    border-radius: 3px;
    transition: all 0.1s;
  }

  .region-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .mode-btn:hover { background: #333; color: #CCC; }
  .mode-btn.active { background: #094771; color: #FFF; }
  .mode-btn:disabled { opacity: 0.3; cursor: default; pointer-events: none; }

  .btn-row {
    display: flex;
    gap: 2px;
    align-items: center;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 26px;
    background: #252525;
    border: none;
    color: #AAA;
    cursor: pointer;
    border-radius: 3px;
    transition: all 0.1s;
  }

  .action-btn:hover { background: #333; color: #FFF; }
  .action-btn:active { background: #094771; color: #FFF; }
  .action-btn.active { background: #094771; color: #FFF; border: 1px solid #0B6EB5; }
  .action-btn:disabled { opacity: 0.25; cursor: default; pointer-events: none; }

  .spacing-row, .layout-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .toggle-btn {
    padding: 3px 8px;
    background: #252525;
    border: none;
    color: #888;
    font-size: 10px;
    cursor: pointer;
    font-family: inherit;
    border-radius: 3px;
    transition: all 0.1s;
  }

  .toggle-btn:hover { background: #333; color: #CCC; }
  .toggle-btn.active { background: #094771; color: #FFF; }

  /* Sizing wrappers around NumberCell — keep row/column width discipline. */
  .spacing-input {
    width: 58px;
    flex-shrink: 0;
  }

  .spacing-input.sm {
    width: 46px;
  }

  .nc-wrap {
    display: flex;
  }

  .unit {
    font-size: 10px;
    color: #555;
  }

  .input-label {
    font-size: 9px;
    color: #666;
  }

  .quick-layout .layout-row {
    min-height: 26px;
  }
</style>
