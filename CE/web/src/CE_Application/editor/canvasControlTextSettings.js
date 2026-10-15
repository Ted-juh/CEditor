/**
 * What a control's text settings resolve to, from its Text section's Font, Position and Multiline:
 * the case, script, OpenType, wrap and fit settings, the flow and the orientation CanvasControl lays
 * a label out with, normalised, in one plain object.
 *
 * These were twenty-four deriveds in CanvasControl, one per value, and every labelled control on a
 * panel evaluated all of them. Here they cost one derived (`textSet`), by the same expressions.
 *
 * `previous` is the object last returned for the same control. When every value is unchanged it is
 * returned again, not an equal copy, so the derived that holds it notifies nothing: a state that
 * moves the text's offset, which none of these read, does not re-run the text layout that reads
 * them. That is the cut-off each of the twenty-four deriveds gave on its own.
 *
 * Pure: section data in, values out, no component scope, no DOM, no store reads.
 */

import { numberOr } from '../utils/primitives.js';
import {
  buildFontFeatureSettings, buildFontVariationSettings, normalizeLastLineAlign, normalizeScriptMode,
  normalizeTextCaseMode, normalizeTextFlowMode, normalizeTextOrientation, normalizeTextReadingOrientation,
  resolveTextFlowAngle, scriptBaselineShiftForMode, scriptScaleForMode, textCaseVariantCaps,
  textOrientationAngle,
} from './canvasControlStyles.js';
import { normalizeParagraphMode } from './canvasControlTextLayout.js';

function wrapModeOf(value) {
  const mode = String(value ?? 'word');
  return mode === 'none' || mode === 'character' ? mode : 'word';
}

function sameValues(a, b) {
  if (!a) return false;
  for (const key in b) if (!Object.is(a[key], b[key])) return false;
  return true;
}

/** `textFont`, `textPosition` and `textMultiline` are Text.Font, .Position and .Multiline; any may be missing. */
export function resolveTextSettings(textFont, textPosition, textMultiline, previous = null) {
  const readingOrientation = normalizeTextReadingOrientation(textPosition?.readingOrientation);
  const caseMode = normalizeTextCaseMode(textFont?.caseMode);
  const scriptMode = normalizeScriptMode(textFont?.scriptMode);
  const flowMode = normalizeTextFlowMode(textPosition?.flowMode);
  const usesCustomFlow = flowMode !== 'rotate';
  const flowAngle = resolveTextFlowAngle(textPosition);
  const orientation = normalizeTextOrientation(textPosition?.orientation);
  const settings = {
    readingOrientation,
    isMirrored: readingOrientation === 'mirrored',
    caseMode,
    scriptMode,
    scriptScale: scriptScaleForMode(scriptMode),
    scriptBaselineShift: scriptBaselineShiftForMode(scriptMode, numberOr(textFont?.size, 12)) + numberOr(textFont?.baselineShift, 0),
    fontFeatureSettings: buildFontFeatureSettings(textFont),
    fontVariationSettings: buildFontVariationSettings(textFont?.variationAxes),
    variantCaps: textCaseVariantCaps(caseMode),
    wordSpacing: numberOr(textFont?.wordSpacing, 0),
    lineHeightMultiplier: Math.max(0.5, numberOr(textMultiline?.lineHeight, 1.2)),
    wrapMode: wrapModeOf(textMultiline?.wrapMode),
    paragraphMode: normalizeParagraphMode(String(textMultiline?.paragraphMode ?? textMultiline?.fillWidthMode ?? 'normal')),
    overflowMode: String(textMultiline?.overflowMode ?? 'clip') === 'ellipsis' ? 'ellipsis' : 'clip',
    fitMode: String(textMultiline?.fitMode ?? 'none') === 'shrink' ? 'shrink' : 'none',
    maxLines: Math.max(0, Math.round(numberOr(textMultiline?.maxLines, 0))),
    justifyLastLine: textMultiline?.justifyLastLine === true,
    lastLineAlign: normalizeLastLineAlign(textMultiline?.lastLineAlign),
    flowMode,
    usesCustomFlow,
    flowAngle,
    orientation,
    rotationDegrees: usesCustomFlow ? 0 : numberOr(flowAngle, textOrientationAngle(orientation)),
    // Text laid out along a path or arc has no line box to fill.
    forceLineBoxWidth: !usesCustomFlow,
  };
  return sameValues(previous, settings) ? previous : settings;
}
