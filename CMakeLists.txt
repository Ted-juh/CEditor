cmake_minimum_required(VERSION 3.24)
project(CEditor VERSION 0.2.0)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CE_ROOT "${CMAKE_SOURCE_DIR}/CE")

# Register the test executables below with CTest so `ctest --test-dir <build> -C <config>` (and CI)
# discovers and runs them all; each exe returns non-zero on failure.
enable_testing()
option(CEDITOR_DEV_MODE "Load the frontend from the Vite dev server" ON)

# JUCE 8.0.7 from local install
#
# The install is vendored in three parts: headers and module sources under
# JUCE/include, the CMake package under JUCE/lib, and three helper executables
# under JUCE/bin. The third part is easy to lose — a blanket `*.exe` in
# .gitignore silently kept it out of the repository, and the only symptom was
# find_package below failing inside a generated import file with "the imported
# target references the file ... but this file does not exist", which reads
# like a corrupt JUCE install rather than a missing commit.
#
# So check first and say what is actually wrong. These files are not
# buildable from what is vendored here (the install carries no juceaide
# source), so the fix is always to copy them in from a JUCE 8.0.7 install.
set(JUCE_VENDORED_BIN "${CMAKE_SOURCE_DIR}/JUCE/bin/JUCE-8.0.7")
set(JUCE_REQUIRED_HELPERS juceaide juce_lv2_helper juce_vst3_helper)
if(WIN32)
    set(JUCE_HELPER_SUFFIX ".exe")
else()
    set(JUCE_HELPER_SUFFIX "")
endif()

set(JUCE_MISSING_HELPERS "")
foreach(helper IN LISTS JUCE_REQUIRED_HELPERS)
    if(NOT EXISTS "${JUCE_VENDORED_BIN}/${helper}${JUCE_HELPER_SUFFIX}")
        list(APPEND JUCE_MISSING_HELPERS "  JUCE/bin/JUCE-8.0.7/${helper}${JUCE_HELPER_SUFFIX}")
    endif()
endforeach()

if(JUCE_MISSING_HELPERS)
    string(REPLACE ";" "\n" JUCE_MISSING_HELPERS_TEXT "${JUCE_MISSING_HELPERS}")
    message(FATAL_ERROR
        "The vendored JUCE 8.0.7 install is missing its helper executables:\n"
        "${JUCE_MISSING_HELPERS_TEXT}\n\n"
        "JUCE/include and JUCE/lib are committed but JUCE/bin is not, so "
        "find_package(JUCE) cannot resolve juce::juceaide and the plugin "
        "format helpers.\n\n"
        "Copy them from a JUCE 8.0.7 install (they sit in bin/JUCE-8.0.7 "
        "there too) and commit them. .gitignore has an exception for this "
        "directory; without it the blanket *.exe rule drops them again.")
endif()

list(APPEND CMAKE_PREFIX_PATH "${CMAKE_SOURCE_DIR}/JUCE/lib/cmake/JUCE-8.0.7")
find_package(JUCE CONFIG REQUIRED)

# --- WebView2 SDK (from NuGet package in CE/thirdparty/) ---
set(WEBVIEW2_DIR "${CE_ROOT}/thirdparty/webview2/build/native")
set(WEBVIEW2_INCLUDE "${WEBVIEW2_DIR}/include")
set(WEBVIEW2_LIB_DIR "${WEBVIEW2_DIR}/x64")

# --- Binary resources (icon etc.) ---
juce_add_binary_data(CEditorData
    HEADER_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/BinaryData"
    SOURCES
        "${CE_ROOT}/include/MainApplication/logo.png"
)

# --- Player web bundle embedded into the player/plugin (self-contained, host-path-independent) ---
# The player and the VST3 serve player.html + assets from this BinaryData, so the WebView paints
# regardless of where the host loads the binary from (fixes blank UI in a DAW).
file(GLOB_RECURSE PLAYER_WEB_DIST CONFIGURE_DEPENDS "${CE_ROOT}/web/dist/*")
juce_add_binary_data(PlayerWebData
    NAMESPACE PlayerWebData
    HEADER_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/PlayerWebData"
    SOURCES ${PLAYER_WEB_DIST}
)

