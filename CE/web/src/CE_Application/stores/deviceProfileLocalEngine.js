// Local (JUCE-less / draft-source) profile engine: hex parsing, parameter/request/identity
// compilation, dump parsing + collection, preset-scan building and source validation.
// Pure logic — its only store dependency is reading profileSources as a source-text fallback.
import { get } from 'svelte/store';
import { isJuceAvailable } from '../bridge/bridge.js';
import { profileSources } from './deviceProfileStores.js';
import { DEFAULT_DEVICE_ROLE } from './deviceConstants.js';
// One checksum table, shared with ce.midi.checksum — the two used to be separate implementations
// that already disagreed about which algorithms exist (design doc §48).
import { checksumBytes } from '../utils/checksums.js';

export function bytesToHex(bytes = []) {
  return (bytes ?? [])
    .map((byte) => Number(byte).toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

export function clampInt(value, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

export function normalizeHex(value = '') {
  return String(value ?? '').trim().toUpperCase().split(/[\s,]+/).filter(Boolean).join(' ');
}

export function parseRawMidiHexText(value = '') {
  const tokens = normalizeHex(value).split(' ').filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: 'Bulk dump hex is required', bytes: [] };

  const bytes = [];
  for (const token of tokens) {
    if (!/^[0-9A-F]{1,2}$/.test(token)) {
      return { ok: false, error: `Invalid MIDI byte: ${token}`, bytes: [] };
    }
    const byte = parseInt(token, 16);
    if (!Number.isFinite(byte) || byte < 0 || byte > 255) {
      return { ok: false, error: `Invalid MIDI byte: ${token}`, bytes: [] };
    }
    bytes.push(byte);
  }

  if (bytes[0] === 0xf0 && bytes.at(-1) !== 0xf7) {
    return { ok: false, error: 'SysEx raw MIDI message must end with F7', bytes: [] };
  }

  return { ok: true, bytes };
}

export function parseProfileSourceText(profileId, source = '') {
  const text = String(source || get(profileSources)?.[profileId]?.source || '').trim();
  if (!text) return { ok: false, error: 'No profile source loaded.' };
  try {
    const profile = JSON.parse(text);
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      return { ok: false, error: 'Profile source must be a JSON object.' };
    }
    return { ok: true, profile, source: text };
  } catch (error) {
    return { ok: false, error: error?.message || 'Profile source is not valid JSON.' };
  }
}

export function localProfileMode(profileId, source = '') {
  return !isJuceAvailable() || !!String(source ?? '').trim() || get(profileSources)?.[profileId]?.localDraft === true;
}

function recipeNumber(value, variables = {}, fallback = 0) {
  if (typeof value === 'string' && value.startsWith('$')) {
    const key = value.slice(1);
    return Number(variables[key] ?? fallback);
  }
  return Number(value ?? fallback);
}

/**
 * A value, as the bytes that go on the wire.
 *
 * MIRRORS DeviceProfileEngine.cpp. That is not a nicety here — this engine runs whenever the JUCE
 * bridge is absent or a draft is being edited, so a disagreement means the DPD preview shows a
 * different message from the one the export sends, and someone "fixes" a working profile to match a
 * broken picture of it. The file already carries a comment listing four such divergences in the
 * sysex FRAMING. This is the same class, one level down, in the value ENCODING:
 *
 *   `nibbled` did not exist here at all. Every nibbled parameter fell through to the u7 default and
 *   was emitted as ONE byte where the device expects two, three or four. The GAIA declares 622 of
 *   them — its whole envelope, LFO and filter section — so the fallback engine was building a
 *   short, malformed DT1 for most of the instrument, silently, and the reverse index derived from
 *   it inherited the wrong lengths.
 *
 * The nibble split is C++'s exactly: most significant nibble first, four bits at a time, and a value
 * outside what the nibble count can carry is refused rather than truncated — a silently wrapped
 * parameter is worse than one that does not send.
 */
/** 14-bit encoder names, spelled every way the profiles in this repo spell them. */
const isU14 = (encoding) =>
  encoding === 'u14' || encoding === '14bit' || encoding === 'u14-msb-lsb' || encoding === 'u14-lsb-msb';

/**
 * How many nibbles this parameter's value occupies, or an error.
 *
 * Absent means two, and 1-8 is a hard bound rather than a clamp — both straight from C++. Not
 * pedantry: clamping an absent count would silently pick ONE nibble where the engine picks two,
 * which is the same shape of quiet disagreement the nibbled encoder exists to end.
 */
function nibbleCount(parameter) {
  const declared = parameter?.encoding?.nibbles;
  const nibbles = declared === undefined || declared === null ? 2 : Math.round(Number(declared));
  if (!Number.isFinite(nibbles) || nibbles <= 0 || nibbles > 8) {
    return { error: `Nibbled encoder requires 1-8 nibbles for ${parameter?.id ?? ''}` };
  }
  return { nibbles };
}

/**
 * How many bytes this parameter's value occupies on the wire.
 *
 * Needed by anything reading MESSAGES rather than building them — the inbound index, which must know
 * where a value ends, and the RQ1 read-back, which has to ask for the right number of bytes. Both
 * previously assumed one, which is right for a u7 and wrong for the 622 nibbled parameters and every
 * 14-bit one.
 */
export function parameterValueWidth(parameter) {
  const encoding = String(parameter?.encoding?.type ?? 'u7');
  if (String(parameter?.type ?? '') === 'text') {
    // A name is as wide as it is long. Returning 1 here said a twelve-character patch name occupied
    // one byte, so an RQ1 read-back asked for one and the inbound index thought the next eleven
    // characters were eleven separate parameters' values.
    const codec = normalizeTextCodec(encoding);
    const length = Math.max(0, Math.round(Number(parameter?.encoding?.length ?? 0)));
    if (codec === 'text-nibbled-ascii') {
      return Math.max(0, Math.round(Number(parameter?.encoding?.nibbles ?? length * 2)));
    }
    return length;
  }
  if (isU14(encoding)) return 2;
  if (encoding === 'nibbled') return nibbleCount(parameter).nibbles ?? 0;
  return 1;
}

/**
 * A name to wire bytes — the exact inverse of the text branch of `localDecodeDumpParameterValue`,
 * and a mirror of the one in DeviceProfileEngine.cpp.
 *
 * THIS DID NOT EXIST. `encodeParameterValue` had no text branch at all, so a `type: 'text'`
 * parameter fell through to `clampInt(value, 0, 127)`: "GAIA TEST" is not a number, so the result
 * was 0, and the engine reported ok and sent a message one byte long carrying NUL. Every patch-name
 * write in the web runtime — the GAIA, the SH-201, the AN1x — wrote a NUL over the first character
 * of the name instead of the name, and said it had succeeded. The C++ engine has always encoded
 * text correctly, so this was also a straight divergence between the two: the DPD preview showed a
 * message the export would never send.
 */
function encodeTextValue(parameter, value) {
  const encoding = parameter?.encoding ?? {};
  const codec = normalizeTextCodec(String(encoding?.type ?? 'u7'));
  const text = String(value ?? '');
  const length = Math.round(Number(encoding?.length ?? text.length));
  const pad = Number(encoding?.pad ?? 32);
  const id = parameter?.id ?? '';

  if (codec !== 'text-ascii' && codec !== 'text-nibbled-ascii') {
    return { error: `Unsupported text encoder: ${codec} for ${id}` };
  }
  if (!Number.isFinite(length) || length <= 0) {
    return { error: `Text encoder requires a positive length for ${id}` };
  }
  // REFUSED, not truncated. Silently cutting "Bass Monster" to "Bass Monst" would rename the
  // patch on the synth to something the person never typed.
  if (text.length > length) {
    return { error: `Text is longer than ${length} characters for ${id}` };
  }
  if (!Number.isFinite(pad) || pad < 0 || pad > 127) {
    return { error: `Text pad byte outside MIDI data byte range for ${id}` };
  }

  const chars = [];
  for (let index = 0; index < length; index += 1) {
    const byte = index < text.length ? text.charCodeAt(index) : pad;
    if (byte < 32 || byte > 127) return { error: `Text contains non-ASCII/MIDI byte for ${id}` };
    chars.push(byte);
  }

  const bytes = codec === 'text-nibbled-ascii'
    ? chars.flatMap((byte) => [(byte >> 4) & 0x0f, byte & 0x0f])
    : chars;
  return { bytes, number: 0, normalized: Math.min(1, text.length / length), displayed: text };
}

/**
 * The inverse of the encoder: wire bytes back to a value.
 *
 * MIRRORS the dump decoder in DeviceProfileEngine.cpp, which is the only place C++ reads a value out
 * of a message — same encoder names, same nibble order, same 7-bit masking. Returns null when the
 * bytes cannot be a value of this shape, so a caller can ignore a message rather than move a control
 * to a number it invented.
 */
export function decodeParameterValue(parameter, bytes) {
  const encoding = String(parameter?.encoding?.type ?? 'u7');
  const list = Array.isArray(bytes) ? bytes.map((b) => Number(b)) : [];
  if (list.some((b) => !Number.isFinite(b))) return null;
  if (list.length < parameterValueWidth(parameter)) return null;

  // A name comes back as a name. Falling through to `list[0] & 0x7f` returned the ASCII code of the
  // first letter as the parameter's value, which a caller would then write into a text field.
  if (String(parameter?.type ?? '') === 'text') {
    const decoded = localDecodeDumpParameterValue(parameter, list, 0, null);
    return decoded.ok ? decoded.value : null;
  }

  if (encoding === 'boolean-u7') return (list[0] & 0x7f) === 0 ? 0 : 1;
  if (encoding === 'u14' || encoding === '14bit' || encoding === 'u14-msb-lsb') {
    return ((list[0] & 0x7f) << 7) | (list[1] & 0x7f);
  }
  if (encoding === 'u14-lsb-msb') return ((list[1] & 0x7f) << 7) | (list[0] & 0x7f);
  if (encoding === 'nibbled') {
    const { nibbles, error } = nibbleCount(parameter);
    if (error) return null;
    let number = 0;
    for (let i = 0; i < nibbles; i++) number = (number << 4) | (list[i] & 0x0f);
    return number;
  }
  if (encoding === 'u8') return list[0] & 0xff;
  if (encoding === 's7') {
    const signedOffset = Number(parameter?.encoding?.signedOffset ?? 64);
    return (list[0] & 0x7f) - (Number.isFinite(signedOffset) ? signedOffset : 64);
  }
  return list[0] & 0x7f;
}

export function encodeParameterValue(parameter, value) {
  const encoding = String(parameter?.encoding?.type ?? 'u7');
  if (String(parameter?.type ?? '') === 'text') return encodeTextValue(parameter, value);
  if (encoding === 'boolean-u7') {
    const on = value === true || ['true', 'on', 'yes', '1'].includes(String(value).toLowerCase());
    return { bytes: [on ? 127 : 0], number: on ? 127 : 0, normalized: on ? 1 : 0, displayed: on ? 'On' : 'Off' };
  }
  if (encoding === 'u14' || encoding === '14bit' || encoding === 'u14-msb-lsb') {
    const number = clampInt(value, 0, 16383);
    return { bytes: [(number >> 7) & 0x7f, number & 0x7f], number, normalized: number / 16383, displayed: String(number) };
  }
  if (encoding === 'nibbled') {
    const { nibbles, error } = nibbleCount(parameter);
    if (error) return { error };
    const max = 16 ** nibbles;
    const number = Math.round(Number(value) || 0);
    if (number < 0 || number >= max) {
      return { error: `Nibbled value outside 0-${max - 1} for ${parameter?.id ?? ''}` };
    }
    const bytes = [];
    for (let shift = (nibbles - 1) * 4; shift >= 0; shift -= 4) bytes.push((number >> shift) & 0x0f);
    return { bytes, number, normalized: max > 1 ? number / (max - 1) : 0, displayed: String(number) };
  }
  const number = clampInt(value, 0, 127);
  return { bytes: [number], number, normalized: number / 127, displayed: String(number) };
}

export function localCompileParameter(profile, request = {}) {
  const parameterId = String(request.parameterId ?? '');
  const parameter = (profile.parameters ?? []).find((item) => String(item?.id ?? '') === parameterId);
  if (!parameter) return { ok: false, error: `Parameter "${parameterId}" is not in this profile.` };

  const recipeId = String(parameter.messageRecipe ?? '');
  const recipe = (profile.messageRecipes ?? []).find((item) => String(item?.id ?? '') === recipeId);
  if (!recipe) return { ok: false, error: `Recipe "${recipeId}" was not found for ${parameterId}.` };

  const variables = { channel: 1, deviceId: 16, ...(profile.variables ?? {}), ...(request.variables ?? {}) };
  const encoded = encodeParameterValue(parameter, request.value);
  if (encoded.error) return { ok: false, error: encoded.error };
  const channel = clampInt(recipeNumber(recipe.channel, variables, variables.channel ?? 1), 1, 16);
  const status = 0xb0 + channel - 1;
  const kind = String(recipe.kind ?? 'cc');
  let bytes = [];

  if (kind === 'cc') {
    bytes = [status, clampInt(recipe.controller, 0, 127), encoded.bytes[0] ?? 0];
  } else if (kind === 'nrpn' || kind === 'rpn') {
    // ONE builder for both, as in DeviceProfileEngine.cpp. They differ only in the controller pair
    // that selects the parameter number: 99/98 for an NRPN, 101/100 for an RPN. Writing the RPN case
    // out separately would be a second place for the 7- vs 14-bit value handling below to drift, and
    // this engine exists precisely to agree with the C++ one.
    const [selectMsb, selectLsb] = kind === 'rpn' ? [101, 100] : [99, 98];

    // valueResolution DECIDES, as it does in DeviceProfileEngine.cpp. This used to re-encode every
    // value to 14 bits and then guess from the result whether to send CC 38 — so a recipe declaring
    // `valueResolution: 7` still emitted a second message, with the value split across CC 6 and 38.
    // The C++ engine sends one. Every 7-bit NRPN in every profile was therefore built differently by
    // the two engines, and the fallback was the one people saw in the DPD preview.
    const resolution = Number(recipe.valueResolution) === 14 ? 14 : 7;
    bytes = [
      status, selectMsb, clampInt(recipe.parameterMsb, 0, 127),
      status, selectLsb, clampInt(recipe.parameterLsb, 0, 127),
    ];

    if (resolution === 14) {
      const value14 = encoded.bytes.length > 1
        ? encoded
        : encodeParameterValue({ encoding: { type: 'u14' } }, encoded.number);
      bytes.push(status, 6, value14.bytes[0] ?? 0);
      bytes.push(status, 38, value14.bytes[1] ?? 0);
    } else {
      bytes.push(status, 6, encoded.bytes[0] ?? 0);
    }

    // The null closes the selection, so a later CC 6 on the channel cannot land on this parameter by
    // accident. It uses the SAME pair that opened it. Not implemented here at all until now, so a
    // profile asking for it got it from the C++ engine and not from this one.
    if (recipe.nullAfterSend === true) {
      bytes.push(status, selectMsb, 127);
      bytes.push(status, selectLsb, 127);
    }
  } else if (kind === 'sysex') {
    // This built a DIFFERENT message from DeviceProfileEngine.cpp, which is the one thing a fallback
    // engine is not allowed to do — it runs when the JUCE bridge is absent or a draft is being
    // edited, so the DPD preview disagreed with the export and you would "fix" a working profile to
    // match a broken picture of it. Four divergences, all of them here:
    //
    //   1. $checksum CLAMPED rather than masked — clampInt(sum, 0, 127). An F0 alone is 240, so
    //      essentially every real message produced exactly 127.
    //   2. $checksum summed the WHOLE message so far, including F0 and the manufacturer id. A
    //      checksum covers the address, size and data — never the header.
    //   3. $checksum ignored the recipe's declared type and always summed, so a profile saying
    //      "roland-7bit" got a plain sum — and this engine's own VERIFY path, which reads the type
    //      correctly, rejected what its build path had just produced.
    //   4. $address and $size were not handled AT ALL, and an unrecognised token fell through the
    //      loop silently, so a template using them was quietly built short.
    //
    // Now it mirrors the C++ exactly: a separate accumulator fed only by the tokens a checksum
    // covers, the declared algorithm applied to it, every token either resolved or reported, and the
    // same F0/F7 and data-byte checks at the end.
    const template = Array.isArray(recipe.template) ? recipe.template : [];
    const address = localPatternBytes(parameter.address ?? '', variables);
    const size = localPatternBytes(parameter.size ?? '', variables);
    const covered = [];
    const checksumType = String(recipe.checksum?.type ?? 'none');

    for (const token of template) {
      const text = String(token ?? '').trim();
      if (text === '$address') { bytes.push(...address); covered.push(...address); }
      else if (text === '$encodedValue') { bytes.push(...encoded.bytes); covered.push(...encoded.bytes); }
      else if (text === '$size') { bytes.push(...size); covered.push(...size); }
      else if (text === '$checksum') {
        if (checksumType === 'none') { bytes.push(0); continue; }
        const value = checksumBytes(checksumType, covered);
        if (value === undefined) {
          return { ok: false, error: `Unsupported checksum type "${checksumType}".` };
        }
        bytes.push(...value);
      } else if (text.startsWith('$')) {
        const resolved = clampInt(variables[text.slice(1)], 0, 127);
        if (!Number.isFinite(resolved)) {
          return { ok: false, error: `Variable ${text} is not a MIDI data byte` };
        }
        bytes.push(resolved);
      } else {
        if (!/^[0-9a-f]{1,2}$/i.test(text)) {
          return { ok: false, error: `Invalid hex byte in SysEx template: ${token}` };
        }
        bytes.push(parseInt(text, 16));
      }
    }

    if (bytes.length === 0 || bytes[0] !== 0xf0 || bytes.at(-1) !== 0xf7) {
      return { ok: false, error: 'SysEx transaction must start with F0 and end with F7' };
    }
    for (let index = 1; index < bytes.length - 1; index += 1) {
      if (bytes[index] < 0 || bytes[index] > 127) {
        return { ok: false, error: `SysEx data byte outside 0-127: ${bytesToHex([bytes[index]])}` };
      }
    }
  } else {
    return { ok: false, error: `Unsupported recipe kind "${kind}".` };
  }

  const hex = bytesToHex(bytes);
  return {
    ok: true,
    profileId: profile.id,
    deviceRole: request.deviceRole ?? DEFAULT_DEVICE_ROLE,
    parameterId,
    hex,
    transaction: {
      transactionId: request.requestId ?? 'local_dry_tx',
      deviceRole: request.deviceRole ?? DEFAULT_DEVICE_ROLE,
      parameterId,
      semanticValue: request.value,
      displayedValue: encoded.displayed,
      normalizedValue: encoded.normalized,
      encodedValueHex: bytesToHex(encoded.bytes),
      checksumStatus: kind === 'sysex' ? 'local' : 'none',
      hex,
      messages: [{ kind, hex, bytes }],
      policy: {
        mode: parameter?.sendPolicy?.mode ?? 'continuous',
        coalesce: parameter?.sendPolicy?.coalesce !== false,
        minIntervalMs: Number(parameter?.sendPolicy?.minIntervalMs ?? profile?.timing?.minDelayBetweenMessagesMs ?? 0),
        sendFinalOnRelease: parameter?.sendPolicy?.sendFinalOnRelease !== false,
        realtimeSafe: parameter?.access?.realtimeSafe !== false,
      },
    },
  };
}

function localDefaultStartupRequestId(profile) {
  const sync = Array.isArray(profile?.startup?.sync) ? profile.startup.sync : [];
  for (const step of sync) {
    if (typeof step === 'string' && step.trim()) return step.trim();
    const request = String(step?.request ?? '').trim();
    if (request) return request;
  }
  return String(profile?.requests?.[0]?.id ?? '').trim();
}

function localResolveByteToken(token, variables = {}) {
  const text = String(token ?? '').trim();
  if (text.startsWith('$')) return clampInt(variables[text.slice(1)], 0, 127);
  return /^[0-9a-f]{1,2}$/i.test(text) ? parseInt(text, 16) : 0;
}

function localPatternBytes(value, variables = {}) {
  const tokens = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[\s,]+/).filter(Boolean);
  return tokens.map((token) => localResolveByteToken(token, variables));
}

