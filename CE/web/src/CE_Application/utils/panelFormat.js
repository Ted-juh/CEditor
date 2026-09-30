/**
 * panelFormat.js — the .cepanel format version, the migrations between versions, and the check
 * that a document is shaped like a panel before anything reads it.
 *
 * VERSIONS. A document carries `formatVersion`. One without it predates the field and is version 1.
 * `PANEL_FORMAT_VERSION` is what this build writes. Opening runs every migration from the document's
 * version up to it, in order, once — MIGRATIONS[n] takes a version-n document to n+1. Before this,
 * conversions ran on every load whatever the document's age (a dotted-names check on every open of
 * every panel, forever) and there was no way to tell a converted document from an old one, or to
 * know that a document came from a newer CEditor at all.
 *
 * Adding one: bump PANEL_FORMAT_VERSION and register the step under the OLD number. A step gets a
 * deep copy of a document of exactly that version, in document form (sparse controls — see
 * stores/documentShape.js), and returns the next version's document. Steps are for changes of
 * MEANING. A missing field that has an obvious default is not a migration; the loader's
 * normalisers already cover that for every version (layers, card presets, control sets), because
 * a hand-edited or generated file of any version can be missing one.
 *
 * NEWER DOCUMENTS open, with a warning: unknown keys are kept as they are and written back on save,
 * but a newer version may have changed the meaning of a key this build does understand.
 *
 * VALIDATION runs before migrating, against utils/panelDocumentSchema.js through a validator
 * compiled at build time (scripts/generate-panel-validator.mjs). A document that fails is refused
 * with the paths of what is wrong.
 */
import { validate as validatePanelSchema } from '../generated/panelDocumentValidator.js';
import { deepClone } from './deepClone.js';
import { migrateDottedControlNames } from './controlNames.js';

export const PANEL_FORMAT_VERSION = 2;

const MIGRATIONS = {
  // 1 -> 2: control names lost their dots, and every reference that addresses a control by name
  // was converted with them (utils/controlNames.js has the reasoning and the list).
  1: (doc) => migrateDottedControlNames(doc),
};

/** The format version a document says it is. No field, or nonsense in it, reads as 1. */
export function panelFormatVersion(doc) {
  const version = Number(doc?.formatVersion);
  return Number.isInteger(version) && version >= 1 ? version : 1;
}

/**
 * Upgrade a document to PANEL_FORMAT_VERSION. Returns
 * `{ doc, fromVersion, toVersion, applied, changed, warnings }`, where `doc` is the input when no
 * step changed anything and a new object otherwise (the input is never mutated), `applied` lists
 * the steps that ran, and `changed` says whether any of them changed the document's content — a
 * document stamped with a newer number but otherwise identical is not "modified" to the person who
 * opened it.
 */
export function migratePanelDocument(doc, { migrations = MIGRATIONS, target = PANEL_FORMAT_VERSION } = {}) {
  const fromVersion = panelFormatVersion(doc);
  const result = { doc, fromVersion, toVersion: fromVersion, applied: [], changed: false, warnings: [] };
  if (fromVersion > target) {
    result.warnings.push(`This panel was saved by a newer CEditor (format ${fromVersion}; this one reads up to ${target}). `
      + 'It opens, but anything the newer version added may not work here.');
    return result;
  }
  let current = doc;
  let version = fromVersion;
  while (version < target) {
    const step = migrations[version];
    if (step) {
      const next = step(current === doc ? deepClone(doc) : current);
      // A step that changed nothing leaves the input as it was, so an old document that needed no
      // conversion is still the object the caller passed in.
      if (next && next !== current && JSON.stringify(next) !== JSON.stringify(current)) {
        result.changed = true;
        current = next;
      }
      result.applied.push(version);
    }
    version += 1;
  }
  result.doc = current;
  result.toVersion = version;
  return result;
}

/** Ajv's error list as short, readable lines: "controls/3/_type: must be string". */
export function describeSchemaErrors(errors, limit = 8) {
  const lines = (errors ?? []).map((error) => {
    const at = error.instancePath ? error.instancePath.replace(/^\//, '').replace(/~1/g, '/').replace(/~0/g, '~') : '(document)';
    let message = error.message ?? 'is invalid';
    if (error.keyword === 'required') message = `is missing "${error.params?.missingProperty}"`;
    else if (error.keyword === 'pattern' && error.params?.pattern === '\\S') message = 'must not be empty';
    else if (error.keyword === 'pattern' && error.params?.pattern === '^data:') message = 'must be a data: URL';
    return `${at}: ${message}`;
  });
  const unique = [...new Set(lines)];
  if (unique.length <= limit) return unique;
  return [...unique.slice(0, limit), `…and ${unique.length - limit} more`];
}

/** `{ ok, errors }` for a document (already parsed). `errors` are readable lines, empty when ok. */
export function validatePanelDocument(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, errors: ['(document): is not a panel — expected a JSON object'] };
  }
  const ok = validatePanelSchema(doc);
  return { ok: Boolean(ok), errors: ok ? [] : describeSchemaErrors(validatePanelSchema.errors) };
}

/**
 * Parse, migrate and check a .cepanel's text. Returns `{ doc, migration, error }`: `doc` is the
 * migrated document or null, and `error` is a sentence for a person when it is null.
 */
export function readPanelDocument(json) {
  let data;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json;
  } catch (error) {
    return { doc: null, migration: null, error: `the file is not valid JSON (${error.message})` };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { doc: null, migration: null, error: 'the file does not contain a panel document' };
  }
  // Checked before migrating, so a step can rely on the basic shape (controls is a list of objects,
  // and so on) instead of each one defending itself against a broken file. The schema is loose
  // enough to describe every version so far; a future step that changes a checked shape checks
  // its own input.
  const check = validatePanelDocument(data);
  if (!check.ok) {
    return { doc: null, migration: null, error: `the document is not a valid panel: ${check.errors.join('; ')}` };
  }
  let migration;
  try {
    migration = migratePanelDocument(data);
  } catch (error) {
    return { doc: null, migration: null, error: `the document could not be converted from format ${panelFormatVersion(data)} (${error.message})` };
  }
  return { doc: migration.doc, migration, error: null };
}
