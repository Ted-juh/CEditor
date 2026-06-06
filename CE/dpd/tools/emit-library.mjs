// Bundle the new-DPD library + browser-safe modules INTO the web app, so the in-program
// Device Profile Designer (DeviceProfileDesignerV2.svelte) can resolve/validate profiles client-side
// without a Node CLI or the standalone preview server.
//
// Writes CE/web/src/CE_Application/generated/dpd/:
//   - codecs.mjs, resolve.mjs, merge.mjs, validate.mjs  (verbatim copies; filenames preserved so
//     resolve.mjs's `import './codecs.mjs'` resolves within the folder)
//   - dpdLibrary.json  ({ "<id>": <profile json>, ... } for every CE/dpd/library/*.json)
// Run: node CE/dpd/tools/emit-library.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DPD = join(HERE, '..');
const LIB = join(DPD, 'library');
const OUT = join(DPD, '..', 'web', 'src', 'CE_Application', 'generated', 'dpd');
mkdirSync(OUT, { recursive: true });

// 1. Copy the browser-safe modules (single source of truth = CE/dpd/*.mjs).
const modules = [
  [join(DPD, 'codecs.mjs'), 'codecs.mjs'],
  [join(DPD, 'resolve.mjs'), 'resolve.mjs'],
  [join(DPD, 'merge.mjs'), 'merge.mjs'],
  [join(DPD, 'tools', 'validate.mjs'), 'validate.mjs'],
];
for (const [src, name] of modules) {
  copyFileSync(src, join(OUT, name));
  console.log(`copied ${name}`);
}

// 2. Serialise the library (manufacturer + model + any future profiles) into one importable map.
const library = {};
for (const file of readdirSync(LIB).filter((f) => f.endsWith('.json'))) {
  const profile = JSON.parse(readFileSync(join(LIB, file), 'utf8'));
  library[profile.id ?? basename(file, '.json')] = profile;
}
writeFileSync(join(OUT, 'dpdLibrary.json'), JSON.stringify(library, null, 2));
console.log(`wrote dpdLibrary.json (${Object.keys(library).join(', ')})`);
console.log(`-> ${OUT}`);
