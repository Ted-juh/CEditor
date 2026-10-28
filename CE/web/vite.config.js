import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { writeEmbeddedBundle } from './scripts/embed-web.mjs';

// Stamp the build with the git commit + time so the running app can show
// exactly which version it is — no more guessing whether an installer is current.
function buildStamp() {
  const run = (cmd) => {
    try {
      return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return '';
    }
  };
  return {
    sha: run('git rev-parse --short HEAD') || 'unknown',
    branch: run('git rev-parse --abbrev-ref HEAD') || 'unknown',
    time: `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    version: projectVersion(),
  };
}

// The product version, read from the one place that already decides it: CMakeLists' project().
// package-installer.ps1 greps the same line to name CEditor-Setup-<version>.exe, so the number in
// the status bar and the number on the installer cannot drift.
//
// They had. The status bar carried a hardcoded "CEditor v0.1.0" while the installer said 0.2.0 —
// a string nobody remembers to edit, disagreeing with the artifact users actually download.
function projectVersion() {
  try {
    const cmake = readFileSync(fileURLToPath(new URL('../../CMakeLists.txt', import.meta.url)), 'utf8');
    return cmake.match(/project\s*\(\s*CEditor\s+VERSION\s+([0-9]+\.[0-9]+\.[0-9]+)\s*\)/)?.[1] ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// wasmoon ships one bundle for Node and the browser. Its Emscripten glue asks for Node's `module`
// builtin from inside the `if (isNode)` branch (dist/index.js: `await import('module')`), which in
// WebView2 is dead code — but Vite still resolves the specifier at build time, externalizes it, and
// warns. Handing it an empty module resolves it honestly instead of muting a real question.
//
// `enforce: 'pre'` is required, not stylistic: plain plugins run AFTER vite:resolve, so without it
// the builtin is externalized (and the warning printed) before this ever sees the id.
function stubNodeModuleBuiltin() {
  const VIRTUAL = '\0ce:empty-node-module';
  return {
    name: 'ce-stub-node-module-builtin',
    enforce: 'pre',
    resolveId(id) {
      return id === 'module' || id === 'node:module' ? VIRTUAL : null;
    },
    load(id) {
      return id === VIRTUAL ? 'export default {}; export const createRequire = () => {};' : null;
    },
  };
}

// V8 holds a script's source for as long as the page lives, at one byte per character only while
// every character fits in Latin-1: one character past U+00FF and the whole script is stored at two.
// Most chunks had some — dashes, arrows, ♯ and ♭, in strings and labels: 541 in the 2.9 MB chunk
// every page shares, 1,713 in the editor's 3.9 MB entry — so each of them was held twice over. A
// heap snapshot of the player page with GAIA loaded put external string data at 6.22 MB with them
// and 3.26 MB without.
//
// `esbuild: { charset: 'ascii' }` below writes strings, templates and names as escapes. It leaves a
// regex literal as written, and a regex is where the last eight sat, so this fails the build on any
// chunk that would still be stored two-byte, rather than let one character quietly double it again.
export function oneByteChunks() {
  return {
    name: 'ce-one-byte-chunks',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (!fileName.endsWith('.js')) continue;
        const code = output.type === 'chunk' ? output.code : String(output.source);
        const at = code.search(/[^\x00-\xff]/);
        if (at < 0) continue;
        const char = code.codePointAt(at).toString(16).toUpperCase().padStart(4, '0');
        this.error(`${fileName} has U+${char} at ${JSON.stringify(code.slice(Math.max(0, at - 40), at + 10))}, `
          + `so V8 would hold all of it at two bytes per character. In a regex, write it as \\u${char}.`);
      }
    },
  };
}

// What the player, the plug-in and Hostage embed (scripts/embed-web.mjs says what and why), written
// by the build itself, so that whatever writes dist/ writes dist-embed/ to match. As a step after
// `vite build` in package.json it could be left behind: a bare `vite build`, or one whose next step
// failed, refreshed dist/ and kept an older dist-embed/, and CMake embedded the old pages without a
// word. So a build of dist/ removes dist-embed/ as it starts and writes it once dist/ is complete;
// a build that fails leaves none, and CMake stops on that with an explanation. A build into any
// other folder leaves both alone.
export function embedPlayerBundle({ web = fileURLToPath(new URL('.', import.meta.url)) } = {}) {
  const dist = path.join(web, 'dist');
  const embed = path.join(web, 'dist-embed');
  let outDir = null;
  let failed = false;
  return {
    name: 'ce-embed-player-bundle',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    buildStart() {
      failed = false;
      if (outDir === dist) rmSync(embed, { recursive: true, force: true });
    },
    buildEnd(error) {
      if (error) failed = true;
    },
    renderError() {
      failed = true;
    },
    closeBundle() {
      if (outDir !== dist || failed) return;
      // A build stopped by another plugin's error in generateBundle (oneByteChunks above) still
      // reaches here, with renderError never called, and dist/ holds no pages. Writing the embed
      // then threw "player.html is not in dist; run vite build first", which hid the error that
      // stopped the build behind one that pointed at the wrong step.
      if (!existsSync(path.join(dist, 'player.html'))) return;
      const { files, compressed } = writeEmbeddedBundle(dist, embed, { publicDir: path.join(web, 'public') });
      this.info?.(`dist-embed: ${files.length} files for the player and host pages, ${(compressed / 1048576).toFixed(1)} MB compressed`);
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [stubNodeModuleBuiltin(), svelte(), oneByteChunks(), embedPlayerBundle()],
  define: {
    __APP_BUILD__: JSON.stringify(buildStamp()),
  },
  // Paper.js: one instance, the core build. `paper`'s main entry is paper-full (PaperScript and its
  // parser, dead weight for headless geometry), and paperjs-offset imports the bare specifier and
  // tests `instanceof paper.Path` — so utils/partBooleans.js must load the very same module it does.
  // Both say `paper`; here that means the core build. Node (the tests) resolves paper-full for both,
  // which is again one instance.
  resolve: {
    alias: [{ find: /^paper$/, replacement: 'paper/dist/paper-core.js' }],
  },
  // Production uses a file:// entry point, so built assets must be relative.
  base: command === 'build' ? './' : '/',
  // The font worker (workers/fontWorker.js) loads fontkit, HarfBuzz and the WOFF2 codec on demand, and
  // a worker bundle can only be split like that as an ES module. The client falls back to the page
  // wherever a module worker cannot start (utils/fontWorkerClient.js).
  worker: { format: 'es' },
  server: {
    port: 5173,
    strictPort: true,
    // The CTRL49 screen preview (ctrl49.html) runs the display page the app embeds, from where
    // the app embeds it, so the preview and the keyboard can never be running different files.
    // That directory sits outside CE/web; this lets the dev server read it, and nothing more.
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        fileURLToPath(new URL('../../tools/ctrl49', import.meta.url)),
        // The XML reader the SVG panel importer shares with the Ctrlr importer.
        fileURLToPath(new URL('../../tools/ctrlr-import', import.meta.url)),
      ],
    },
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },
  // Any character past ASCII is written as an escape (`\u2014`), so every chunk is held one byte
  // per character — see oneByteChunks above. The escapes read the same at run time.
  esbuild: { charset: 'ascii' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // dist/.vite/manifest.json: the chunk graph, which scripts/embed-web.mjs follows (with the file
    // names the built files carry) to pick what the player and Hostage embed. Not served, not embedded.
    manifest: true,
    // Rollup's default 500 kB (and the 1400 that replaced it) is a DOWNLOAD budget: it exists to
    // stop a web app shipping megabytes over a network. This app never does. WebViewHost serves
    // dist/ off local disk through a resource provider, so a large chunk costs a disk read and a
    // parse, not a transfer — the same trade the deliberate `treeshake: false` below already
    // makes, buying a 26x faster build for +0.55 MB of bytes that never leave the machine.
    //
    // Three chunks sat above 1400 and none of them is a problem worth splitting:
    //   typescript (~3.6 MB)  third-party, dynamically imported by tsService.js — only when a
    //                         script editor opens, and its size is not ours to control
    //   main       (~3.5 MB)  the editor entry; every section editor is already a lazy chunk
    //   gaia.runtime (~1.8 MB) one device runtime, loaded per device
    //
    // So the limit is raised rather than the chunks split — splitting to satisfy a network
    // heuristic would add build time and complexity for no user-visible gain. It is set to catch
    // runaway growth, not to be met: if `main` ever approaches this, that IS worth investigating,
    // because parse time of the eager entry chunk is the one cost this delivery model still pays.
    //
    // It has already earned its keep once. A fourth chunk appeared above the line at 5.79 MB —
    // MidiMonitorTab — and the growth was not the app's: 99.7% of that file was one lucide licence
    // banner repeated 1702 times, wrapped around 27 kB of code, because a barrel import had crept
    // into a component it renders (see `treeshake: false` below, which explains why a barrel import
    // is not free here). test/bundleHygiene.test.js now fails on both halves of that: any
    // `from 'lucide-svelte'` in src/, and any built chunk over this limit.
    //
    // And again, by `main` itself, at 4.05 MB: a fifth of it was the Yamaha AN1x's device runtime,
    // 1.4 MB of JSON imported statically by deviceAddress.js for one line of the Device insight
    // strip, and parsed at every start. The runtimes load when an address is first asked of one
    // now, and `main` is 3.2 MB. That test only sees a build, and CI's web-tests job does not
    // build, so it is a local gate: `npm run build` before `npm test`.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      // Tree-shaking off: profiling showed Rollup's `include` pass (includeCallArguments alone
      // was ~49% of build time) accounted for 93% of a 4m22s build. Disabling it takes the build
      // to ~10s for +0.55 MB of assets — bytes that are read from local disk in WebView2 and
      // never cross a network. Relies on the per-icon lucide imports (`lucide-svelte/icons/x`):
      // with a barrel import this pulls in all ~1800 icons instead of the 236 used. That is not a
      // hypothetical — one `import { Eraser, Radio } from 'lucide-svelte'` cost 3147 extra modules
      // and 5.76 MB of duplicated licence text, and none of it changed how the app behaved, which
      // is why test/bundleHygiene.test.js guards the rule rather than a reviewer's memory.
      treeshake: false,
      // Four entries: the editor (index.html), the standalone player (player.html), the
      // generated instrument-host product's interface (host.html) — those two served from the
      // embedded bundle (PlayerWebData: what they reach, compressed, by scripts/embed-web.mjs) —
      // and the manual's own window (help.html), which the editor serves from dist/ like itself.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        player: fileURLToPath(new URL('./player.html', import.meta.url)),
        host: fileURLToPath(new URL('./host.html', import.meta.url)),
        help: fileURLToPath(new URL('./help.html', import.meta.url)),
      },
      output: {
        manualChunks: {
          svelte: ['svelte'],
        },
      },
    },
  },
}));
