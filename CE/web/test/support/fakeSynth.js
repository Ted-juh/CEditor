// fakeSynth.js — a synth that exists only in the test suite.
//
// The capture-session plan is explicit about this: "Do not test this against hardware alone;
// hardware is not reproducible and a nightly cannot own a Juno." So the answer key is a simulated
// device with a known parameter map, and the inference engine has to recover it.
//
// It is deliberately AWKWARD, because the easy devices were never the problem. It carries:
//
//   * plain 7-bit parameters (the common case),
//   * a 14-bit parameter across two bytes, MSB first,
//   * a nibble-encoded parameter,
//   * TWO parameters sharing one byte as a bit-field — the case only a human can finish,
//   * a volatile counter that ticks on every dump and must be masked out,
//   * a Roland-style two's-complement checksum over a range that EXCLUDES the header,
//   * idle CC chatter on the live stream, so first-past-the-post attribution fails.
//
// Everything an inference engine could plausibly get wrong is in here on purpose.

import { computeChecksum } from '../../src/CE_Application/utils/checksums.js';

/** The answer key. The inference engine never sees this; the assertions do. */
export const FAKE_MAP = [
  { id: 'filter.cutoff', label: 'Cutoff', offset: 4, size: 1, encoding: 'u7', min: 0, max: 127, cc: 74 },
  { id: 'filter.res', label: 'Resonance', offset: 5, size: 1, encoding: 'u7', min: 0, max: 127, cc: 71 },
  { id: 'osc.fine', label: 'Fine tune', offset: 6, size: 2, encoding: 'u14', min: 0, max: 16383, cc: null },
  { id: 'amp.level', label: 'Level', offset: 8, size: 4, encoding: 'nibbles', min: 0, max: 65535, cc: null },
  // One byte, two parameters. Bits 0–2 are the wave; bits 4–5 are the octave.
  { id: 'osc.wave', label: 'Waveform', offset: 12, size: 1, encoding: 'bits', bits: [0, 1, 2], min: 0, max: 7, cc: null },
  { id: 'osc.octave', label: 'Octave', offset: 12, size: 1, encoding: 'bits', bits: [4, 5], min: 0, max: 3, cc: null },
];

/** Header bytes the checksum does NOT cover — the trap the plan names explicitly. */
const HEADER = [0xf0, 0x41, 0x10, 0x00];
const HEADER_LENGTH = HEADER.length;
const COUNTER_OFFSET = 13;
const CHECKSUM_OFFSET = 14;
const PAYLOAD_LENGTH = 15;

