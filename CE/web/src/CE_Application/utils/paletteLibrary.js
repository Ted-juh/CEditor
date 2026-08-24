/**
 * Named swatch palettes — the pure data model behind the 24-cell grid.
 *
 * The grid was persisted but anonymous and singular: one bag of 24 colours,
 * no name, nowhere to put a second set. That is a scratchpad, not a palette
 * library — the moment you need the client's brand colours AND the dark-theme
 * greys, one of them has to be thrown away.
 *
 * Everything here is immutable: each operation returns a new library object,
 * so the store can diff and persist without worrying about who else is holding
 * the array. Colours are 6-char uppercase RRGGBB or null for an empty cell —
 * the same slot shape the grid has always used, so the flat 24-entry array an
 * older build persisted still loads (see `normalizeLibrary`).
 */

export const PALETTE_SIZE = 24;

let idCounter = 0;

function nextId() {
  idCounter += 1;
  return `pal${idCounter}_${Date.now().toString(36)}`;
}

/** 24 empty slots. */
export function emptyColors() {
  return Array(PALETTE_SIZE).fill(null);
}

/** Coerce anything to exactly PALETTE_SIZE valid slots. */
export function normalizeColors(raw) {
  const out = emptyColors();
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const value = String(raw[i] ?? '').replace(/^#/, '').toUpperCase();
    out[i] = /^[0-9A-F]{6}$/.test(value) ? value : null;
  }
  return out;
}

export function makePalette(name, colors, id = nextId()) {
  return {
    id: id || nextId(),
    name: String(name || 'Palette').slice(0, 40),
    colors: normalizeColors(colors),
  };
}

/** A name not already taken — "Palette", "Palette 2", "Palette 3"… */
export function uniquePaletteName(existingNames, base = 'Palette') {
  const taken = new Set((existingNames ?? []).map((n) => String(n)));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

/**
 * Accepts a well-formed library, the older bare array of 24 colours, or
 * nothing. Always returns a library with at least one palette and an
 * `activeId` that exists — every consumer may assume both.
 */
export function normalizeLibrary(raw) {
  if (Array.isArray(raw)) {
    // Migration from `ce.displayPanel.swatches`: one unnamed bag becomes the
    // first named palette rather than being discarded.
    const first = makePalette('Palette', raw);
    return { activeId: first.id, palettes: [first] };
  }

  const source = Array.isArray(raw?.palettes) ? raw.palettes : [];
  const palettes = source
    .filter((p) => p && typeof p === 'object')
    .map((p) => makePalette(p.name, p.colors, typeof p.id === 'string' ? p.id : ''));

  if (!palettes.length) {
    const first = makePalette('Palette', null);
    return { activeId: first.id, palettes: [first] };
  }

  const activeId = palettes.some((p) => p.id === raw?.activeId) ? raw.activeId : palettes[0].id;
  return { activeId, palettes };
}

export function activePalette(lib) {
  return lib.palettes.find((p) => p.id === lib.activeId) ?? lib.palettes[0];
}

export function setActivePalette(lib, id) {
  if (!lib.palettes.some((p) => p.id === id)) return lib;
  return { ...lib, activeId: id };
}

/** Add a palette and make it active. `colors` seeds it (e.g. "duplicate"). */
export function addPalette(lib, name, colors = null) {
  const created = makePalette(
    uniquePaletteName(lib.palettes.map((p) => p.name), name || 'Palette'),
    colors,
  );
  return { activeId: created.id, palettes: [...lib.palettes, created] };
}

/** Rename. An empty name is refused rather than stored — a nameless palette is what we came from. */
export function renamePalette(lib, id, name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return lib;
  return {
    ...lib,
    palettes: lib.palettes.map((p) => (p.id === id ? { ...p, name: trimmed.slice(0, 40) } : p)),
  };
}

/**
 * Delete. The last palette is never deleted — the grid has to show something,
 * and "delete then find the app has no swatches at all" is a worse surprise
 * than a refusal. Deleting the active palette activates its neighbour.
 */
export function deletePalette(lib, id) {
  if (lib.palettes.length <= 1) return lib;
  const index = lib.palettes.findIndex((p) => p.id === id);
  if (index < 0) return lib;

  const palettes = lib.palettes.filter((p) => p.id !== id);
  const activeId = lib.activeId === id
    ? palettes[Math.min(index, palettes.length - 1)].id
    : lib.activeId;
  return { activeId, palettes };
}

/** Write a full 24-slot colour array into one palette. */
export function setPaletteColors(lib, id, colors) {
  const normalized = normalizeColors(colors);
  return {
    ...lib,
    palettes: lib.palettes.map((p) => (p.id === id ? { ...p, colors: normalized } : p)),
  };
}

/** Do these two slot arrays say the same thing? Used to skip no-op writes. */
export function sameColors(a, b) {
  const left = normalizeColors(a);
  const right = normalizeColors(b);
  return left.every((value, i) => value === right[i]);
}
