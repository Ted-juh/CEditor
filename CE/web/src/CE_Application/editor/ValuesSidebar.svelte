<script>
  // ValuesSidebar — the script editor dock's Values tab: the values in the statement the caret is in,
  // each with what it means to the runtime that reads it, and the edit it opens.
  // docs/design/script-editor-value-editors.md, "Decided: a Values sidebar is where values are shown
  // and edited", and "Rules every edit session follows".
  //
  // What a value is, means and refuses comes from the core (scripting/scriptValues.js); the rows are
  // laid out by valueRows.js and nothing here works a meaning out again. An edit is a session
  // (valueEditSession.js), which holds the rules: a colour or a gradient is written when the gesture
  // settles, each write is one replacement through the code editor (one undo step), Cancel puts the
  // original characters back, and text that moves under the session ends it.
  //
  // A colour and a gradient are edited in the app's shared display panel (the Colors and Gradient
  // tabs, through a callback target), which the script workspace is allowed to show for this: no
  // colour chooser opens anywhere else. If the panel was hidden when an edit opened, it is hidden
  // again when the edit ends, so a later drag in the chooser with no target cannot repaint the
  // panel's background, which is what the chooser does when nothing is targeted.
  //
  // A row that names a control on the panel (a control's name, or the control a path names) has a
  // Select beside it, which picks that control to be the panel's selection. The script workspace
  // shows no canvas, so it is selected there when the panel's tab is next in front
  // (stores/panels.js, panelSelectionPick). Select is a button of its own: it does not go to the
  // value, so the caret stays, the text is not touched, and an edit open in the display panel stays
  // open, since nothing about the selection changes while the script tab is in front.
  //
  // The same component serves the panel file view, over its JSON (readJsonValues), where an edit
  // becomes the item's draft as typing would; read-only there (Every field, the whole file) the rows
  // are to read.
  import { onDestroy, onMount, untrack, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { readStatement, readJsonValues, writeValue } from '../scripting/scriptValues.js';
  import { cssParts } from '../scripting/scriptValueKinds.js';
  import { animationEase } from '../scripting/panelRuntime.js';
  import { highlight } from './codeHighlight.js';
  import { lineAt, lineStartsOf } from '../utils/lineIndex.js';
  import {
    statementRows, argAtOffset, findArg, editLabel, meaningLine, madeByChild, unitLabel, swatchHex, cssOfHex,
    gradientStrip, shownNumber, plainSummary, controlToSelect,
  } from './valueRows.js';
  import { createEditSession, extentOf } from './valueEditSession.js';
  import { colorTarget, activateColorTarget, clearColorTarget } from '../stores/colorTarget.js';
  import { gradientTarget, activateGradientTarget, clearGradientTarget } from '../stores/gradientTarget.js';
  import { displayTabRequest } from '../stores/displayTab.js';
  // The script workspace's own display switch, named rather than reached through 'display': an edit
  // that ends because the viewer left for the panel editor must hide the script's panel, not theirs.
  import { showDisplayPanelInScript as scriptDisplay } from '../stores/panelVisibility.js';
  import EasingCurve from '../components/animation/EasingCurve.svelte';
  import BezierEditor from '../components/animation/BezierEditor.svelte';
  import EnvelopePointsEditor from './EnvelopePointsEditor.svelte';

  let {
    source = '',
    language = 'lua',        // a script language, or 'json' for the panel file view
    caret = 0,               // the caret's offset in `source`
    context = {},            // for the core: panel, controlSet, tempo, selfControl, fonts, images; or the file view's
    editor = null,           // the CodeEditor: replaceRange(start, end, text) and reveal(start, end)
    readOnly = false,        // shown to read (the file view's Every field and whole file)
    folded = false,          // the editor's view is folded: no edit stays open
    docKey = '',             // what the text is; another one ends an open edit
    labelPrefix = 'Script',  // how the display panel names what it edits
    itemName = '',           // the panel file view's item, for that name
    onmarks = null,          // (marks) → the editor draws them
    onreveal = null,         // (start, end) → a view with no editor (the whole file) goes there
    pickedControl = null,    // the id of the control picked to be the panel's selection, or null
    onpickcontrol = null,    // (id) → pick it, (null) → take the pick back; null: no Select at all
  } = $props();

  const READ_EVERY_MS = 60;

  /* ------------------------------------------------------------------------------- reading */

  let statement = $state.raw(null);
  let readTimer = null;
  let session = null;                 // the open edit, or null
  let sessView = $state.raw(null);    // what the markup shows of it
  let writing = false;                // a write of the sidebar's own is in the editor

  const isJson = $derived(language === 'json');

  function readAt(src, at) {
    try {
      return isJson ? readJsonValues(src, at, context) : readStatement(src, language, at, context);
    } catch {
      return null;
    }
  }

  // While an edit is open the sidebar does not follow the caret: it stays on the statement holding
  // the value being edited, read again where that value now is.
  let anchor = $state(null);          // where the open edit's statement is read
  let readPoint = $derived(anchor ?? caret);

  let readSource = null;              // the text `statement` was read from
  let readText = $state.raw('');      // …for the markup: a call's name as written is read from it
  function readNow() {
    readTimer = null;
    readSource = source;
    readText = source;
    statement = readAt(source, readPoint);
  }

  /** `arg` as the text holds it now: the rows can be a moment behind the last keystroke, and an
   *  edit must start from the text as it is. Null when it is no longer there. */
  function current(arg) {
    if (readSource === source) return arg;
    clearTimeout(readTimer);
    readNow();
    return findArg(statement, arg.range.start, arg.kind);
  }
  // At most one read per READ_EVERY_MS, and always one after the last change: a script running with
  // Live on can change the panel (the context) sixty times a second.
  let readOnce = false;
  $effect(() => {
    void source; void readPoint; void context; void language;
    if (!readOnce) { readOnce = true; untrack(readNow); return; }
    if (readTimer === null) readTimer = setTimeout(readNow, READ_EVERY_MS);
  });

  let rows = $derived(statementRows(statement));
  let starts = $derived(lineStartsOf(source));
  const lineNo = (offset) => lineAt(starts, Math.max(0, Math.min(source.length, offset))) + 1;

  /* --------------------------------------------------------------- the row the caret is in */

  let caretArg = $derived(argAtOffset(statement, caret));
  let caretKey = $derived(caretArg ? keyOf(caretArg) : null);
  // By where a value starts, not where it ends: a write that changes its length keeps its row (and a
  // field being typed in keeps its focus).
  function keyOf(arg) { return `${arg.range.start}:${arg.kind}:${arg.name ?? ''}`; }
  let listEl = $state(null);
  $effect(() => {
    const key = caretKey;
    if (!key || !listEl) return;
    untrack(() => tick().then(() => listEl?.querySelector(`[data-arg="${CSS.escape(key)}"]`)?.scrollIntoView?.({ block: 'nearest' })));
  });

  /* ------------------------------------------------------------------------------ highlights */

  let hoverKey = $state(null);
  let hoverArg = $derived(hoverKey ? (rows.find((r) => r.type === 'arg' && keyOf(r.arg) === hoverKey)?.arg ?? null) : null);
  let marks = $derived.by(() => {
    const out = [];
    if (statement?.range) out.push({ start: statement.range.start, end: statement.range.end, kind: 'statement' });
    const hover = hoverArg ? extentOf(hoverArg) : null;
    if (hover) out.push({ ...hover, kind: 'hover' });
    if (sessView?.range) out.push({ start: sessView.range.start, end: sessView.range.end, kind: 'edit' });
    return out;
  });
  $effect(() => { onmarks?.(marks); });

  /** Clicking a row: its value scrolled into view, the caret at its start. An edit opening brings
   *  it into view too, without taking the focus from the control that opened it. */
  function revealArg(arg, { focus = true } = {}) {
    const ext = extentOf(arg);
    if (!ext) return;
    if (editor?.reveal) editor.reveal(ext.start, ext.end, { focus });
    else onreveal?.(ext.start, ext.end);
  }

  /** A row with a dropdown or a field shows the value there, not twice. */
  function hasEditor(arg) {
    if (readOnly) return false;
    if (arg.editable === 'number') return typeof arg.value === 'number';
    // A font by its family, an image by its name, from the lists the runtime checks against. An
    // image ce.draw.image is given is its data, which no list holds, so that one has no dropdown.
    if (arg.editable === 'font' || arg.editable === 'image') {
      const m = arg.meaning ?? {};
      return typeof arg.value === 'string' && !m.dataUrl && !m.wantsData && Array.isArray(m.choices) && m.choices.length > 0;
    }
    const choices = arg.meaning?.choices;
    return (arg.editable === 'choice' || (arg.editable === 'curve' && typeof arg.value === 'string'))
      && Array.isArray(choices) && choices.length > 0;
  }

  /* ------------------------------------------------------------- a control, on the panel */

  /** The id of the control a row's Select picks, or null for a row with none. */
  const selectable = (arg) => (onpickcontrol && !readOnly && !isJson ? controlToSelect(arg) : null);
  /** The control's name as the script writes it: the name itself, or a path's first segment. */
  const controlNameOf = (arg) => String((arg.kind === 'control' ? arg.value : arg.meaning?.control) ?? '');

  /** Pick the row's control to be the panel's selection, or take back the pick it already is. */
  function pickControl(arg) {
    const id = selectable(arg);
    if (id) onpickcontrol(pickedControl === id ? null : id);
  }

  /* -------------------------------------------------------------------------------- sessions */

  // The display panel's target this session holds, and whether the panel was showing before it.
  let link = null;                    // { store: 'colour' | 'gradient' | null, apply, wasShowing }
  let handingOver = false;            // one edit closing for another to open: the panel stays

  function writeThrough(start, end, text) {
    if (!editor?.replaceRange) return null;
    writing = true;
    try { return editor.replaceRange(start, end, text); } finally { writing = false; }
  }

  function viewOf(s, kind) {
    return { kind, range: s.range, start: s.range?.start ?? null, arg: s.arg, pending: s.pending, hasPending: s.hasPending,
      writes: s.writes, refused: s.refused, original: s.original };
  }

  function startSession(arg, kind) {
    arg = current(arg);
    if (!arg) return null;
    const anchorAt = isJson ? (statement?.range?.start ?? arg.range.start) + 1 : null;
    const s = createEditSession({
      source, language, arg, writeValue,
      write: writeThrough,
      reread: (src, start) => findArg(readAt(src, isJson ? anchorAt : start), start, arg.kind),
      onupdate: (it) => {
        if (it !== session) return;
        if (it.ended) { finish(it); return; }
        sessView = viewOf(it, kind);
        anchor = isJson ? anchorAt : it.range?.start ?? null;
      },
    });
    session = s;
    sessView = viewOf(s, kind);
    anchor = isJson ? anchorAt : s.range?.start ?? null;
    return s;
  }

  /** The session ended (Done, Cancel, the text moved, …): let go of the display panel. */
  function finish(s) {
    if (s !== session) return;
    const held = link;
    session = null;
    link = null;
    sessView = null;
    anchor = null;
    if (held?.store === 'colour' && get(colorTarget)?.apply === held.apply) clearColorTarget();
    if (held?.store === 'gradient' && get(gradientTarget)?.apply === held.apply) clearGradientTarget();
    if (held?.store && !held.wasShowing && !handingOver) scriptDisplay.set(false);
  }

  /** Close the open edit (writing what it holds) so another can open; whether the panel was showing
   *  before the first of them. */
  function handOver() {
    const was = link?.store ? link.wasShowing : get(scriptDisplay);
    handingOver = true;
    try { session?.done(); } finally { handingOver = false; }
    return was;
  }

  const sameArg = (a, b) => Boolean(a && b) && extentOf(a).start === extentOf(b).start && a.kind === b.kind;
  const editingArg = (arg) => Boolean(sessView) && sameArg(sessView.arg, arg);

  /** The line, and how the display panel names the value: "Script · Title text colour, line 3". */
  function labelFor(row) {
    const line = lineNo(row.arg.range.start);
    if (isJson) {
      const key = [...(statement?.path ?? [])].reverse().find((k) => typeof k === 'string' && k !== '_children') ?? '';
      return editLabel({ arg: row.arg, line, prefix: labelPrefix, where: [itemName, key].filter(Boolean).join(' ') });
    }
    return editLabel({ call: row.call, arg: row.arg, line, prefix: labelPrefix });
  }

  function openColour(row) {
    const { arg } = row;
    if (readOnly || arg.editable !== 'colour' || !arg.literal) return;
    if (editingArg(arg) && link?.store === 'colour') { scriptDisplay.set(true); displayTabRequest.set({ tab: 'colors' }); return; }
    const wasShowing = handOver();
    const s = startSession(arg, 'colour');
    if (!s) return;
    revealArg(s.arg, { focus: false });
    const target = { type: 'callback', label: labelFor(row), apply: (hex) => s.preview(hex), cancel: () => s.cancel() };
    link = { store: 'colour', apply: target.apply, wasShowing };
    scriptDisplay.set(true);
    displayTabRequest.set({ tab: 'colors' });
    activateColorTarget(target, swatchHex(s.arg.meaning) ?? 'FF333333');
  }

  /** The Gradient tab's object for a gradient as the script (or the file) has it. */
  function gradientData(arg) {
    const m = arg.meaning;
    if (m.stored && arg.value && typeof arg.value === 'object') return JSON.parse(JSON.stringify(arg.value));
    return {
      type: 'linear',
      // A gradient written with no angle is drawn at the runtime's 180, and opens there: the tab's
      // own default of 90 would turn it on the first edit.
      angle: Number.isFinite(m.angle) ? m.angle : m.defaultAngle,
      stops: (m.stops ?? []).map((st) => ({ color: cssParts(st.css)?.rgb ?? '000000', position: Number(((st.at ?? 0) * 100).toFixed(2)) })),
      edge: 0, centerX: 50, centerY: 50, radiusX: 50, radiusY: 50,
    };
  }

  /** What the tab hands back, as writeValue takes it. A drawing's stop that had an alpha keeps it
   *  while its colour is the one it had: the tab's stops carry none. */
  function gradientToWrite(arg, next) {
    const m = arg.meaning;
    if (m.stored) return next;
    const old = m.stops ?? [];
    return {
      angle: next?.angle,
      stops: (next?.stops ?? []).map((st, i) => {
        const rgb = String(st.color ?? '').replace(/^#/, '').slice(-6).toUpperCase();
        const was = old.length === (next.stops ?? []).length ? cssParts(old[i]?.css) : null;
        const alpha = was && was.rgb === rgb && was.alphaByte < 255 ? was.alphaByte.toString(16).toUpperCase().padStart(2, '0') : '';
        return { position: st.position, colour: `${alpha}${rgb}` };
      }),
    };
  }

  function openGradient(row) {
    const { arg } = row;
    if (readOnly || arg.editable !== 'gradient') return;
    if (editingArg(arg) && link?.store === 'gradient') { scriptDisplay.set(true); displayTabRequest.set({ tab: 'gradient' }); return; }
    const wasShowing = handOver();
    const s = startSession(arg, 'gradient');
    if (!s) return;
    revealArg(s.arg, { focus: false });
    // A drawing's gradient is linear (ce.draw.gradient has stops and an angle): the Gradient tab
    // is told, and offers neither a type nor what only another type has.
    const target = {
      type: 'callback', label: labelFor(row), linearOnly: !arg.meaning.stored,
      apply: (g) => s.preview(gradientToWrite(s.arg, g)),
      cancel: () => s.cancel(),
    };
    link = { store: 'gradient', apply: target.apply, wasShowing };
    scriptDisplay.set(true);
    displayTabRequest.set({ tab: 'gradient' });
    activateGradientTarget(target, gradientData(s.arg));
  }

  /* ---------------------------------------------------- fields and dropdowns, in the row */

  function openInRow(arg, kind) {
    if (readOnly || !arg.literal) return null;
    if (session && editingArg(arg) && sessView?.kind === kind) return session;
    // A colour or gradient open in the display panel closes as Done would, the panel hidden again
    // if it was: a field or a dropdown needs nothing from it.
    session?.done();
    return startSession(arg, kind);
  }

  function closeInRow() {
    if (writing) return;           // focus left for the editor's own edit and comes straight back
    if (sessView && (sessView.kind === 'number' || sessView.kind === 'choice')) session?.done();
  }

  let fieldText = $state({});      // per row: what is typed in its field, until written
  let fieldBad = $state({});

  function fieldValue(arg) { return fieldText[keyOf(arg)] ?? arg.text; }

  function commitField(arg, text) {
    const key = keyOf(arg);
    const trimmed = String(text ?? '').trim();
    const n = Number(trimmed);
    if (trimmed === '' || !Number.isFinite(n)) { fieldBad = { ...fieldBad, [key]: true }; return false; }
    fieldBad = { ...fieldBad, [key]: false };
    const s = openInRow(arg, 'number');
    if (!s) return false;
    const ok = s.commit(n);
    const { [key]: _gone, ...rest } = fieldText;
    fieldText = rest;
    return ok;
  }

  function onFieldKey(event, arg) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitField(arg, event.currentTarget.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      const key = keyOf(arg);
      const { [key]: _gone, ...rest } = fieldText;
      fieldText = rest;
      fieldBad = { ...fieldBad, [key]: false };
      event.currentTarget.value = (session && editingArg(arg) ? session.arg.text : arg.text);
      if (session && editingArg(arg)) session.end('escape');
      event.currentTarget.blur();
    }
  }

  function onFieldBlur(event, arg) {
    if (writing) return;
    const key = keyOf(arg);
    if (fieldText[key] !== undefined && fieldText[key] !== arg.text) commitField(arg, fieldText[key]);
    closeInRow();
  }

  /** A drawn curve, from the Animation tab's editor: written once a handle is let go (or a number
   *  entered), one edit each time, in the form it was written in, a list or x1..y2 by name. */
  function commitCurve(arg, points) {
    if (readOnly || !Array.isArray(points) || points.length !== 4) return;
    const [x1, y1, x2, y2] = points.map((n) => Number(Number(n).toFixed(3)));
    const named = arg.value !== null && typeof arg.value === 'object' && !Array.isArray(arg.value);
    const s = openInRow(arg, 'curve');
    if (!s) return;
    s.commit(named ? { x1, y1, x2, y2 } : [x1, y1, x2, y2]);
    s.done();
  }

  /** A drawn curve with an editor in its row: a literal list (or table) of four numbers. */
  const drawnCurve = (arg) => !readOnly && arg.kind === 'curve' && arg.literal && arg.value !== null
    && typeof arg.value === 'object' && Array.isArray(arg.meaning?.bezier);

  /** ce.anim.envelope's points, from their editor under the row: written once a point is let go,
   *  added, taken out or typed in, one edit each time, every point in the form it was written in and
   *  only the x and y of the ones that moved changed (writeValue's envelope). */
  function commitEnvelope(arg, points) {
    if (readOnly || !Array.isArray(points) || points.length < 2) return;
    const s = openInRow(arg, 'envelope');
    if (!s) return;
    s.commit(points.map((p) => ({ x: p.x, y: p.y, from: p.from })));
    s.done();
  }

  /** Points written out that the runtime would play: the editor goes under the row. */
  const drawnEnvelope = (arg) => !readOnly && arg.kind === 'envelope' && arg.literal && arg.editable === 'envelope';

  function choiceCurrent(arg) {
    return typeof arg.value === 'string' ? arg.value : arg.value === undefined ? arg.text : String(arg.value);
  }

  function pickChoice(arg, value) {
    const s = openInRow(arg, 'choice');
    if (!s) return;
    // A list of numbers is written as numbers.
    const numeric = typeof arg.value === 'number' && Number.isFinite(Number(value));
    s.commit(numeric ? Number(value) : value);
  }

  /* -------------------------------------------------------------- the session's guards */

  // Rule 5: text the session did not write ends it; so does another script, a fold, leaving.
  $effect(() => {
    const src = source;
    untrack(() => session?.sourceChanged(src));
  });
  let lastDocKey = null;
  $effect(() => {
    const key = docKey;
    untrack(() => {
      if (lastDocKey !== null && key !== lastDocKey) session?.end('left');
      lastDocKey = key;
    });
  });
  $effect(() => { if (folded) untrack(() => session?.end('folded')); });
  // A field's or a dropdown's edit ends when the caret leaves its statement. Blurring the control
  // ends it too (closeInRow), but the control can be drawn anew by its own write, and a focused
  // element that is taken away gives no blur: the tab then stayed on that statement for good, with
  // the caret elsewhere. A colour or a gradient is the display panel's, and ends there.
  $effect(() => {
    const at = caret;
    untrack(() => {
      if (!session || (sessView?.kind !== 'number' && sessView?.kind !== 'choice')) return;
      const r = statement?.range;
      if (r && (at < r.start || at > r.end)) session.done();
    });
  });
  $effect(() => { if (readOnly) untrack(() => session?.end('left')); });

  onMount(() => {
    // Done, a tab switch, the dock closing: the target is no longer this session's.
    const offColour = colorTarget.subscribe((t) => {
      if (link?.store === 'colour' && t?.apply !== link.apply) session?.done();
    });
    const offGradient = gradientTarget.subscribe((t) => {
      if (link?.store === 'gradient' && t?.apply !== link.apply) session?.done();
    });
    // A drag in the display panel is under way while a pointer is held: nothing settles until it lifts.
    const down = () => session?.pointerDown();
    const up = () => session?.pointerUp();
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('blur', up);
    return () => {
      offColour();
      offGradient();
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', up);
    };
  });

  onDestroy(() => {
    clearTimeout(readTimer);
    readTimer = null;
    session?.end('left');
    onmarks?.([]);
  });

  /* ------------------------------------------------------------------------------ showing */

  const oneLine = (text) => {
    const flat = String(text ?? '').replace(/\s*\n\s*/g, ' ');
    return flat.length > 80 ? `${flat.slice(0, 79)}…` : flat;
  };
  const shownText = (arg) => highlight(oneLine(editingArg(arg) && session ? session.arg.text : arg.text), language);

  // A call is headed by its name as written (ce.core.set, ctx.SendCC), not the contract's id for it.
  const callName = (call) => readText.slice(call.nameRange?.start ?? 0, call.nameRange?.end ?? 0).replace(/\s+/g, '') || call.path;

  let headLines = $derived(statement?.lines
    ? (statement.lines.first === statement.lines.last ? `Line ${statement.lines.first}` : `Lines ${statement.lines.first}–${statement.lines.last}`)
    : '');
  let firstCall = $derived(statement?.calls?.[0] ?? null);
  let nested = $derived((statement?.calls ?? []).some((c) => c.children?.length));
  let objectPath = $derived(isJson ? (statement?.path ?? []).filter((k) => typeof k === 'string' && k !== '_children').join(' › ') : '');

  /** The colour a row's swatch shows: the one being dragged, until it is written. */
  function swatchCss(arg) {
    if (editingArg(arg) && sessView?.hasPending && sessView.kind === 'colour') return cssOfHex(sessView.pending);
    return arg.meaning?.css ?? null;
  }
  // A drawing call's shape on the control's outline: a view box holding both, the control's box
  // dashed, the shape faint where the control clips it and solid where it shows.
  function shapeView(shape) {
    const box = shape.box;
    const b = shape.bounds ?? { x: 0, y: 0, w: 0, h: 0 };
    const x0 = Math.min(b.x, box ? 0 : b.x);
    const y0 = Math.min(b.y, box ? 0 : b.y);
    const x1 = Math.max(b.x + b.w, box ? box.w : b.x + b.w);
    const y1 = Math.max(b.y + b.h, box ? box.h : b.y + b.h);
    // A shape far off the control would shrink both to specks: the control is drawn at its size
    // instead, with a line from its middle toward where the shape lies.
    if (box && Math.max(x1 - x0, y1 - y0) > 3 * Math.max(box.w, box.h)) {
      const pad = Math.max(box.w, box.h) * 0.35;
      const vx = -pad; const vy = -pad; const vw = box.w + 2 * pad; const vh = box.h + 2 * pad;
      const cx = box.w / 2; const cy = box.h / 2;
      const dx = b.x + b.w / 2 - cx; const dy = b.y + b.h / 2 - cy;
      const reach = Math.min(dx ? Math.abs((dx > 0 ? vx + vw - cx : cx - vx) / dx) : Infinity, dy ? Math.abs((dy > 0 ? vy + vh - cy : cy - vy) / dy) : Infinity) * 0.92;
      const scale = Math.min(180 / vw, 72 / vh);
      return { viewBox: `${vx} ${vy} ${vw} ${vh}`, width: Math.round(vw * scale), height: Math.round(vh * scale),
        toward: { x1: cx, y1: cy, x2: cx + dx * reach, y2: cy + dy * reach } };
    }
    const w = Math.max(1, x1 - x0);
    const h = Math.max(1, y1 - y0);
    const pad = Math.max(w, h) * 0.06;
    const scale = Math.min(180 / (w + 2 * pad), 72 / (h + 2 * pad));
    return {
      viewBox: `${x0 - pad} ${y0 - pad} ${w + 2 * pad} ${h + 2 * pad}`,
      width: Math.round((w + 2 * pad) * scale), height: Math.round((h + 2 * pad) * scale), toward: null,
    };
  }
  const shapeClipId = (row) => `vshape-${String(row.key).replace(/[^\w-]/g, '_')}`;

  function stripCss(arg) {
    if (editingArg(arg) && sessView?.hasPending && sessView.kind === 'gradient') {
      const g = sessView.pending;
      const stops = (g?.stops ?? []).map((st) => ({ css: cssOfHex(st.colour ?? st.color), at: Number(st.position ?? 0) / 100 }));
      return gradientStrip({ stops });
    }
    return gradientStrip(arg.meaning);
  }
  const imageOf = (arg) => {
    const list = Array.isArray(context?.images) ? context.images : [];
    const name = String(arg.value ?? '').toLowerCase();
    const found = list.find((i) => i?.id === arg.value) ?? list.find((i) => String(i?.name ?? '').toLowerCase() === name);
    return found?.dataUrl || (arg.meaning?.dataUrl ? arg.value : '');
  };
  const curveFn = (name) => (t) => animationEase(t, name) ?? t;
  const fontCss = (family) => `${JSON.stringify(String(family ?? ''))}, sans-serif`;

  let footer = $derived.by(() => {
    if (readOnly) return 'Shown to read here: the values are listed, and nothing is edited.';
    if (sessView && (sessView.kind === 'colour' || sessView.kind === 'gradient')) {
      const was = oneLine(sessView.original);
      return `Done or Cancel in the display panel ends the edit. Cancel puts ${was.length > 48 ? 'what was written' : was} back exactly.`;
    }
    if (sessView?.kind === 'number') return 'Enter or leaving the field writes the number; Escape puts it back.';
    const picked = pickedControl ? rows.find((r) => r.type === 'arg' && selectable(r.arg) === pickedControl) : null;
    if (picked) return `${controlNameOf(picked.arg)} will be selected on the panel when you go back to it.`;
    if (nested) return 'A call inside another has rows of its own, under the call it sits in.';
    return 'Click a row to go to its value in the code.';
  });
</script>

{#snippet valueControl(row)}
  {@const arg = row.arg}
  {@const m = arg.meaning ?? {}}
  {#if arg.kind === 'colour'}
    {@const css = swatchCss(arg)}
    {#if arg.editable === 'colour' && !readOnly}
      <button class={['vswatch', !css && 'none', editingArg(arg) && 'on']} style:--sw={css ?? 'transparent'}
        title="Edit this colour in the display panel" aria-label={`Edit ${arg.name ?? 'the colour'} in the display panel`}
        onclick={(e) => { e.stopPropagation(); openColour(row); }}></button>
    {:else}
      <span class={['vswatch', 'still', !css && 'none']} style:--sw={css ?? 'transparent'} aria-hidden="true"></span>
    {/if}
  {:else if arg.kind === 'gradient'}
    {@const strip = stripCss(arg)}
    {#if arg.editable === 'gradient' && !readOnly}
      <button class={['vstrip', editingArg(arg) && 'on']} style:--strip={strip ?? 'none'}
        title="Edit this gradient in the display panel's Gradient tab" aria-label={`Edit the gradient ${arg.name ?? ''} in the display panel`}
        onclick={(e) => { e.stopPropagation(); openGradient(row); }}></button>
    {:else}
      <span class="vstrip still" style:--strip={strip ?? 'none'} aria-hidden="true"></span>
    {/if}
  {:else if arg.kind === 'curve'}
    {#if drawnCurve(arg)}
      <!-- The editor below draws it. -->
    {:else if m.bezier && (Array.isArray(arg.value) || typeof arg.value === 'object')}
      <EasingCurve easing={{ easing: 'custom', bezier: m.bezier }} width={52} height={26} label="the drawn curve" />
    {:else if m.name}
      <EasingCurve fn={curveFn(m.name)} width={52} height={26} label={`${m.name} curve`} />
    {/if}
  {:else if arg.kind === 'dash'}
    <!-- The line drawn with what the drawing is handed, and the cap the options give it, at the
         script's own pixels: solid where the runtime draws it solid. -->
    <svg class="vdash" width="64" height="8" viewBox="0 0 64 8" aria-hidden="true">
      <line x1="2" y1="4" x2="62" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap={m.cap}
        stroke-dasharray={m.dasharray ?? undefined} />
    </svg>
  {:else if arg.kind === 'font' && typeof arg.value === 'string'}
    <span class="vfont" style:font-family={fontCss(arg.value)} title={`Aa in ${arg.value}`}>Aa</span>
  {:else if arg.kind === 'image'}
    {@const src = imageOf(arg)}
    {#if src}<img class="vthumb" {src} alt="" />{/if}
  {/if}
{/snippet}

{#snippet valueEdit(row)}
  {@const arg = row.arg}
  {@const m = arg.meaning ?? {}}
  {#if hasEditor(arg) && arg.editable === 'number'}
    <input class={['vfield', fieldBad[keyOf(arg)] && 'bad']} type="text" inputmode="decimal" spellcheck="false"
      value={fieldValue(arg)} aria-label={`${arg.name ?? 'value'}${m.unit ? `, in ${m.unit}` : ''}`}
      title="Enter or leaving the field writes it; Escape puts it back"
      onclick={(e) => e.stopPropagation()}
      onfocus={() => openInRow(arg, 'number')}
      oninput={(e) => { fieldText = { ...fieldText, [keyOf(arg)]: e.currentTarget.value }; }}
      onkeydown={(e) => onFieldKey(e, arg)}
      onblur={(e) => onFieldBlur(e, arg)} />
    {#if unitLabel(m.unit)}<span class="vunit">{unitLabel(m.unit)}</span>{/if}
  {:else if hasEditor(arg)}
    {@const current = choiceCurrent(arg)}
    <select class="vselect" value={current} aria-label={`${arg.name ?? 'value'}: choose another`}
      title="Pick one to write it"
      onclick={(e) => e.stopPropagation()}
      onfocus={() => openInRow(arg, 'choice')}
      onchange={(e) => pickChoice(arg, e.currentTarget.value)}
      onblur={closeInRow}>
      {#if !m.choices.includes(current)}<option value={current} disabled>{current}</option>{/if}
      <!-- A choice can carry a name (a device parameter's, beside its id); the value is the choice. -->
      {#each m.choices as choice, i (i)}<option value={choice}>{m.choiceNames?.[choice] ? `${choice} · ${m.choiceNames[choice]}` : choice}</option>{/each}
    </select>
  {/if}
{/snippet}

{#snippet selectControl(arg)}
  {@const id = selectable(arg)}
  {#if id}
    {@const name = controlNameOf(arg)}
    {@const on = pickedControl === id}
    <!-- Its own button: the row's click goes to the value, and this must leave the caret where it is. -->
    <button class={['vpick', on && 'on']} aria-pressed={on} aria-label={`Select ${name} on the panel`}
      title={on ? `${name} will be selected on the panel when you go back to it. Click again to take that back.`
        : `Select ${name} on the panel, to find it selected there when you go back. The code is not touched.`}
      onclick={(e) => { e.stopPropagation(); pickControl(arg); }}>{on ? 'Selected' : 'Select'}</button>
  {/if}
{/snippet}

<div class="values" data-testid="values-sidebar">
  {#if !statement}
    <p class="vempty">Put the caret in a statement: the values in it that the editor can read are listed here.</p>
  {:else}
    <div class="vhead">
      <div class="vwhere">{isJson ? 'Object' : 'Statement'} · {headLines}</div>
      {#if isJson}
        <div class="vpath">{objectPath || (statement.item?.kind === 'panel' ? 'panel settings' : itemName)}</div>
        <div class="vsum">{statement.item?.kind === 'panel' ? 'The panel\'s own settings' : statement.item?.controlType ?? ''}</div>
      {:else if firstCall}
        <div class="vpath">{callName(firstCall)}</div>
        {#if firstCall.summary}<div class="vsum" title={plainSummary(firstCall.summary)}>{plainSummary(firstCall.summary)}</div>{/if}
      {/if}
    </div>
    {#if !rows.some((r) => r.type === 'arg') && !(statement.calls ?? []).some((c) => c.problem)}
      <p class="vempty">Nothing in this {isJson ? 'object' : 'statement'} that the editor can read.</p>
    {/if}
    <div class="vlist" bind:this={listEl}>
      {#each rows as row (row.key)}
        {#if row.type === 'call'}
          {#if row.depth > 0 || row.call !== firstCall}
            <div class="vcall" style:--depth={row.depth}>
              <div class="vpath">{callName(row.call)}</div>
              {#if row.call.summary}<div class="vsum" title={plainSummary(row.call.summary)}>{plainSummary(row.call.summary)}</div>{/if}
            </div>
          {/if}
          {#if row.call.problem}
            <div class={['vrowproblem', row.call.problem.severity]} style:--depth={row.depth}>{row.call.problem.message}</div>
          {/if}
          {#if row.call.missing?.length}
            <div class="vmissing" style:--depth={row.depth}>Not written: {row.call.missing.map((p) => p.name).join(', ')}</div>
          {/if}
          {#if row.call.shape}
            {@const shape = row.call.shape}
            {@const view = shapeView(shape)}
            <!-- The shape on the outline of the control it is drawn on, at the script's own coordinates. -->
            <svg class="vshape" style:--depth={row.depth} width={view.width} height={view.height} viewBox={view.viewBox}
              role="img" aria-label={shape.box ? `The shape on the control's ${shape.box.w} by ${shape.box.h} outline` : 'The shape'}>
              {#if shape.box}
                <clipPath id={shapeClipId(row)}><rect x="0" y="0" width={shape.box.w} height={shape.box.h} /></clipPath>
                <rect class="vshape-box" x="0" y="0" width={shape.box.w} height={shape.box.h} vector-effect="non-scaling-stroke" />
                <path class="vshape-out" d={shape.d} vector-effect="non-scaling-stroke" />
                <path class="vshape-in" d={shape.d} clip-path={`url(#${shapeClipId(row)})`} vector-effect="non-scaling-stroke" />
                {#if view.toward}
                  <line class="vshape-toward" x1={view.toward.x1} y1={view.toward.y1} x2={view.toward.x2} y2={view.toward.y2} vector-effect="non-scaling-stroke" />
                  <circle class="vshape-toward-end" cx={view.toward.x2} cy={view.toward.y2} r={Math.max(shape.box.w, shape.box.h) * 0.04} />
                {/if}
              {:else}
                <path class="vshape-in" d={shape.d} vector-effect="non-scaling-stroke" />
              {/if}
            </svg>
          {/if}
        {:else if row.type === 'loose'}
          <div class="vcall" style:--depth={0}><div class="vsum">Values outside any call</div></div>
        {:else}
          {@const arg = row.arg}
          {@const key = keyOf(arg)}
          {@const group = arg.kind === 'options'}
          {@const line = meaningLine(arg, { madeBelow: madeByChild(row.call, arg) })}
          <!-- The row as a whole goes to its value on a click; its name is the keyboard's way there. -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class={['vrow', group && 'group', key === caretKey && 'sel', editingArg(arg) && 'editing', arg.problem && arg.problem.severity]}
            style:--depth={row.depth} data-arg={key} data-kind={arg.kind} data-name={arg.name ?? ''}
            onpointerenter={() => hoverKey = key} onpointerleave={() => { if (hoverKey === key) hoverKey = null; }}
            onfocusin={() => hoverKey = key} onfocusout={() => { if (hoverKey === key) hoverKey = null; }}
            onclick={() => revealArg(arg)}>
            <button class="vname" title={`Go to ${arg.name ?? 'this value'} in the ${isJson ? 'text' : 'code'}`}
              onclick={(e) => { e.stopPropagation(); revealArg(arg); }}>{#if arg.problem?.severity === 'error' && !arg.param && !group}<span class="vwarn" aria-hidden="true">⚠</span>{/if}{arg.name ?? '·'}</button>
            {#if !group}
              <div class="vbody">
                <div class="vline">
                  {@render valueControl(row)}
                  {#if !hasEditor(arg) && !drawnCurve(arg) && !drawnEnvelope(arg) && arg.kind !== 'gradient'}
                    <code class="vtext">{@html shownText(arg)}</code>
                  {/if}
                  {@render valueEdit(row)}
                  {@render selectControl(arg)}
                </div>
                {#if line}<div class={['vmeaning', arg.kind === 'path' && arg.meaning?.found && 'found']}>{line}</div>{/if}
                {#if arg.problem}<div class={['vproblem', arg.problem.severity]}>{arg.problem.message}</div>{/if}
                {#if editingArg(arg) && sessView?.refused !== null && sessView?.refused !== undefined}
                  <div class="vproblem warning">That cannot be written here{arg.meaning?.takesAlpha === false ? ': this colour takes no alpha' : ''}, so the text was left as it was.</div>
                {/if}
              </div>
              {#if drawnCurve(arg)}
                <!-- Under the row, the row's whole width: its four cells need the room. -->
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <div class="vbezier" onclick={(e) => e.stopPropagation()}>
                  <BezierEditor points={arg.meaning.bezier} width={248} height={140} onchange={(points) => commitCurve(arg, points)} />
                </div>
              {:else if drawnEnvelope(arg)}
                <!-- The shape the runtime plays, under the row at its whole width, its points to drag. -->
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <div class="vbezier venvelope" onclick={(e) => e.stopPropagation()}>
                  <EnvelopePointsEditor written={arg.value} points={arg.meaning.points} width={248} height={128}
                    onchange={(points) => commitEnvelope(arg, points)} />
                </div>
              {/if}
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
  <p class="vfoot">{footer}</p>
</div>

<style>
  .values { display: flex; flex-direction: column; min-height: 0; flex: 1; overflow: auto; padding: 12px 12px 14px; gap: 6px; }
  .vempty { margin: 6px 2px; font-size: 12px; color: var(--txt-dim); line-height: 1.45; }
  .vhead { padding: 2px 2px 8px; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
  .vwhere { font-size: 10px; letter-spacing: 1.3px; text-transform: uppercase; color: var(--txt-faint); }
  .vpath { font-family: var(--mono); font-size: 13px; color: var(--txt); margin-top: 6px; word-break: break-all; }
  /* A summary is the contract's first sentence; three lines of it, the rest on hover. */
  .vsum {
    font-size: 12px; color: var(--txt-dim); margin-top: 3px; line-height: 1.4;
    display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  .vlist { display: flex; flex-direction: column; gap: 2px; }
  .vcall {
    margin: 8px 0 2px calc(var(--depth, 0) * 14px);
    padding: 2px 0 4px 8px; border-left: 1px solid var(--line-2);
  }
  .vcall .vpath { margin-top: 0; font-size: 12px; }
  .vrow {
    display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 2px 8px; align-items: start;
    padding: 6px 6px; border-radius: 6px; border: 1px solid transparent; cursor: pointer;
    margin-left: calc(var(--depth, 0) * 14px);
  }
  .vrow:hover { background: var(--panel); }
  .vrow.sel { background: var(--panel); border-color: var(--line-2); }
  .vrow.editing { background: var(--panel-2); border-color: #6aa8ff; }
  .vrow.warning, .vrow.error { background: rgba(224, 162, 60, 0.07); }
  .vrow.error { background: rgba(224, 99, 90, 0.07); }
  .vrow.group { padding-top: 8px; }
  .vrow.group .vname { color: var(--txt-faint); }
  .vname {
    background: none; border: none; padding: 1px 0; text-align: left; cursor: pointer; min-width: 0;
    font-family: var(--mono); font-size: 12px; color: var(--txt-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .vname:hover, .vname:focus-visible { color: var(--txt); }
  .vname:focus-visible { outline: 1px solid var(--accent); outline-offset: 1px; border-radius: 3px; }
  .vwarn { color: var(--amber); margin-right: 4px; }
  .vbody { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .vline { display: flex; align-items: center; gap: 7px; min-width: 0; flex-wrap: wrap; }
  /* A drawn curve's editor goes under the row, across both of its columns. */
  .vbezier { grid-column: 1 / -1; cursor: default; min-width: 0; }
  .vtext {
    font-family: var(--mono); font-size: 12px; color: #cfe3d8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    min-width: 0; max-width: 100%;
  }
  .vtext :global(.tok-com) { color: #5b6b5f; font-style: italic; }
  .vtext :global(.tok-str) { color: #9ed4a8; }
  .vtext :global(.tok-num) { color: #e0a23c; }
  .vtext :global(.tok-kw), .vtext :global(.tok-key) { color: #5a9bf0; }
  .vtext :global(.tok-lit) { color: #c98be0; }
  .vtext :global(.tok-bi) { color: #4dd6a0; }
  .vmeaning { font-size: 11.5px; color: var(--txt-dim); line-height: 1.4; overflow-wrap: anywhere; }
  .vmeaning.found::before {
    content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--accent);
    margin-right: 6px; vertical-align: 0;
  }
  .vproblem { font-size: 11.5px; line-height: 1.4; overflow-wrap: anywhere; }
  .vproblem.warning { color: #e7c489; }
  .vproblem.error { color: #f0a59f; }
  .vrowproblem { font-size: 11.5px; padding: 4px 8px; margin-left: calc(var(--depth, 0) * 14px); border-radius: 6px; }
  .vrowproblem.error { background: rgba(224, 99, 90, 0.12); color: #f0a59f; }
  .vrowproblem.warning { background: rgba(224, 162, 60, 0.12); color: #e7c489; }
  .vmissing { font-size: 11.5px; color: var(--txt-faint); padding: 0 8px; margin-left: calc(var(--depth, 0) * 14px); }
  .vswatch {
    width: 26px; height: 16px; flex-shrink: 0; border-radius: 4px; border: 1px solid var(--line-2); padding: 0; cursor: pointer;
    background: linear-gradient(var(--sw), var(--sw)), repeating-conic-gradient(#8a8f98 0 25%, #c9ccd2 0 50%) 0 0 / 8px 8px;
  }
  .vswatch:hover, .vswatch:focus-visible { border-color: var(--txt-dim); outline: none; }
  .vswatch.on { box-shadow: 0 0 0 1.5px #6aa8ff; }
  .vswatch.still { cursor: default; }
  .vswatch.none { background: repeating-linear-gradient(135deg, transparent 0 4px, var(--line-2) 4px 5px); }
  .vstrip {
    width: 150px; max-width: 100%; height: 16px; border-radius: 4px; border: 1px solid var(--line-2); padding: 0; cursor: pointer;
    background: var(--strip);
  }
  .vstrip:hover, .vstrip:focus-visible { border-color: var(--txt-dim); outline: none; }
  .vstrip.on { box-shadow: 0 0 0 1.5px #6aa8ff; }
  .vstrip.still { cursor: default; }
  .vdash { flex-shrink: 0; color: var(--txt); }
  .vshape { display: block; margin: 2px 8px 4px calc(8px + var(--depth, 0) * 14px); overflow: visible; color: var(--txt); }
  .vshape-box { fill: none; stroke: var(--txt-faint); stroke-width: 1; stroke-dasharray: 3 2; }
  .vshape-out { fill: none; stroke: currentColor; stroke-width: 1.5; opacity: 0.3; }
  .vshape-in { fill: none; stroke: currentColor; stroke-width: 1.5; }
  .vshape-toward { stroke: #e7c489; stroke-width: 1.25; stroke-dasharray: 2 2; }
  .vshape-toward-end { fill: #e7c489; }
  .vfont { font-size: 15px; line-height: 1; color: var(--txt); padding: 1px 6px; border: 1px solid var(--line-2); border-radius: 4px; }
  .vthumb { width: 22px; height: 22px; object-fit: contain; border: 1px solid var(--line-2); border-radius: 3px; background: #0c0f12; }
  .vfield {
    width: 64px; background: var(--bg); border: 1px solid var(--line-2); border-radius: 5px; padding: 3px 6px;
    color: #e0a23c; font-family: var(--mono); font-size: 12px; outline: none;
  }
  .vfield:focus { border-color: #6aa8ff; }
  .vfield.bad { border-color: var(--red); }
  .vunit { font-size: 12px; color: var(--txt-dim); }
  .vselect {
    max-width: 150px; background: var(--bg); border: 1px solid var(--line-2); border-radius: 5px; padding: 2px 4px;
    color: var(--txt); font-family: var(--mono); font-size: 12px;
  }
  .vselect:focus { border-color: #6aa8ff; outline: none; }
  .vpick {
    background: none; border: 1px solid var(--line-2); border-radius: 5px; padding: 2px 7px; cursor: pointer;
    font-family: inherit; font-size: 11.5px; line-height: 1.3; color: var(--txt-dim); flex-shrink: 0;
  }
  .vpick:hover, .vpick:focus-visible { color: var(--txt); border-color: var(--txt-dim); outline: none; }
  .vpick.on { color: var(--accent); border-color: var(--accent); }
  .vfoot { margin: 10px 2px 0; padding-top: 10px; border-top: 1px solid var(--line); font-size: 12px; color: var(--txt-faint); line-height: 1.45; }
</style>