export function localCompileIdentityRequest(profile, request = {}) {
  const variables = { channel: 1, deviceId: 16, ...(profile.variables ?? {}), ...(request.variables ?? {}) };
  const deviceId = localResolveByteToken(profile.identity?.requestDeviceId ?? '7F', variables);
  const bytes = [0xf0, 0x7e, deviceId, 0x06, 0x01, 0xf7];
  const hex = bytesToHex(bytes);
  return {
    ok: true,
    requestId: request.correlationId ?? `local_identity_${Date.now()}`,
    deviceRole: request.deviceRole ?? DEFAULT_DEVICE_ROLE,
    profileId: profile.id,
    deviceRequestId: 'identityRequest',
    expectedResponseKind: 'identity',
    status: 'Preview',
    pending: false,
    local: true,
    transaction: {
      transactionId: 'request_identityRequest',
      deviceRole: request.deviceRole ?? DEFAULT_DEVICE_ROLE,
      parameterId: 'identityRequest',
      semanticValue: true,
      displayedValue: 'Identity Request',
      normalizedValue: 1,
      encodedValueHex: hex,
      checksumStatus: 'none',
      hex,
      messages: [{ kind: 'sysex', hex, bytes }],
      policy: { mode: 'request', coalesce: false, minIntervalMs: 0, sendFinalOnRelease: true, realtimeSafe: false },
    },
  };
}

