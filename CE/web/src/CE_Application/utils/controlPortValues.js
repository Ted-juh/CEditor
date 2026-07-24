// Fan-out binding: a multi-port native control resolves a value for EACH of its
// semantic ports, so one control can drive many device parameters at once (an
// Envelope → attack/decay/sustain/release; later a Mod Matrix → one per cell).
// A registry keyed by controlType; each resolver returns { portId: value }.
// Single-port controls (their value flows through the normal `value`/`state`/…
// binding path) return null here. Pure — no store/DOM deps.
import { envelopeStageValues } from './envelopeLayout.js';
import { matrixPortValues } from './matrixLayout.js';
import { joystickPortValues } from './joystickLayout.js';
import { crossfaderPortValues } from './crossfaderLayout.js';
import { ribbonPortValues } from './ribbonLayout.js';
import { macroPortValues } from './macroLayout.js';
import { orbitPortValues } from './orbitLayout.js';
import { looperPortValues } from './looperLayout.js';
import { routerPortValues } from './routerLayout.js';
import { timbrePortValues } from './timbreLayout.js';
import { turingPortValues } from './turingLayout.js';
import { kineticPortValues } from './kineticLayout.js';

const RESOLVERS = {
  Envelope: (control) => envelopeStageValues(control),
  Matrix: (control) => matrixPortValues(control),
  VectorJoystick: (control) => joystickPortValues(control),
  Crossfader: (control) => crossfaderPortValues(control),
  Ribbon: (control) => ribbonPortValues(control),
  Macro: (control) => macroPortValues(control),
  Orbit: (control) => orbitPortValues(control),
  Looper: (control) => looperPortValues(control),
  Router: (control) => routerPortValues(control),
  Timbre: (control) => timbrePortValues(control),
  Turing: (control) => turingPortValues(control),
  Kinetic: (control) => kineticPortValues(control),
};

// The map of { portId: value } a multi-port control currently exposes, or null.
export function controlPortValues(control) {
  const type = String(control?._children?.Core?.controlType ?? '');
  const resolver = RESOLVERS[type];
  return resolver ? resolver(control) : null;
}

// True when this control type fans out to multiple device-parameter ports.
export function isFanoutControl(control) {
  return RESOLVERS[String(control?._children?.Core?.controlType ?? '')] !== undefined;
}
