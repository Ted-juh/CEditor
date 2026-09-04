/** Commands that remain useful and safe while the rig is locked for performance. Keep this
 * list in step with InstrumentHostService.cpp: the browser preview mirrors the native deny-
 * by-default boundary, while the native service remains authoritative in the application. */
export const STAGE_SAFE_COMMANDS = new Set([
  'beginParameterGesture', 'endParameterGesture', 'getAudioDevices', 'getHostProject',
  'getLibrary', 'getLicence', 'getParameters', 'getState', 'getSurfaceLayout', 'focusPart', 'hostNote',
  'launchClip', 'launchScene', 'panic', 'previewSupportBundle', 'resetParameter',
  'setBusLevel', 'setControlSlotValue', 'setEffectBypassed', 'setExternalClock',
  'setMacroValue', 'setMasterLevel', 'setParameter', 'setParameterText', 'setPartMixer',
  'setModulationRoute', 'setMidiLfo', 'setMidiLfoOutput', 'resetMidiLfo',
  'setEnvelope', 'triggerEnvelope', 'resetEnvelope', 'setMseg', 'resetMseg',
  'setRandomModulator', 'resetRandomModulator',
  'setReturnLevel', 'setSendLevel', 'setTempo', 'setTimeSignature',
  'setTransportPosition', 'setlistGo', 'setlistNext', 'setlistPrev', 'stopAllClips',
  'stopClip', 'transportContinue', 'transportPlay', 'transportStop', 'walkPartPreset',
  'startMidiLoop', 'finishMidiLoop', 'cancelMidiLoop',
  'startGestureRecording', 'finishGestureRecording', 'cancelGestureRecording',
  'startPerformanceRecording', 'finishPerformanceRecording', 'cancelPerformanceRecording',
  'removePerformanceTake', 'replayPerformanceTake', 'stopPerformanceReplay',
  'surfacePerformanceEncoder', 'surfaceStepPad',
  'retryFailedProcessor', 'dismissFailoverEvent',
  'cancelHardwarePatchCapture', 'cancelKeyChordLearn', 'cancelLearnControlSlotParameter',
  'cancelMidiLearn', 'disarmCapture',
]);

export function stageCommandAllowed(stageLocked, command) {
  return stageLocked !== true || STAGE_SAFE_COMMANDS.has(String(command ?? ''));
}
