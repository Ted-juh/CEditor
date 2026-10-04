/** Words and small drawings the sound browser's parts share. */

export const AXIS_LABELS = {
  brightness: 'Brightness', attack: 'Attack', tail: 'Tail', width: 'Width', cost: 'Cost',
};

// Source types are the library's own vocabulary and they are not words anybody says out
// loud. The chips read as what the sound IS; the value underneath stays what the record says.
const SOURCE_LABELS = {
  vstpreset: 'Vendor preset',
  nksf: 'NKS preset',
  fxp: 'Vanguard preset',
  spire: 'Spire preset',
  h2p: 'Zebra3 preset',
  programList: "Plug-in's own programs",
  userState: 'Captured by you',
  hardwarePatch: 'Hardware patch',
  rackCapture: 'Rack capture',
  chainCapture: 'Chain capture',
};
export const sourceLabel = (value) => SOURCE_LABELS[value] ?? value;

export const detailLine = (record) => (record.type === 'rack'
  ? 'Rack'
  : [record.type === 'chain' ? 'Chain' : null,
     record.sourceType === 'hardwarePatch' ? 'Hardware' : null,
     record.instrument, record.manufacturer].filter(Boolean).join(' · ') || 'Preset');

/** A record's own waveform, drawn from the envelope the auditioner measured. Mirrored around
    the middle and stretched to the tile, so the SHAPE reads at a glance — a slow pad and a
    plucked bass are different objects before you read either name. */
export function thumbPoints(envelope) {
  const n = envelope.length;
  if (n === 0) return '';
  if (n === 1) return `50,${(12 - envelope[0] * 11).toFixed(1)} 50,${(12 + envelope[0] * 11).toFixed(1)}`;
  const top = envelope.map((v, i) => `${((i / (n - 1)) * 100).toFixed(1)},${(12 - v * 11).toFixed(1)}`);
  const bottom = envelope.map((v, i) => `${(((n - 1 - i) / (n - 1)) * 100).toFixed(1)},${(12 + v * 11).toFixed(1)}`);
  return [...top, ...bottom].join(' ');
}

/** The envelope as one line across a w × h box, for list rows and the shoot-out. */
export function envelopeLine(envelope, w, h, pad = 1) {
  const n = envelope?.length ?? 0;
  if (n < 2) return '';
  return envelope.map((v, i) => `${i ? 'L' : 'M'}${((i / (n - 1)) * w).toFixed(1)},${(h - pad - v * (h - pad * 2)).toFixed(1)}`).join(' ');
}

/** What the preview cache costs, in a unit somebody can act on. */
export function cacheSize(bytes) {
  if (!(bytes > 0)) return '';
  if (bytes < 1048576) return ` · ${Math.round(bytes / 1024)} kB`;
  return ` · ${Math.round(bytes / 1048576)} MB`;
}

/** When something happened, in the words somebody would use out loud. */
export function whenSaved(ms, now = Date.now()) {
  const seconds = Math.max(0, (now - ms) / 1000);
  if (seconds < 90) return 'just now';
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** How long ago a sound was last loaded, for a list column: '' when never. */
export function lastLoaded(ms, now = Date.now()) {
  if (!(ms > 0)) return '';
  const days = Math.floor((now - ms) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });
}

/** The axes that agreed, and the one that did not. */
export const agreedAxes = (match) => match.axes.slice(0, 3)
  .map((a) => AXIS_LABELS[a.axis]?.toLowerCase() ?? a.axis);
export const gaveUp = (match) => {
  const worst = match.axes[match.axes.length - 1];
  if (!worst || Math.abs(worst.delta) < 0.05) return '';
  const axis = AXIS_LABELS[worst.axis]?.toLowerCase() ?? worst.axis;
  return `${worst.delta > 0 ? 'more' : 'less'} ${axis}`;
};

/** A category's colour on the map: stable per name, from a small palette that reads on dark. */
const PALETTE = ['#7d8cf0', '#e0704f', '#e6b04e', '#58a879', '#4fc1c9', '#c98ae0', '#9aa5ae', '#d77a9f', '#8fbf4f', '#5b9bd5'];
export function categoryColour(category) {
  const text = String(category ?? '').toLowerCase();
  if (!text) return '#7f8b96';
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** The drag payload that carries sounds onto a collection. */
export const RECORDS_MIME = 'application/x-ceditor-records';
