import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
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
  };
}

export default defineConfig(({ command }) => ({
  plugins: [svelte()],
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
    //   main       (~2.0 MB)  the editor entry; every section editor is already a lazy chunk
    //   gaia.runtime (~1.7 MB) one device runtime, loaded per device
    //
    // So the limit is raised rather than the chunks split — splitting to satisfy a network
    // heuristic would add build time and complexity for no user-visible gain. It is set to catch
    // runaway growth, not to be met: if `main` ever approaches this, that IS worth investigating,
    // because parse time of the eager entry chunk is the one cost this delivery model still pays.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      // Tree-shaking off: profiling showed Rollup's `include` pass (includeCallArguments alone
      // was ~49% of build time) accounted for 93% of a 4m22s build. Disabling it takes the build
      // to ~10s for +0.55 MB of assets — bytes that are read from local disk in WebView2 and
      // never cross a network. Relies on the per-icon lucide imports (`lucide-svelte/icons/x`):
      // with the old barrel import this would pull in all ~1800 icons instead of the 152 used.
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