# --- Standalone GUI app ---
juce_add_gui_app(CEditor
    PRODUCT_NAME "CEditor"
    COMPANY_NAME "Tedjuh-inc"
    ICON_BIG   "${CE_ROOT}/include/MainApplication/logo.png"
    ICON_SMALL "${CE_ROOT}/include/MainApplication/logo.png"
)

target_sources(CEditor PRIVATE
    "${CE_ROOT}/src/Main.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileEngine.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileService.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceMidiIO.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceMessages.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceRequests.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceJobs.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceMidiCi.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceVars.cpp"
    "${CE_ROOT}/src/DeviceProfile/MidiCiSession.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceRuntimeBridge.cpp"
    "${CE_ROOT}/src/WebViewHost.cpp"
    "${CE_ROOT}/src/ValueTreeBridge.cpp"
    "${CE_ROOT}/src/ValueTreeBridgeHandlers.cpp"
    "${CE_ROOT}/src/ValueTreeBridgeState.cpp"
)

target_compile_definitions(CEditor PRIVATE
    CEDITOR_SOURCE_ROOT="${CMAKE_SOURCE_DIR}"
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2=1
    JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
    # Dev mode: load from Vite dev server (http://localhost:5173)
    # Set to 0 for production builds that serve files from the installed bundle
    CEDITOR_DEV_MODE=$<IF:$<BOOL:${CEDITOR_DEV_MODE}>,1,0>
)

target_include_directories(CEditor PRIVATE
    "${WEBVIEW2_INCLUDE}"
    "${CMAKE_BINARY_DIR}/BinaryData"
)

target_link_libraries(CEditor PRIVATE
    juce::juce_core
    juce::juce_audio_basics
    juce::juce_audio_devices
    juce::juce_midi_ci
    juce::juce_data_structures
    juce::juce_events
    juce::juce_graphics
    juce::juce_gui_basics
    juce::juce_gui_extra
    "${WEBVIEW2_LIB_DIR}/WebView2LoaderStatic.lib"
    dwmapi
    CEditorData
)

# --- Standalone player (Phase B4): runs an exported panel, no editor ---
juce_add_gui_app(CEditorPlayer
    PRODUCT_NAME "CEditor Player"
    COMPANY_NAME "Tedjuh-inc"
)

target_sources(CEditorPlayer PRIVATE
    "${CE_ROOT}/src/Player/PlayerMain.cpp"
    "${CE_ROOT}/src/Player/PlayerHost.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileEngine.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileService.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceMidiIO.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceMessages.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceRequests.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceJobs.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceMidiCi.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceVars.cpp"
    "${CE_ROOT}/src/DeviceProfile/MidiCiSession.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceRuntimeBridge.cpp"
)

target_compile_definitions(CEditorPlayer PRIVATE
    CEDITOR_SOURCE_ROOT="${CMAKE_SOURCE_DIR}"
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2=1
    JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
    CEDITOR_DEV_MODE=$<IF:$<BOOL:${CEDITOR_DEV_MODE}>,1,0>
)

target_include_directories(CEditorPlayer PRIVATE
    "${WEBVIEW2_INCLUDE}"
    "${CE_ROOT}/src"
    "${CMAKE_BINARY_DIR}/PlayerWebData"
)

target_link_libraries(CEditorPlayer PRIVATE
    juce::juce_core
    juce::juce_audio_basics
    juce::juce_audio_devices
    juce::juce_midi_ci
    juce::juce_data_structures
    juce::juce_events
    juce::juce_graphics
    juce::juce_gui_basics
    juce::juce_gui_extra
    "${WEBVIEW2_LIB_DIR}/WebView2LoaderStatic.lib"
    dwmapi
    PlayerWebData
)

