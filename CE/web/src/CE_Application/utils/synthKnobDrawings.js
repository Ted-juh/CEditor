// synthKnobDrawings.js — the 36 synth sets' knobs as their drawings draw them, written out as SVG
// markup for utils/svgDrawingItems.js to read into layers (utils/formDrawingLayers.js).
//
// Each is the knob branch of its drawing, copied: editor/PhysicalAnatomy.svelte (the first twelve,
// by style), editor/SynthExpansionAnatomy.svelte (the second twelve) and
// editor/SculptedSynthAnatomy.svelte (the sculpted twelve). Where the drawing used the value, the
// markup says so instead (svgDrawingItems' marks): a group that turns, an arc to the value, ticks
// that light. Colours are the form's five as `$face`, `$housing`, `$ink`, `$legend`, `$accent`.
// Change a drawing there and its markup here goes with it: browser-checks/knobLayers.mjs compares
// the two, the drawing on the panel and these layers, at four values.

const RAD = Math.PI / 180;
const f = (n) => Number(n.toFixed(3));
const pt = (a, r, cx = 80, cy = 76) => [f(cx + Math.sin(a * RAD) * r), f(cy - Math.cos(a * RAD) * r)];
const arc = (r, to = 135) => {
  const [ax, ay] = pt(-135, r);
  const [bx, by] = pt(to, r);
  return `M${ax} ${ay}A${r} ${r} 0 ${to + 135 > 180 ? 1 : 0} 1 ${bx} ${by}`;
};
const ribs = (n, r, inner) => Array.from({ length: n * 4 }, (_, i) => pt((i * 90) / n, i % 4 < 2 ? r : inner).join(',')).join(' ');
const star = (n, outer, inner, cx = 80, cy = 76) => Array.from({ length: n * 2 }, (_, i) => pt((i * 180) / n, i % 2 ? inner : outer, cx, cy).join(',')).join(' ');
const turn = (inner, extra = '') => `<g data-turn="80 76"${extra}>${inner}</g>`;

// --- the gradients, by series, as each drawing's <defs> has them ---------------------------------
// [offset, colour, opacity]; `d` the form's Depth, 0..1.

const linear = (x2, y2, stops) => ({ type: 'linear', x1: 0, y1: 0, x2, y2, stops });
const radial = (cx, cy, r, stops) => ({ type: 'radial', cx, cy, r, stops });

const SERIES_1 = (d) => ({
  cap: radial(0.35, 0.2, 0.95, [[0, 'FFFFFF', d * 0.34], [0.35, '$face', 1], [0.78, '$face', 1], [1, '141819', 1]]),
  metal: linear(0.8, 1, [[0, 'E2E5E5', 1], [0.24, '$face', 1], [0.5, 'E5E8E8', 1], [0.7, '$face', 1], [1, '454C4E', 1]]),
  edge: linear(0.2, 1, [[0, '9B9F9E', 1], [0.12, '$face', 1], [1, '111719', 1]]),
  well: linear(0, 1, [[0, '090D0F', 1], [1, '$housing', 1]]),
  glass: linear(0.65, 1, [[0, 'EEFAFF', 0.4], [0.46, '$face', 0.1], [0.49, 'E5F5FF', 0.22], [1, '$face', 0.1]]),
});
const SERIES_2 = (d) => ({
  cap: radial(0.32, 0.2, 0.9, [[0, 'FFFFFF', d * 0.45], [0.3, '$face', 1], [0.8, '$face', 1], [1, '263238', 1]]),
  dish: radial(0.7, 0.85, 0.9, [[0, 'EFF3EE', 1], [0.4, '$face', 1], [1, '485156', 1]]),
  metal: linear(0.65, 1, [[0, 'E5EAE8', 1], [0.3, '$face', 1], [0.53, 'C9D2D2', 1], [1, '38484C', 1]]),
  edge: linear(0.1, 1, [[0, '9AA6AA', 1], [0.15, '$face', 1], [1, '0E181E', 1]]),
  well: linear(0.2, 1, [[0, '080E13', 1], [0.65, '$housing', 1], [1, '5B6B73', 1]]),
  lens: linear(0.5, 1, [[0, 'FFFFFF', 0.25], [0.48, 'FFFFFF', 0.02], [0.5, 'FFFFFF', 0.15], [1, '$face', 0.05]]),
});
const SERIES_3 = (d) => ({
  dome: radial(0.3, 0.18, 0.86, [[0, 'FFFFFF', 0.9 * d], [0.22, '$face', 1], [0.67, '$face', 1], [1, '080D10', 1]]),
  dish: radial(0.66, 0.76, 0.88, [[0, '11191C', 1], [0.42, '$face', 1], [0.72, 'DCE4E1', 0.7 * d], [1, '202A2E', 1]]),
  side: linear(0, 1, [[0, '$face', 1], [0.25, '1B2427', 1], [1, '05090B', 1]]),
  metal: linear(0.8, 1, [[0, 'F6FAF8', 0.85 * d], [0.24, '$face', 1], [0.48, '4C5B5E', 1], [0.7, '$face', 1], [1, '11191C', 1]]),
  glass: linear(0.2, 1, [[0, 'FFFFFF', 0.65 * d], [0.32, '$face', 0.72], [0.62, '$housing', 0.55], [1, '071117', 0.9]]),
});

