#!/bin/sh
# Build and run tools/rtsan/playerScriptMidi.cpp under RealtimeSanitizer. Needs clang 20 or later
# (apt-get install clang-20 libclang-rt-20-dev) and libasound2-dev, and nothing from a CMake build:
# the four JUCE modules are compiled here once, into build/rtsan, and reused.
set -e
root=$(cd "$(dirname "$0")/../.." && pwd)
out="$root/build/rtsan"
cxx=${CXX:-clang++-20}
modules="$root/JUCE/include/JUCE-8.0.7/modules"
flags="-std=c++20 -O1 -g -fsanitize=realtime -Wno-function-effects \
  -DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1 -DJUCE_STANDALONE_APPLICATION=1 -DJUCE_USE_CURL=0 \
  -DJUCE_WEB_BROWSER=0 -DNDEBUG=1 -DJUCE_MODULE_AVAILABLE_juce_core=1 -DJUCE_MODULE_AVAILABLE_juce_events=1 \
  -DJUCE_MODULE_AVAILABLE_juce_audio_basics=1 -DJUCE_MODULE_AVAILABLE_juce_audio_devices=1 \
  -I$modules -I$root/CE/src"
mkdir -p "$out"
for m in juce_core juce_events juce_audio_basics juce_audio_devices juce_core_CompilationTime; do
  dir=${m%_CompilationTime}
  [ -f "$out/$m.o" ] || { echo "#include <$dir/$m.cpp>" > "$out/$m.cpp"; $cxx $flags -c "$out/$m.cpp" -o "$out/$m.o"; }
done
$cxx $flags "$root/tools/rtsan/playerScriptMidi.cpp" "$out"/juce_*.o -o "$out/playerScriptMidi" -lpthread -ldl -lasound
RTSAN_OPTIONS=${RTSAN_OPTIONS:-halt_on_error=false:suppress_equal_stacks=true} "$out/playerScriptMidi" "$@"
