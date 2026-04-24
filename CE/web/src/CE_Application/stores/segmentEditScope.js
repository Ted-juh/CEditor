import { writable } from 'svelte/store';

const DEFAULT_SCOPE = {
  mode: 'all',
  segmentIds: [],
};

function normalizeIds(ids = []) {
  const nextIds = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    const normalized = String(id ?? '').trim();
    if (!normalized || nextIds.includes(normalized)) continue;
    nextIds.push(normalized);
  }
  return nextIds;
}

function sameScope(left, right) {
  const leftMode = left?.mode ?? 'all';
  const rightMode = right?.mode ?? 'all';
  const leftIds = normalizeIds(left?.segmentIds ?? []);
  const rightIds = normalizeIds(right?.segmentIds ?? []);

  return leftMode === rightMode
    && leftIds.length === rightIds.length
    && leftIds.every((id, index) => id === rightIds[index]);
}

export const segmentEditScope = writable({ ...DEFAULT_SCOPE });

export function setSegmentEditScopeAll() {
  segmentEditScope.update((current) => (
    sameScope(current, DEFAULT_SCOPE) ? current : { ...DEFAULT_SCOPE }
  ));
}

export function setSegmentEditScopeSegments(segmentIds = []) {
  const nextIds = normalizeIds(segmentIds);
  if (nextIds.length === 0) {
    setSegmentEditScopeAll();
    return;
  }

  const nextScope = {
    mode: 'segments',
    segmentIds: nextIds,
  };

  segmentEditScope.update((current) => (
    sameScope(current, nextScope) ? current : nextScope
  ));
}

export function toggleSegmentEditScopeSegment(segmentId = '') {
  const normalizedId = String(segmentId ?? '').trim();
  if (!normalizedId) {
    setSegmentEditScopeAll();
    return;
  }

  segmentEditScope.update((current) => {
    const currentIds = current?.mode === 'segments'
      ? normalizeIds(current?.segmentIds ?? [])
      : [];
    const exists = currentIds.includes(normalizedId);
    const nextIds = exists
      ? currentIds.filter((id) => id !== normalizedId)
      : [...currentIds, normalizedId];

    return nextIds.length === 0
      ? { ...DEFAULT_SCOPE }
      : {
        mode: 'segments',
        segmentIds: nextIds,
      };
  });
}
