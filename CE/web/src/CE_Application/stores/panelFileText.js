// panelFileText.js — one item of a panel's file at a time, as text to read and to edit.
//
// The script editor's Panel file screen (editor/PanelFileView.svelte) shows a panel's document one
// item at a time, the panel's own settings or one control, as JSON laid out to read
// (utils/jsonText.js). It is written the way the saved file writes it: only what differs from a new
// control of that type (documentShape.js, documentEntries.js), or from a new panel. Deleting a line
// therefore puts that property back to its default.
//
// One item to edit, not the file: a readable GAIA is 71,000 lines, and an edit is checked and applied
// one control at a time. One control is a median 55 lines, and the largest on the committed panels
// 1,500. The whole file can be read (wholeFileText, below), as Save writes it, but not edited.
//
// HELD BACK: what an item's text does not show, and an edit therefore cannot change.
//   - A container's child controls, which are items of their own.
//   - A control's scripts, and the panel's, which the script screens edit.
//   - A `data:` value longer than a line (an embedded image): shown as a placeholder, put back.
//   - At panel level, what is not a setting or has an editor of its own: the name (it is the
//     file's), where the file is, the format version, the host parameter list (rebuilt from the
//     controls on every save), the notes (a note in JSON is one line of escaped text; the notepad
//     edits them), and an in-progress capture (raw dumps; the capture tool edits it).
// Applying puts them back as they were, so no edit here can lose them.
//
// APPLYING, in the order a person meets the checks:
//   - the text has to be JSON: the first mistake, with its line (an error);
//   - a control's type and id stay: a new type is a conversion, not an edit, and the id is what ties
//     scripts, layers and snapshots to the control; a panel's guid stays, as it is the panel's
//     identity to every plug-in exported from it (errors);
//   - the check every document passes to open (utils/panelDocumentSchema.js) (errors);
//   - a name another control already has is made unique, as a rename in the inspector is (warning);
//   - a property the edit adds that the defaults do not have and no other control in the panel uses
//     either is kept as written, with a warning: that is what a misspelling looks like.
// Then the item is filled out with its defaults as opening the file would, and replaces the old one.
// What the edit did not change stays the very object it was, so an untouched section keeps sharing
// its defaults and its drawing, and a text applied unchanged changes nothing.

import { formatJson, formatJsonLines, jsonSyntaxError } from '../utils/jsonText.js';
import { jsonEqual } from '../utils/jsonEqual.js';
import { collectControlNames } from '../utils/containment.js';
import { PANEL_FORMAT_VERSION, validatePanelDocument } from '../utils/panelFormat.js';
import { expandControl, shrinkControl, unknownKeys } from './documentShape.js';
import { restoreEntries, shrinkEntries } from './documentEntries.js';
import { createPanel, panelFieldsFromDocument, serializePanel } from './panelModel.js';
import { uniqueControlName } from './controls.js';

/** The outline's key for the panel's own settings. A control's key is its id. */
export const PANEL_SETTINGS_ITEM = '(panel)';

/** How wide the text is laid out: an object or list that fits stays on one line. */
const TEXT_WIDTH = 100;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// ---- the outline ----------------------------------------------------------------------------------

/**
 * The items of a panel's file, in document order: the panel settings, then every control with its
 * children under it. `{ key, kind, id?, name?, type?, depth, parentId?, childCount? }`.
 */
export function panelFileOutline(panel) {
  const rows = [{ key: PANEL_SETTINGS_ITEM, kind: 'panel', depth: 0 }];
  const visit = (controls, depth, parentId) => {
    for (const control of controls ?? []) {
      const core = control?._children?.Core;
      if (!core) continue;
      const kids = childControls(control);
      rows.push({ key: core.id, kind: 'control', id: core.id, name: core.name ?? '', type: core.controlType ?? '', depth, parentId, childCount: kids.length });
      visit(kids, depth + 1, core.id);
    }
  };
  visit(panel?.controls, 0, null);
  return rows;
}

function childControls(control) {
  const kids = control?._children?.Children?._children;
  return isPlainObject(kids) ? Object.values(kids).filter((child) => isPlainObject(child) && child._children?.Core) : [];
}

// ---- data: values, shown as a placeholder --------------------------------------------------------

const DATA_INLINE_LIMIT = 160;
const KEPT_MARK = ' — kept as it is';
const SHORTENED_MARK = ' — shortened here';

