/**
 * The stage screen's clocks, song blocks and trouble: pure readings of the performance state,
 * so the arithmetic a player trusts in the middle of a set is tested rather than eyeballed.
 */

/** m:ss, or h:mm:ss past an hour. Negative durations read as 0:00. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** How the song and the set stand against their plan. `ahead` is milliseconds the set is ahead
 * of plan (negative = behind), known only when every song before this one has a planned length. */
export function stageTimers(setlist = {}, now = Date.now()) {
  const items = Array.isArray(setlist.items) ? setlist.items : [];
  const index = Number(setlist.currentIndex ?? -1);
  const setStarted = Number(setlist.startedAtMs) || 0;
  const songStarted = Number(setlist.songStartedAtMs) || 0;
  const current = index >= 0 ? items[index] ?? null : null;
  const plannedMs = current && current.plannedSeconds > 0 ? current.plannedSeconds * 1000 : 0;
  const songMs = current && songStarted > 0 ? Math.max(0, now - songStarted) : 0;
  const before = items.slice(0, Math.max(0, index));
  const planKnown = index >= 0 && setStarted > 0 && songStarted > 0 && before.every((item) => item.plannedSeconds > 0);
  const plannedToHere = before.reduce((sum, item) => sum + (item.plannedSeconds || 0) * 1000, 0);
  return {
    setMs: setStarted > 0 ? Math.max(0, now - setStarted) : 0,
    songMs,
    plannedMs,
    songLeftMs: plannedMs > 0 ? plannedMs - songMs : 0,
    over: plannedMs > 0 && songMs > plannedMs,
    ahead: planKnown ? plannedToHere - (songStarted - setStarted) : null,
    totalPlannedMs: items.length > 0 && items.every((item) => item.plannedSeconds > 0)
      ? items.reduce((sum, item) => sum + item.plannedSeconds * 1000, 0) : 0,
  };
}

/** The arrangement as blocks for the stage: done, the one playing (with how far into it), the
 * one queued, and the bars left in the current block. Empty when no arrangement is running. */
export function arrangementBlocks(arrangement = {}) {
  const items = Array.isArray(arrangement.items) ? arrangement.items : [];
  if (!arrangement.playing || items.length === 0) return { playing: false, blocks: [], bar: 0, barsLeft: 0, nextName: '' };
  const current = Number(arrangement.currentIndex ?? -1);
  const queued = Number(arrangement.queuedIndex ?? -1);
  const blocks = items.map((item, index) => ({
    itemId: item.itemId,
    name: item.name || item.sceneName || `Block ${index + 1}`,
    bars: item.bars,
    state: index === current ? 'now' : index === queued ? 'queued' : index < current ? 'done' : 'later',
    progress: index === current ? Math.max(0, Math.min(1, Number(arrangement.progress) || 0)) : index < current ? 1 : 0,
  }));
  const playing = items[current];
  const nextIndex = queued >= 0 ? queued : current + 1 < items.length ? current + 1 : (arrangement.loop ? 0 : -1);
  return {
    playing: true,
    blocks,
    bar: Number(arrangement.bar) || 0,
    barsLeft: playing ? Math.max(0, playing.bars - (Number(arrangement.bar) || 1) + 1) : 0,
    nextName: arrangement.ending ? 'the end' : nextIndex >= 0 ? blocks[nextIndex].name : 'the end',
  };
}

/** What is wrong right now that a player can do something about, most urgent first: a stuck or
 * held note (silence the parts it reaches), an input that went away, a plug-in that stopped
 * (reload it, or leave it off). Advisories that need the Build page are not stage news. */
export function stageTroubles(reliability = {}) {
  const out = [];
  for (const event of reliability?.automaticFailover?.events ?? []) {
    if (!['failed', 'bypassed', 'waiting', 'loading'].includes(event.state)) continue;
    const busy = event.state === 'waiting' || event.state === 'loading';
    out.push({
      key: `failover:${event.targetId}`, severity: busy ? 2 : 3, kind: 'failover',
      title: busy ? `${event.name || 'A plug-in'} is being reloaded` : `${event.name || 'A plug-in'} stopped`,
      text: busy ? 'The rest of the rig is playing.' : `${event.error || 'It crashed.'} The rest of the rig is playing.`,
      actions: busy ? [] : [{ kind: 'retry', label: 'Reload it now', targetId: event.targetId },
                             { kind: 'dismiss', label: 'Leave it off', targetId: event.targetId }],
    });
  }
  for (const issue of reliability?.midi?.issues ?? []) {
    if (issue.kind === 'stuckNote' || issue.kind === 'heldNote') {
      const parts = issue.parts ?? [];
      const note = issue.noteName ? ` · ${issue.noteName}` : '';
      out.push({
        key: `midi:${issue.key}`, severity: issue.kind === 'stuckNote' ? 3 : 2, kind: 'note',
        title: issue.kind === 'stuckNote' ? `Stuck note${note}` : `Held note${note}`,
        text: issue.text,
        actions: parts.length > 0
          ? parts.map((part) => ({ kind: 'panicPart', label: `Silence ${part.name}`, partId: part.partId }))
          : [{ kind: 'panic', label: 'Silence everything' }],
      });
    } else if (issue.kind === 'inputGone') {
      out.push({ key: `midi:${issue.key}`, severity: 3, kind: 'input', title: `${issue.device || 'A MIDI input'} went away`,
                 text: issue.text, actions: [] });
    }
  }
  return out.sort((a, b) => b.severity - a.severity);
}

/** A rolling history for the CPU line: the last `size` readings, oldest first, each 0..1. */
export function pushHistory(history = [], value, size = 60) {
  const next = [...history, Math.max(0, Math.min(1, Number(value) || 0))];
  return next.length > size ? next.slice(next.length - size) : next;
}

/** The stage keys, as one table the screen and its help line both read. Numbers are songs,
 * as numbered in the set list (tap twice to go, like the list); with Shift they are scenes.
 * The digit is read from the key's position, since Shift+1 types "!" on most layouts. */
export function stageKeyAction(event) {
  const key = event.key;
  if (key === ' ') return { kind: 'playStop' };
  if (key === 'ArrowRight' || key === 'PageDown') return { kind: 'next' };
  if (key === 'ArrowLeft' || key === 'PageUp') return { kind: 'previous' };
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code ?? '')?.[1] ?? (/^[1-9]$/.test(key) ? key : null);
  if (digit) {
    const index = Number(digit) - 1;
    if (event.shiftKey) return index < 8 ? { kind: 'scene', index } : null;
    return { kind: 'song', index };
  }
  if (key === 'Enter') return { kind: 'go' };
  if (key === 'p' || key === 'P') return { kind: 'panicHold' };
  if (key === 'n' || key === 'N') return { kind: 'notesSize', delta: event.shiftKey ? -2 : 2 };
  if (key === 'Escape') return { kind: 'disarm' };
  return null;
}

/** A song length as typed: "4:30" is minutes and seconds, a plain number is minutes ("4",
 * "4.5"), since that is how a song's length is thought of. null when it reads as neither. */
export function parseSongLength(text) {
  const t = String(text ?? '').trim();
  if (!t || /^(none|off|-)$/i.test(t)) return 0;
  const clock = t.match(/^(\d{1,2}):(\d{1,2})$/);
  if (clock) return Math.min(3600, Number(clock[1]) * 60 + Math.min(59, Number(clock[2])));
  const minutes = Number(t.replace(/\s*(min|m)$/i, ''));
  return Number.isFinite(minutes) && minutes >= 0 ? Math.min(3600, Math.round(minutes * 60)) : null;
}
