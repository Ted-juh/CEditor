/**
 * dockFieldIndex.js — so the properties panel's search can still find a property that lives in a
 * dock tab.
 *
 * THE PROBLEM. `propertyFilter` is one string, and `PropertySection` / `PropertyCell` hide
 * themselves when it matches neither their title nor their hint. So the search only ever finds rows
 * the panel is CURRENTLY DRAWING. Take the Effects rows out of the panel and typing "glow" finds
 * nothing — not "it moved", but nothing at all, which reads as "this application does not have
 * glow".
 *
 * Eight tabs were built and each of them shipped an `all…FieldLabels()` function "ready for the day
 * the panel's rows come out". On the day that day arrived, those eight functions were called ZERO
 * times — dead exports, exactly the shape of the dead editing half this project found in
 * `stepSequencerLayout.js`. This file is what calls them.
 *
 * WHAT IT DOES. A search that matches a label a tab owns produces a result saying which tab, with a
 * button that opens it. That is true whether or not the row has been removed from the panel yet, so
 * it can ship before any stripping and keeps being true after.
 *
 * NOISE. Some of the 195 labels are single words every panel uses — Name, Type, Label, Value, X, Y,
 * W, H. Two rules keep them out of the way: a query under two characters matches nothing, and a
 * label only matches from the START of a word, so "on" does not pull in "Position". Short queries
 * are the ones that would otherwise return half the index.
 */

import { allEffectFieldLabels } from './effectStack.js';
import { allTypographyFieldLabels } from './typographyModel.js';
import { allAssetFieldLabels } from './assetsModel.js';
import { allScreenFieldLabels } from './screenModel.js';
import { allApiFieldLabels } from './publicApiModel.js';
import { allLibraryFieldLabels } from './componentLibraryModel.js';
import { allAnimationFieldLabels } from './animationModel.js';
import { allDesignerFieldLabels } from './designerModel.js';
import { DOCK_OPENERS } from './dockOpeners.js';
import { designerForControl } from './designerModel.js';

/** A query shorter than this matches nothing: every one-letter query matches most of the index. */
export const MIN_QUERY = 2;

/**
 * tab → the labels that tab can edit, and the sections a control needs for the tab to apply to it.
 *
 * `sections` is what stops a Knob offering to open the Screen tab. `null` means the tab applies to
 * everything (the Library edits the library, not a control).
 */
export const DOCK_FIELD_INDEX = [
  { tab: 'effects', labels: allEffectFieldLabels(), sections: ['Text', 'Effects', 'Display'] },
  { tab: 'type', labels: allTypographyFieldLabels(), sections: ['Text'] },
  { tab: 'assets', labels: allAssetFieldLabels(), sections: ['Assets'] },
  { tab: 'screen', labels: allScreenFieldLabels(), sections: ['Display', 'PixelDisplay'] },
  { tab: 'api', labels: allApiFieldLabels(), sections: ['PublishedProperties', 'ExternalAPI'] },
  { tab: 'library', labels: allLibraryFieldLabels(), sections: null },
  { tab: 'animation', labels: allAnimationFieldLabels(), sections: ['Animations'] },
  { tab: 'designer', labels: allDesignerFieldLabels(), sections: null, designerOnly: true },
];

/** Every label in the index, for a count and for tests. */
export function indexedLabelCount() {
  return DOCK_FIELD_INDEX.reduce((sum, row) => sum + row.labels.length, 0);
}

/**
 * Does this tab have anything to say about this control?
 *
 * Section presence, except the Designer tab, which answers from its own registry — a control type
 * either has a designer or does not, and the section name differs per component.
 */
export function tabAppliesTo(row, control) {
  if (row.designerOnly) return !!designerForControl(control)?.built;
  if (!row.sections) return true;
  const children = control?._children ?? {};
  return row.sections.some((name) => children[name] != null);
}

/** A label matches when the query starts one of its words. "glo" finds Glow; "ow" finds nothing. */
export function labelMatches(label, query) {
  const words = String(label ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.some((word) => word.startsWith(query));
}

/**
 * What the panel should offer for this search, grouped by tab.
 *
 * One row per tab rather than one per label: eight buttons is a menu, ninety is a wall. The labels
 * come back with it so the row can say what it matched.
 */
export function findDockFields(query, control = null, { limit = 6 } = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  if (q.length < MIN_QUERY) return [];
  const out = [];
  for (const row of DOCK_FIELD_INDEX) {
    if (!tabAppliesTo(row, control)) continue;
    const hits = row.labels.filter((label) => labelMatches(label, q));
    if (!hits.length) continue;
    out.push({
      tab: row.tab,
      label: DOCK_OPENERS[row.tab]?.label ?? row.tab,
      matched: hits.slice(0, limit),
      more: Math.max(0, hits.length - limit),
      count: hits.length,
    });
  }
  return out;
}

/** "Glow, Outline and 3 more" — what the result row reads out. */
export function describeHits(hit) {
  const names = hit?.matched ?? [];
  if (!names.length) return '';
  if (!hit.more) return names.join(', ');
  return `${names.join(', ')} and ${hit.more} more`;
}