// --- the scales, as each series draws them -------------------------------------------------------

// Series 1: `count` divisions, majors on the even ones, faint on the modern styles, numbers 0 to 10.
function scale1(radius, count, numbers, modern) {
  const ticks = Array.from({ length: count + 1 }, (_, i) => `<path d="M80 ${76 - radius}v${i % 2 === 0 ? 5 : 2.5}" transform="rotate(${-135 + (i * 270) / count} 80 76)" stroke="$legend" stroke-opacity="${modern ? 0.45 : 0.8}" stroke-width="${i % 2 === 0 ? 1.4 : 0.75}"/>`).join('');
  const nums = numbers ? [0, 2, 4, 6, 8, 10].map((n) => { const [x, y] = pt(-135 + n * 27, radius + 12); return `<text x="${x}" y="${f(y + 3)}" fill="$legend" text-anchor="middle" font-size="7">${n}</text>`; }).join('') : '';
  return ticks + nums;
}
// Series 2: as many divisions as the form's Divisions say, at `base` for twelve.
function scale2(r, base, numbers, detail) {
  const n = Math.max(4, Math.round((base * detail) / 12));
  const ticks = Array.from({ length: n + 1 }, (_, i) => `<path d="M80 ${76 - r}v${i % 2 === 0 ? 5 : 2.5}" transform="rotate(${-135 + (i * 270) / n} 80 76)" stroke="$legend" stroke-width="${i % 2 === 0 ? 1.2 : 0.6}" stroke-opacity=".7"/>`).join('');
  const nums = numbers ? [0, 2, 4, 6, 8, 10].map((i) => { const [x, y] = pt(-135 + i * 27, r + 11); return `<text x="${x}" y="${f(y + 2.5)}" text-anchor="middle" fill="$legend" font-size="6.5">${i}</text>`; }).join('') : '';
  return ticks + nums;
}
// Series 3: likewise, longer marks.
function scale3(r, count, numbers, detail) {
  const n = Math.max(5, Math.round((count * detail) / 12));
  const ticks = Array.from({ length: n + 1 }, (_, i) => `<path d="M80 ${76 - r}v${i % 2 === 0 ? 6 : 3}" transform="rotate(${-135 + (i * 270) / n} 80 76)" stroke="$legend" stroke-width="${i % 2 === 0 ? 1.4 : 0.7}" stroke-opacity=".8"/>`).join('');
  const nums = numbers ? [0, 2, 4, 6, 8, 10].map((i) => { const [x, y] = pt(-135 + i * 27, r + 12); return `<text x="${x}" y="${f(y + 2.5)}" text-anchor="middle" fill="$legend" font-size="6.5">${i}</text>`; }).join('') : '';
  return ticks + nums;
}

// --- series 1 (PhysicalAnatomy), by style --------------------------------------------------------

