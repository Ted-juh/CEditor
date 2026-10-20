// layoutWords.js — the words ce.panel's arrangement verbs take (align's edge, distribute's what,
// match's what, flip's axis, order's where), and what each says of one it does not, in one place:
// the runtime (panelRuntime.js) refuses with these sentences, the API lists the words, and the
// script editor's Values tab offers them and says the refusal in the runtime's words.
//
// Each verb refused an unknown word in a sentence of its own, but the API documented the words only
// in prose, so the Values tab had nothing to offer and nothing to say. The words are case-sensitive,
// as the runtime has always read them: "Left" is refused.

export const LAYOUT_WORDS = {
  panelAlign: {
    param: 'edge', values: ['left', 'hCenter', 'right', 'top', 'vCenter', 'bottom'],
    refusal: (v, list) => `ce.panel.align: "${v}" is not an edge. One of: ${list.join(', ')}.`,
  },
  panelDistribute: {
    param: 'what', values: ['leftEdges', 'hCenters', 'rightEdges', 'topEdges', 'vCenters', 'bottomEdges', 'hSpacing', 'vSpacing'],
    refusal: (v, list) => `ce.panel.distribute: "${v}" is not something to spread. One of: ${list.join(', ')}.`,
  },
  // match and flip read a word left out as their first; the rest refuse it.
  panelMatch: {
    param: 'what', values: ['width', 'height', 'both'], absent: 'both',
    refusal: (v) => `ce.panel.match: "${v}" is not width, height or both.`,
  },
  panelFlip: {
    param: 'axis', values: ['horizontal', 'vertical'], absent: 'horizontal',
    refusal: (v) => `ce.panel.flip: "${v}" is not horizontal or vertical.`,
  },
  panelOrder: {
    param: 'where', values: ['front', 'forward', 'backward', 'back'],
    refusal: (v) => `ce.panel.order: "${v}" is not front, forward, backward or back.`,
  },
};

/** The word an arrangement verb reads `value` as, or `refused`, its sentence for one it does not take. */
export function layoutWord(memberId, value) {
  const spec = LAYOUT_WORDS[memberId];
  const which = String(value ?? spec.absent ?? '');
  return spec.values.includes(which) ? { which, refused: null } : { which, refused: spec.refusal(value, spec.values) };
}
