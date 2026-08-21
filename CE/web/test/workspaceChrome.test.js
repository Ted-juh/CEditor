import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPACT_CHROME_BREAKPOINT,
  classifyWorkspace,
  resolveWorkspaceChrome,
  workspaceOwnsChrome,
} from '../src/CE_Application/utils/workspaceChrome.js';

test('workspace chrome ownership follows active workspace type', () => {
  assert.equal(classifyWorkspace({ activeTab: { type: 'panel' }, componentWorkspaceMode: 'panel' }), 'panel');
  assert.equal(classifyWorkspace({ activeTab: { type: 'script' }, componentWorkspaceMode: 'panel' }), 'script');
  assert.equal(classifyWorkspace({ activeTab: { type: 'deviceProfile' }, componentWorkspaceMode: 'panel' }), 'device');
  assert.equal(classifyWorkspace({ activeTab: { type: 'panel' }, componentWorkspaceMode: 'surface' }), 'component');
  assert.equal(classifyWorkspace({ activeTab: { type: 'component' }, componentWorkspaceMode: 'surface' }), 'component');

  assert.equal(workspaceOwnsChrome('panel'), false);
  assert.equal(workspaceOwnsChrome('component'), true);
  assert.equal(workspaceOwnsChrome('device'), true);
  assert.equal(workspaceOwnsChrome('script'), true);
});

test('stale component surface mode does not override standalone workspaces', () => {
  assert.equal(classifyWorkspace({ activeTab: { type: 'script' }, componentWorkspaceMode: 'surface' }), 'script');
  assert.equal(classifyWorkspace({ activeTab: { type: 'deviceProfile' }, componentWorkspaceMode: 'surface' }), 'device');
  assert.equal(classifyWorkspace({ activeTab: { type: 'settings' }, componentWorkspaceMode: 'surface' }), 'settings');
});

test('owned workspaces suppress global editor chrome', () => {
  const state = resolveWorkspaceChrome({
    activeTab: { type: 'deviceProfile' },
    componentWorkspaceMode: 'panel',
    viewportWidth: 1440,
    showTreePanel: true,
    showDisplayPanel: true,
    showPropertiesPanel: true,
  });

  assert.equal(state.workspaceKind, 'device');
  assert.equal(state.ownsChrome, true);
  assert.equal(state.showTreePanel, false);
  assert.equal(state.showDisplayPanel, false);
  assert.equal(state.showPropertiesPanel, false);
  // The rail is part of the persistent shell: it stays, but may not insert
  // into (or toggle panels over) a workspace that isn't the panel canvas.
  assert.equal(state.iconWidth, 48);
  assert.equal(state.railTogglesEnabled, false);
  assert.equal(state.railInsertEnabled, false);
});

test('component workspace keeps the properties panel (author inspector)', () => {
  const state = resolveWorkspaceChrome({
    activeTab: { type: 'panel' },
    componentWorkspaceMode: 'surface',
    viewportWidth: 1440,
    showTreePanel: true,
    showDisplayPanel: true,
    showPropertiesPanel: false, // even a persisted "hidden" pref cannot strand the author tabs
  });

  assert.equal(state.workspaceKind, 'component');
  assert.equal(state.ownsChrome, true);
  assert.equal(state.showPropertiesPanel, true);
  assert.equal(state.showTreePanel, false);
  assert.equal(state.showDisplayPanel, false);
});

test('compact panel view hides side chrome without changing ownership', () => {
  const state = resolveWorkspaceChrome({
    activeTab: { type: 'panel' },
    componentWorkspaceMode: 'panel',
    viewportWidth: COMPACT_CHROME_BREAKPOINT - 1,
    showTreePanel: true,
    showDisplayPanel: true,
    showPropertiesPanel: true,
  });

  assert.equal(state.workspaceKind, 'panel');
  assert.equal(state.ownsChrome, false);
  assert.equal(state.compactPanel, true);
  assert.equal(state.showTreePanel, false);
  assert.equal(state.showDisplayPanel, false);
  assert.equal(state.showPropertiesPanel, false);
  // Compact keeps the rail too — the old layout dropped it below the
  // breakpoint, taking the only panel toggles down with it, so the state
  // was inescapable without widening the window. Insertion stays live
  // (the canvas is right there); only the panel toggles rest.
  assert.equal(state.iconWidth, 48);
  assert.equal(state.railTogglesEnabled, false);
  assert.equal(state.railInsertEnabled, true);
});

test('wide panel view preserves requested global chrome', () => {
  const state = resolveWorkspaceChrome({
    activeTab: { type: 'panel' },
    componentWorkspaceMode: 'panel',
    viewportWidth: COMPACT_CHROME_BREAKPOINT,
    showTreePanel: true,
    showDisplayPanel: false,
    showPropertiesPanel: true,
  });

  assert.equal(state.compactPanel, false);
  assert.equal(state.iconWidth, 48);
  assert.equal(state.showTreePanel, true);
  assert.equal(state.showDisplayPanel, false);
  assert.equal(state.showPropertiesPanel, true);
  assert.equal(state.railTogglesEnabled, true);
  assert.equal(state.railInsertEnabled, true);
});

test('the component workspace keeps the rail but disarms insertion', () => {
  // In surface mode a real panel sits hidden behind the designer, and
  // resolvedActivePanelId still points at it — rail insertion must not
  // silently drop controls into a document the user cannot see.
  const state = resolveWorkspaceChrome({
    activeTab: { type: 'panel' },
    componentWorkspaceMode: 'surface',
    viewportWidth: 1440,
    showTreePanel: true,
    showDisplayPanel: true,
    showPropertiesPanel: true,
  });

  assert.equal(state.workspaceKind, 'component');
  assert.equal(state.iconWidth, 48);
  assert.equal(state.railTogglesEnabled, false);
  assert.equal(state.railInsertEnabled, false);
});
