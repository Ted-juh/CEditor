cmake_minimum_required(VERSION 3.24)
project(CEditor VERSION 0.2.0)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CE_ROOT "${CMAKE_SOURCE_DIR}/CE")

# Register the test executables below with CTest so `ctest --test-dir <build> -C <config>` (and CI)
# discovers and runs them all; each exe returns non-zero on failure.
enable_testing()
option(CEDITOR_DEV_MODE "Load the frontend from the Vite dev server" ON)

# The GUI app, the standalone player and the VST are Windows-only in fact rather
# than by policy: they embed the WebView2 SDK (CE/thirdparty/webview2, a Windows
# NuGet package) and they need a native juceaide to bake BinaryData. The TESTS
# need neither, so they are always configured and the app is not.
#
# Turn it on elsewhere and you will get the missing-helper error below, which is
# then telling you something true. `cmake -B build -DCEDITOR_BUILD_APP=ON`.
if(WIN32)
    set(CEDITOR_BUILD_APP_DEFAULT ON)
else()
    set(CEDITOR_BUILD_APP_DEFAULT OFF)
endif()
option(CEDITOR_BUILD_APP "Build the GUI app, the standalone player and the VST (needs Windows: WebView2 + a native juceaide)" ${CEDITOR_BUILD_APP_DEFAULT})

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

# The helpers are needed to BUILD THE APP, and only then: juceaide is what
# juce_add_binary_data, the generated JuceHeader and the plugin bundles invoke.
# A test target is a plain add_executable linking juce_core, and never calls it.
#
# This used to be an unconditional FATAL_ERROR, which meant the whole project —
# tests included — refused to configure anywhere but Windows, because the
# vendored helpers are .exe. That was a guard written for one failure standing
# in front of a build that has nothing to do with it. The 13 test executables
# compile and pass on Linux; they had simply never been run.
if(JUCE_MISSING_HELPERS AND CEDITOR_BUILD_APP)
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