// `value` with every long data: string replaced by a placeholder; `kept` maps each placeholder back.
function holdBackData(value, mark = KEPT_MARK) {
  const kept = new Map();
  const walk = (node) => {
    if (typeof node === 'string') {
      if (!node.startsWith('data:') || node.length <= DATA_INLINE_LIMIT) return node;
      const end = node.search(/[;,]/);
      const type = end > 5 ? node.slice(5, end) : 'data';
      const token = `‹${type}, ${Math.max(1, Math.round(node.length / 1024))} KB${mark} #${kept.size + 1}›`;
      kept.set(token, node);
      return token;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (isPlainObject(node)) return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, walk(child)]));
    return node;
  };
  return { value: walk(value), kept };
}

function putBackData(value, kept, warnings) {
  let altered = 0;
  const walk = (node) => {
    if (typeof node === 'string') {
      if (kept.has(node)) return kept.get(node);
      if (node.startsWith('‹') && node.includes(KEPT_MARK)) altered++;
      return node;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (isPlainObject(node)) return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, walk(child)]));
    return node;
  };
  const out = walk(value);
  if (altered) {
    warnings.push(`${altered === 1 ? 'A placeholder for an embedded value was' : `${altered} placeholders for embedded values were`} changed, so `
      + 'it is now that text instead of the image it stood for. Revert to get the image back.');
  }
  return out;
}

// ---- one control ------------------------------------------------------------------------------------

// The control's document form without what an item holds back: its child controls and its scripts.
function controlForm(control) {
  const sparse = shrinkEntries(shrinkControl(control));
  const sections = { ...sparse._children };
  for (const [section, key] of [['Children', '_children'], ['Scripts', 'scripts']]) {
    const node = sections[section];
    if (!isPlainObject(node) || !Object.hasOwn(node, key)) continue;
    const { [key]: _held, ...rest } = node;
    if (Object.keys(rest).length) sections[section] = rest;
    else delete sections[section];
  }
  // Identity first, where someone reading looks for it.
  const { _type, _children: _sections, ...own } = sparse;
  return { ...(_type !== undefined ? { _type } : {}), ...own, _children: sections };
}

/**
 * A control as the text the panel file view shows: `{ text, heldBack }`, where `heldBack` counts what
 * the text leaves out (`children`, `scripts`, `data`).
 */
export function controlFileText(control) {
  const { value, kept } = holdBackData(controlForm(control));
  const scripts = control?._children?.Scripts?.scripts;
  return {
    text: formatJson(value, { width: TEXT_WIDTH }),
    heldBack: { children: childControls(control).length, scripts: Array.isArray(scripts) ? scripts.length : 0, data: kept.size },
  };
}

/**
 * Every field of a control, its defaults included, as text: the read-only reference beside the
 * editable text, for the name of a property to type. The same things are held back.
 */
export function controlFullText(control) {
  const sections = { ...control._children };
  if (isPlainObject(sections.Children)) {
    const { _children: _held, ...rest } = sections.Children;
    sections.Children = rest;
  }
  if (isPlainObject(sections.Scripts)) {
    const { scripts: _held, ...rest } = sections.Scripts;
    sections.Scripts = rest;
  }
  return formatJson(holdBackData({ ...control, _children: sections }).value, { width: TEXT_WIDTH });
}

// What the panel's controls between them already use that is not in their defaults, as patterns
// (documentShape.unknownKeys). A key typed into one control that another already has is real.
const vocabularies = new WeakMap();
function panelVocabulary(controls) {
  if (!Array.isArray(controls)) return new Set();
  let known = vocabularies.get(controls);
  if (!known) {
    known = new Set();
    const visit = (list) => {
      for (const control of list) {
        for (const key of unknownKeys(controlForm(control))) known.add(key.pattern);
        visit(childControls(control));
      }
    };
    visit(controls);
    vocabularies.set(controls, known);
  }
  return known;
}

function parseText(text, result) {
  try {
    return { value: JSON.parse(text) };
  } catch {
    const err = jsonSyntaxError(text);
    result.errors.push(err ? { message: err.message, line: err.line, col: err.col } : { message: 'The text is not JSON.' });
    return null;
  }
}

// The document check's lines, said of the item: "controls/0/_children/Transform: …" is "Transform: …".
function schemaErrors(lines, prefix) {
  return lines.map((line) => {
    const at = line.indexOf(': ');
    if (at < 0) return { message: line };
    const path = line.slice(0, at).replace(prefix, '').split('/').filter((part) => part && part !== '_children').join('.');
    return { message: `${path || 'The item'}: ${line.slice(at + 2)}` };
  });
}

function listWarnings(items, sentence, limit = 8) {
  if (!items.length) return [];
  const shown = items.slice(0, limit).map(sentence);
  return items.length > limit ? [...shown, `…and ${items.length - limit} more like that.`] : shown;
}