# --- Player as a plugin (Phase C/D): VST3 wrapping the same PlayerHost runtime ---
# Phase D parameterizes the per-panel identity + panel via cache vars so the generator can
# stamp out unique-per-panel binaries (the Ctrlr fix: distinct PLUGIN_CODE/name -> distinct FUID).
set(CE_VST_PRODUCT_NAME "CEditor Player VST" CACHE STRING "Per-panel plugin product name")
set(CE_VST_PLUGIN_CODE  "Cep1"               CACHE STRING "Per-panel 4-char plugin code")
set(CE_VST_COMPANY_NAME "Tedjuh-inc"         CACHE STRING "Plugin vendor / company name")
set(CE_VST_MFR_CODE     "Tdjh"               CACHE STRING "4-char plugin manufacturer code")
set(CE_VST_VERSION      "1.0.0"              CACHE STRING "Plugin version string")
# Empty by default: the export pipeline always passes the real panel via -DCE_VST_PANEL_PATH.
# A plugin built without it loads no panel (blank player) — worth saying so, because a manual
# build that produces a blank plugin is otherwise baffling.
#
# But the installer build ALWAYS has an empty panel path, by design: it ships the generic player
# and the per-panel plugins are produced later by the export pipeline. Warning there fired on
# every single packaging run about a state that was entirely correct, which is how a warning
# stops being read. So the installer passes -DCE_VST_GENERIC_PLAYER=ON to say "this one is
# meant to be panel-less", and gets a status line instead. A hand build still gets the warning.
set(CE_VST_PANEL_PATH   ""                   CACHE STRING "Panel document the plugin loads")
option(CE_VST_GENERIC_PLAYER "Building the panel-less player deliberately (suppresses the no-panel warning)" OFF)
if (CE_VST_PANEL_PATH STREQUAL "")
    if (CE_VST_GENERIC_PLAYER)
        message(STATUS "CEditorPlayerVST: generic player build, no panel baked in (as intended).")
    else()
        message(WARNING "CE_VST_PANEL_PATH is not set — CEditorPlayerVST will build but load no panel. "
                        "Pass -DCE_VST_PANEL_PATH=<your.cepanel> for a usable plugin (the export pipeline does this automatically).")
    endif()
endif()

juce_add_plugin(CEditorPlayerVST
    PRODUCT_NAME "${CE_VST_PRODUCT_NAME}"
    COMPANY_NAME "${CE_VST_COMPANY_NAME}"
    PLUGIN_MANUFACTURER_CODE "${CE_VST_MFR_CODE}"
    PLUGIN_CODE "${CE_VST_PLUGIN_CODE}"
    VERSION "${CE_VST_VERSION}"
    FORMATS VST3 Standalone
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT TRUE
    VST3_CATEGORIES Fx
    COPY_PLUGIN_AFTER_BUILD FALSE
)

target_sources(CEditorPlayerVST PRIVATE
    "${CE_ROOT}/src/Player/PluginProcessor.cpp"
    "${CE_ROOT}/src/Player/PlayerHost.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileEngine.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileService.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceMidiIO.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceMessages.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceRequests.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceJobs.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceMidiCi.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceVars.cpp"
    "${CE_ROOT}/src/DeviceProfile/MidiCiSession.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceRuntimeBridge.cpp"
)

target_compile_definitions(CEditorPlayerVST PUBLIC
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2=1
    JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_VST3_EMULATE_MIDI_CC_WITH_PARAMETERS=0
    CEDITOR_SOURCE_ROOT="${CMAKE_SOURCE_DIR}"
    CEDITOR_DEV_MODE=$<IF:$<BOOL:${CEDITOR_DEV_MODE}>,1,0>
    CEDITOR_PLAYER_PANEL_PATH="${CE_VST_PANEL_PATH}"
)

target_include_directories(CEditorPlayerVST PRIVATE
    "${WEBVIEW2_INCLUDE}"
    "${CE_ROOT}/src"
    "${CMAKE_BINARY_DIR}/PlayerWebData"
)

