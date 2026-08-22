import { get } from 'svelte/store';
import { panels, resolvedActivePanelId, selectedComponentIds } from './panels.js';
import { removeControl } from './controls.js';
import {
  collectControlNames,
  controlPanelRect,
  findControlById,
  findParentOfControl,
  flatControls,
  insertControlIntoTree,
  isContainerControl,
  panelToLocalPoint,
  remintControlIds,
  selectionRoots,
  uniqueCopyName,
} from '../utils/containment.js';

/**
 * Internal clipboard buffer. Each entry keeps the control with its ORIGINAL
 * local coordinates plus enough context to paste like duplicate does:
 *   control  — deep clone, Transform still parent-relative
 *   parentId — the container it lived in (null = top level)
 *   panelX/Y — its panel-space position, for pasting where the parent is gone
 *   sourceId — the id the copy was taken FROM, so paste can refuse to nest a
 *              container inside itself (see selectedContainerTarget)
 * Not a Svelte store; nothing reads it reactively.
 */
let buffer = [];

/**
 * Everything about paste that is remembered BETWEEN pastes.
 *
 *   origin   — the ORIGINAL coordinates, never re-anchored. Paste-in-place
 *              restores from here, which is the whole point of it: staggering
 *              the buffer must not slowly walk "in place" away from the place.
 *   anchorPanelId — the panel `buffer`'s coordinates currently belong to.
 *              The stagger is relative to the LAST paste, so it only makes
 *              sense while the coordinates and the target agree. Paste the
 *              same clipboard into a DIFFERENT panel and +20/+20 would be an
 *              offset from a position that panel has never seen — so the
 *              first paste into a new panel is not offset at all, and the
 *              staggering starts from there.
 *   lastPastedIds — what the previous paste produced. Paste auto-selects its
 *              output, so without this "paste into the selected container"
 *              would nest each paste inside the previous one: Ctrl+V Ctrl+V on
 *              a Group buries the second copy inside the first.
 */
const PASTE_STEP = 20;
let origin = [];
let anchorPanelId = null;
let lastPastedIds = new Set();

/**
 * Copy all currently selected controls into the clipboard buffer.
 */
export function copySelection() {
  const ids = get(selectedComponentIds);
  if (ids.size === 0) return;

  const panel = get(panels).find(p => p.id === get(resolvedActivePanelId));
  if (!panel) return;

  // Copy selection roots only (a selected child inside a selected container
  // rides along in the subtree).
  buffer = selectionRoots(panel.controls, ids)
    .map(id => {
      const source = findControlById(panel.controls, id);
      if (!source) return null;
      const rect = controlPanelRect(panel.controls, id);
      const parent = findParentOfControl(panel.controls, id);
      return {
        control: JSON.parse(JSON.stringify(source)),
        parentId: parent?._children?.Core?.id ?? null,
        panelX: rect?.x ?? source._children?.Transform?.x ?? 0,
        panelY: rect?.y ?? source._children?.Transform?.y ?? 0,
        sourceId: id,
      };
    })
    .filter(Boolean);

  // The pristine copy paste-in-place restores from, and the anchor the stagger
  // is measured against. Both are reset by every copy — a fresh clipboard has
  // never been pasted, so the next paste is its first.
  origin = buffer.map(entry => ({ ...entry, control: JSON.parse(JSON.stringify(entry.control)) }));
  anchorPanelId = panel.id;
  lastPastedIds = new Set();
}

/**
 * Cut = copy + delete. Deletes the selection ROOTS, mirroring what copy
 * captured — a selected child of a selected container is one subtree
 * operation, not two removals.
 */
export function cutSelection() {
  copySelection();
  const panel = get(panels).find(p => p.id === get(resolvedActivePanelId));
  const ids = get(selectedComponentIds);
  const roots = panel ? selectionRoots(panel.controls, ids) : [...ids];
  for (const id of roots) removeControl(id);
}

