// Long-running device jobs: preset list scans and chunked bulk dump sends, including the
// local (previewOnly / draft-source) job builder and cancellation for both native and local jobs.
import { get } from 'svelte/store';
import {
  startPresetListScan as requestPresetListScan,
  cancelPresetListScan as requestPresetListScanCancel,
  startBulkDumpSend as requestBulkDumpSend,
  cancelBulkDumpSend as requestBulkDumpSendCancel,
  isJuceAvailable,
} from '../bridge/bridge.js';
import {
  deviceRoleMappings,
  latestPresetListScan,
  latestBulkDumpSend,
  bulkDumpSends,
} from './deviceProfileStores.js';
import {
  bytesToHex,
  clampInt,
  localBuildPresetListScan,
  localProfileMode,
  parseProfileSourceText,
  parseRawMidiHexText,
} from './deviceProfileLocalEngine.js';
import { initDeviceProfileBridge } from './deviceProfileSession.js';
import { DEFAULT_DEVICE_ROLE } from './deviceConstants.js';

function localBuildBulkDumpSend({
  bulkSendId = `bulk_send_${Date.now()}`,
  deviceRole = DEFAULT_DEVICE_ROLE,
  profileId = '',
  hex = '',
  message = '',
  dataHex = '',
  label = 'Bulk dump send',
  chunkSizeBytes,
  bulkChunkBytes,
  chunkBytes,
  chunkDelayMs,
  bulkChunkDelayMs,
  expectedCollectionId = '',
  verifyCollectionId = '',
  expectedDumpId = '',
  ackHex = '',
  nakHex = '',
  ackPolicy = null,
  retries = 0,
  source = '',
  dryRun = true,
} = {}) {
  const parsedHex = parseRawMidiHexText(hex || message || dataHex);
  const resolvedProfileId = String(profileId || get(deviceRoleMappings)?.[deviceRole]?.profileId || '');
  if (!parsedHex.ok) {
    return {
      ok: false,
      bulkSendId,
      deviceRole,
      profileId: resolvedProfileId,
      status: 'error',
      error: parsedHex.error,
      chunks: [],
      totalChunks: 0,
      totalBytes: 0,
      sentBytes: 0,
      sentChunks: 0,
      failedChunks: 0,
      progress: 0,
      local: true,
    };
  }

  const parsedProfile = source ? parseProfileSourceText(resolvedProfileId, source) : { ok: false, profile: null };
  const timing = parsedProfile.ok ? (parsedProfile.profile?.timing ?? {}) : {};
  const resolvedChunkSize = clampInt(
    chunkSizeBytes ?? bulkChunkBytes ?? chunkBytes ?? timing.bulkChunkBytes ?? 256,
    1,
    1024 * 1024
  );
  const resolvedDelay = Math.max(0, Number(
    chunkDelayMs
    ?? bulkChunkDelayMs
    ?? timing.bulkChunkDelayMs
    ?? timing.interMessageDelayMs
    ?? timing.minDelayBetweenMessagesMs
    ?? 50
  ) || 0);

  const chunks = [];
  for (let offset = 0; offset < parsedHex.bytes.length; offset += resolvedChunkSize) {
    const bytes = parsedHex.bytes.slice(offset, offset + resolvedChunkSize);
    chunks.push({
      index: chunks.length,
      offset,
      byteCount: bytes.length,
      hex: bytesToHex(bytes),
      status: dryRun ? 'preview' : 'queued',
      error: '',
      dueTimeMs: dryRun ? 0 : chunks.length * resolvedDelay,
      sentAtMs: 0,
    });
  }

  return {
    ok: true,
    bulkSendId,
    deviceRole,
    profileId: resolvedProfileId,
    label,
    status: dryRun ? 'preview' : 'running',
    running: !dryRun,
    messageType: parsedHex.bytes[0] === 0xf0 ? 'sysex' : 'raw',
    totalBytes: parsedHex.bytes.length,
    sentBytes: 0,
    chunkSizeBytes: resolvedChunkSize,
    chunkDelayMs: resolvedDelay,
    totalChunks: chunks.length,
    sentChunks: 0,
    failedChunks: 0,
    pendingChunks: dryRun ? 0 : chunks.length,
    progress: 0,
    cancelled: false,
    dryRun,
    expectedCollectionId: expectedCollectionId || verifyCollectionId || expectedDumpId,
    verificationStatus: expectedCollectionId || verifyCollectionId || expectedDumpId ? 'waiting' : 'none',
    ackStatus: ackHex || nakHex || ackPolicy?.ackHex || ackPolicy?.nakHex ? 'waiting' : 'none',
    ackHex: ackHex || ackPolicy?.ackHex || '',
    nakHex: nakHex || ackPolicy?.nakHex || '',
    retriesRemaining: Number(ackPolicy?.retries ?? retries ?? 0),
    retryCount: 0,
    dumpCollection: null,
    chunks,
    local: true,
  };
}

