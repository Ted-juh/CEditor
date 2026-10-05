// Shared by the C++, C# and Java preview interpreters. Nested calls and callbacks
// share a budget; catching an exception in guest code cannot reset it.
let depth = 0;
let steps = 0;
let deadline = 0;
let allocated = 0;
export class PreviewLimitError extends Error {}
export function previewAllocation(size) {
  const count = Math.max(0, Math.trunc(Number(size)));
  if (!Number.isFinite(count) || (allocated += count) > 1000000)
    throw new PreviewLimitError('Preview script allocation limit exceeded');
  return count;
}
export function previewStep() {
  if (++steps > 100000 || (steps % 256 === 0 && performance.now() >= deadline))
    throw new PreviewLimitError('Preview script execution limit exceeded');
}
export function withPreviewBudget(fn) {
  if (depth === 0) { steps = 0; allocated = 0; deadline = performance.now() + 250; }
  if (++depth > 128) { depth--; throw new PreviewLimitError('Preview script recursion limit exceeded'); }
  try { return fn(); } finally { depth--; }
}
