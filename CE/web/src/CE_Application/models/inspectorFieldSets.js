// inspectorFieldSets.js — the inspector fields of the sections that are drawn from data.
//
// Each set is what the section's editor used to spell out by hand, field for field: the same label,
// span, hint, range, step, default and display. utils/inspectorFields.js describes the kinds and
// properties/FieldList.svelte draws them. `slot` entries are the editor's own snippets, kept in place.
//
// test/inspectorFields.test.js checks every range here against the scripting API's range for the
// same field (componentVerbs.js): the inspector may offer less than a script can reach, never more.

export const KINETIC_FIELDS = [
  { key: 'running', kind: 'toggle', label: 'Run', span: 1, defaultOn: true, hint: 'Integrate the physics in preview / player.' },
  { slot: 'sync' },
  { key: 'editable', kind: 'toggle', label: 'Fling', span: 1, defaultOn: true, hint: 'Drag the ball to throw it in preview.' },
  { slot: 'reset' },
  {
    key: 'gravity', kind: 'range', label: 'Gravity', span: 4, min: 0, max: 4, step: 0.05, default: 0, decimals: 2,
    hint: 'Downward pull. 0 = zero-g; higher makes the ball fall and settle.',
  },
  {
    key: 'restitution', kind: 'range', label: 'Bounce', span: 4, percent: true, default: 0.92,
    hint: 'Wall restitution — energy kept on each bounce. 100% = perpetual motion; lower = the ball loses energy and slows.',
  },
  {
    key: 'friction', kind: 'range', label: 'Drag', span: 4, min: 0, max: 1, step: 0.01, default: 0.04, decimals: 2,
    hint: 'Air resistance — how quickly the ball loses speed over time (0 = frictionless).',
  },
  {
    key: 'keepAlive', kind: 'range', label: 'Keep alive', span: 4, percent: true, default: 0.35,
    hint: 'When the ball nearly stalls, give it a random kick this strong to keep it moving. 0 = let it settle.',
  },
  { key: 'showTrail', kind: 'toggle', label: 'Trail', span: 1, defaultOn: true, hint: 'Comet trail behind the ball.' },
  { key: 'showWalls', kind: 'toggle', label: 'Walls', span: 1, defaultOn: true, hint: 'Draw the box walls.' },
];
