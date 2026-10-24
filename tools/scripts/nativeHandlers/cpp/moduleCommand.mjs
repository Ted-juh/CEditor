// moduleCommand.mjs — the one command that compiles a panel's generated C++ handlers into a module.
//
// The exporter (nativeHandlers/index.mjs) and the verifiers (cpp/verify.mjs, cpp/verify-host.mjs)
// both build with it. They used to build with flags of their own, so CI compiled and loaded C++
// modules the verifiers' way while every export with a C++ handler failed on Linux the exporter's
// way: `-static` there asked the linker to put the static C library into a shared object.

/**
 * `cxx` is the compiler; `targetsWindows` says it is the bundled MinGW clang, which builds Windows
 * DLLs on any host. The flags:
 *
 *   -ffp-contract=off  ce_runtime.h's helpers match the preview to the bit, and a fused multiply-add
 *                      (lerp's a + (b - a) * t) rounds once where JS rounds twice. Clang contracts
 *                      within an expression by default wherever the target has FMA (every ARM64).
 *   MinGW clang        -static: its C++ runtime goes in the DLL, so nothing has to sit beside it.
 *   other on Windows   nothing more: clang targeting MSVC links the MSVC runtime the Developer
 *                      environment names, and refuses -fPIC ("unsupported option for target").
 *   macOS              -fPIC; libc++ comes from the system.
 *   Linux              -fPIC, with libstdc++ and libgcc linked in for the same reason as -static
 *                      on MinGW. Plain -static there cannot link at all.
 */
export function cppModuleCommand({ cxx, targetsWindows = false, glue, out, includeDirs = [], platform = process.platform }) {
  const linkFlags = targetsWindows ? '-static'
    : platform === 'win32' ? ''
      : platform === 'darwin' ? '-fPIC'
        : '-fPIC -static-libstdc++ -static-libgcc';
  const includes = includeDirs.map((dir) => `-I "${dir}"`).join(' ');
  return `"${cxx}" -std=c++20 -shared ${linkFlags} -O2 -ffp-contract=off -fvisibility=hidden ${includes} "${glue}" -o "${out}"`
    .replace(/ {2,}/g, ' ');
}