/**
 * Apply an edited control text to `control`. `panelControls` are the panel's controls, for names and
 * for what properties the panel already uses. Returns `{ ok, changed, control, errors, warnings }`:
 * `control` is the new control when `ok` (the very same object when nothing changed); `errors` are
 * `{ message, line?, col? }` and nothing is applied while there are any; `warnings` are sentences.
 */
export function applyControlFileText(text, control, { panelControls = [] } = {}) {
  const result = { ok: false, changed: false, control: null, errors: [], warnings: [] };
  const parsed = parseText(text, result);
  if (!parsed) return result;
  const sparse = parsed.value;
  if (!isPlainObject(sparse) || !isPlainObject(sparse._children)) {
    result.errors.push({ message: 'A control is an object with its sections under "_children".' });
    return result;
  }

  const { id, controlType: type, name: currentName = '' } = control._children.Core;
  const core = sparse._children.Core;
  if (!isPlainObject(core) || core.controlType !== type) {
    const now = isPlainObject(core) && core.controlType !== undefined ? `"${core.controlType}"` : 'missing';
    result.errors.push({ message: `"controlType" is ${now}, and this control is a ${type}: changing a control's type is a conversion, not an edit. Put "${type}" back.` });
  }
  if (!isPlainObject(core) || core.id !== id) {
    result.errors.push({ message: `The id ties this control's scripts, layers and snapshots to it, so it stays "${id}".` });
  }
  if (result.errors.length) return result;

  const sections = sparse._children;
  if (isPlainObject(sections.Children) && Object.hasOwn(sections.Children, '_children')) {
    delete sections.Children._children;
    result.warnings.push('A container\'s controls are items of their own in the outline: the "_children" written under Children was left out.');
  }
  if (isPlainObject(sections.Scripts) && Object.hasOwn(sections.Scripts, 'scripts')) {
    delete sections.Scripts.scripts;
    result.warnings.push('Scripts are edited on the script screens: the "scripts" written under Scripts was left out.');
  }
  const { kept } = holdBackData(controlForm(control));
  const form = putBackData(sparse, kept, result.warnings);
  const formCore = form._children.Core;

  // The name, as the inspector's rename decides it: blank is the type's name, a taken one gets _2.
  const requested = typeof formCore.name === 'string' ? formCore.name : '';
  if (requested !== currentName) {
    const names = collectControlNames(panelControls);
    names.delete(currentName);
    const applied = uniqueControlName(names, requested, type);
    if (applied !== requested) {
      result.warnings.push(requested.trim()
        ? `"${requested}" ${names.has(requested) ? 'is the name of another control' : 'cannot be a name as it is'}: this one is "${applied}".`
        : `A control needs a name: this one is "${applied}".`);
    }
    formCore.name = applied;
  }

  const check = validatePanelDocument({ formatVersion: PANEL_FORMAT_VERSION, controls: [form] });
  if (!check.ok) {
    result.errors.push(...schemaErrors(check.errors, /^controls\/0\/?/));
    return result;
  }

  // Held against the control's own first, which is cheap; the whole panel only for what is left, as
  // shrinking every control of GAIA to find its vocabulary is a third of a second.
  const own = new Set(unknownKeys(controlForm(control)).map((key) => key.pattern));
  let fresh = unknownKeys(form).filter((key) => !own.has(key.pattern));
  if (fresh.length) {
    const known = panelVocabulary(panelControls);
    fresh = fresh.filter((key) => !known.has(key.pattern));
  }
  result.warnings.push(...listWarnings(fresh, (key) =>
    `"${key.path}" is not a property a ${type} has by default, and no other control in this panel has it either. It is kept as written: check the spelling.`));

  let next = expandControl(restoreEntries(form));
  next = withHeldBack(next, control);
  next = keepUnchanged(next, control);
  result.ok = true;
  result.changed = next !== control;
  result.control = next;
  return result;
}

// The child controls and scripts the text held back, put back as they were: the same objects.
function withHeldBack(next, control) {
  const kids = control._children?.Children?._children;
  const scripts = control._children?.Scripts?.scripts;
  if (kids === undefined && scripts === undefined) return next;
  const sections = { ...next._children };
  if (kids !== undefined) sections.Children = { ...(sections.Children ?? control._children.Children), _children: kids };
  if (scripts !== undefined) sections.Scripts = { ...(sections.Scripts ?? control._children.Scripts), scripts };
  return { ...next, _children: sections };
}

