import { mount } from 'svelte';
// The faces a panel may use — the ones a control set's `type` block names. The player draws
// panels, so it needs them exactly as the editor does; see assets/fonts/panelFonts.css.
import './assets/fonts/panelFonts.css';
import Player from './Player.svelte';
import { installSharedWriteDiagnostics } from './CE_Application/utils/sharedWriteDiagnostics.js';

// A write into a section the loaded panel shares between controls throws; this says why.
installSharedWriteDiagnostics();

const app = mount(Player, {
  target: document.getElementById('app'),
});

export default app;
