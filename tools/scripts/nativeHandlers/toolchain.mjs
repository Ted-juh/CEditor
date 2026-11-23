// toolchain.mjs — what the native-handler verifiers build with, on the machine in front of them.
//
// POSIX: cc / c++ (or g++, clang), shared objects made with -fPIC, and -ldl for dlopen.
// Windows: clang and clang++ from LLVM, which target MSVC and so need the Developer environment's
// INCLUDE and LIB (CI's msvc-dev-cmd step sets them); DLLs; and neither -fPIC nor -ldl, which that
// target refuses ("unsupported option '-fPIC' for target 'x86_64-pc-windows-msvc'"). The engine
// itself is built with cl.exe there, as the plug-in is (engineE2E.mjs).
//
// `command -v` is a shell builtin cmd.exe does not have, so on Windows every tool used to read as
// missing and each verifier skipped: the Java and C# instance checks had never run on the platform
// the plug-in ships on.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const IS_WINDOWS = process.platform === 'win32';
export const LIB_EXT = IS_WINDOWS ? '.dll' : process.platform === 'darwin' ? '.dylib' : '.so';
export const EXE_EXT = IS_WINDOWS ? '.exe' : '';

/** Whether `command` is on PATH. */
export function which(command) {
  try {
    execSync(IS_WINDOWS ? `where ${command}` : `command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/*
 * On Windows, the Clang that ships with the Visual Studio whose headers the Developer environment set
 * up (VCINSTALLDIR) goes first on PATH, for every compile here and in the processes they start. That
 * STL accepts only a Clang at least as new as the one it was released with: GitHub's runner image
 * moved to MSVC 14.52, whose headers stop on "STL1000: Unexpected compiler version, expected Clang 22
 * or newer", while the LLVM first on its PATH (C:\Program Files\LLVM) was Clang 20, and both C++
 * checks failed to compile. The Clang in VC\Tools\Llvm is the one its own headers expect (22.1 beside
 * 14.52). On PATH rather than by full path, because the commands name `clang` bare and that path has
 * a space in it. A Visual Studio without its Clang leaves PATH as it was.
 */
if (IS_WINDOWS && process.env.VCINSTALLDIR) {
  const llvmBin = path.join(process.env.VCINSTALLDIR, 'Tools', 'Llvm', process.arch === 'arm64' ? 'ARM64' : 'x64', 'bin');
  if (existsSync(path.join(llvmBin, 'clang.exe'))) {
    const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
    process.env[pathKey] = `${llvmBin}${path.delimiter}${process.env[pathKey] ?? ''}`;
  }
}

/** The first of `candidates` on PATH (clang alone on Windows), or null. */
export function cCompiler(candidates = ['cc', 'clang']) {
  return (IS_WINDOWS ? ['clang'] : candidates).find(which) ?? null;
}

export function cxxCompiler(candidates = ['c++', 'g++', 'clang++']) {
  return (IS_WINDOWS ? ['clang++'] : candidates).find(which) ?? null;
}

/** Makes a shared library that exports only what CE_EXPORT marks. */
export const SHARED_FLAGS = IS_WINDOWS ? '-shared' : '-shared -fPIC -fvisibility=hidden';

/** What a program that opens libraries at run time links against. */
export const DL_LIBS = IS_WINDOWS ? '' : '-ldl';

/**
 * A check that cannot run here says why and passes — unless the run requires every check to run
 * (verify-all.mjs --require, which CI uses): there a skip fails, because a CI log of skips reads as
 * green and proves nothing.
 */
export function skip(message) {
  if (process.env.CE_NH_REQUIRE === '1') {
    console.error(`${message} — and this run requires it (--require).`);
    process.exit(1);
  }
  console.log(message);
  process.exit(0);
}