export function localMatchIdentityReply(profile, inputHex = '') {
  const bytes = normalizeHex(inputHex).split(' ').filter(Boolean).map((token) => parseInt(token, 16));
  if (bytes.length < 11 || bytes[0] !== 0xf0 || bytes[1] !== 0x7e || bytes[3] !== 0x06 || bytes[4] !== 0x02 || bytes.at(-1) !== 0xf7) {
    return { ok: false, matched: false, error: 'Not an identity reply.', values: {} };
  }
  const manufacturerLength = bytes[5] === 0 ? 3 : 1;
  const familyOffset = 5 + manufacturerLength;
  const modelOffset = familyOffset + 2;
  const revisionOffset = modelOffset + 2;
  const actual = {
    'identity.deviceId': bytesToHex([bytes[2]]),
    'identity.manufacturerId': bytesToHex(bytes.slice(5, 5 + manufacturerLength)),
    'identity.familyCode': bytesToHex(bytes.slice(familyOffset, familyOffset + 2)),
    'identity.modelNumber': bytesToHex(bytes.slice(modelOffset, modelOffset + 2)),
    'identity.revision': bytesToHex(bytes.slice(revisionOffset, -1)),
  };
  const variables = { channel: 1, deviceId: 16, ...(profile.variables ?? {}) };
  const expected = {
    'identity.manufacturerId': bytesToHex(localPatternBytes(profile.identity?.manufacturerId, variables)),
    'identity.familyCode': bytesToHex(localPatternBytes(profile.identity?.familyCode, variables)),
    'identity.modelNumber': bytesToHex(localPatternBytes(profile.identity?.modelNumber, variables)),
    'identity.revision': bytesToHex(localPatternBytes(profile.identity?.revision, variables)),
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue && actual[key] !== expectedValue) {
      return { ok: false, matched: false, error: `${key} expected ${expectedValue} but got ${actual[key]}`, values: actual };
    }
  }
  return { ok: true, matched: true, values: actual };
}

export function localDumpDiagnostics(code, message, dumpId = '') {
  return [{ level: 'error', code, message, ...(dumpId ? { dumpId } : {}) }];
}

