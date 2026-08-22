<script module>
  // Collapse state survives the tree being toggled off/on (which unmounts this
  // component) and is keyed per panel so it doesn't leak across documents.
  const collapsedByPanel = new Map();
</script>

<script>
  // The row icons are drawn inline (see the snippets at the bottom) rather than imported from
  // lucide-svelte. This dock renders one row per control — 413 of them for the GAIA panel — and
  // every row carries three icons, so the icon component is instantiated ~1,200 times on load.
  //
  // lucide-svelte 1.0.1 is written in Svelte 4 syntax (`export let`, `$$restProps`, `<slot/>`), so
  // each of those is a legacy-mode component wrapping ANOTHER component, which spreads two attribute
  // objects and loops the path data through `<svelte:element>` — the most expensive way there is to
  // put six path elements on screen. Measured by removing them from the build: 359 ms of a 2,041 ms
  // panel load, the single largest item in it.
  //
  // The markup below is byte-for-byte what lucide renders (same viewBox, same path data, same
  // stroke attributes), minus the class names, which nothing styles. Icons elsewhere in the editor
  // are fine as components — this is about a list with hundreds of rows, not about lucide.
  import { activePanel, selectedComponentIds, selectComponent, keyObjectId } from '../stores/panels.js';
  import { applyControlPatchesById, renameControl, updateControlProperty, reparentControls, removeControl, duplicateControl, groupSelectionIntoContainer, ungroupContainer } from '../stores/controls.js';
  import { bringToFront, bringForward, sendBackward, sendToBack } from '../stores/alignment.js';
  import { getSection } from '../models/componentTypes.js';
  import { getControlId, getControlLayer, sortControlsForRender } from '../utils/controlOrder.js';
  import { isEditableTarget } from '../utils/globalShortcuts.js';
  import {
    TREE_ROW_HEIGHT,
    controlTreeSignature,
    dragAutoScrollStep,
    scrollTopForRow,
    treeArrowTarget,
    treeWindow,
    typeBadgeAddsInformation,
  } from '../utils/componentTreeView.js';
  import {
    controlPanelRect,
    findControlById,
    findParentOfControl,
    flatControls,
    getAncestorIds,
    getChildControls,
    isContainerControl,
    isDescendantOfControl,
    panelToLocalPoint,
    selectionRoots,
  } from '../utils/containment.js';

  // Collapsed container ids (expanded by default), loaded per panel.
  let collapsedIds = $state(new Set());
  let collapsePanelId = null;
  $effect(() => {
    const pid = $activePanel?.id ?? null;
    if (pid !== collapsePanelId) {
      collapsePanelId = pid;
      collapsedIds = new Set(collapsedByPanel.get(pid) ?? []);
    }
  });

  function setCollapsed(next) {
    collapsedIds = next;
    if (collapsePanelId != null) collapsedByPanel.set(collapsePanelId, next);
  }

  function toggleCollapsed(id) {
    const next = new Set(collapsedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  }

  // --- Filter ---
  let filterText = $state('');
  let filtering = $derived(filterText.trim().length > 0);

  // Flattened display rows: depth-first, siblings front-to-back (top of list =
  // front/highest z), respecting collapsed containers. While filtering,
  // matches and their ancestors are shown and collapse is ignored.
  // Row objects are REUSED for controls that have not changed, and that is a performance
  // contract rather than tidiness. These rows feed a keyed `{#each}`: Svelte matches by key and
  // then writes each matched item's value signal, skipping the write when the value is unchanged.
  // Building a fresh row every rebuild defeats that skip, so every one of the 413 rows counts as
  // changed and every write walks the reaction graph — for a drag that moved one control.
  //
  // Controls are immutable (an edit replaces the control), so identity is the right key. Depth,
  // container-ness and the inherited hidden/locked flags are part of the row, so a cached row is
  // only reused while all of them still hold. (A control's OWN hidden/locked state needs no check:
  // editing it replaces the control object, which misses the WeakMap on its own.)
  //
  // `posinset`/`setsize` are here because the list is windowed: only ~25 of the rows are in the
  // DOM at once, so a screen reader counting `role="treeitem"` children would announce "3 of 25"
  // in a panel of 413. They have to be told the real position, and only the walk knows it.
  const rowCache = new WeakMap();
  const rowFor = (ctrl, id, depth, container, inheritedHidden, inheritedLocked, posinset, setsize) => {
    const cached = rowCache.get(ctrl);
    if (
      cached !== undefined &&
      cached.depth === depth &&
      cached.container === container &&
      cached.inheritedHidden === inheritedHidden &&
      cached.inheritedLocked === inheritedLocked &&
      cached.posinset === posinset &&
      cached.setsize === setsize
    ) return cached;
    const row = { ctrl, id, depth, container, inheritedHidden, inheritedLocked, posinset, setsize };
    rowCache.set(ctrl, row);
    return row;
  };

  // The last row array handed out, and the inputs it was built from. `controlTreeSignature` covers
  // everything a row draws or is ordered by; the filter text and the collapsed set are the other
  // two inputs. When none of the three moved, the SAME array instance goes back out, so the
  // `$derived` value is unchanged, the keyed `{#each}` is never entered, and a canvas drag — which
  // writes Transform.x/y and nothing this tree shows — costs one signature pass per frame instead
  // of a sort per sibling list and 413 fresh row objects.
  let cachedRows = [];
  let cachedPanelId = null;
  let cachedSignature = null;
  let cachedQuery = null;
  let cachedCollapsed = null;

  let rows = $derived.by(() => {
    if (!$activePanel) return [];
    const controls = $activePanel.controls;
    const panelId = $activePanel.id;

    const query = filterText.trim().toLowerCase();
    const signature = controlTreeSignature(controls);
    if (
      panelId === cachedPanelId
      && signature === cachedSignature
      && query === cachedQuery
      && collapsedIds === cachedCollapsed
    ) {
      return cachedRows;
    }
    let visibleSet = null;
    if (query) {
      visibleSet = new Set();
      for (const ctrl of flatControls(controls)) {
        const core = ctrl._children?.Core;
        const name = String(core?.name ?? '').toLowerCase();
        const type = String(core?.controlType ?? '').toLowerCase();
        if (name.includes(query) || type.includes(query)) {
          visibleSet.add(core?.id);
          for (const ancestorId of getAncestorIds(controls, core?.id)) visibleSet.add(ancestorId);
        }
      }
    }

    const out = [];
    const visit = (list, depth, inheritedHidden, inheritedLocked) => {
      const siblings = [...sortControlsForRender(list)].reverse()
        .filter((ctrl) => !visibleSet || visibleSet.has(getControlId(ctrl)));
      const setsize = siblings.length;
      siblings.forEach((ctrl, index) => {
        const id = getControlId(ctrl);
        const container = isContainerControl(ctrl);
        const core = ctrl._children?.Core;
        const hidden = core?.visible === false;
        const locked = core?.locked === true;
        out.push(rowFor(ctrl, id, depth, container, inheritedHidden, inheritedLocked, index + 1, setsize));
        if (container && (query || !collapsedIds.has(id))) {
          visit(getChildControls(ctrl), depth + 1, inheritedHidden || hidden, inheritedLocked || locked);
        }
      });
    };
    visit(controls, 0, false, false);

    cachedRows = out;
    cachedPanelId = panelId;
    cachedSignature = signature;
    cachedQuery = query;
    cachedCollapsed = collapsedIds;
    return out;
  });

  let totalCount = $derived($activePanel ? flatControls($activePanel.controls).length : 0);

  // --- Windowing ---
  // Only the rows in (and just outside) the viewport are mounted; the rest are two spacer divs.
  // Everything that used to reach for a row ELEMENT — the reveal below, the keyboard focus, the
  // drag targets — now works from the row INDEX, because the element it wants usually does not
  // exist. That is the whole cost of virtualizing this list, and it is paid in the four places
  // marked "windowed:".
  let treeListEl = $state(null);
  let scrollTop = $state(0);
  let viewportHeight = $state(0);

  let windowRange = $derived(treeWindow({ scrollTop, viewportHeight, rowCount: rows.length }));
  let visibleRows = $derived(rows.slice(windowRange.start, windowRange.end));

  function handleListScroll(e) {
    scrollTop = e.currentTarget.scrollTop;
  }

  // windowed: scroll by index, then let the render catch up.
  function scrollRowIntoView(index) {
    if (!treeListEl || index < 0) return;
    const next = scrollTopForRow({
      index,
      scrollTop: treeListEl.scrollTop,
      viewportHeight: treeListEl.clientHeight,
      rowCount: rows.length,
    });
    if (next !== treeListEl.scrollTop) {
      treeListEl.scrollTop = next;
      scrollTop = next;
    }
  }

  // --- Reveal: canvas selection must be findable in the tree ---
  let lastRevealedId = null;
  $effect(() => {
    const ids = $selectedComponentIds;
    const panel = $activePanel;
    if (!panel || ids.size === 0) { lastRevealedId = null; return; }
    const first = [...ids][0];
    if (first === lastRevealedId) return;
    lastRevealedId = first;

    // Expand collapsed ancestors so the selected row actually renders.
    const ancestors = getAncestorIds(panel.controls, first);
    if (ancestors.some((a) => collapsedIds.has(a))) {
      const next = new Set(collapsedIds);
      for (const a of ancestors) next.delete(a);
      setCollapsed(next);
    }

    // windowed: `rows` is re-derived on read, so the index below already accounts for the
    // ancestors just expanded. The rAF is still needed for the element's own height to settle
    // after a panel switch, not for the row to exist — the index does not need it to.
    const index = rows.findIndex((row) => row.id === first);
    focusedId = first;
    requestAnimationFrame(() => scrollRowIntoView(index));
  });

  // --- Rename ---
  let renamingId = $state(null);
  let renameValue = $state('');

  function startRename(id, name) {
    renamingId = id;
    renameValue = name;
  }

  // A rename that cannot be typed is a rename that lies. The old code took `renameValue.trim()`
  // and, if it was empty, threw the edit away without a word — the row snapped back to its old
  // name and nothing said why. And it wrote `Core.name` straight through, so two controls could
  // end up sharing the name a script addresses them by.
  //
  // Both are `renameControl`'s job now (stores/controls.js): a blank falls back to the type name,
  // a taken name gets a numeric suffix. What it can never do is happen silently, so whenever the
  // applied name is not the typed one, the tree says so.
  let renameNotice = $state('');
  let renameNoticeTimer = null;

  function showRenameNotice(message) {
    renameNotice = message;
    clearTimeout(renameNoticeTimer);
    renameNoticeTimer = setTimeout(() => { renameNotice = ''; }, 4000);
  }

  function commitRename() {
    if (!renamingId) return;
    const typed = renameValue.trim();
    const result = renameControl(renamingId, renameValue);
    if (result?.applied && result.applied !== typed) {
      showRenameNotice(
        typed
          ? `"${typed}" is taken — renamed to "${result.applied}"`
          : `A component needs a name — used "${result.applied}"`
      );
    } else {
      renameNotice = '';
    }
    renamingId = null;
  }

  function handleRenameKeyDown(e) {
    if (e.key === 'Enter') { commitRename(); }
    else if (e.key === 'Escape') { renamingId = null; }
  }

  // F2 renames the selected component — the same convention the code editor
  // and behavior designer already use.
  function handleWindowKeyDown(e) {
    // The tree's own keydown already handles F2 for the focused row; this is the path for when
    // focus is somewhere else entirely (the canvas, a bar button) and the selection is the target.
    if (e.defaultPrevented) return;
    if (e.key !== 'F2' || isEditableTarget(e.target)) return;
    const ids = $selectedComponentIds;
    if (ids.size !== 1) return;
    const id = [...ids][0];
    const core = findControlById($activePanel?.controls ?? [], id)?._children?.Core;
    if (!core) return;
    e.preventDefault();
    startRename(id, core.name ?? '');
  }

  // --- Keyboard traversal (WAI-ARIA tree pattern) ---
  // The rows used to be non-focusable divs with the a11y warnings switched off above them, which
  // meant the tree was mouse-only: no way in from the keyboard, nothing for a screen reader to
  // read, and no Delete because there was nothing to press it on. The list is now a roving-
  // tabindex `role="tree"` — one row in the tab order at a time, arrows to move between them.
  let focusedId = $state(null);
  let focusedIndex = $derived(rows.findIndex((row) => row.id === focusedId));

  // windowed: the row to focus is often not mounted yet, so move the scroll first and let the
  // window catch up, then take focus on the next frame.
  function moveFocus(index, e) {
    const row = rows[index];
    if (!row) return;
    focusedId = row.id;
    scrollRowIntoView(index);
    if (e?.shiftKey && $keyObjectId != null) selectRange(row.id, e.ctrlKey || e.metaKey);
    else if (!e?.ctrlKey && !e?.metaKey) selectComponent(row.id, false);
    requestAnimationFrame(() => focusRowElement(row.id));
  }

  function focusRowElement(id) {
    treeListEl?.querySelector(`[data-tree-id="${CSS.escape(String(id))}"]`)?.focus?.({ preventScroll: true });
  }

  function handleTreeKeyDown(e) {
    if (renamingId != null || isEditableTarget(e.target)) return;

    const arrow = treeArrowTarget({
      rows,
      index: focusedIndex,
      key: e.key,
      expanded: (id) => filtering || !collapsedIds.has(id),
    });
    if (arrow) {
      e.preventDefault();
      if (arrow.type === 'move') moveFocus(arrow.index, e);
      else toggleCollapsed(arrow.id);
      return;
    }

    const row = rows[focusedIndex];
    if (!row) return;

    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      startRename(row.id, getSection(row.ctrl, 'Core')?.name ?? '');
    } else if (e.key === ' ') {
      e.preventDefault();
      selectComponent(row.id, true);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const ids = $selectedComponentIds.has(row.id) ? [...$selectedComponentIds] : [row.id];
      for (const id of ids) removeControl(id);
    } else if (e.key === 'Escape') {
      closeCtx();
    }
  }

  // --- Selection ---
  function selectRange(id, additive) {
    const ids = rows.map((row) => row.id);
    const a = ids.indexOf($keyObjectId);
    const b = ids.indexOf(id);
    if (a === -1 || b === -1) return false;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const range = ids.slice(lo, hi + 1);
    if (additive) selectedComponentIds.update((s) => new Set([...s, ...range]));
    else selectedComponentIds.set(new Set(range));
    return true;
  }

  function handleItemClick(id, e) {
    focusedId = id;
    // Range-select between the anchor (key object) and the clicked row, in display order.
    // Ctrl+Shift adds the range to the selection.
    if (e.shiftKey && $keyObjectId != null && selectRange(id, e.ctrlKey || e.metaKey)) return;
    if (e.ctrlKey || e.metaKey) {
      selectComponent(id, true);
    } else {
      selectComponent(id, false);
    }
  }

  // --- Visibility / Lock toggles ---
  // Acting on a row that is part of a multi-selection applies to the whole
  // selection; hiding 12 layers should not take 12 clicks.
  function idsForRowAction(id) {
    const sel = $selectedComponentIds;
    return sel.has(id) && sel.size > 1 ? [...sel] : [id];
  }

  function toggleVisible(id, current) {
    for (const targetId of idsForRowAction(id)) updateControlProperty(targetId, 'Core.visible', !current);
  }

  function toggleLocked(id, current) {
    for (const targetId of idsForRowAction(id)) updateControlProperty(targetId, 'Core.locked', !current);
  }

  // --- Context menu ---
  let ctxMenu = $state(null); // { x, y, id } | null

  function openContextMenu(id, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!$selectedComponentIds.has(id)) selectComponent(id, false);
    // Clamp so the menu never opens off-screen.
    const MENU_W = 200;
    const MENU_H = 330;
    ctxMenu = {
      x: Math.max(0, Math.min(e.clientX, window.innerWidth - MENU_W)),
      y: Math.max(0, Math.min(e.clientY, window.innerHeight - MENU_H)),
      id,
    };
  }

  function closeCtx() { ctxMenu = null; }

  let ctxControl = $derived(ctxMenu ? findControlById($activePanel?.controls ?? [], ctxMenu.id) : null);
  let ctxCore = $derived(ctxControl?._children?.Core ?? null);
  let ctxIsContainer = $derived(ctxControl ? isContainerControl(ctxControl) : false);
  let ctxSingle = $derived($selectedComponentIds.size <= 1);

  function ctxRename() {
    if (ctxMenu && ctxCore) startRename(ctxMenu.id, ctxCore.name ?? '');
    closeCtx();
  }

  function ctxDuplicate() {
    duplicateControl($selectedComponentIds.size > 0 ? $selectedComponentIds : [ctxMenu.id]);
    closeCtx();
  }

  function ctxDelete() {
    const ids = $selectedComponentIds.size > 0 ? [...$selectedComponentIds] : [ctxMenu.id];
    for (const id of ids) removeControl(id);
    closeCtx();
  }

  function ctxGroup() { groupSelectionIntoContainer(); closeCtx(); }
  function ctxUngroup() {
    if (ctxMenu && ctxIsContainer) ungroupContainer(ctxMenu.id);
    closeCtx();
  }

  function ctxOrder(fn) { fn(); closeCtx(); }

  function ctxToggleVisible() {
    if (ctxMenu) toggleVisible(ctxMenu.id, ctxCore?.visible !== false);
    closeCtx();
  }

  function ctxToggleLocked() {
    if (ctxMenu) toggleLocked(ctxMenu.id, ctxCore?.locked ?? false);
    closeCtx();
  }

  // --- Drag: reorder z-order (above/below) or nest into a container (onto) ---
  // Dragging a row that belongs to the selection moves the whole selection
  // (its roots); dragging an unselected row moves just that row.
  let dragOverId = $state(null);
  let dragOverPos = $state(null); // 'above' | 'below' | 'inside'
  let dragSourceIds = $state([]);

  function resetDragState() {
    dragOverId = null;
    dragOverPos = null;
    dragSourceIds = [];
    stopDragAutoScroll();
  }

  // --- Drag auto-scroll ---
  // A drag holds the pointer, so the wheel never reaches the list and the drop target has to be
  // on screen already: without this, moving a row from the bottom of a 413-row panel to the top
  // is not a slow operation, it is an impossible one. Hovering near an edge scrolls the list, at
  // a speed that ramps with how close to the edge the pointer is.
  let dragScrollFrame = 0;
  let dragScrollSpeed = 0;

  function stopDragAutoScroll() {
    if (dragScrollFrame) cancelAnimationFrame(dragScrollFrame);
    dragScrollFrame = 0;
    dragScrollSpeed = 0;
  }

  function stepDragAutoScroll() {
    dragScrollFrame = 0;
    if (!treeListEl || dragScrollSpeed === 0 || dragSourceIds.length === 0) return;
    treeListEl.scrollTop += dragScrollSpeed;
    scrollTop = treeListEl.scrollTop;
    dragScrollFrame = requestAnimationFrame(stepDragAutoScroll);
  }

  function updateDragAutoScroll(clientY) {
    if (!treeListEl) return;
    const rect = treeListEl.getBoundingClientRect();
    dragScrollSpeed = dragAutoScrollStep({ pointerY: clientY, top: rect.top, bottom: rect.bottom });
    if (dragScrollSpeed !== 0 && !dragScrollFrame) {
      dragScrollFrame = requestAnimationFrame(stepDragAutoScroll);
    } else if (dragScrollSpeed === 0) {
      stopDragAutoScroll();
    }
  }

  function handleDragStart(id, e) {
    const sel = $selectedComponentIds;
    dragSourceIds = sel.has(id) && sel.size > 1
      ? selectionRoots($activePanel?.controls ?? [], sel)
      : [id];
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }

  function handleDragOver(id, container, e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    updateDragAutoScroll(e.clientY);
    if (dragSourceIds.length === 0 || dragSourceIds.includes(id)) { dragOverId = null; return; }
    // Never allow dropping a container into its own subtree
    if ($activePanel && dragSourceIds.some((sourceId) => isDescendantOfControl($activePanel.controls, sourceId, id))) {
      dragOverId = null;
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const relY = (e.clientY - rect.top) / rect.height;
    dragOverId = id;
    if (container && relY > 0.3 && relY < 0.7) {
      // Middle band of a container row → nest inside
      dragOverPos = 'inside';
    } else {
      dragOverPos = relY < 0.5 ? 'above' : 'below';
    }
  }

  function handleDragLeave() {
    dragOverId = null;
    dragOverPos = null;
  }

  function handleDrop(e) {
    e.preventDefault();
    if (!$activePanel || dragSourceIds.length === 0 || !dragOverId || dragSourceIds.includes(dragOverId)) {
      resetDragState();
      return;
    }

    const controls = $activePanel.controls;
    const sources = dragSourceIds
      .map((id) => findControlById(controls, id))
      .filter(Boolean);
    const target = findControlById(controls, dragOverId);
    if (sources.length === 0 || !target) { resetDragState(); return; }

    if (dragOverPos === 'inside') {
      // Nest into the target container, keeping each visual position
      if (isContainerControl(target)) {
        const entries = [];
        for (const source of sources) {
          const sourceId = getControlId(source);
          const rect = controlPanelRect(controls, sourceId);
          if (!rect) continue;
          const local = panelToLocalPoint(controls, dragOverId, rect.x, rect.y);
          entries.push({ id: sourceId, x: local.x, y: local.y });
        }
        if (entries.length) reparentControls(entries, dragOverId);
      }
      resetDragState();
      return;
    }

    // Above/below → z-reorder among the TARGET's siblings. Layer compatibility
    // is checked BEFORE any mutation — the old flow reparented first and then
    // aborted the reorder, leaving a half-applied move.
    const targetLayer = getControlLayer(target);
    if (sources.some((source) => getControlLayer(source) !== targetLayer)) {
      resetDragState();
      return;
    }

    // Reparent sources living under a different parent (keeping visual position).
    const targetParent = findParentOfControl(controls, dragOverId);
    const targetParentId = targetParent ? getControlId(targetParent) : null;
    const reparentEntries = [];
    for (const source of sources) {
      const sourceId = getControlId(source);
      const sourceParent = findParentOfControl(controls, sourceId);
      const sourceParentId = sourceParent ? getControlId(sourceParent) : null;
      if (sourceParentId === targetParentId) continue;
      const rect = controlPanelRect(controls, sourceId);
      if (!rect) continue;
      const local = panelToLocalPoint(controls, targetParentId, rect.x, rect.y);
      reparentEntries.push({ id: sourceId, x: local.x, y: local.y });
    }
    if (reparentEntries.length) reparentControls(reparentEntries, targetParentId);

    // Re-read the (possibly reparented) tree for the sibling reorder
    const nextControls = $activePanel.controls;
    const parent = findParentOfControl(nextControls, dragOverId);
    const siblings = parent ? getChildControls(parent) : nextControls;
    const displayLayer = [...sortControlsForRender(siblings)].reverse().filter((c) => getControlLayer(c) === targetLayer);

    const movedSet = new Set(dragSourceIds);
    const movedItems = displayLayer.filter((c) => movedSet.has(getControlId(c)));
    if (movedItems.length === 0) { resetDragState(); return; }

    const reorderedDisplayLayer = displayLayer.filter((c) => !movedSet.has(getControlId(c)));
    let targetIndex = reorderedDisplayLayer.findIndex((c) => getControlId(c) === dragOverId);
    if (targetIndex < 0) { resetDragState(); return; }

    if (dragOverPos === 'below') targetIndex += 1;
    reorderedDisplayLayer.splice(targetIndex, 0, ...movedItems);

    const patches = new Map(
      [...reorderedDisplayLayer].reverse().map((control, index) => [getControlId(control), { 'Core.zIndex': index }])
    );
    applyControlPatchesById(patches);

    resetDragState();
  }

  function handleDragEnd() {
    resetDragState();
  }
</script>

<svelte:window onkeydown={handleWindowKeyDown} />

<div class="tree-panel">
  <div class="tree-header">
    <span class="tree-title">Components</span>
    <span class="tree-count">{totalCount}</span>
  </div>

  <div class="tree-filter">
    {@render search()}
    <input
      class="filter-input"
      type="text"
      placeholder="Filter by name or type"
      bind:value={filterText}
    />
    {#if filtering}
      <button class="filter-clear" title="Clear filter" onclick={() => filterText = ''}>×</button>
    {/if}
  </div>

  {#if renameNotice}
    <div class="rename-notice" role="status">{renameNotice}</div>
  {/if}

  <!--
    windowed: `.tree-list` scrolls, `.tree-window` is a full-height spacer so the scrollbar
    matches the real row count, and only `visibleRows` are mounted. `padTop` positions them.
    The ARIA tree lives on these two elements: the scroller is the `tree`, the rows inside are
    `treeitem`s carrying their real position via aria-posinset/aria-setsize, because most of
    their siblings are not in the DOM to be counted.
  -->
  <div
    class="tree-list"
    bind:this={treeListEl}
    bind:clientHeight={viewportHeight}
    onscroll={handleListScroll}
    ondragover={(e) => { e.preventDefault(); updateDragAutoScroll(e.clientY); }}
    ondragleave={(e) => { if (!treeListEl?.contains(e.relatedTarget)) stopDragAutoScroll(); }}
    role="tree"
    aria-label="Components"
    aria-multiselectable="true"
    tabindex="-1"
  >
    {#if rows.length === 0}
      <div class="tree-empty">{filtering ? 'No matches' : 'No components'}</div>
    {:else}
      <div class="tree-window" role="presentation" style="height: {rows.length * TREE_ROW_HEIGHT}px">
        <div class="tree-rows" role="presentation" style="transform: translateY({windowRange.padTop}px)">
          {#each visibleRows as row (row.id)}
            {@const core = getSection(row.ctrl, 'Core')}
            {@const id = row.id}
            {@const isSelected = $selectedComponentIds.has(id)}
            {@const isKey = $keyObjectId === id && $selectedComponentIds.size > 1}
            <div
              class="tree-item"
              class:selected={isSelected}
              class:key-object={isKey}
              class:hidden-item={core?.visible === false || row.inheritedHidden}
              class:drag-above={dragOverId === id && dragOverPos === 'above'}
              class:drag-below={dragOverId === id && dragOverPos === 'below'}
              class:drag-inside={dragOverId === id && dragOverPos === 'inside'}
              style="padding-left: {10 + row.depth * 14}px"
              data-tree-id={id}
              role="treeitem"
              aria-selected={isSelected}
              aria-level={row.depth + 1}
              aria-posinset={row.posinset}
              aria-setsize={row.setsize}
              aria-expanded={row.container ? (filtering || !collapsedIds.has(id)) : undefined}
              tabindex={focusedId === id || (focusedId == null && row === visibleRows[0]) ? 0 : -1}
              onfocus={() => { focusedId = id; }}
              onkeydown={handleTreeKeyDown}
              onclick={(e) => handleItemClick(id, e)}
              ondblclick={() => startRename(id, core?.name ?? '')}
              oncontextmenu={(e) => openContextMenu(id, e)}
              draggable="true"
              ondragstart={(e) => handleDragStart(id, e)}
              ondragover={(e) => handleDragOver(id, row.container, e)}
              ondragleave={handleDragLeave}
              ondrop={handleDrop}
              ondragend={handleDragEnd}
            >
              {#if row.container}
                <button
                  class="collapse-toggle"
                  tabindex="-1"
                  aria-label={collapsedIds.has(id) ? `Expand ${core?.name ?? 'container'}` : `Collapse ${core?.name ?? 'container'}`}
                  title={collapsedIds.has(id) ? 'Expand' : 'Collapse'}
                  onclick={(e) => { e.stopPropagation(); toggleCollapsed(id); }}
                >
                  {#if collapsedIds.has(id) && !filtering}
                    {@render chevronRight()}
                  {:else}
                    {@render chevronDown()}
                  {/if}
                </button>
              {:else}
                <span class="collapse-spacer"></span>
              {/if}

              <!--
                The type badge only earns its 72px when the name has stopped saying the type. It used
                to print `MomentaryButton` next to `MomentaryButton_12` in a 200px panel — half the
                width spent repeating the other half. See typeBadgeAddsInformation.
              -->
              {#if typeBadgeAddsInformation(core?.name, core?.controlType)}
                <span class="item-type" title={core?.controlType}>{core?.controlType ?? '?'}</span>
              {/if}

              {#if renamingId === id}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  class="rename-input"
                  type="text"
                  bind:value={renameValue}
                  onblur={commitRename}
                  onkeydown={handleRenameKeyDown}
                  onfocus={(e) => e.target.select()}
                  autofocus
                  onclick={(e) => e.stopPropagation()}
                />
              {:else}
                <span class="item-name" title={core?.name}>{core?.name ?? ''}</span>
              {/if}

              <div class="item-actions">
                {#if row.inheritedLocked}
                  <span class="inherited-icon" title="Locked by a parent container">{@render lockSmall()}</span>
                {/if}
                <button
                  class="action-icon"
                  class:off={core?.visible === false}
                  tabindex="-1"
                  aria-label={core?.visible !== false ? `Hide ${core?.name ?? 'component'}` : `Show ${core?.name ?? 'component'}`}
                  title={core?.visible !== false ? 'Hide' : 'Show'}
                  onclick={(e) => { e.stopPropagation(); toggleVisible(id, core?.visible !== false); }}
                >
                  {#if core?.visible !== false}
                    {@render eye()}
                  {:else}
                    {@render eyeOff()}
                  {/if}
                </button>
                <button
                  class="action-icon"
                  class:on={core?.locked}
                  tabindex="-1"
                  aria-label={core?.locked ? `Unlock ${core?.name ?? 'component'}` : `Lock ${core?.name ?? 'component'}`}
                  title={core?.locked ? 'Unlock' : 'Lock'}
                  onclick={(e) => { e.stopPropagation(); toggleLocked(id, core?.locked ?? false); }}
                >
                  {#if core?.locked}
                    {@render lock()}
                  {:else}
                    {@render lockOpen()}
                  {/if}
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

{#if ctxMenu}
  <!-- A real button rather than a bare div, so dismissing the menu is reachable from the
       keyboard too (Escape is handled on the menu itself). -->
  <button
    class="ctx-backdrop"
    aria-label="Close menu"
    onmousedown={closeCtx}
    oncontextmenu={(e) => { e.preventDefault(); closeCtx(); }}
  ></button>
  <div
    class="ctx-menu"
    role="menu"
    tabindex="-1"
    onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); closeCtx(); } }}
    style="left:{ctxMenu.x}px; top:{ctxMenu.y}px;"
  >
    {#if ctxSingle}
      <button class="ctx-item" role="menuitem" onclick={ctxRename}>Rename<span class="ctx-shortcut">F2</span></button>
    {/if}
    <button class="ctx-item" role="menuitem" onclick={ctxDuplicate}>Duplicate<span class="ctx-shortcut">Ctrl+D</span></button>
    <button class="ctx-item ctx-danger" role="menuitem" onclick={ctxDelete}>Delete<span class="ctx-shortcut">Del</span></button>
    <div class="ctx-separator"></div>
    <button class="ctx-item" role="menuitem" onclick={ctxGroup}>Group into Container<span class="ctx-shortcut">Ctrl+G</span></button>
    {#if ctxSingle && ctxIsContainer}
      <button class="ctx-item" role="menuitem" onclick={ctxUngroup}>Ungroup<span class="ctx-shortcut">Ctrl+Shift+G</span></button>
    {/if}
    <div class="ctx-separator"></div>
    <button class="ctx-item" role="menuitem" onclick={() => ctxOrder(bringToFront)}>Bring to Front</button>
    <button class="ctx-item" role="menuitem" onclick={() => ctxOrder(bringForward)}>Bring Forward</button>
    <button class="ctx-item" role="menuitem" onclick={() => ctxOrder(sendBackward)}>Send Backward</button>
    <button class="ctx-item" role="menuitem" onclick={() => ctxOrder(sendToBack)}>Send to Back</button>
    <div class="ctx-separator"></div>
    <button class="ctx-item" role="menuitem" onclick={ctxToggleVisible}>{ctxCore?.visible !== false ? 'Hide' : 'Show'}</button>
    <button class="ctx-item" role="menuitem" onclick={ctxToggleLocked}>{ctxCore?.locked ? 'Unlock' : 'Lock'}</button>
  </div>
{/if}

<!-- Row icons, drawn inline. See the note at the top of the script for why these are not
     lucide-svelte components. Path data is lucide's own (ISC), copied verbatim. -->
{#snippet chevronRight()}
  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
{/snippet}

{#snippet chevronDown()}
  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
{/snippet}

{#snippet eye()}
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
{/snippet}

{#snippet eyeOff()}
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
    <path d="m2 2 20 20" />
  </svg>
{/snippet}

{#snippet lock()}
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
{/snippet}

{#snippet lockOpen()}
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
{/snippet}

{#snippet lockSmall()}
  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
{/snippet}

{#snippet search()}
  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
{/snippet}

<style>
  .tree-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1E1E1E;
    border-left: 1px solid #333;
    overflow: hidden;
  }

  .tree-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: #252525;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
  }

  .tree-title {
    font-size: 11px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tree-count {
    font-size: 10px;
    color: #555;
    background: #2A2A2A;
    padding: 1px 6px;
    border-radius: 8px;
  }

  .tree-filter {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-bottom: 1px solid #2A2A2A;
    color: #555;
    flex-shrink: 0;
  }

  .filter-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: #CCC;
    font-size: 11px;
    font-family: inherit;
    padding: 2px 0;
  }

  .filter-input::placeholder { color: #555; }

  .filter-clear {
    background: none;
    border: none;
    color: #777;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
  }

  .filter-clear:hover { color: #CCC; }

  /* No vertical padding: the window maths maps scrollTop straight onto row indexes, and a 4px
     lead-in would put every row 4px away from where the arithmetic says it is. */
  .tree-list {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }

  .tree-list::-webkit-scrollbar { width: 6px; }
  .tree-list::-webkit-scrollbar-track { background: transparent; }
  .tree-list::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }

  .tree-empty {
    padding: 20px;
    text-align: center;
    color: #444;
    font-size: 11px;
  }

  /* windowed: the spacer owns the full scroll height, the row strip is offset into place. */
  .tree-window {
    position: relative;
  }

  .tree-rows {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }

  /* The window maths cannot measure, so the row height is a constant in two places: here and
     TREE_ROW_HEIGHT in utils/componentTreeView.js. Change one and change the other, or the
     scrollbar and the rows disagree. */
  .tree-item {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    box-sizing: border-box;
    padding: 4px 10px;
    cursor: pointer;
    border-top: 2px solid transparent;
    border-bottom: 2px solid transparent;
    user-select: none;
  }

  .tree-item:focus-visible {
    outline: 1px solid #5B9BD5;
    outline-offset: -1px;
  }

  .rename-notice {
    padding: 4px 10px;
    font-size: 10px;
    color: #E5A029;
    background: #2A2415;
    border-bottom: 1px solid #3A3216;
    flex-shrink: 0;
  }

  .tree-item:hover {
    background: #2A2A2A;
  }

  .tree-item.selected {
    background: #094771;
  }

  .tree-item.selected.key-object {
    background: #4A3000;
  }

  .tree-item.hidden-item {
    opacity: 0.4;
  }

  .tree-item.drag-above {
    border-top-color: #5B9BD5;
  }

  .tree-item.drag-below {
    border-bottom-color: #5B9BD5;
  }

  .tree-item.drag-inside {
    outline: 1px solid #5B9BD5;
    outline-offset: -1px;
    background: rgba(91, 155, 213, 0.12);
  }

  .collapse-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    background: none;
    border: none;
    color: #777;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
  }

  .collapse-toggle:hover { color: #CCC; }

  .collapse-spacer {
    width: 14px;
    flex-shrink: 0;
  }

  .item-type {
    font-size: 9px;
    color: #5B9BD5;
    background: #1A2A3A;
    padding: 1px 4px;
    border-radius: 2px;
    flex-shrink: 1;
    max-width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }

  .item-name {
    flex: 1;
    font-size: 11px;
    color: #CCC;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rename-input {
    flex: 1;
    background: #1A1A1A;
    border: 1px solid #5B9BD5;
    border-radius: 3px;
    color: #DDD;
    font-size: 11px;
    font-family: inherit;
    padding: 1px 4px;
    outline: none;
  }

  .item-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .inherited-icon {
    display: flex;
    align-items: center;
    color: #7A6A35;
  }

  .action-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    border-radius: 3px;
    padding: 0;
    opacity: 0;
    transition: opacity 0.1s;
  }

  /* Always show icons that are in active/non-default state */
  .action-icon.off { opacity: 1; color: #E55; }
  .action-icon.on  { opacity: 1; color: #E5A029; }

  /* Show all icons on hover or selection */
  .tree-item:hover .action-icon,
  .tree-item.selected .action-icon {
    opacity: 1;
  }

  .action-icon:hover { background: #333; color: #CCC; }

  /* Context menu (shares the canvas menu's look) */
  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
    background: none;
    border: none;
    padding: 0;
    cursor: default;
  }

  .ctx-menu {
    position: fixed;
    z-index: 1000;
    min-width: 180px;
    background: #2D2D2D;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  }

  .ctx-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 5px 12px;
    background: none;
    border: none;
    color: #CCC;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .ctx-item:hover {
    background: #094771;
    color: #FFF;
  }

  .ctx-item.ctx-danger:hover {
    background: #6B1A1A;
  }

  .ctx-shortcut {
    color: #777;
    font-size: 11px;
    margin-left: 24px;
  }

  .ctx-item:hover .ctx-shortcut {
    color: #AAD;
  }

  .ctx-separator {
    height: 1px;
    background: #444;
    margin: 4px 8px;
  }
</style>
