/**
 * What the exported plug-in's page tells the processor about its DAW parameters, for one change of
 * the preview sessions: `paramChanged` for every value that moved, and `paramGesture` around a drag.
 *
 * A drag is one DAW gesture: 'begin' when the control's session starts dragging, the values in
 * between, 'end' when it lets go. Each value used to be a gesture of its own (setParamFromUi in
 * PluginProcessor.h), so a drag of 200 steps was 200 gestures and a DAW writing in touch or latch
 * mode saw the knob let go after every step.
 *
 * `lastParamValue` is shared with the automation path (Player.svelte applyParamSync), which writes it
 * before moving a control so the move is not sent back; `openGestures` holds the parameter ids with a
 * 'begin' sent and no 'end' yet. Both are changed in place. Nothing is sent while `ready` is false:
 * the first pass only learns the values the panel opened with.
 */
export function paramEvents(sessions, controlByParam, { lastParamValue, openGestures, ready, valueOf }) {
  const events = [];
  for (const parameterId in controlByParam) {
    const entry = controlByParam[parameterId];
    const session = sessions?.[entry.controlId];
    const dragging = session?.dragging === true;
    if (ready && dragging && !openGestures.has(parameterId)) {
      openGestures.add(parameterId);
      events.push(['paramGesture', { id: parameterId, phase: 'begin' }]);
    }
    const value = valueOf(session, entry);
    if (value !== undefined && lastParamValue[parameterId] !== value) {
      lastParamValue[parameterId] = value;
      if (ready) events.push(['paramChanged', { id: parameterId, value }]);
    }
    if (!dragging && openGestures.delete(parameterId)) {
      events.push(['paramGesture', { id: parameterId, phase: 'end' }]);
    }
  }
  return events;
}

/** The 'end' of every open gesture, for a page that is closing. Empties `openGestures`. */
export function endOpenGestures(openGestures) {
  const events = [...openGestures].map((id) => ['paramGesture', { id, phase: 'end' }]);
  openGestures.clear();
  return events;
}