function localBytesStartWith(bytes = [], prefix = []) {
  return prefix.length <= bytes.length && prefix.every((byte, index) => bytes[index] === byte);
}

function localBytesEndWith(bytes = [], suffix = []) {
  if (suffix.length > bytes.length) return false;
  const offset = bytes.length - suffix.length;
  return suffix.every((byte, index) => bytes[offset + index] === byte);
}

function normalizeTextCodec(codec = '') {
  const value = String(codec || 'u7');
  if (value === 'ascii' || value === 'fixed-ascii') return 'text-ascii';
  if (value === 'nibbled-ascii' || value === 'packed-nibbled-ascii') return 'text-nibbled-ascii';
  return value;
}

function trimRightPad(text = '', padByte = 32) {
  let value = String(text ?? '');
  const pad = Number(padByte);
  if (!Number.isFinite(pad) || pad < 0 || pad > 127) return value.trimEnd();
  const padChar = String.fromCharCode(pad);
  while (value.endsWith(padChar)) value = value.slice(0, -1);
  return value.trimEnd();
}

function localDecodeDumpParameterValue(parameter, bytes = [], offset = 0, codecOverride = null) {
  if (offset < 0 || offset >= bytes.length) {
    return { ok: false, error: `Dump value offset is outside message for ${parameter?.id ?? ''}` };
  }

  const type = String(parameter?.type ?? '');
  const encoding = codecOverride && typeof codecOverride === 'object'
    ? codecOverride
    : (parameter?.encoding && typeof parameter.encoding === 'object' ? parameter.encoding : {});
  let encodingType = String(encoding?.type ?? 'u7');

  if (type === 'text') {
    encodingType = normalizeTextCodec(encodingType);
    const length = Number(encoding?.length ?? 1);
    const pad = Number(encoding?.pad ?? 32);

    if (encodingType === 'text-ascii') {
      if (length <= 0 || offset + length > bytes.length) {
        return { ok: false, error: `Text dump value is outside message for ${parameter?.id ?? ''}` };
      }
      let text = '';
      for (let index = 0; index < length; index += 1) {
        const byte = bytes[offset + index];
        if (byte < 32 || byte > 127) {
          return { ok: false, error: `Text dump value contains non-ASCII byte for ${parameter?.id ?? ''}` };
        }
        text += String.fromCharCode(byte);
      }
      return { ok: true, value: trimRightPad(text, pad) };
    }

    if (encodingType === 'text-nibbled-ascii') {
      const nibbles = Number(encoding?.nibbles ?? length * 2);
      if (length <= 0 || nibbles < length * 2 || offset + nibbles > bytes.length) {
        return { ok: false, error: `Nibbled text dump value is outside message for ${parameter?.id ?? ''}` };
      }
      let text = '';
      for (let index = 0; index < length; index += 1) {
        const high = bytes[offset + (index * 2)] & 0x0f;
        const low = bytes[offset + (index * 2) + 1] & 0x0f;
        const byte = (high << 4) | low;
        if (byte < 32 || byte > 127) {
          return { ok: false, error: `Nibbled text dump value contains non-ASCII byte for ${parameter?.id ?? ''}` };
        }
        text += String.fromCharCode(byte);
      }
      return { ok: true, value: trimRightPad(text, pad) };
    }

    return { ok: false, error: `Unsupported text dump codec: ${encodingType} for ${parameter?.id ?? ''}` };
  }

  let numeric = bytes[offset];
  if (encodingType === 'u14-msb-lsb' || encodingType === 'u14' || encodingType === '14bit') {
    if (offset + 1 >= bytes.length) return { ok: false, error: `14-bit dump value requires two bytes for ${parameter?.id ?? ''}` };
    numeric = ((bytes[offset] & 0x7f) << 7) | (bytes[offset + 1] & 0x7f);
  } else if (encodingType === 'nibbled') {
    const nibbles = Number(encoding?.nibbles ?? 2);
    if (nibbles <= 0 || offset + nibbles > bytes.length) {
      return { ok: false, error: `Nibbled dump value is outside message for ${parameter?.id ?? ''}` };
    }
    numeric = 0;
    for (let index = 0; index < nibbles; index += 1) {
      numeric = (numeric << 4) | (bytes[offset + index] & 0x0f);
    }
  }

  if (type === 'choice' || type === 'enum') {
    const choice = (Array.isArray(parameter?.choices) ? parameter.choices : [])
      .find((item) => Number(item?.value) === numeric);
    if (choice) return { ok: true, value: String(choice.id ?? '') };
  }

  if (type === 'boolean' || type === 'momentary') {
    return { ok: true, value: numeric === Number(parameter?.trueValue ?? 1) };
  }

  return { ok: true, value: numeric };
}