export function startPresetListScan({
  scanId = `preset_scan_${Date.now()}`,
  deviceRole = DEFAULT_DEVICE_ROLE,
  profileId = '',
  request = '',
  slotVariable = '',
  slots,
  variables = {},
  source = '',
  dryRun = true,
} = {}) {
  initDeviceProfileBridge();
  const role = String(deviceRole || DEFAULT_DEVICE_ROLE);
  const resolvedProfileId = String(profileId || get(deviceRoleMappings)?.[role]?.profileId || '');
  latestPresetListScan.set({ scanId, profileId: resolvedProfileId, deviceRole: role, running: true, entries: [] });

  const useLocal = localProfileMode(resolvedProfileId, source);
  if (useLocal) {
    const parsed = parseProfileSourceText(resolvedProfileId, source);
    if (!parsed.ok) {
      latestPresetListScan.set({ scanId, profileId: resolvedProfileId, deviceRole: role, ok: false, error: parsed.error, entries: [] });
      return;
    }
    latestPresetListScan.set({
      scanId,
      ...localBuildPresetListScan(parsed.profile, { deviceRole: role, request, slotVariable, slots }),
    });
    return;
  }

  const payload = {
    scanId,
    deviceRole: role,
    profileId: resolvedProfileId,
    dryRun,
  };
  if (request) payload.request = request;
  if (slotVariable) payload.slotVariable = slotVariable;
  if (Array.isArray(slots)) payload.slots = slots;
  if (variables && Object.keys(variables).length > 0) payload.variables = variables;
  requestPresetListScan(payload);
}

export function cancelPresetListScan({ scanId = '' } = {}) {
  initDeviceProfileBridge();
  const current = get(latestPresetListScan);
  const resolvedScanId = String(scanId || current?.scanId || '');
  if (isJuceAvailable() && !current?.local) {
    requestPresetListScanCancel({ scanId: resolvedScanId });
    return;
  }

  if (!current) return;
  latestPresetListScan.set({
    ...current,
    scanId: resolvedScanId,
    status: 'cancelled',
    running: false,
    cancelled: true,
    entries: (current.entries ?? []).map((entry) => (
      ['queued', 'waiting', 'running'].includes(entry?.status)
        ? { ...entry, status: 'cancelled' }
        : entry
    )),
  });
}

export function startBulkDumpSend({
  bulkSendId = `bulk_send_${Date.now()}`,
  deviceRole = DEFAULT_DEVICE_ROLE,
  profileId = '',
  hex = '',
  message = '',
  dataHex = '',
  label = 'Bulk dump send',
  chunkSizeBytes,
  bulkChunkBytes,
  chunkBytes,
  chunkDelayMs,
  bulkChunkDelayMs,
  expectedCollectionId = '',
  verifyCollectionId = '',
  expectedDumpId = '',
  ackHex = '',
  nakHex = '',
  ackPolicy = null,
  retries = 0,
  source = '',
  dryRun = true,
} = {}) {
  initDeviceProfileBridge();
  const role = String(deviceRole || DEFAULT_DEVICE_ROLE);
  const resolvedProfileId = String(profileId || get(deviceRoleMappings)?.[role]?.profileId || '');
  const payload = {
    bulkSendId,
    deviceRole: role,
    profileId: resolvedProfileId,
    hex: hex || message || dataHex,
    label,
    dryRun,
  };
  if (expectedCollectionId || verifyCollectionId || expectedDumpId) payload.expectedCollectionId = expectedCollectionId || verifyCollectionId || expectedDumpId;
  if (ackHex) payload.ackHex = ackHex;
  if (nakHex) payload.nakHex = nakHex;
  if (ackPolicy) payload.ackPolicy = ackPolicy;
  if (retries != null) payload.retries = retries;
  if (chunkSizeBytes != null) payload.chunkSizeBytes = chunkSizeBytes;
  if (bulkChunkBytes != null) payload.bulkChunkBytes = bulkChunkBytes;
  if (chunkBytes != null) payload.chunkBytes = chunkBytes;
  if (chunkDelayMs != null) payload.chunkDelayMs = chunkDelayMs;
  if (bulkChunkDelayMs != null) payload.bulkChunkDelayMs = bulkChunkDelayMs;

  latestBulkDumpSend.set({
    ...payload,
    profileId: resolvedProfileId,
    status: dryRun ? 'previewing' : 'running',
    running: !dryRun,
  });

  if (isJuceAvailable() && !source) {
    requestBulkDumpSend(payload);
    return;
  }

  const local = localBuildBulkDumpSend({
    ...payload,
    source,
  });
  latestBulkDumpSend.set(local);
  if (local.bulkSendId) {
    bulkDumpSends.update((jobs) => [
      ...jobs.filter((job) => job?.bulkSendId !== local.bulkSendId),
      local,
    ]);
  }
}

export function cancelBulkDumpSend({ bulkSendId = '' } = {}) {
  initDeviceProfileBridge();
  const current = get(latestBulkDumpSend);
  const resolvedBulkSendId = String(bulkSendId || current?.bulkSendId || '');
  if (isJuceAvailable() && !current?.local) {
    requestBulkDumpSendCancel({ bulkSendId: resolvedBulkSendId });
    return;
  }

  if (!current) return;
  const cancelled = {
    ...current,
    bulkSendId: resolvedBulkSendId,
    status: 'cancelled',
    running: false,
    cancelled: true,
    chunks: (current.chunks ?? []).map((chunk) => (
      ['queued', 'running', 'preview'].includes(chunk?.status)
        ? { ...chunk, status: 'cancelled' }
        : chunk
    )),
  };
  latestBulkDumpSend.set(cancelled);
  bulkDumpSends.update((jobs) => [
    ...jobs.filter((job) => job?.bulkSendId !== resolvedBulkSendId),
    cancelled,
  ]);
}
