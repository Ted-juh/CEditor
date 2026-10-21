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
  // A ce.anim.play row whose control is on the panel has Open: the Animation tab edits the panel,
  // which a script tab does not have in front, so Open goes to the panel's tab with the control
  // selected and the Animation tab on the animation the row names, where it previews.
  //
  // A row that can take a control moved on the instrument (sendCC's controller, sendNRPN's and
  // sendRPN's numbers, a device parameter's id) has Learn: it shows the display panel's MIDI tab and
  // writes the first such control the tab's learn chips see, in one edit, and a chip dragged from
  // the tab onto the row is written the same way. A sendMidi or sendSysex row has Send, which hands
  // its bytes to the Ports tab's Send raw MIDI box; nothing is sent from the row (valueLearn.js).
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
    gradientStrip, shownNumber, controlToSelect, argColour, callAt,
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
  import LcdLinePreview from './LcdLinePreview.svelte';
  import { arrangementView, labelFits } from '../scripting/arrangePreview.js';
  import { dumpRangeSaid } from '../scripting/dumpOffsets.js';
  import { bitRows, cellCentre, hex2, rangeLines, listText, codeParts } from './explainViews.js';
  import { learnFor, learnTakes, learnedEdit, learnWords, sendableHex } from './valueLearn.js';
  import { learnNext } from '../stores/midiLearnTap.js';
  import { rawMidiDraft } from '../stores/rawMidiDraft.js';

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
    onopenanimation = null,  // (controlId, name) → the panel, its Animation tab on it; null: no Open
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
  // The call the head explains: the innermost one the caret is in, so in a call inside another it is
  // the inner one; the statement's first call when the caret is between calls.
  let headCall = $derived(statement ? callAt(statement, readPoint) : null);
  let headParam = $derived(caretArg?.param?.name ?? null);
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
    // A line under each argument of the call the head explains, in its parameter's colour: the colour
    // it has in the hint above and on its row (scripting/paramColours.js).
    if (!isJson) {
      for (const arg of headCall?.args ?? []) {
        const colour = argColour(headCall, arg);
        if (colour) out.push({ start: arg.range.start, end: arg.range.end, kind: 'param', colour });
      }
    }
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

  /* --------------------------------------------- a control moved on the instrument, and Send */

  // The learn under way: the row's key, what it writes, how to stop listening, and whether the
  // display panel was showing before it opened the MIDI tab. `learnNote` says what the last one
  // wrote, until the caret leaves the call it wrote into (`learnNoteIn`, that call's text as written):
  // the write itself moves the caret, so any move would take the note away before it was read.
  let learning = $state.raw(null);
  let learnNote = $state('');
  let learnNoteIn = null;
  let dropKey = $state(null);
  const DRAG_TYPE = 'application/x-ceditor-device-parameter';

  /** What a row's Learn writes, or null: none in the panel file view, nor without an editor to write in. */
  const learnable = (row) => (!readOnly && !isJson && editor?.replaceRange ? learnFor(row.call, row.arg) : null);

  /** The profile a learn names what it hears against: the role's own for a device parameter, else
   *  the main synth's. */
  const learnProfile = (arg) => String(context?.devices?.roles?.[arg.meaning?.role ?? 'mainSynth']?.profileId
    ?? context?.devices?.roles?.mainSynth?.profileId ?? '');

  function stopLearn({ restore = true } = {}) {
    const held = learning;
    if (!held) return;
    learning = null;
    held.stop?.();
    if (restore && !held.wasShowing) scriptDisplay.set(false);
  }

  function startLearn(row) {
    const key = keyOf(row.arg);
    if (learning?.key === key) { stopLearn(); return; }
    const wasShowing = learning ? learning.wasShowing : get(scriptDisplay);
    stopLearn({ restore: false });
    session?.done();
    const spec = learnable(row);
    if (!spec) return;
    learnNote = '';
    learnNoteIn = null;
    scriptDisplay.set(true);
    displayTabRequest.set({ tab: 'midi' });
    const stop = learnNext((chip) => learnTakes(spec, chip), (chip) => takeLearned(row, chip), { profileId: learnProfile(row.arg) });
    learning = { key, spec, stop, wasShowing };
  }

  /** Write what was learned (a chip, or a chip's drag payload) into the row's call as it is now. */
  function takeLearned(row, learned) {
    clearTimeout(readTimer);
    readNow();
    const now = statementRows(statement).find((r) => r.type === 'arg' && r.arg.range.start === row.arg.range.start && r.arg.kind === row.arg.kind);
    const spec = now ? learnable(now) : null;
    const edit = spec ? learnedEdit(source, spec, learned, (a, v) => writeValue(source, language, a, v).text) : null;
    stopLearn();
    if (!edit) {
      learnNoteIn = null;
      learnNote = spec ? 'That is not what this row takes, so nothing was written.' : 'The call moved, so nothing was written.';
      return;
    }
    writeThrough(edit.start, edit.end, edit.text);
    learnNoteIn = { start: now.call.range.start, end: now.call.range.end + edit.text.length - (edit.end - edit.start) };
    learnNote = learnWords(spec, learned);
  }

  function onRowDragOver(event, row) {
    if (!learnable(row) || !event.dataTransfer?.types?.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    dropKey = keyOf(row.arg);
  }

  function onRowDrop(event, row) {
    dropKey = null;
    if (!learnable(row)) return;
    let payload = null;
    try { payload = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)); } catch { payload = null; }
    if (!payload) return;
    event.preventDefault();
    takeLearned(row, payload);
  }

  /** Hand a sendMidi or sendSysex row's bytes to the Ports tab, to be sent from there. */
  function sendFromPorts(row, hex) {
    rawMidiDraft.set({ hex, role: 'mainSynth', from: `${labelPrefix.toLowerCase()} line ${lineNo(row.arg.range.start)}` });
    scriptDisplay.set(true);
    displayTabRequest.set({ tab: 'ports' });
  }

  /** Go to the panel, a ce.anim.play row's control selected and the Animation tab open on its
   *  animation, where it previews; on the control's animations when it has none of that name, to
   *  make one. An edit open here is ended first; the code is not touched. */
  function openAnimation(arg) {
    const m = arg.meaning ?? {};
    if (!m.controlId || !onopenanimation) return;
    stopLearn({ restore: false });
    session?.done();
    onopenanimation(m.controlId, m.key ?? null);
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
      if (lastDocKey !== null && key !== lastDocKey) { session?.end('left'); stopLearn(); }
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
  $effect(() => { if (readOnly) untrack(() => { session?.end('left'); stopLearn(); }); });
  // What the last learn wrote is said until the caret leaves the call it wrote into.
  $effect(() => {
    const at = caret;
    untrack(() => {
      if (learning || !learnNote) return;
      if (!learnNoteIn || at < learnNoteIn.start || at > learnNoteIn.end) { learnNote = ''; learnNoteIn = null; }
    });
  });

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
    stopLearn();
    onmarks?.([]);
  });

  /* ------------------------------------------------------------------------------ showing */

  const oneLine = (text) => {
    const flat = String(text ?? '').replace(/\s*\n\s*/g, ' ');
    return flat.length > 80 ? `${flat.slice(0, 79)}…` : flat;
  };
  // A colour built from numbers is shown as the colour: its text is the whole call, headed above it.
  const shownText = (arg) => (arg.meaning?.built ? arg.meaning.stored
    : highlight(oneLine(editingArg(arg) && session ? session.arg.text : arg.text), language));

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
    if (learning) return learnWords(learning.spec);
    if (learnNote) return learnNote;
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
  {:else if arg.kind === 'computed' && m.css}
    <!-- The colour the call below builds from numbers: edited on that call's colour row. -->
    <span class="vswatch still" style:--sw={m.css} title={`${m.stored}, built by the call below, where it is edited`} aria-hidden="true"></span>
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

