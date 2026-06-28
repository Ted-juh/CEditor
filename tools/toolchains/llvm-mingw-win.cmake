# llvm-mingw-win.cmake — CMake toolchain file that builds a Windows x64 target with the bundled,
# self-contained LLVM-MinGW Clang/LLD — NO Visual Studio, NO Windows SDK. Used by the exporter when a
# system MSVC isn't present, so a freshly-installed CEditor can build the JUCE VST3 with zero extra
# setup. Pass -DCE_LLVM_MINGW_DIR=<tools/toolchains/llvm-mingw> (the exporter sets this).
#
# JUCE-on-MinGW caveats (handled by the player CMake / exporter): the Direct2D renderer is unavailable
# under the MinGW/Itanium ABI (JUCE's software renderer is used instead), and the VST3 wrapper needs a
# known link tweak. Handler modules (flat C ABI) are unaffected. EXPERIMENTAL on Windows until validated.

set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_SYSTEM_PROCESSOR x86_64)

if(NOT CE_LLVM_MINGW_DIR)
  message(FATAL_ERROR "CE_LLVM_MINGW_DIR not set (path to the provisioned llvm-mingw dir)")
endif()

set(_tc "${CE_LLVM_MINGW_DIR}/bin")
set(_pfx "${_tc}/x86_64-w64-mingw32-")

set(CMAKE_C_COMPILER   "${_pfx}clang")
set(CMAKE_CXX_COMPILER "${_pfx}clang++")
set(CMAKE_RC_COMPILER  "${_tc}/llvm-rc")
set(CMAKE_AR           "${_tc}/llvm-ar")
set(CMAKE_RANLIB       "${_tc}/llvm-ranlib")

# Look for libraries/headers only in the toolchain sysroot, programs on the host.
set(CMAKE_FIND_ROOT_PATH "${CE_LLVM_MINGW_DIR}")
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)

# Self-contained, statically-linked CRT/libc++ so the plugin needs no MinGW runtime DLLs beside it.
set(CMAKE_CXX_STANDARD 20)
add_compile_options(-O2)
add_link_options(-static -static-libgcc -static-libstdc++)