target_link_libraries(CEditorPlayerVST PRIVATE
    juce::juce_audio_utils
    juce::juce_audio_devices
    juce::juce_core
    juce::juce_midi_ci
    juce::juce_data_structures
    juce::juce_events
    juce::juce_graphics
    juce::juce_gui_basics
    juce::juce_gui_extra
    "${WEBVIEW2_LIB_DIR}/WebView2LoaderStatic.lib"
    dwmapi
    PlayerWebData
)

add_executable(CEditorDeviceProfileTests
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileEngine.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileService.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceMidiIO.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceMessages.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceRequests.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceJobs.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceMidiCi.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileServiceVars.cpp"
    "${CE_ROOT}/src/DeviceProfile/MidiCiSession.cpp"
    "${CE_ROOT}/tests/DeviceProfileEngineTests.cpp"
)

target_compile_definitions(CEditorDeviceProfileTests PRIVATE
    CEDITOR_SOURCE_ROOT="${CMAKE_SOURCE_DIR}"
)

target_include_directories(CEditorDeviceProfileTests PRIVATE
    "${CE_ROOT}/src"
)

target_link_libraries(CEditorDeviceProfileTests PRIVATE
    juce::juce_core
    juce::juce_audio_basics
    juce::juce_audio_devices
    juce::juce_midi_ci
)

add_test(NAME DeviceProfileEngine COMMAND CEditorDeviceProfileTests)

# --- Export pipeline: compile-per-panel identity (Phase D1) ---
add_executable(CEditorExportIdentityTests
    "${CE_ROOT}/tests/PanelExportIdentityTests.cpp"
)

target_include_directories(CEditorExportIdentityTests PRIVATE
    "${CE_ROOT}/src"
)

target_link_libraries(CEditorExportIdentityTests PRIVATE
    juce::juce_core
)

add_test(NAME PanelExportIdentity COMMAND CEditorExportIdentityTests)

# --- Window-closed script runtime (M2): C++ panel value model (full mirror) ---
# Pure juce_core; verifies PanelValueModel.h resolves get/set paths identically to the WebView JS
# runtime. Build + run: cmake --build build/native --target CEditorPanelValueTests && run the exe.
add_executable(CEditorPanelValueTests
    "${CE_ROOT}/tests/PanelValueModelTests.cpp"
)

target_compile_features(CEditorPanelValueTests PRIVATE cxx_std_23)

target_include_directories(CEditorPanelValueTests PRIVATE
    "${CE_ROOT}/src"
)

target_link_libraries(CEditorPanelValueTests PRIVATE
    juce::juce_core
)

add_test(NAME PanelValueModel COMMAND CEditorPanelValueTests)

# --- CTRL49 control surface (Phase 1): vendor SysEx protocol library ---
# Pure std, no I/O; golden bytes from the external CTRL49 reverse-engineering handoff.
# Design record: tools/docs/screen-builder-design.md.
add_executable(CEditorCtrl49ProtocolTests
    "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
    "${CE_ROOT}/tests/Ctrl49ProtocolTests.cpp"
)

target_compile_features(CEditorCtrl49ProtocolTests PRIVATE cxx_std_23)

target_include_directories(CEditorCtrl49ProtocolTests PRIVATE
    "${CE_ROOT}/src"
)

add_test(NAME Ctrl49Protocol COMMAND CEditorCtrl49ProtocolTests)

# CTRL49 reducer + session-sequence tests. The reducer cases are the PowerShell unified
# demo's C# self-test ported one-for-one. Still hardware-free (no WinMM / KSPROPERTY).
add_executable(CEditorCtrl49ReducerTests
    "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
    "${CE_ROOT}/src/ControlSurface/Ctrl49Reducer.cpp"
    "${CE_ROOT}/src/ControlSurface/Ctrl49Session.cpp"
    "${CE_ROOT}/tests/Ctrl49ReducerTests.cpp"
)

target_compile_features(CEditorCtrl49ReducerTests PRIVATE cxx_std_23)

target_include_directories(CEditorCtrl49ReducerTests PRIVATE
    "${CE_ROOT}/src"
)

add_test(NAME Ctrl49Reducer COMMAND CEditorCtrl49ReducerTests)

