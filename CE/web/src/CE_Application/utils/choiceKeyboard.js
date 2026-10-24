export function choiceKeyIndex(key, index, count) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key) || count < 1) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (index < 0) return key === 'ArrowUp' ? count - 1 : 0;
  return Math.max(0, Math.min(count - 1, index + (key === 'ArrowDown' ? 1 : -1)));
}
