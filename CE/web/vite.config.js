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
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
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
