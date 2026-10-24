/**
 * One animation frame for several self-running tickers, and one notice per frame that they stepped.
 *
 * The preview surface has a ticker for each kind of free-running control (Orbit, Looper, Turing,
 * Kinetic, Constellation, Arp, Recorder, Phrase). Each steps its controls once a frame and then
 * moves a clock that the resolve of every running control reads. Each had a requestAnimationFrame
 * loop of its own, so with five kinds running the clock moved five times a frame, each time in an
 * update of its own, and every running control was resolved again after each of them: twenty-five
 * full resolves a frame where five do. QA-08 has one of each of five kinds, and kept a core busy
 * for every window it was open in; three windows starved the machine they were open on.
 *
 * `request(step)` asks for `step` to run in the next frame. Every step asked for runs in that one
 * frame, and `onStepped` is called once after them if any asked for the frame after, which is what
 * a ticker still running does and one that found nothing to run does not. A step that throws does
 * not stop the others: its error is reported on its own, as it was from a loop of its own.
 */
export function sharedAnimationFrame(
  onStepped,
  schedule = (frame) => requestAnimationFrame(frame),
  report = (error) => queueMicrotask(() => { throw error; }),
) {
  let steps = [];
  let requested = false;
  function frame() {
    requested = false;
    const due = steps;
    steps = [];
    for (const step of due) {
      try { step(); } catch (error) { report(error); }
    }
    if (steps.length) onStepped();
  }
  return function request(step) {
    steps.push(step);
    if (requested) return;
    requested = true;
    schedule(frame);
  };
}
