// layout.mjs — the shared furniture for a generated QA sheet.
//
// Every sheet is a grid of captioned cells. That sounds like a styling concern and is not: a QA
// sheet is only useful if a human can look at one screen and say "that one is wrong", which means
// each control has to sit next to a label saying what it is supposed to be. Hand-placing 49 of
// those is exactly the kind of work that stops being done the third time a component is added.
//
// So placement is computed, and the only thing a sheet author writes is the list of cells.

import { createControl } from '../../../CE/web/src/CE_Application/models/componentTypes.js';

/** Sheet metrics. Chosen so a 1600px-wide sheet fits a laptop screen at 100% zoom. */
export const GRID = {
  sheetWidth: 1600,
  marginX: 28,
  marginY: 28,
  captionHeight: 18,
  captionGap: 4,
  cellGapX: 24,
  cellGapY: 28,
  minCellWidth: 132,
  groupHeaderHeight: 26,
  groupGapTop: 34,
  groupGapBottom: 10,
};

/** Caption above a cell: small, dim, and never the thing under test. */
function caption(text, { x, y, width }, id) {
  return createControl('Label', {
    Core: { id, name: `caption_${id}` },
    Transform: { x, y, width, height: GRID.captionHeight },
    Text: { content: text, _children: { Font: { size: 11 } } },
    Background: { _children: { Fill: { colour: '00000000' } } },
    ContentLayout: { mode: 'text_only', horizontalAlign: 'left', paddingLeft: 2, paddingRight: 2, paddingTop: 0, paddingBottom: 0 },
  });
}

/** Group header: the band that tells you which family you are looking at. */
function groupHeader(text, y, index) {
  return createControl('Label', {
    Core: { id: `qa_group_${index}`, name: `group_${text.replace(/\W+/g, '_')}` },
    Transform: { x: GRID.marginX, y, width: GRID.sheetWidth - GRID.marginX * 2, height: GRID.groupHeaderHeight },
    Text: { content: text, _children: { Font: { size: 13, bold: true } } },
    Background: {
      _children: {
        Fill: { colour: 'FF23282D' },
        Border: { enabled: true, thickness: 1, colour: '3389C2FF' },
        Corners: { radius: 4 },
      },
    },
    ContentLayout: { mode: 'text_only', horizontalAlign: 'left', paddingLeft: 10, paddingRight: 10, paddingTop: 3, paddingBottom: 3 },
  });
}

/**
 * Flow a list of groups into a sheet.
 *
 * Each group is `{ title, cells }`, each cell `{ caption, control }` where `control` is already
 * built (the sheet decides how — QA-01 builds from a type name, QA-02 from a recipe). The cell's
 * own Transform.width/height is respected; only x/y are overwritten, so a component that wants to
 * be 720x300 stays 720x300 and the row grows around it.
 *
 * Returns `{ controls, height }` — the caller sets panel.height from it, because a sheet that is
 * shorter than its content is a sheet whose last row nobody ever looks at.
 */
export function flowGroups(groups) {
  const controls = [];
  let y = GRID.marginY;
  let captionSeq = 0;

  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) y += GRID.groupGapTop;
    controls.push(groupHeader(group.title, y, groupIndex));
    y += GRID.groupHeaderHeight + GRID.groupGapBottom;

    let x = GRID.marginX;
    let rowHeight = 0;

    for (const cell of group.cells) {
      const transform = cell.control?._children?.Transform ?? {};
      const cellWidth = Math.max(Number(transform.width) || 0, GRID.minCellWidth);
      const cellHeight = (Number(transform.height) || 0) + GRID.captionHeight + GRID.captionGap;

      // Wrap before placing, so a wide component starts its own row rather than hanging off the edge.
      if (x > GRID.marginX && x + cellWidth > GRID.sheetWidth - GRID.marginX) {
        x = GRID.marginX;
        y += rowHeight + GRID.cellGapY;
        rowHeight = 0;
      }

      controls.push(caption(cell.caption, { x, y, width: cellWidth }, `qa_cap_${captionSeq++}`));
      transform.x = x;
      transform.y = y + GRID.captionHeight + GRID.captionGap;
      controls.push(cell.control);

      rowHeight = Math.max(rowHeight, cellHeight);
      x += cellWidth + GRID.cellGapX;
    }

    y += rowHeight;
  });

  return { controls, height: y + GRID.marginY };
}

/**
 * Apply the house style to a generated sheet. Kept here rather than in each sheet so the suite
 * looks like one thing — and so a reviewer can tell a QA sheet from a real panel at a glance.
 */
export function styleSheet(panel, { title, notes }) {
  panel.width = GRID.sheetWidth;
  panel.bgColour = 'FF1C2024';
  panel.gridEnabled = true;
  panel.gridSize = 20;
  panel.snapToGrid = true;
  panel.description = title;
  panel.notepad = { activeNoteIndex: 0, notes: [{ name: 'How to read this sheet', content: notes }] };
  return panel;
}
