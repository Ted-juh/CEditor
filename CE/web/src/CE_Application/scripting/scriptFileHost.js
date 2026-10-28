// ce.file's dialogs in the panel view: open, save, read, write, folder, list and saveIn
// (docs/design/ce-file-module.md). The native side (CE/src/ScriptFiles.h) holds the files the person
// chose; this side holds file values, which carry an id and never a path, and turns contents into
// what a script works with: bytes for syx and mid, text for txt and csv, a value for json.
//
// The bridge is one event each way: "scriptFile" { requestId, op, ... } out, "scriptFileResult"
// { requestId, ok, error, cancelled, file, files, data } back. Contents cross as base64.
//
// `host`: { say(level, text), send(payload) -> boolean, call(fn, ...args), listings }. `send` answers
// false when there is no native side (a plain browser); `call` runs a script's function as its
// script; `listings`, optional, is a Map of folder id to its files that several scripts share.

export const FILE_TYPES = ['syx', 'mid', 'json', 'txt', 'csv'];
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
const BYTE_TYPES = ['syx', 'mid'];
const TEXT_TYPES = ['txt', 'csv'];
const ID = /^[0-9a-f]{32}$/;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = a * 65536 + (b ?? 0) * 256 + (c ?? 0);
    out += B64[Math.floor(n / 262144) % 64] + B64[Math.floor(n / 4096) % 64]
      + (b === undefined ? '=' : B64[Math.floor(n / 64) % 64]) + (c === undefined ? '=' : B64[n % 64]);
  }
  return out;
}

export function fromBase64(text) {
  const clean = String(text ?? '').replace(/[^A-Za-z0-9+/=]/g, '');
  const out = [];
  for (let i = 0; i + 3 < clean.length; i += 4) {
    const group = clean.slice(i, i + 4);
    const pad = (group.match(/=/g) ?? []).length;
    let n = 0;
    for (let j = 0; j < 4; j += 1) n = n * 64 + (group[j] === '=' ? 0 : B64.indexOf(group[j]));
    out.push(Math.floor(n / 65536) % 256);
    if (pad < 2) out.push(Math.floor(n / 256) % 256);
    if (pad < 1) out.push(n % 256);
  }
  return out;
}

/** A file's type from its name, as the native side reads it: ".midi" is a MIDI file too. */
export function fileTypeOfName(name) {
  const text = String(name ?? '');
  const at = text.lastIndexOf('.');
  if (at < 0) return '';
  const ext = text.slice(at + 1).toLowerCase();
  return ext === 'midi' ? 'mid' : ext;
}

/** A name with no folder in it. */
export function isPlainFileName(name) {
  const text = String(name ?? '');
  return text.trim() !== '' && !/[\\/:]/.test(text) && !text.includes('..') && text !== '.';
}

function isBytes(v) {
  return Array.isArray(v) && v.every((b) => typeof b === 'number' && Number.isInteger(b) && b >= 0 && b <= 255);
}

/** What a script gives, as the bytes of a file of `type`; or an { error }. */
export function encodeFileData(type, data, opts) {
  if (BYTE_TYPES.includes(type)) {
    if (typeof data === 'string' && /^(\s*[0-9a-fA-F]{2})*\s*$/.test(data)) {
      return { bytes: (data.match(/[0-9a-fA-F]{2}/g) ?? []).map((h) => parseInt(h, 16)) };
    }
    if (!isBytes(data)) return { error: `a .${type} file is written from bytes, a list of numbers 0 to 255 or hex text` };
    return { bytes: data.slice() };
  }
  if (TEXT_TYPES.includes(type)) {
    if (typeof data !== 'string') return { error: `a .${type} file is written from text` };
    return { bytes: Array.from(new TextEncoder().encode(data)) };
  }
  if (type === 'json') {
    const indent = Number(opts && typeof opts === 'object' ? opts.indent : undefined);
    let text;
    try {
      text = JSON.stringify(data === undefined ? null : data, null, Number.isFinite(indent) && indent > 0 ? Math.min(8, Math.floor(indent)) : undefined);
    } catch (e) {
      return { error: `the value cannot be written as JSON (${e?.message ?? e})` };
    }
    return { bytes: Array.from(new TextEncoder().encode(text)) };
  }
  return { error: `"${type}" is not a type ce.file writes` };
}

/** A file's bytes as a script works with them; or an { error } for JSON that does not parse. */
export function decodeFileData(type, bytes) {
  if (BYTE_TYPES.includes(type)) return { value: bytes };
  const text = new TextDecoder('utf-8').decode(Uint8Array.from(bytes));
  if (type !== 'json') return { value: text };
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    const at = /position (\d+)/.exec(String(e?.message ?? ''));
    const line = at ? text.slice(0, Number(at[1])).split('\n').length : null;
    return { error: line ? `it is not valid JSON: it stops making sense on line ${line}` : 'it is not valid JSON' };
  }
}