// Every section the edit left as it was, the old object; nothing changed, the old control.
function keepUnchanged(next, control) {
  const sections = {};
  for (const [key, section] of Object.entries(next._children)) {
    const old = control._children?.[key];
    sections[key] = old !== undefined && jsonEqual(section, old) ? old : section;
  }
  const out = { ...next, _children: sections };
  return jsonEqual(out, control) ? control : out;
}

// ---- the panel's own settings ------------------------------------------------------------------------

const PANEL_HELD_BACK = new Set([
  'controls', 'drawings', 'formatVersion', 'documentForm', 'controlDefaults',
  'scripts', 'exportParameters', 'name', 'filePath', 'captureSession', 'notepad',
]);


// The panel's fields as its saved file writes them, the controls aside.
function savedFields(panel) {
  return JSON.parse(serializePanel({ ...panel, controls: [] }));
}

/**
 * The panel's settings as text: what differs from a new panel, its guid always. `{ text, heldBack }`.
 *
 * Compared as the file says it, with one turn: a setting the file leaves out when it is the file's
 * default (the control set, when it is the base one) can still differ from what a NEW panel starts
 * with (the set chosen in Settings). Such a setting is shown as what the panel actually has, so that
 * deleting its line does what deleting any line does: puts the new panel's value back.
 */
export function panelSettingsFileText(panel) {
  const saved = savedFields(panel);
  const defaults = savedFields(createPanel());
  const fields = panelFieldsFromDocument(saved, panel.controls);
  const defaultFields = panelFieldsFromDocument(defaults, []);
  const view = {};
  for (const key of new Set([...Object.keys(saved), ...Object.keys(defaults)])) {
    if (PANEL_HELD_BACK.has(key)) continue;
    const value = Object.hasOwn(saved, key) ? saved[key] : fields[key];
    const initial = Object.hasOwn(defaults, key) ? defaults[key] : defaultFields[key];
    if (value === undefined) continue;
    if (key === 'panelGuid' || !jsonEqual(value, initial)) view[key] = value;
  }
  const { value, kept } = holdBackData(view);
  return {
    text: formatJson(value, { width: TEXT_WIDTH }),
    heldBack: {
      scripts: Array.isArray(panel.scripts) ? panel.scripts.length : 0,
      notes: Array.isArray(panel.notepad?.notes) ? panel.notepad.notes.length : 0,
      exportParameters: Array.isArray(saved.exportParameters) ? saved.exportParameters.length : 0,
      capture: Boolean(panel.captureSession),
      data: kept.size,
    },
  };
}

/** Every panel setting, as its saved file writes them, the held-back ones aside: the reference. */
export function panelSettingsFullText(panel) {
  const saved = savedFields(panel);
  const view = Object.fromEntries(Object.entries(saved).filter(([key]) => !PANEL_HELD_BACK.has(key)));
  return formatJson(holdBackData(view).value, { width: TEXT_WIDTH });
}

const HELD_BACK_REASONS = {
  name: 'The name is the file\'s: rename the file to change it.',
  scripts: 'The panel\'s scripts are edited on the script screens.',
  exportParameters: 'The host parameter list is made from the controls on every save.',
  captureSession: 'An in-progress capture is the capture tool\'s.',
  notepad: 'The notes are edited in the notepad.',
};

/**
 * Apply edited panel settings to `panel`. Returns `{ ok, changed, updates, errors, warnings }`, where
 * `updates` are the panel fields that change, in the panel's own form, ready for updatePanel.
 */
