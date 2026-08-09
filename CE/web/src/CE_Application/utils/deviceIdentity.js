/**
 * "Is my synth actually there?" — reading the answer.
 *
 * The handshake is MIDI's own: a Universal Device Inquiry, F0 7E <id> 06 01 F7, which any compliant
 * instrument answers with its manufacturer, family, model and firmware revision. All of it already
 * exists below the UI — DeviceProfileEngine::compileIdentityRequest builds the message from the
 * profile's identity block, startDeviceSync sends it, and C++ emits deviceIdentityReply,
 * deviceIdentityMismatch or deviceRequestTimedOut. Nothing asked.
 *
 * Which matters more here than in most places: everything built for MIDI in this session is
 * unverified against hardware, because there is no hardware to verify it against. This is the one
 * button that answers the question for the person who does have a synth, and it answers it with the
 * synth's own words rather than with our confidence.
 *
 * Pure, because the interesting part is the reading. There are five distinct outcomes and only one
 * of them is good; conflating "no reply" with "wrong synth" would send someone to check a cable
 * when the answer is that they picked the wrong profile.
 */

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Hex bytes, as a synth would print them in its manual. */
function hexOf(value) {
  const raw = text(value).replace(/^0x/i, '').replace(/\s+/g, ' ');
  return raw ? raw.toUpperCase() : '';
}

/**
 * Everything the reply says about the instrument, in one line.
 *
 * Manufacturer and model are the two people recognise; family and revision are what distinguishes a
 * GAIA from a GAIA 2 and one firmware from another, so they are kept when present rather than
 * summarised away.
 */
export function describeIdentity(reply) {
  const parts = [
    hexOf(reply?.manufacturerId) && `mfr ${hexOf(reply.manufacturerId)}`,
    hexOf(reply?.familyCode) && `family ${hexOf(reply.familyCode)}`,
    hexOf(reply?.modelNumber) && `model ${hexOf(reply.modelNumber)}`,
    hexOf(reply?.revision) && `rev ${hexOf(reply.revision)}`,
  ].filter(Boolean);
  return parts.join(' · ');
}

/**
 * Turn whatever came back into something to show.
 *
 * `outcome` is one of:
 *   replied   — the right instrument answered. The chain works, end to end.
 *   mismatch  — something answered, but not what the profile expects. The cable is fine and the
 *               profile is wrong, which is the opposite of what silence would suggest.
 *   timeout   — nothing answered. Cable, port, or the synth ignores inquiries.
 *   refused   — the request never went out; the profile has no identity block to build it from.
 *   waiting   — sent, still listening.
 */
export function identityOutcome({ reply = null, timedOut = false, error = '' } = {}) {
  if (error) return { outcome: 'refused', ok: false, detail: error };

  if (reply) {
    const described = describeIdentity(reply);
    if (reply.matched) {
      return {
        outcome: 'replied',
        ok: true,
        detail: described ? `Answered: ${described}` : 'Answered.',
      };
    }
    // An unmatched reply is the most useful failure of the three, so it says both halves: something
    // is there, and it is not what this profile describes.
    return {
      outcome: 'mismatch',
      ok: false,
      detail: described
        ? `A device answered, but not the one this profile expects — ${described}`
        : 'A device answered, but not the one this profile expects.',
    };
  }

  if (timedOut) {
    return {
      outcome: 'timeout',
      ok: false,
      detail: 'No answer. Check the output and input ports, the cable, and that the instrument replies to identity requests.',
    };
  }

  return { outcome: 'waiting', ok: false, detail: 'Waiting for an answer…' };
}

/** Does this event belong to the device being tested? Every payload carries the name. */
export function identityEventMatches(event, deviceRole) {
  if (!event) return false;
  return text(event.deviceRole) === text(deviceRole);
}