/**
 * Which container should this paste land in, if any?
 *
 * Exactly one selected container, and the answer is "that one" — the same rule
 * insertion already follows (controls.js selectedContainerParentId), so a
 * container selected on the canvas means the same thing to Insert and to
 * Paste. Two refusals, both learned the hard way:
 *
 *  - the container the previous paste produced. Paste selects its own output,
 *    so without this each Ctrl+V would bury the next copy one level deeper.
 *  - the container the copy was TAKEN from, while it is still the selection.
 *    Copy a Group with the Group selected and the expected paste is a sibling
 *    beside it, not a second Group hidden inside the first.
 */
function selectedContainerTarget(controls, entries) {
  const selected = get(selectedComponentIds);
  if (selected.size !== 1) return null;
  const id = [...selected][0];
  if (lastPastedIds.has(id)) return null;
  if (entries.some(entry => entry.sourceId === id)) return null;
  const control = findControlById(controls, id);
  return control && isContainerControl(control) ? id : null;
}

/**
 * The bounding box of a set of buffer entries, in panel space — used to centre
 * a "Paste Here" on the click point.
 */
function entriesPanelCentre(entries) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const entry of entries) {
    const t = entry.control._children?.Transform;
    if (!t) continue;
    minX = Math.min(minX, entry.panelX);
    minY = Math.min(minY, entry.panelY);
    maxX = Math.max(maxX, entry.panelX + (t.width || 0));
    maxY = Math.max(maxY, entry.panelY + (t.height || 0));
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0 };
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/**
 * Place a clone in `parentId`'s frame and return the tree with it inserted.
 *
 * Three frames, three rules, and they are not interchangeable — getting this
 * wrong is how a control pasted into a container ends up hundreds of units off
 * the panel, because its parent-relative x/y was read as if it were panel space.
 */
function placeClone(controls, clone, entry, parentId, offsetX, offsetY) {
  const t = clone._children?.Transform;
  if (t) {
    if (parentId != null && parentId === entry.parentId) {
      // Back into the frame it came out of: the clone's local coords already
      // mean the right thing, so only the stagger is applied.
      t.x = (t.x ?? 0) + offsetX;
      t.y = (t.y ?? 0) + offsetY;
    } else if (parentId != null) {
      // A DIFFERENT container. The clone's local coords are relative to a frame
      // this container knows nothing about, so re-express the panel-space
      // position in the target's content frame and clamp it inside — the same
      // arithmetic addControl does when it inserts into a selected container.
      const parent = findControlById(controls, parentId);
      const parentW = parent?._children?.Transform?.width ?? 0;
      const parentH = parent?._children?.Transform?.height ?? 0;
      const local = panelToLocalPoint(controls, parentId, entry.panelX + offsetX, entry.panelY + offsetY);
      t.x = Math.max(0, Math.min(Math.round(local.x), Math.max(0, parentW - (t.width || 0))));
      t.y = Math.max(0, Math.min(Math.round(local.y), Math.max(0, parentH - (t.height || 0))));
    } else {
      // Top level: panel space is the frame.
      t.x = entry.panelX + offsetX;
      t.y = entry.panelY + offsetY;
    }
  }
  return parentId != null
    ? insertControlIntoTree(controls, parentId, clone)
    : [...controls, clone];
}

/**
 * The one paste. `pasteSelection` and `pasteInPlace` are the two ways in.
 *
 * @param {object}  opts
 * @param {{x:number,y:number}|null} opts.position  "Paste Here" — top level,
 *   centred on the click point. The click location is the intent, so it beats
 *   both the original parent and the selected container.
 * @param {boolean} opts.inPlace  Original coordinates, original parent. Reads
 *   `origin` rather than `buffer` so it is unaffected by how many staggered
 *   pastes have happened since the copy, and it does not re-anchor the buffer
 *   for the same reason — two paste-in-places land on the same spot, which is
 *   what every other tool does and what the name promises.
 */
