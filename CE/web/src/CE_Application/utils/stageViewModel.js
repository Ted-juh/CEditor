/**
 * Read-only projections for the dedicated Stage workspace.
 *
 * The performance engine and rack remain authoritative. These helpers only decide what a
 * player needs to see at once: where the setlist is, and which eight controls the CTRL49 is
 * currently presenting. Keeping that arithmetic outside the component makes boundary cases
 * (an unstarted setlist, a removed page, fewer than eight assignments) cheap to test.
 */

const EMPTY_SLOT = Object.freeze({
  slotId: '', displayName: '', partName: '', value: 0, valueText: '',
  assigned: false, resolved: false,
});

export function stageSetlistContext(performance = {}) {
  const items = Array.isArray(performance?.setlist?.items) ? performance.setlist.items : [];
  const rawIndex = Number(performance?.setlist?.currentIndex ?? -1);
  const currentIndex = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < items.length
    ? rawIndex : -1;

  return {
    items,
    currentIndex,
    current: currentIndex >= 0 ? items[currentIndex] : null,
    previous: currentIndex > 0 ? items[currentIndex - 1] : null,
    next: currentIndex >= 0 ? items[currentIndex + 1] ?? null : items[0] ?? null,
    canPrevious: currentIndex > 0,
    canNext: items.length > 0 && currentIndex < items.length - 1,
    loadingIndex: Number(performance?.setlist?.loadingIndex ?? -1),
  };
}

function eight(entries) {
  return Array.from({ length: 8 }, (_, index) => entries[index] ?? { ...EMPTY_SLOT, index });
}

/** Returns the control whose live value changed between two state pushes. This supplies a
 * short movement pulse without inventing a permanent "touched" state: the native service
 * already publishes each slot's real value and text. */
export function changedSurfaceSlot(previous = [], current = []) {
  const count = Math.min(8, previous.length, current.length);
  for (let index = 0; index < count; index += 1) {
    const before = previous[index];
    const after = current[index];
    if (!before?.assigned || !after?.assigned || before.slotId !== after.slotId) continue;
    if (Number(before.value ?? 0) !== Number(after.value ?? 0)
        || String(before.valueText ?? '') !== String(after.valueText ?? '')) return index;
  }
  return -1;
}

/** Finds the visible slot driven by a generic learned MIDI message. The dedicated CTRL49
 * broker reports its encoders directly, while described faders, pads and other controllers
 * arrive through the ordinary MIDI activity stream. Both paths feed the same Stage cue. */
export function surfaceSlotForMidiActivity(entries = [], activity = {}) {
  const cc = Number.isInteger(activity?.cc) ? activity.cc : -1;
  const note = Number.isInteger(activity?.note) ? activity.note : -1;
  if (cc < 0 && note < 0) return -1;
  return entries.slice(0, 8).findIndex((entry) => entry?.assigned
    && (entry.midiChannel === 0 || entry.midiChannel === activity.channel)
    && ((cc >= 0 && entry.midiCc === cc) || (note >= 0 && entry.midiNote === note)));
}

/** Mirrors the broker's four-page rule: up to three rack-control pages, then Performance. */
export function stageSurfaceModel(rack = {}, performance = {}, surface = {}) {
  const controlPages = (Array.isArray(rack.pages) ? rack.pages : []).slice(0, 3);
  const pageCount = controlPages.length + 1;
  const requested = Number(surface.pageIndex ?? 0);
  const pageIndex = Math.max(0, Math.min(pageCount - 1,
    Number.isInteger(requested) ? requested : 0));

  if (pageIndex < controlPages.length) {
    const page = controlPages[pageIndex];
    return {
      type: 'controls',
      name: page.name || `Controls ${pageIndex + 1}`,
      pageIndex,
      pageCount,
      activeSlot: Math.max(0, Math.min(7, Number(surface.activeSlot ?? 0) || 0)),
      entries: eight(Array.isArray(page.slots) ? page.slots : []),
    };
  }

  const showingScenes = Number(surface.padBank ?? 0) === 1;
  const source = showingScenes
    ? (Array.isArray(performance.scenes) ? performance.scenes : [])
    : (Array.isArray(performance.clips) ? performance.clips : []);

  return {
    type: 'performance',
    name: showingScenes ? 'Scenes' : 'Clips',
    pageIndex,
    pageCount,
    activeSlot: Math.max(0, Math.min(7, Number(surface.activeSlot ?? 0) || 0)),
    entries: eight(source.slice(0, 8).map((entry, index) => ({
      ...EMPTY_SLOT,
      index,
      slotId: entry.sceneId || entry.clipId || `performance-${index + 1}`,
      displayName: entry.name || (showingScenes ? `Scene ${index + 1}` : `Clip ${index + 1}`),
      value: Number(entry.phase ?? 0),
      valueText: entry.pending ? 'waiting' : entry.active ? 'playing' : '',
      assigned: true,
      resolved: true,
      active: entry.active === true,
      pending: entry.pending === true,
    }))),
  };
}