# CTRL49 Phase-4 seam: device-profile intent compiler turns an encoder value into the
# exact synth bytes. Loads the shipped GAIA SH-01 profile; no hardware.
add_executable(CEditorCtrl49SynthCompileTests
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileEngine.cpp"
    "${CE_ROOT}/tests/Ctrl49SynthCompileTests.cpp"
)
target_compile_features(CEditorCtrl49SynthCompileTests PRIVATE cxx_std_23)
target_compile_definitions(CEditorCtrl49SynthCompileTests PRIVATE
    CEDITOR_SOURCE_ROOT="${CMAKE_SOURCE_DIR}"
)
target_include_directories(CEditorCtrl49SynthCompileTests PRIVATE "${CE_ROOT}/src")
target_link_libraries(CEditorCtrl49SynthCompileTests PRIVATE juce::juce_core)
add_test(NAME Ctrl49SynthCompile COMMAND CEditorCtrl49SynthCompileTests)

# CTRL49 Phase-5 assignment model: loads the shipped GAIA assignment and verifies every
# bound parameter on every page compiles through the named profile. No hardware.
add_executable(CEditorCtrl49AssignmentTests
    "${CE_ROOT}/src/ControlSurface/Ctrl49Assignment.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileEngine.cpp"
    "${CE_ROOT}/tests/Ctrl49AssignmentTests.cpp"
)
target_compile_features(CEditorCtrl49AssignmentTests PRIVATE cxx_std_23)
target_compile_definitions(CEditorCtrl49AssignmentTests PRIVATE
    CEDITOR_SOURCE_ROOT="${CMAKE_SOURCE_DIR}"
)
target_include_directories(CEditorCtrl49AssignmentTests PRIVATE "${CE_ROOT}/src")
target_link_libraries(CEditorCtrl49AssignmentTests PRIVATE juce::juce_core)
add_test(NAME Ctrl49Assignment COMMAND CEditorCtrl49AssignmentTests)

# CTRL49 bare bridge demonstrator (Phase 2 end state). Windows-only transports; the
# executable itself compiles everywhere (guarded), but the WinMM/KSPROPERTY backends are
# only added on Windows. Not a test — build and run against real hardware.
if(WIN32)
    add_executable(Ctrl49BridgeDemo
        "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Reducer.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Session.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49WinMmOutput.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49PrivateInput.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49BridgeDemo.cpp"
    )
    target_compile_features(Ctrl49BridgeDemo PRIVATE cxx_std_23)
    target_include_directories(Ctrl49BridgeDemo PRIVATE "${CE_ROOT}/src")
    target_link_libraries(Ctrl49BridgeDemo PRIVATE winmm)

    # CTRL49 filmstrip-knob beauty test (Phase 3): uploads a knob filmstrip + Lua page and
    # maps encoder 1 to the knob value on real hardware.
    add_executable(Ctrl49KnobTest
        "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Reducer.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Session.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49WinMmOutput.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49PrivateInput.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49KnobTest.cpp"
    )
    target_compile_features(Ctrl49KnobTest PRIVATE cxx_std_23)
    target_include_directories(Ctrl49KnobTest PRIVATE "${CE_ROOT}/src")
    target_link_libraries(Ctrl49KnobTest PRIVATE winmm)

    # CTRL49 -> real synth first light (Phase 4): encoder 1 drives a device-profile
    # parameter (GAIA cutoff) via the DeviceProfile intent compiler. Links juce_core.
    add_executable(Ctrl49SynthTest
        "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Reducer.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Session.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49WinMmOutput.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49PrivateInput.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49SynthTest.cpp"
        "${CE_ROOT}/src/DeviceProfile/DeviceProfileEngine.cpp"
    )
    target_compile_features(Ctrl49SynthTest PRIVATE cxx_std_23)
    target_include_directories(Ctrl49SynthTest PRIVATE "${CE_ROOT}/src")
    target_link_libraries(Ctrl49SynthTest PRIVATE winmm juce::juce_core)

    # CTRL49 multi-knob page -> real synth (Phase 5): 8 encoders drive 8 assigned params
    # across assignment pages, via the assignment model + DeviceProfile compiler.
    add_executable(Ctrl49MultiTest
        "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Reducer.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Session.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49WinMmOutput.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49PrivateInput.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Assignment.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49MultiTest.cpp"
        "${CE_ROOT}/src/DeviceProfile/DeviceProfileEngine.cpp"
    )
    target_compile_features(Ctrl49MultiTest PRIVATE cxx_std_23)
    target_include_directories(Ctrl49MultiTest PRIVATE "${CE_ROOT}/src")
    target_link_libraries(Ctrl49MultiTest PRIVATE winmm juce::juce_core)
