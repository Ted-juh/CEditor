import { writable } from 'svelte/store';

// Session-local and never deserialized from a panel, localStorage or exported file.
const approved = new Map();
const nativeApproved = new Map();
export const scriptExecutionStatus = writable({ blocked: false, name: '' });

export function executionFingerprint(scripts, extensions = []) {
  return JSON.stringify({
    scripts: scripts.map(s => ({ id: s.id, language: s.language, source: s.source,
      compiledJs: s.compiledJs, scope: s.scope, target: s.target, event: s.event, enabled: s.enabled })),
    extensions,
  });
}

export function isExecutionApproved(panelKey, fingerprint) {
  return approved.get(panelKey) === fingerprint;
}
export function isNativeExecutionApproved(panelKey, fingerprint) { return nativeApproved.get(panelKey) === fingerprint; }
export function approveExecution(panelKey, fingerprint, allowNative = false) {
  approved.set(panelKey, fingerprint);
  if (allowNative) nativeApproved.set(panelKey, fingerprint);
  else nativeApproved.delete(panelKey);
}
export function revokeExecution(panelKey) { approved.delete(panelKey); nativeApproved.delete(panelKey); }

// Avoid making the document store import the runtime (which depends on that store).
let exportApprovalCheck = null;
export function setExportApprovalCheck(check) { exportApprovalCheck = check; }
export function mayExportPanelCode(panel) {
  if (exportApprovalCheck) return exportApprovalCheck(panel);
  // Without a running runtime, only documents without executable content can export.
  const containsCode = (value) => {
    if (!value || typeof value !== 'object') return false;
    if (typeof value.source === 'string' && value.source.trim()) return true;
    if (typeof value.compiledJs === 'string' && value.compiledJs.trim()) return true;
    return Object.values(value).some(containsCode);
  };
  return !containsCode([panel?.scripts ?? [], panel?.controls ?? [], panel?.scripting?.extensions ?? []]);
}
