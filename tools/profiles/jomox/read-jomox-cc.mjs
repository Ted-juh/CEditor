// read-jomox-cc.mjs — the controller tables of Jomox's operating manuals, as pdftotext -layout prints
// them, decided nothing.
//
// Every manual prints its sound parameters as a table a row a line: a name, the controller, its value
// range, and in most an internal range or resolution (`Tune  100  0-127  0-127`, `LFO Wave  119
// 0..7  Sup/Sdo/Sin/…`, `HH Source  62  32-34  Nor, Fil, Noi`). A section is a line in capitals,
// alone or as the first column of the header (`KICK DRUM CH1  Controller No.  Value range`, `BASS DRUM
// CONTROLLER  VALUE  INTERNAL`, `SNARE DRUM`), and may name its MIDI channel. A name or an internal
// range too long for its column goes on below, on a line of its own (`Select Instrument` / `for Multi
// Kit`; `Sup/Sdo/Sin/Si-/tri/tri-/r` / `Ct/rC-/PL1-PL8`).

const ROW = /^\s*(\S(?:.*?\S)?)\s{2,}(\d{1,3})\s{2,}(\d+(?:\s*(?:\.\.|-|\/|,)\s*\d+)*(?:\s+(?:MSB|LSB))?)(?:\s{2,}(\S.*?))?\s*$/;
const HEADER = /\b(?:Controller|CONTROLLER)\b/;

/** Lines with the page each is on (pdftotext ends a page with a form feed). */
function paged(text) {
  return text.split('\f').flatMap((page, k) => page.split(/\r?\n/).map((t) => ({ page: k + 1, t })));
}

/**
 * The tables on these pages' text: [{ page, section, channel?, name, cc, range, internal? }]. `stop`:
 * a line that ends the tables (the next chapter's heading). Lines that are neither a row, a section
 * nor a row's going on are returned in `unread`.
 */
export function readControllerTables(text, { firstPage = 1, stop = null } = {}) {
  const rows = [];
  const unread = [];
  let section = null;
  let channel = null;
  let nameCol = 0;
  let internalCol = null;
  let onChannel = null;       // `Global Controllers on Channel 16`: the channel of the sections after it
  for (const { page, t } of paged(text)) {
    if (!t.trim()) continue;
    if (stop && stop.test(t)) break;
    const said = /\bon Channel\s+(\d+)\s*$/i.exec(t.trim());
    if (said && !ROW.test(t)) { onChannel = Number(said[1]); continue; }
    const header = HEADER.test(t) && !ROW.test(t);
    if (header) {
      const lead = /^\s*(.*?)\s{2,}(?:Controller|CONTROLLER)/.exec(t)?.[1]?.trim();
      if (lead && !/^(?:Parameter|Sound Parameter|Function)$/i.test(lead)) ({ section, channel } = sectionOf(lead, onChannel));
      const internal = /\b(?:INTERNAL|Internal|internal)\b/.exec(t);
      internalCol = internal ? internal.index : null;
      continue;
    }
    const m = ROW.exec(t);
    if (m) {
      nameCol = t.search(/\S/);
      rows.push({ page: page + firstPage - 1, section, ...(channel ? { channel } : {}), name: m[1], cc: Number(m[2]), range: m[3].replace(/\s+/g, ' '), ...(m[4] ? { internal: m[4] } : {}) });
      continue;
    }
    // A section on its own: capitals, a word or more (`SNARE DRUM`, `HI HAT`), or a header's second
    // line (`NO.  RANGE  RANGE`), which is not one.
    const trimmed = t.trim();
    if (/^(?:NO\.?|No\.?|RANGE|VALUE)(?:\s|$)/.test(trimmed) || /^(?:range|resolution|Range|Resolution|No\.?|RANGE)$/.test(trimmed)) continue;
    if (/^[A-Z0-9][A-Z0-9 &/.-]*(?:\s+CH\s?\d+)?$/.test(trimmed) && !/\bRANGE\b/.test(trimmed)) { ({ section, channel } = sectionOf(trimmed, onChannel)); continue; }
    // A row's going on: its name (at the name's column) or its internal range (far right).
    const last = rows.at(-1);
    const at = t.search(/\S/);
    if (last && last.page === page + firstPage - 1 && at > nameCol + 20 && (internalCol == null || at >= internalCol - 8 || at > 40)) {
      last.internal = /[A-Za-z0-9/-]$/.test(last.internal ?? '') && /^[A-Za-z]/.test(trimmed) ? `${last.internal}${trimmed}` : `${last.internal ?? ''} ${trimmed}`.trim();
      continue;
    }
    if (last && last.page === page + firstPage - 1 && at <= nameCol + 2 && trimmed.length < 24 && !/[.:]$/.test(trimmed) && /^[a-z(]|^for\b|^Mask$/.test(trimmed)) { last.name = `${last.name} ${trimmed}`; continue; }
    unread.push({ page: page + firstPage - 1, text: trimmed });
  }
  return { rows, unread };
}

/** `KICK DRUM CH1` -> { section: 'KICK DRUM', channel: 1 }. */
export function sectionOf(text, onChannel = null) {
  const m = /^(.*?)\s+CH\s?(\d+)$/.exec(text.trim());
  return m ? { section: m[1].trim(), channel: Number(m[2]) } : { section: text.trim(), channel: /CH\s?\d+\s*-\s*CH/.test(text) ? null : onChannel };
}
