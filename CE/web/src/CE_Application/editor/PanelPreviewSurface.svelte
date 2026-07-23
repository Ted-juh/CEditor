<script>
  import { onDestroy, untrack } from 'svelte';
  import CanvasControl from './CanvasControl.svelte';
  import GuideLines from './GuideLines.svelte';
  import { collectSourceIds, resolveActiveLayoutId, isActiveSource, activeFilterOf, findLayout } from '../utils/lcdZones.js';
  import { FONT_H, FONT_ADVANCE } from '../utils/pixelFont.js';
  import * as textEdit from '../utils/textEditBuffer.js';
  import { get } from 'svelte/store';
  import { lcdDesignLayoutIds } from '../stores/lcdDesignLayout.js';
  import { updateControlProperty } from '../stores/controls.js';
  import { commitDeviceParameter } from '../stores/deviceProfiles.js';
  import { showGuides } from '../stores/editorView.js';
  import { showPreviewSelectionRing } from '../stores/runtimePreferences.js';
  import {
    panelPreviewSessions,
    panelPreviewDebugEnabled,
    previewInspectedControlId,
    createInteractionPreviewSession,
    updatePanelPreviewSession,
    commitPanelPreviewSelectAction,
    setPreviewInspectedControlId,
  } from '../stores/interactionPreview.js';
  import { sortControlsForRender } from '../utils/controlOrder.js';
  import { resolveRadioGroupLayout, resolveRadioGroupValueAtPoint } from '../utils/radioGroupLayout.js';
  import {
    listboxRows, listboxRowStride, listboxRowIndexAtPoint, listboxMaxScroll, isSelectableRow,
    listboxConfig, listboxIndexOfValue, listboxStep, listboxScrollIntoView, listboxRowHeight,
    listboxFilterHeight,
  } from '../utils/listboxLayout.js';
  import { resolveInteractiveControl } from '../utils/interactionRuntime.js';
  import {
    createTimedButtonPreviewController,
    isTimedButtonBehavior,
  } from '../utils/timedButtonPreview.js';
  import {
    adjustRangeValue,
    adjustRangeHandleValue,
    clampRangeHandleValue,
    formatRangeValue,
    getCurrentRangeValue,
    getRangeActiveHandle,
    getRangeEndValue,
    getRangeMax,
    getRangeMin,
    getRangeStartValue,
    isRangeBehavior,
    isRangeTextInputKey,
    isSliderRangeBehavior,
    isTwoValueRange,
    normalizedRangePointerValue,
    parseRangeInputValue,
    resolveRangeDisplayValue,
    resolveRangeZone,
    resolveMouseDirection,
    scrubRangeValue,
    snapRangeValue,
  } from '../utils/rangeBehavior.js';
  import {
    getSliderActiveHandle,
    getSliderLegalRangeForHandle,
    getSliderResolvedValues,
    getSliderValueMode,
    isSliderBehavior,
    snapSliderValue,
  } from '../utils/sliderBehavior.js';
  import {
    resolveCircularPoint,
    resolveCircularTrackMetrics,
    resolveLinearPointerPoint,
    resolveSliderNormalizedFromPoint,
    sliderValueToAngle,
  } from '../utils/sliderGeometry.js';
  import {
    getCustomHitZones,
    getCustomValueChannels,
    getCustomBehaviors,
    isCustomMouseDirectionReversed,
    normalizeCustomChannelValue,
    resolveCustomHitZoneAtPoint,
    resolveCustomInteractionPatch,
    seedCustomValues,
    snapCustomChannelValue,
  } from '../utils/customComponentInteraction.js';
  import { runPanelPreviewScriptsForPatch } from '../scripting/scriptBindings.js';
  import { dispatchInteraction } from '../scripting/panelRuntime.js';

  let {
    panel,
    scale = 1,
    bgLayers = {},
    gridStyle = '',
    surfaceRef = $bindable(null),
  } = $props();

  const DEFAULT_LAYER_ORDER = ['solid', 'gradient', 'image', 'texture'];

  let orderedControls = $derived(sortControlsForRender(panel?.controls ?? []));
  let previewRenderIdNamespace = $derived(`panel-preview-${panel?.id ?? 'panel'}`);

  let pointerActiveControlId = $state('');
  let pointerActiveElement = $state(null);
  let draggingRange = $state(false);
  let pointerDownPoint = $state({ x: 0, y: 0 });
  let pointerDownZone = $state('');
  let listboxDrag = null; // { id, startY, startScroll, moved } while drag-scrolling a listbox
  let listboxDoubleTap = false; // this press is the 2nd tap of a double-click on a listbox
  // Transient interaction-event tracking (onDoubleClick timing, onPointerMove throttle).
  let lastPointerDownAt = 0;
  let lastPointerDownId = '';
  let lastPointerMoveDispatchAt = 0;
  let pointerStartValue = $state(0);
  let pointerSliderHandle = $state('');
  let pointerCustomHitZone = $state(null);
  let pointerCustomStartValues = $state({});
  let keyboardFocusControlId = $state('');
  let lastInputMode = $state('pointer');
  let openComboboxControlId = $state('');

  const timedButtonPreview = createTimedButtonPreviewController({
    patchSession: (controlId, patch) => patchControlSession(controlId, patch),
  });

  function bindSurface(node) {
    surfaceRef = node;

    return {
      destroy() {
        if (surfaceRef === node) surfaceRef = null;
      },
    };
  }

  function getControlId(control) {
    return String(control?._children?.Core?.id ?? '');
  }

  function inspectPreviewControl(controlId = '') {
    if (!$panelPreviewDebugEnabled) return;
    setPreviewInspectedControlId(controlId);
  }

  function getBehavior(control) {
    return control?._children?.Behavior ?? null;
  }

  function numberOr(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function sessionFor(control) {
    const controlId = getControlId(control);
    return $panelPreviewSessions?.[controlId] ?? createInteractionPreviewSession(control);
  }

  function resolvedPreviewFor(control) {
    const session = sessionFor(control);
    const previewOverrides = session?.enabled === false ? {} : session;
    const resolved = resolveInteractiveControl(control, previewOverrides);
    return applyPixelValueSource(control, applyLcdValueSource(control, resolved));
  }

  // The current numeric value + range of a value-producing control (slider,
  // knob, range spinner, number) from its live preview session.
  function lcdSourceValueRange(src) {
    const behavior = getBehavior(src);
    if (!isRangeBehavior(behavior)) return null;
    const value = isSliderControl(src)
      ? currentSliderRoleValue(src, currentSliderActiveHandle(src))
      : currentRangeValue(src);
    return { value, min: getRangeMin(behavior), max: getRangeMax(behavior) };
  }

  function lcdRangeForSource(srcId) {
    const id = String(srcId ?? '');
    if (!id) return null;
    const src = orderedControls.find((entry) => getControlId(entry) === id);
    if (!src) return null;
    const range = lcdSourceValueRange(src);
    return range && range.value !== undefined ? range : null;
  }

  // Rich live info about a source control for the zones engine: value/range, its
  // name, an On/Off or choice text, and a selector key for page switching.
  function lcdSourceInfo(src) {
    if (!src) return null;
    const behavior = getBehavior(src);
    const session = sessionFor(src);
    const info = {
      present: true,
      name: String(src?._children?.Core?.name ?? ''),
      value: 0, min: 0, max: 127, text: '', on: false, selector: '',
    };
    // 'address' show-kind: the device parameter this control is bound to (if
    // any), so the panel can print e.g. a CC/NRPN address instead of "----".
    const bind = (src?._children?.DeviceBindings?.bindings ?? []).find((b) => b?.parameterId);
    if (bind) info.address = String(bind.parameterId);
    if (isRangeBehavior(behavior)) {
      const range = lcdSourceValueRange(src);
      if (range) { info.value = range.value; info.min = range.min; info.max = range.max; info.selector = String(range.value); }
    }
    const family = String(behavior?.family ?? '').trim().toLowerCase();
    const buttonType = String(behavior?.buttonType ?? '').trim().toLowerCase();
    if (String(src?._children?.Core?.controlType ?? '') === 'Label') {
      // A label's editable text is its Text.content.
      info.text = String(src?._children?.Text?.content ?? '');
    } else if (isComboboxControl(src) || buttonType === 'radio' || buttonType === 'cyclic') {
      // Multi-choice: the selector is the internal value; the text is the option's
      // human label (so the screen shows "Bright", not "option_2").
      const choice = session?.valueOverrideEnabled === true
        ? session.valueOverride
        : (isComboboxControl(src) ? currentComboboxValue(src) : behavior?.defaultValue);
      info.selector = String(choice ?? '');
      const row = getValueRows(src).find((r) => String(rowValue(r)) === String(choice ?? ''));
      info.text = String(row?.displayText ?? choice ?? '');
    } else if (family === 'select' || String(behavior?.valueType ?? '') === 'bool') {
      info.on = session?.checked === true || behavior?.defaultValue === true;
      info.text = info.on ? 'On' : 'Off';
      info.value = info.on ? 1 : 0; info.min = 0; info.max = 1;
      info.selector = info.on ? '1' : '0';
    } else if (family === 'trigger') {
      // Momentary / action buttons have no stored value: read the live pressed
      // (or executed) state so the display shows 1/On while held, 0/Off at rest.
      info.on = session?.pressed === true || session?.executed === true;
      info.text = info.on ? 'On' : 'Off';
      info.value = info.on ? 1 : 0; info.min = 0; info.max = 1;
      info.selector = info.on ? '1' : '0';
    }
    return info;
  }

  // --- On-screen editing (an edit zone writes back to its target) ---
  // Edit targets: '@edit' (the display's own text), a Label (its Text.content) —
  // both free-text with a caret — or a Combobox/Radio/Cyclic, which becomes a
  // choice cycler (no caret; wheel/arrows change the selected option).
  let lcdEdit = $state({ id: '', zoneId: '', sourceId: '', kind: '', caret: 0, original: '', active: false });

  function lcdDisplayOf(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'LcdDisplay'
      ? (control?._children?.Display ?? null) : null;
  }
  // The editable section for either display type (@edit target + edit options
  // live here). name is the section key for updateControlProperty writes.
  function editSectionOf(control) {
    const type = String(control?._children?.Core?.controlType ?? '');
    if (type === 'LcdDisplay') return { type, section: control?._children?.Display ?? null, name: 'Display' };
    if (type === 'PixelDisplay') return { type, section: control?._children?.Pixel ?? null, name: 'Pixel' };
    return { type: '', section: null, name: '' };
  }
  function lcdSourceControl(sourceId) {
    return orderedControls.find((c) => getControlId(c) === String(sourceId ?? '')) ?? null;
  }
  // What kind of edit a zone source supports: 'text' | 'choice' | 'none'.
  function lcdEditKindOf(sourceId) {
    const sid = String(sourceId ?? '');
    if (sid === '@edit') return 'text';
    const src = lcdSourceControl(sid);
    if (!src) return 'none';
    // A Label is only editable from the screen when its Text.editable flag is on.
    if (String(src?._children?.Core?.controlType ?? '') === 'Label') {
      return src?._children?.Text?.editable === true ? 'text' : 'none';
    }
    const bt = String(getBehavior(src)?.buttonType ?? '').trim().toLowerCase();
    if (isComboboxControl(src) || bt === 'radio' || bt === 'cyclic') return 'choice';
    return 'none';
  }
  function lcdEditOpts(section) {
    return { charset: String(section?.editCharset ?? 'upper'), maxLength: Math.max(0, Math.round(numberOr(section?.editMaxLength, 16))) };
  }
  // All editable "edit" zones on the active layout (text/choice targets), in order.
  function lcdEditZones(control) {
    const display = lcdDisplayOf(control);
    if (!display || !Array.isArray(display.layouts) || !display.layouts.length) return [];
    const layout = findLayout(display.layouts, resolveLcdActiveLayoutId(control));
    const out = [];
    for (const z of (layout?.zones ?? [])) {
      if (String(z?.show ?? '') !== 'edit' || z?.visible === false) continue;
      const kind = lcdEditKindOf(z?.sourceId);
      if (kind !== 'none') out.push({ zone: z, sourceId: String(z?.sourceId ?? ''), kind });
    }
    return out;
  }

  // --- PixelDisplay edit targets (pixel-positioned 'edit' elements) ---
  function pixelDisplayOf(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'PixelDisplay'
      ? (control?._children?.Pixel ?? null) : null;
  }
  // The elements the renderer is currently showing: the active layout's, else
  // the flat list (mirrors PixelDisplayRenderer).
  function pixelActiveElements(control) {
    const pixel = pixelDisplayOf(control);
    if (!pixel) return [];
    const layouts = Array.isArray(pixel.layouts) ? pixel.layouts : [];
    if (layouts.length) {
      const layout = findLayout(layouts, resolvePixelActiveLayoutId(control));
      return Array.isArray(layout?.elements) ? layout.elements : [];
    }
    return Array.isArray(pixel.elements) ? pixel.elements : [];
  }
  // Editable 'edit' elements on the active layout, in order.
  function pixelEditElements(control) {
    const out = [];
    for (const el of pixelActiveElements(control)) {
      if (String(el?.kind ?? '') !== 'edit' || el?.visible === false) continue;
      const kind = lcdEditKindOf(el?.sourceId);
      if (kind !== 'none') out.push({ element: el, id: String(el?.id ?? ''), sourceId: String(el?.sourceId ?? ''), kind });
    }
    return out;
  }
  // Text-layout params for a pixel element's rendered string (grid px), so the
  // caret lands between characters exactly as the renderer draws them. The
  // rendered line is prefix + editText + suffix; alignment uses the full
  // rendered width, and the caret is offset past the prefix.
  function pixelTextLayout(control, element, sourceId) {
    const elX = Math.round(numberOr(element?.x, 0));
    const elH = Math.max(3, Math.round(numberOr(element?.h, 8)));
    const boxW = Math.max(0, Math.round(numberOr(element?.w, 0)));
    const s = Math.max(1, Math.floor(elH / (FONT_H + 1)));
    const advance = FONT_ADVANCE * s;
    const prefixLen = String(element?.prefix ?? '').length;
    const suffixLen = String(element?.suffix ?? '').length;
    const len = lcdEditText(control, sourceId).length;
    const renderedLen = prefixLen + len + suffixLen;
    const textW = renderedLen > 0 ? renderedLen * advance - s : 0;
    let startX = elX;
    if (boxW > 0) {
      const align = String(element?.align ?? 'left');
      if (align === 'center') startX = elX + Math.round((boxW - textW) / 2);
      else if (align === 'right') startX = elX + boxW - textW;
    }
    return { startX, advance, len, prefixLen, renderedLen, elY: Math.round(numberOr(element?.y, 0)), rowH: FONT_H * s };
  }
  // Element bounds (grid px) → is a control-local click inside it?
  function pixelElementContainsPoint(control, element, pt) {
    const pixel = pixelDisplayOf(control);
    const transform = control?._children?.Transform ?? {};
    const width = numberOr(transform.width, 0);
    const height = numberOr(transform.height, 0);
    if (!pixel || !pt || width <= 0 || height <= 0) return false;
    const padding = Math.max(0, numberOr(pixel.padding, 8));
    const pixW = Math.max(1, Math.round(numberOr(pixel.pixelsW, 128)));
    const pixH = Math.max(1, Math.round(numberOr(pixel.pixelsH, 64)));
    const sx = Math.max(1e-6, (width - padding * 2) / pixW);
    const sy = Math.max(1e-6, (height - padding * 2) / pixH);
    const gx = (pt.x - padding) / sx;
    const gy = (pt.y - padding) / sy;
    const lay = pixelTextLayout(control, element, String(element?.sourceId ?? ''));
    const w = Math.max(1, Math.round(numberOr(element?.w, Math.max(1, lay.renderedLen) * FONT_ADVANCE)));
    const x0 = Math.round(numberOr(element?.x, 0));
    return gx >= x0 - 1 && gx <= x0 + w + 1 && gy >= lay.elY - 1 && gy <= lay.elY + lay.rowH + 1;
  }
  // Caret index from a click on a pixel edit element.
  function pixelCaretFromPoint(control, element, pt) {
    const pixel = pixelDisplayOf(control);
    const transform = control?._children?.Transform ?? {};
    const width = numberOr(transform.width, 0);
    const padding = Math.max(0, numberOr(pixel?.padding, 8));
    const pixW = Math.max(1, Math.round(numberOr(pixel?.pixelsW, 128)));
    const sx = Math.max(1e-6, (width - padding * 2) / pixW);
    const lay = pixelTextLayout(control, element, String(element?.sourceId ?? ''));
    const gx = (pt.x - padding) / sx;
    // Clicked rendered-column → subtract the prefix to get a caret into editText.
    const caret = Math.round((gx - lay.startX) / Math.max(1, lay.advance)) - lay.prefixLen;
    return Math.max(0, Math.min(lay.len, caret));
  }

  // Unified edit targets for whichever display type this control is.
  function screenEditTargets(control) {
    const type = String(control?._children?.Core?.controlType ?? '');
    if (type === 'LcdDisplay') return lcdEditZones(control).map((t) => ({ ...t, id: String(t.zone?.id ?? '') }));
    if (type === 'PixelDisplay') return pixelEditElements(control);
    return [];
  }

  // Map a click point (control-local px) to a character cell {row, col},
  // mirroring the renderer's geometry (padding, cols/rows, char/line gaps).
  function lcdCellFromPoint(control, pt) {
    const display = lcdDisplayOf(control);
    const transform = control?._children?.Transform ?? {};
    const width = numberOr(transform.width, 0);
    const height = numberOr(transform.height, 0);
    if (!display || !pt || width <= 0 || height <= 0) return null;
    const padding = Math.max(0, numberOr(display.padding, 10));
    const cols = Math.max(1, Math.round(numberOr(display.cols, 16)));
    const rows = Math.max(1, Math.round(numberOr(display.rows, 2)));
    const charSpacing = Math.max(0, numberOr(display.charSpacing, 1));
    const lineSpacing = Math.max(0, numberOr(display.lineSpacing, 3));
    const cellW = Math.max(1, (Math.max(1, width - padding * 2) - (cols - 1) * charSpacing) / cols);
    const cellH = Math.max(1, (Math.max(1, height - padding * 2) - (rows - 1) * lineSpacing) / rows);
    return {
      col: Math.floor((pt.x - padding) / (cellW + charSpacing)),
      row: Math.floor((pt.y - padding) / (cellH + lineSpacing)),
    };
  }

  function lcdZoneContainsCell(zone, cell, cols) {
    if (!cell) return false;
    const zoneRow = Math.round(numberOr(zone?.row, 1)) - 1;
    const c0 = Math.round(numberOr(zone?.colStart, 1)) - 1;
    const c1 = Math.round(numberOr(zone?.colEnd, cols)) - 1;
    return cell.row === zoneRow && cell.col >= c0 && cell.col <= c1;
  }

  // Caret index for a click cell inside a zone; outside -> end of text. Mirrors
  // fitToRegion's alignment padding + the prefix so the caret lands on the same
  // character the renderer drew under the click.
  function lcdCaretFromCell(zone, cell, cols, textLen) {
    if (!cell) return textLen;
    const c0 = Math.round(numberOr(zone?.colStart, 1)) - 1;
    const c1 = Math.max(c0, Math.round(numberOr(zone?.colEnd, cols)) - 1);
    if (!lcdZoneContainsCell(zone, cell, cols)) return textLen;
    const width = c1 - c0 + 1;
    const prefixLen = String(zone?.prefix ?? '').length;
    const suffixLen = String(zone?.suffix ?? '').length;
    const startOff = regionStartOffset(width, prefixLen + textLen + suffixLen, zone?.align);
    return Math.max(0, Math.min(textLen, cell.col - c0 - startOff - prefixLen));
  }

  // Arm an edit target: text kinds remember the original for Esc-cancel.
  function lcdArmEdit(control, target, caret) {
    lcdEdit = {
      id: getControlId(control),
      zoneId: String(target.id ?? target.zone?.id ?? ''),
      sourceId: target.sourceId,
      kind: target.kind,
      caret,
      original: target.kind === 'text' ? lcdEditText(control, target.sourceId) : '',
      active: true,
    };
  }
  const LCD_EDIT_IDLE = { id: '', zoneId: '', sourceId: '', kind: '', caret: 0, original: '', active: false };

  // Text edit target read/write: '@edit' -> the display's own editText
  // (Display.editText or Pixel.editText), else a Label's content.
  function lcdEditText(control, sourceId) {
    if (String(sourceId) === '@edit') return String(editSectionOf(control).section?.editText ?? '');
    return String(lcdSourceControl(sourceId)?._children?.Text?.content ?? '');
  }
  function lcdWriteEditText(control, sourceId, text) {
    if (String(sourceId) === '@edit') {
      const id = getControlId(control);
      const { name } = editSectionOf(control);
      if (id && name) updateControlProperty(id, `${name}.editText`, text);
      return;
    }
    const sid = getControlId(lcdSourceControl(sourceId));
    if (sid) updateControlProperty(sid, 'Text.content', text);
  }
  // Apply a text op to the active target, persist it, and move the caret.
  function lcdApplyEdit(control, opName, arg) {
    const { section } = editSectionOf(control);
    const id = getControlId(control);
    if (!section || !id || !lcdEdit.active) return;
    const opts = lcdEditOpts(section);
    const cur = lcdEditText(control, lcdEdit.sourceId);
    // Leave the EXISTING text untouched (no charset normalisation — that would
    // eat e.g. lowercase letters under the 'upper' set); the charset/maxLength
    // constrain only new input via insert/cycle.
    const buf = textEdit.clampCaret({ text: cur, caret: lcdEdit.caret });
    let next;
    switch (opName) {
      case 'insert': {
        // 'upper' has no lowercase, so auto-uppercase typed letters.
        const ch = opts.charset === 'upper' && typeof arg === 'string' ? arg.toUpperCase() : arg;
        next = textEdit.insert(buf, ch, opts);
        break;
      }
      case 'backspace': next = textEdit.backspace(buf); break;
      case 'delete': next = textEdit.deleteForward(buf); break;
      case 'left': next = textEdit.moveCaret(buf, -1); break;
      case 'right': next = textEdit.moveCaret(buf, 1); break;
      case 'home': next = textEdit.caretHome(buf); break;
      case 'end': next = textEdit.caretEnd(buf); break;
      case 'cycle': next = textEdit.cycleChar(buf, arg, opts); break;
      default: return;
    }
    if (next.text !== cur) lcdWriteEditText(control, lcdEdit.sourceId, next.text);
    lcdEdit = { ...lcdEdit, id, caret: next.caret, active: true };
  }

  // Choice cycler: move the bound combobox/radio/cyclic to the prev/next option.
  function lcdCurrentChoice(src) {
    const session = sessionFor(src);
    if (session?.valueOverrideEnabled === true) return session.valueOverride;
    if (isComboboxControl(src)) return currentComboboxValue(src);
    return getBehavior(src)?.defaultValue ?? getValueRows(src)[0]?.internalValue ?? getValueRows(src)[0]?.id ?? '';
  }
  function lcdCycleChoice(control, sourceId, delta) {
    const src = lcdSourceControl(sourceId);
    if (!src) return;
    const rows = getValueRows(src).filter((r) => r?.enabled !== false);
    if (!rows.length) return;
    const cur = String(lcdCurrentChoice(src));
    let idx = rows.findIndex((r) => String(rowValue(r)) === cur);
    if (idx < 0) idx = 0;
    const nextIdx = ((idx + Math.sign(delta || 1)) % rows.length + rows.length) % rows.length;
    selectComboboxRow(src, rows[nextIdx]);
    lcdEdit = { ...lcdEdit, id: getControlId(control), sourceId, kind: 'choice', active: true };
  }

  // The layout active in the editor preview (design layout as the resting default,
  // overridden by a live selector value or an overlay). Shared with the renderer feed.
  function resolveLcdActiveLayoutId(control) {
    const display = lcdDisplayOf(control);
    if (!display || !Array.isArray(display.layouts) || !display.layouts.length) return '';
    const pages = display.pages ?? {};
    const selSrc = pages.selectorSourceId ? lcdSourceControl(pages.selectorSourceId) : null;
    const selInfo = selSrc ? lcdSourceInfo(selSrc) : null;
    const selectorValue = selInfo ? selInfo.selector : undefined;
    const activeOverlayLayoutId = resolveActiveOverlayLayout(display);
    // The inspector's transient design-layout selection (in-memory store, never
    // persisted) acts as the resting default while previewing from the editor.
    const designId = String(get(lcdDesignLayoutIds)[getControlId(control)] ?? '');
    const hasDesign = designId && display.layouts.some((l) => String(l?.id ?? '') === designId);
    const effPages = hasDesign ? { ...pages, defaultLayoutId: designId } : pages;
    return resolveActiveLayoutId(effPages, display.layouts, { selectorValue, activeOverlayLayoutId });
  }

  // The control most recently clicked / dragged / changed — resolves the
  // reserved "@active" zone source so a zone can follow whatever is touched.
  let lcdActiveId = $state('');
  // Per-control last-activity time (press or change), for scoped @active. Plain
  // object: reads happen at render, driven reactive by lcdActiveId changing.
  const lcdActiveAt = {};

  // Resolve "@active" for a display: the most recently active control, optionally
  // restricted to a scope (list of Core.ids). Empty scope = any control.
  function lcdActiveForScope(scope) {
    const list = (Array.isArray(scope) ? scope : []).map(String).filter(Boolean);
    if (!list.length) return lcdActiveId;
    let best = ''; let bestAt = -1;
    for (const id of list) {
      const at = lcdActiveAt[id];
      if (at !== undefined && at > bestAt) { bestAt = at; best = id; }
    }
    return best;
  }

  // Coarse "kind" of a control, for "@active#kind" zone filtering. Sliders/knobs/
  // numbers are 'value'; momentary/toggle/select buttons are 'switch'; multi-
  // choice pickers are 'choice'.
  function lcdControlKind(src) {
    const behavior = getBehavior(src);
    const family = String(behavior?.family ?? '').trim().toLowerCase();
    const buttonType = String(behavior?.buttonType ?? '').trim().toLowerCase();
    if (isComboboxControl(src) || buttonType === 'radio' || buttonType === 'cyclic') return 'choice';
    if (family === 'trigger' || family === 'select' || String(behavior?.valueType ?? '') === 'bool') return 'switch';
    if (family === 'range') return 'value';
    return 'other';
  }

  // Resolve an "@active" (optionally "@active#kind") source to a concrete control
  // id. Without a filter it's just the scoped active control; with a filter it
  // resolves only when the currently-active control is of that kind, so a
  // filtered zone stays empty while an off-kind control is being touched.
  function lcdResolveActive(id, display) {
    const base = lcdActiveForScope(display?.activeScope);
    if (!base) return '';
    const filter = activeFilterOf(id);
    if (!filter) return base;
    const ctrl = orderedControls.find((entry) => getControlId(entry) === base);
    return ctrl && lcdControlKind(ctrl) === filter ? base : '';
  }

  // Change-time tracking for overlay pages: stamp when a control's value changes.
  let lcdChangeAt = $state({});
  // A reactive clock bumped by timers so timed overlays auto-dismiss while idle.
  let overlayClock = $state(0);
  const lcdPrevValue = {};
  let overlayTimers = [];

  // Schedule a re-render at each distinct timer-overlay duration so an overlay
  // drops when its window elapses even if the user stops interacting.
  function scheduleOverlayTicks() {
    overlayTimers.forEach((t) => clearTimeout(t));
    overlayTimers = [];
    const durations = new Set();
    for (const control of orderedControls) {
      const type = String(control?._children?.Core?.controlType ?? '');
      const section = type === 'LcdDisplay' ? control?._children?.Display
        : type === 'PixelDisplay' ? control?._children?.Pixel : null;
      if (!section) continue;
      for (const ov of (section?.pages?.overlays ?? [])) {
        if (String(ov?.dismiss ?? 'timer').trim().toLowerCase() === 'timer') {
          durations.add(Math.max(30, numberOr(ov?.duration, 800)));
        }
      }
    }
    for (const d of durations) {
      overlayTimers.push(setTimeout(() => { overlayClock = Date.now(); }, d + 20));
    }
  }

  $effect(() => {
    void $panelPreviewSessions; // re-run when any preview value changes
    const now = Date.now();
    let changed = false;
    // untrack the self-read so writing lcdChangeAt below doesn't re-trigger us.
    const next = untrack(() => ({ ...lcdChangeAt }));
    let lastChangedId = '';
    for (const control of orderedControls) {
      const id = getControlId(control);
      if (!id) continue;
      const info = lcdSourceInfo(control);
      const sig = info ? `${info.value}|${info.selector}|${info.on}` : '';
      if (lcdPrevValue[id] !== undefined && lcdPrevValue[id] !== sig) { next[id] = now; changed = true; lastChangedId = id; }
      lcdPrevValue[id] = sig;
    }
    if (changed) {
      lcdChangeAt = next;
      if (lastChangedId) { lcdActiveAt[lastChangedId] = now; lcdActiveId = lastChangedId; }
      scheduleOverlayTicks();
    }
  });

  onDestroy(() => overlayTimers.forEach((t) => clearTimeout(t)));

  // Which overlay layout is currently active (timer window, or latched until a
  // different control changes). Best-effort timing; verify in-browser.
  function resolveActiveOverlayLayout(display) {
    const overlays = display?.pages?.overlays ?? [];
    if (!overlays.length) return '';
    void overlayClock; // re-evaluate when the overlay timers fire
    const now = Date.now();
    const times = Object.values(lcdChangeAt);
    const globalMax = times.length ? Math.max(...times) : -1;
    let best = ''; let bestAt = -1;
    for (const ov of overlays) {
      const at = lcdChangeAt[String(ov?.sourceId ?? '')];
      if (at === undefined) continue;
      const dismiss = String(ov?.dismiss ?? 'timer').trim().toLowerCase();
      const active = dismiss === 'untilchange' ? at === globalMax : (now - at) < numberOr(ov?.duration, 800);
      if (active && at > bestAt) { bestAt = at; best = String(ov?.layoutId ?? ''); }
    }
    return best;
  }

  // Drive an LcdDisplay from live control values: the primary/extra value fields,
  // and (for zone layouts) a __live info map + the resolved active page.
  function applyLcdValueSource(control, resolved) {
    if (String(control?._children?.Core?.controlType ?? '') !== 'LcdDisplay') return resolved;
    const display = control?._children?.Display;
    if (!display) return resolved;

    const hasLayouts = Array.isArray(display.layouts) && display.layouts.length > 0;
    const primary = lcdRangeForSource(display.valueSourceId);
    const fields = Array.isArray(display.fields) ? display.fields : [];
    const fieldRanges = fields.map((f) => lcdRangeForSource(f?.sourceId));

    const live = {};
    if (hasLayouts) {
      for (const id of collectSourceIds(display)) {
        // "@active"/"@active#kind" resolve to the most recently touched control
        // (restricted to this display's activeScope, and to the kind filter);
        // a fixed id resolves to that control. Keyed by the raw id so each
        // filtered "@active#kind" zone reads its own live value.
        const resolvedId = isActiveSource(id) ? lcdResolveActive(id, display) : id;
        const src = resolvedId ? orderedControls.find((entry) => getControlId(entry) === resolvedId) : null;
        const info = src ? lcdSourceInfo(src) : null;
        if (info) live[id] = info;
      }
    }

    // Optional live drives for the panel lighting: a range control for
    // brightness (mapped 0-100 across its range), a switch for the backlight.
    const brightRange = display.brightnessSourceId ? lcdRangeForSource(display.brightnessSourceId) : null;
    const backCtrl = display.backlightSourceId
      ? orderedControls.find((entry) => getControlId(entry) === String(display.backlightSourceId)) : null;
    const backInfo = backCtrl ? lcdSourceInfo(backCtrl) : null;

    // A device parameter bound directly onto this display (text/brightness/
    // backlight port) lands in the preview session as an override.
    const ownSession = sessionFor(control) ?? {};
    const hasOwnOverride = ownSession.textOverride !== undefined
      || ownSession.brightnessOverride !== undefined
      || ownSession.backlightOverride !== undefined;

    if (!hasLayouts && !primary && !fieldRanges.some(Boolean) && !brightRange && !backInfo && !hasOwnOverride) return resolved;

    // Shallow clone that shares heavy read-only fields (imageSrc, layouts, pages)
    // by reference; only the Display + the field entries we mutate are copied.
    const base = resolved?.control ?? control;
    const baseDisplay = base?._children?.Display ?? {};
    const cd = { ...baseDisplay };
    if (Array.isArray(baseDisplay.fields)) cd.fields = baseDisplay.fields.map((f) => ({ ...f }));
    const clone = { ...base, _children: { ...base._children, Display: cd } };
    if (cd) {
      if (brightRange) {
        const span = brightRange.max - brightRange.min;
        const frac = span === 0 ? 0 : Math.max(0, Math.min(1, (brightRange.value - brightRange.min) / span));
        cd.brightness = Math.round(frac * 100);
      }
      if (backInfo) cd.backlightOn = backInfo.on === true || numberOr(backInfo.value, 0) >= 0.5;
      if (primary) { cd.value = primary.value; cd.valueMin = primary.min; cd.valueMax = primary.max; }
      // Direct device bindings win over source-control drives (more specific).
      if (ownSession.brightnessOverride !== undefined) cd.brightness = ownSession.brightnessOverride;
      if (ownSession.backlightOverride !== undefined) cd.backlightOn = ownSession.backlightOverride === true;
      if (ownSession.textOverride !== undefined) cd.editText = String(ownSession.textOverride);
      if (Array.isArray(cd.fields)) {
        fieldRanges.forEach((range, i) => {
          if (range && cd.fields[i]) { cd.fields[i].value = range.value; cd.fields[i].min = range.min; cd.fields[i].max = range.max; }
        });
      }
      if (hasLayouts) {
        cd.__live = live;
        // Active layout: design layout as the resting default, overridden by a
        // live selector value or an overlay (shared resolver).
        cd.__page = { activeLayoutId: resolveLcdActiveLayoutId(control) };
        // Live edit marker: text edits carry the caret; a choice edit highlights
        // the armed zone (the renderer parks the block on its first cell).
        const controlId = getControlId(control);
        cd.__edit = (lcdEdit.active && lcdEdit.id === controlId)
          ? { active: true, caret: lcdEdit.caret, zoneId: lcdEdit.zoneId, kind: lcdEdit.kind } : null;
      }
    }
    return { ...resolved, control: clone };
  }

  // Drive a PixelDisplay from live control values: element sources (+ @active),
  // and the brightness/backlight drives. Mirrors applyLcdValueSource for the
  // pixel-surface component.
  // Every element sourceId across the flat list and all layouts, plus the page
  // selector and overlay triggers.
  function pixelSourceIds(pixel) {
    const ids = new Set();
    const collect = (list) => {
      for (const el of (Array.isArray(list) ? list : [])) {
        const id = String(el?.sourceId ?? '');
        if (id) ids.add(id);
      }
    };
    collect(pixel.elements);
    for (const layout of (Array.isArray(pixel.layouts) ? pixel.layouts : [])) collect(layout?.elements);
    const pages = pixel.pages ?? {};
    if (pages.selectorSourceId) ids.add(String(pages.selectorSourceId));
    for (const ov of (Array.isArray(pages.overlays) ? pages.overlays : [])) {
      if (ov?.sourceId) ids.add(String(ov.sourceId));
    }
    return [...ids];
  }

  // Active layout for a PixelDisplay in preview: design selection as the resting
  // default, overridden by a live selector value or an overlay.
  function resolvePixelActiveLayoutId(control) {
    const pixel = control?._children?.Pixel;
    const layouts = Array.isArray(pixel?.layouts) ? pixel.layouts : [];
    if (!layouts.length) return '';
    const pages = pixel.pages ?? {};
    const selSrc = pages.selectorSourceId ? orderedControls.find((e) => getControlId(e) === String(pages.selectorSourceId)) : null;
    const selInfo = selSrc ? lcdSourceInfo(selSrc) : null;
    const selectorValue = selInfo ? selInfo.selector : undefined;
    const activeOverlayLayoutId = resolveActiveOverlayLayout(pixel);
    const designId = String(get(lcdDesignLayoutIds)[getControlId(control)] ?? '');
    const hasDesign = designId && layouts.some((l) => String(l?.id ?? '') === designId);
    const effPages = hasDesign ? { ...pages, defaultLayoutId: designId } : pages;
    return resolveActiveLayoutId(effPages, layouts, { selectorValue, activeOverlayLayoutId });
  }

  function applyPixelValueSource(control, resolved) {
    if (String(control?._children?.Core?.controlType ?? '') !== 'PixelDisplay') return resolved;
    const pixel = control?._children?.Pixel;
    if (!pixel) return resolved;

    const live = {};
    for (const id of pixelSourceIds(pixel)) {
      const resolvedId = isActiveSource(id) ? lcdResolveActive(id, pixel) : id;
      const src = resolvedId ? orderedControls.find((entry) => getControlId(entry) === resolvedId) : null;
      const info = src ? lcdSourceInfo(src) : null;
      if (info) live[id] = info;
    }

    const brightRange = pixel.brightnessSourceId ? lcdRangeForSource(pixel.brightnessSourceId) : null;
    const backCtrl = pixel.backlightSourceId
      ? orderedControls.find((entry) => getControlId(entry) === String(pixel.backlightSourceId)) : null;
    const backInfo = backCtrl ? lcdSourceInfo(backCtrl) : null;
    const hasLayouts = Array.isArray(pixel.layouts) && pixel.layouts.length > 0;

    const ownSession = sessionFor(control) ?? {};
    const hasOwnOverride = ownSession.textOverride !== undefined
      || ownSession.brightnessOverride !== undefined
      || ownSession.backlightOverride !== undefined;
    const editingHere = lcdEdit.active && lcdEdit.id === getControlId(control);

    if (!Object.keys(live).length && !brightRange && !backInfo && !hasLayouts && !hasOwnOverride && !editingHere) return resolved;

    const base = resolved?.control ?? control;
    const basePixel = base?._children?.Pixel ?? {};
    const cp = { ...basePixel, __live: live };
    if (hasLayouts) cp.__page = { activeLayoutId: resolvePixelActiveLayoutId(control) };
    if (brightRange) {
      const span = brightRange.max - brightRange.min;
      const frac = span === 0 ? 0 : Math.max(0, Math.min(1, (brightRange.value - brightRange.min) / span));
      cp.brightness = Math.round(frac * 100);
    }
    if (backInfo) cp.backlightOn = backInfo.on === true || numberOr(backInfo.value, 0) >= 0.5;
    // Direct device bindings win over source-control drives (more specific).
    if (ownSession.brightnessOverride !== undefined) cp.brightness = ownSession.brightnessOverride;
    if (ownSession.backlightOverride !== undefined) cp.backlightOn = ownSession.backlightOverride === true;
    if (ownSession.textOverride !== undefined) cp.editText = String(ownSession.textOverride);
    // Live edit caret: the renderer parks a blinking I-beam on the armed element.
    cp.__edit = editingHere
      ? { active: true, caret: lcdEdit.caret, elementId: lcdEdit.zoneId, kind: lcdEdit.kind }
      : null;
    const clone = { ...base, _children: { ...base._children, Pixel: cp } };
    return { ...(resolved ?? {}), control: clone };
  }

  function isDisabled(control) {
    const session = sessionFor(control);
    return session?.enabled === false
      || session?.disabled === true
      || control?._children?.Core?.enabled === false;
  }

  function isRangeControl(control) {
    return isRangeBehavior(getBehavior(control));
  }

  function isCustomComponent(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'CustomComponent';
  }

  function isComboboxControl(control) {
    return String(getBehavior(control)?.buttonType ?? '').trim().toLowerCase() === 'combobox';
  }

  function isListboxControl(control) {
    return String(getBehavior(control)?.buttonType ?? '').trim().toLowerCase() === 'listbox';
  }

  // --- TextInput: an editable text field committing to Behavior.defaultValue ---
  function isTextInputControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'TextInput';
  }
  // The live text = Behavior.defaultValue (the input stays uncontrolled while
  // typing; this value only changes on commit or an inbound device update).
  function currentTextValue(control) {
    return String(getBehavior(control)?.defaultValue ?? '');
  }
  function commitTextValue(control, value) {
    const id = getControlId(control);
    if (!id) return;
    const str = String(value ?? '');
    if (str !== currentTextValue(control)) updateControlProperty(id, 'Behavior.defaultValue', str);
    // Emit through the text port (SysEx patch-name value on the device side).
    emitDeviceBindingsForPatch(control, { textValue: str });
  }
  function handleTextFieldFocus(control) {
    const id = getControlId(control);
    inspectPreviewControl(id);
    patchControlSession(id, { focused: true, hover: true });
  }
  function handleTextFieldBlur(control, event) {
    commitTextValue(control, event?.target?.value);
    patchControlSession(getControlId(control), { focused: false });
  }
  function handleTextFieldKeyDown(control, event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitTextValue(control, event.target?.value);
      event.currentTarget?.blur?.();
    } else if (event.key === 'Escape') {
      // Cancel: restore the committed value and drop focus.
      event.preventDefault();
      const original = currentTextValue(control);
      if (event.target) event.target.value = original;
      event.currentTarget?.blur?.();
    }
  }

  // The Value row under a click on an always-open listbox (accounts for scroll).
  function resolveListboxPreviewValue(control, clientX, clientY) {
    if (!isListboxControl(control)) return undefined;
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return undefined;
    const transformSection = control?._children?.Transform ?? null;
    const localY = ((clientY - rect.top) / Math.max(rect.height, 1)) * (transformSection?.height ?? rect.height);
    const scrollTop = numberOr(sessionFor(control)?.listboxScrollTop, 0);
    const filter = lbFilter(control);
    const idx = listboxRowIndexAtPoint(control, localY, scrollTop, filter);
    const rows = listboxRows(control, filter);
    const row = idx >= 0 ? rows[idx] : undefined;
    // Section headers / disabled rows aren't selectable.
    return isSelectableRow(row) ? row : undefined;
  }

  // The listbox viewport height (logical grid px).
  function listboxViewport(control) {
    return Math.max(1, numberOr(control?._children?.Transform?.height, 0));
  }
  // The live filter text for a listbox (filter-box search).
  function lbFilter(control) {
    return String(sessionFor(control)?.listboxFilter ?? '');
  }
  function handleListboxFilterInput(control, event) {
    // Reset the scroll on a new query so the top match is visible.
    patchControlSession(getControlId(control), { listboxFilter: String(event?.target?.value ?? ''), listboxScrollTop: 0 });
  }
  // Keep the selected row in view (if configured) by nudging session scrollTop.
  function scrollListboxToIndex(control, index) {
    if (index < 0 || listboxConfig(control).scrollIntoView === false) return;
    const cur = numberOr(sessionFor(control)?.listboxScrollTop, 0);
    const next = listboxScrollIntoView(control, index, listboxViewport(control), cur, lbFilter(control));
    if (next !== cur) patchControlSession(getControlId(control), { listboxScrollTop: next });
  }
  // Select the visible row at `index` (by value), scroll it into view.
  function selectListboxIndex(control, index) {
    const row = listboxRows(control, lbFilter(control))[index];
    if (!isSelectableRow(row)) return;
    selectComboboxRow(control, row);
    scrollListboxToIndex(control, index);
  }
  // Arm the visible row at `index` as pending (double/enter/multi modes),
  // scrolling it into view. Distinct from committing the value.
  function armListboxIndex(control, index) {
    const row = listboxRows(control, lbFilter(control))[index];
    if (!isSelectableRow(row)) return;
    patchControlSession(getControlId(control), { listboxPending: String(rowValue(row)) });
    scrollListboxToIndex(control, index);
  }
  // The current keyboard anchor: the pending row if one is armed, else the
  // committed selection.
  function listboxAnchorIndex(control, filter) {
    const pending = String(sessionFor(control)?.listboxPending ?? '');
    if (pending) {
      const at = listboxRows(control, filter).findIndex((r) => String(rowValue(r)) === pending);
      if (at >= 0) return at;
    }
    return listboxIndexOfValue(control, currentComboboxValue(control), filter);
  }

  // Keyboard navigation for a focused listbox. Returns true if handled.
  function handleListboxKey(control, event) {
    if (listboxConfig(control).keyboardNav === false) return false;
    const cfg = listboxConfig(control);
    const deferred = cfg.multiSelect === true || String(cfg.confirmMode ?? 'single') !== 'single';
    const filter = lbFilter(control);
    const rows = listboxRows(control, filter);
    if (!rows.length) return false;
    // Enter / Space commit (or toggle in multi-select) the armed row.
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      if (!deferred) return false;
      const idx = listboxAnchorIndex(control, filter);
      const row = idx >= 0 ? rows[idx] : undefined;
      if (isSelectableRow(row)) {
        event.preventDefault();
        if (cfg.multiSelect === true) toggleListboxSelection(control, row);
        else confirmListboxPending(control, row);
        return true;
      }
      return false;
    }
    const curIdx = deferred ? listboxAnchorIndex(control, filter) : listboxIndexOfValue(control, currentComboboxValue(control), filter);
    const perPage = Math.max(1, Math.floor(listboxViewport(control) / listboxRowStride(control)) - 1);
    let target = -1;
    switch (event.key) {
      case 'ArrowDown': target = listboxStep(control, curIdx, 1, filter); break;
      case 'ArrowUp': target = listboxStep(control, curIdx, -1, filter); break;
      case 'PageDown': target = listboxStep(control, curIdx, perPage, filter); break;
      case 'PageUp': target = listboxStep(control, curIdx, -perPage, filter); break;
      case 'Home': target = listboxStep(control, -1, 1, filter); break;
      case 'End': target = listboxStep(control, rows.length, -1, filter); break;
      default: return false;
    }
    event.preventDefault();
    if (target >= 0) {
      if (deferred) armListboxIndex(control, target);
      else selectListboxIndex(control, target);
    }
    return true;
  }

  // Type-ahead: accumulate typed chars (reset after a pause) and jump to the
  // first matching row (prefix or fuzzy). Returns true if handled.
  let listboxTypeBuffer = { id: '', text: '', at: 0 };
  function fuzzyMatch(q, s) {
    let i = 0;
    for (const ch of s) { if (ch === q[i]) i += 1; if (i >= q.length) return true; }
    return q.length === 0;
  }
  function handleListboxTypeAhead(control, event) {
    const mode = String(listboxConfig(control).typeAhead ?? 'off');
    if (mode === 'off') return false;
    const key = event.key;
    if (key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return false;
    event.preventDefault();
    const id = getControlId(control);
    const now = (typeof performance !== 'undefined' ? performance.now() : 0);
    if (listboxTypeBuffer.id !== id || now - listboxTypeBuffer.at > 900) listboxTypeBuffer = { id, text: '', at: now };
    listboxTypeBuffer = { id, text: listboxTypeBuffer.text + key, at: now };
    const q = listboxTypeBuffer.text.toLowerCase();
    const idx = listboxRows(control, lbFilter(control)).findIndex((r) => {
      if (!isSelectableRow(r)) return false;
      const label = String(r.displayText ?? '').toLowerCase();
      return mode === 'fuzzy' ? fuzzyMatch(q, label) : label.startsWith(q);
    });
    if (idx >= 0) selectListboxIndex(control, idx);
    return true;
  }

  // --- Confirm modes (D4) + multi-select (D5) ------------------------------
  function listboxMultiSelected(control) {
    const cur = sessionFor(control)?.listboxSelected;
    return Array.isArray(cur) ? cur : [];
  }
  // Toggle a row in the multi-select set; the anchor value follows the row.
  function toggleListboxSelection(control, row) {
    if (!isSelectableRow(row)) return;
    const controlId = getControlId(control);
    const val = String(rowValue(row));
    const cur = listboxMultiSelected(control).slice();
    const at = cur.indexOf(val);
    if (at >= 0) cur.splice(at, 1); else cur.push(val);
    inspectPreviewControl(controlId);
    patchControlSession(controlId, {
      listboxSelected: cur,
      valueOverrideEnabled: true, valueOverride: val,
      focused: true, hover: true, pressed: false,
    });
  }
  // A click's effect on a listbox row, honoring multiSelect + confirmMode.
  function activateListboxRow(control, row) {
    if (!isSelectableRow(row)) return;
    const cfg = listboxConfig(control);
    if (cfg.multiSelect === true) { toggleListboxSelection(control, row); return; }
    const mode = String(cfg.confirmMode ?? 'single');
    if (mode === 'single') {
      selectComboboxRow(control, row);
      patchControlSession(getControlId(control), { listboxPending: '' });
    } else {
      // double / enter: a single click only arms the row; commit happens on the
      // double-click or Enter that confirms it.
      patchControlSession(getControlId(control), {
        listboxPending: String(rowValue(row)), focused: true, hover: true, pressed: false,
      });
      inspectPreviewControl(getControlId(control));
    }
  }
  // Commit the armed (pending) row in double/enter confirm modes.
  function confirmListboxPending(control, row) {
    const target = row ?? listboxRows(control, lbFilter(control))
      .find((r) => String(rowValue(r)) === String(sessionFor(control)?.listboxPending ?? ''));
    if (!isSelectableRow(target)) return false;
    selectComboboxRow(control, target);
    patchControlSession(getControlId(control), { listboxPending: '' });
    return true;
  }

  function getValueRows(control) {
    const rows = control?._children?.Value?.rows;
    return Array.isArray(rows) ? rows.filter((row) => row?.enabled !== false) : [];
  }

  function rowValue(row) {
    return row?.internalValue ?? row?.id ?? '';
  }

  function rowLabel(row) {
    return row?.displayText ?? row?.label ?? row?.internalValue ?? row?.id ?? '';
  }

  function currentComboboxValue(control) {
    const session = sessionFor(control);
    const behavior = getBehavior(control);
    const rows = getValueRows(control);
    if (session?.valueOverrideEnabled === true) return session?.valueOverride;
    return behavior?.defaultValue
      ?? rows.find((row) => row?.selectedByDefault === true)?.internalValue
      ?? rows[0]?.internalValue
      ?? rows[0]?.id
      ?? '';
  }

  function comboboxMenuStyle(control) {
    const transform = control?._children?.Transform ?? {};
    const x = numberOr(transform?.x, 0);
    const y = numberOr(transform?.y, 0);
    const width = Math.max(32, numberOr(transform?.width, 160));
    const height = Math.max(1, numberOr(transform?.height, 34));
    return `left:${x}px; top:${y + height + 4}px; width:${width}px;`;
  }

  function selectComboboxRow(control, row) {
    const controlId = getControlId(control);
    if (!controlId || !row) return;
    inspectPreviewControl(controlId);
    patchControlSession(controlId, {
      valueOverrideEnabled: true,
      valueOverride: rowValue(row),
      checked: false,
      mixed: false,
      hover: true,
      focused: true,
      pressed: false,
    });
    openComboboxControlId = '';
  }

  function currentRangeValue(control) {
    return getCurrentRangeValue(getBehavior(control), sessionFor(control));
  }

  // --- Two-value min/max spinner ([ low ] [ − + ] [ high ]) ---------------
  function isTwoValueSpinner(control) {
    const behavior = getBehavior(control);
    return isTwoValueRange(behavior)
      && String(behavior?.role ?? '').trim().toLowerCase() === 'spinbox';
  }

  // Which of the four spinner regions a pointer x falls in. Matches the part
  // layout: low 0–30%, decrement ~30–50%, increment ~50–70%, high 70–100%.
  function resolveSpinnerZone(rect, clientX) {
    if (!rect || rect.width <= 0) return 'low';
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (fraction < 0.30) return 'low';
    if (fraction < 0.50) return 'decrement';
    if (fraction < 0.70) return 'increment';
    return 'high';
  }

  function spinnerActiveHandle(control) {
    return getRangeActiveHandle(sessionFor(control));
  }

  function setSpinnerActiveHandle(control, handle) {
    const role = handle === 'end' ? 'end' : 'start';
    // Note: does NOT clear valueInputActive — a click that focuses a field to
    // type must not immediately cancel that edit.
    patchControlSession(getControlId(control), {
      activeHandle: role,
      valueInputRole: role,
      hover: true,
      focused: true,
    });
  }

  // --- Inline typing into the low/high fields -----------------------------
  function spinnerHandleForRole(role) {
    return role === 'highField' ? 'end' : 'start';
  }

  function spinnerFieldValue(control, role) {
    const behavior = getBehavior(control);
    const session = sessionFor(control);
    const handle = spinnerHandleForRole(role);
    if (session?.valueInputActive === true && getRangeActiveHandle(session) === handle) {
      return String(session?.valueInputBuffer ?? '');
    }
    const value = handle === 'end' ? getRangeEndValue(behavior, session) : getRangeStartValue(behavior, session);
    return formatRangeValue(behavior, value);
  }

  // Descriptor map consumed by CanvasControl to render lowField/highField as
  // editable inputs (so they can be focused and typed into).
  function spinnerEditableFields(control) {
    if (!isTwoValueSpinner(control)) return null;
    const behavior = getBehavior(control);
    const base = {
      disabled: isDisabled(control),
      inputMode: String(behavior?.valueType ?? '') === 'int' ? 'numeric' : 'decimal',
      tabIndex: -1,
    };
    return {
      lowField: { ...base, value: spinnerFieldValue(control, 'lowField'), ariaLabel: 'Low value' },
      highField: { ...base, value: spinnerFieldValue(control, 'highField'), ariaLabel: 'High value' },
    };
  }

  function beginSpinnerFieldEdit(control, role) {
    const handle = spinnerHandleForRole(role);
    const behavior = getBehavior(control);
    const session = sessionFor(control);
    const current = handle === 'end' ? getRangeEndValue(behavior, session) : getRangeStartValue(behavior, session);
    patchControlSession(getControlId(control), {
      activeHandle: handle,
      valueInputRole: handle,
      valueInputActive: true,
      valueInputBuffer: formatRangeValue(behavior, current),
      focused: true,
      hover: true,
    });
  }

  function commitSpinnerField(control, role) {
    const handle = spinnerHandleForRole(role);
    const session = sessionFor(control);
    const buffer = String(session?.valueInputBuffer ?? '');
    const parsed = parseRangeInputValue(getBehavior(control), buffer);
    patchControlSession(getControlId(control), {
      valueInputActive: false,
      valueInputBuffer: '',
      ...(parsed === null ? {} : {
        activeHandle: handle,
        valueInputRole: handle,
        [`${handle}ValueOverrideEnabled`]: true,
        [`${handle}ValueOverride`]: clampRangeHandleValue(getBehavior(control), session, handle, parsed),
      }),
    });
  }

  function handleSpinnerFieldFocus(control, role, event) {
    event.stopPropagation();
    beginSpinnerFieldEdit(control, role);
    // Select the field contents so typing replaces the value.
    event.currentTarget?.select?.();
  }

  function handleSpinnerFieldInput(control, role, event) {
    event.stopPropagation();
    const handle = spinnerHandleForRole(role);
    const rawValue = String(event?.currentTarget?.value ?? '');
    patchControlSession(getControlId(control), {
      activeHandle: handle,
      valueInputRole: handle,
      valueInputActive: true,
      valueInputBuffer: rawValue,
    });
  }

  function handleSpinnerFieldKeyDown(control, role, event) {
    event.stopPropagation();
    const handle = spinnerHandleForRole(role);

    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      // Ensure the edited field is the active handle, then reuse the key logic.
      if (getRangeActiveHandle(sessionFor(control)) !== handle) {
        patchControlSession(getControlId(control), { activeHandle: handle, valueInputRole: handle });
      }
      adjustRangeFromKey(control, event.key);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitSpinnerField(control, role);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      patchControlSession(getControlId(control), { valueInputActive: false, valueInputBuffer: '' });
    }
  }

  function handleSpinnerFieldBlur(control, role, event) {
    event.stopPropagation();
    commitSpinnerField(control, role);
    patchControlSession(getControlId(control), { focused: false, pressed: false, dragging: false });
  }

  // Write a handle's value into the session (enables its override, keeps the
  // pair ordered) and marks it active.
  function setSpinnerHandleValue(control, handle, nextValue, extraPatch = {}) {
    const role = handle === 'end' ? 'end' : 'start';
    patchControlSession(getControlId(control), {
      activeHandle: role,
      valueInputRole: role,
      [`${role}ValueOverrideEnabled`]: true,
      [`${role}ValueOverride`]: nextValue,
      valueInputActive: false,
      valueInputBuffer: '',
      ...extraPatch,
    });
  }

  function adjustSpinnerActiveHandle(control, direction, multiplier = 1) {
    const behavior = getBehavior(control);
    const session = sessionFor(control);
    const handle = getRangeActiveHandle(session);
    const nextValue = adjustRangeHandleValue(behavior, session, handle, direction, multiplier);
    setSpinnerHandleValue(control, handle, nextValue, { hover: true, focused: true });
  }

  function isSliderControl(control) {
    return isSliderBehavior(getBehavior(control));
  }

  function currentSliderValues(control) {
    return getSliderResolvedValues(getBehavior(control), sessionFor(control));
  }

  function currentSliderActiveHandle(control) {
    return getSliderActiveHandle(getBehavior(control), sessionFor(control));
  }

  function currentSliderRoleValue(control, role = 'current') {
    const values = currentSliderValues(control);
    return values?.[role] ?? values?.current ?? currentRangeValue(control);
  }

  function sliderHandleRoles(control) {
    const behavior = getBehavior(control);
    return getSliderValueMode(behavior) === 'range'
      ? ['start', 'end']
      : (getSliderValueMode(behavior) === 'band' ? ['start', 'current', 'end'] : ['current']);
  }

  function sliderPreviewScale(control, rect = null) {
    if (!rect) return 1;
    const transform = control?._children?.Transform ?? null;
    const widthScale = rect.width / Math.max(1, numberOr(transform?.width, rect.width));
    const heightScale = rect.height / Math.max(1, numberOr(transform?.height, rect.height));
    return Math.max(0.01, Math.min(widthScale || 1, heightScale || 1));
  }

  function sliderPartsFor(control) {
    return control?._children?.Parts?._children ?? {};
  }

  function sliderTrackThickness(control) {
    const trackLayout = sliderPartsFor(control)?.bodyTrackBase?._children?.Layout ?? null;
    return Math.max(4, numberOr(trackLayout?.height, 10));
  }

  function sliderMajorTickLength(control) {
    const behavior = getBehavior(control);
    const tickLayout = sliderPartsFor(control)?.tickMajor?._children?.Layout ?? null;
    return Math.max(0, numberOr(tickLayout?.height, numberOr(behavior?.majorTickLength, 12)));
  }

  function sliderPointerSize(control, role = 'current') {
    const partName = role === 'start'
      ? 'pointerStart'
      : role === 'end'
        ? 'pointerEnd'
        : 'pointerCurrent';
    const fallback = role === 'current' ? 20 : 18;
    const pointerLayout = sliderPartsFor(control)?.[partName]?._children?.Layout ?? null;
    return Math.max(8, numberOr(pointerLayout?.width, numberOr(pointerLayout?.height, fallback)));
  }

  function sliderHandlePoint(control, role = 'current', rect = null) {
    if (!rect) return null;

    const behavior = getBehavior(control);
    const scaleFactor = sliderPreviewScale(control, rect);
    const trackThickness = sliderTrackThickness(control) * scaleFactor;
    const pointerSize = sliderPointerSize(control, role) * scaleFactor;
    const showReadout = behavior?.showValueReadout !== false;
    const min = getRangeMin(behavior);
    const max = getRangeMax(behavior);
    const span = max - min;
    const normalized = span > 0
      ? Math.max(0, Math.min(1, (currentSliderRoleValue(control, role) - min) / span))
      : 0;

    if (String(behavior?.geometry ?? 'linear').trim().toLowerCase() === 'circular') {
      const maxPointerSize = Math.max(...sliderHandleRoles(control).map((handleRole) => sliderPointerSize(control, handleRole))) * scaleFactor;
      const metrics = resolveCircularTrackMetrics(rect.width, rect.height, {
        trackThickness,
        pointerSize: maxPointerSize,
        majorTickLength: sliderMajorTickLength(control) * scaleFactor,
        hasReadout: showReadout,
        circularDiameter: numberOr(behavior?.circularDiameter, 0) * scaleFactor,
      });
      return resolveCircularPoint(
        rect.width,
        rect.height,
        sliderValueToAngle(behavior, currentSliderRoleValue(control, role)),
        metrics.radius,
        { x: metrics.centerX, y: metrics.centerY },
      );
    }

    return resolveLinearPointerPoint(
      behavior,
      rect.width,
      rect.height,
      normalized,
      trackThickness,
      pointerSize,
      showReadout,
    );
  }

  function sliderValueForPoint(control, event) {
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return currentSliderRoleValue(control, currentSliderActiveHandle(control));
    const behavior = getBehavior(control);
    const min = getRangeMin(behavior);
    const max = getRangeMax(behavior);
    const normalized = resolveSliderNormalizedFromPoint(behavior, rect, event.clientX, event.clientY);
    return snapSliderValue(behavior, min + ((max - min) * normalized));
  }

  function pickNearestSliderHandle(control, event) {
    const values = currentSliderValues(control);
    const targetValue = sliderValueForPoint(control, event);
    let nearestRole = currentSliderActiveHandle(control);
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const role of sliderHandleRoles(control)) {
      const distance = Math.abs((values?.[role] ?? 0) - targetValue);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestRole = role;
      }
    }

    return nearestRole;
  }

  function pickDirectSliderHandle(control, event) {
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return '';

    const scaleFactor = sliderPreviewScale(control, rect);
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    let nearestRole = '';
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const role of sliderHandleRoles(control)) {
      const point = sliderHandlePoint(control, role, rect);
      if (!point) continue;

      const hitRadius = Math.max((sliderPointerSize(control, role) * scaleFactor) / 2, 12);
      const distance = Math.hypot(localX - point.x, localY - point.y);
      if (distance > hitRadius || distance >= nearestDistance) continue;
      nearestDistance = distance;
      nearestRole = role;
    }

    return nearestRole;
  }

  function resolveRadioGroupPreviewValue(control, clientX, clientY) {
    if (String(getBehavior(control)?.buttonType ?? '') !== 'radio') return '';

    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return '';

    const transformSection = control?._children?.Transform ?? null;
    const contentLayout = control?._children?.ContentLayout ?? null;
    const layout = resolveRadioGroupLayout({
      behavior: getBehavior(control),
      valueRows: control?._children?.Value?.rows ?? [],
      width: transformSection?.width ?? rect.width,
      height: transformSection?.height ?? rect.height,
      paddingLeft: contentLayout?.paddingLeft ?? 0,
      paddingRight: contentLayout?.paddingRight ?? 0,
      paddingTop: contentLayout?.paddingTop ?? 0,
      paddingBottom: contentLayout?.paddingBottom ?? 0,
      gap: contentLayout?.gap ?? 8,
    });

    const localX = ((clientX - rect.left) / Math.max(rect.width, 1)) * (transformSection?.width ?? rect.width);
    const localY = ((clientY - rect.top) / Math.max(rect.height, 1)) * (transformSection?.height ?? rect.height);
    return resolveRadioGroupValueAtPoint(layout, localX, localY);
  }

  function activeDeviceBindings(control) {
    const deviceBindings = control?._children?.DeviceBindings;
    if (deviceBindings?.enabled === false) return [];
    const bindings = deviceBindings?.bindings;
    return Array.isArray(bindings)
      ? bindings.filter((binding) => binding?.kind === 'deviceParameter' && binding?.parameterId)
      : [];
  }

  function bindingValueForPatch(binding, patch = {}, control = null) {
    if (isTimedButtonBehavior(getBehavior(control))) {
      return patch.executed === true ? true : undefined;
    }

    const port = String(binding?.port ?? 'value');
    if (port === 'trigger') {
      if (String(binding?.parameterType ?? '') === 'momentary') {
        return Object.prototype.hasOwnProperty.call(patch, 'pressed') ? patch.pressed === true : undefined;
      }
      if (patch.executed === true || patch.pressed === false) return true;
      return undefined;
    }
    if (port === 'state') {
      return Object.prototype.hasOwnProperty.call(patch, 'checked') ? patch.checked : undefined;
    }
    if (port === 'selectedChoice') {
      return Object.prototype.hasOwnProperty.call(patch, 'valueOverride') ? patch.valueOverride : undefined;
    }
    if (port === 'text') {
      return Object.prototype.hasOwnProperty.call(patch, 'textValue') ? patch.textValue : undefined;
    }
    if (port === 'value') {
      if (Object.prototype.hasOwnProperty.call(patch, 'valueOverride')) return patch.valueOverride;
      if (Object.prototype.hasOwnProperty.call(patch, 'currentValueOverride')) return patch.currentValueOverride;
      if (Object.prototype.hasOwnProperty.call(patch, 'activeHandle')) {
        const activeHandle = String(patch.activeHandle ?? 'current');
        const handleKey = `${activeHandle}ValueOverride`;
        if (Object.prototype.hasOwnProperty.call(patch, handleKey)) return patch[handleKey];
      }
    }
    return undefined;
  }

  function emitDeviceBindingsForPatch(control, patch = {}) {
    const controlId = getControlId(control);
    const interactionPhase = patch.dragging === true ? 'continuous' : 'commit';
    for (const binding of activeDeviceBindings(control)) {
      const value = bindingValueForPatch(binding, patch, control);
      if (value === undefined) continue;
      commitDeviceParameter({
        requestId: `panel_preview_${controlId || 'control'}_${interactionPhase}_${Date.now()}`,
        deviceRole: binding.deviceRole || 'mainSynth',
        parameterId: binding.parameterId,
        value,
        interactionPhase,
        dryRun: binding.dryRun !== false,
      });
    }
  }

  function commitSelectActionAndEmit(control, options = {}) {
    const controlId = getControlId(control);
    if (!controlId) return;

    const requestedValue = Object.prototype.hasOwnProperty.call(options, 'value')
      ? options.value
      : undefined;

    const appliedPatch = commitPanelPreviewSelectAction(controlId, options);

    if (appliedPatch?.valueOverrideEnabled === true) {
      emitDeviceBindingsForPatch(control, {
        valueOverride: appliedPatch.valueOverride,
      });
      return;
    }

    if (Object.prototype.hasOwnProperty.call(appliedPatch ?? {}, 'checked')) {
      emitDeviceBindingsForPatch(control, {
        checked: appliedPatch.checked === true,
      });
      return;
    }

    if (requestedValue !== undefined && requestedValue !== '') {
      // Player fallback: commitPanelPreviewSelectAction resolves the control via the editor's
      // active-panel store, which is empty in the standalone/plugin player — so it returns null
      // and the session is never updated (the send still fires below, which is why SysEx worked
      // but the on-screen selection didn't move). Update the session directly here (we have the
      // control), so radio/combobox selection reflects the click — matching the slider's behaviour.
      updatePanelPreviewSession(controlId, { valueOverrideEnabled: true, valueOverride: requestedValue });
      emitDeviceBindingsForPatch(control, {
        valueOverride: requestedValue,
      });
      return;
    }

    const currentSession = sessionFor(control);
    if (currentSession?.valueOverrideEnabled === true) {
      emitDeviceBindingsForPatch(control, {
        valueOverride: currentSession.valueOverride,
      });
    }
  }

  function patchControlSession(controlId, patch = {}) {
    const control = orderedControls.find((entry) => getControlId(entry) === controlId) ?? null;
    const previousSession = control ? sessionFor(control) : {};
    updatePanelPreviewSession(controlId, patch);
    if (control) {
      emitDeviceBindingsForPatch(control, patch);
      runPanelPreviewScriptsForPatch({
        panel,
        controls: orderedControls,
        sourceControl: control,
        patch,
        previousSession,
      });
    }
  }

  function customSessionValues(control) {
    return {
      ...seedCustomValues(control),
      ...(sessionFor(control)?.customValues ?? {}),
    };
  }

  function customMainChannelName(control) {
    const channels = getCustomValueChannels(control);
    return channels?.mainValue ? 'mainValue' : (Object.keys(channels ?? {})[0] ?? '');
  }

  function customMainBehaviorModule(control) {
    const channelName = customMainChannelName(control);
    return Object.values(getCustomBehaviors(control) ?? {}).find((entry) => entry?.valueChannel === channelName) ?? null;
  }

  function customHitZoneEntry(control, hitZoneName = '') {
    const name = String(hitZoneName ?? '').trim();
    if (!name) return null;
    const zone = getCustomHitZones(control)?.[name] ?? null;
    return zone ? { name, zone } : null;
  }

  function customHitZoneFromEventTarget(control, event) {
    const hitZoneElement = event?.target?.closest?.('.custom-hit-zone');
    if (!hitZoneElement) return null;
    const label = hitZoneElement.querySelector?.('span')?.textContent ?? '';
    return customHitZoneEntry(control, label);
  }

  function defaultCustomActivationHitZone(control) {
    const entries = Object.entries(getCustomHitZones(control) ?? {})
      .filter(([, zone]) => zone?.enabled !== false)
      .sort((left, right) => numberOr(right?.[1]?.priority, 0) - numberOr(left?.[1]?.priority, 0));
    const actionPriority = ['cyclevalue', 'togglevalue', 'setvalue', 'selectvalue', 'cellvalue', 'notevalue'];
    for (const wantedAction of actionPriority) {
      const match = entries.find(([, zone]) => String(zone?.action ?? '').trim().toLowerCase() === wantedAction);
      if (match) return { name: match[0], zone: match[1] };
    }
    const first = entries[0];
    return first ? { name: first[0], zone: first[1] } : null;
  }

  function patchCustomInteraction(control, hitZoneEntry, event, extraPatch = {}) {
    const controlId = getControlId(control);
    const rect = pointerActiveElement?.getBoundingClientRect?.()
      ?? event?.currentTarget?.getBoundingClientRect?.();
    const patch = resolveCustomInteractionPatch(control, sessionFor(control), hitZoneEntry, {
      rect,
      clientX: event?.clientX ?? rect?.left ?? 0,
      clientY: event?.clientY ?? rect?.top ?? 0,
      startClientX: pointerDownPoint?.x,
      startClientY: pointerDownPoint?.y,
      startValues: pointerCustomStartValues,
      fine: event?.shiftKey === true,
    });
    if (!controlId || !Object.keys(patch).length) return;
    patchControlSession(controlId, {
      ...patch,
      ...extraPatch,
    });
  }

  function updateCustomDragFromPointer(control, event) {
    if (!pointerCustomHitZone) return;
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return;
    const patch = resolveCustomInteractionPatch(control, sessionFor(control), pointerCustomHitZone, {
      rect,
      clientX: event.clientX,
      clientY: event.clientY,
      startClientX: pointerDownPoint?.x,
      startClientY: pointerDownPoint?.y,
      startValues: pointerCustomStartValues,
      fine: event?.shiftKey === true,
    });
    if (!Object.keys(patch).length) return;
    patchControlSession(getControlId(control), {
      ...patch,
      activeCustomBehavior: pointerCustomHitZone?.zone?.targetBehavior ?? '',
      activeCustomHitZone: pointerCustomHitZone?.name ?? '',
      dragging: true,
    });
  }

  function adjustCustomMainValue(control, direction = 1) {
    const channelName = customMainChannelName(control);
    const channel = getCustomValueChannels(control)?.[channelName] ?? null;
    if (!channel) return;
    const currentValues = customSessionValues(control);
    const currentValue = currentValues?.[channelName] ?? channel?.defaultValue ?? 0;
    const nextValue = snapCustomChannelValue(channel, numberOr(currentValue, 0) + (direction * numberOr(channel?.step, 0.01)));
    patchControlSession(getControlId(control), {
      customValues: {
        ...currentValues,
        [channelName]: nextValue,
      },
      customNormalizedValue: normalizeCustomChannelValue(channel, nextValue),
      valueOverrideEnabled: channelName === 'mainValue',
      valueOverride: channelName === 'mainValue' ? nextValue : sessionFor(control)?.valueOverride,
      focused: true,
      hover: true,
    });
  }

  function setCustomMainValue(control, value) {
    const channelName = customMainChannelName(control);
    const channel = getCustomValueChannels(control)?.[channelName] ?? null;
    if (!channel) return;
    const nextValue = snapCustomChannelValue(channel, value);
    patchControlSession(getControlId(control), {
      customValues: {
        ...customSessionValues(control),
        [channelName]: nextValue,
      },
      customNormalizedValue: normalizeCustomChannelValue(channel, nextValue),
      valueOverrideEnabled: channelName === 'mainValue',
      valueOverride: channelName === 'mainValue' ? nextValue : sessionFor(control)?.valueOverride,
      focused: true,
      hover: true,
    });
  }

  function patchCustomKeyboardActivation(control, event) {
    const resolvedPreview = resolvedPreviewFor(control);
    const hitZoneEntry = defaultCustomActivationHitZone(resolvedPreview?.control ?? control)
      ?? defaultCustomActivationHitZone(control);
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    patchCustomInteraction(control, hitZoneEntry, {
      ...event,
      currentTarget: event?.currentTarget,
      clientX: rect ? rect.left + rect.width / 2 : undefined,
      clientY: rect ? rect.top + rect.height / 2 : undefined,
    }, {
      focused: true,
      hover: true,
      pressed: false,
      dragging: false,
      inputModality: 'keyboard',
    });
  }

  function isPointInsideActiveHitbox(clientX, clientY) {
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function clearRangeInput(controlId) {
    patchControlSession(controlId, {
      valueInputActive: false,
      valueInputBuffer: '',
    });
  }

  function beginRangeFieldEdit(control) {
    const controlId = getControlId(control);
    patchControlSession(controlId, {
      focused: true,
      hover: true,
      valueInputActive: true,
      valueInputBuffer: resolveRangeDisplayValue(getBehavior(control), sessionFor(control)),
    });
  }

  function commitRangeFieldInput(control) {
    const controlId = getControlId(control);
    const session = sessionFor(control);
    const rawValue = session?.valueInputActive === true
      ? String(session?.valueInputBuffer ?? '')
      : resolveRangeDisplayValue(getBehavior(control), session);
    const parsed = parseRangeInputValue(getBehavior(control), rawValue);

    patchControlSession(controlId, {
      valueInputActive: false,
      valueInputBuffer: '',
      ...(parsed === null ? {} : {
        valueOverrideEnabled: true,
        valueOverride: parsed,
      }),
    });
  }

  function handleRangeFieldInput(control, event) {
    event.stopPropagation();
    const rawValue = String(event?.currentTarget?.value ?? '');
    const parsed = parseRangeInputValue(getBehavior(control), rawValue);
    patchControlSession(getControlId(control), {
      valueInputActive: true,
      valueInputBuffer: rawValue,
      ...(parsed === null ? {} : {
        valueOverrideEnabled: true,
        valueOverride: parsed,
      }),
    });
  }

  function handleRangeFieldKeyDown(control, event) {
    event.stopPropagation();

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      adjustRangeFromKey(control, event.key);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitRangeFieldInput(control);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      clearRangeInput(getControlId(control));
    }
  }

  function handleRangeFieldFocus(control, event) {
    event.stopPropagation();
    beginRangeFieldEdit(control);
  }

  function handleRangeFieldBlur(control, event) {
    event.stopPropagation();
    commitRangeFieldInput(control);
    patchControlSession(getControlId(control), {
      focused: false,
      pressed: false,
      dragging: false,
    });
  }

  function setRangeValue(control, nextValue, extraPatch = {}) {
    if (!isRangeControl(control)) return;
    patchControlSession(getControlId(control), {
      valueOverrideEnabled: true,
      valueOverride: snapRangeValue(getBehavior(control), nextValue),
      valueInputActive: false,
      valueInputBuffer: '',
      ...extraPatch,
    });
  }

  function setSliderRoleValue(control, role = 'current', nextValue = 0, extraPatch = {}) {
    if (!isSliderControl(control)) return;

    const behavior = getBehavior(control);
    const session = sessionFor(control);
    const legal = getSliderLegalRangeForHandle(behavior, session, role);
    const clamped = Math.max(legal.min, Math.min(legal.max, snapSliderValue(behavior, nextValue)));
    const currentRolePatch = role === 'current'
      ? {
          valueOverrideEnabled: true,
          valueOverride: clamped,
        }
      : {
          valueOverrideEnabled: false,
        };
    patchControlSession(getControlId(control), {
      activeHandle: role,
      valueInputRole: role,
      [`${role}ValueOverrideEnabled`]: true,
      [`${role}ValueOverride`]: clamped,
      ...currentRolePatch,
      valueInputActive: false,
      valueInputBuffer: '',
      ...extraPatch,
    });
  }

  function adjustRangeFromKey(control, key) {
    if (!isRangeControl(control)) return;

    const behavior = getBehavior(control);
    if (isTwoValueSpinner(control)) {
      const session = sessionFor(control);
      const handle = getRangeActiveHandle(session);
      switch (key) {
        case 'Home':
          setSpinnerHandleValue(control, handle, getRangeMin(behavior), { hover: true, focused: true });
          break;
        case 'End':
          setSpinnerHandleValue(control, handle, getRangeMax(behavior), { hover: true, focused: true });
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          adjustSpinnerActiveHandle(control, -1);
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          adjustSpinnerActiveHandle(control, 1);
          break;
        case 'PageDown':
          adjustSpinnerActiveHandle(control, -1, 10);
          break;
        case 'PageUp':
          adjustSpinnerActiveHandle(control, 1, 10);
          break;
        default:
          break;
      }
      return;
    }
    if (isSliderControl(control)) {
      const role = currentSliderActiveHandle(control);
      const legal = getSliderLegalRangeForHandle(behavior, sessionFor(control), role);
      let nextValue = currentSliderRoleValue(control, role);

      switch (key) {
        case 'Home':
          nextValue = legal.min;
          break;
        case 'End':
          nextValue = legal.max;
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          nextValue = snapSliderValue(behavior, nextValue - numberOr(behavior?.step, 0.01));
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          nextValue = snapSliderValue(behavior, nextValue + numberOr(behavior?.step, 0.01));
          break;
        case 'PageDown':
          nextValue = snapSliderValue(behavior, nextValue - numberOr(behavior?.step, 0.01) * 10);
          break;
        case 'PageUp':
          nextValue = snapSliderValue(behavior, nextValue + numberOr(behavior?.step, 0.01) * 10);
          break;
        default:
          return;
      }

      setSliderRoleValue(control, role, nextValue);
      return;
    }

    let nextValue = currentRangeValue(control);

    switch (key) {
      case 'Home':
        nextValue = getRangeMin(behavior);
        break;
      case 'End':
        nextValue = getRangeMax(behavior);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        nextValue = adjustRangeValue(behavior, nextValue, -1);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        nextValue = adjustRangeValue(behavior, nextValue, 1);
        break;
      case 'PageDown':
        nextValue = adjustRangeValue(behavior, nextValue, -1, 10);
        break;
      case 'PageUp':
        nextValue = adjustRangeValue(behavior, nextValue, 1, 10);
        break;
      default:
        return;
    }

    setRangeValue(control, nextValue);
  }

  function handleRangeTextInput(control, key) {
    // The two-value spinner does not yet support inline digit typing (per-handle
    // editing is a follow-up); let those keys fall through for now.
    if (isTwoValueSpinner(control)) return false;

    const controlId = getControlId(control);
    const session = sessionFor(control);
    const currentBuffer = session?.valueInputActive === true ? String(session?.valueInputBuffer ?? '') : '';

    if (key === 'Escape') {
      clearRangeInput(controlId);
      return true;
    }

    if (key === 'Enter') {
      const parsed = parseRangeInputValue(getBehavior(control), currentBuffer);
      patchControlSession(controlId, {
        valueInputActive: false,
        valueInputBuffer: '',
        ...(parsed === null ? {} : {
          valueOverrideEnabled: true,
          valueOverride: parsed,
        }),
      });
      return true;
    }

    let nextBuffer = currentBuffer;
    if (key === 'Backspace') {
      nextBuffer = currentBuffer.slice(0, -1);
    } else if (key === 'Delete') {
      nextBuffer = '';
    } else if (isRangeTextInputKey(key)) {
      nextBuffer = `${currentBuffer}${key}`;
    } else {
      return false;
    }

    const parsed = parseRangeInputValue(getBehavior(control), nextBuffer);
    patchControlSession(controlId, {
      valueInputActive: true,
      valueInputBuffer: nextBuffer,
      ...(parsed === null ? {} : {
        valueOverrideEnabled: true,
        valueOverride: parsed,
      }),
    });
    return true;
  }

  function updateSliderRangeFromPointer(control, event, roleOverride = '') {
    if (!isRangeControl(control)) return;
    if (isSliderControl(control)) {
      const role = String(roleOverride || pointerSliderHandle || currentSliderActiveHandle(control)).trim().toLowerCase();
      setSliderRoleValue(control, role, sliderValueForPoint(control, event), { dragging: true });
      return;
    }

    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return;

    const behavior = getBehavior(control);
    const min = getRangeMin(behavior);
    const max = getRangeMax(behavior);
    const normalized = normalizedRangePointerValue(behavior, rect, event.clientX, event.clientY);
    setRangeValue(control, min + ((max - min) * normalized));
  }

  function updateScrubRangeFromPointer(control, event) {
    if (!isRangeControl(control)) return;
    setRangeValue(
      control,
      scrubRangeValue(
        getBehavior(control),
        pointerStartValue,
        pointerDownPoint,
        { x: event.clientX, y: event.clientY }
      ),
      { dragging: true }
    );
  }

  function maybeStartRangeDrag(control, event) {
    if (!isRangeControl(control) || draggingRange) return false;

    const behavior = getBehavior(control);
    // The two-value spinner uses click-to-select + steppers, not single-value
    // scrub, so a drag must not corrupt one shared value.
    if (isTwoValueSpinner(control)) return false;
    if (behavior?.dragEnabled !== true || isSliderRangeBehavior(behavior)) return false;

    const dx = Math.abs(event.clientX - pointerDownPoint.x);
    const dy = Math.abs(event.clientY - pointerDownPoint.y);
    if (Math.max(dx, dy) < 5) return false;

    draggingRange = true;
    patchControlSession(getControlId(control), { dragging: true });
    return true;
  }

  // Control-local coordinates (logical px) for a pointer/wheel event — the payload for interaction scripts.
  function controlLocalPoint(event) {
    const rect = event?.currentTarget?.getBoundingClientRect?.() ?? pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return { x: 0, y: 0 };
    const s = scale || 1;
    return { x: Math.round((event.clientX - rect.left) / s), y: Math.round((event.clientY - rect.top) / s) };
  }

  function handleRangeWheel(control, event) {
    // Fire onWheel for ANY control (before the range-only built-in below returns), so a script can
    // react to the wheel even on non-range controls. delta = +1 up / -1 down; raw deltas included.
    dispatchInteraction(getControlId(control), 'onWheel', {
      ...controlLocalPoint(event),
      delta: event.deltaY < 0 ? 1 : -1,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    });
    // Hardware style: while an LCD edit zone is active, the wheel acts as a data
    // knob — cycling the char under the caret (text) or the option (choice).
    if (lcdEdit.active && lcdEdit.id === getControlId(control)) {
      event.preventDefault();
      const dir = event.deltaY < 0 ? 1 : -1;
      if (lcdEdit.kind === 'choice') lcdCycleChoice(control, lcdEdit.sourceId, dir);
      else lcdApplyEdit(control, 'cycle', dir);
      return;
    }
    // Listbox: wheel scrolls the row viewport (one row per notch).
    if (isListboxControl(control)) {
      const rect = event.currentTarget?.getBoundingClientRect?.();
      const viewH = numberOr(control?._children?.Transform?.height, rect ? rect.height / (scale || 1) : 0);
      const max = listboxMaxScroll(control, viewH, lbFilter(control));
      if (max <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      const cur = numberOr(sessionFor(control)?.listboxScrollTop, 0);
      // Smooth = pixel scroll (raw wheel delta); line = one row-stride per notch.
      const smooth = String(listboxConfig(control).scrollMode) === 'smooth';
      const step = smooth
        ? Math.max(-80, Math.min(80, event.deltaY))
        : listboxRowStride(control) * (event.deltaY > 0 ? 1 : -1);
      const next = Math.max(0, Math.min(max, cur + step));
      if (next !== cur) patchControlSession(getControlId(control), { listboxScrollTop: next });
      return;
    }
    if (isCustomComponent(control)) {
      if (isDisabled(control)) return;
      event.preventDefault();
      event.stopPropagation();
      const baseDirection = event.deltaY < 0 ? 1 : -1;
      adjustCustomMainValue(control, baseDirection * (isCustomMouseDirectionReversed(customMainBehaviorModule(control)) ? -1 : 1));
      return;
    }

    const behavior = getBehavior(control);
    if (!isRangeControl(control) || behavior?.wheelEnabled !== true) return;

    event.preventDefault();
    event.stopPropagation();
    const direction = resolveMouseDirection(behavior, event.deltaY < 0 ? 1 : -1);
    if (isTwoValueSpinner(control)) {
      adjustSpinnerActiveHandle(control, direction);
      return;
    }
    if (isSliderControl(control)) {
      const role = currentSliderActiveHandle(control);
      setSliderRoleValue(control, role, currentSliderRoleValue(control, role) + (direction * numberOr(behavior?.step, 0.01)), {
        hover: true,
        focused: true,
      });
      return;
    }

    setRangeValue(control, adjustRangeValue(behavior, currentRangeValue(control), direction), {
      hover: true,
      focused: true,
    });
  }

  function handleRangePointerClick(control, event) {
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return;

    if (isTwoValueSpinner(control)) {
      const zone = resolveSpinnerZone(rect, event.clientX);
      if (zone !== pointerDownZone) return;
      if (zone === 'low') {
        setSpinnerActiveHandle(control, 'start');
      } else if (zone === 'high') {
        setSpinnerActiveHandle(control, 'end');
      } else if (zone === 'decrement') {
        adjustSpinnerActiveHandle(control, -1);
      } else if (zone === 'increment') {
        adjustSpinnerActiveHandle(control, 1);
      }
      return;
    }

    const zone = resolveRangeZone(getBehavior(control), rect, event.clientX, event.clientY);
    if (zone !== pointerDownZone) return;
    if (zone === 'decrement') {
      setRangeValue(control, adjustRangeValue(getBehavior(control), currentRangeValue(control), -1));
    } else if (zone === 'increment') {
      setRangeValue(control, adjustRangeValue(getBehavior(control), currentRangeValue(control), 1));
    }
  }

  function removeWindowListeners() {
    window.removeEventListener('pointermove', handleWindowPointerMove);
    window.removeEventListener('pointerup', handleWindowPointerUp);
  }

  onDestroy(() => {
    removeWindowListeners();
    timedButtonPreview.destroy();
  });

  $effect(() => {
    const activeControlIds = orderedControls.map((control) => getControlId(control)).filter(Boolean);
    timedButtonPreview.syncKeys(activeControlIds);

    if (pointerActiveControlId && !activeControlIds.includes(pointerActiveControlId)) {
      pointerActiveControlId = '';
      pointerActiveElement = null;
      draggingRange = false;
      pointerDownZone = '';
      pointerSliderHandle = '';
      pointerCustomHitZone = null;
      pointerCustomStartValues = {};
      removeWindowListeners();
    }

    for (const control of orderedControls) {
      const controlId = getControlId(control);
      if (!controlId) continue;
      timedButtonPreview.syncSession(controlId, sessionFor(control));
    }
  });

  function handlePointerEnter(control) {
    if (isDisabled(control)) return;
    const controlId = getControlId(control);
    inspectPreviewControl(controlId);
    patchControlSession(controlId, { hover: true });
  }

  function handlePointerMove(control, event) {
    // onPointerMove: throttled (~30fps) hover-move over a control, control-local coords. Fires for any
    // control; the built-in custom-hit-zone hover tracking below still only runs for custom components.
    const moveAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (moveAt - lastPointerMoveDispatchAt > 33) {
      lastPointerMoveDispatchAt = moveAt;
      dispatchInteraction(getControlId(control), 'onPointerMove', controlLocalPoint(event));
    }
    // Listbox drag-scroll while the pointer is held down on it.
    if (listboxDrag && listboxDrag.id === getControlId(control)) {
      const dy = (event.clientY - listboxDrag.startY) / (scale || 1);
      if (Math.abs(dy) > 4) listboxDrag.moved = true;
      const max = listboxMaxScroll(control, listboxViewport(control), lbFilter(control));
      const next = Math.max(0, Math.min(max, listboxDrag.startScroll - dy));
      patchControlSession(getControlId(control), { listboxScrollTop: next });
      return;
    }
    // Listbox per-row hover: track the row under the pointer so the renderer can
    // highlight / animate it. Runs whether or not the pointer is held.
    if (isListboxControl(control) && !isDisabled(control)) {
      if (listboxConfig(control).hoverHighlight !== false) {
        const rect = event?.currentTarget?.getBoundingClientRect?.();
        if (rect) {
          const transformSection = control?._children?.Transform ?? null;
          const localY = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * (transformSection?.height ?? rect.height);
          const scrollTop = numberOr(sessionFor(control)?.listboxScrollTop, 0);
          const filter = lbFilter(control);
          const idx = listboxRowIndexAtPoint(control, localY, scrollTop, filter);
          const row = idx >= 0 ? listboxRows(control, filter)[idx] : undefined;
          const hoverIdx = isSelectableRow(row) ? idx : -1;
          if ((sessionFor(control)?.listboxHoverIndex ?? -1) !== hoverIdx) {
            patchControlSession(getControlId(control), { listboxHoverIndex: hoverIdx });
          }
        }
      }
      return;
    }
    if (isDisabled(control) || pointerActiveControlId) return;
    if (!isCustomComponent(control)) return;
    const controlId = getControlId(control);
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    const resolvedPreview = resolvedPreviewFor(control);
    const hoveredHitZone = resolveCustomHitZoneAtPoint(resolvedPreview?.control ?? control, rect, event.clientX, event.clientY, sessionFor(control)?.customValues ?? {})
      ?? customHitZoneFromEventTarget(resolvedPreview?.control ?? control, event)
      ?? customHitZoneFromEventTarget(control, event);
    const hoveredName = hoveredHitZone?.name ?? '';
    if ((sessionFor(control)?.hoveredCustomHitZone ?? '') === hoveredName) return;
    patchControlSession(controlId, {
      hover: true,
      hoveredCustomBehavior: hoveredHitZone?.zone?.targetBehavior ?? '',
      hoveredCustomHitZone: hoveredName,
    });
  }

  function handlePointerLeave(control) {
    if (isDisabled(control)) return;
    const controlId = getControlId(control);
    // Drop any listbox hover-row highlight when the pointer leaves.
    if (isListboxControl(control) && (sessionFor(control)?.listboxHoverIndex ?? -1) !== -1) {
      patchControlSession(controlId, { listboxHoverIndex: -1 });
    }
    if (pointerActiveControlId === controlId) {
      patchControlSession(controlId, {
        hover: false,
        hoveredCustomBehavior: '',
        hoveredCustomHitZone: '',
      });
      return;
    }

    patchControlSession(controlId, {
      hover: false,
      pressed: false,
      dragging: false,
      hoveredCustomBehavior: '',
      hoveredCustomHitZone: '',
    });
  }

  function handlePointerDown(control, event) {
    if (event.button !== 0) return;
    if (isDisabled(control)) return;

    // Double-click: two presses on the same control within 350ms (CanvasControl has no native dblclick).
    const downId = getControlId(control);
    const downAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const isDoubleTap = downId === lastPointerDownId && (downAt - lastPointerDownAt) < 350;
    if (isDoubleTap) {
      dispatchInteraction(downId, 'onDoubleClick', controlLocalPoint(event));
    }
    listboxDoubleTap = isDoubleTap && isListboxControl(control);
    lastPointerDownId = downId;
    lastPointerDownAt = downAt;
    const pointerDownLocal = controlLocalPoint(event);

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    event.currentTarget?.focus?.();
    lastInputMode = 'pointer';
    keyboardFocusControlId = '';
    pointerActiveControlId = getControlId(control);
    // Arm listbox drag-scroll (a moved drag suppresses the row select on release).
    listboxDrag = (isListboxControl(control) && listboxConfig(control).dragScroll === true)
      ? { id: getControlId(control), startY: event.clientY, startScroll: numberOr(sessionFor(control)?.listboxScrollTop, 0), moved: false }
      : null;
    // "@active" zone source — but a display itself never counts as the active
    // control (clicking a screen shouldn't make its own zones show the screen).
    if (pointerActiveControlId && !['LcdDisplay', 'PixelDisplay'].includes(String(control?._children?.Core?.controlType ?? ''))) {
      lcdActiveAt[pointerActiveControlId] = Date.now(); lcdActiveId = pointerActiveControlId;
    }
    // Clicking an LCD with an editable zone focuses it; clicking anything else
    // ends any active edit. Text targets place the caret at the end; a choice
    // target just arms the cycler (wheel/arrows change the option).
    const editTargets = screenEditTargets(control);
    if (editTargets.length) {
      // Pick the edit field under the click (falling back to the first one);
      // clicking inside a text field places the caret at the clicked character.
      const dtype = String(control?._children?.Core?.controlType ?? '');
      let target;
      let caret;
      if (dtype === 'PixelDisplay') {
        target = editTargets.find((t) => pixelElementContainsPoint(control, t.element, pointerDownLocal)) ?? editTargets[0];
        caret = target.kind === 'text' ? pixelCaretFromPoint(control, target.element, pointerDownLocal) : 0;
      } else {
        const displayCols = Math.max(1, Math.round(numberOr(lcdDisplayOf(control)?.cols, 16)));
        const cell = lcdCellFromPoint(control, pointerDownLocal);
        target = editTargets.find((t) => lcdZoneContainsCell(t.zone, cell, displayCols)) ?? editTargets[0];
        caret = target.kind === 'text'
          ? lcdCaretFromCell(target.zone, cell, displayCols, lcdEditText(control, target.sourceId).length)
          : 0;
      }
      lcdArmEdit(control, target, caret);
    } else if (lcdEdit.active) {
      lcdEdit = { ...LCD_EDIT_IDLE };
    }
    if (openComboboxControlId && openComboboxControlId !== pointerActiveControlId) {
      openComboboxControlId = '';
    }
    pointerActiveElement = event.currentTarget;
    pointerDownPoint = { x: event.clientX, y: event.clientY };
    pointerDownZone = '';
    pointerSliderHandle = '';
    pointerCustomHitZone = null;
    pointerCustomStartValues = {};
    pointerStartValue = isSliderControl(control)
      ? currentSliderRoleValue(control, currentSliderActiveHandle(control))
      : currentRangeValue(control);
    draggingRange = isRangeControl(control) && isSliderRangeBehavior(getBehavior(control));
    inspectPreviewControl(pointerActiveControlId);

    if (isCustomComponent(control)) {
      const rect = pointerActiveElement?.getBoundingClientRect?.();
      const resolvedPreview = resolvedPreviewFor(control);
      pointerCustomHitZone = resolveCustomHitZoneAtPoint(resolvedPreview?.control ?? control, rect, event.clientX, event.clientY, sessionFor(control)?.customValues ?? {})
        ?? customHitZoneFromEventTarget(resolvedPreview?.control ?? control, event)
        ?? customHitZoneFromEventTarget(control, event);
      pointerCustomStartValues = { ...(sessionFor(control)?.customValues ?? {}) };
      const action = String(pointerCustomHitZone?.zone?.action ?? '').trim().toLowerCase();
      const isDragAction = action === 'dragvalue' || action === 'scrubvalue' || action === '';
      if (isDragAction) {
        patchCustomInteraction(control, pointerCustomHitZone, event, {
          hover: true,
          pressed: false,
          focused: false,
          dragging: true,
        });
        updateCustomDragFromPointer(control, event);
      } else {
        patchControlSession(pointerActiveControlId, {
          hover: true,
          pressed: false,
          focused: false,
          dragging: false,
          activeCustomBehavior: pointerCustomHitZone?.zone?.targetBehavior ?? '',
          activeCustomHitZone: pointerCustomHitZone?.name ?? '',
        });
      }
      window.addEventListener('pointermove', handleWindowPointerMove);
      window.addEventListener('pointerup', handleWindowPointerUp);
      return;
    }

    if (isRangeControl(control)) {
      const rect = pointerActiveElement?.getBoundingClientRect?.();
      pointerDownZone = isTwoValueSpinner(control)
        ? resolveSpinnerZone(rect, event.clientX)
        : resolveRangeZone(getBehavior(control), rect, event.clientX, event.clientY);
    }

    let nextSliderHandle = '';
    if (isSliderControl(control)) {
      const directHandle = pickDirectSliderHandle(control, event);
      const clickMode = String(getBehavior(control)?.trackClickMode ?? 'moveNearestHandle').trim().toLowerCase();
      nextSliderHandle = directHandle || (
        clickMode === 'moveactivehandle'
          ? currentSliderActiveHandle(control)
          : pickNearestSliderHandle(control, event)
      );
      pointerSliderHandle = nextSliderHandle;
      patchControlSession(pointerActiveControlId, {
        activeHandle: nextSliderHandle,
        valueInputRole: nextSliderHandle,
      });
    }

    patchControlSession(pointerActiveControlId, {
      hover: true,
      pressed: true,
      focused: false,
      dragging: draggingRange,
      pointerX: pointerDownLocal.x,
      pointerY: pointerDownLocal.y,
      pointerButton: event.button,
      pointerModifiers: (event.shiftKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.altKey ? 4 : 0) | (event.metaKey ? 8 : 0),
    });
    if (isTimedButtonBehavior(getBehavior(control))) {
      timedButtonPreview.beginPress(pointerActiveControlId, getBehavior(control));
    }

    if (draggingRange) {
      updateSliderRangeFromPointer(control, event, nextSliderHandle);
    }

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
  }

  function handleWindowPointerMove(event) {
    if (!pointerActiveControlId) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    const activeControl = orderedControls.find((control) => getControlId(control) === pointerActiveControlId) ?? null;
    if (!activeControl || isDisabled(activeControl)) return;

    if (isCustomComponent(activeControl)) {
      updateCustomDragFromPointer(activeControl, event);
      return;
    }

    if (!isRangeControl(activeControl)) return;
    if (isSliderRangeBehavior(getBehavior(activeControl))) {
      if (!draggingRange) return;
      updateSliderRangeFromPointer(activeControl, event, pointerSliderHandle);
      return;
    }

    if (maybeStartRangeDrag(activeControl, event)) {
      updateScrubRangeFromPointer(activeControl, event);
      return;
    }

    if (draggingRange) {
      updateScrubRangeFromPointer(activeControl, event);
    }
  }

  function handleWindowPointerUp(event) {
    if (!pointerActiveControlId) return;
    event.preventDefault?.();
    event.stopPropagation?.();

    const activeId = pointerActiveControlId;
    const activeControl = orderedControls.find((control) => getControlId(control) === activeId) ?? null;
    const inside = isPointInsideActiveHitbox(event.clientX, event.clientY);
    const activeBehavior = getBehavior(activeControl);

    if (isCustomComponent(activeControl)) {
      const action = String(pointerCustomHitZone?.zone?.action ?? '').trim().toLowerCase();
      if (inside && activeControl && !isDisabled(activeControl) && action && action !== 'dragvalue' && action !== 'scrubvalue') {
        patchCustomInteraction(activeControl, pointerCustomHitZone, event, {
          hover: inside,
          pressed: false,
          dragging: false,
          inputModality: 'pointer',
        });
      } else {
        patchControlSession(activeId, {
          hover: inside,
          pressed: false,
          dragging: false,
          inputModality: 'pointer',
        });
      }

      pointerActiveControlId = '';
      pointerActiveElement = null;
      draggingRange = false;
      pointerDownZone = '';
      pointerSliderHandle = '';
      pointerCustomHitZone = null;
      pointerCustomStartValues = {};
      removeWindowListeners();
      return;
    }

    if (!draggingRange && inside && activeControl && !isDisabled(activeControl)) {
      if (isRangeControl(activeControl) && !isSliderRangeBehavior(getBehavior(activeControl))) {
        handleRangePointerClick(activeControl, event);
      } else if (isTimedButtonBehavior(activeBehavior)) {
        timedButtonPreview.releasePress(activeId, activeBehavior, { inside });
      } else if (String(getBehavior(activeControl)?.family ?? 'trigger') === 'select') {
        if (isListboxControl(activeControl)) {
          // A moved drag-scroll suppresses the row select on release.
          if (!(listboxDrag && listboxDrag.moved)) {
            const row = resolveListboxPreviewValue(activeControl, event.clientX, event.clientY);
            if (row) {
              const mode = String(listboxConfig(activeControl).confirmMode ?? 'single');
              if (mode === 'double' && listboxDoubleTap) confirmListboxPending(activeControl, row);
              else activateListboxRow(activeControl, row);
            }
          }
          patchControlSession(activeId, { focused: true, hover: true });
        } else if (isComboboxControl(activeControl)) {
          openComboboxControlId = openComboboxControlId === activeId ? '' : activeId;
          patchControlSession(activeId, {
            focused: true,
            hover: true,
          });
        } else {
          const value = resolveRadioGroupPreviewValue(activeControl, event.clientX, event.clientY);
          commitSelectActionAndEmit(activeControl, {
            value,
          });
        }
      }
    } else if (isTimedButtonBehavior(activeBehavior)) {
      timedButtonPreview.releasePress(activeId, activeBehavior, { inside });
    }

    patchControlSession(activeId, {
      hover: inside,
      pressed: false,
      dragging: false,
    });

    pointerActiveControlId = '';
    pointerActiveElement = null;
    draggingRange = false;
    pointerDownZone = '';
    pointerSliderHandle = '';
    pointerCustomHitZone = null;
    pointerCustomStartValues = {};
    listboxDrag = null;
    removeWindowListeners();
  }

  function handleFocus(control) {
    if (isDisabled(control)) return;
    if (lastInputMode !== 'keyboard') return;

    const controlId = getControlId(control);
    keyboardFocusControlId = controlId;
    inspectPreviewControl(controlId);
    patchControlSession(controlId, { focused: true });
  }

  function handleBlur(control) {
    const controlId = getControlId(control);
    if (lcdEdit.active && lcdEdit.id === controlId) {
      lcdEdit = { ...LCD_EDIT_IDLE };
    }
    if (isTimedButtonBehavior(getBehavior(control))) {
      timedButtonPreview.cancel(controlId);
    }

    if (keyboardFocusControlId === controlId) {
      keyboardFocusControlId = '';
    }

    if (openComboboxControlId === controlId) {
      openComboboxControlId = '';
    }

    patchControlSession(controlId, {
      focused: false,
      pressed: false,
      dragging: false,
      valueInputActive: false,
    });

    if (pointerActiveControlId === controlId) {
      pointerActiveControlId = '';
      pointerActiveElement = null;
      draggingRange = false;
      pointerSliderHandle = '';
      removeWindowListeners();
    }
  }

  function handleKeyDown(control, event) {
    if (isDisabled(control)) return;

    const controlId = getControlId(control);
    lastInputMode = 'keyboard';
    keyboardFocusControlId = controlId;
    inspectPreviewControl(controlId);

    // Listbox keyboard navigation (arrows / page / home / end) + type-ahead.
    if (isListboxControl(control)) {
      if (handleListboxKey(control, event)) return;
      if (handleListboxTypeAhead(control, event)) return;
    }

    // On-screen editing takes over the keyboard while an LCD zone is active.
    if (lcdEdit.active && lcdEdit.id === controlId) {
      const key = event.key;
      if (key === 'Enter') { event.preventDefault(); lcdEdit = { ...LCD_EDIT_IDLE }; event.currentTarget?.blur?.(); return; }
      if (key === 'Escape') {
        // Cancel: restore the text as it was when editing started.
        event.preventDefault();
        if (lcdEdit.kind === 'text') lcdWriteEditText(control, lcdEdit.sourceId, lcdEdit.original);
        lcdEdit = { ...LCD_EDIT_IDLE };
        event.currentTarget?.blur?.();
        return;
      }
      if (key === 'Tab') {
        // Cycle between the layout's edit fields (Shift+Tab goes back).
        event.preventDefault();
        const targets = screenEditTargets(control);
        if (targets.length > 1) {
          const idx = targets.findIndex((t) => String(t.id ?? t.zone?.id ?? '') === lcdEdit.zoneId);
          const next = targets[(((idx < 0 ? 0 : idx) + (event.shiftKey ? -1 : 1)) % targets.length + targets.length) % targets.length];
          lcdArmEdit(control, next, next.kind === 'text' ? lcdEditText(control, next.sourceId).length : 0);
        }
        return;
      }
      if (lcdEdit.kind === 'choice') {
        // Choice cycler: arrows move through the bound control's options.
        if (key === 'ArrowUp' || key === 'ArrowRight') { event.preventDefault(); lcdCycleChoice(control, lcdEdit.sourceId, 1); return; }
        if (key === 'ArrowDown' || key === 'ArrowLeft') { event.preventDefault(); lcdCycleChoice(control, lcdEdit.sourceId, -1); return; }
        return;
      }
      // Free-text editing (Label / @edit).
      if (key === 'ArrowLeft') { event.preventDefault(); lcdApplyEdit(control, 'left'); return; }
      if (key === 'ArrowRight') { event.preventDefault(); lcdApplyEdit(control, 'right'); return; }
      if (key === 'Home') { event.preventDefault(); lcdApplyEdit(control, 'home'); return; }
      if (key === 'End') { event.preventDefault(); lcdApplyEdit(control, 'end'); return; }
      if (key === 'Backspace') { event.preventDefault(); lcdApplyEdit(control, 'backspace'); return; }
      if (key === 'Delete') { event.preventDefault(); lcdApplyEdit(control, 'delete'); return; }
      // Hardware style: Up/Down cycles the char under the caret through the charset.
      if (key === 'ArrowUp') { event.preventDefault(); lcdApplyEdit(control, 'cycle', 1); return; }
      if (key === 'ArrowDown') { event.preventDefault(); lcdApplyEdit(control, 'cycle', -1); return; }
      // Printable single characters insert (PC style).
      if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        lcdApplyEdit(control, 'insert', key);
        return;
      }
      return;
    }

    if (isRangeControl(control) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (handleRangeTextInput(control, event.key)) {
        event.preventDefault();
        event.currentTarget?.focus?.();
        patchControlSession(controlId, {
          focused: true,
          hover: true,
        });
        return;
      }
    }

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (event.repeat) return;
      event.currentTarget?.focus?.();
      patchControlSession(controlId, {
        focused: true,
        hover: true,
        pressed: isCustomComponent(control) ? false : true,
      });
      if (isTimedButtonBehavior(getBehavior(control))) {
        timedButtonPreview.beginPress(controlId, getBehavior(control));
      }
      return;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      if (isCustomComponent(control)) {
        event.preventDefault();
        event.currentTarget?.focus?.();
        patchControlSession(controlId, {
          focused: true,
          hover: true,
        });
        const channel = getCustomValueChannels(control)?.[customMainChannelName(control)] ?? null;
        if (event.key === 'Home' && channel) {
          setCustomMainValue(control, channel?.min ?? 0);
        } else if (event.key === 'End' && channel) {
          setCustomMainValue(control, channel?.max ?? 1);
        } else {
          adjustCustomMainValue(control, (event.key === 'ArrowLeft' || event.key === 'ArrowDown') ? -1 : 1);
        }
        return;
      }
      if (!isRangeControl(control)) return;
      event.preventDefault();
      event.currentTarget?.focus?.();
      patchControlSession(controlId, {
        focused: true,
        hover: true,
      });
      adjustRangeFromKey(control, event.key);
    }

    if ((event.key === 'PageUp' || event.key === 'PageDown') && isRangeControl(control) && !isCustomComponent(control)) {
      event.preventDefault();
      event.currentTarget?.focus?.();
      patchControlSession(controlId, { focused: true, hover: true });
      adjustRangeFromKey(control, event.key);
    }
  }

  function handleKeyUp(control, event) {
    if (isDisabled(control)) return;
    if (event.key !== ' ' && event.key !== 'Enter') return;

    event.preventDefault();
    const controlId = getControlId(control);
    if (isTimedButtonBehavior(getBehavior(control))) {
      timedButtonPreview.releasePress(controlId, getBehavior(control), { inside: true });
    } else if (isCustomComponent(control)) {
      patchCustomKeyboardActivation(control, event);
    } else if (String(getBehavior(control)?.family ?? 'trigger') === 'select') {
      if (isComboboxControl(control)) {
        openComboboxControlId = openComboboxControlId === controlId ? '' : controlId;
      } else {
        commitSelectActionAndEmit(control);
      }
    }
    patchControlSession(controlId, {
      focused: true,
      hover: true,
      pressed: false,
    });
  }

  function previewRoleFor(control) {
    if (isCustomComponent(control)) return previewRoleForCustomComponent(control);

    const behavior = getBehavior(control);
    const family = String(behavior?.family ?? 'trigger');
    const role = String(behavior?.role ?? '').trim().toLowerCase();
    const buttonType = String(behavior?.buttonType ?? '').trim().toLowerCase();

    if (family === 'range') return isSliderRangeBehavior(behavior) ? 'slider' : 'spinbutton';
    if (buttonType === 'combobox') return 'combobox';
    if (buttonType === 'radio') return 'radiogroup';
    if (role === 'radio' || role === 'segmented') return 'radio';
    if (role === 'toggle' || role === 'checkbox') return 'checkbox';
    return 'button';
  }

  function previewRoleForCustomComponent(control) {
    const hitZones = Object.values(getCustomHitZones(control) ?? {}).filter((zone) => zone?.enabled !== false);
    const behaviors = getCustomBehaviors(control);
    const behaviorNames = new Set(hitZones.map((zone) => String(zone?.targetBehavior ?? '').trim()).filter(Boolean));
    const behaviorList = [...behaviorNames].map((name) => behaviors?.[name]).filter(Boolean);
    if (!behaviorList.length) {
      behaviorList.push(...Object.values(behaviors ?? {}).filter(Boolean));
    }

    const hasMultipleTargets = hitZones.length > 1 || behaviorList.length > 1;
    if (hasMultipleTargets) return 'group';

    const behavior = behaviorList[0] ?? null;
    const role = String(behavior?.role ?? '').trim().toLowerCase();
    const type = String(behavior?.type ?? '').trim().toLowerCase();
    const geometry = String(behavior?.geometry ?? '').trim().toLowerCase();
    const action = String(hitZones[0]?.action ?? type ?? '').trim().toLowerCase();

    if (role.includes('button') || ['button', 'cycle', 'toggle'].includes(type) || ['cyclevalue', 'togglevalue', 'press'].includes(action)) {
      return 'button';
    }

    if (
      role.includes('slider')
      || role.includes('dial')
      || ['slider', 'dial', 'ring'].includes(type)
      || ['linear', 'horizontal', 'vertical', 'linear-vertical', 'circular', 'ring', 'dial', 'arc'].includes(geometry)
      || ['dragvalue', 'setvalue', 'scrubvalue'].includes(action)
    ) {
      return 'slider';
    }

    if (role.includes('meter') || type === 'meter') return 'meter';
    return 'group';
  }

  function previewAriaCheckedFor(control) {
    const role = previewRoleFor(control);
    if (role !== 'radio' && role !== 'checkbox') return undefined;
    return sessionFor(control)?.checked === true;
  }

  function previewTabIndexFor(control) {
    if (isDisabled(control)) return undefined;
    const role = previewRoleFor(control);
    return ['button', 'checkbox', 'radio', 'combobox', 'slider', 'spinbutton'].includes(role) ? 0 : undefined;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="panel-surface preview-surface"
  style="width: {panel.width}px; height: {panel.height}px; transform: scale({scale}); transform-origin: 0 0;"
  use:bindSurface
>
  {#each panel.bgLayerOrder ?? DEFAULT_LAYER_ORDER as layerId}
    {#if bgLayers[layerId]}
      <div class="bg-layer" style={bgLayers[layerId]}></div>
    {/if}
  {/each}

  {#if gridStyle}
    <div class="grid-overlay" style={gridStyle}></div>
  {/if}

  {#if $showGuides}
    <GuideLines {scale} panelWidth={panel.width} panelHeight={panel.height} />
  {/if}

  {#each orderedControls as control (control._children?.Core?.id)}
    {@const resolvedPreview = resolvedPreviewFor(control)}
    <CanvasControl
      {control}
      resolvedControlOverride={resolvedPreview?.control ?? control}
      interactionRuntimeOverride={resolvedPreview?.runtime ?? null}
      {scale}
      panelLocked={false}
      allControls={orderedControls}
      panelWidth={panel.width}
      panelHeight={panel.height}
      editorInteractionEnabled={false}
      previewSessionOverride={sessionFor(control)}
      renderIdNamespace={previewRenderIdNamespace}
      previewRole={previewRoleFor(control)}
      previewTabIndex={previewTabIndexFor(control)}
      previewAriaLabel={`${control?._children?.Core?.name ?? control?._children?.Core?.controlType ?? 'Control'} preview`}
      previewAriaDisabled={isDisabled(control)}
      previewAriaChecked={previewAriaCheckedFor(control)}
      previewAriaExpanded={isComboboxControl(control) ? openComboboxControlId === getControlId(control) : undefined}
      previewAriaValueNow={isRangeControl(control) ? currentRangeValue(control) : undefined}
      previewAriaValueMin={isRangeControl(control) ? getRangeMin(getBehavior(control)) : undefined}
      previewAriaValueMax={isRangeControl(control) ? getRangeMax(getBehavior(control)) : undefined}
      previewAriaValueText={isRangeControl(control) ? resolveRangeDisplayValue(getBehavior(control), sessionFor(control)) : undefined}
      previewValueField={previewRoleFor(control) === 'spinbutton' && !isTwoValueSpinner(control) ? {
        value: resolveRangeDisplayValue(getBehavior(control), sessionFor(control)),
        disabled: isDisabled(control),
        inputMode: String(getBehavior(control)?.valueType ?? '') === 'int' ? 'numeric' : 'decimal',
        ariaLabel: `${control?._children?.Core?.name ?? control?._children?.Core?.controlType ?? 'Range'} value`,
        tabIndex: -1,
      } : null}
      previewEditableFields={spinnerEditableFields(control)}
      previewKeyboardFocus={keyboardFocusControlId === getControlId(control)}
      previewHighlighted={$showPreviewSelectionRing && $previewInspectedControlId === getControlId(control)}
      onpreviewpointerenter={() => handlePointerEnter(control)}
      onpreviewpointerleave={() => handlePointerLeave(control)}
      onpreviewpointermove={(event) => handlePointerMove(control, event)}
      onpreviewpointerdown={(event) => handlePointerDown(control, event)}
      onpreviewwheel={(event) => handleRangeWheel(control, event)}
      onpreviewfocus={() => handleFocus(control)}
      onpreviewblur={() => handleBlur(control)}
      onpreviewkeydown={(event) => handleKeyDown(control, event)}
      onpreviewkeyup={(event) => handleKeyUp(control, event)}
      onpreviewvaluefieldinput={(event) => handleRangeFieldInput(control, event)}
      onpreviewvaluefieldkeydown={(event) => handleRangeFieldKeyDown(control, event)}
      onpreviewvaluefieldfocus={(event) => handleRangeFieldFocus(control, event)}
      onpreviewvaluefieldblur={(event) => handleRangeFieldBlur(control, event)}
      onpreviewfieldinput={(role, event) => handleSpinnerFieldInput(control, role, event)}
      onpreviewfieldkeydown={(role, event) => handleSpinnerFieldKeyDown(control, role, event)}
      onpreviewfieldfocus={(role, event) => handleSpinnerFieldFocus(control, role, event)}
      onpreviewfieldblur={(role, event) => handleSpinnerFieldBlur(control, role, event)}
      previewTextField={isTextInputControl(control) ? {
        value: currentTextValue(control),
        placeholder: String(control?._children?.Text?.content ?? ''),
        disabled: isDisabled(control),
      } : null}
      onpreviewtextkeydown={(event) => handleTextFieldKeyDown(control, event)}
      onpreviewtextfocus={() => handleTextFieldFocus(control)}
      onpreviewtextblur={(event) => handleTextFieldBlur(control, event)}
      previewListboxFilter={isListboxControl(control) && listboxConfig(control).filterBox === true ? {
        visible: true,
        value: lbFilter(control),
        height: listboxFilterHeight(control),
      } : null}
      onpreviewlistboxfilter={(event) => handleListboxFilterInput(control, event)}
    />
    {#if isComboboxControl(control) && openComboboxControlId === getControlId(control) && getValueRows(control).length}
      <div class="panel-combobox-menu" style={comboboxMenuStyle(control)} role="listbox">
        {#each getValueRows(control) as row (row.id ?? row.internalValue ?? row.displayText)}
          {@const selected = String(rowValue(row)) === String(currentComboboxValue(control))}
          <button
            type="button"
            class:selected
            role="option"
            aria-selected={selected}
            onpointerdown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onclick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              selectComboboxRow(control, row);
            }}
          >
            {rowLabel(row)}
          </button>
        {/each}
      </div>
    {/if}
  {/each}
</div>

<style>
  .panel-surface {
    position: relative;
    border: 1px solid #444;
    border-radius: 2px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    flex-shrink: 0;
    overflow: hidden;
  }

  .preview-surface {
    cursor: default;
  }

  .bg-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .grid-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .panel-combobox-menu {
    position: absolute;
    z-index: 10000;
    max-height: 184px;
    overflow: auto;
    padding: 4px;
    border: 1px solid #4A4A4A;
    border-radius: 6px;
    background: #202020;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.42);
  }

  .panel-combobox-menu button {
    display: block;
    width: 100%;
    min-height: 26px;
    padding: 4px 8px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #E5E5E5;
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .panel-combobox-menu button:hover,
  .panel-combobox-menu button.selected {
    background: rgba(91, 155, 213, 0.24);
  }
</style>
