// Node ESM hooks that let `node --test` import .svelte components directly, compiled to their
// server (SSR) form. This exists so component markup can be covered by the normal test run
// instead of only by hand in a browser — see test/canvasTextVisual.test.js.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';

export async function load(url, context, nextLoad) {
  if (!url.endsWith('.svelte')) return nextLoad(url, context);
  const filename = fileURLToPath(url);
  const source = await readFile(filename, 'utf8');
  const { js } = compile(source, { filename, generate: 'server', css: 'injected' });
  return { format: 'module', shortCircuit: true, source: js.code };
}
