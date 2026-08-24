// guidRegistry.js — which plugin identity an export claims, and whether that is a problem.
//
// The export pipeline's D1 has two halves. The first — deriving a unique plugin code, AU subtype
// and CLAP id from a GUID — shipped and is verified against the C++ in `PanelExportIdentity.h`. The
// second is this: mint a GUID once, remember which panel it belongs to, and ask before an export
// takes over an identity that is already somebody's.
//
// THE COLLISION IS NOT TWO PANELS PICKING THE SAME RANDOM GUID — that will not happen. It is a
// panel FILE being copied. Duplicate a .cepanel to start a variant, edit it, export it, and it
// exports the ORIGINAL plugin's identity: the DAW sees one plugin, the new build silently replaces
// the old one in every project that loaded it, and nothing at any point looks wrong. The registry
// exists so that moment can be recognised and asked about.
//
// Hence the vocabulary, which is the plan's: UPDATE this plugin (reuse the GUID — a new build of
// the same thing) versus NEW COPY (mint a fresh GUID — an independent plugin that can sit beside
// the first in a DAW).
//
// PURE. The registry is a plain record; the store persists it and the Export tab renders it.

/** A registry entry. `panelId` is the in-session id, `panelPath` the file it was saved from. */
export function registryEntry({ guid = '', panelId = '', panelPath = '', productName = '', at = '' } = {}) {
  return {
    guid: String(guid || ''),
    panelId: String(panelId || ''),
    panelPath: String(panelPath || ''),
    productName: String(productName || ''),
    at: String(at || ''),
  };
}

/** Look a GUID up. Returns null when nothing has claimed it. */
export function ownerOf(registry, guid) {
  const id = String(guid || '');
  if (!id) return null;
  return (Array.isArray(registry) ? registry : []).find((entry) => entry.guid === id) ?? null;
}

/**
 * What exporting this panel would do to the plugin identity.
 *
 * Four answers, and the third is the one the whole registry is for:
 *
 *   `mint`    — no GUID yet. First export; nothing to ask.
 *   `update`  — the GUID is this panel's. A new build of the same plugin, which is the normal case
 *               and must not prompt: an export that asks a question every time is an export people
 *               stop reading.
 *   `ask`     — the GUID belongs to a DIFFERENT panel file. Almost always a copied .cepanel, and
 *               the one case where a silent answer is wrong in both directions: reusing it replaces
 *               somebody's plugin, minting a new one abandons an identity they may have meant to
 *               keep.
 *   `adopt`   — the GUID is not in the registry at all. A panel from somebody else, or a registry
 *               that was cleared. Recorded rather than questioned: there is no local plugin to
 *               collide with, so there is nothing to decide.
 */
export function identityDecision({ panel = null, registry = [] } = {}) {
  const guid = String(panel?.panelGuid ?? '');
  if (!guid) return { action: 'mint', guid: '', reason: 'this panel has no plugin identity yet' };

  const owner = ownerOf(registry, guid);
  if (!owner) {
    return {
      action: 'adopt',
      guid,
      reason: 'this identity is not in the local registry — nothing here can collide with it',
    };
  }

  const samePanel = owner.panelId === String(panel?.id ?? '')
    || (owner.panelPath && owner.panelPath === String(panel?.filePath ?? ''));
  if (samePanel) {
    return { action: 'update', guid, owner, reason: 'a new build of this panel\'s own plugin' };
  }

  // WHY IT COULD NOT MATCH, and the honest answer is not always "you copied this".
  //
  // `panelId` is a session counter — `deserializePanel` hands out a fresh one on every load — so
  // after a restart the only evidence left is the file path. Three shapes reach here and they are
  // genuinely different situations, even though `ask` is the right answer to all three: the
  // registry cannot tell a MOVED original from a COPY, and guessing either way is wrong in a way
  // somebody only finds out when their plugin is replaced.
  //
  // So it asks in all three cases and says which one it is looking at. "Almost certainly copied"
  // told to somebody who has simply renamed their file is a wrong explanation of a right question,
  // and it sends them hunting for a duplicate that does not exist.
  const owned = owner.productName || owner.panelPath || owner.panelId;
  const here = String(panel?.filePath ?? '');
  const why = !owner.panelPath
    ? 'that claim was recorded before the panel had been saved anywhere, so there is no path to '
      + 'compare — this may well be the same panel'
    : !here
      ? 'this panel has not been saved yet, so there is no path to compare it against'
      : 'almost certainly the panel this one was copied from — or this one, moved or renamed since '
        + 'it was last exported';

  return {
    action: 'ask',
    guid,
    owner,
    // Named, because "there is a conflict" sends somebody looking through every panel they have
    // open, and the answer is nearly always "the file you copied this from".
    reason: `this identity already belongs to ${owned} — ${why}`,
  };
}

/**
 * Record an export.
 *
 * Replaces any entry for the same GUID rather than appending: the registry answers "who owns this
 * identity", which has exactly one answer, and a growing list of stale claims would make the
 * question unanswerable.
 */
export function recordExport(registry, entry) {
  const record = registryEntry(entry);
  if (!record.guid) return Array.isArray(registry) ? [...registry] : [];
  return [...(Array.isArray(registry) ? registry : []).filter((e) => e.guid !== record.guid), record];
}

/** Forget an identity. For a panel that was deleted, or a registry being cleaned up. */
export function forgetIdentity(registry, guid) {
  const id = String(guid || '');
  return (Array.isArray(registry) ? registry : []).filter((entry) => entry.guid !== id);
}

/**
 * Panels currently open that share a plugin identity.
 *
 * Found without exporting anything, so a copied panel can be spotted before the build rather than
 * at the confirm modal — which is the difference between a warning and an interruption.
 */
export function openPanelCollisions(panels) {
  const byGuid = new Map();
  for (const panel of panels ?? []) {
    const guid = String(panel?.panelGuid ?? '');
    if (!guid) continue;
    const bucket = byGuid.get(guid) ?? [];
    bucket.push({ id: String(panel.id ?? ''), name: String(panel.name ?? panel.id ?? ''), filePath: panel.filePath ?? null });
    byGuid.set(guid, bucket);
  }
  return [...byGuid.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([guid, panels_]) => ({ guid, panels: panels_ }));
}

/**
 * A fresh identity for a panel that is becoming its own plugin.
 *
 * `makeGuid` is injected rather than imported so this file stays pure and a test can pin the
 * result. The panel is returned patched rather than mutated, because the caller has to put it
 * through the store's update path for undo to see it.
 */
export function newCopyIdentity(panel, makeGuid) {
  const guid = String(makeGuid());
  return {
    panelGuid: guid,
    // The plugin name has to change too, or two independent plugins arrive in the DAW's list under
    // one name and the user cannot tell them apart — which defeats the point of the fresh GUID.
    exportSettings: {
      ...(panel?.exportSettings ?? {}),
      pluginName: nextCopyName(panel?.exportSettings?.pluginName || panel?.name || 'CEditor Panel'),
    },
  };
}

/** "Bass Station" → "Bass Station 2" → "Bass Station 3". */
export function nextCopyName(name) {
  const text = String(name ?? '').trim() || 'CEditor Panel';
  const match = text.match(/^(.*?)\s+(\d+)$/);
  if (match) return `${match[1]} ${Number(match[2]) + 1}`;
  return `${text} 2`;
}
