/**
 * Per-property coverage, counting the THREE ways a check can reach a property.
 *
 * The first version of this counted two and reported 386 unreached, which was badly wrong about
 * the editor half. Root's scenarios drive the real properties panel BY UI LABEL —
 * `await number('Stroke width', 8)` — so the key `strokeWidth` never appears as text anywhere in
 * the test. Searching for key names alone therefore reports a property that is exercised through
 * the actual authoring surface as untested, which is the worst direction for this number to be
 * wrong in.
 *
 * So: the dotted path ('Meter.showTicks'), the bare key inside a section object ({Meter:{...}}),
 * or any UI LABEL the section editor pairs with that key.
 *
 * Still a lower bound on coverage, and still not proof of anything: naming a property is not
 * checking its effect.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const WEB = fileURLToPath(new URL('../../../CE/web/', import.meta.url));
const CB = join(WEB, 'browser-checks');
const APP = join(WEB, 'src/CE_Application');
const DEF = join(APP, 'models/sectionDefaults.js');

const src = readFileSync(DEF, 'utf8');
const sections = {};
let cur = null;
for (const line of src.split('\n')) {
  const open = line.match(/^  ([A-Z][A-Za-z0-9]*): \{$/);
  if (open) { cur = open[1]; sections[cur] = []; continue; }
  if (cur && /^  \},?$/.test(line)) { cur = null; continue; }
  if (!cur) continue;
  const key = line.match(/^    ([a-zA-Z_][A-Za-z0-9_]*):/);
  if (key && key[1] !== '_type') sections[cur].push(key[1]);
}

// key -> the UI labels any editor pairs with it. Built by walking every editor/properties file and
// pairing each label= with the property keys mentioned within the next few lines.
const uiFiles = [];
for (const dir of ['sections', 'properties', 'components']) {
  const d = join(APP, dir);
  if (!existsSync(d)) continue;
  const walk = (p) => { for (const e of readdirSync(p, { withFileTypes: true })) {
    const f = join(p, e.name);
    if (e.isDirectory()) walk(f); else if (/\.svelte$/.test(e.name)) uiFiles.push(f);
  } };
  walk(d);
}
const labelsFor = new Map();
for (const f of uiFiles) {
  const lines = readFileSync(f, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const lab = lines[i].match(/label=["']([^"']{2,40})["']/);
    if (!lab) continue;
    const window = lines.slice(i, i + 6).join(' ');
    for (const m of window.matchAll(/['"]([a-z][A-Za-z0-9]{2,30})['"]/g)) {
      if (!labelsFor.has(m[1])) labelsFor.set(m[1], new Set());
      labelsFor.get(m[1]).add(lab[1]);
    }
  }
}

const files = readdirSync(CB).filter((f) => f.endsWith('.mjs'));
const blob = files.map((f) => readFileSync(join(CB, f), 'utf8')).join('\n');

const out = [];
for (const [section, keys] of Object.entries(sections)) {
  const uniq = [...new Set(keys)];
  const objs = blob.match(new RegExp(`${section}\\s*:\\s*\\{[\\s\\S]{0,3000}?\\}`, 'g')) ?? [];
  const objBlob = objs.join('\n');
  const missing = uniq.filter((k) => {
    if (blob.includes(`${section}.${k}`)) return false;
    if (new RegExp(`\\b${k}\\s*:`).test(objBlob)) return false;
    for (const label of labelsFor.get(k) ?? []) if (blob.includes(`'${label}'`) || blob.includes(`"${label}"`)) return false;
    return true;
  });
  out.push({ section, total: uniq.length, missing });
}
out.sort((a, b) => b.missing.length - a.missing.length);
let t = 0, m = 0;
for (const r of out) { t += r.total; m += r.missing.length; }
console.log(`sections ${out.length}, declared properties ${t}, reached by no check ${m} (${Math.round(m / t * 100)}%)\n`);
for (const r of out) {
  if (!r.missing.length) continue;
  console.log(`${r.section}  ${r.missing.length}/${r.total}\n   ${r.missing.join(' ')}`);
}