function localParseDumpWithDefinition(profile, dump, bytes = []) {
  const variables = { channel: 1, deviceId: 16, ...(profile?.variables ?? {}) };
  const dumpId = String(dump?.id ?? '');
  const dumpName = String(dump?.name ?? '');
  const prefix = localPatternBytes(dump?.matcher?.prefix, variables);
  const suffix = localPatternBytes(dump?.matcher?.suffix, variables);
  const payloadOffset = Number(dump?.payload?.offset ?? prefix.length);
  const payloadSize = Number(dump?.payload?.size ?? 0);
  const completion = dump?.completion && typeof dump.completion === 'object' ? dump.completion : {};
  const expectedMessageCount = Number(completion.expectedMessages ?? completion.expectedMessageCount ?? 1);
  let expectedBytes = Number(completion.expectedBytes ?? completion.byteCount ?? 0);
  let minimumBytes = Number(completion.minBytes ?? completion.minimumBytes ?? expectedBytes);
  const maximumBytes = Number(completion.maxBytes ?? completion.maximumBytes ?? 0);

  if (prefix.length && !localBytesStartWith(bytes, prefix)) {
    return { ok: false, error: `Dump prefix did not match ${dumpId}`, matchStatus: 'noMatch', receivedBytes: bytes.length };
  }

  if (suffix.length && !localBytesEndWith(bytes, suffix)) {
    const error = `Dump suffix did not match ${dumpId}`;
    return {
      ok: false,
      error,
      dumpId,
      dumpName,
      checksumStatus: 'none',
      matchStatus: 'partial',
      complete: false,
      expectedMessageCount,
      receivedMessageCount: 1,
      expectedBytes,
      receivedBytes: bytes.length,
      completion,
      diagnostics: localDumpDiagnostics('partial', error, dumpId),
      partialFailures: localDumpDiagnostics('partial', error, dumpId),
    };
  }

  const checksum = dump?.checksum && typeof dump.checksum === 'object' ? dump.checksum : null;
  if (payloadSize > 0 && !expectedBytes) {
    let requiredDataEnd = payloadOffset + payloadSize;
    if (checksum) requiredDataEnd = Math.max(requiredDataEnd, Number(checksum.byteOffset ?? requiredDataEnd) + 1);
    expectedBytes = requiredDataEnd + suffix.length;
    minimumBytes = expectedBytes;
  }

  const failMatched = (matchStatus, error, checksumStatus = 'none') => ({
    ok: false,
    error,
    dumpId,
    dumpName,
    checksumStatus,
    values: {},
    matchStatus,
    complete: false,
    expectedMessageCount,
    receivedMessageCount: 1,
    expectedBytes,
    receivedBytes: bytes.length,
    completion,
    diagnostics: localDumpDiagnostics(matchStatus, error, dumpId),
    ...(matchStatus === 'partial' ? { partialFailures: localDumpDiagnostics(matchStatus, error, dumpId) } : {}),
  });

  if (minimumBytes > 0 && bytes.length < minimumBytes) {
    return failMatched('partial', `Partial dump ${dumpId}: expected at least ${minimumBytes} byte(s), got ${bytes.length}`);
  }
  if (maximumBytes > 0 && bytes.length > maximumBytes) {
    return failMatched('noMatch', `Dump byte count for ${dumpId} is outside the expected range`);
  }

  let checksumStatus = 'none';
  if (checksum) {
    const fromOffset = Number(checksum.fromOffset ?? 0);
    const toOffset = Number(checksum.toOffset ?? bytes.length - 2);
    const byteOffset = Number(checksum.byteOffset ?? bytes.length - 2);
    if (fromOffset < 0 || toOffset >= bytes.length || fromOffset > toOffset || byteOffset < 0 || byteOffset >= bytes.length) {
      return failMatched('partial', 'Dump checksum range is outside message', 'error');
    }
    const type = String(checksum.type ?? '');
    // Two algorithms before this, with everything else hard-rejected — so a synth using an XOR or a
    // Kawai-style checksum could not have a working profile at all, while a SCRIPT could compute one.
    // The table is shared with ce.midi.checksum now, so the two vocabularies are one.
    const expected = checksumBytes(type, bytes.slice(fromOffset, toOffset + 1),
      { offset: checksum.offset });
    if (expected === undefined) {
      return failMatched('unsupportedChecksum', `Unsupported dump checksum type: ${type}`, 'error');
    }
    // A CRC does not fit in one byte, so a checksum field has a length. Declared explicitly when it
    // differs from the algorithm's natural width, which keeps every existing single-byte profile
    // reading exactly as it did.
    const byteCount = Math.max(1, Number(checksum.byteCount ?? expected.length));
    if (byteCount !== expected.length) {
      return failMatched('unsupportedChecksum',
        `Dump checksum "${type}" needs ${expected.length} byte(s) but the definition declares ${byteCount}`,
        'error');
    }
    if (byteOffset + byteCount > bytes.length) {
      return failMatched('partial', 'Dump checksum range is outside message', 'error');
    }
    const got = bytes.slice(byteOffset, byteOffset + byteCount);
    if (got.join(',') !== expected.join(',')) {
      return failMatched(
        'checksumFailed',
        `Dump checksum failed; expected ${bytesToHex(expected)} but got ${bytesToHex(got)}`,
        'error'
      );
    }
    checksumStatus = 'ok';
  }

  const mappings = Array.isArray(dump?.mappings) ? dump.mappings : [];
  if (mappings.length === 0) return failMatched('invalidDefinition', `Dump definition has no mappings: ${dumpId}`, checksumStatus);

  const values = {};
  for (const mapping of mappings) {
    const parameterId = String(mapping?.parameter ?? '');
    const parameter = (profile?.parameters ?? []).find((item) => String(item?.id ?? '') === parameterId);
    if (!parameter) return failMatched('invalidDefinition', `Dump mapping references unknown parameter: ${parameterId}`, checksumStatus);

    const decoded = localDecodeDumpParameterValue(
      parameter,
      bytes,
      payloadOffset + Number(mapping?.offset ?? 0),
      mapping?.codec ?? mapping?.nameCodec ?? null
    );
    if (!decoded.ok) {
      const status = String(decoded.error ?? '').startsWith('Unsupported') ? 'unsupportedCodec' : 'partial';
      return failMatched(status, decoded.error, checksumStatus);
    }
    values[parameterId] = decoded.value;
  }

  return {
    ok: true,
    error: '',
    dumpId,
    dumpName,
    checksumStatus,
    values,
    matchStatus: 'ok',
    complete: true,
    expectedMessageCount,
    receivedMessageCount: 1,
    expectedBytes,
    receivedBytes: bytes.length,
    completion,
    diagnostics: [],
    partialFailures: [],
  };
}

export function localParseDumpMessage(profile, inputHex = '') {
  const parsed = parseRawMidiHexText(inputHex);
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      values: {},
      checksumStatus: 'none',
      matchStatus: parsed.error.includes('end with F7') ? 'partial' : 'invalidMidiData',
      diagnostics: localDumpDiagnostics(parsed.error.includes('end with F7') ? 'partial' : 'invalidMidiData', parsed.error),
    };
  }

  const bytes = parsed.bytes;
  for (let index = 1; index < bytes.length - 1; index += 1) {
    if (bytes[0] === 0xf0 && (bytes[index] < 0 || bytes[index] > 127)) {
      const error = `SysEx data byte outside 0-127: ${bytesToHex([bytes[index]])}`;
      return { ok: false, error, values: {}, checksumStatus: 'none', matchStatus: 'invalidMidiData', diagnostics: localDumpDiagnostics('invalidMidiData', error) };
    }
  }

  const dumps = Array.isArray(profile?.dumpDefinitions) ? profile.dumpDefinitions : [];
  if (dumps.length === 0) {
    return { ok: false, error: 'Profile has no dump definitions', values: {}, checksumStatus: 'none', matchStatus: 'noDefinitions', diagnostics: localDumpDiagnostics('noDefinitions', 'Profile has no dump definitions') };
  }

  let best = null;
  let bestRank = -1;
  for (const dump of dumps) {
    const parsedDump = localParseDumpWithDefinition(profile, dump, bytes);
    if (parsedDump.ok) return parsedDump;
    const rank = ['checksumFailed', 'unsupportedCodec'].includes(parsedDump.matchStatus)
      ? 4
      : parsedDump.matchStatus === 'partial'
        ? 3
        : parsedDump.dumpId
          ? 2
          : parsedDump.matchStatus === 'noMatch'
            ? 1
            : 0;
    if (rank >= bestRank) {
      best = parsedDump;
      bestRank = rank;
    }
  }
  return best ?? { ok: false, error: 'No dump definition matched message', values: {}, checksumStatus: 'none', matchStatus: 'noMatch', diagnostics: localDumpDiagnostics('noMatch', 'No dump definition matched message') };
}

function rangesForMissingCoverage(expectedBytes = 0, covered = new Set()) {
  const ranges = [];
  let start = -1;
  for (let offset = 0; offset < expectedBytes; offset += 1) {
    const missing = !covered.has(offset);
    if (missing && start < 0) start = offset;
    if ((!missing || offset === expectedBytes - 1) && start >= 0) {
      const end = missing && offset === expectedBytes - 1 ? offset : offset - 1;
      ranges.push({ label: 'missing', start, length: end - start + 1, end });
      start = -1;
    }
  }
  return ranges;
}

