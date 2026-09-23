function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value ?? {}, key);
}

/** Resolve the value emitted by a preview control's trigger binding for one session patch. */
export function resolvePreviewTriggerBindingValue({
  behavior = null,
  parameterType = '',
  patch = {},
  previousPressed = false,
} = {}) {
  if (String(parameterType ?? '') === 'momentary') {
    if (!hasOwn(patch, 'pressed')) return undefined;
    const nextPressed = patch.pressed === true;
    return nextPressed !== previousPressed ? nextPressed : undefined;
  }

  const firesOnPress = String(behavior?.buttonType ?? '') === 'momentary'
    && String(behavior?.fireOn ?? 'onRelease') === 'onPressStart';
  if (firesOnPress) {
    return patch.pressed === true && previousPressed !== true ? true : undefined;
  }
  return patch.executed === true ? true : undefined;
}

/** A release pulse is needed only for ordinary momentary buttons configured to fire on release. */
export function shouldPulseTriggerOnRelease(behavior = null, inside = true) {
  if (!inside || String(behavior?.family ?? 'trigger') !== 'trigger') return false;
  if (String(behavior?.buttonType ?? '') !== 'momentary') return false;
  if (String(behavior?.fireOn ?? 'onRelease') === 'onPressStart') return false;
  const subtype = String(behavior?.subtype ?? '');
  if (subtype === 'press_to_talk' || behavior?.activeWhileHeld === true) return false;
  if (subtype === 'repeating' && behavior?.repeatEnabled !== false) return false;
  return true;
}
