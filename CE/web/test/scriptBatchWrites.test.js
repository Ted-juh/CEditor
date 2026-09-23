// scriptBatchWrites.test.js — authored-property writes are one document publication per callback.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { runScript, scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  activeEditorTab, activePanelId, panels,
} from '../src/CE_Application/stores/panels.js';
import {
  clearScriptTouchedControls, scriptTouchedControlIds,
} from '../src/CE_Application/stores/scriptTouchedControls.js';

function label(name, text = '') {
  return createControl('Label', { name, Text: { content: text } });
}

async function withEditorPanel(fn) {
  const panel = {
    id: 'batch-panel', name: 'Batch', width: 400, height: 300,
    scripting: { modules: ['ce.core', 'ce.panel', 'ce.time'] },
    controls: [label('a', 'A'), label('b', 'B')],
  };
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  try { return await fn(); }
  finally {
    panels.set([]);
    activePanelId.set(null);
    activeEditorTab.set({ type: 'panel', id: null });
  }
}

function publicationsDuring(fn) {
  let publications = -1; // writable subscriptions deliver their current value immediately
  const unsubscribe = panels.subscribe(() => { publications += 1; });
  try { fn(); } finally { unsubscribe(); }
  return publications;
}

test('panel.batch publishes many authored writes once and reads its pending values', async () => {
  await withEditorPanel(() => {
    const api = scriptApiForTesting('', 'batch-test');
    clearScriptTouchedControls();
    let touchedPublications = -1;
    const unsubscribeTouched = scriptTouchedControlIds.subscribe(() => { touchedPublications += 1; });
    const publications = publicationsDuring(() => {
      assert.equal(api.panelBatch(() => {
        api.set('a.Text.content', 'one');
        assert.equal(api.get('a.Text.content'), 'one');
        api.set('a.Text.content', 'two');
        api.set('b.Text.content', 'three');
      }), true);
    });
    unsubscribeTouched();

    assert.equal(publications, 1);
    assert.equal(touchedPublications, 1, 'touched ids are published once with the document batch');
    assert.equal(api.get('a.Text.content'), 'two', 'the last write to a path wins');
    assert.equal(api.get('b.Text.content'), 'three');
  });
});

test('overlapping parent and child paths keep exact last-write order', async () => {
  await withEditorPanel(() => {
    const api = scriptApiForTesting('', 'batch-test');
    const original = structuredClone(api.get('a.Text'));
    api.panelBatch(() => {
      api.set('a.Text', { ...original, content: 'first parent' });
      api.set('a.Text.content', 'child');
      api.set('a.Text', { ...original, content: 'final parent' });
    });
    assert.equal(api.get('a.Text.content'), 'final parent');
  });
});

test('a structural edit folds pending properties into its publication without a duplicate flush', async () => {
  await withEditorPanel(() => {
    const api = scriptApiForTesting('', 'batch-test');
    const publications = publicationsDuring(() => api.panelBatch(() => {
      api.set('a.Text.content', 'before structure');
      api.panelAlign(['a', 'b'], 'left');
    }));
    assert.equal(publications, 1);
    assert.equal(api.get('a.Text.content'), 'before structure');
  });
});

test('nested and throwing batches flush once, while no-op batches publish nothing', async () => {
  await withEditorPanel(() => {
    const api = scriptApiForTesting('', 'batch-test');
    assert.equal(publicationsDuring(() => api.panelBatch(() => {
      api.panelBatch(() => api.set('a.Text.content', 'changed'));
      api.set('b.Text.content', 'also changed');
    })), 1);

    assert.equal(publicationsDuring(() => api.panelBatch(() => {
      api.set('a.Text.content', 'changed');
      api.set('b.Text.content', 'also changed');
    })), 0, 'writing only current values is allocation and publication free');

    const publications = publicationsDuring(() => {
      assert.throws(() => api.panelBatch(() => {
        api.set('a.Text.content', 'kept after throw');
        throw new Error('boom');
      }), /boom/);
    });
    assert.equal(publications, 1);
    assert.equal(api.get('a.Text.content'), 'kept after throw');
  });
});

test('a callback batches automatically and rename-then-lookup stays synchronous', async () => {
  await withEditorPanel(async () => {
    const script = {
      id: 'batch-script', name: 'Batch script', language: 'javascript', event: 'onCustom',
      target: '*', enabled: true,
      source: `function onCustom() {
        set('a.Core.name', 'renamed');
        set('renamed.Text.content', 'found by its new name');
        set('b.Text.content', get('renamed.Text.content'));
      }`,
    };
    let publications = -1;
    const unsubscribe = panels.subscribe(() => { publications += 1; });
    try { await runScript(script, 'onCustom'); } finally { unsubscribe(); }

    assert.equal(publications, 1);
    const controls = get(panels)[0].controls;
    assert.equal(controls[0]._children.Core.name, 'renamed');
    assert.equal(controls[0]._children.Text.content, 'found by its new name');
    assert.equal(controls[1]._children.Text.content, 'found by its new name');
  });
});

test('an after callback publishes a large document repaint once', async () => {
  await withEditorPanel(async () => {
    const api = scriptApiForTesting('', 'after-batch-test');
    let publications = -1;
    const unsubscribe = panels.subscribe(() => { publications += 1; });
    try {
      api.after(10, () => {
        for (let i = 0; i < 100; i += 1) {
          api.set('a.Text.content', `a-${i}`);
          api.set('b.Text.content', `b-${i}`);
        }
      });
      await new Promise((resolve) => setTimeout(resolve, 80));
    } finally { unsubscribe(); }

    assert.equal(publications, 1);
    assert.equal(api.get('a.Text.content'), 'a-99');
    assert.equal(api.get('b.Text.content'), 'b-99');
  });
});

test('a batch flushes to its starting panel if selection changes before finally', async () => {
  const first = {
    id: 'first', name: 'First', width: 400, height: 300,
    scripting: { modules: ['ce.core', 'ce.panel'] }, controls: [label('a', 'first')],
  };
  const second = {
    id: 'second', name: 'Second', width: 400, height: 300,
    scripting: { modules: ['ce.core', 'ce.panel'] }, controls: [label('a', 'second')],
  };
  second.controls[0]._children.Core.id = first.controls[0]._children.Core.id;
  panels.set([first, second]);
  activePanelId.set(first.id);
  activeEditorTab.set({ type: 'panel', id: first.id });
  try {
    const api = scriptApiForTesting('', 'batch-test');
    api.panelBatch(() => {
      api.set('a.Text.content', 'belongs to first');
      activePanelId.set(second.id);
      activeEditorTab.set({ type: 'panel', id: second.id });
      assert.equal(api.get('a.Text.content'), 'second');
      api.set('a.Text.content', 'belongs to second');
    });
    assert.equal(get(panels)[0].controls[0]._children.Text.content, 'belongs to first');
    assert.equal(get(panels)[1].controls[0]._children.Text.content, 'belongs to second');
  } finally {
    panels.set([]);
    activePanelId.set(null);
    activeEditorTab.set({ type: 'panel', id: null });
  }
});
