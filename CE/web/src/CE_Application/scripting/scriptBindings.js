import { latestMidiPreview } from '../stores/deviceProfiles.js';
import { updatePanelPreviewSession } from '../stores/interactionPreview.js';
import { createScriptContext, executeScript } from './scriptRuntime.js';

function controlId(control) {
  return String(control?._children?.Core?.id ?? '');
}

function controlName(control) {
  return String(control?._children?.Core?.name ?? '');
}

function controlScripts(control) {
  const section = control?._children?.Scripts;
  if (section?.enabled === false || section?.runInPreview === false) return [];
  return Array.isArray(section?.scripts) ? section.scripts : [];
}

export function panelScripts(panel) {
  if (panel?.scripting?.enabled === false || panel?.scripting?.runInPreview === false) return [];
  return [
    ...(Array.isArray(panel?.scripts) ? panel.scripts : []),
    ...(Array.isArray(panel?.scripting?.scripts) ? panel.scripting.scripts : []),
  ];
}

function normalizedEventNames(patch = {}) {
  const names = new Set(['onAny']);
  if (Object.prototype.hasOwnProperty.call(patch, 'pressed')) {
    names.add(patch.pressed === true ? 'onPointerDown' : 'onPointerUp');
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, 'valueOverride')
    || Object.prototype.hasOwnProperty.call(patch, 'currentValueOverride')
    || Object.prototype.hasOwnProperty.call(patch, 'startValueOverride')
    || Object.prototype.hasOwnProperty.call(patch, 'endValueOverride')
    || Object.prototype.hasOwnProperty.call(patch, 'customValues')
  ) {
    names.add('onValueChanged');
    names.add('onControlChanged');
    names.add('changed');
  }
  return names;
}

function patchValue(patch = {}, previousSession = {}) {
  if (Object.prototype.hasOwnProperty.call(patch, 'valueOverride')) return patch.valueOverride;
  if (Object.prototype.hasOwnProperty.call(patch, 'currentValueOverride')) return patch.currentValueOverride;
  if (Object.prototype.hasOwnProperty.call(patch, 'startValueOverride')) return patch.startValueOverride;
  if (Object.prototype.hasOwnProperty.call(patch, 'endValueOverride')) return patch.endValueOverride;
  if (patch.customValues && typeof patch.customValues === 'object') {
    if (Object.prototype.hasOwnProperty.call(patch.customValues, 'mainValue')) return patch.customValues.mainValue;
    const firstValue = Object.values(patch.customValues)[0];
    if (firstValue !== undefined) return firstValue;
  }
  if (Object.prototype.hasOwnProperty.call(previousSession, 'valueOverride')) return previousSession.valueOverride;
  return patch.checked === true ? 1 : 0;
}

function scriptTargetMatches(script, sourceControl) {
  const target = String(script?.target ?? '').trim();
  if (!target || target === '*' || target === 'any') return true;
  return target === controlId(sourceControl) || target === controlName(sourceControl);
}

function scriptEventMatches(script, eventNames) {
  const event = String(script?.event ?? '').trim();
  return !event || eventNames.has(event);
}

function previewPatchForScriptPatch(scriptPatch, controls = []) {
  const rawTarget = String(scriptPatch?.target ?? '');
  const [targetId, targetSlot = 'value'] = rawTarget.split('.');
  const targetControl = controls.find((control) => controlId(control) === targetId || controlName(control) === targetId);
  const id = controlId(targetControl);
  if (!id) return null;

  const slot = String(targetSlot || 'value').toLowerCase();
  if (slot === 'start' || slot === 'startvalue') {
    return { controlId: id, patch: { startValueOverrideEnabled: true, startValueOverride: scriptPatch.value, activeHandle: 'start' } };
  }
  if (slot === 'end' || slot === 'endvalue') {
    return { controlId: id, patch: { endValueOverrideEnabled: true, endValueOverride: scriptPatch.value, activeHandle: 'end' } };
  }
  if (slot === 'current' || slot === 'currentvalue') {
    return { controlId: id, patch: { currentValueOverrideEnabled: true, currentValueOverride: scriptPatch.value, valueOverrideEnabled: true, valueOverride: scriptPatch.value, activeHandle: 'current' } };
  }
  if (slot === 'state') {
    return { controlId: id, patch: { valueOverrideEnabled: true, valueOverride: scriptPatch.value } };
  }
  return { controlId: id, patch: { valueOverrideEnabled: true, valueOverride: scriptPatch.value } };
}

export function runPanelPreviewScriptsForPatch({ panel, controls = [], sourceControl, patch = {}, previousSession = {} }) {
  if (!panel || !sourceControl || !patch || typeof patch !== 'object') return [];

  const phase = patch.dragging === true ? 'preview' : 'commit';
  const eventNames = normalizedEventNames(patch);
  const value = patchValue(patch, previousSession);
  const scripts = [
    ...panelScripts(panel),
    ...controlScripts(sourceControl).map((script) => ({ ...script, scope: script.scope ?? 'component' })),
  ].filter((script) =>
    script?.enabled !== false
    && scriptEventMatches(script, eventNames)
    && scriptTargetMatches(script, sourceControl)
  );

  const results = [];
  for (const script of scripts) {
    const result = executeScript(script, createScriptContext({
      event: {
        name: String(script.event ?? 'onValueChanged'),
        target: controlId(sourceControl),
        value,
        phase,
        origin: 'panel.preview',
      },
      values: Object.fromEntries(controls.map((control) => {
        const id = controlId(control);
        return [id, { value: id === controlId(sourceControl) ? value : 0 }];
      })),
    }));

    for (const scriptPatch of result.patches ?? []) {
      const previewPatch = previewPatchForScriptPatch(scriptPatch, controls);
      if (previewPatch) updatePanelPreviewSession(previewPatch.controlId, previewPatch.patch);
    }

    for (const message of result.deviceMessages ?? []) {
      latestMidiPreview.set({
        ok: true,
        source: 'script-preview',
        scriptId: script.id,
        message,
      });
    }

    results.push({ script, result });
  }
  return results;
}