export function localCollectDumpMessages(profile, hexMessages = []) {
  const values = {};
  const messages = [];
  const receivedRanges = [];
  const duplicateRanges = [];
  const diagnostics = [];
  const covered = new Set();
  let collectionId = '';
  let expectedMessageCount = 0;
  let expectedBytes = 0;
  let parsedMessageCount = 0;
  let failedMessageCount = 0;

  for (const hex of hexMessages) {
    const parsed = localParseDumpMessage(profile, hex);
    messages.push({
      ok: parsed.ok,
      dumpId: parsed.dumpId,
      dumpName: parsed.dumpName,
      matchStatus: parsed.matchStatus,
      complete: parsed.complete,
      expectedBytes: parsed.expectedBytes,
      receivedBytes: parsed.receivedBytes,
      checksumStatus: parsed.checksumStatus,
      error: parsed.error,
    });

    diagnostics.push(...(parsed.diagnostics ?? []));
    if (!parsed.ok) {
      failedMessageCount += 1;
      continue;
    }

    parsedMessageCount += 1;
    const completion = parsed.completion && typeof parsed.completion === 'object' ? parsed.completion : {};
    const parsedCollectionId = String(completion.collectionId ?? '');
    if (!collectionId) collectionId = parsedCollectionId || String(parsed.dumpId ?? '');
    else if (parsedCollectionId && parsedCollectionId !== collectionId) {
      diagnostics.push(...localDumpDiagnostics('mixedCollection', `Dump message belongs to a different collection: ${parsedCollectionId}`, parsed.dumpId));
    }

    expectedMessageCount = Math.max(expectedMessageCount, Number(completion.expectedMessages ?? completion.expectedMessageCount ?? parsed.expectedMessageCount ?? 0));
    const collectionBytes = Number(completion.collectionBytes ?? completion.totalBytes ?? completion.expectedCollectionBytes ?? 0);
    if (collectionBytes > 0) expectedBytes = Math.max(expectedBytes, collectionBytes);
    else if (!expectedBytes) expectedBytes = Math.max(expectedBytes, Number(parsed.expectedBytes ?? 0));

    const addressRange = completion.addressRange ?? completion.range ?? {};
    const start = Number(addressRange.start ?? covered.size);
    const length = Number(addressRange.length ?? parsed.expectedBytes ?? parsed.receivedBytes ?? 0);
    const label = String(addressRange.label ?? parsed.dumpId ?? 'range');
    receivedRanges.push({ label, start, length, end: start + Math.max(0, length) - 1, sourceId: parsed.dumpId });
    for (let offset = start; offset < start + length; offset += 1) {
      if (covered.has(offset)) duplicateRanges.push({ label: 'duplicate', start: offset, length: 1, end: offset, sourceId: parsed.dumpId });
      covered.add(offset);
    }

    Object.assign(values, parsed.values ?? {});
  }

  if (!expectedMessageCount) expectedMessageCount = hexMessages.length;
  const missingRanges = expectedBytes > 0 ? rangesForMissingCoverage(expectedBytes, covered) : [];
  const complete = failedMessageCount === 0 && hexMessages.length >= expectedMessageCount && missingRanges.length === 0;
  const ok = failedMessageCount === 0;
  const status = complete ? 'complete' : ok ? 'partial' : 'error';
  const error = complete ? '' : failedMessageCount > 0 ? `${failedMessageCount} dump message(s) failed` : 'Dump collection incomplete';
  if (!complete) diagnostics.push(...localDumpDiagnostics(status, error, collectionId));

  return {
    ok,
    complete,
    status,
    error,
    collectionId,
    expectedMessageCount,
    receivedMessageCount: hexMessages.length,
    parsedMessageCount,
    failedMessageCount,
    expectedBytes,
    receivedBytes: covered.size,
    values,
    messages,
    receivedRanges,
    missingRanges,
    duplicateRanges,
    diagnostics,
    local: true,
  };
}

export function localCompileDeviceRequest(profile, request = {}) {
  const requestId = String(request.request || request.deviceRequestId || localDefaultStartupRequestId(profile)).trim();
  if (!requestId) return { ok: false, error: 'Profile has no startup request.' };

  const deviceRequest = (profile.requests ?? []).find((item) => String(item?.id ?? '') === requestId);
  if (!deviceRequest) return { ok: false, error: `Device request "${requestId}" was not found.` };

  const variables = { channel: 1, deviceId: 16, ...(profile.variables ?? {}), ...(request.variables ?? {}) };
  const bytes = [];
  for (const token of Array.isArray(deviceRequest.template) ? deviceRequest.template : []) {
    const text = String(token ?? '').trim();
    if (text.startsWith('$') || /^[0-9a-f]{1,2}$/i.test(text)) bytes.push(localResolveByteToken(text, variables));
  }

  const kind = String(deviceRequest.kind ?? (bytes[0] === 0xf0 ? 'sysex' : 'raw'));
  const expectedDumpId = String(deviceRequest.response?.dump ?? (String(deviceRequest.response?.kind ?? '') === 'bulkDump' ? deviceRequest.response?.collectionId : undefined) ?? deviceRequest.expectedDump ?? '');
  const continueRequestId = String(deviceRequest.response?.continueRequest ?? deviceRequest.continueRequest ?? '');
  const expectedResponseKind = deviceRequest.response?.identity === true || String(deviceRequest.response?.kind ?? '') === 'identity'
    ? 'identity'
    : 'dump';
  const hex = bytesToHex(bytes);
  return {
    ok: true,
    requestId: request.correlationId ?? `local_sync_${Date.now()}`,
    deviceRole: request.deviceRole ?? DEFAULT_DEVICE_ROLE,
    profileId: profile.id,
    deviceRequestId: requestId,
    expectedResponseKind,
    expectedDumpId,
    continueRequestId,
    status: 'Preview',
    pending: false,
    local: true,
    transaction: {
      transactionId: `request_${requestId}`,
      deviceRole: request.deviceRole ?? DEFAULT_DEVICE_ROLE,
      parameterId: requestId,
      semanticValue: true,
      displayedValue: deviceRequest.name ?? requestId,
      normalizedValue: 1,
      encodedValueHex: hex,
      checksumStatus: 'none',
      hex,
      messages: [{ kind, hex, bytes }],
      policy: {
        mode: 'request',
        coalesce: false,
        minIntervalMs: Number(deviceRequest.minIntervalMs ?? 0),
        sendFinalOnRelease: true,
        realtimeSafe: false,
      },
    },
    pendingRequests: [],
  };
}

function presetScanSlots(presetBrowser = {}) {
  if (Array.isArray(presetBrowser.slots)) return presetBrowser.slots.map((slot) => Number(slot)).filter(Number.isFinite);
  const start = Number(presetBrowser.startSlot ?? 0);
  const count = Number(presetBrowser.slotCount ?? 0);
  const end = Number(presetBrowser.endSlot ?? (count > 0 ? start + count - 1 : start - 1));
  const slots = [];
  for (let slot = start; slot <= end; slot += 1) slots.push(slot);
  return slots;
}

export function localBuildPresetListScan(profile, options = {}) {
  const presetBrowser = profile?.presetBrowser ?? {};
  // The informal presetBrowser field wins for compatibility; the structured preset model
  // (presets.nameRequest + bank slot ranges) backs it up.
  const nameRequest = profile?.presets?.nameRequest ?? {};
  const request = String(options.request || presetBrowser.request || presetBrowser.nameRequest || nameRequest.request || '').trim();
  const slotVariable = String(options.slotVariable || presetBrowser.slotVariable || nameRequest.slotVariable || 'slot');
  if (!request) return { ok: false, error: 'Preset browser needs a request id.' };

  let scanSlots = Array.isArray(options.slots)
    ? options.slots.map((slot) => Number(slot)).filter(Number.isFinite)
    : presetScanSlots(presetBrowser);
  if (scanSlots.length === 0) scanSlots = presetModelSlots(profile?.presets);
  if (scanSlots.length === 0) return { ok: false, error: 'Preset browser has no slots to scan.' };

  const entries = scanSlots.map((slot) => {
    const compiled = localCompileDeviceRequest(profile, {
      correlationId: `preset_scan_${slot}`,
      deviceRole: options.deviceRole ?? DEFAULT_DEVICE_ROLE,
      profileId: profile.id,
      request,
      variables: { [slotVariable]: slot },
    });
    return {
      slot,
      request,
      requestHex: compiled?.transaction?.hex ?? '',
      ok: compiled.ok === true,
      error: compiled.error ?? '',
      status: compiled.ok === true ? 'ready' : 'error',
    };
  });

  return {
    ok: entries.every((entry) => entry.ok),
    profileId: profile.id,
    deviceRole: options.deviceRole ?? DEFAULT_DEVICE_ROLE,
    request,
    total: entries.length,
    pending: 0,
    entries,
    local: true,
  };
}

// ── Preset model (profile.presets: banks / recall / nameRequest / initPatch) ──

export function presetBankForSlot(presets, slot) {
  const banks = Array.isArray(presets?.banks) ? presets.banks : [];
  const number = Number(slot);
  return banks.find((bank) => {
    const start = Number(bank?.startSlot);
    const count = Number(bank?.slotCount);
    return Number.isInteger(start) && Number.isInteger(count) && number >= start && number < start + count;
  }) ?? null;
}

