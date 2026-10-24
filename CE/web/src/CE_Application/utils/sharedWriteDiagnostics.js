// sharedWriteDiagnostics.js — says what a write into a shared section of a loaded panel means.
//
// A loaded panel shares between its controls the sections they leave at their defaults and those
// they change the same way, and freezes them (stores/documentShape.js): a writer that changed one
// in place would change every control holding it. Such a write throws instead, and the error the
// engine gives is all a person sees: "Cannot assign to read only property 'x' of object", with
// nothing about why the object is read-only or what to do. This adds the why, once per message,
// beside the engine's own error rather than in place of it.

// V8 (Chrome, Edge's WebView2, Node) and JavaScriptCore (WebKitGTK, Safari) word these differently.
const FROZEN_WRITE = [
  /Cannot assign to read only property/i,       // V8: a property of a frozen object
  /Cannot add property .*not extensible/i,       // V8: a new key on a frozen object
  /Cannot delete property/i,                     // V8
  /Cannot define property .*not extensible/i,    // V8: defineProperty on a frozen object
  /Attempted to assign to readonly property/i,   // JavaScriptCore
  /Attempting to define property on object that is not extensible/i,  // JavaScriptCore
  /Unable to delete property/i,                  // JavaScriptCore
];

/** The explanation for `error` when it is a write into a frozen object, otherwise null. */
export function describeSharedWrite(error) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!(error instanceof TypeError || typeof error === 'string') || !FROZEN_WRITE.some((pattern) => pattern.test(message))) {
    return null;
  }
  return '[CEditor] A write went into part of a loaded panel that is shared, so it is frozen: either '
    + 'several controls hold that section because they change it the same way, or it is a section '
    + 'left at its defaults, which every control of the type shares. Changing it in place would change '
    + 'all of them. Copy what the write passes through instead (setNestedValueShared, or a deepClone '
    + `draft); stores/documentShape.js says why. The write that failed: ${message}`;
}

/** Listens for uncaught errors and rejections on `target` and explains the ones describeSharedWrite knows. */
export function installSharedWriteDiagnostics(target = globalThis, log = (text) => console.error(text)) {
  if (!target?.addEventListener) return () => {};
  const seen = new Set();
  const explain = (error) => {
    const text = describeSharedWrite(error);
    if (!text || seen.has(text)) return;
    seen.add(text);
    log(text);
  };
  const onError = (event) => explain(event?.error);
  const onRejection = (event) => explain(event?.reason);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
