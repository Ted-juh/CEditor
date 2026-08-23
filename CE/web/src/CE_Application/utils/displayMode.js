// displayMode.js — make a control SHOW a value instead of being driven by one.
//
// This is the feedback half of binding, factored into a capability rather than a component. A
// normal control is two-way: the device's value is reflected in it, and the user's input drives the
// device. A DISPLAY uses the feedback direction only. Once that is a mode rather than a component,
// the whole output half of the catalog is one flag away from the input half that already exists — a
// meter is a read-only slider, an LCD bound field is a read-only text control, a pad-grid LED is a
// read-only cell.
//
// WHAT IS ALREADY DONE, so this file does not redo it:
//
//   * Value-driven visuals. The `Bindings` section maps a value into any property path
//     (`value.normalized` → `bodyTrackFill.width`), and `interactionRuntime.applyCustomBindings`
//     re-runs on every signal change. That is the display machinery, and it works.
//   * The inbound path. `followInboundMessage` decodes a live CC or single-parameter SysEx against
//     the profile's `inbound` declaration and `queueDeviceParameterPanelPreviewSync` writes it into
//     the control's preview session — coalesced per animation frame, keyed by role and parameter,
//     so a synth streaming a knob at full tilt costs one update per frame and not one per message.
//     The design note asked for rate limiting; it was already there.
//
// WHAT WAS MISSING is the read-only half: a way to say "this control does not accept input", and a
// definition of what that turns off. Without it a meter is a slider the user can grab, which sends
// a value the device never asked for and then gets overwritten by the next feedback frame — a
// control that fights whoever touches it.
//
// PURE, like mouseBehavior.js next door and for the same reason: the surfaces turn these answers
// into element attributes and event guards, and neither the answers nor the tests should need a DOM.

/**
 * What direction a control's value flows.
 *
 * Named for the flow rather than for a component, because the same three answers apply to a knob, a
 * pad and a text field.
 */
export const VALUE_FLOW = {
  /** The default and the historical behaviour: input drives the device, feedback moves the control. */
  twoWay: 'twoWay',
  /** Feedback only. The control shows; it does not send. */
  display: 'display',
  /** Input only. The control sends; feedback does not move it. A trigger button, in effect. */
  input: 'input',
};

export const VALUE_FLOW_OPTIONS = [VALUE_FLOW.twoWay, VALUE_FLOW.display, VALUE_FLOW.input];

/**
 * The flow for a control's Behavior section.
 *
 * Two spellings are accepted because the design note proposed both and panels will exist with
 * either: an explicit `valueFlow`, and the older shorthand `readOnly: true`. `role: 'display'` is
 * NOT one of them — `role` is already a crowded field naming the control's kind (`slider`, `button`,
 * `knob`), and overloading it to also mean "and it is read-only" would make `role: 'display'`
 * unable to say WHICH kind of display it is.
 */
export function valueFlowOf(behavior = null) {
  const explicit = String(behavior?.valueFlow ?? '').trim();
  if (VALUE_FLOW_OPTIONS.includes(explicit)) return explicit;
  if (behavior?.readOnly === true) return VALUE_FLOW.display;
  return VALUE_FLOW.twoWay;
}

/** True when the control shows a value and does not accept input. */
export function isDisplayOnly(behavior = null) {
  return valueFlowOf(behavior) === VALUE_FLOW.display;
}

/** True when feedback should move this control. False only for an input-only control. */
export function acceptsFeedback(behavior = null) {
  return valueFlowOf(behavior) !== VALUE_FLOW.input;
}

/** True when the user can change this control's value. */
export function acceptsInput(behavior = null) {
  return valueFlowOf(behavior) !== VALUE_FLOW.display;
}

/**
 * What read-only actually turns off.
 *
 * Returned as one object rather than five predicates so a surface cannot honour four of them and
 * forget the fifth — which is exactly how a "read-only" meter ends up still responding to the
 * mouse wheel.
 *
 * POINTER EVENTS ARE DELIBERATELY NOT IN HERE, and the design note asked for them. Turning off
 * `Mouse.interceptClicks` is `pointer-events: none`, which also kills hover — so a meter you can
 * hover to read would stop having a tooltip, and clicks would start landing on whatever sits
 * behind it, which is a layout change nobody asked for. Read-only means "your input does not
 * change the value", not "you cannot point at it". An author who does want the control transparent
 * still has `interceptClicks` in the Mouse tab, unchanged and doing one job.
 */
export function interactionPolicy(behavior = null) {
  const flow = valueFlowOf(behavior);
  if (flow !== VALUE_FLOW.display) {
    return {
      flow,
      readOnly: false,
      draggable: null,      // null: no opinion, whatever the control resolved stands
      focusable: null,
      keyboard: null,
      wheel: null,
      sendsOnChange: true,
      cursor: null,
    };
  }
  return {
    flow,
    readOnly: true,
    draggable: false,
    focusable: false,
    keyboard: false,
    wheel: false,
    // The one that matters most and is easiest to miss: a display must not emit. A meter that
    // echoed its feedback back to the device would make a loop out of a level display.
    sendsOnChange: false,
    // Not `not-allowed`: nothing was disallowed. `default` says "this is not a handle" without
    // implying the user did something wrong by pointing at it.
    cursor: 'default',
  };
}

/**
 * Layer the read-only policy over the Mouse section's resolved answers.
 *
 * Read-only WINS over an author's `draggable: true`, because the two settings are not equals: one
 * says what kind of control this is and the other configures how it drags. A draggable display is
 * not a thing a user could have meant.
 */
export function applyDisplayPolicy(resolved = {}, behavior = null) {
  const policy = interactionPolicy(behavior);
  if (!policy.readOnly) return { ...resolved };
  return {
    ...resolved,
    draggable: false,
    focusable: false,
    tabIndex: -1,
    keyboardEnabled: false,
    wheelEnabled: false,
    dragEnabled: false,
  };
}

/**
 * Should a feedback frame move this control right now?
 *
 * The live-sync path skips a control the user is dragging, which is right for a two-way control —
 * the device's echo must not fight the hand on the knob. A DISPLAY cannot be dragged, so that guard
 * can only misfire on it: a stale `dragging: true` left in a preview session would freeze the meter
 * for the rest of the session. So the guard is asked once, here, with the flow in hand.
 */
export function shouldAcceptFeedback(behavior = null, session = null) {
  if (!acceptsFeedback(behavior)) return false;
  if (isDisplayOnly(behavior)) return true;
  return session?.dragging !== true;
}