endif()

# --- Panel scripting runtime (Milestone 1): Lua (Sol3) + JavaScript (juce_javascript) ----------
# OFF by default so the existing build is unaffected. Turn on with -DCEDITOR_SCRIPTING=ON.
# After enabling, add `ceditor_scripting` to the link libraries of whichever target hosts scripts
# (CEditor for live authoring; CEditorPlayer / CEditorPlayerVST for export) and call into
# ceditor::scripting::ScriptRuntime from the bridge / player host (see CE/src/Scripting/README.md).
option(CEDITOR_SCRIPTING "Build the panel scripting runtime (Lua via Sol3 + JS via juce_javascript)" OFF)

# Optional THIRD language for the window-closed runtime: REAL embedded CPython (native, full stdlib).
# OFF by default — it links libpython and adds ~the size of a CPython runtime + stdlib to the export,
# so it's opt-in per the user's "show the MB cost" requirement. Requires CEDITOR_SCRIPTING.
# Needs a Python dev install discoverable by find_package(Python3 ... Development.Embed).
# Point at a specific interpreter with -DPython3_EXECUTABLE=... if CMake picks the wrong one.
option(CEDITOR_PYTHON "Embed native CPython (full stdlib) as a third window-closed script language" OFF)

# Optional: load COMPILE-AT-EXPORT native handler modules (C++/C#/Java). No language runtime is
# embedded — the exporter AOT-compiles each panel's handlers into a small native shared library that
# the player loads via the flat C ABI in CE/src/Scripting/NativeHandlerAbi.h. Requires CEDITOR_SCRIPTING.
# See CE/src/Scripting/native-handlers-design.md. OFF by default (feature is build-unverified).
option(CEDITOR_NATIVE_HANDLERS "Load compile-at-export native handler modules (C++/C#/Java) in the player" OFF)