const S1 = {
  vintage: () => `${scale1(63, 20, true, false)}<circle cx="80" cy="81" r="49" fill="#080b0d"/><circle cx="80" cy="76" r="49" fill="url(#edge)" stroke="#0a0c0d" stroke-width="2"/>`
    + turn('<circle cx="80" cy="76" r="41" fill="url(#cap)"/><circle cx="80" cy="76" r="28" fill="#30312e" stroke="#6a6b62"/><path d="M77 30h6v30h-6Z" fill="#e7ddbd"/><circle cx="80" cy="76" r="17" fill="none" stroke="#77796e" stroke-opacity=".25"/>'),
  poly: () => `${scale1(65, 10, false, false)}<circle cx="80" cy="81" r="51" fill="#0d1012"/>`
    + turn(`<polygon points="${ribs(12, 51, 47)}" fill="url(#edge)" stroke="#111518" stroke-width="2"/><circle cx="80" cy="76" r="38" fill="url(#cap)" stroke="#666d70"/><path d="M77 28h6v29h-6Z" fill="$accent"/><path d="M80 60v9" stroke="$ink" stroke-width="2"/>`),
  console: () => `${scale1(67, 20, true, false)}<circle cx="80" cy="80" r="49" fill="#13191b"/><circle cx="80" cy="76" r="49" fill="url(#edge)"/>`
    + turn('<circle cx="80" cy="76" r="43" fill="url(#metal)" stroke="#d0d4d4"/><circle cx="80" cy="76" r="37" fill="url(#cap)"/><path d="M78 34h4v25h-4Z" fill="#20272b"/><circle cx="80" cy="76" r="27" fill="none" stroke="white" stroke-opacity=".15"/>'),
  compact: () => `${scale1(58, 10, false, false)}<circle cx="80" cy="80" r="44" fill="#1f292c"/>`
    + turn(`<polygon points="${ribs(7, 42, 38)}" fill="url(#edge)" stroke="#777c79"/><circle cx="80" cy="76" r="34" fill="url(#cap)"/><path d="M77 38h6v28h-6Z" fill="$accent"/>`),
  modular: () => `${scale1(57, 20, true, false)}<circle cx="80" cy="81" r="37" fill="#3b4140"/><circle cx="80" cy="76" r="38" fill="#171e1f" stroke="#d4d7d1"/>`
    + turn(`<polygon points="${ribs(8, 37, 31)}" fill="url(#edge)" stroke="#111819"/><circle cx="80" cy="76" r="26" fill="url(#cap)"/><path d="M78 43h4v30h-4Z" fill="#e4e7de"/>`),
  rubber: () => `${scale1(66, 10, false, false)}<circle cx="80" cy="81" r="52" fill="#111819"/>`
    + turn(`<polygon points="${ribs(16, 51, 46)}" fill="url(#edge)" stroke="#1b2426" stroke-width="2"/><circle cx="80" cy="76" r="38" fill="url(#cap)"/><path d="M74 28h12l-3 31h-6Z" fill="$accent"/>`),
  digital: () => `${scale1(61, 20, false, true)}<circle cx="80" cy="80" r="46" fill="#090d14"/><circle cx="80" cy="76" r="46" fill="url(#edge)"/><circle cx="80" cy="76" r="40" fill="$face"/>`
    + turn('<rect x="78" y="34" width="4" height="19" fill="$accent"/>') + '<path d="M54 106h52" stroke="#1d2631" stroke-width="2"/>',
  precision: () => `${scale1(68, 24, true, false)}<circle cx="80" cy="80" r="50" fill="#111719"/><circle cx="80" cy="76" r="50" fill="url(#metal)"/>`
    + Array.from({ length: 48 }, (_, i) => `<path d="M80 27v7" transform="rotate(${i * 7.5} 80 76)" stroke="#253136" stroke-opacity=".75"/>`).join('')
    + turn('<circle cx="80" cy="76" r="39" fill="url(#cap)" stroke="#ced6d8"/><path d="M80 38V64" stroke="#172127" stroke-width="2"/><circle cx="80" cy="76" r="32" fill="none" stroke="#dce1e1" stroke-opacity=".22"/>'),
  workstation: () => `${scale1(66, 16, false, false)}<circle cx="80" cy="82" r="51" fill="#101519"/>`
    + turn(`<polygon points="${ribs(24, 50, 47)}" fill="url(#edge)" stroke="#131a20"/><circle cx="80" cy="76" r="39" fill="$face" stroke="#839098"/><rect x="73" y="29" width="14" height="19" rx="2" fill="$accent"/><path d="M80 32v12" stroke="#242b32" stroke-width="2"/>`),
  flat: () => `<path d="${arc(59)}" fill="none" stroke="$face" stroke-width="4"/><valuearc r="59" w="4" stroke="$accent"/><circle cx="80" cy="76" r="46" fill="$face"/>`
    + turn('<path d="M80 35v24" stroke="$ink" stroke-width="3"/>'),
  glass: () => `${scale1(67, 12, false, true)}<circle cx="80" cy="78" r="52" fill="url(#well)"/><circle cx="80" cy="76" r="50" fill="$face" fill-opacity=".28" stroke="$face"/><valuearc r="55" w="2.5" stroke="$accent"/><circle cx="80" cy="76" r="43" fill="url(#glass)" stroke="#dbeef6" stroke-opacity=".25"/>`
    + turn('<path d="M80 31v28" stroke="$accent" stroke-width="3"/>'),
  future: () => Array.from({ length: 24 }, (_, i) => `<path d="M80 13v7" transform="rotate(${-135 + (i * 270) / 23} 80 76)" stroke="$face" stroke-width="3"/>`).join('')
    + Array.from({ length: 24 }, (_, i) => `<g data-lit="${i / 23}"><path d="M80 13v7" transform="rotate(${-135 + (i * 270) / 23} 80 76)" stroke="$accent" stroke-width="3"/></g>`).join('')
    + '<circle cx="80" cy="78" r="49" fill="#090e15"/><circle cx="80" cy="76" r="46" fill="$face" stroke="#7c929f" stroke-width=".8"/><circle cx="80" cy="76" r="39" fill="$housing"/>'
    + turn('<path d="M78 32h4v22h-4Z" fill="$accent"/>') + '<path d="M57 107h46" stroke="$face"/>',
};