# ------------------------------------------------------------------ the app, the player, the VST
# Everything from here to the tests needs WebView2 and a native juceaide. See CEDITOR_BUILD_APP.
if(CEDITOR_BUILD_APP)
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

    # Every JUCE format reachable without a third-party gate. The gated ones stay off on purpose:
    # AAX needs Avid's SDK + PACE signing, VST2 licensing closed in 2018, AUv3 is an App Store
    # product. AU costs nothing to declare but only produces a target on a macOS build — it lights
    # up the day a Mac port exists (auSubtype is already derived per panel, waiting).
    #
    # The LV2 URI is per-panel like the CLAP id: a freeform string, kept unique by the guid hash.
    option(CEDITOR_LV2 "Also build the player plugin as LV2" ON)
    set(CE_LV2_URI "urn:ceditor:default" CACHE STRING "Per-panel LV2 URI (the export pipeline passes the real one)")
    set(CE_PLUGIN_FORMATS VST3 Standalone)
    if (CEDITOR_LV2)
        list(APPEND CE_PLUGIN_FORMATS LV2)
    endif()
    if (APPLE)
        list(APPEND CE_PLUGIN_FORMATS AU)
    endif()

    juce_add_plugin(CEditorPlayerVST
        PRODUCT_NAME "${CE_VST_PRODUCT_NAME}"
        COMPANY_NAME "${CE_VST_COMPANY_NAME}"
        PLUGIN_MANUFACTURER_CODE "${CE_VST_MFR_CODE}"
        PLUGIN_CODE "${CE_VST_PLUGIN_CODE}"
        VERSION "${CE_VST_VERSION}"
        FORMATS ${CE_PLUGIN_FORMATS}
        LV2URI "${CE_LV2_URI}"
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

    # --- CLAP format (via vendored clap-juce-extensions, ThirdParty/clap-juce-extensions) --------
    # JUCE has no native CLAP support, so the .clap comes from the free-audio wrapper: it creates a
    # CEditorPlayerVST_CLAP target reusing the same PlayerHost/plugin code. The CLAP id is a
    # freeform reverse-DNS string, so per-panel uniqueness needs no 4-char-code hashing — the
    # export pipeline passes "com.<vendor>.<panel>.<guid-hash>" straight through CE_CLAP_ID.
    #
    # INSIDE the CEDITOR_BUILD_APP guard, deliberately. clap_juce_extensions_plugin() attaches
    # itself to the CEditorPlayerVST target, which only exists in this block — off Windows there is
    # no plugin to attach to, and add_subdirectory() would pull the wrapper's own CMake into a
    # configure that has no use for it. This is the same trap the guard was added for.
    option(CEDITOR_CLAP "Build the player plugin as a CLAP alongside VST3/Standalone" ON)
    set(CE_CLAP_ID "com.tedjuh.ceditor.default" CACHE STRING "Per-panel CLAP id (the export pipeline passes the real one)")

    if (CEDITOR_CLAP)
        add_subdirectory(ThirdParty/clap-juce-extensions clap-juce-extensions EXCLUDE_FROM_ALL)
        clap_juce_extensions_plugin(TARGET CEditorPlayerVST
            CLAP_ID "${CE_CLAP_ID}"
            # A MIDI controller surface, not an audio processor: "utility" is the honest category
            # and "external" marks it as controlling outboard gear (both from the CLAP taxonomy).
            CLAP_FEATURES utility external)
        message(STATUS "CEditor: CLAP format ENABLED (target CEditorPlayerVST_CLAP, id ${CE_CLAP_ID}).")
    endif()
endif()

# ----------------------------------------------------------------------------------- the tests
# Always configured, on every platform. These are plain executables over juce_core and the CE
# sources; none of them touches WebView2, BinaryData or juceaide.
#
# WHAT A juce_core TEST NEEDS OFF. On Linux juce_core pulls <curl/curl.h> and the browser module
# wants webkit2gtk; a console test wants neither, and requiring the dev packages for them would put
# a system dependency in front of `ctest` for no reason. juce_audio_devices does genuinely need
# ALSA headers (libasound2-dev), and only CEditorDeviceProfileTests links it.
#
# Applied to every test target through a helper rather than repeated per target, so a test added
# next year does not rediscover this one platform at a time.
function(ce_configure_test target)
    target_compile_features(${target} PRIVATE cxx_std_23)
    target_compile_definitions(${target} PRIVATE
        JUCE_USE_CURL=0
        JUCE_WEB_BROWSER=0
        JUCE_STANDALONE_APPLICATION=1
    )
endfunction()


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
ce_configure_test(CEditorDeviceProfileTests)

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
ce_configure_test(CEditorExportIdentityTests)

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
ce_configure_test(CEditorPanelValueTests)

# The exported plugin's automation list. Also the only thing that COMPILES PanelParameters.h — it is
# reachable otherwise only through PluginProcessor.h, which needs WebView2 and cannot build off
# Windows, so a typo in it would surface nowhere but a Windows plugin build.
add_executable(CEditorPanelParametersTests
    "${CE_ROOT}/tests/PanelParametersTests.cpp"
)

target_include_directories(CEditorPanelParametersTests PRIVATE
    "${CE_ROOT}/src"
)

# juce_audio_processors, because that is what PanelParameters.h includes — AudioProcessorValueTreeState
# lives there and buildParameterLayout returns one. It drags in graphics and gui_basics; a console
# test never opens a window, but the symbols have to resolve.
target_link_libraries(CEditorPanelParametersTests PRIVATE
    juce::juce_core
    juce::juce_audio_processors
)

add_test(NAME PanelParameters COMMAND CEditorPanelParametersTests)
ce_configure_test(CEditorPanelParametersTests)

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
ce_configure_test(CEditorCtrl49ProtocolTests)

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
ce_configure_test(CEditorCtrl49ReducerTests)

# CTRL49 preset selection primitive: Bank Select + Program Change bytes + browser index math.
add_executable(CEditorCtrl49PresetTests
    "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
    "${CE_ROOT}/tests/Ctrl49PresetTests.cpp"
)
target_compile_features(CEditorCtrl49PresetTests PRIVATE cxx_std_23)
target_include_directories(CEditorCtrl49PresetTests PRIVATE "${CE_ROOT}/src")
add_test(NAME Ctrl49Preset COMMAND CEditorCtrl49PresetTests)
ce_configure_test(CEditorCtrl49PresetTests)

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
ce_configure_test(CEditorCtrl49SynthCompileTests)

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
ce_configure_test(CEditorCtrl49AssignmentTests)

# CTRL49 Phase-7 multi-synth: one assignment, pages targeting different synths; each page's
# params compile through its own profile to the right per-device bytes. No hardware.
add_executable(CEditorCtrl49MultiSynthTests
    "${CE_ROOT}/src/ControlSurface/Ctrl49Assignment.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileEngine.cpp"
    "${CE_ROOT}/tests/Ctrl49MultiSynthTests.cpp"
)
target_compile_features(CEditorCtrl49MultiSynthTests PRIVATE cxx_std_23)
target_compile_definitions(CEditorCtrl49MultiSynthTests PRIVATE
    CEDITOR_SOURCE_ROOT="${CMAKE_SOURCE_DIR}"
)
target_include_directories(CEditorCtrl49MultiSynthTests PRIVATE "${CE_ROOT}/src")
target_link_libraries(CEditorCtrl49MultiSynthTests PRIVATE juce::juce_core)
add_test(NAME Ctrl49MultiSynth COMMAND CEditorCtrl49MultiSynthTests)
ce_configure_test(CEditorCtrl49MultiSynthTests)

# CTRL49 preset bank: loads the sample bank, verifies patch -> Bank Select + Program Change
# bytes across banks. No hardware.
add_executable(CEditorCtrl49PresetBankTests
    "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
    "${CE_ROOT}/src/ControlSurface/Ctrl49PresetBank.cpp"
    "${CE_ROOT}/tests/Ctrl49PresetBankTests.cpp"
)
target_compile_features(CEditorCtrl49PresetBankTests PRIVATE cxx_std_23)
target_compile_definitions(CEditorCtrl49PresetBankTests PRIVATE
    CEDITOR_SOURCE_ROOT="${CMAKE_SOURCE_DIR}"
)
target_include_directories(CEditorCtrl49PresetBankTests PRIVATE "${CE_ROOT}/src")
target_link_libraries(CEditorCtrl49PresetBankTests PRIVATE juce::juce_core)
add_test(NAME Ctrl49PresetBank COMMAND CEditorCtrl49PresetBankTests)
ce_configure_test(CEditorCtrl49PresetBankTests)

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

    # CTRL49 Bridge — the self-contained product exe: knobs mode (default) + --presets, all
    # assets (Lua pages, filmstrip, default assignment/bank, GAIA profile) embedded at build
    # time by tools/ctrl49/embed_assets.cmake. No files needed beside the exe.
    set(CTRL49_EMBED_OUT "${CMAKE_BINARY_DIR}/generated/Ctrl49EmbeddedAssets.cpp")
    add_custom_command(
        OUTPUT "${CTRL49_EMBED_OUT}"
        COMMAND ${CMAKE_COMMAND}
            -DROOT=${CMAKE_SOURCE_DIR}
            -DOUT=${CTRL49_EMBED_OUT}
            -P ${CMAKE_SOURCE_DIR}/tools/ctrl49/embed_assets.cmake
        DEPENDS
            "${CMAKE_SOURCE_DIR}/tools/ctrl49/embed_assets.cmake"
            "${CMAKE_SOURCE_DIR}/tools/ctrl49/CEditor_MultiKnob.lua"
            "${CMAKE_SOURCE_DIR}/tools/ctrl49/CEditor_PresetList.lua"
            "${CMAKE_SOURCE_DIR}/tools/ctrl49/knob_strip.png"
            "${CMAKE_SOURCE_DIR}/tools/ctrl49/bridge-default.assignment.json"
            "${CMAKE_SOURCE_DIR}/tools/ctrl49/gaia-patches.presetbank.json"
            "${CMAKE_SOURCE_DIR}/CE/profiles/test/roland-gaia.ceditor-device.json"
        COMMENT "Embedding CTRL49 bridge assets"
    )
    add_executable(Ctrl49Bridge
        "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Reducer.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Session.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49WinMmOutput.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49PrivateInput.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Assignment.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49PresetBank.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Bridge.cpp"
        "${CE_ROOT}/src/DeviceProfile/DeviceProfileEngine.cpp"
        "${CTRL49_EMBED_OUT}"
    )
    target_compile_features(Ctrl49Bridge PRIVATE cxx_std_23)
    target_include_directories(Ctrl49Bridge PRIVATE "${CE_ROOT}/src")
    target_link_libraries(Ctrl49Bridge PRIVATE winmm juce::juce_core)
    add_test(NAME Ctrl49BridgeSelfTest COMMAND Ctrl49Bridge --selftest)

    # CTRL49 preset browser (Phase 7): patch-list page + data-dial navigation + load on press.
    add_executable(Ctrl49PresetTest
        "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Session.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49WinMmOutput.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49PrivateInput.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49PresetBank.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49PresetTest.cpp"
    )
    target_compile_features(Ctrl49PresetTest PRIVATE cxx_std_23)
    target_include_directories(Ctrl49PresetTest PRIVATE "${CE_ROOT}/src")
    target_link_libraries(Ctrl49PresetTest PRIVATE winmm juce::juce_core)
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
ce_configure_test(CEditorPythonScriptTests)
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
ce_configure_test(CEditorScriptingTests)

    # Window-closed integration: panel -> gathered scripts -> runtime -> dispatch -> API callbacks.
    add_executable(CEditorPlayerScriptTests "${CE_ROOT}/tests/PlayerScriptIntegrationTests.cpp")
    target_link_libraries(CEditorPlayerScriptTests PRIVATE ceditor_scripting juce::juce_core)
    target_include_directories(CEditorPlayerScriptTests PRIVATE "${CE_ROOT}/src")
    add_test(NAME PlayerScriptIntegration COMMAND CEditorPlayerScriptTests)
ce_configure_test(CEditorPlayerScriptTests)

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
            # Every format that can exist, not just the two that used to. `if (TARGET …)` below
            # already skips the ones this configure did not produce, so naming CLAP/LV2/AU here
            # costs nothing and stops a new format from silently missing its runpath — which would
            # only show up as a plugin that refuses to load on an end user's machine.
            foreach(_fmt VST3 Standalone CLAP LV2 AU)
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

if (CEDITOR_VALUE_LAYER AND TARGET CEditorPlayerVST)
    target_compile_definitions(CEditorPlayerVST PUBLIC CEDITOR_VALUE_LAYER=1)
    message(STATUS "CEditor: value/parameter layer ENABLED for CEditorPlayerVST (M2 — APVTS + state).")
endif()

# Installing means installing the APP, which only exists when it was built.
if (TARGET CEditor)
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
endif()

# JUCE handles the entry point via START_JUCE_APPLICATION
# Run this from the CE/web/ directory:
# cd CE/web && npm run dev
# That starts the Vite dev server with hot reload. It'll show the localhost URL (usually http://localhost:5173) in the terminal output.


# “Earth is the insane asylum of the universe.”
# ― Albert Einstein
