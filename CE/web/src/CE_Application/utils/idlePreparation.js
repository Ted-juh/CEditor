// Work is split between idle periods, after an editing pause. Cancellation is
// synchronous: an old panel/edit can never continue preparing after replacement.
export function scheduleIdlePreparation(createJobs, {
  delay = 800, sliceMs = 4, host = globalThis, onError = console.error, onComplete = () => {},
} = {}) {
  let cancelled = false, timer = null, idle = null, jobs = null, held = false;
  const now = () => host.performance?.now() ?? Date.now();
  const cancelPending = () => {
    if (timer !== null) host.clearTimeout(timer);
    if (idle !== null) {
      if (host.cancelIdleCallback) host.cancelIdleCallback(idle);
      else host.clearTimeout(idle);
    }
    timer = idle = null;
  };
  const enqueue = () => {
    if (cancelled || held) return;
    idle = host.requestIdleCallback
      ? host.requestIdleCallback(run, { timeout: 500 })
      : host.setTimeout(() => run({ timeRemaining: () => sliceMs, didTimeout: true }), 16);
  };
  const run = deadline => {
    idle = null;
    if (cancelled || held) return;
    const started = now();
    try {
      jobs ??= createJobs()[Symbol.iterator]();
      do {
        if (host.navigator?.scheduling?.isInputPending?.()) break;
        const next = jobs.next();
        if (next.done) { cancel(); onComplete(); return; }
        next.value();
      } while (!cancelled && now() - started < sliceMs && deadline.timeRemaining() > 1);
    } catch (error) { cancel(); onError(error); return; }
    enqueue();
  };
  const restart = () => {
    cancelPending();
    if (!held && !cancelled) timer = host.setTimeout(() => { timer = null; enqueue(); }, delay);
  };
  const activity = event => {
    if (event.type === 'pointerdown') held = true;
    if (event.type === 'pointerup' || event.type === 'pointercancel' || event.type === 'blur') held = false;
    if (event.type === 'pointermove' && !event.buttons) return;
    restart();
  };
  const events = ['pointerdown', 'pointerup', 'pointercancel', 'pointermove', 'keydown', 'wheel', 'blur'];
  function cancel() {
    cancelled = true;
    cancelPending();
    for (const name of events) host.removeEventListener?.(name, activity, true);
    jobs?.return?.();
  }
  for (const name of events) host.addEventListener?.(name, activity, { capture: true, passive: true });
  restart();
  return cancel;
}
