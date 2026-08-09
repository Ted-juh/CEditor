import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const page = (name) => new URL(`./${name}.html`, import.meta.url).pathname;

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  base: './',
  plugins: [svelte()],
  // The app's entry reads a build stamp the main config injects. These harnesses do not care what
  // it says, only that the identifier resolves.
  define: { __APP_BUILD__: JSON.stringify({ sha: 'check', branch: 'check', time: '', version: '0.0.0' }) },
  build: {
    outDir: '../dist-scenery',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      // Same reason as the main config, and for the same measured cost: Rollup's include pass was
      // 93% of a 4m22s build there. It bit here the moment a harness imported Player.svelte and so
      // pulled in the whole app graph — the build went from 8s to not finishing inside 400s.
      treeshake: false,
      input: ['sceneryGround', 'textPlacement', 'midi', 'monitor', 'strip', 'playerInbound'].map(page),
    },
  },
});