export function createFakeSynth({ checksum = 'roland-7bit', volatileCounter = true } = {}) {
  // Deliberate starting values rather than a formula. The octave in particular starts NON-ZERO,
  // because a byte whose other bits are always zero carries no evidence that it is shared — and a
  // synth really does sit with its octave centred rather than at the bottom.
  const INITIAL = {
    'filter.cutoff': 64, 'filter.res': 31, 'osc.fine': 8192,
    'amp.level': 0x1000, 'osc.wave': 2, 'osc.octave': 2,
  };
  const values = new Map(FAKE_MAP.map((p) => [p.id, INITIAL[p.id] ?? Math.floor((p.min + p.max) / 4)]));
  let counter = 0;
  // A deterministic idle stream: a real synth's chatter, without Math.random making a test flaky.
  let chatter = 0;

  function encodeInto(payload, parameter, value) {
    switch (parameter.encoding) {
      case 'u7':
        payload[parameter.offset] = value & 0x7f;
        break;
      case 'u14':
        payload[parameter.offset] = (value >> 7) & 0x7f;
        payload[parameter.offset + 1] = value & 0x7f;
        break;
      case 'nibbles':
        for (let i = 0; i < parameter.size; i += 1) {
          payload[parameter.offset + i] = (value >> (4 * (parameter.size - 1 - i))) & 0x0f;
        }
        break;
      case 'bits': {
        const shift = parameter.bits[0];
        const mask = parameter.bits.reduce((m, bit) => m | (1 << bit), 0);
        payload[parameter.offset] = (payload[parameter.offset] & ~mask) | ((value << shift) & mask);
        break;
      }
      default:
        break;
    }
  }

  function decodeFrom(payload, parameter) {
    switch (parameter.encoding) {
      case 'u7': return payload[parameter.offset];
      case 'u14': return (payload[parameter.offset] << 7) | payload[parameter.offset + 1];
      case 'nibbles': {
        let v = 0;
        for (let i = 0; i < parameter.size; i += 1) v = (v << 4) | (payload[parameter.offset + i] & 0x0f);
        return v;
      }
      case 'bits': {
        const shift = parameter.bits[0];
        const mask = parameter.bits.reduce((m, bit) => m | (1 << bit), 0);
        return (payload[parameter.offset] & mask) >> shift;
      }
      default: return 0;
    }
  }

  return {
    /** The parameter ids this device has. */
    ids: () => FAKE_MAP.map((p) => p.id),

    /** Move a front-panel control. Returns the live messages the device would transmit, if any. */
    set(id, value) {
      const parameter = FAKE_MAP.find((p) => p.id === id);
      if (!parameter) throw new Error(`no such parameter: ${id}`);
      const clamped = Math.max(parameter.min, Math.min(parameter.max, Math.round(value)));
      values.set(id, clamped);
      return parameter.cc === null ? [] : [{ kind: 'cc', channel: 0, controller: parameter.cc, value: clamped }];
    },

    get(id) {
      return values.get(id);
    },

    /**
     * A dump. Header, payload, a counter that ticks, and a checksum over the payload only.
     *
     * The counter is what makes the volatile-mask step necessary rather than theoretical: without
     * masking it, every diff has an extra changed offset and every classification is wrong.
     */
    dump() {
      const payload = new Array(PAYLOAD_LENGTH).fill(0);
      for (let i = 0; i < HEADER_LENGTH; i += 1) payload[i] = HEADER[i];
      for (const parameter of FAKE_MAP) encodeInto(payload, parameter, values.get(parameter.id));
      if (volatileCounter) { counter = (counter + 1) & 0x7f; payload[COUNTER_OFFSET] = counter; }
      if (checksum) {
        payload[CHECKSUM_OFFSET] = computeChecksum(checksum, payload.slice(HEADER_LENGTH, CHECKSUM_OFFSET));
      }
      return payload;
    },

    /** Write a value straight into the device, the way a verify pass would. */
    write(parameter, value) {
      const id = parameter?.id ?? parameter;
      this.set(id, value);
    },

    /** Read one back, the way a verify pass would. */
    read(parameter) {
      const id = parameter?.id ?? parameter;
      const spec = FAKE_MAP.find((p) => p.id === id);
      return spec ? decodeFrom(this.dump(), spec) : undefined;
    },

    /**
     * Idle traffic. A real synth is never silent, and a capture that assumed it was would learn
     * whatever spoke first — which is the mistake the attribution rule exists to avoid.
     */
    idleChatter(count = 6) {
      const out = [];
      for (let i = 0; i < count; i += 1) {
        chatter = (chatter + 3) & 0x0f;
        // Modulation wheel drifting a little, and a breath controller that never moves far.
        out.push({ kind: 'cc', channel: 0, controller: 1, value: 60 + (chatter % 4) });
        out.push({ kind: 'cc', channel: 0, controller: 2, value: 10 });
      }
      return out;
    },

    /** A sweep of one control, as the device would transmit it. */
    sweep(id, from, to, steps = 12) {
      const parameter = FAKE_MAP.find((p) => p.id === id);
      const out = [];
      for (let i = 0; i <= steps; i += 1) {
        const value = Math.round(from + ((to - from) * i) / steps);
        out.push(...this.set(id, value));
      }
      if (parameter?.cc === null) return [];
      return out;
    },

    /** Where the checksum and counter actually are — for assertions, not for the engine. */
    layout: {
      headerLength: HEADER_LENGTH,
      counterOffset: COUNTER_OFFSET,
      checksumOffset: CHECKSUM_OFFSET,
      payloadLength: PAYLOAD_LENGTH,
      checksumAlgorithm: checksum,
    },
  };
}
