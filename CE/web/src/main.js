import { mount } from 'svelte';
// The editor's two faces, shipped with the app rather than fetched from a CDN. See the header of
// assets/fonts/webFonts.css for why: as a remote @import this cost 12.5 s of blank window on a
// machine that could not reach fonts.googleapis.com.
import './assets/fonts/webFonts.css';
// The faces a panel may use (a control set's `type` block); the player loads the same sheet.
import './assets/fonts/panelFonts.css';
import App from './App.svelte';
import { wireFontOutlineSources } from './CE_Application/stores/fontOutlineSources.js';
import { wireDocumentIcons } from './CE_Application/stores/documentIconSources.js';

// Imported fonts for text turned into outlines, and the fonts open panels carry.
wireFontOutlineSources();
// The icons open panels carry, for panels shared by someone whose icon library this is not.
wireDocumentIcons();

const app = mount(App, {
  target: document.getElementById('app'),
});

export default app;