/** A file value from ce.file: an object with the id the native side gave it. */
function isFileValue(v) {
  return v !== null && typeof v === 'object' && typeof v.id === 'string' && ID.test(v.id);
}

function fileValue(raw) {
  return {
    id: String(raw?.id ?? ''),
    name: String(raw?.name ?? ''),
    type: String(raw?.type ?? ''),
    size: Number(raw?.size ?? 0),
    canWrite: raw?.canWrite === true,
    isFolder: raw?.isFolder === true,
  };
}

export function createFileDialogs(host) {
  const say = (level, text) => host.say(level, text);
  const pending = new Map();      // requestId -> (result) => void
  const listings = host.listings instanceof Map ? host.listings : new Map();     // folder id -> [file value]
  let nextId = 1;

  function ask(verb, payload, done) {
    const requestId = `f${nextId}`;
    nextId += 1;
    pending.set(requestId, done);
    if (host.send({ ...payload, requestId }) !== true) {
      pending.delete(requestId);
      say('error', `ce.file.${verb}: there is no file dialog here (no native host), so nothing was done.`);
      return false;
    }
    return true;
  }

  /** The native side answered. */
  function receive(result) {
    const done = pending.get(String(result?.requestId ?? ''));
    if (!done) return;
    pending.delete(String(result.requestId));
    done(result);
  }

  function call(fn, ...args) {
    if (typeof fn === 'function') host.call(fn, ...args);
  }

  function needFn(verb, fn, required = true) {
    if (typeof fn === 'function' || (!required && (fn === undefined || fn === null))) return true;
    say('error', `ce.file.${verb}: fn must be a function, so nothing was done.`);
    return false;
  }

  function needFile(verb, file, folder) {
    if (isFileValue(file) && (file.isFolder === true) === folder) return true;
    say('error', folder
      ? `ce.file.${verb}: that is not a folder value from ce.file.folder, so nothing was done.`
      : `ce.file.${verb}: that is not a file value from ce.file.open, save or list, so nothing was done.`);
    return false;
  }

  function typesOf(verb, v, required) {
    const list = typeof v === 'string' ? [v] : (Array.isArray(v) ? v.map((t) => String(t).toLowerCase()) : null);
    if (list === null || list.length === 0) {
      if (!required && (v === undefined || v === null)) return [];
      say('error', `ce.file.${verb}: types must name what to open, from ${FILE_TYPES.join(', ')}, so nothing was done.`);
      return null;
    }
    for (const t of list) {
      if (!FILE_TYPES.includes(t)) {
        say('error', `ce.file.${verb}: "${t}" is not a type ce.file opens (${FILE_TYPES.join(', ')}), so nothing was done.`);
        return null;
      }
    }
    return list;
  }

  /** Bytes, as base64, for writing `data` as `type`; null (said) when they cannot be. */
  function encoded(verb, type, data, opts) {
    const out = encodeFileData(type, data, opts);
    if (out.error) {
      say('error', `ce.file.${verb}: ${out.error}, so nothing was written.`);
      return null;
    }
    if (out.bytes.length > MAX_FILE_BYTES) {
      say('error', `ce.file.${verb}: that is ${out.bytes.length} bytes, and a file can be up to 8 MB, so nothing was written.`);
      return null;
    }
    return toBase64(out.bytes);
  }

  /** A file's contents for a script; undefined (said) when JSON does not parse. */
  function contents(verb, file, base64) {
    const out = decodeFileData(file.type, fromBase64(base64));
    if (out.error) {
      say('error', `ce.file.${verb}: "${file.name}": ${out.error}.`);
      return undefined;
    }
    return out.value;
  }

  function open(opts, fn) {
    if (!needFn('open', fn)) return false;
    const types = typesOf('open', opts && typeof opts === 'object' ? opts.types : undefined, true);
    if (types === null) return false;
    const readNow = !(opts && opts.read === false);
    return ask('open', {
      op: 'open', types, title: typeof opts?.title === 'string' ? opts.title : 'Open',
      multiple: opts?.multiple === true, writable: opts?.writable === true, read: readNow,
    }, (result) => {
      if (result.error) say(result.ok ? 'warn' : 'error', `ce.file.open: ${result.error}.`);
      const files = Array.isArray(result.files) ? result.files : [];
      if (!result.ok || files.length === 0) { call(fn, undefined); return; }
      for (const raw of files) {
        const file = fileValue(raw);
        call(fn, file, readNow ? contents('open', file, raw.data) : undefined);
      }
    });
  }

  function save(name, data, opts, fn) {
    if (typeof opts === 'function' && fn === undefined) { fn = opts; opts = undefined; }
    if (!needFn('save', fn, false)) return false;
    const type = fileTypeOfName(name);
    if (!isPlainFileName(name) || !FILE_TYPES.includes(type)) {
      say('error', `ce.file.save: the name must end in .${FILE_TYPES.join(', .')}, and hold no folder, so nothing was saved.`);
      return false;
    }
    const base64 = encoded('save', type, data, opts);
    if (base64 === null) return false;
    return ask('save', { op: 'save', name: String(name), data: base64, title: typeof opts?.title === 'string' ? opts.title : 'Save' }, (result) => {
      if (result.ok && result.file) { call(fn, fileValue(result.file)); return; }
      if (result.error) say('error', `ce.file.save: ${result.error}.`);
      call(fn, undefined, result.cancelled ? 'cancelled' : String(result.error ?? 'not saved'));
    });
  }

  function read(file, fn) {
    if (!needFn('read', fn) || !needFile('read', file, false)) return false;
    return ask('read', { op: 'read', id: file.id }, (result) => {
      if (!result.ok) {
        say('error', `ce.file.read: ${result.error}.`);
        call(fn, undefined, String(result.error ?? 'not read'));
        return;
      }
      call(fn, contents('read', fileValue(file), result.data));
    });
  }

  function write(file, data, fn) {
    if (!needFn('write', fn, false) || !needFile('write', file, false)) return false;
    if (file.canWrite !== true) {
      say('error', `ce.file.write: "${String(file.name)}" may not be written: the person must save to it first, or open it with writable. Nothing was written.`);
      return false;
    }
    const base64 = encoded('write', String(file.type), data);
    if (base64 === null) return false;
    return ask('write', { op: 'write', id: file.id, data: base64 }, (result) => {
      if (!result.ok) say('error', `ce.file.write: ${result.error}.`);
      call(fn, result.ok === true, result.ok ? undefined : String(result.error ?? 'not written'));
    });
  }

  function folder(opts, fn) {
    if (typeof opts === 'function' && fn === undefined) { fn = opts; opts = undefined; }
    if (!needFn('folder', fn)) return false;
    return ask('folder', { op: 'folder', title: typeof opts?.title === 'string' ? opts.title : 'Choose a folder', writable: opts?.writable === true }, (result) => {
      if (!result.ok || !result.file) { call(fn, undefined); return; }
      const dir = fileValue(result.file);
      listings.set(dir.id, (Array.isArray(result.files) ? result.files : []).map(fileValue));
      call(fn, dir);
    });
  }

  function list(dir, opts) {
    if (!needFile('list', dir, true)) return [];
    const types = typesOf('list', opts && typeof opts === 'object' ? opts.types : undefined, false);
    if (types === null) return [];
    // From what the native side last said; asked again, so the next call sees what changed since.
    ask('list', { op: 'list', id: dir.id }, (result) => {
      if (result.ok) listings.set(dir.id, (Array.isArray(result.files) ? result.files : []).map(fileValue));
    });
    const known = listings.get(dir.id) ?? [];
    return known.filter((f) => types.length === 0 || types.includes(f.type)).map((f) => ({ ...f }));
  }

  function saveIn(dir, name, data, opts, fn) {
    if (typeof opts === 'function' && fn === undefined) { fn = opts; opts = undefined; }
    if (!needFn('saveIn', fn, false) || !needFile('saveIn', dir, true)) return false;
    if (dir.canWrite !== true) {
      say('error', `ce.file.saveIn: the folder was not chosen writable, so nothing was written. Ask with ce.file.folder({ writable = true }).`);
      return false;
    }
    const type = fileTypeOfName(name);
    if (!isPlainFileName(name) || !FILE_TYPES.includes(type)) {
      say('error', `ce.file.saveIn: "${String(name)}" must be a plain file name ending in .${FILE_TYPES.join(', .')}, with no /, \\ or .. in it, so nothing was written.`);
      return false;
    }
    const base64 = encoded('saveIn', type, data, opts);
    if (base64 === null) return false;
    return ask('saveIn', { op: 'saveIn', id: dir.id, name: String(name), data: base64, replace: opts?.replace === true }, (result) => {
      if (!result.ok) {
        say('error', `ce.file.saveIn: ${result.error}.`);
        call(fn, undefined, String(result.error ?? 'not written'));
        return;
      }
      if (Array.isArray(result.files)) listings.set(dir.id, result.files.map(fileValue));
      call(fn, fileValue(result.file));
    });
  }

  /** The panel closed: every file value is forgotten, here and natively, and no answer is awaited. */
  function forget() {
    pending.clear();
    listings.clear();
    host.send({ op: 'forget', requestId: '' });
  }

  return { open, save, read, write, folder, list, saveIn, receive, forget };
}
