import { commandDescriptor } from './scriptCommandRegistry.js';
import { evaluateExpression } from './scriptExpressions.js';
import { validateScript } from './scriptRuntime.js';

const KNOWN_EVENTS = new Set([
  'onAny',
  'onValueChanged',
  'onControlChanged',
  'changed',
  'onPointerDown',
  'onPointerUp',
  'onHoverStart',
  'onHoverEnd',
  'onChanged',
  'onPresetLoad',
  'onParameterCommitted',
  'onMidiIn',
  'onSysexIn',
  'onDeviceConnected',
  'onPatchDumpReceived',
  'manual',
]);

function controlId(control) {
  return String(control?._children?.Core?.id ?? '').trim();
}

function controlName(control) {
  return String(control?._children?.Core?.name ?? '').trim();
}

function pushIssue(issues, issue) {
  issues.push({
    level: 'warning',
    code: 'script-warning',
    path: '',
    quickFix: '',
    ...issue,
  });
}

function expressionIssues(expression, path, issues) {
  if (!expression || typeof expression !== 'object' || Array.isArray(expression)) return;
  const op = String(expression.op ?? '');
  const args = Array.isArray(expression.args) ? expression.args : [];

  if ((op === 'scale' || op === 'clamp') && args.length >= 3) {
    const fromMin = Number(args[1]);
    const fromMax = Number(args[2]);
    if (Number.isFinite(fromMin) && Number.isFinite(fromMax) && fromMin === fromMax) {
      pushIssue(issues, {
        level: 'error',
        code: 'invalid-range',
        path,
        message: `${op} uses an empty input range.`,
        quickFix: 'Use different min and max values.',
      });
    }
  }

  args.forEach((arg, index) => expressionIssues(arg, `${path}.args.${index}`, issues));
}

function targetBase(value = '') {
  return String(value).split('.')[0].trim();
}

function targetExists(target, knownTargets) {
  const base = targetBase(target);
  return !base || base === '*' || base === 'any' || base === 'panel' || knownTargets.has(base);
}

function addParameterTargetAliases(targets, parameter) {
  const id = String(parameter?.id ?? '').trim();
  if (!id) return;
  targets.add(id);
  const parts = id.split('.').filter(Boolean);
  if (parts[0]) targets.add(parts[0]);
  if (parts.length > 1) targets.add(parts[parts.length - 1]);
}

function addDeviceProfileTargets(targets, context = {}) {
  const profiles = [
    context.deviceProfile,
    ...(Array.isArray(context.deviceProfiles) ? context.deviceProfiles : []),
  ].filter(Boolean);
  const directParameters = Array.isArray(context.deviceParameters) ? context.deviceParameters : [];
  for (const parameter of directParameters) addParameterTargetAliases(targets, parameter);
  for (const profile of profiles) {
    for (const parameter of profile?.parameters ?? []) addParameterTargetAliases(targets, parameter);
  }
}

function addFallbackDeviceTargets(targets) {
  for (const target of ['cutoff', 'resonance', 'drive', 'filter', 'mode', 'preset', 'ccSwitch']) {
    targets.add(target);
  }
}

function commandTarget(step) {
  const args = step?.args ?? {};
  if (step?.command === 'setValue' || step?.command === 'setState') return args.target;
  if (step?.command === 'setPartColor') return args.part;
  if (step?.command === 'showGroup' || step?.command === 'hideGroup' || step?.command === 'setVisible') return args.target ?? args.group;
  if (step?.command === 'routeValue') return args.to;
  return '';
}

