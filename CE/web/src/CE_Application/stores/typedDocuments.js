// typedDocuments.js — documents saved and opened as files of their own kind, through the app.
//
// The panel, the script workspace and the panel package each have listeners of their own in C++.
// A smaller document should not need three more: this is one save-as, one save and one open,
// by KIND ('ctrl49Screen'), and C++ decides what a kind's files are called and look like
// (typedDocumentKind in ValueTreeBridgeHandlers.cpp). Each call is a promise of what happened:
//
//   { ok: true, filePath, name, data? }    saved (or opened, with its text)
//   { ok: false, cancelled: true }         the person closed the dialog
//   { ok: false, filePath? }               it could not be written or read
//
// In a plain browser there is no app: Save As downloads the file, Open reads one through a file
// input, and Save to a path cannot happen, so it says so.

import {
  isJuceAvailable, onTypedDocumentResult,
  openTypedDocument as bridgeOpen, saveTypedDocument as bridgeSave, saveTypedDocumentAs as bridgeSaveAs,
} from '../bridge/bridge.js';

/** A kind's file ending, for names and for the browser's own dialogs. */
export const TYPED_DOCUMENT_SUFFIX = { ctrl49Screen: '.assignment.json' };

let listening = false;
let counter = 0;
const pending = new Map();

function request(send) {
  if (!listening) {
    listening = true;
    onTypedDocumentResult((result) => {
      const resolve = pending.get(result?.requestId);
      if (!resolve) return;
      pending.delete(result.requestId);
      resolve({ ok: result.ok === true, cancelled: result.cancelled === true, filePath: result.filePath || '', name: result.name || '', data: result.data });
    });
  }
  const requestId = `typed_${++counter}`;
  return new Promise((resolve) => {
    pending.set(requestId, resolve);
    send(requestId);
  });
}

/** The name a document's file is offered under: its own name, made safe, with the kind's ending. */
export function typedDocumentFileName(kind, name) {
  const base = String(name ?? '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled';
  return `${base}${TYPED_DOCUMENT_SUFFIX[kind] ?? ''}`;
}

/** The document's name from its file's: "Lead.assignment.json" → "Lead". */
export function typedDocumentNameFromFile(kind, fileName) {
  const suffix = TYPED_DOCUMENT_SUFFIX[kind] ?? '';
  const name = String(fileName ?? '').split(/[\\/]/).pop() ?? '';
  if (suffix && name.toLowerCase().endsWith(suffix)) return name.slice(0, -suffix.length);
  return name.replace(/\.[^.]+$/, '');
}

export function saveTypedDocumentAs(kind, suggestedName, text) {
  if (!isJuceAvailable()) {
    const name = typedDocumentFileName(kind, suggestedName);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return Promise.resolve({ ok: true, downloaded: true, filePath: '', name });
  }
  return request((id) => bridgeSaveAs(id, kind, typedDocumentFileName(kind, suggestedName), text));
}

export function saveTypedDocument(kind, filePath, text) {
  if (!isJuceAvailable() || !filePath) return Promise.resolve({ ok: false, filePath });
  return request((id) => bridgeSave(id, kind, filePath, text));
}

export function openTypedDocument(kind) {
  if (!isJuceAvailable()) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = `${TYPED_DOCUMENT_SUFFIX[kind] ?? ''},.json`;
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { resolve({ ok: false, cancelled: true }); return; }
        resolve({ ok: true, filePath: '', name: file.name, data: await file.text() });
      };
      input.click();
    });
  }
  return request((id) => bridgeOpen(id, kind));
}
