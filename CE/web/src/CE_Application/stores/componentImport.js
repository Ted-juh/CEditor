// componentImport.js — File › Import Component…, and a component file dropped on the window.
//
// A component file (`*.ceditor-component.json`, or a library file holding several) could only be
// brought in from Publish › Package & Library: a "paste package or library JSON" box and a File
// button, inside the Component Designer of some other component. Nothing in the File menu took one,
// and a file dropped on the window was not looked at. Now either goes into the component library,
// and a single component opens in the Component Designer to be changed and exported again.

import { customComponentLibrary } from './customComponentLibrary.js';
import { openComponentLibraryEntry } from './recentFileActions.js';
import { normalizeCustomComponentEnvelope, normalizeCustomComponentLibraryEnvelope } from '../utils/customComponentPackage.js';
import { notify } from './scriptUi.js';

/** The packages in a file's text: one component, or every component of a library file. */
export function componentPackagesFromText(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return { envelopes: [], error: 'The file is empty.' };
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { envelopes: [], error: 'It is not JSON.' };
  }
  const library = normalizeCustomComponentLibraryEnvelope(parsed);
  const envelopes = library?.packages ?? [normalizeCustomComponentEnvelope(parsed)].filter(Boolean);
  return envelopes.length ? { envelopes, error: '' } : { envelopes: [], error: 'It holds no CEditor component.' };
}

/**
 * Put the components in `text` into the library. One component also opens in the Component
 * Designer; several are listed in the library (Insert › Saved packages). Returns what was kept.
 */
export function importComponentText(text, fileName = '') {
  const label = fileName || 'That file';
  const { envelopes, error } = componentPackagesFromText(text);
  if (!envelopes.length) {
    notify(`${label} is not a component file. ${error}`, { kind: 'warn' });
    return { ok: false, imported: [], failures: [] };
  }
  const { imported, failures } = customComponentLibrary.importEnvelopes(envelopes);
  if (imported.length === 1 && envelopes.length === 1) {
    const [entry] = imported;
    openComponentLibraryEntry(entry);
    notify(`Imported ${entry.name} ${entry.version} into your library, and opened it in the Component Designer.`);
  } else if (imported.length) {
    notify(`Imported ${imported.length} component${imported.length === 1 ? '' : 's'} into your library.`
      + (failures.length ? ` ${failures.length} could not be: ${failures[0].name}, ${failures[0].reason}.` : ''),
      failures.length ? { kind: 'warn' } : undefined);
  } else {
    const [first] = failures;
    notify(`${label} was not imported: ${first ? `${first.name}, ${first.reason}` : 'the library did not take it'}.`, { kind: 'warn' });
  }
  return { ok: imported.length > 0, imported, failures };
}

/** Read a chosen or dropped file and import it. */
export async function importComponentFile(file) {
  if (!file) return { ok: false, imported: [], failures: [] };
  const text = typeof file.text === 'function' ? await file.text() : '';
  return importComponentText(text, file.name);
}

/** File › Import Component…: the system's file picker, for component and library files. */
export function importComponentFromFile() {
  if (typeof document === 'undefined') return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => { importComponentFile(input.files?.[0]); };
  input.click();
}

/** Whether a dragged or dropped file could be one: JSON, by name or type. */
export function mayBeComponentFile(file) {
  return /\.json$/i.test(String(file?.name ?? '')) || String(file?.type ?? '') === 'application/json';
}