function checkCondition(script, issues) {
  const condition = String(script?.condition ?? '').trim();
  if (!condition) return;
  const lower = condition.toLowerCase();
  if (lower === 'false' || lower === 'never') {
    pushIssue(issues, {
      level: 'warning',
      code: 'impossible-condition',
      path: 'condition',
      message: 'Condition will never run.',
      quickFix: 'Remove the condition or change it to a reachable expression.',
    });
  }
  if (/(event\.value|value)\s*>\s*([0-9.]+)\s*&&\s*(event\.value|value)\s*<\s*([0-9.]+)/.test(lower)) {
    const [, , high, , low] = lower.match(/(event\.value|value)\s*>\s*([0-9.]+)\s*&&\s*(event\.value|value)\s*<\s*([0-9.]+)/) ?? [];
    if (Number(high) >= Number(low)) {
      pushIssue(issues, {
        level: 'warning',
        code: 'impossible-condition',
        path: 'condition',
        message: 'Condition appears impossible because the lower bound is above the upper bound.',
        quickFix: 'Check the comparison signs or use an OR condition.',
      });
    }
  }
}

export function collectProjectScriptTargets({ panel = null, controls = [] } = {}) {
  const panelControls = Array.isArray(panel?.controls) ? panel.controls : controls;
  const targets = new Set(['panel']);
  if ((panelControls ?? []).length === 0) {
    for (const target of [
      'macroControl',
      'cutoff',
      'resonance',
      'drive',
      'filter',
      'mode',
      'preset',
      'ccSwitch',
      'advancedControls',
      'basicControls',
    ]) {
      targets.add(target);
    }
  }
  for (const control of panelControls ?? []) {
    const id = controlId(control);
    const name = controlName(control);
    if (id) targets.add(id);
    if (name) targets.add(name);
  }
  return targets;
}