{#snippet openAnimationTab(arg)}
  {@const m = arg.meaning ?? {}}
  {#if arg.kind === 'animation' && m.controlId && onopenanimation}
    <!-- The Animation tab edits the panel, and a script tab has none in front: Open goes to it. -->
    <button class="vpick vopen" aria-label={m.key ? `Open ${m.key} in the Animation tab` : `Open ${m.control}'s animations in the Animation tab`}
      title={m.key ? `Go to the panel with ${m.control} selected and the Animation tab open on "${m.key}", where it previews. The script stays open in its tab.`
        : `${m.control} has no animation called "${arg.value}". Go to the panel with ${m.control} selected and the Animation tab open, where one can be made.`}
      onclick={(e) => { e.stopPropagation(); openAnimation(arg); }}>Open</button>
  {/if}
{/snippet}

{#snippet learnAndSend(row)}
  {@const spec = learnable(row)}
  {@const hex = !readOnly && !isJson ? sendableHex(row.call, row.arg) : null}
  {#if spec}
    {@const on = learning?.key === keyOf(row.arg)}
    <!-- Its own button, as Select is: the row's click goes to the value. -->
    <button class={['vpick', 'vlearn', on && 'on']} aria-pressed={on}
      aria-label={on ? 'Stop learning' : `Learn ${spec.label} from the instrument`}
      title={on ? 'Listening on the MIDI input. Click again to stop.'
        : `Move a control on the instrument and the first ${spec.label} the MIDI tab sees is written here, in one edit. Or drag a chip from the MIDI tab onto this row.`}
      onclick={(e) => { e.stopPropagation(); startLearn(row); }}>{on ? 'Listening…' : 'Learn'}</button>
  {/if}
  {#if hex}
    <button class="vpick vsend" aria-label="Send these bytes from the Ports tab"
      title={`Put ${hex} in the Ports tab's Send raw MIDI box, to send from there. Nothing is sent from here.`}
      onclick={(e) => { e.stopPropagation(); sendFromPorts(row, hex); }}>Send…</button>
  {/if}
{/snippet}

{#snippet explainCall(row)}
  {@const call = row.call}
  {@const ex = call.explain}
  <!-- What the call does with these values (scripting/callExplainers.js, bitFields.js), drawn under
       its rows: the script's own values, never a fixed example. Colours are the parameters'. -->
  <div class="vexplain" style:--depth={row.depth}>
    {#if call.bits?.groups.length}
      {@const view = bitRows(call.bits)}
      <div class="vbits" role="img" aria-label={call.bits.said}>
        {#each view.groups as group, g (g)}
          <div class="vbyte">
            {#if group.label}<span class="vbyte-label">{group.label}</span>{/if}
            <span class="vlab c-blue">{group.beforeHex}</span>
            <span class="vcells vvalue">
              {#each group.cells as cell (cell.bit)}
                <span class={['vbit', cell.field && 'field']} data-bit={cell.bit}>{cell.before ?? ''}</span>
              {/each}
            </span>
            <span class="vlab vlab-faint">bit</span>
            <span class="vcells vnums">
              {#each group.cells as cell (cell.bit)}<span class={[cell.field && 'infield']}>{cell.bit}</span>{/each}
            </span>
            {#if group.arrow}
              {@const x1 = cellCentre(group.arrow.right, 22, 2)}
              {@const x0 = cellCentre(group.arrow.left, 22, 2)}
              <span></span>
              <svg class="varrow" width={8 * 22 + 7 * 2} height="12" aria-hidden="true">
                <line x1={x1} y1="6" x2={x0 - (group.arrow.head ? 7 : 0)} y2="6" />
                {#if group.arrow.dot}<circle cx={x1} cy="6" r="3" />{/if}
                {#if group.arrow.head}<path d={`M${x0 - 1} 6 L${x0 + 5} 2 M${x0 - 1} 6 L${x0 + 5} 10`} />{/if}
              </svg>
            {/if}
            {#if view.verb === 'set' && group.hasPut}
              <span class="vlab c-green">{view.bitsHex}</span>
              <span class="vcells vput">
                {#each group.cells as cell (cell.bit)}
                  <span class={['vbit', cell.put === null ? 'blank' : 'put']} data-bit={cell.bit}>{cell.put ?? ''}</span>
                {/each}
              </span>
            {/if}
            {#if view.verb === 'set' && view.result}
              <span class="vlab vlab-strong">{group.afterHex}</span>
              <span class="vcells vresult">
                {#each group.cells as cell (cell.bit)}
                  <span class={['vbit', cell.field && 'made']} data-bit={cell.bit}>{cell.after ?? ''}</span>
                {/each}
              </span>
            {/if}
          </div>
        {/each}
        {#if view.readCells}
          <div class="vbyte">
            <span class="vlab vlab-strong">{view.read.hex}</span>
            <span class="vcells vresult">
              {#each view.readCells as cell (cell.bit)}<span class={['vbit', cell.field && 'made']}>{cell.v}</span>{/each}
            </span>
          </div>
        {:else if view.read}
          <div class="vsum-line"><span class="vlab-strong">= {view.read.value}</span></div>
        {/if}
      </div>
    {/if}

    {#if ex?.kind === 'sevenBit'}
      <div class="vseven" role="img" aria-label={ex.value === null ? `Split into ${ex.count} bytes of 7 bits` : `${ex.value} split into ${ex.count} bytes of 7 bits: ${ex.bytes.map((b) => b.byte).join(', ')}`}>
        <div class="vseven-row">
          <span class="vlab c-blue">{ex.value ?? ''}</span>
          <span class="vseven-groups">
            {#each ex.groups as group, g (g)}
              <span class="vseven-group">
                <span class="vcells small">{#each Array.from({ length: 7 }, (_, i) => group.bits?.[i] ?? '') as d, i (i)}<span class="vbit field">{d}</span>{/each}</span>
                <span class="vseven-name">{group.label}</span>
              </span>
            {/each}
          </span>
        </div>
        {#each ex.bytes as b, i (i)}
          <div class="vseven-row">
            <span class="vlab vlab-strong">{b.byte === null ? '' : hex2(b.byte)}</span>
            <span class="vcells"><span class="vbit blank">0</span>{#each Array.from({ length: 7 }, (_, k) => b.bits?.[k] ?? '') as d, k (k)}<span class="vbit made">{d}</span>{/each}</span>
            <span class="vseven-name">{b.label}</span>
          </div>
        {/each}
        {#if ex.value !== null}<div class="vsum-line"><span class="vlab-strong">= {listText(ex.bytes.map((b) => b.byte), language)}</span></div>{/if}
      </div>
    {/if}

    {#if ex?.kind === 'bytes'}
      {@const first = ex.cells.findIndex((c) => c.field)}
      {@const last = ex.cells.findLastIndex((c) => c.field)}
      {@const lead = ex.before ? 1 : 0}
      <div class="vmsg" role="img" aria-label={`Bytes ${ex.offset} to ${ex.offset + ex.count - 1}, counted from 0${ex.value === null ? '' : `: ${ex.value}`}`}>
        <div class="vmsg-cells">
          {#if ex.before}<span class="vmsg-col"><span class="vbyte-cell more">…</span><span></span></span>{/if}
          {#each ex.cells as c (c.index)}
            <span class="vmsg-col"><span class={['vbyte-cell', c.field && 'infield']}>{c.hex ?? ''}</span><span class={['vmsg-index', c.field && 'infield']}>{c.index}</span></span>
          {/each}
          {#if ex.after}<span class="vmsg-col"><span class="vbyte-cell more">…</span><span></span></span>{/if}
        </div>
        {#if first >= 0}
          {@const x0 = cellCentre(first + lead, 26, 3)}
          {@const x1 = cellCentre(last + lead, 26, 3) + 10}
          <svg class="varrow" width={(ex.cells.length + lead + (ex.after ? 1 : 0)) * 29} height="12" aria-hidden="true">
            <circle cx={x0} cy="6" r="3" />
            <line x1={x0} y1="6" x2={x1 - 1} y2="6" />
            <path d={`M${x1} 6 L${x1 - 6} 2 M${x1} 6 L${x1 - 6} 10`} />
          </svg>
        {/if}
        {#if ex.value !== null}
          <div class="vsum-line">
            {#each ex.cells.filter((c) => c.field) as c (c.index)}<span class="vbyte-cell made">{c.hex}</span>{/each}
            {#if ex.formula}<span class="vlab-faint">{ex.formula}</span>{/if}
            <span class="vlab-strong">= {ex.value}</span>
          </div>
        {/if}
      </div>
    {/if}

    {#if ex?.kind === 'messages'}
      <div class="vsends" role="img" aria-label={`Sends four Control Change messages on channel ${ex.channel}`}>
        <span class="vhd">status</span><span class="vhd">CC</span><span class="vhd">value</span><span></span>
        {#each ex.lines as line, i (i)}
          {#each line.bytes as b, k (k)}<span class={['vbyte-cell', k > 0 && (line.part === 'number' ? 'c-amber' : 'c-blue')]}>{b}</span>{/each}
          <span class={['vsend-what', line.part === 'number' ? 'c-amber' : 'c-blue']}>CC {line.cc} = {line.value}</span>
        {/each}
      </div>
      <div class="vsum-line"><span class="vlab-faint">{ex.hi} × 128 + {ex.lo}</span><span class="vlab-strong c-blue">= {ex.value}</span></div>
      <div class="vfine">{ex.status} is a Control Change on channel {ex.channel}.</div>
    {/if}

    {#if ex?.kind === 'checksum'}
      <div class="vmsg-cells" role="img" aria-label={`The checksum of ${ex.bytes.length} bytes is ${ex.result}`}>
        {#each ex.bytes as b, i (i)}<span class="vbyte-cell c-green field-green">{b}</span>{/each}
        <span class="vbyte-cell made">{ex.resultHex}</span>
      </div>
      {#if ex.steps.length}
        <!-- The steps to it, the last one ending in the checksum byte as it is sent. -->
        <div class="vsteps">
          {#each ex.steps as s, i (i)}
            {@const last = i === ex.steps.length - 1}
            <span class={[i === 0 && 'c-green']}>{s.left}</span><span class={[last && 'vlab-strong']}>{s.right}{last ? ` = 0x${ex.resultHex}` : ''}</span>
          {/each}
        </div>
      {:else}
        <div class="vsum-line"><span class="vlab-strong">= {ex.result} = 0x{ex.resultHex}</span></div>
      {/if}
    {/if}

    {#if ex?.kind === 'ranges'}
      {@const v = rangeLines(ex)}
      <svg class="vranges" width={v.width} height="100" role="img"
        aria-label={v.x === null ? `From ${v.from.join(' to ')} to ${v.to.join(' to ')}` : `${v.value} on ${v.from.join(' to ')} lands at ${v.result} on ${v.to.join(' to ')}`}>
        <g class="vr-in">
          <line x1={v.pad} y1="24" x2={v.width - v.pad} y2="24" /><line x1={v.pad} y1="19" x2={v.pad} y2="29" /><line x1={v.width - v.pad} y1="19" x2={v.width - v.pad} y2="29" />
          <text x={v.pad} y="12">{v.from[0]}</text><text x={v.width - v.pad} y="12">{v.from[1]}</text>
        </g>
        <line class="vr-dash" x1={v.pad} y1="30" x2={v.pad} y2="70" /><line class="vr-dash" x1={v.width - v.pad} y1="30" x2={v.width - v.pad} y2="70" />
        <g class="vr-out">
          <line x1={v.pad} y1="76" x2={v.width - v.pad} y2="76" /><line x1={v.pad} y1="71" x2={v.pad} y2="81" /><line x1={v.width - v.pad} y1="71" x2={v.width - v.pad} y2="81" />
          <text x={v.pad} y="96">{v.to[0]}</text><text x={v.width - v.pad} y="96">{v.to[1]}</text>
        </g>
        {#if v.x !== null}
          <g class="vr-value">
            <line x1={v.x} y1="24" x2={v.x} y2="70" /><path d={`M${v.x - 4} 64 L${v.x} 71 L${v.x + 4} 64`} />
            <circle cx={v.x} cy="24" r="4" />
            <text x={v.x + 8} y="14" text-anchor="start">{v.value}</text>
          </g>
          <circle class="vr-result" cx={v.x} cy="76" r="4" />
          <text class="vr-result-text" x={v.x} y="96">{v.result}</text>
        {/if}
      </svg>
      {#if v.outside}<div class="vfine warn">{v.value} is outside {v.from.join(' to ')}, so the result is outside {v.to.join(' to ')}.</div>{/if}
    {/if}

    {#if ex?.kind === 'stopOrFinish'}
      <div class="vhd-block">Stop or finish</div>
      <div class="vcompare">
        <span class={['mono', ex.verb === 'stop' ? 'now' : 'other']}>stop</span>
        <span class="vbar"><span class={ex.verb === 'stop' ? 'now' : 'other'} style:width="60%"></span></span>
        <span class={ex.verb === 'stop' ? 'now' : 'other'}>stays where it is</span>
        <span class={['mono', ex.verb === 'finish' ? 'now' : 'other']}>finish</span>
        <span class="vbar"><span class={ex.verb === 'finish' ? 'now' : 'other'} style:width="100%"></span></span>
        <span class={ex.verb === 'finish' ? 'now' : 'other'}>jumps to the end</span>
      </div>
    {/if}

    {#if call.returns?.length}
      {@const fn = call.doc?.params.find((p) => p.name === 'fn')?.name ?? 'fn'}
      <div class="vhd-block">What {fn} returns</div>
      <div class="vreturns">
        {#each call.returns as r (r.key)}
          <span class="mono">{r.when}</span><span>{r.then}</span><span class="vreturn-lines">{r.lines.length ? `line${r.lines.length > 1 ? 's' : ''} ${r.lines.join(', ')}` : ''}</span>
        {/each}
      </div>
    {/if}

    {#if call.notes?.length}
      <div class="vhd-block">Good to know</div>
      <ul class="vnotes">
        {#each call.notes as note, i (i)}
          <li class={note.mark}><span class="vnote-mark" aria-hidden="true">{note.mark === 'ok' ? '✓' : note.mark === 'warn' ? '⚠' : '•'}</span><span>{#each codeParts(note.text) as part, k (k)}{#if part.code}<code>{part.text}</code>{:else}{part.text}{/if}{/each}</span></li>
        {/each}
      </ul>
    {/if}
  </div>
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
      {:else if headCall}
        <!-- The call as the hint in the code shows it: its name as written, its parameters in the
             colours they have under their values, the one the caret is in underlined; then what the
             command does, in one plain sentence. -->
        <div class="vsig">
          <span class="vpath">{callName(headCall)}</span>{#if headCall.doc}(<!--
          -->{#each headCall.doc.params as p, i (p.name)}<span class={['vsig-param', headCall.doc.colours[i] && `c-${headCall.doc.colours[i]}`, p.name === headParam && 'active']}>{p.optional ? `[${p.name}]` : p.name}</span>{#if i < headCall.doc.params.length - 1}{', '}{/if}{/each}<!--
          -->){/if}
        </div>
        {#if headCall.doc?.summary}<div class="vdesc">{#each codeParts(headCall.doc.summary) as part, k (k)}{#if part.code}<code>{part.text}</code>{:else}{part.text}{/if}{/each}</div>{/if}
      {/if}
    </div>
    {#if !rows.some((r) => r.type === 'arg' || r.type === 'explain') && !(statement.calls ?? []).some((c) => c.problem || c.arrange || c.dumpAt)}
      <p class="vempty">Nothing in this {isJson ? 'object' : 'statement'} that the editor can read.</p>
    {/if}
    <div class="vlist" bind:this={listEl}>
      {#each rows as row (row.key)}
        {#if row.type === 'call'}
          {#if row.depth > 0 || row.call !== headCall}
            <div class="vcall" style:--depth={row.depth}>
              <div class="vpath">{callName(row.call)}</div>
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
          {#if row.call.arrange}
            {@const arrange = row.call.arrange}
            {@const view = arrangementView(arrange)}
            {#if view}
              <!-- The named controls where they are, dashed, and where the verb puts them, solid, among
                   the panel's other controls: the canvas is not on screen while the script is. -->
              <svg class="varrange" style:--depth={row.depth} width={view.width} height={view.height} viewBox={view.viewBox}
                role="img" aria-label={`${arrange.verb}: the controls where they are, dashed, and where it puts them, solid`}>
                {#each view.others as other, i (i)}
                  <rect class="varr-other" x={other.x} y={other.y} width={other.w} height={other.h} vector-effect="non-scaling-stroke" />
                {/each}
                {#if view.line}
                  <line class="varr-line" x1={view.line.x1} y1={view.line.y1} x2={view.line.x2} y2={view.line.y2} vector-effect="non-scaling-stroke" />
                {/if}
                {#each arrange.items as item, i (i)}
                  {#if item.moved}
                    <rect class="varr-before" x={item.before.x} y={item.before.y} width={item.before.w} height={item.before.h} vector-effect="non-scaling-stroke" />
                    <line class="varr-move" x1={item.before.x + item.before.w / 2} y1={item.before.y + item.before.h / 2}
                      x2={item.after.x + item.after.w / 2} y2={item.after.y + item.after.h / 2} vector-effect="non-scaling-stroke" />
                  {/if}
                {/each}
                {#each arrange.items as item, i (i)}
                  <rect class={['varr-after', item.moved ? 'moved' : 'still', item.key && 'key']} data-name={item.name}
                    x={item.after.x} y={item.after.y} width={item.after.w} height={item.after.h} vector-effect="non-scaling-stroke" />
                  {#if labelFits(item.name, item.after, view.scale)}
                    <text class="varr-label" x={item.after.x + item.after.w / 2} y={item.after.y + item.after.h / 2} font-size={view.labelSize}>{item.name}</text>
                  {/if}
                {/each}
              </svg>
            {/if}
            <div class="varr-said" style:--depth={row.depth}>
              <span class="varr-text">{arrange.said}</span>
              {#if arrange.moved}<span class="varr-key"><i class="now"></i>now <i class="then"></i>after</span>{/if}
            </div>
          {/if}
          {#if row.call.dumpAt}
            {@const at = row.call.dumpAt}
            {@const profiles = [...new Set(at.lines.map((l) => l.profile))]}
            <!-- What the profile's dumps hold at the bytes the call reads or writes. -->
            <div class="vdump" style:--depth={row.depth}>
              <div class="vdump-head">{dumpRangeSaid(at)}{profiles.length === 1 && profiles[0] ? `, in a ${profiles[0]} dump` : ''}:</div>
              {#each at.lines as line, i (i)}
                <div class="vdump-line"><span class="vdump-who">{profiles.length > 1 && line.profile ? `${line.profile} · ` : ''}{line.who}</span>: <span class="vdump-what">{line.text}</span></div>
              {/each}
              {#if at.more}<div class="vdump-more">…and {at.more} other dump{at.more === 1 ? '' : 's'}</div>{/if}
            </div>
          {/if}
        {:else if row.type === 'explain'}
          {@render explainCall(row)}
        {:else if row.type === 'loose'}
          <div class="vcall" style:--depth={0}><div class="vsum">Values outside any call</div></div>
        {:else}
          {@const arg = row.arg}
          {@const key = keyOf(arg)}
          {@const group = arg.kind === 'options'}
          {@const line = meaningLine(arg, { madeBelow: madeByChild(row.call, arg) })}
          <!-- The row as a whole goes to its value on a click; its name is the keyboard's way there. -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class={['vrow', group && 'group', key === caretKey && 'sel', editingArg(arg) && 'editing', arg.problem && arg.problem.severity, dropKey === key && 'drop']}
            style:--depth={row.depth} data-arg={key} data-kind={arg.kind} data-name={arg.name ?? ''}
            ondragover={(e) => onRowDragOver(e, row)} ondragleave={() => { if (dropKey === key) dropKey = null; }} ondrop={(e) => onRowDrop(e, row)}
            onpointerenter={() => hoverKey = key} onpointerleave={() => { if (hoverKey === key) hoverKey = null; }}
            onfocusin={() => hoverKey = key} onfocusout={() => { if (hoverKey === key) hoverKey = null; }}
            onclick={() => revealArg(arg)}>
            <button class={['vname', argColour(row.call, arg) && `c-${argColour(row.call, arg)}`]} title={`Go to ${arg.name ?? 'this value'} in the ${isJson ? 'text' : 'code'}`}
              onclick={(e) => { e.stopPropagation(); revealArg(arg); }}>{#if arg.problem?.severity === 'error' && !arg.param && !group}<span class="vwarn" aria-hidden="true">⚠</span>{/if}{arg.name ?? '·'}</button>
            {#if !group}
              <div class="vbody">
                <div class="vline">
                  {@render valueControl(row)}
                  {#if !hasEditor(arg) && !drawnCurve(arg) && !drawnEnvelope(arg) && arg.kind !== 'gradient'}
                    <code class={['vtext', argColour(row.call, arg) && `c-${argColour(row.call, arg)}`]}>{@html shownText(arg)}</code>
                  {/if}
                  {@render valueEdit(row)}
                  {@render selectControl(arg)}
                  {@render openAnimationTab(arg)}
                  {@render learnAndSend(row)}
                </div>
                {#if arg.kind === 'lcdLine' && arg.meaning?.lcd?.cells && !arg.meaning.lcd.layouts}
                  <!-- The line as the display shows it: what of it is cut, and the cells it cannot draw. -->
                  <LcdLinePreview line={arg.meaning.lcd} />
                {/if}
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
  /* What the panel file view's object is; three lines of it at most. */
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
  /* A value in its parameter's colour, over the code's own colours: the colour says which parameter. */
  .vtext[class*='c-'] :global(span) { color: inherit; }
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
  .varrange { display: block; margin: 2px 8px 2px calc(8px + var(--depth, 0) * 14px); }
  .varr-other { fill: none; stroke: var(--line-2); stroke-width: 1; }
  .varr-line { stroke: #e7c489; stroke-width: 1; stroke-dasharray: 3 2; }
  .varr-before { fill: none; stroke: var(--txt-faint); stroke-width: 1; stroke-dasharray: 3 2; }
  .varr-move { stroke: var(--txt-faint); stroke-width: 1; }
  .varr-after { stroke-width: 1.25; }
  .varr-after.moved { fill: color-mix(in srgb, var(--accent) 18%, transparent); stroke: var(--accent); }
  .varr-after.still { fill: color-mix(in srgb, var(--txt) 8%, transparent); stroke: var(--txt-dim); }
  .varr-after.key { stroke: #e7c489; stroke-width: 2; }
  .varr-label { fill: var(--txt); font-family: var(--mono); text-anchor: middle; dominant-baseline: central; pointer-events: none; }
  .varr-said { margin: 0 8px 4px calc(8px + var(--depth, 0) * 14px); color: var(--txt-dim); font-size: 11px;
    display: flex; flex-wrap: wrap; gap: 2px 10px; align-items: baseline; }
  .varr-key { color: var(--txt-faint); display: inline-flex; align-items: center; gap: 4px; }
  .varr-key i { display: inline-block; width: 12px; height: 8px; box-sizing: border-box; }
  .varr-key i.now { border: 1px dashed var(--txt-faint); }
  .varr-key i.then { border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 18%, transparent); margin-left: 4px; }
  /* The head: the call as the hint shows it, then what it does. */
  .vsig { font-family: var(--mono); font-size: 13px; color: var(--txt-faint); margin-top: 6px; line-height: 1.5; overflow-wrap: anywhere; }
  .vsig .vpath { margin-top: 0; display: inline; color: var(--txt); }
  .vsig-param { color: var(--txt-faint); }
  .vsig-param.active { font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
  .vdesc { font-size: 12.5px; color: var(--txt); margin-top: 5px; line-height: 1.45; }
  /* A parameter's colour, the same in the hint, on the row's name and under the value in the code. */
  .c-blue { color: var(--blue) !important; }
  .c-amber { color: var(--amber) !important; }
  .c-green { color: var(--accent) !important; }

  /* Under a call's rows: what it does with these values. */
  .vexplain { margin: 6px 6px 4px calc(6px + var(--depth, 0) * 14px); padding-top: 10px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
  .vlab { font-family: var(--mono); font-size: 11.5px; align-self: center; }
  .vlab-faint { font-family: var(--mono); font-size: 11.5px; color: var(--txt-dim); }
  .vlab-strong { font-family: var(--mono); font-size: 12px; color: var(--txt); font-weight: 700; }
  .vbits { display: flex; flex-direction: column; gap: 10px; }
  .vbyte { display: grid; grid-template-columns: 44px auto; gap: 4px 6px; align-items: center; }
  .vbyte-label { grid-column: 1 / -1; color: var(--txt-faint); font-size: 10px; }
  .vcells { display: grid; grid-template-columns: repeat(8, 22px); gap: 2px; }
  .vcells.small { grid-template-columns: repeat(7, 14px); }
  .vbit { height: 22px; box-sizing: border-box; border: 1px solid var(--line-2); border-radius: 3px; color: var(--txt-dim);
    font-family: var(--mono); font-size: 12px; display: flex; align-items: center; justify-content: center; }
  .vcells.small .vbit { height: 20px; font-size: 11px; }
  .vcells.small .vbit.field { border-width: 1.5px; }
  /* margin: the script editor's own `.field` (behaviorDesigner.css) would push the cell down. */
  .vbit.field { border: 2px solid var(--amber); color: var(--txt); margin: 0; }
  .vbit.put { border: 2px solid var(--accent); color: var(--accent); font-weight: 700; }
  .vbit.blank { border-style: dashed; border-color: var(--line); color: var(--txt-faint); }
  .vbit.made { border: 2px solid var(--accent); background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--txt); font-weight: 700; }
  .vresult .vbit:not(.made) { color: var(--txt); }
  .vnums span { text-align: center; font-family: var(--mono); font-size: 10px; color: var(--txt-faint); }
  .vnums span.infield { color: var(--amber); font-weight: 700; }
  .varrow { overflow: visible; }
  .varrow line, .varrow path { stroke: var(--amber); stroke-width: 2; fill: none; }
  .varrow circle { fill: var(--amber); }
  .vsum-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .vseven { display: flex; flex-direction: column; gap: 6px; }
  .vseven-row { display: grid; grid-template-columns: 44px auto auto; gap: 6px; align-items: center; justify-content: start; }
  .vseven-groups { display: flex; flex-wrap: wrap; gap: 6px; }
  .vseven-group { display: flex; flex-direction: column; gap: 2px; }
  .vseven-name { font-size: 10.5px; color: var(--amber); text-align: center; }
  .vmsg { display: flex; flex-direction: column; gap: 4px; overflow-x: auto; }
  .vmsg-cells { display: flex; gap: 3px; flex-wrap: wrap; }
  .vmsg-col { display: flex; flex-direction: column; gap: 2px; width: 26px; }
  .vbyte-cell { min-width: 26px; height: 24px; box-sizing: border-box; border: 1px solid var(--line-2); border-radius: 4px; padding: 0 3px;
    display: inline-flex; align-items: center; justify-content: center; font-family: var(--mono); font-size: 11.5px; color: var(--txt-dim); }
  .vbyte-cell.infield { border: 2px solid var(--amber); color: var(--txt); }
  .vbyte-cell.field-green { border: 2px solid var(--accent); }
  .vbyte-cell.made { border: 2px solid var(--accent); background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--txt); font-weight: 700; }
  .vbyte-cell.more { border-color: transparent; color: var(--txt-faint); }
  .vmsg-index { text-align: center; font-family: var(--mono); font-size: 10px; color: var(--txt-faint); }
  .vmsg-index.infield { color: var(--amber); font-weight: 700; }
  .vsends { display: grid; grid-template-columns: repeat(3, auto) minmax(0, 1fr); gap: 4px 3px; align-items: center; justify-content: start; }
  .vhd { font-size: 10px; color: var(--txt-faint); text-align: center; }
  .vsend-what { font-family: var(--mono); font-size: 11.5px; padding-left: 8px; }
  .vfine { font-size: 11px; color: var(--txt-faint); line-height: 1.4; }
  .vfine.warn { color: #e7c489; }
  .vsteps { display: grid; grid-template-columns: auto auto; justify-content: start; gap: 4px 12px; font-family: var(--mono); font-size: 11.5px; color: var(--txt-dim); }
  .vranges { overflow: visible; }
  .vranges text { font-family: var(--mono); font-size: 10.5px; text-anchor: middle; }
  .vr-in line { stroke: var(--amber); stroke-width: 2; } .vr-in text { fill: var(--amber); }
  .vr-out line { stroke: var(--accent); stroke-width: 2; } .vr-out text { fill: var(--accent); }
  .vr-dash { stroke: var(--line-2); stroke-dasharray: 3 3; }
  .vr-value line, .vr-value path { stroke: var(--blue); stroke-width: 2; fill: none; }
  .vr-value circle { fill: var(--blue); } .vr-value text { fill: var(--blue); font-weight: 700; }
  .vr-result { fill: var(--txt); }
  .vr-result-text { fill: var(--txt); font-weight: 700; }
  .vhd-block { font-size: 10px; letter-spacing: 1.3px; text-transform: uppercase; color: var(--txt-faint); margin-top: 2px; }
  .vcompare { display: grid; grid-template-columns: auto 90px auto; gap: 7px 10px; align-items: center; justify-content: start; font-size: 11.5px; }
  .vcompare .mono { font-family: var(--mono); }
  .vcompare .now { color: var(--txt); }
  .vcompare .other { color: var(--txt-faint); }
  .vbar { height: 8px; border-radius: 4px; background: var(--line); display: block; }
  .vbar span { display: block; height: 8px; border-radius: 4px; }
  .vbar span.now { background: var(--blue); }
  .vbar span.other { background: color-mix(in srgb, var(--blue) 35%, var(--line)); }
  .vreturns { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 5px 10px; align-items: baseline; font-size: 11.5px; color: var(--txt-dim); }
  .vreturns .mono { font-family: var(--mono); color: var(--txt); }
  .vreturn-lines { font-family: var(--mono); font-size: 10.5px; color: var(--accent); }
  .vnotes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
  .vnotes li { display: flex; gap: 7px; font-size: 11.5px; line-height: 1.45; color: var(--txt-dim); }
  .vnote-mark { flex-shrink: 0; width: 10px; color: var(--txt-faint); }
  .vnotes li.ok .vnote-mark { color: var(--accent); font-weight: 700; }
  .vnotes li.ok { color: var(--txt); }
  .vnotes li.warn .vnote-mark, .vnotes li.warn { color: #e7c489; }
  .vnotes code, .vdesc code { font-family: var(--mono); font-size: 0.95em; color: var(--txt); }
  .vdump { margin: 4px 8px 4px calc(8px + var(--depth, 0) * 14px); font-size: 11px; color: var(--txt-dim); }
  .vdump-head { color: var(--txt-faint); margin-bottom: 2px; }
  .vdump-line { padding: 1px 0 1px 10px; text-indent: -10px; overflow-wrap: anywhere; }
  .vdump-who { color: var(--txt-dim); }
  .vdump-what { color: var(--txt); }
  .vdump-more { color: var(--txt-faint); }
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
  .vrow.drop { border-color: var(--accent); border-style: dashed; }
  .vfoot { margin: 10px 2px 0; padding-top: 10px; border-top: 1px solid var(--line); font-size: 12px; color: var(--txt-faint); line-height: 1.45; }
</style>
