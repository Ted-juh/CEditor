// panelComponentPackages.js — the library components a panel's copies came from, so that a shared
// panel brings them along.
//
// A custom component placed from the library is a linked copy: it holds its whole design and works
// anywhere, and `Designer.sourcePackage` names the package it was placed from. What the copy cannot
// do on its own is the library's half — "Update 30 other copies", "Save to library as 1.1.0", and
// placing one more from the Library dock. On a computer whose library lacks the package, the Source
// card says "Not in this library", and the panel's author had to send the library file beside the
// package for the link to come back.
//
// So File → Share Panel carries, beside the panel, each package a copy was placed from (the exact
// version, found by fingerprint), and opening the shared panel adds the ones the library lacks.
// Never over one the library already holds under the same name and version with a different
// design: that is the recipient's own work, the shared copies are compared against it, and the
// difference is reported rather than settled by overwriting it.

import { flatControls } from './containment.js';
import { customComponentPackageId, normalizeCustomComponentEnvelope } from './customComponentPackage.js';
import { findSourceEntries } from './customComponentSourceLink.js';

const labelOf = (name, version) => `${String(name ?? '').trim() || 'Component'} ${String(version ?? '').trim()}`.trim();

/**
 * The library packages a panel's copies were placed from.
 *
 * `envelopes`: one per package version used, in the order the panel first uses them.
 * `notInLibrary`: copies placed from a package this library does not hold (by name and version),
 * which a share cannot carry; the copies still work, as they did before packages travelled.
 */
export function panelComponentPackages(panel, libraryEntries = []) {
  const carried = new Map();
  const notInLibrary = new Map();
  for (const control of flatControls(panel?.controls ?? [])) {
    if (control?._children?.Core?.controlType !== 'CustomComponent') continue;
    const source = findSourceEntries(control, libraryEntries);
    if (!source.linked) continue;
    if (source.base?.envelope) {
      carried.set(source.base.id, source.base.envelope);
    } else {
      const recorded = control._children.Designer?.sourcePackage ?? {};
      notInLibrary.set(source.packageId, labelOf(recorded.name ?? source.packageId, recorded.version));
    }
  }
  return { envelopes: [...carried.values()], notInLibrary: [...notInLibrary.values()] };
}

/**
 * What opening a shared panel should do with the packages it carries.
 *
 * `add`: envelopes the library lacks. `present`: already there, the same design. `conflicting`:
 * the library holds a package of that name and version with a different design, and keeps it.
 * Envelopes that do not read as a package are left out.
 */
export function componentPackagesToAdd(envelopes, libraryEntries = []) {
  const held = new Map((Array.isArray(libraryEntries) ? libraryEntries : []).map((entry) => [entry.id, entry]));
  const add = [];
  const present = [];
  const conflicting = [];
  const seen = new Set();
  for (const value of Array.isArray(envelopes) ? envelopes : []) {
    const envelope = normalizeCustomComponentEnvelope(value);
    if (!envelope) continue;
    const id = customComponentPackageId(envelope);
    if (seen.has(id)) continue;
    seen.add(id);
    const label = labelOf(envelope.metadata.name, envelope.metadata.version);
    const have = held.get(id);
    if (!have) add.push(envelope);
    else if (have.fingerprint === envelope.fingerprint) present.push(label);
    else conflicting.push(label);
  }
  return { add, present, conflicting };
}