export function validateScriptForProject(script, context = {}) {
  const issues = [...validateScript(script)];
  const knownTargets = collectProjectScriptTargets(context);
  addDeviceProfileTargets(knownTargets, context);
  if (script?.scope === 'device') addFallbackDeviceTargets(knownTargets);
  const permissions = {
    allowRawCode: false,
    allowDeviceCommandsInPanel: true,
    ...(context.permissions ?? {}),
  };

  if (script?.enabled === false) {
    pushIssue(issues, {
      level: 'info',
      code: 'disabled-script',
      path: 'enabled',
      message: 'Script is disabled and will not run.',
      quickFix: 'Enable it before testing runtime behavior.',
    });
  }

  if (script?.event && !KNOWN_EVENTS.has(String(script.event))) {
    pushIssue(issues, {
      level: 'warning',
      code: 'unknown-event',
      path: 'event',
      message: `Event "${script.event}" is not a known editor/runtime event yet.`,
      quickFix: 'Pick an event from the command library event list.',
    });
  }

  if (script?.target && !targetExists(script.target, knownTargets)) {
    pushIssue(issues, {
      level: 'error',
      code: 'dead-target',
      path: 'target',
      message: `Target "${script.target}" does not match a known control, panel, or wildcard.`,
      quickFix: 'Attach the script to an existing control or use * for any target.',
    });
  }

  if (script?.rawLanguage && permissions.allowRawCode !== true) {
    const rawLanguage = String(script.rawLanguage ?? '').toLowerCase();
    pushIssue(issues, {
      level: 'error',
      code: 'raw-code-blocked',
      path: 'rawLanguage',
      message: 'Raw code is blocked by the current sandbox policy.',
      quickFix: rawLanguage === 'cpp'
        ? 'Use the generated C++ export review, or explicitly enable raw C++ for an export-only build scope.'
        : 'Convert this to command graph steps or explicitly allow raw code for this scope.',
    });
  }

  checkCondition(script, issues);

  const routeTargets = new Set();
  for (const [index, step] of (script?.steps ?? []).entries()) {
    const command = String(step?.command ?? step?.cmd ?? '');
    const descriptor = commandDescriptor(command);
    const path = `steps.${index}`;
    if (!descriptor) continue;

    if (step?.disabled === true) {
      pushIssue(issues, {
        level: 'info',
        code: 'disabled-step',
        path,
        message: `Step ${index + 1} is disabled.`,
        quickFix: 'Enable or remove the step.',
      });
    }

    const target = commandTarget(step);
    if (target && !targetExists(target, knownTargets)) {
      pushIssue(issues, {
        level: 'error',
        code: 'dead-target',
        path: `${path}.args.target`,
        message: `Step ${index + 1} writes to missing target "${target}".`,
        quickFix: 'Choose an existing control, group, or panel target.',
      });
    }

    if (command === 'setValue') {
      const writeTarget = String(step?.args?.target ?? '');
      if (writeTarget) {
        if (routeTargets.has(writeTarget)) {
          pushIssue(issues, {
            level: 'warning',
            code: 'duplicate-route',
            path,
            message: `Multiple steps write to "${writeTarget}" in one event.`,
            quickFix: 'Keep one write or intentionally order the override last.',
          });
        }
        routeTargets.add(writeTarget);
      }
      if (targetBase(writeTarget) === targetBase(script?.target) && ['onValueChanged', 'onControlChanged', 'changed'].includes(String(script?.event))) {
        pushIssue(issues, {
          level: 'warning',
          code: 'circular-route',
          path,
          message: 'Script writes back to the same value target that triggers it.',
          quickFix: 'Use emit=false, a condition, or a separate derived target to avoid feedback loops.',
        });
      }
      expressionIssues(step?.args?.value, `${path}.args.value`, issues);
    }

    if (command === 'sendCC') {
      const channel = Number(evaluateExpression(step?.args?.channel, context.runtimeContext ?? {}));
      const cc = Number(evaluateExpression(step?.args?.cc, context.runtimeContext ?? {}));
      if (!Number.isInteger(channel) || channel < 1 || channel > 16) {
        pushIssue(issues, {
          level: 'error',
          code: 'invalid-midi-channel',
          path: `${path}.args.channel`,
          message: 'MIDI channel must be 1-16.',
          quickFix: 'Set channel to a number between 1 and 16.',
        });
      }
      if (!Number.isInteger(cc) || cc < 0 || cc > 127) {
        pushIssue(issues, {
          level: 'error',
          code: 'invalid-midi-cc',
          path: `${path}.args.cc`,
          message: 'MIDI CC number must be 0-127.',
          quickFix: 'Set CC to a number between 0 and 127.',
        });
      }
    }

    if (command === 'sendSysex' || command === 'buildSysex' || command === 'requestDeviceDump') {
      if (script?.scope !== 'device') {
        pushIssue(issues, {
          level: permissions.allowDeviceCommandsInPanel ? 'warning' : 'error',
          code: 'device-command-outside-device',
          path,
          message: `${descriptor.label} is device-specific and should live in a device script or explicitly marked panel script.`,
          quickFix: 'Move this script to Device scope or attach a device profile.',
        });
      }
    }

    if (command === 'requestDeviceDump') {
      if (!String(step?.args?.request ?? '').trim()) {
        pushIssue(issues, {
          level: 'error',
          code: 'missing-device-request',
          path: `${path}.args.request`,
          message: 'Device dump request needs a profile request id.',
          quickFix: 'Pick a request from the active device profile.',
        });
      }
    }

    if (command === 'sendSysex' || command === 'buildSysex') {
      const bytes = step?.args?.bytes;
      if (!Array.isArray(bytes) || bytes.length === 0) {
        pushIssue(issues, {
          level: 'error',
          code: 'empty-sysex',
          path: `${path}.args.bytes`,
          message: 'SysEx command needs bytes.',
          quickFix: 'Build bytes from the device profile SysEx recipe.',
        });
      } else if (bytes.some((byte) => !Number.isInteger(Number(byte)) || Number(byte) < 0 || Number(byte) > 255)) {
        pushIssue(issues, {
          level: 'error',
          code: 'invalid-byte',
          path: `${path}.args.bytes`,
          message: 'SysEx bytes must be integers between 0 and 255.',
          quickFix: 'Clamp or correct the invalid byte values.',
        });
      }
    }
  }

  return issues;
}
