// ctrlr-corpus.mjs — fetch the public Ctrlr panels the importer was measured on, for a local run.
//
//   node tools/scripts/ctrlr-corpus.mjs <directory>
//   node tools/scripts/ctrlr-import.mjs --corpus <directory> --verify
//
// The panels belong to their authors and are NOT in this repository: this clones the public
// repositories that hold them into a directory of your choosing (outside the checkout), shallow,
// and skips any already there. Nothing here is run by the tests or by CI. What the run found is in
// docs/design/ctrlr-import-plan.md, "What real panels showed".
//
// The SourceForge projects at the end are where most of dnaldoog's panels live, as programs and
// archives. They are listed, not fetched: their download pages are HTML, not an API. Download the
// files from each project's Files tab into <directory>/sf/<project>/ and unpack the archives —
// ctrlr-import.mjs reads a program Ctrlr exported (.exe, .dll, .vst3, .so) as it reads a panel.
//
// Some panels in the community index (gitlab.com/ctrlr-panels/ctrlr-panels-list) are hosted only
// on personal sites or the Internet Archive; those are not listed here.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const GITHUB = [
  'AlpesMachines/Matrix-Ctrlr', 'AndyBorek/CraftSynthCtrlr', 'ChrisBall/003_Synth',
  'Christedge/CTRLR-Panels', 'Enno-Soniq/ctrlr-Korg-A2-panel', 'FRDTom/TR-Rack-Editor',
  'HBurd/484project', 'Mickaell22/CtrlR', 'MiguSchweiz/ctrlrpanels', 'RomanKubiak/Panels',
  'UA3MQJ/fpga-synth', 'VitaSound/hdl-modules', 'atomicstack/roland_boutique_ctrlr',
  'damiensellier/CtrlrX', 'dekstop/JV-2080-Classic-Pads', 'dervur/Korg-Volca-Kick-Editor',
  'dnaldoog/CtrlrDemoPanels', 'dnaldoog/ctrlr', 'dont-be-evil-company/remnix',
  'eokuwwy/juno-66-ctrlr-panel', 'fredzo/Hughes-KettnerRemote', 'hjanetzek/mamuse-ctrlrx',
  'hotchk155/pokey-synth', 'inteyes/AN200-Voice-Editor', 'inteyes/ReMS2000',
  'inteyes/X-Station-Voice-Editor', 'jake9050/emuCtrlr', 'jbeuckm/Ctrlr-Lexicon-MPX100',
  'jbeuckm/Ctrlr-Quadraverb', 'keinstein/ctrlrpanels', 'kokoza/Roland-JV-2080',
  'krylenko/KawaiK1Panel', 'lemonyzer/MIDI-Ctrlr-Ketron-SD1000',
  'lemonyzer/ctrlr-panel-lua-script-export', 'neufena/ctrlr-panels',
  'ngeiswei/ctrlr-roland-a30-panel', 'now-its-dark/PLG100-SG-Tone-Editor', 'ravagit/ctrlrpanels',
  'rheslip/XFM2_Editor_Librarian', 'rheslip/XVA1-Editor-Librarian', 'rheslip/XVA1-Editor_Librarian',
  'sgorpi/sgorpi_CtrlrX_panels', 'shooking/ZoomPedalFun', 'synthmutt/CtrlrPanelSequential',
  'taisto/boutique-ctrlrpanel', 'tcodej/ctrlr-roland-d20', 'theacodes/genesynth',
  'unityconstruct/CtrlrPanels', 'vk2gpu/4op_drum_synth',
].map((slug) => `https://github.com/${slug}`);

const GITLAB = [
  'Baggypants/novation-mininova-ctrlr', 'ctrlr-panels/ctrlr-panels-list', 'ctrlr-panels/roland-sc-55',
  'ctrlr-panels/yamaha-fx900', 'kjudd/ctrlr',
].map((slug) => `https://gitlab.com/${slug}`);

// dnaldoog's projects are under the SourceForge user "zaniah"; the rest are other authors'.
const SOURCEFORGE = [
  'ajed', 'c-juno-106', 'c-m3r-editor', 'c-plg150-an', 'c-v50-editor', 'ctrlr-utilities', 'ctx81z',
  'jd990-super-editor', 'juno-alpha', 'jv-1010-editor', 'jv-patched', 'jv-patched-jv-90',
  'jv-patched-jv-xp', 'kwaves', 'm300-editor', 'mpx100-editor', 'mu-r201', 'mwavexl',
  'yamaha-rev500', 'zoom-rfx-2000-editor',
];

const target = process.argv[2];
if (!target) {
  console.error('usage: ctrlr-corpus.mjs <directory>   (somewhere outside this checkout)');
  process.exit(2);
}
const repos = path.join(path.resolve(target), 'repos');
mkdirSync(repos, { recursive: true });

let cloned = 0;
let present = 0;
const failed = [];
for (const url of [...GITHUB, ...GITLAB]) {
  const dir = path.join(repos, url.split('/').slice(-2).join('_'));
  if (existsSync(dir)) { present += 1; continue; }
  console.log(`clone ${url}`);
  const run = spawnSync('git', ['clone', '--quiet', '--depth', '1', url, dir], { stdio: 'inherit' });
  if (run.status === 0) cloned += 1;
  else failed.push(url);
}

console.log(`\n${cloned} cloned, ${present} already there, ${failed.length} failed${failed.length ? `: ${failed.join(', ')}` : ''}`);
console.log(`\nBy hand, into ${path.join(path.resolve(target), 'sf')}/<project>/ (see the header of this script):`);
for (const project of SOURCEFORGE) console.log(`  https://sourceforge.net/projects/${project}/files/`);
console.log(`\nThen: node tools/scripts/ctrlr-import.mjs --corpus ${target} --verify`);
process.exitCode = failed.length ? 1 : 0;