// --- series 2 (SynthExpansionAnatomy), by set --------------------------------------------------

const grip = ribs;
const S2 = {
  heritage: (k) => `${scale2(65, 10, true, k.detail)}<circle cx="80" cy="81" r="49" fill="#111716"/>`
    + turn(`<polygon points="${grip(12, 49, 45)}" fill="url(#edge)" stroke="#6d7369"/><circle cx="80" cy="76" r="38" fill="url(#cap)" stroke="#e0e4d6"/><path d="M77 31h6v27h-6Z" fill="#4d5246"/><path d="M80 35v19" stroke="$ink" stroke-width="2"/><circle cx="80" cy="76" r="26" fill="none" stroke="#a3a798" stroke-width=".7"/>`),
  pinstripe: (k) => `${scale2(68, 24, true, k.detail)}<circle cx="80" cy="79" r="55" fill="#080d12"/><circle cx="80" cy="76" r="55" fill="url(#edge)"/><circle cx="80" cy="76" r="49" fill="#191e20" stroke="#7a8080" stroke-width=".8"/>`
    + turn('<circle cx="80" cy="76" r="36" fill="url(#cap)" stroke="#596263"/><path d="M77 23v36M83 23v36" stroke="#e7e2d0" stroke-width="2"/><path d="M73 60h14" stroke="$accent" stroke-width="2"/>'),
  'dual-scale': (k) => `${scale2(68, 20, true, k.detail)}<circle cx="80" cy="81" r="53" fill="#0d1419"/><circle cx="80" cy="76" r="53" fill="url(#metal)"/><circle cx="80" cy="76" r="47" fill="$housing"/>${scale2(44, 10, false, k.detail)}`
    + turn('<circle cx="80" cy="76" r="32" fill="url(#cap)" stroke="#b7c3c5" stroke-width="2"/><path d="M78 45h4v23h-4Z" fill="$ink"/><path d="M77 25h6v12h-6Z" fill="$accent"/><circle cx="80" cy="76" r="22" fill="none" stroke="#d3dbd9" stroke-opacity=".3"/>'),
  broadcast: (k) => `${scale2(67, 12, false, k.detail)}<circle cx="80" cy="81" r="52" fill="#131c20"/><circle cx="80" cy="76" r="52" fill="url(#metal)" stroke="#acb8b9"/><circle cx="80" cy="76" r="42" fill="url(#dish)" stroke="#6f7e80" stroke-width="1.5"/>`
    + turn('<path d="M77 26h6v35h-6Z" fill="#253238"/><path d="M78 27h1v33h-1Z" fill="#8d9c9f"/>') + '<circle cx="80" cy="76" r="28" fill="none" stroke="#bdc8c6" stroke-opacity=".3"/>',
  'compact-rack': (k) => `${scale2(53, 10, true, k.detail)}<rect x="45" y="37" width="70" height="80" rx="5" fill="url(#well)" stroke="#626f6e"/>`
    + turn(`<polygon points="${grip(10, 33, 28)}" fill="url(#edge)" stroke="#172124"/><circle cx="80" cy="76" r="22" fill="url(#cap)"/><path d="M78 45h4v29h-4Z" fill="#edf0e5"/>`) + '<path d="M59 112h42" stroke="$accent" stroke-width="1.5"/>',
  recessed: (k) => `${scale2(66, 12, false, k.detail)}<circle cx="80" cy="76" r="55" fill="url(#well)" stroke="$face" stroke-width="1.5"/><circle cx="80" cy="76" r="46" fill="#17232b"/>`
    + turn('<circle cx="80" cy="76" r="37" fill="$face" stroke="#8799a3" stroke-width=".7"/><path d="M73 35h14l-3 27h-8Z" fill="$accent"/><path d="M53 90q27 13 54 0" fill="none" stroke="#21323b" stroke-width="3"/>'),
  'digital-grid': () => '<rect x="23" y="19" width="114" height="114" rx="4" fill="url(#well)" stroke="$face"/>'
    + Array.from({ length: 8 }, (_, i) => { const [x, y] = pt(-135 + (i * 270) / 7, 65); return `<rect x="${f(x - 2)}" y="${f(y - 2)}" width="4" height="4" fill="$legend" opacity=".7"/>`; }).join('')
    + '<circle cx="80" cy="76" r="45" fill="url(#edge)"/><circle cx="80" cy="76" r="37" fill="$face"/>' + turn('<path d="M77 35h6v24h-6Z" fill="$accent"/>') + '<path d="M44 122h72" stroke="$face"/>',
  'studio-white': (k) => `<path d="${arc(65)}" fill="none" stroke="$legend" stroke-width=".8"/><path d="${arc(60)}" fill="none" stroke="$legend" stroke-opacity=".35" stroke-width=".8"/>${scale2(71, 6, false, k.detail)}<circle cx="80" cy="80" r="48" fill="#aab3b0"/><circle cx="80" cy="76" r="48" fill="url(#cap)" stroke="#b8c3bf"/><circle cx="80" cy="76" r="40" fill="$face"/>`
    + turn('<path d="M80 31V68" stroke="$accent" stroke-width="3"/>'),
  'arc-line': () => `<path d="${arc(66)}" fill="none" stroke="$face" stroke-width="2"/><valuearc r="60" w="2" stroke="$accent"/><circle cx="80" cy="76" r="38" fill="$face"/><circle cx="80" cy="76" r="30" fill="$housing"/>`
    + turn('<path d="M80 17V78" stroke="$accent" stroke-width="2"/>') + '<circle cx="80" cy="76" r="4" fill="$accent"/>',
  'edge-light': (k) => `${scale2(67, 12, false, k.detail)}<circle cx="80" cy="79" r="53" fill="#09141d"/><circle cx="80" cy="76" r="52" fill="url(#metal)"/><circle cx="80" cy="76" r="46" fill="$housing"/><valuearc r="49" w="3" stroke="$accent"/><circle cx="80" cy="76" r="39" fill="url(#cap)"/>`
    + turn('<path d="M78 30h4v27h-4Z" fill="$accent"/>') + '<circle cx="80" cy="76" r="39" fill="url(#lens)"/>',
  'touch-encoder': (k) => '<circle cx="80" cy="76" r="57" fill="none" stroke="$face" stroke-width="1"/><valuearc r="57" w="3" stroke="$accent"/><circle cx="80" cy="76" r="46" fill="$face"/><circle cx="80" cy="76" r="39" fill="$housing"/>'
    + turn('<circle cx="80" cy="19" r="4" fill="$accent"/>')
    + (k.showValue ? '<text data-readout x="80" y="82" text-anchor="middle" fill="$legend" font-size="16" font-family="monospace"></text>' : '<path d="M67 76h26" stroke="$accent"/>'),
  'carbon-pro': (k) => `${scale2(66, 10, false, k.detail)}<circle cx="80" cy="80" r="54" fill="#111b20"/>`
    + turn(`<polygon points="${grip(8, 53, 44)}" fill="url(#edge)" stroke="#1c2a2e" stroke-width="2"/><circle cx="80" cy="76" r="33" fill="url(#cap)" stroke="#748387" stroke-width=".7"/><path d="M74 28h12v31H74Z" fill="#263238"/><path d="M78 30h4v26h-4Z" fill="$accent"/>`),
};

