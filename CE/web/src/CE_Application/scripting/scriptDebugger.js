import { readPath } from './scriptExpressions.js';
import { createScriptContext, executeScript } from './scriptRuntime.js';

function sameTarget(scriptTarget = '', eventTarget = '') {
  const scriptValue = String(scriptTarget ?? '').trim();
  if (!scriptValue || scriptValue === '*' || scriptValue === 'any') return true;
  return scriptValue === String(eventTarget ?? '').trim();
}

function sameEvent(scriptEvent = '', eventName = '') {
  const scriptValue = String(scriptEvent ?? '').trim();
  if (!scriptValue || scriptValue === 'onAny') return true;
  const aliases = new Set([String(eventName ?? '').trim()]);
  if (aliases.has('onValueChanged')) aliases.add('onControlChanged').add('changed');
  if (aliases.has('onControlChanged')) aliases.add('onValueChanged').add('changed');
  if (aliases.has('changed')) aliases.add('onValueChanged').add('onControlChanged');
  return aliases.has(scriptValue);
}

function disabledReason(script, context) {
  if (!script) return 'No script selected.';
  if (script.enabled === false) return 'Script is disabled.';
  if (!sameEvent(script.event, context?.event?.name)) {
    return `Event mismatch: script waits for ${script.event}, current event is ${context?.event?.name}.`;
  }
  if (!sameTarget(script.target, context?.event?.target)) {
    return `Target mismatch: script target is ${script.target}, current target is ${context?.event?.target}.`;
  }
  if (String(script.condition ?? '').trim().toLowerCase() === 'false') return 'Condition is false.';
  return '';
}

function mergeOutputs(outputs) {
  return outputs.reduce((merged, output) => ({
    patches: [...merged.patches, ...(output.patches ?? [])],
    deviceMessages: [...merged.deviceMessages, ...(output.deviceMessages ?? [])],
    blocked: [...merged.blocked, ...(output.blocked ?? [])],
    trace: [...merged.trace, ...(output.trace ?? []).filter((line) => line.type !== 'EVENT')],
  }), { patches: [], deviceMessages: [], blocked: [], trace: [] });
}

export function createDebugSession(script, context = createScriptContext(), options = {}) {
  const breakpoints = new Set((options.breakpoints ?? script?.debug?.breakpoints ?? []).map(String));
  const watchPaths = options.watchPaths ?? script?.debug?.watchPaths ?? ['event.value', `${script?.target ?? 'target'}.value`];
  const reason = disabledReason(script, context);
  const steps = Array.isArray(script?.steps) ? script.steps : [];

  const baseTrace = [{
    time: '12:01:32.120',
    type: reason ? 'SKIP' : 'EVENT',
    message: reason || `${script?.event ?? context.event.name} ${script?.target ?? context.event.target} value=${context.event.value}`,
  }];

  if (reason) {
    return {
      scriptId: script?.id ?? '',
      running: false,
      paused: false,
      pausedAt: '',
      selectedStepId: '',
      reasonNotRun: reason,
      frames: [],
      trace: baseTrace,
      patches: [],
      deviceMessages: [],
      blocked: [],
      watches: watchPaths.map((path) => ({ path, value: readPath(context, path, undefined) })),
    };
  }

  const frames = [];
  const outputs = [];
  let pausedAt = '';
  let running = true;
  const stepLimit = Math.max(1, Number(options.stepLimit) || steps.length || 1);
  const resumePastStepId = String(options.resumePastStepId ?? '');

  for (const [index, step] of steps.entries()) {
    if (index >= stepLimit) break;
    const breakpointHit = breakpoints.has(String(step.id)) && resumePastStepId !== String(step.id);
    if (breakpointHit) {
      pausedAt = String(step.id);
      running = false;
    }

    const output = executeScript({ ...script, rawLanguage: '', steps: [step] }, context);
    outputs.push(output);
    frames.push({
      index,
      stepId: String(step.id),
      command: String(step.command ?? step.cmd ?? ''),
      breakpoint: breakpoints.has(String(step.id)),
      paused: breakpointHit,
      patches: output.patches ?? [],
      deviceMessages: output.deviceMessages ?? [],
      blocked: output.blocked ?? [],
      trace: (output.trace ?? []).filter((line) => line.type !== 'EVENT'),
    });

    if (breakpointHit && options.pauseOnBreakpoint !== false) break;
  }

  const merged = mergeOutputs(outputs);
  const selectedStepId = String(options.selectedStepId || pausedAt || frames.at(-1)?.stepId || '');
  const forcedPause = options.forcePaused === true && selectedStepId;
  return {
    scriptId: script?.id ?? '',
    running: forcedPause ? false : running,
    paused: forcedPause ? true : Boolean(pausedAt),
    pausedAt: forcedPause ? selectedStepId : pausedAt,
    selectedStepId,
    reasonNotRun: '',
    frames,
    trace: [...baseTrace, ...merged.trace],
    patches: merged.patches,
    deviceMessages: merged.deviceMessages,
    blocked: merged.blocked,
    watches: watchPaths.map((path) => ({ path, value: readPath({ ...context, patches: merged.patches }, path, undefined) })),
  };
}
