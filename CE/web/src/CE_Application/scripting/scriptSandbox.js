// Non-JavaScript preview engines still receive host callbacks. SES seals those
// callbacks' constructor chains; JavaScript itself runs in bounded QuickJS WASM.
import 'ses';
import { evaluateBoundedJavascript, initialiseJavascriptSandbox } from './boundedJavascript.js';
export { initialiseJavascriptSandbox } from './boundedJavascript.js';
export { disposeJavascriptSandboxes } from './boundedJavascript.js';

let sealed = false;
export async function ensureScriptSandbox() {
  await initialiseJavascriptSandbox();
  if (sealed) return;
  // Svelte installs its development diagnostics during mount. Seal after that
  // trusted initialization, but always before executing any panel language.
  globalThis.lockdown({ errorTaming: 'unsafe', consoleTaming: 'unsafe', stackFiltering: 'verbose' });
  sealed = true;
}

/** Each script has its own globals; only the panel API is endowed. */
export function evaluatePanelSource(source, api, names, options) {
  return evaluateBoundedJavascript(source, api, names, options);
}