// --- series 3 (SculptedSynthAnatomy), by set ----------------------------------------------------

const shadowed = (inner) => turn(inner, ' filter="shadow"');
const S3 = {
  'valve-console': (k) => `${scale3(67, 10, true, k.detail)}<ellipse cx="80" cy="87" rx="52" ry="45" fill="#07090a" opacity=".8"/><ellipse cx="80" cy="82" rx="52" ry="44" fill="url(#side)"/><ellipse cx="80" cy="75" rx="48" ry="41" fill="$accent" opacity=".55"/>`
    + shadowed(`<ellipse data-cast cx="80" cy="79" rx="40" ry="38" fill="#130f0d"/><circle data-cast cx="80" cy="72" r="40" fill="url(#dome)" stroke="#796552" stroke-width="2"/><path d="M76 28h8v34h-8Z" fill="#eee1bd"/><path d="M80 31v28" stroke="#4b3b2e" stroke-width="2"/><ellipse cx="68" cy="54" rx="10" ry="16" fill="white" opacity="${f(0.16 * k.depth)}"/>`),
  'chicken-head': (k) => `${scale3(69, 20, true, k.detail)}<circle cx="80" cy="81" r="51" fill="#0b0d0d"/><circle cx="80" cy="76" r="51" fill="url(#metal)" stroke="$accent"/>`
    + shadowed(`<path data-cast d="M80 17L96 68Q101 82 90 91Q80 101 70 91Q59 82 64 68Z" fill="url(#dome)" stroke="#26211d" stroke-width="2"/><path d="M80 22L84 66" stroke="$accent" stroke-width="3"/><ellipse cx="75" cy="75" rx="8" ry="13" fill="white" opacity="${f(0.16 * k.depth)}"/>`),
  'turret-stack': (k) => `${scale3(69, 24, true, k.detail)}<ellipse cx="80" cy="91" rx="53" ry="33" fill="#070b0d"/><ellipse cx="80" cy="84" rx="53" ry="32" fill="url(#side)"/><ellipse cx="80" cy="76" rx="49" ry="30" fill="url(#metal)"/>`
    + shadowed('<ellipse data-cast cx="80" cy="77" rx="39" ry="32" fill="#293437"/><ellipse data-cast cx="80" cy="68" rx="39" ry="31" fill="url(#metal)" stroke="#d9dfdd"/><ellipse cx="80" cy="65" rx="27" ry="23" fill="url(#dome)"/><ellipse cx="80" cy="61" rx="15" ry="13" fill="$face"/><path d="M78 37h4v29h-4Z" fill="$ink"/>'),
  'deep-flute': (k) => `${scale3(67, 12, false, k.detail)}<ellipse cx="80" cy="86" rx="55" ry="47" fill="#080d0e"/>`
    + shadowed(`<polygon data-cast points="${star(12, 54, 42)}" fill="url(#side)" stroke="#101719" stroke-width="2"/><polygon points="${star(12, 45, 37)}" fill="url(#dome)" stroke="#718083"/><circle cx="80" cy="76" r="28" fill="$face"/><path d="M73 25h14l-4 35h-6Z" fill="$accent"/><path d="M80 28v28" stroke="#f5e6c4" stroke-opacity=".45"/>`),
  'concave-studio': (k) => `${scale3(69, 16, true, k.detail)}<ellipse cx="80" cy="87" rx="54" ry="43" fill="#0a1012"/><ellipse cx="80" cy="80" rx="54" ry="42" fill="url(#side)"/><circle cx="80" cy="73" r="49" fill="url(#metal)" stroke="#e5eae7"/>`
    + shadowed(`<circle data-cast cx="80" cy="73" r="41" fill="url(#dish)" stroke="#536064" stroke-width="2"/><ellipse cx="80" cy="78" rx="28" ry="22" fill="#172126" opacity=".72"/><path d="M78 31h4v29h-4Z" fill="$accent"/><path d="M55 59q25-18 50 0" fill="none" stroke="white" stroke-opacity="${f(0.3 * k.depth)}"/>`),
  'hex-drive': (k) => `${scale3(67, 12, true, k.detail)}<polygon points="80,22 129,49 129,103 80,130 31,103 31,49" fill="#070b0d" transform="translate(0 7)"/>`
    + shadowed('<polygon data-cast points="80,22 129,49 129,103 80,130 31,103 31,49" fill="url(#metal)" stroke="#cbd2cf" stroke-width="2"/><polygon points="80,34 118,55 118,97 80,118 42,97 42,55" fill="$face" stroke="#354044"/><polygon points="80,48 104,61 104,88 80,102 56,88 56,61" fill="url(#dome)"/><path d="M78 27h4v34h-4Z" fill="$accent"/>'),
  'coin-edge': (k) => `${scale3(69, 24, true, k.detail)}<ellipse cx="80" cy="85" rx="52" ry="42" fill="#080d0f"/>`
    + shadowed(`<polygon data-cast points="${star(36, 52, 48)}" fill="url(#metal)" stroke="#2d393d"/><circle cx="80" cy="76" r="43" fill="url(#dome)" stroke="#dbe0dd"/><circle cx="80" cy="76" r="35" fill="$face"/><path d="M79 30h2v34h-2Z" fill="$ink"/><path d="M75 30h10" stroke="$accent" stroke-width="2"/>`),
  'gimbal-ring': (k) => `${scale3(70, 12, true, k.detail)}<ellipse cx="80" cy="86" rx="56" ry="48" fill="#070c0f"/><circle cx="80" cy="76" r="55" fill="none" stroke="url(#metal)" stroke-width="9" filter="shadow"/>`
    + turn('<ellipse cx="80" cy="76" rx="44" ry="28" fill="none" stroke="$face" stroke-width="7"/><ellipse cx="80" cy="76" rx="27" ry="42" fill="none" stroke="$accent" stroke-opacity=".7" stroke-width="4"/><circle cx="80" cy="76" r="24" fill="url(#dome)" stroke="#d7e2e3"/><path d="M78 49h4v20h-4Z" fill="$ink"/><circle cx="36" cy="76" r="4" fill="$accent"/><circle cx="124" cy="76" r="4" fill="$accent"/>'),
  'lever-dial': (k) => `${scale3(70, 20, true, k.detail)}<ellipse cx="80" cy="86" rx="52" ry="42" fill="#080c0d"/><circle cx="80" cy="76" r="52" fill="url(#metal)" stroke="#bfc4bc"/><circle cx="80" cy="76" r="37" fill="$housing" stroke="$face"/>`
    + shadowed(`<castonly d="M72 59.88V25Q72 17 80 17Q88 17 88 25V59.88A18 18 0 1 1 72 59.88Z"/><circle cx="80" cy="76" r="18" fill="url(#dome)" stroke="#d7ddda"/><path d="M72 73V25Q72 17 80 17Q88 17 88 25V73Z" fill="url(#metal)" stroke="#20292b"/><path d="M80 21v39" stroke="$accent" stroke-width="3"/><ellipse cx="76" cy="38" rx="3" ry="13" fill="white" opacity="${f(0.3 * k.depth)}"/>`),
  castellated: (k) => `${scale3(68, 12, false, k.detail)}<ellipse cx="80" cy="88" rx="56" ry="45" fill="#070b0c"/>`
    + shadowed(`<polygon data-cast points="${star(8, 56, 43)}" fill="url(#side)" stroke="#101719" stroke-width="3"/><circle cx="80" cy="76" r="39" fill="url(#dome)" stroke="#6b7879"/><circle cx="80" cy="76" r="29" fill="$face"/><path d="M73 24h14v37H73Z" fill="#1c2527"/><path d="M78 26h4v32h-4Z" fill="$accent"/>`),
  'floating-halo': (k) => `${scale3(70, 16, false, k.detail)}<circle cx="80" cy="79" r="57" fill="none" stroke="$accent" stroke-width="5" opacity=".42" filter="glow"/><ellipse cx="80" cy="91" rx="45" ry="27" fill="#03070a" opacity=".9"/>`
    + shadowed(`<ellipse data-cast cx="80" cy="78" rx="45" ry="39" fill="url(#side)"/><circle data-cast cx="80" cy="68" r="43" fill="url(#glass)" stroke="$accent" stroke-opacity=".7"/><circle cx="80" cy="68" r="34" fill="$face"/><path d="M78 26h4v27h-4Z" fill="$accent"/><path d="M52 49q28-18 56 0" fill="none" stroke="white" stroke-opacity="${f(0.28 * k.depth)}"/>`),
  'prism-cap': (k) => `${scale3(69, 12, true, k.detail)}<ellipse cx="80" cy="88" rx="54" ry="43" fill="#071016"/>`
    + shadowed(`<polygon data-cast points="${star(12, 52, 49)}" fill="url(#glass)" stroke="#d7f0f0" stroke-opacity=".7"/><polygon points="80,27 105,34 125,55 130,80 117,105 95,124 68,126 43,110 29,86 34,58 54,37" fill="$face" fill-opacity=".45" stroke="white" stroke-opacity=".35"/><path d="M80 27L95 68L125 55M80 27L66 68L34 58M66 68L43 110M95 68L117 105M66 68L95 68L80 105Z" fill="none" stroke="white" stroke-opacity="${f(0.28 * k.depth)}"/><path d="M78 28h4v32h-4Z" fill="$accent"/>`),
};

