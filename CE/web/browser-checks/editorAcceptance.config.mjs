import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)), base: './', plugins: [svelte()],
  define: { __APP_BUILD__: JSON.stringify({ sha: 'acceptance', branch: 'main', time: '', version: '0.2.0' }) },
  build: { outDir: '../dist-acceptance', emptyOutDir: true, chunkSizeWarningLimit: 4500,
    rollupOptions: { treeshake: false, input: fileURLToPath(new URL('./editorAcceptance.html', import.meta.url)) } },
});
