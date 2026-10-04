/**
 * fontWorker.js — the font work that is too slow for the page, on a thread of its own.
 *
 * Two jobs, both pure computation over font bytes, both previously run on the main thread where
 * they froze the editor while they ran:
 *
 *   buildAtlas   a glyph atlas for a face (utils/glyphAtlasBuild.js): ~half a second per face, paid
 *                the first time a combined shape with text in an imported font is cached.
 *   subset       a carried font cut to the panel's characters and recompressed (utils/fontSubset.js):
 *                HarfBuzz plus WOFF2, per face, every time a panel is packaged or exported.
 *
 * Spoken to through Comlink (Apache-2.0) by utils/fontWorkerClient.js, which also runs the same
 * functions on the page when there is no worker. `fontWorkerApi` is exported so the tests can call
 * it directly and compare it with the page's result.
 */
import * as Comlink from 'comlink';
import { atlasFromFont } from '../utils/glyphAtlasBuild.js';
import { subsetFontDataUrl } from '../utils/fontSubset.js';

let fontkitModule = null;
async function fontkit() {
  fontkitModule ??= import('fontkit').then((module) => module.default ?? module);
  return fontkitModule;
}

export const fontWorkerApi = {
  /**
   * `sfnt`: the face's TrueType/OpenType bytes (an ArrayBuffer). `meta` as atlasFromFont takes it.
   * `weight`: the instance to take of a variable face, or null for a static one.
   */
  async buildAtlas(sfnt, meta, weight) {
    // fontkit reads through a DataView over `.buffer`; in node it wants a Buffer (fontSources.bytesFor).
    const bytes = globalThis.process?.versions?.node && typeof Buffer !== 'undefined' ? Buffer.from(sfnt) : new Uint8Array(sfnt);
    let font = (await fontkit()).create(bytes);
    if (weight != null && font.variationAxes?.wght) {
      const axis = font.variationAxes.wght;
      font = font.getVariation({ wght: Math.max(axis.min, Math.min(axis.max, Number(weight) || axis.default)) });
    }
    return atlasFromFont(font, meta);
  },

  subset(dataUrl, codePoints) {
    return subsetFontDataUrl(dataUrl, codePoints);
  },
};

// Only when actually running as a worker; importing this module anywhere else exposes nothing.
if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  Comlink.expose(fontWorkerApi);
}
