/**
 * The sound browser's state, shared by its two places: the Sounds tab in the dock (the quick
 * pick while you work on a part) and the Sounds page (the whole screen). Opening the page from
 * the dock keeps the search, the sort and what you had selected, because they are one browser
 * shown two ways rather than two browsers.
 *
 * The host owns the results. It filters, sorts and pages them (see sortLibraryResults and
 * emitLibrary in the native code); this holds what you asked for and what you picked.
 */
import { fromStore } from 'svelte/store';
import {
  hostLibrary, requestLibraryPage, normalizeLibraryQuery, emptyLibraryQuery, LIBRARY_SORTS,
  similarSounds, recordFamily, loadLibraryRecord, auditionLibraryRecord,
} from '../../stores/instrumentHost.js';
import { matchesPresetKind } from '../../utils/soundBrowserLayout.js';
import { readStoredJson, writeStoredJson } from '../../utils/localStorageState.js';

/** How many records one request asks for. Scrolling near the end asks for the next page. */
export const PAGE_SIZE = 400;
const HISTORY_KEY = 'ceditor.instrumentHost.soundsHistory.v1';
const HISTORY_LENGTH = 50;

/** Pure: the ids a click selects, given the ids in view, what is selected, and the anchor. */
export function nextSelection(order, selection, anchor, id, { shift = false, toggle = false } = {}) {
  if (shift && anchor && order.includes(anchor) && order.includes(id)) {
    const a = order.indexOf(anchor), b = order.indexOf(id);
    const span = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    return { selection: toggle ? [...new Set([...selection, ...span])] : span, anchor };
  }
  if (toggle) {
    const next = selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id];
    return { selection: next, anchor: id };
  }
  return { selection: [id], anchor: id };
}

/** Pure: history after loading `id` at position `at` — anything ahead of it is dropped, as in a
    web browser, and loading the sound you are already on adds nothing. */
export function pushHistory(history, at, id, limit = HISTORY_LENGTH) {
  const kept = history.slice(0, at + 1);
  if (kept[kept.length - 1] === id) return { history: kept, at: kept.length - 1 };
  const next = [...kept, id].slice(-limit);
  return { history: next, at: next.length - 1 };
}

class SoundsBrowser {
  #library = fromStore(hostLibrary);
  #askedFrom = -1;

  /** Rows per request. A test can make it small to see paging work with a small library. */
  pageSize = PAGE_SIZE;
  query = $state(normalizeLibraryQuery(this.#library.current.request));
  presetKind = $state('all');
  selectedId = $state('');
  selection = $state([]);
  anchor = '';
  history = $state([]);
  historyAt = $state(-1);
  nudge = $state('');
  #lastAskedSimilar = '';

  records = $derived(this.#library.current.records.filter((r) => matchesPresetKind(r, this.presetKind)));
  matched = $derived(this.#library.current.counts.matched);
  selected = $derived(this.records.find((r) => r.recordId === this.selectedId) ?? this.records[0] ?? null);
  selectedRecords = $derived(this.selection
    .map((id) => this.records.find((r) => r.recordId === id)).filter(Boolean));

  constructor() {
    const stored = readStoredJson(HISTORY_KEY, null);
    if (Array.isArray(stored?.history)) {
      this.history = stored.history.map(String).slice(-HISTORY_LENGTH);
      this.historyAt = Math.min(this.history.length - 1, Math.max(-1, Number(stored.at ?? this.history.length - 1)));
    }
  }

  /** Run a view from the top: the first page replaces whatever was held. */
  ask(next) {
    this.query = normalizeLibraryQuery(next);
    if (this.query.type !== 'preset') this.presetKind = 'all';
    this.#askedFrom = 0;
    requestLibraryPage(this.query, 0, this.pageSize);
  }

  refresh() { this.ask(this.query); }
  search(text) { this.ask({ ...emptyLibraryQuery(), text, sort: this.query.sort, sortDescending: this.query.sortDescending }); }
  clear() { this.ask({ ...emptyLibraryQuery(), sort: this.query.sort, sortDescending: this.query.sortDescending }); }

  /** The next page, when the view is near the end of what it holds. */
  loadMore() {
    const have = this.#library.current.records.length;
    if (have >= this.matched || this.#askedFrom === have) return;
    this.#askedFrom = have;
    requestLibraryPage(this.query, have, this.pageSize);
  }
  get complete() { return this.#library.current.records.length >= this.matched; }

  /** Sort by `key`; the same key again turns the direction round. */
  sortBy(key) {
    const known = LIBRARY_SORTS.find((s) => s.key === key) ?? LIBRARY_SORTS[0];
    const sortDescending = this.query.sort === known.key && known.key !== ''
      ? !this.query.sortDescending : known.descending;
    this.ask({ ...this.query, sort: known.key, sortDescending });
  }

  /** One click on a sound. Ctrl adds or removes it, Shift takes the run from the last click. */
  select(id, event = null) {
    const order = this.records.map((r) => r.recordId);
    const next = nextSelection(order, this.selection, this.anchor, id,
      { shift: event?.shiftKey === true, toggle: event?.ctrlKey === true || event?.metaKey === true });
    this.selection = next.selection;
    this.anchor = next.anchor;
    this.focus(next.selection.includes(id) ? id : (next.selection[next.selection.length - 1] ?? id));
  }
  selectOnly(id) { this.selection = [id]; this.anchor = id; this.focus(id); }
  clearSelection() { this.selection = this.selected ? [this.selected.recordId] : []; }

  /** The sound the inspector shows. Its neighbours and family are fetched when it changes. */
  focus(id) {
    this.selectedId = id;
    if (id && id !== this.#lastAskedSimilar) {
      this.#lastAskedSimilar = id;
      similarSounds(id);
      recordFamily(id);
    }
  }

  /** Load a record into a part (or add it), and remember it in the history. */
  load(record, action, { focusedPart = null, auditionOn = false } = {}) {
    if (!record?.available) return false;
    if (record.type === 'rack') { loadLibraryRecord(record.recordId); this.remember(record.recordId); return true; }
    if ((!focusedPart && action !== 'add') || (record.isEffect && !focusedPart)) return false;
    const partId = action === 'focused' || record.isEffect ? focusedPart?.partId : undefined;
    // With audition on, loading IS the phrase: the host commits the preset and then plays, one
    // command, so the note never lands on the sound that was there before.
    if (auditionOn && action !== 'add' && record.type === 'preset') auditionLibraryRecord(record.recordId, action, partId);
    else loadLibraryRecord(record.recordId, action, partId);
    if (action !== 'add') this.remember(record.recordId);
    return true;
  }

  remember(id) {
    const next = pushHistory(this.history, this.historyAt, id);
    this.history = next.history;
    this.historyAt = next.at;
    writeStoredJson(HISTORY_KEY, { history: this.history, at: this.historyAt });
  }

  get canGoBack() { return this.historyAt > 0; }
  get canGoForward() { return this.historyAt < this.history.length - 1; }

  /** Step through what you loaded, like a web browser's back and forward: loads it again. */
  step(delta, { focusedPart = null, auditionOn = false } = {}) {
    const at = this.historyAt + delta;
    if (at < 0 || at >= this.history.length || !focusedPart) return;
    const id = this.history[at];
    this.historyAt = at;
    writeStoredJson(HISTORY_KEY, { history: this.history, at });
    if (auditionOn) auditionLibraryRecord(id, 'focused', focusedPart.partId);
    else loadLibraryRecord(id, 'focused', focusedPart.partId);
    this.selectOnly(id);
  }
}

export const sounds = new SoundsBrowser();
