import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  base: './',
  plugins: [svelte()],
  build: { outDir: '../dist-scenery', emptyOutDir: true, rollupOptions: { input: [new URL('./sceneryGround.html', import.meta.url).pathname, new URL('./textPlacement.html', import.meta.url).pathname] } },
});
