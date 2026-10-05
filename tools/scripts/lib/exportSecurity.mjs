import path from 'node:path';
import { lstatSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** One portable filename policy for both exporters, before any filesystem changes. */
export function exportFileName(value) {
  const name = String(value ?? '').trim();
  if (!name || /^[. ]+$/.test(name) || /[. ]$/.test(name)
      || /[\x00-\x1f\x7f\\/:*?"<>|]/.test(name)
      || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)) {
    throw new Error('Invalid plugin name. Use a filename without reserved names, path separators, or trailing dots.');
  }
  return name;
}

/** Fail closed before deleting/replacing a destination, including existing junctions. */
export function assertExportChild(root, target) {
  const base = path.resolve(root);
  const dest = path.resolve(target);
  const relative = path.relative(base, dest);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Export destination must be strictly inside the output folder');
  }
  const physicalRoot = realpathSync(base);
  let current = base;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    let entry;
    try { entry = lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
    if (entry.isSymbolicLink()) throw new Error('Export destination cannot contain a symbolic link or junction');
    const physicalRelative = path.relative(physicalRoot, realpathSync(current));
    if (physicalRelative === '..' || physicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(physicalRelative)) {
      throw new Error('Export destination escaped the output folder');
    }
  }
  return dest;
}

/** CMake also interpolates these values into generated C++/build files. */
export function validateBuildIdentity({ productName, vendor, version, manufacturerCode }) {
  exportFileName(productName);
  for (const value of [productName, vendor]) {
    if (/[\x00-\x1f\x7f"\\;$`]/.test(value)) throw new Error('Plugin name/vendor contains unsupported build metadata characters');
  }
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('Plugin version must contain three or four numeric components');
  if (!/^[A-Za-z][A-Za-z0-9]{3}$/.test(manufacturerCode)) throw new Error('Manufacturer code must be four letters/digits, starting with a letter');
}

export function runCmake(args, options = {}) {
  return execFileSync('cmake', args, { stdio: 'inherit', ...options, shell: false });
}

/** Only the trusted VS setup path goes through cmd; panel metadata never does. */
export function visualStudioEnvironment(vcvars, env = process.env) {
  if (/["%\r\n]/.test(vcvars)) throw new Error('Unsupported Visual Studio setup path');
  const command = `"call "${vcvars}" >nul && set"`;
  const output = execFileSync(env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command],
    { env, encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true });
  const result = { ...env };
  for (const line of output.split(/\r?\n/)) {
    const equals = line.indexOf('=');
    if (equals <= 0) continue;
    const key = line.slice(0, equals);
    for (const old of Object.keys(result)) if (old.toLowerCase() === key.toLowerCase()) delete result[old];
    result[key] = line.slice(equals + 1);
  }
  return result;
}
