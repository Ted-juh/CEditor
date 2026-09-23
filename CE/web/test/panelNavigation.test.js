import test from 'node:test';
import assert from 'node:assert/strict';
import { withViewerActiveIndex, withNotepadActiveIndex } from '../src/CE_Application/utils/panelNavigation.js';

test('viewer and note navigation preserve saved status and content identity', () => {
  const images = [{ id: 'image-a' }, { id: 'image-b' }];
  const notes = [{ name: 'One', content: 'text' }, { name: 'Two', content: 'more' }];
  const panel = {
    id: 'panel-a', modified: false,
    viewer: { images, activeImageIndex: 0 },
    notepad: { notes, activeNoteIndex: 0 },
  };

  const viewer = withViewerActiveIndex(panel, 1);
  assert.equal(viewer.modified, false);
  assert.equal(viewer.viewer.images, images);
  assert.equal(viewer.viewer.activeImageIndex, 1);
  assert.equal(withViewerActiveIndex(viewer, 1), viewer);

  const notepad = withNotepadActiveIndex(viewer, 1);
  assert.equal(notepad.modified, false);
  assert.equal(notepad.notepad.notes, notes);
  assert.equal(notepad.notepad.activeNoteIndex, 1);
  assert.equal(withNotepadActiveIndex(notepad, 1), notepad);
});
