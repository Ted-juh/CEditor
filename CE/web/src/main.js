import { mount } from 'svelte';
import App from './App.svelte';
import { loadWebFonts } from './CE_Application/utils/webFonts.js';

const app = mount(App, {
  target: document.getElementById('app'),
});

// After mount, never before: these faces are a refinement, and the editor must not wait on a
// third party to show itself. See utils/webFonts.js.
loadWebFonts();

export default app;