// What a slot IS: its bank, factory/user role, writability (drives ROM-write blocking) and, when the
// profile ships a factory catalog, its name. The live scan says what's in the slot NOW; this is the model.
export function presetSlotInfo(profile, slot) {
  const presets = profile?.presets;
  const bank = presetBankForSlot(presets, slot);
  const number = Number(slot);
  if (!bank) {
    return { slot: number, bankId: '', bankLabel: '', role: 'user', writable: true, program: clampInt(number, 0, 127), catalogName: '', inBank: false };
  }
  const start = Number(bank.startSlot);
  const role = String(bank.role ?? 'user');
  const index = number - start;
  return {
    slot: number,
    bankId: String(bank.id ?? ''),
    bankLabel: String(bank.label ?? bank.id ?? ''),
    role,
    writable: bank.writable != null ? bank.writable === true : role === 'user',
    program: clampInt(Number(bank.programBase ?? 0) + index, 0, 127),
    catalogName: Array.isArray(bank.names) ? String(bank.names[index] ?? '') : '',
    // Per slot, falling back to the bank's own tag. `categories` is indexed the same way `names`
    // is — slot - startSlot — so a bank can carry one tag for all of it, a tag per slot, or a
    // per-slot list with gaps the bank tag fills.
    category: String(
      (Array.isArray(bank.categories) ? bank.categories[index] : '') || bank.category || '',
    ),
    inBank: true,
  };
}

export function presetModelSlots(presets) {
  const banks = Array.isArray(presets?.banks) ? presets.banks : [];
  return banks.flatMap((bank) => {
    const start = Number(bank?.startSlot);
    const count = Number(bank?.slotCount);
    if (!Number.isInteger(start) || !Number.isInteger(count)) return [];
    return Array.from({ length: count }, (_, index) => start + index);
  });
}

// "Recall slot S": the parameterized action from the preset model, compiled to concrete messages.
// pc / bankPc share the panel's channel-voice conventions; sysex resolves a template like the other
// local compiles. bankPc yields SEPARATE messages (CC0 [+CC32] then PC) — the raw-send door takes one
// MIDI message per call, so the caller sends them in order.
export function localCompilePresetRecall(profile, request = {}) {
  const presets = profile?.presets;
  if (!presets || typeof presets !== 'object') return { ok: false, error: 'Profile has no preset model (presets block).' };
  const recall = presets.recall;
  if (!recall || typeof recall !== 'object') return { ok: false, error: 'Preset model has no recall action.' };

  const slot = Number(request.slot);
  if (!Number.isInteger(slot) || slot < 0) return { ok: false, error: 'Preset recall needs an integer slot >= 0.' };
  const info = presetSlotInfo(profile, slot);
  const banks = Array.isArray(presets.banks) ? presets.banks : [];
  if (banks.length > 0 && !info.inBank) return { ok: false, error: `Slot ${slot} is not inside any preset bank.` };

  const variables = { channel: 1, deviceId: 16, ...(profile.variables ?? {}), ...(request.variables ?? {}) };
  const channel = clampInt(recall.channel ?? variables.channel ?? 1, 1, 16);
  const bank = presetBankForSlot(presets, slot);
  const bankMsb = bank?.bankMsb;
  const bankLsb = bank?.bankLsb;
  const kind = String(recall.kind ?? '');
  const messages = [];

  if (kind === 'pc' || kind === 'bankPc') {
    if (kind === 'bankPc') {
      const cc = 0xb0 + channel - 1;
      if (bankMsb != null) messages.push({ kind: 'raw', bytes: [cc, 0, clampInt(bankMsb, 0, 127)] });
      if (bankLsb != null) messages.push({ kind: 'raw', bytes: [cc, 32, clampInt(bankLsb, 0, 127)] });
    }
    messages.push({ kind: 'raw', bytes: [0xc0 + channel - 1, info.program] });
  } else if (kind === 'sysex') {
    const template = Array.isArray(recall.template) ? recall.template : [];
    if (template.length === 0) return { ok: false, error: 'SysEx preset recall has no template.' };
    const recallVariables = {
      ...variables,
      slot,
      program: info.program,
      bankMsb: clampInt(bankMsb ?? 0, 0, 127),
      bankLsb: clampInt(bankLsb ?? 0, 0, 127),
    };
    const bytes = [];
    // Checksum span: from/to are template tokens ("$slot"); default = everything after $deviceId
    // (else after F0) up to the $checksum token. Recorded per token so markers resolve to byte ranges.
    const tokenRanges = [];
    let checksumAt = -1;
    for (const token of template) {
      const text = String(token ?? '').trim();
      const from = bytes.length;
      if (text === '$checksum') {
        checksumAt = bytes.length;
        bytes.push(0); // patched below
      } else if (text.startsWith('$')) {
        const key = text.slice(1);
        if (!(key in recallVariables)) return { ok: false, error: `Variable ${text} is not defined for preset recall` };
        bytes.push(clampInt(recallVariables[key], 0, 127));
      } else {
        if (!/^[0-9a-f]{1,2}$/i.test(text)) return { ok: false, error: `Invalid hex byte in recall template: ${token}` };
        bytes.push(parseInt(text, 16));
      }
      tokenRanges.push({ token: text, from, to: bytes.length - 1 });
    }
    const checksumType = String(recall.checksum?.type ?? 'none');
    if (checksumAt >= 0 && checksumType !== 'none') {
      const markerRange = (marker) => tokenRanges.find((range) => range.token === marker);
      const fromRange = markerRange(String(recall.checksum?.from ?? ''));
      const toRange = markerRange(String(recall.checksum?.to ?? ''));
      const deviceIdRange = markerRange('$deviceId');
      const start = fromRange ? fromRange.from : (deviceIdRange ? deviceIdRange.to + 1 : 1);
      const end = toRange ? toRange.to : checksumAt - 1;
      if (start > end) return { ok: false, error: 'Preset recall checksum range is empty.' };
      const value = checksumBytes(checksumType, bytes.slice(start, end + 1));
      if (value === undefined) return { ok: false, error: `Unsupported checksum type "${checksumType}".` };
      bytes.splice(checksumAt, 1, ...value);
    }
    if (bytes.length === 0 || bytes[0] !== 0xf0 || bytes.at(-1) !== 0xf7) {
      return { ok: false, error: 'SysEx preset recall must start with F0 and end with F7' };
    }
    for (let index = 1; index < bytes.length - 1; index += 1) {
      if (bytes[index] < 0 || bytes[index] > 127) {
        return { ok: false, error: `SysEx data byte outside 0-127: ${bytesToHex([bytes[index]])}` };
      }
    }
    messages.push({ kind: 'sysex', bytes });
  } else {
    return { ok: false, error: `Unsupported preset recall kind "${kind}".` };
  }

  const withHex = messages.map((message) => ({ ...message, hex: bytesToHex(message.bytes) }));
  return {
    ok: true,
    profileId: profile.id,
    deviceRole: request.deviceRole ?? DEFAULT_DEVICE_ROLE,
    slot,
    bankId: info.bankId,
    program: info.program,
    channel,
    kind,
    hex: withHex.map((message) => message.hex).join(' '),
    messages: withHex,
  };
}

