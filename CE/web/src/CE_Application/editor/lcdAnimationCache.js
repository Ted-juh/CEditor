// Cache identity for placeable LCD animations. The full source is intentional: data URLs with
// equal lengths and suffixes are common, and a shortened source key can silently reuse pixels
// decoded from a different animation.
export function lcdAnimationCacheKey(animation, dither) {
  const a = animation ?? {};
  return JSON.stringify([
    String(a.src ?? ''),
    String(a.w ?? ''),
    String(a.h ?? ''),
    String(a.frames ?? ''),
    String(a.spriteCols ?? ''),
    String(a.fps ?? ''),
    Boolean(dither),
    a.colourful === true,
  ]);
}

export function pruneLcdAnimationCaches(caches, animations) {
  const current = caches && typeof caches === 'object' ? caches : {};
  const activeIds = new Set(
    (Array.isArray(animations) ? animations : []).map((animation) => String(animation?.id ?? '')),
  );
  const staleIds = Object.keys(current).filter((id) => !activeIds.has(id));
  if (!staleIds.length) return current;

  const next = { ...current };
  for (const id of staleIds) delete next[id];
  return next;
}
