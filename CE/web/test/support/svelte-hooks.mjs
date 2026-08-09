// Node ESM hooks that let `node --test` import .svelte components directly, compiled to their
// server (SSR) form. This exists so component markup can be covered by the normal test run
// instead of only by hand in a browser — see test/canvasTextVisual.test.js.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import ts from 'typescript';

// Vite asset imports (`import wasm from 'x/y.wasm?url'`) are resolved by the bundler, not by Node,
// so a module that uses one could not be imported by a test at all. Resolving the query suffix to a
// stub module that default-exports the path keeps those modules testable — the asset URL only
// matters when the thing behind it is actually loaded, which no test does.
const ASSET_QUERY = /\?(url|raw|inline)$/;

export async function resolve(specifier, context, nextResolve) {
  if (ASSET_QUERY.test(specifier)) {
    return { url: `ce-asset:${specifier}`, format: 'module', shortCircuit: true };
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    // Vite resolves extensionless imports; Node does not, so retry with an extension. `.ts` first,
    // because that is what this project's own source means by it (`from './dragScrub'`). `.js`
    // second, because a published package can do the same — lucide-svelte's Icon.svelte imports
    // './defaultAttributes' and ships it as .js, which made every component using an icon
    // impossible to render in a test at all.
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && !/\.[a-z]+$/i.test(specifier)) {
      for (const ext of ['.ts', '.js']) {
        try {
          return await nextResolve(`${specifier}${ext}`, context);
        } catch { /* try the next extension, then give up with the original error */ }
      }
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('ce-asset:')) {
    const spec = url.slice('ce-asset:'.length).replace(ASSET_QUERY, '');
    return { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(spec)};` };
  }
  if (url.endsWith('.ts')) {
    const filename = fileURLToPath(url);
    const source = await readFile(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    });
    return { format: 'module', shortCircuit: true, source: outputText };
  }
  if (!url.endsWith('.svelte')) return nextLoad(url, context);
  const filename = fileURLToPath(url);
  const source = await readFile(filename, 'utf8');
  const { js } = compile(source, { filename, generate: 'server', css: 'injected' });
  return { format: 'module', shortCircuit: true, source: js.code };
}
