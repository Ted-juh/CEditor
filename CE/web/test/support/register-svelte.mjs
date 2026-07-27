// Installs the .svelte compile hooks for the test run (see svelte-hooks.mjs).
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./svelte-hooks.mjs', pathToFileURL(import.meta.filename));
