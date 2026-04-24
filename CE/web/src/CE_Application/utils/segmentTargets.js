export const ALL_SEGMENT_TARGET = '__all_segments__';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function getSegmentLabel(row, index = 0) {
  return normalizeText(row?.displayText)
    || normalizeText(row?.internalValue)
    || normalizeText(row?.id)
    || `Option ${index + 1}`;
}

export function buildSegmentTargetOptions(valueSection, { includeAll = true } = {}) {
  const rows = Array.isArray(valueSection?.rows) ? valueSection.rows : [];
  const items = rows.map((row, index) => ({
    id: String(row?.id ?? `row_${index + 1}`),
    label: getSegmentLabel(row, index),
    row,
  }));

  if (!includeAll) return items;

  return [
    {
      id: ALL_SEGMENT_TARGET,
      label: 'All',
      row: null,
    },
    ...items,
  ];
}

export function normalizeSegmentTargetIds(valueSection, segmentIds = []) {
  const validIds = new Set(buildSegmentTargetOptions(valueSection, { includeAll: false }).map((item) => item.id));
  const nextIds = [];

  for (const segmentId of Array.isArray(segmentIds) ? segmentIds : []) {
    const normalizedId = String(segmentId ?? '').trim();
    if (!normalizedId || !validIds.has(normalizedId) || nextIds.includes(normalizedId)) continue;
    nextIds.push(normalizedId);
  }

  return nextIds;
}

