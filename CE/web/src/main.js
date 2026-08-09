import { mount } from 'svelte';
// The editor's two faces, shipped with the app rather than fetched from a CDN. See the header of
// assets/fonts/webFonts.css for why: as a remote @import this cost 12.5 s of blank window on a
// machine that could not reach fonts.googleapis.com.
import './assets/fonts/webFonts.css';
import App from './App.svelte';

const app = mount(App, {
  target: document.getElementById('app'),
});

export default app;
