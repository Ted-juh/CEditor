// helpWindow.js — entry point for the manual's own window.
//
// The editor's Documentation tab can move into a native window of its own (WebViewHost's
// DocumentationWindow, CE/src). That window loads help.html and lands here: the documentation
// viewer and nothing else — no editor, no panels, no session restore — so opening it costs a page
// of text rather than a second copy of the program.
import { mount } from 'svelte';
import './assets/fonts/webFonts.css';
import HelpWindow from './CE_Application/layout/HelpWindow.svelte';

mount(HelpWindow, { target: document.getElementById('app') });