function paste({ position = null, inPlace = false } = {}) {
  const entries = inPlace ? origin : buffer;
  if (entries.length === 0) return;

  const panelId = get(resolvedActivePanelId);
  if (panelId == null) return;

  const newIds = [];

  panels.update(list =>
    list.map(p => {
      if (p.id !== panelId) return p;

      // The stagger only means something relative to the last paste in THIS
      // panel. In place means no offset by definition; a first paste into a
      // panel the clipboard has not been pasted into yet is not an offset from
      // anything, so it lands where it was copied from.
      let offsetX = 0;
      let offsetY = 0;
      if (!inPlace && !position && p.id === anchorPanelId) {
        offsetX = PASTE_STEP;
        offsetY = PASTE_STEP;
      }
      if (position) {
        const centre = entriesPanelCentre(entries);
        offsetX = position.x - centre.x;
        offsetY = position.y - centre.y;
      }

      let controls = p.controls;
      const existingNames = collectControlNames(controls);
      const containerTarget = (position || inPlace) ? null : selectedContainerTarget(controls, entries);
      const nextBuffer = [];

      for (const entry of entries) {
        // Fresh ids for the control and its whole subtree
        const clone = remintControlIds(entry.control);
        const name = uniqueCopyName(existingNames, clone._children.Core.name);
        clone._children.Core.name = name;
        existingNames.add(name);

        const originalParentAlive = entry.parentId != null && !!findControlById(controls, entry.parentId);
        // Precedence: an explicit click point, then the container the user has
        // selected, then the container it was copied out of if it survived.
        let parentId = null;
        if (!position) {
          if (containerTarget != null) parentId = containerTarget;
          else if (originalParentAlive) parentId = entry.parentId;
        }

        controls = placeClone(controls, clone, entry, parentId, offsetX, offsetY);

        const cloneId = clone._children.Core.id;
        newIds.push(cloneId);

        // Successive pastes keep staggering from the last paste — and from
        // where it actually landed, which is why the rect is read back off the
        // tree instead of being predicted from the offset.
        const rect = controlPanelRect(controls, cloneId);
        nextBuffer.push({
          control: JSON.parse(JSON.stringify(clone)),
          parentId,
          panelX: rect?.x ?? entry.panelX + offsetX,
          panelY: rect?.y ?? entry.panelY + offsetY,
          sourceId: cloneId,
        });
      }

      if (!inPlace) buffer = nextBuffer;
      return { ...p, controls, modified: true };
    })
  );

  if (newIds.length === 0) return;

  // Even an in-place paste moves the anchor: the clipboard has now been pasted
  // into this panel, so the NEXT plain paste here is a repeat and must stagger
  // rather than land on top of what is already there.
  anchorPanelId = panelId;
  lastPastedIds = new Set(newIds);

  // Select all pasted controls
  selectedComponentIds.set(new Set(newIds));
}

/**
 * Paste clipboard buffer into the active panel.
 *
 * Same structural semantics as duplicate: a control copied out of a container
 * pastes back INTO that container (when it still exists in the target panel).
 * A selected container beats that — if you have a container selected, paste
 * goes in it. When neither applies — cross-panel paste, deleted parent — it
 * lands at top level at its old panel-space spot. An explicit position
 * ("Paste Here") always pastes at top level centred on the point.
 *
 * @param {{ x: number, y: number } | null} position
 */
export function pasteSelection(position = null) {
  paste({ position });
}

/**
 * Paste in place (Ctrl+Shift+V): the original coordinates, in the original
 * parent when it still exists. No stagger, no selected-container targeting —
 * "in place" is a promise about where it goes, and both of those would break it.
 *
 * The use it exists for is cross-panel: copy a row of controls out of one panel
 * and put them at the same coordinates in another, which plain paste cannot
 * express once the buffer has been staggered.
 */
export function pasteInPlace() {
  paste({ inPlace: true });
}

/**
 * @returns {boolean} Whether the clipboard has content to paste.
 */
export function hasClipboardContent() {
  return buffer.length > 0;
}

/**
 * Select all controls in the active panel.
 */
export function selectAll() {
  const panel = get(panels).find(p => p.id === get(resolvedActivePanelId));
  if (!panel) return;

  const ids = new Set();
  for (const ctrl of flatControls(panel.controls)) {
    const id = ctrl._children?.Core?.id;
    if (id) ids.add(id);
  }
  selectedComponentIds.set(ids);
}