import { createDefaultInteractiveSections } from '../models/interactionDefaults.js';
import { formatRangeValue } from './rangeBehavior.js';

// Changing the rendering keeps authored behavior and regenerates variant-specific artwork.
export function createRangeVariantSections(behavior, variant) {
  const target = variant === 'slider' ? 'slider' : 'spinner';
  const sections = createDefaultInteractiveSections(target === 'slider' ? 'Slider' : 'Range');
  sections.Behavior = { ...sections.Behavior, ...behavior,
    family: 'range', role: target === 'slider' ? 'slider' : 'spinbox',
    variant: target, valueMode: 'range' };
  if (target === 'spinner') {
    for (const [part, key] of [['lowField','defaultStartValue'],['highField','defaultEndValue']]) {
      const text = sections.Parts?._children?.[part]?._children?.Text;
      if (text) text.content = formatRangeValue(sections.Behavior, sections.Behavior[key]);
    }
  }
  return sections;
}