export function applyPanelSettingsFileText(text, panel) {
  const result = { ok: false, changed: false, updates: null, errors: [], warnings: [] };
  const parsed = parseText(text, result);
  if (!parsed) return result;
  if (!isPlainObject(parsed.value)) {
    result.errors.push({ message: 'The panel settings are an object: { "setting": value, … }.' });
    return result;
  }
  if (parsed.value.panelGuid !== panel.panelGuid) {
    result.errors.push({ message: `"panelGuid" is this panel's identity to every plug-in exported from it, so it stays "${panel.panelGuid}".` });
    return result;
  }

  const typed = { ...parsed.value };
  for (const key of Object.keys(typed)) {
    if (!PANEL_HELD_BACK.has(key)) continue;
    delete typed[key];
    result.warnings.push(`"${key}" was left out. ${HELD_BACK_REASONS[key] ?? 'It is not a setting.'}`);
  }
  const blank = createPanel();
  const saved = savedFields(panel);
  const defaults = savedFields(blank);
  const { kept } = holdBackData(Object.fromEntries(Object.entries(saved).filter(([key]) => !PANEL_HELD_BACK.has(key))));
  const edited = putBackData(typed, kept, result.warnings);

  // The settings as the file would have them: what was typed, and the default for what was not.
  const keys = new Set([...Object.keys(saved), ...Object.keys(defaults), ...Object.keys(edited)].filter((key) => !PANEL_HELD_BACK.has(key)));
  const doc = {};
  for (const key of keys) {
    if (Object.hasOwn(edited, key)) doc[key] = edited[key];
    else if (Object.hasOwn(defaults, key)) doc[key] = defaults[key];
  }
  const check = validatePanelDocument({ ...doc, controls: [] });
  if (!check.ok) {
    result.errors.push(...schemaErrors(check.errors, /^$/));
    return result;
  }
  const fresh = Object.keys(edited).filter((key) => !Object.hasOwn(defaults, key) && !Object.hasOwn(saved, key));
  result.warnings.push(...listWarnings(fresh, (key) =>
    `"${key}" is not a panel setting a new panel has. It is kept as written: check the spelling.`));

  const fields = panelFieldsFromDocument(doc, panel.controls);
  const updates = {};
  for (const key of keys) {
    const value = Object.hasOwn(fields, key) ? fields[key] : Object.hasOwn(doc, key) ? doc[key] : blank[key];
    if (!jsonEqual(value, panel[key])) updates[key] = value;
  }
  result.ok = true;
  result.updates = updates;
  result.changed = Object.keys(updates).length > 0;
  return result;
}

// ---- the whole file, to read ----------------------------------------------------------------------

/** What the file's sections are called in the outline, where the key alone would not say. */
const SECTION_NAMES = {
  controls: 'Controls',
  scripts: 'Scripts',
  drawings: 'Shared drawings',
  exportParameters: 'Host parameters',
  notepad: 'Notes',
  layers: 'Layers',
  snapshots: 'Snapshots',
  deviceSession: 'Device session',
  captureSession: 'Capture in progress',
  cardPresets: 'Card presets',
  controlSets: 'Control sets',
  requiredProfiles: 'Required profiles',
};

/**
 * The whole file, laid out to read. `saved` is the document as Save writes it (stores/panels.js
 * serializePanelDocument: the string, or the object). Returns
 *   { text, lineCount, controls, sections, shortened }
 * where `controls` maps each control's id to the lines it spans ({ start, end }, from 1), wherever it
 * sits in the tree, `sections` lists the file's top-level objects and lists in order
 * ({ key, name, count, start, end }; `count` is how many entries a list or a map of objects has, else
 * null), and `shortened` is how many embedded values (images) show as a
 * placeholder: a 120 KB data: string is one line nobody can read, and longer than the rest of a
 * control put together.
 *
 * For reading only. An edit is made one item at a time, where it is checked (applyControlFileText);
 * the panel file view's "Edit this item" goes from here to there.
 */
export function wholeFileText(saved) {
  const doc = typeof saved === 'string' ? JSON.parse(saved) : saved;
  const { value, kept } = holdBackData(doc, SHORTENED_MARK);
  const controls = new Map();
  const sections = [];
  const lines = formatJsonLines(value, {
    width: TEXT_WIDTH,
    onNode(node, start, end, depth, key) {
      if (depth === 1) sections.push({ key, name: SECTION_NAMES[key] ?? key, count: entryCount(node), start, end });
      const id = node?._children?.Core?.id;
      if (node?._type === 'Control' && typeof id === 'string' && !controls.has(id)) controls.set(id, { start, end });
    },
  });
  return { text: lines.join('\n'), lineCount: lines.length, controls, sections, shortened: kept.size };
}

const entryCount = (node) => (Array.isArray(node) ? node.length
  : Object.values(node).every(isPlainObject) ? Object.keys(node).length : null);

/**
 * Which item of the whole file the given line (from 1) is in: the innermost control whose lines hold
 * it, else the file section, else the panel's own settings. `{ kind: 'control', id }`,
 * `{ kind: 'section', key, name }` or `{ kind: 'panel' }`.
 */
export function wholeFileItemAt(whole, line) {
  let best = null;
  for (const [id, span] of whole.controls) {
    if (span.start <= line && line <= span.end && (!best || span.start >= best.span.start)) best = { id, span };
  }
  if (best) return { kind: 'control', id: best.id };
  // What the panel settings text holds back (the controls list itself, scripts, shared drawings…)
  // is no item of its own; everything else at the top of the file is a panel setting.
  const section = whole.sections.find((s) => s.start <= line && line <= s.end);
  if (section && PANEL_HELD_BACK.has(section.key)) return { kind: 'section', key: section.key, name: section.name };
  return { kind: 'panel' };
}
