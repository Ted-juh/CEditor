import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

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

export default defineConfig(({ command }) => ({
  plugins: [stubNodeModuleBuiltin(), svelte()],
  define: {
    __APP_BUILD__: JSON.stringify(buildStamp()),
  },
  // Production uses a file:// entry point, so built assets must be relative.
  base: command === 'build' ? './' : '/',
  server: {
    port: 5173,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
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
      // Two entries: the editor (index.html) and the standalone player (player.html).
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        player: fileURLToPath(new URL('./player.html', import.meta.url)),
      },
      output: {
        manualChunks: {
          svelte: ['svelte'],
        },
      },
    },
  },
}));