export function validateLocalProfileSource(profileId, source = '') {
  const parsed = parseProfileSourceText(profileId, source);
  if (!parsed.ok) {
    return { profileId, ok: false, error: parsed.error, validation: [{ level: 'error', path: '$', message: parsed.error }] };
  }

  const profile = parsed.profile;
  const validation = [];
  const parameters = Array.isArray(profile.parameters) ? profile.parameters : [];
  const recipes = Array.isArray(profile.messageRecipes) ? profile.messageRecipes : [];
  const tests = Array.isArray(profile.tests) ? profile.tests : [];
  const dumps = Array.isArray(profile.dumpDefinitions) ? profile.dumpDefinitions : [];
  const parameterIds = new Set();
  const recipeIds = new Set();
  const requestIds = new Set((Array.isArray(profile.requests) ? profile.requests : []).map((request) => String(request?.id ?? '')));
  const dumpIds = new Set(dumps.map((dump) => String(dump?.id ?? '')));

  if (!profile.id) validation.push({ level: 'error', path: 'id', message: 'Profile id is required.' });
  if (parameters.length === 0) validation.push({ level: 'error', path: 'parameters', message: 'Add at least one parameter.' });
  if (recipes.length === 0) validation.push({ level: 'error', path: 'messageRecipes', message: 'Add at least one message recipe.' });
  if (tests.length === 0) validation.push({ level: 'warning', path: 'tests', message: 'Add at least one test vector.' });

  for (const [index, parameter] of parameters.entries()) {
    const id = String(parameter?.id ?? '').trim();
    if (!id) validation.push({ level: 'error', path: `parameters.${index}.id`, message: 'Parameter id is required.' });
    else if (parameterIds.has(id)) validation.push({ level: 'error', path: `parameters.${index}.id`, message: `Duplicate parameter id "${id}".` });
    parameterIds.add(id);
  }

  for (const [index, recipe] of recipes.entries()) {
    const id = String(recipe?.id ?? '').trim();
    if (!id) validation.push({ level: 'error', path: `messageRecipes.${index}.id`, message: 'Recipe id is required.' });
    else if (recipeIds.has(id)) validation.push({ level: 'error', path: `messageRecipes.${index}.id`, message: `Duplicate recipe id "${id}".` });
    recipeIds.add(id);
  }

  for (const [index, request] of (Array.isArray(profile.requests) ? profile.requests : []).entries()) {
    const id = String(request?.id ?? '').trim();
    if (!id) validation.push({ level: 'error', path: `requests.${index}.id`, message: 'Device request id is required.' });
    if (!Array.isArray(request?.template) || request.template.length === 0) {
      validation.push({ level: 'error', path: `requests.${index}.template`, message: 'Device request requires a template.' });
    }
    const responseDump = String(request?.response?.dump ?? request?.expectedDump ?? '').trim();
    if (responseDump && !dumpIds.has(responseDump)) {
      validation.push({ level: 'error', path: `requests.${index}.response.dump`, message: `Unknown dump definition "${responseDump}".` });
    }
  }

  for (const [index, step] of (Array.isArray(profile.startup?.sync) ? profile.startup.sync : []).entries()) {
    const request = typeof step === 'string' ? step : String(step?.request ?? '');
    if (request && !requestIds.has(request)) {
      validation.push({ level: 'error', path: `startup.sync.${index}.request`, message: `Unknown startup request "${request}".` });
    }
  }

  const presetRequest = String(profile.presetBrowser?.request ?? profile.presetBrowser?.nameRequest ?? '');
  if (presetRequest && !requestIds.has(presetRequest)) {
    validation.push({ level: 'error', path: 'presetBrowser.request', message: `Unknown preset request "${presetRequest}".` });
  }

  // The structured preset model (banks / recall / nameRequest / initPatch) — same shape as the DPD
  // schema's $defs.presets, carried into the legacy profile by emit-legacy-core.
  const presets = profile.presets;
  if (presets && typeof presets === 'object') {
    const banks = Array.isArray(presets.banks) ? presets.banks : [];
    const bankIds = new Set();
    const ranges = [];
    for (const [index, bank] of banks.entries()) {
      const path = `presets.banks.${index}`;
      const id = String(bank?.id ?? '').trim();
      if (!id) validation.push({ level: 'error', path: `${path}.id`, message: 'Preset bank id is required.' });
      else if (bankIds.has(id)) validation.push({ level: 'error', path: `${path}.id`, message: `Duplicate preset bank id "${id}".` });
      bankIds.add(id);
      if (!['factory', 'user'].includes(String(bank?.role ?? ''))) {
        validation.push({ level: 'error', path: `${path}.role`, message: 'Preset bank role must be "factory" or "user".' });
      }
      const startSlot = Number(bank?.startSlot);
      const slotCount = Number(bank?.slotCount);
      if (!Number.isInteger(startSlot) || startSlot < 0) validation.push({ level: 'error', path: `${path}.startSlot`, message: 'Preset bank needs an integer startSlot >= 0.' });
      if (!Number.isInteger(slotCount) || slotCount < 1) validation.push({ level: 'error', path: `${path}.slotCount`, message: 'Preset bank needs an integer slotCount >= 1.' });
      if (Number.isInteger(startSlot) && Number.isInteger(slotCount)) ranges.push({ id: id || `#${index}`, from: startSlot, to: startSlot + slotCount - 1 });
      if (Array.isArray(bank?.names) && Number.isInteger(slotCount) && bank.names.length > slotCount) {
        validation.push({ level: 'error', path: `${path}.names`, message: `Names catalog (${bank.names.length}) exceeds slotCount (${slotCount}).` });
      }
    }
    ranges.sort((a, b) => a.from - b.from);
    for (let index = 1; index < ranges.length; index += 1) {
      if (ranges[index].from <= ranges[index - 1].to) {
        validation.push({ level: 'error', path: 'presets.banks', message: `Preset banks "${ranges[index - 1].id}" and "${ranges[index].id}" have overlapping slot ranges.` });
      }
    }
    const recall = presets.recall;
    if (recall && typeof recall === 'object') {
      if (!['pc', 'bankPc', 'sysex'].includes(String(recall.kind ?? ''))) {
        validation.push({ level: 'error', path: 'presets.recall.kind', message: 'Preset recall kind must be pc, bankPc or sysex.' });
      }
      if (String(recall.kind ?? '') === 'sysex' && (!Array.isArray(recall.template) || recall.template.length === 0)) {
        validation.push({ level: 'error', path: 'presets.recall.template', message: 'SysEx preset recall requires a template.' });
      }
    }
    const nameRequestId = String(presets.nameRequest?.request ?? '').trim();
    if (nameRequestId && !requestIds.has(nameRequestId)) {
      validation.push({ level: 'error', path: 'presets.nameRequest.request', message: `Unknown preset name request "${nameRequestId}".` });
    }
  }

  for (const [index, parameter] of parameters.entries()) {
    const recipeId = String(parameter?.messageRecipe ?? '').trim();
    if (recipeId && !recipeIds.has(recipeId)) {
      validation.push({ level: 'error', path: `parameters.${index}.messageRecipe`, message: `Recipe "${recipeId}" does not exist.` });
    }
  }

  for (const [index, dump] of dumps.entries()) {
    const id = String(dump?.id ?? '').trim();
    if (!id) validation.push({ level: 'error', path: `dumpDefinitions.${index}.id`, message: 'Dump definition id is required.' });
    const mappings = Array.isArray(dump?.mappings) ? dump.mappings : [];
    if (mappings.length === 0) {
      validation.push({ level: 'warning', path: `dumpDefinitions.${index}.mappings`, message: 'Dump definition has no mappings.' });
    }
    for (const [mappingIndex, mapping] of mappings.entries()) {
      const parameterId = String(mapping?.parameter ?? '').trim();
      if (!parameterIds.has(parameterId)) {
        validation.push({
          level: 'error',
          path: `dumpDefinitions.${index}.mappings.${mappingIndex}.parameter`,
          message: `Parameter "${parameterId}" does not exist.`,
        });
      }
    }
  }

  for (const [index, test] of tests.entries()) {
    const kind = String(test?.kind ?? 'parameter');
    if (kind === 'request' || kind === 'identityRequest' || kind === 'identityReply' || kind === 'dumpParse') {
      if (!normalizeHex(test?.expectedHex) && (kind === 'request' || kind === 'identityRequest')) {
        validation.push({ level: 'error', path: `tests.${index}.expectedHex`, message: 'Expected hex is required.' });
      }
      if (kind === 'identityReply' && !normalizeHex(test?.inputHex)) {
        validation.push({ level: 'error', path: `tests.${index}.inputHex`, message: 'Identity reply input hex is required.' });
      }
      continue;
    }
    const parameterId = String(test?.parameter ?? '').trim();
    if (!parameterIds.has(parameterId)) validation.push({ level: 'error', path: `tests.${index}.parameter`, message: `Parameter "${parameterId}" does not exist.` });
    if (!normalizeHex(test?.expectedHex)) validation.push({ level: 'error', path: `tests.${index}.expectedHex`, message: 'Expected hex is required.' });
  }

  const ok = validation.every((item) => item.level !== 'error');
  return {
    profileId,
    detectedProfileId: profile.id ?? '',
    ok,
    error: ok ? '' : 'Validation failed',
    validation,
  };
}