if (CEDITOR_SCRIPTING)
    include(FetchContent)

    # walterschell/Lua (and some deps) ship a pre-3.5 cmake_minimum_required that CMake 4+ rejects.
    set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

    # Lua 5.4 — CMake-friendly mirror (provides the `lua_static` target). Adjust tag/source as needed.
    # Its own test registration is switched off: with enable_testing() on, it would add upstream's
    # full interpreter testsuite (lua-testsuite) to OUR ctest run — not a CEditor test, and it fails
    # when run outside upstream's harness.
    set(LUA_ENABLE_TESTING OFF CACHE BOOL "" FORCE)
    FetchContent_Declare(lua
        GIT_REPOSITORY https://github.com/walterschell/Lua.git
        GIT_TAG        v5.4.5)
    FetchContent_MakeAvailable(lua)

    # Sol3 (header-only C++ <-> Lua binding).
    FetchContent_Declare(sol2
        GIT_REPOSITORY https://github.com/ThePhD/sol2.git
        GIT_TAG        v3.3.0)
    FetchContent_MakeAvailable(sol2)

    add_library(ceditor_scripting STATIC
        "${CE_ROOT}/src/Scripting/ScriptRuntime.cpp"
        "${CE_ROOT}/src/Scripting/LuaScriptEngine.cpp"
        "${CE_ROOT}/src/Scripting/JsScriptEngine.cpp"
    )
    target_compile_features(ceditor_scripting PUBLIC cxx_std_23)
    target_include_directories(ceditor_scripting PUBLIC "${CE_ROOT}/src")
    target_compile_definitions(ceditor_scripting PUBLIC CEDITOR_SCRIPTING=1 SOL_ALL_SAFETIES_ON=1)
    target_link_libraries(ceditor_scripting PUBLIC
        juce::juce_core
        juce::juce_data_structures
        juce::juce_javascript      # QuickJS-backed JS engine (JUCE 8)
        sol2::sol2
        lua_static                 # from walterschell/Lua; rename if your Lua provider differs
    )

    # --- Optional: native embedded CPython (third language, full stdlib) ---
    if (CEDITOR_PYTHON)
        # Development.Embed gives the libpython needed to embed an interpreter (vs. build a C extension).
        find_package(Python3 COMPONENTS Development.Embed REQUIRED)
        target_sources(ceditor_scripting PRIVATE "${CE_ROOT}/src/Scripting/PythonScriptEngine.cpp")
        target_link_libraries(ceditor_scripting PUBLIC Python3::Python)
        target_compile_definitions(ceditor_scripting PUBLIC CEDITOR_PYTHON=1)
        message(STATUS "CEditor: native CPython ENABLED (Python3 ${Python3_VERSION} @ ${Python3_EXECUTABLE}).")
        message(STATUS "CEditor: libpython = ${Python3_LIBRARIES}; stdlib = ${Python3_STDLIB}.")

        # Python smoke test: loads + dispatches a real python script through the embedded interpreter.
        add_executable(CEditorPythonScriptTests "${CE_ROOT}/tests/PythonScriptEngineTests.cpp")
        target_link_libraries(CEditorPythonScriptTests PRIVATE ceditor_scripting juce::juce_core)
        target_include_directories(CEditorPythonScriptTests PRIVATE "${CE_ROOT}/src")
        add_test(NAME PythonScriptEngine COMMAND CEditorPythonScriptTests)
        # The embedded interpreter needs a stdlib home. Exports stage a PythonRuntime folder next to
        # the plugin; for the bare test exe, point CEDITOR_PYTHONHOME at the dev Python found above
        # (its runtime-DLL dir is the install root on Windows).
        if (Python3_RUNTIME_LIBRARY_DIRS)
            list(GET Python3_RUNTIME_LIBRARY_DIRS 0 _ce_python_home)
            set_tests_properties(PythonScriptEngine PROPERTIES
                ENVIRONMENT "CEDITOR_PYTHONHOME=${_ce_python_home}")
        endif()
    endif()

    # --- Optional: compile-at-export native handler loader (C++/C#/Java) ---
    # Only the loader links into the player; the handler MODULES are built separately at export by
    # tools/scripts/nativeHandlers and loaded at runtime via juce::DynamicLibrary (no extra deps here).
    if (CEDITOR_NATIVE_HANDLERS)
        target_sources(ceditor_scripting PRIVATE "${CE_ROOT}/src/Scripting/NativeHandlerEngine.cpp")
        target_compile_definitions(ceditor_scripting PUBLIC CEDITOR_NATIVE_HANDLERS=1)
        message(STATUS "CEditor: native handler loader ENABLED (C++/C#/Java compiled-at-export modules).")
    endif()

    # Smoke test: verifies the runtime actually executes Lua + JS. Run ./CEditorScriptingTests
    add_executable(CEditorScriptingTests "${CE_ROOT}/tests/ScriptRuntimeTests.cpp")
    target_link_libraries(CEditorScriptingTests PRIVATE ceditor_scripting juce::juce_core)
    target_include_directories(CEditorScriptingTests PRIVATE "${CE_ROOT}/src")
    add_test(NAME ScriptRuntime COMMAND CEditorScriptingTests)

    # Window-closed integration: panel -> gathered scripts -> runtime -> dispatch -> API callbacks.
    add_executable(CEditorPlayerScriptTests "${CE_ROOT}/tests/PlayerScriptIntegrationTests.cpp")
    target_link_libraries(CEditorPlayerScriptTests PRIVATE ceditor_scripting juce::juce_core)
    target_include_directories(CEditorPlayerScriptTests PRIVATE "${CE_ROOT}/src")
    add_test(NAME PlayerScriptIntegration COMMAND CEditorPlayerScriptTests)

    # Window-closed scripts in the exported plugin: link the runtime into the VST/standalone player.
    # Gated so the default (scripting OFF) player build is unchanged; PluginProcessor.h guards its
    # integration with #if CEDITOR_SCRIPTING (the define is PUBLIC on ceditor_scripting).
    if (TARGET CEditorPlayerVST)
        target_link_libraries(CEditorPlayerVST PRIVATE ceditor_scripting)
        message(STATUS "CEditor: scripting runtime LINKED into CEditorPlayerVST (window-closed scripts).")

        # When CPython is embedded, the bundled libpython is co-located with the plugin binary (the
        # exporter copies it there). libpython is a runtime shared-lib dependency (DT_NEEDED / dylib
        # load command) recorded with the BUILD machine's path, so a clean end-user box can't resolve
        # it without a self-relative runpath. Lua/JS are static (no runtime dep) and need none.
        # UNVERIFIED until a native mac/Linux build; on mac also rewrite libpython's install-name to
        # @loader_path/<lib> (install_name_tool) where the bundler places it.
        if (CEDITOR_PYTHON)
            foreach(_fmt VST3 Standalone)
                set(_t CEditorPlayerVST_${_fmt})
                if (TARGET ${_t})
                    if (APPLE)
                        set_target_properties(${_t} PROPERTIES BUILD_WITH_INSTALL_RPATH ON INSTALL_RPATH "@loader_path")
                    elseif (UNIX)
                        set_target_properties(${_t} PROPERTIES BUILD_WITH_INSTALL_RPATH ON INSTALL_RPATH "$ORIGIN")
                    endif()
                endif()
            endforeach()
        endif()
    endif()

    message(STATUS "CEditor: scripting runtime ENABLED (link `ceditor_scripting` into your host target).")
    message(STATUS "CEditor: build target CEditorScriptingTests and run it to verify the engine.")