/**
 * The drawing of a synth set's knob form (`new-<set id>`), or null: its markup, gradients, filters
 * and where its readout sits. `style` is the set's style for the first twelve (PHYSICAL_DIRECTIONS),
 * `series` 2 or 3 for the others; `k` the form's Divisions, Depth and whether it shows its value.
 */
export function synthKnobDrawing({ id, series, style }, k) {
  const depth = Math.max(0, Math.min(1, Number(k.depth)));
  if (series === 3) {
    const draw = S3[id];
    if (!draw) return null;
    return {
      markup: draw({ ...k, depth }),
      gradients: SERIES_3(depth),
      shadow: { dy: 5 + depth * 6, blur: 2 + depth * 3, colour: 'FF000000', opacity: 0.55 + 0.3 * depth },
      glow: { blur: 4 },
      readout: k.showValue ? { y: 164 } : null,
    };
  }
  if (series === 2) {
    const draw = S2[id];
    if (!draw) return null;
    return { markup: draw({ ...k, depth }), gradients: SERIES_2(depth), readout: k.showValue && id !== 'touch-encoder' ? { y: 163 } : null };
  }
  const draw = S1[style];
  if (!draw) return null;
  return { markup: draw({ ...k, depth }), gradients: SERIES_1(depth), readout: k.showValue ? { y: 163 } : null };
}
