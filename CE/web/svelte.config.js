import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// `npm run check` passes this file explicitly. Without that, svelte-check treats
// browser-checks/vite.config.mjs as the harness files' nearest Svelte config; the checker cannot
// extract options from the Vite 6 plugin shape and reports one configuration error per harness.
export default {
  preprocess: vitePreprocess(),
};
