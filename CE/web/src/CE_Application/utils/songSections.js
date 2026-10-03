/**
 * A song's sections, read and dragged: the numbers the Songs page draws and the gestures it
 * turns into commands, kept out of the component so they are tested rather than eyeballed.
 */

/** One colour per scene, by its place in the scene list; the Launcher and the song timeline
 * use the same one, so a scene looks the same wherever it appears. */
export const SCENE_COLOURS = ['#d98b3a', '#4f9fd6', '#9a7ad6', '#52b58a', '#d6698f', '#c9b24a', '#4fc1c9', '#8c9aa8'];
export const sceneColour = (index) => (index >= 0 ? SCENE_COLOURS[index % SCENE_COLOURS.length] : '#56616c');

export const totalBars = (sections = []) => sections.reduce((sum, section) => sum + (Number(section.bars) || 0), 0);

/** Bars after dragging a section's right edge by `dx` pixels, at `pxPerBar` fixed when the drag
 * began (the blocks resize under the pointer, so the scale must not). 1..128, whole bars. */
export function barsFromDrag(startBars, dx, pxPerBar) {
  const scale = pxPerBar > 0 ? pxPerBar : 1;
  return Math.max(1, Math.min(128, Math.round(Number(startBars) + (Number(dx) || 0) / scale)));
}

/** Where a dragged item lands: the index among `midpoints` (the other items' centres, in order)
 * that the pointer has passed. Works for a vertical list or a horizontal strip alike. */
export function dropIndex(midpoints, position, fromIndex) {
  let index = 0;
  for (const midpoint of midpoints) if (position > midpoint) index += 1;
  // Passing its own centre is not a move.
  return fromIndex < index ? Math.max(0, index - 1) : index;
}

/** The one line under a song's name in the set: its sections and length, or the scene it plays. */
export function songSummary(song, sceneName = '') {
  const parts = [];
  const sections = song?.sections ?? [];
  if (sections.length > 0) parts.push(`${sections.length} ${sections.length === 1 ? 'section' : 'sections'} · ${totalBars(sections)} bars`);
  else if (sceneName) parts.push(`plays ${sceneName}`);
  else parts.push('no scene yet');
  if (song?.plannedSeconds > 0) parts.push(`${Math.floor(song.plannedSeconds / 60)}:${String(song.plannedSeconds % 60).padStart(2, '0')}`);
  if (song?.tempo > 0) parts.push(`${Math.round(song.tempo)} BPM`);
  return parts.join(' · ');
}

/** The bar numbers a ruler marks across `total` bars: every 4 up to 32 bars, then every 8, 16. */
export function rulerMarks(total) {
  const bars = Math.max(1, Number(total) || 0);
  const step = bars <= 32 ? 4 : bars <= 96 ? 8 : 16;
  const marks = [];
  for (let bar = 1; bar <= bars; bar += step) marks.push(bar);
  return { step, marks };
}
