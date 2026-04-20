/**
 * Tab selection state used by PropertiesPanel.
 *
 * Takes getters and setters for `single` (string) and `multi` (Set<string>),
 * plus shared view-mode getters/setters. Returns click/toggle/isActive
 * handlers that respect ctrl+click for multi-select and single-mode selection.
 *
 * Using closures instead of passing a reactive state object keeps the
 * controller independent of how the consumer stores its state (plain vars,
 * $state proxies, writable stores, etc.).
 */
export function createTabViewState({
  getSingle, setSingle,
  getMulti, setMulti,
  getViewMode, setViewMode,
}) {
  function handleClick(id, e) {
    if (e.ctrlKey || e.metaKey) {
      toggleMulti(id);
      if (getMulti().size > 1) setViewMode('multi');
    } else if (getViewMode() === 'single') {
      setSingle(id);
    } else {
      toggleMulti(id);
    }
  }

  function toggleMulti(id) {
    const next = new Set(getMulti());
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    setMulti(next);
    if (next.size === 1) setSingle([...next][0]);
  }

  function isActive(id) {
    return getViewMode() === 'single' ? getSingle() === id : getMulti().has(id);
  }

  return { handleClick, toggleMulti, isActive };
}