endif()

# --- Value/parameter layer (Milestone 2): host-automatable parameters + DAW state ---------------
# ON by default (verified to compile) so the normal CEditorPlayerVST build includes it with no extra
# flags. CEditorPlayerVST builds a juce::AudioProcessorValueTreeState from the panel's baked
# `exportParameters` (web .../utils/exportParameters.js), so the DAW gets automation lanes and the
# session save/restore persists every control value (works window-closed). The panel saved to
# CE_VST_PANEL_PATH must carry `exportParameters` (the editor bakes them on save). Next sub-steps
# (documented in CE/src/Player/PanelParameters.h + the M2 memory note): push APVTS changes to the
# WebView, send MIDI on parameter change window-closed, and wire ScriptRuntime get/setValue.
# Turn it off with -DCEDITOR_VALUE_LAYER=OFF if you ever need the old parameter-less plugin.
option(CEDITOR_VALUE_LAYER "Expose panel controls as host-automatable parameters + persist DAW state (M2)" ON)

if (CEDITOR_VALUE_LAYER)
    target_compile_definitions(CEditorPlayerVST PUBLIC CEDITOR_VALUE_LAYER=1)
    message(STATUS "CEditor: value/parameter layer ENABLED for CEditorPlayerVST (M2 — APVTS + state).")
endif()

install(TARGETS CEditor
    RUNTIME DESTINATION "."
    RESOURCE DESTINATION "."
)

if (EXISTS "${CE_ROOT}/web/dist")
    install(DIRECTORY "${CE_ROOT}/web/dist/"
        DESTINATION "web/dist"
    )
else()
    message(WARNING "CE/web/dist was not found. Run `npm run build` in CE/web before `cmake --install`.")
endif()

# JUCE handles the entry point via START_JUCE_APPLICATION
# Run this from the CE/web/ directory:
# cd CE/web && npm run dev
# That starts the Vite dev server with hot reload. It'll show the localhost URL (usually http://localhost:5173) in the terminal output.


# “Earth is the insane asylum of the universe.”
# ― Albert Einstein
