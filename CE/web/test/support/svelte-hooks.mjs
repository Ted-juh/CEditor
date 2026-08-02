// Node ESM hooks that let `node --test` import .svelte components directly, compiled to their
// server (SSR) form. This exists so component markup can be covered by the normal test run
// instead of only by hand in a browser — see test/canvasTextVisual.test.js.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';

// Vite-style `?url` asset imports (e.g. wasmoon's glue.wasm in panelRuntime.js) have no meaning
// under node — resolve them to a stub module whose default export is an empty URL string.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.includes('?url')) return { url: 'ceditor-asset-url:' + specifier, shortCircuit: true };
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('ceditor-asset-url:'))
    return { format: 'module', shortCircuit: true, source: 'export default "";' };
  if (!url.endsWith('.svelte')) return nextLoad(url, context);
  const filename = fileURLToPath(url);
  const source = await readFile(filename, 'utf8');
  const { js } = compile(source, { filename, generate: 'server', css: 'injected' });
  return { format: 'module', shortCircuit: true, source: js.code };
}
