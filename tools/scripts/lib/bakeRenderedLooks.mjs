// bakeRenderedLooks.mjs — a saved panel's rendered looks, baked for the export tools.
//
// The editor bakes a panel's rendered parts (a knob's plates, a fader's caps, a button's keys) into
// its export, where the webview has WebGL (stores/panelExportPreparation.js), so the plug-in carries
// the images and renders nothing. The tools that export a saved file (prepare-export-panel.mjs,
// export-panel-vst3.mjs, export-panel-template.mjs, through exportDocument.mjs) run in node, which
// has no WebGL, and wrote no images: those parts drew their plain fill in the plug-in.
//
// So the images are drawn in headless Chromium, which has WebGL (software, through SwiftShader),
// with CE/web/src/CE_Application/utils/renderedLookCore.js loaded into a bare page as it is: the
// exact shader and drawing the editor uses, from the specs the editor's parts ask for
// (renderedLookJobs over each control as its set draws it). Playwright finds the browser: its own,
// CHROMIUM_PATH, or Edge on Windows. Without one, the export goes ahead without the images and says
// so, and those parts draw their plain fill, as before.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = path.join(REPO, 'CE/web');
const webSrc = (rel) => pathToFileURL(path.join(WEB, 'src/CE_Application', rel)).href;

/** Playwright's chromium, from CE/web's install or a global one; null when there is none. */
async function findChromium() {
  const require = createRequire(path.join(WEB, 'package.json'));
  const chromiumOf = (mod) => mod?.chromium ?? mod?.default?.chromium ?? null;
  for (const name of ['playwright', 'playwright-core']) {
    for (const load of [() => import(pathToFileURL(require.resolve(name)).href), () => import(name)]) {
      try {
        const chromium = chromiumOf(await load());
        if (chromium) return chromium;
      } catch { /* the next */ }
    }
  }
  return null;
}

async function launch(chromium) {
  const tries = [];
  if (process.env.CHROMIUM_PATH) tries.push({ executablePath: process.env.CHROMIUM_PATH });
  tries.push({});
  if (process.platform === 'win32') tries.push({ channel: 'msedge' }, { channel: 'chrome' });
  let last = null;
  for (const options of tries) {
    try {
      return await chromium.launch({ ...options, args: ['--enable-unsafe-swiftshader', '--no-sandbox'] });
    } catch (error) { last = error; }
  }
  throw last ?? new Error('no browser');
}

/**
 * The images `panel` (a full panel, as the editor's loader makes it) needs, by renderedBakeKey:
 * `{ images, wanted, reason }`. `wanted` counts the distinct images; `reason` says why fewer were
 * made, '' when all were.
 */
export async function bakeRenderedLookImages(panel, { size = 320 } = {}) {
  const { renderedBakeKey, renderedLookJobs } = await import(webSrc('utils/renderedLookCore.js'));
  const { resolveControlForSet } = await import(webSrc('models/controlSetFamilies.js'));
  const { getControlSet } = await import(webSrc('models/controlSets.js'));
  const { controlsInTree } = await import(webSrc('scripting/scriptPanelExport.js'));
  const sources = { document: panel?.controlSets ?? [] };
  const set = getControlSet(panel?.controlSet?.id, sources);
  const jobs = new Map();
  for (const control of controlsInTree(panel?.controls ?? [])) {
    for (const job of renderedLookJobs(resolveControlForSet(control, set, sources), { lamp: set?.lamp ?? null })) {
      jobs.set(renderedBakeKey(job.spec, job.angle), job);
    }
  }
  if (!jobs.size) return { images: {}, wanted: 0, reason: '' };

  const chromium = await findChromium();
  if (!chromium) return { images: {}, wanted: jobs.size, reason: 'Playwright is not installed (npm ci in CE/web installs it)' };
  let browser;
  try {
    browser = await launch(chromium);
  } catch (error) {
    return { images: {}, wanted: jobs.size, reason: `no browser to draw them in (${String(error?.message ?? error).split('\n')[0]}); set CHROMIUM_PATH` };
  }
  const images = {};
  let reason = '';
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><canvas id="c"></canvas>');
    const core = readFileSync(path.join(WEB, 'src/CE_Application/utils/renderedLookCore.js'), 'utf8');
    await page.addScriptTag({ type: 'module', content: `${core}\nwindow.__renderedLook = { createRenderedLookRenderer };` });
    await page.waitForFunction(() => window.__renderedLook, null, { timeout: 15000 });
    for (const [key, { spec, angle }] of jobs) {
      const url = await page.evaluate(({ spec, size, angle }) => {
        if (window.__draw === undefined) window.__draw = window.__renderedLook.createRenderedLookRenderer(document.getElementById('c'));
        return window.__draw ? window.__draw(spec, size, angle) : null;
      }, { spec, size, angle });
      if (typeof url === 'string' && url.startsWith('data:image/')) images[key] = url;
      else { reason = 'the browser has no WebGL2'; break; }
    }
  } catch (error) {
    reason = String(error?.message ?? error).split('\n')[0];
  } finally {
    await browser.close();
  }
  return { images, wanted: jobs.size, reason };
}
