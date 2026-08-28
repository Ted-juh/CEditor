cmake_minimum_required(VERSION 3.24)
project(CEditor VERSION 0.2.0)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CE_ROOT "${CMAKE_SOURCE_DIR}/CE")

# Refuse MinGW here, where the reason still fits on a screen.
#
# JUCE does not support it and says so, but it says so from inside a header — juce_core's
# juce_TargetPlatform.h has a bare `#error "MinGW is not supported."` — which means you find out
# several hundred lines into a build, underneath the wreckage that follows from it: a
# `static_assert (sizeof (pointer_sized_int) == sizeof (void*))` reduced to `(4 == 8)` because the
# platform block that defines those types was never entered, a CRITICAL_SECTION sized `40 <= 24`,
# memset/strlen/strcmp/stricmp and __cpuid all undeclared, and a sol2 template error on top. None
# of that is a defect in this repo and none of it is worth reading.
#
# It is easy to hit by accident and the accident leaves no trace: on Windows the `native` preset
# asks for Ninja, Ninja asks CMake for a C++ compiler, and CMake takes the first one on PATH. In a
# plain PowerShell that is whatever MinGW you have installed for something else; `cl.exe` is only
# on PATH inside a Developer shell. The configure then succeeds, so the mistake surfaces as a
# compile failure in JUCE rather than as a wrong compiler.
if(MINGW)
    message(FATAL_ERROR
        "MinGW cannot build this project — JUCE rejects it outright (juce_TargetPlatform.h).\n"
        "CMake picked ${CMAKE_CXX_COMPILER}, which is the first compiler on PATH.\n"
        "\n"
        "Build with MSVC instead. Delete the cache first, because it has the compiler pinned:\n"
        "    Remove-Item -Recurse -Force build/native\n"
        "then EITHER open 'x64 Native Tools Command Prompt for VS 2022' (or run\n"
        "Launch-VsDevShell.ps1 -Arch amd64) and re-run the configure there, so cl.exe is found:\n"
        "    cmake --preset native -DCEDITOR_SCRIPTING=ON -DCEDITOR_DEV_MODE=OFF\n"
        "OR stay in a plain shell and let CMake find MSVC itself:\n"
        "    cmake -S . -B build/native -G \"Visual Studio 17 2022\" -A x64 -DCEDITOR_SCRIPTING=ON -DCEDITOR_DEV_MODE=OFF")
endif()

# Register the test executables below with CTest so `ctest --test-dir <build> -C <config>` (and CI)
# discovers and runs them all; each exe returns non-zero on failure.
enable_testing()
option(CEDITOR_DEV_MODE "Load the frontend from the Vite dev server" ON)

# The GUI app, the standalone player and the VST default to Windows-only, but the reason is
# narrower than it looks and it is worth knowing exactly where the wall is, because "it needs
# Windows" was used for a long time to avoid checking anything at all off it.
#
# What is actually Windows-only is the LINK, and one library of it: `dwmapi`. Everything else
# builds here. All thirty translation units of the CEditor target compile on Linux — Main.cpp
# included — with the real app defines (JUCE_WEB_BROWSER=1, JUCE_USE_WIN_WEBVIEW2=1), and even
# WebView2LoaderStatic.lib goes through the linker without complaint. juceaide is not a wall
# either: the vendored .exe runs under Wine and bakes BinaryData correctly, which is what
# CEDITOR_JUCE_HELPER_DIR below is for. See CLAUDE.md, "Local verification", for the recipe.
#
# So the honest split is:
#   compiles anywhere   — every CE/src file, every JUCE module, the generated binary data
#   needs Windows       — the final link (dwmapi), and MSVC's opinion of the source
#
# That second one is not a formality: the commit before this comment was written fixed a
# C3861 that GCC and Clang both accept, caused by a function sitting behind the wrong #if. A
# clean Linux compile is a strong check and not a substitute for the CI run.
#
# The TESTS need none of it, so they are always configured and the app is not.
# `cmake -B build -DCEDITOR_BUILD_APP=ON` turns the app on wherever you are.
if(WIN32)
    set(CEDITOR_BUILD_APP_DEFAULT ON)
else()
    set(CEDITOR_BUILD_APP_DEFAULT OFF)
endif()
option(CEDITOR_BUILD_APP "Build the GUI app, the standalone player and the VST (links against Windows dwmapi; compiles anywhere)" ${CEDITOR_BUILD_APP_DEFAULT})

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

# Where to find the helpers, overridable so the vendored .exe files are not the only answer:
#   -DCEDITOR_JUCE_HELPER_DIR=/path/to/dir
# holding `juceaide.exe`, `juce_lv2_helper.exe`, `juce_vst3_helper.exe`. Those names keep the
# .exe suffix whatever the platform, because JUCEConfig.cmake hardcodes it (JUCE/lib/cmake/
# JUCE-8.0.7/JUCEConfig.cmake:71) — but nothing requires them to BE Windows binaries. A shell
# script that execs `wine juceaide.exe` works, and is how the app target is built off Windows.
#
# This used to compute a platform suffix and check for `juceaide` with no extension on Linux
# while the import below went on pointing at `juceaide.exe`. The two never agreed: dropping
# genuine native helpers in would satisfy the check and then fail at build time on a path that
# does not exist, and the vendored .exe files failed the check while being perfectly usable.
# One name, checked and imported in the same place, is the fix.
set(CEDITOR_JUCE_HELPER_DIR "${JUCE_VENDORED_BIN}" CACHE PATH
    "Directory holding juceaide.exe and the plugin format helpers (may be Wine wrappers)")

set(JUCE_MISSING_HELPERS "")
foreach(helper IN LISTS JUCE_REQUIRED_HELPERS)
    if(NOT EXISTS "${CEDITOR_JUCE_HELPER_DIR}/${helper}.exe")
        list(APPEND JUCE_MISSING_HELPERS "  ${CEDITOR_JUCE_HELPER_DIR}/${helper}.exe")
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
        "directory; without it the blanket *.exe rule drops them again.\n\n"
        "Off Windows you do not need native ones: point "
        "-DCEDITOR_JUCE_HELPER_DIR at a directory of wrappers that exec them "
        "under Wine. See CLAUDE.md, \"Local verification\".")
endif()

list(APPEND CMAKE_PREFIX_PATH "${CMAKE_SOURCE_DIR}/JUCE/lib/cmake/JUCE-8.0.7")
find_package(JUCE CONFIG REQUIRED)

# JUCEConfig.cmake hardcodes each helper's IMPORTED_LOCATION to the vendored path, so honouring
# CEDITOR_JUCE_HELPER_DIR means re-pointing the imported targets after the fact. Only when it has
# been moved: the default path is what find_package already set, and rewriting it to the same
# value would be noise.
if(NOT CEDITOR_JUCE_HELPER_DIR STREQUAL JUCE_VENDORED_BIN)
    foreach(helper IN LISTS JUCE_REQUIRED_HELPERS)
        if(TARGET juce::${helper})
            set_target_properties(juce::${helper} PROPERTIES
                IMPORTED_LOCATION "${CEDITOR_JUCE_HELPER_DIR}/${helper}.exe")
        endif()
    endforeach()
    message(STATUS "CEditor: JUCE helpers from ${CEDITOR_JUCE_HELPER_DIR}")
endif()

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
        "${CE_ROOT}/src/InstrumentHost/PluginCatalog.cpp"
        "${CE_ROOT}/src/InstrumentHost/PluginScannerCoordinator.cpp"
        "${CE_ROOT}/src/Performance/PatternModel.cpp"
        "${CE_ROOT}/src/Performance/PatternCompiler.cpp"
        "${CE_ROOT}/src/Performance/PerformanceEngine.cpp"
        "${CE_ROOT}/src/InstrumentHost/RackModel.cpp"
        "${CE_ROOT}/src/InstrumentHost/InstrumentRackHost.cpp"
        "${CE_ROOT}/src/InstrumentHost/InstrumentHostService.cpp"
        "${CE_ROOT}/src/InstrumentHost/PlatformMatrix.cpp"
        "${CE_ROOT}/src/InstrumentHost/SupportBundle.cpp"
        "${CE_ROOT}/src/Licensing/Licence.cpp"
        "${CE_ROOT}/src/Licensing/Entitlements.cpp"
        "${CE_ROOT}/src/Licensing/LicenceStore.cpp"
        "${CE_ROOT}/src/ControlSurface/SurfaceProfile.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49RackDisplay.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49PerformanceDisplay.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
        "${CE_ROOT}/src/InstrumentHost/ParameterModel.cpp"
        "${CE_ROOT}/src/InstrumentHost/Library.cpp"
        "${CE_ROOT}/src/InstrumentHost/PluginEditorHost.cpp"
    )

    target_compile_definitions(CEditor PRIVATE
        CEDITOR_SOURCE_ROOT="${CMAKE_SOURCE_DIR}"
        JUCE_WEB_BROWSER=1
        JUCE_USE_WIN_WEBVIEW2=1
        JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
        # The instrument host (VIP-successor Stage 1): the editor scans and hosts inner VST3
        # instruments. The scanner runs out-of-process (CEditorPluginScanner below); this is
        # the in-editor hosting half — catalogue resolution, instantiation, the rack.
        JUCE_PLUGINHOST_VST3=1
        # Dev mode: load from Vite dev server (http://localhost:5173)
        # Set to 0 for production builds that serve files from the installed bundle
        CEDITOR_DEV_MODE=$<IF:$<BOOL:${CEDITOR_DEV_MODE}>,1,0>
    )

    target_include_directories(CEditor PRIVATE
        "${WEBVIEW2_INCLUDE}"
        # CE/src on the include path, like every other target here. It was missing, and it went
        # unnoticed for as long as it did because the .cpp files at the ROOT of CE/src resolve
        # "InstrumentHost/Foo.h" relative to themselves and never needed it. The moment a header
        # INSIDE a subdirectory reached across to another one — RackModel.h asking for
        # "Performance/PatternModel.h" — that fallback stopped applying and the app target would
        # not compile at all. Fifteen such includes exist across ControlSurface, DeviceProfile,
        # Export, InstrumentHost, Licensing, Performance and Scripting.
        "${CE_ROOT}/src"
        "${CMAKE_BINARY_DIR}/BinaryData"
    )

    target_link_libraries(CEditor PRIVATE
        juce::juce_core
        juce::juce_cryptography
        juce::juce_audio_basics
        juce::juce_audio_devices
        juce::juce_audio_processors
        juce::juce_audio_utils
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

    # The compiler-free export path.
    #
    # Normally each exported panel is its own relink, because the VST3 FUID is derived from
    # PLUGIN_CODE + MANUFACTURER_CODE and those are #defines. That is what made a C++ toolchain a
    # requirement on the USER's machine, and it is the reason "export runs from a source checkout"
    # was a product limitation rather than a preference.
    #
    # A template build drops that. The binary takes both its identity and its panel from the single
    # .cepanel sitting beside it, so exporting becomes "copy a prebuilt (and signable, once)
    # binary, write the panel next to it" with no compiler anywhere. The ids it reports are
    # byte-identical to the ones the relinking path produced -- CE/tests/PanelIdentitySidecarTests
    # asserts that against JUCE's own convertJucePluginId -- so a session saved against a
    # compile-per-panel export keeps finding its plugin.
    #
    # It needs a one-line patch in vendored JUCE (JUCE/VENDORED.md; guarded by the define below and
    # pinned by CE/web/test/vendoredJucePatches.test.js). OFF by default: the per-panel build is
    # still what a developer wants, and it is the path with the mileage on it.
    option(CEDITOR_TEMPLATE_PLAYER "Build a panel-agnostic player that reads its identity and panel from a .cepanel beside the binary" OFF)
    if (CE_VST_PANEL_PATH STREQUAL "")
        if (CEDITOR_TEMPLATE_PLAYER)
            message(STATUS "CEditorPlayerVST: TEMPLATE build -- identity and panel come from the .cepanel beside the binary.")
        elseif (CE_VST_GENERIC_PLAYER)
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
        CEDITOR_SIDECAR_IDENTITY=$<IF:$<BOOL:${CEDITOR_TEMPLATE_PLAYER}>,1,0>
    )

    # PUBLIC for CE_ROOT/src, not PRIVATE, and the reason is easy to trip over: juce_add_plugin puts
    # the format wrappers in their own targets that LINK this one, so a PRIVATE include never
    # reaches the translation unit that compiles juce_audio_plugin_client_VST3.cpp -- which is
    # exactly the file that needs Export/Vst3SidecarIdentity.h. The compile definitions above are
    # PUBLIC for the same reason.
    target_include_directories(CEditorPlayerVST PRIVATE
        "${WEBVIEW2_INCLUDE}"
        "${CMAKE_BINARY_DIR}/PlayerWebData"
    )

    target_include_directories(CEditorPlayerVST PUBLIC
        "${CE_ROOT}/src"
    )

    target_link_libraries(CEditorPlayerVST PRIVATE
        juce::juce_audio_utils
        juce::juce_audio_devices
        juce::juce_core
        juce::juce_cryptography
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

    # --- CLAP format (via vendored clap-juce-extensions, CE/thirdparty/clap-juce-extensions) --------
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
        add_subdirectory(CE/thirdparty/clap-juce-extensions clap-juce-extensions EXCLUDE_FROM_ALL)
        clap_juce_extensions_plugin(TARGET CEditorPlayerVST
            CLAP_ID "${CE_CLAP_ID}"
            # A MIDI controller surface, not an audio processor: "utility" is the honest category
            # and "external" marks it as controlling outboard gear (both from the CLAP taxonomy).
            CLAP_FEATURES utility external)
        message(STATUS "CEditor: CLAP format ENABLED (target CEditorPlayerVST_CLAP, id ${CE_CLAP_ID}).")
    endif()

    # --- The generated instrument-host product (VIP-successor Stage 1) --------------------------
    # Two wrappers around the same InstrumentHostService the editor's preview uses: a standalone
    # (CEHostStandalone — owns the audio device, persists its session per user) and an outer VST3
    # (CEHostVST3 — the DAW owns audio and session; the rack rides in the project chunk). Both
    # serve host.html out of PlayerWebData — the bundle glob above already embeds every dist/
    # entry, so the runtime page ships without any packaging change.
    #
    # Identity is stamped from cache variables because the Host Project build reuses these targets
    # per product: same shape, whatever name/code the project chose (the CEditorPlayerVST
    # pattern, applied to the host).
    set(CE_HOST_PRODUCT_NAME    "CE Instrument Host" CACHE STRING "Generated host product name")
    set(CE_HOST_PRODUCT_VERSION "0.1.0"              CACHE STRING "Generated host product version")
    set(CE_HOST_COMPANY_NAME    "Tedjuh-inc"         CACHE STRING "Generated host vendor / company name")
    set(CE_HOST_MFR_CODE        "Tdjh"               CACHE STRING "Generated host 4-char manufacturer code")
    set(CE_HOST_PLUGIN_CODE     "CehR"               CACHE STRING "Generated host 4-char plugin code")

    set(CE_HOST_COMMON_SOURCES
        "${CE_ROOT}/src/InstrumentHost/PluginCatalog.cpp"
        "${CE_ROOT}/src/InstrumentHost/PluginScannerCoordinator.cpp"
        "${CE_ROOT}/src/Performance/PatternModel.cpp"
        "${CE_ROOT}/src/Performance/PatternCompiler.cpp"
        "${CE_ROOT}/src/Performance/PerformanceEngine.cpp"
        "${CE_ROOT}/src/InstrumentHost/RackModel.cpp"
        "${CE_ROOT}/src/InstrumentHost/InstrumentRackHost.cpp"
        "${CE_ROOT}/src/InstrumentHost/InstrumentHostService.cpp"
        "${CE_ROOT}/src/InstrumentHost/PlatformMatrix.cpp"
        "${CE_ROOT}/src/InstrumentHost/SupportBundle.cpp"
        "${CE_ROOT}/src/Licensing/Licence.cpp"
        "${CE_ROOT}/src/Licensing/Entitlements.cpp"
        "${CE_ROOT}/src/Licensing/LicenceStore.cpp"
        "${CE_ROOT}/src/ControlSurface/SurfaceProfile.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49RackDisplay.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49PerformanceDisplay.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
        "${CE_ROOT}/src/InstrumentHost/ParameterModel.cpp"
        "${CE_ROOT}/src/InstrumentHost/Library.cpp"
        "${CE_ROOT}/src/InstrumentHost/PluginEditorHost.cpp"
    )

    juce_add_gui_app(CEHostStandalone
        PRODUCT_NAME "${CE_HOST_PRODUCT_NAME}"
        COMPANY_NAME "${CE_HOST_COMPANY_NAME}"
    )

    target_sources(CEHostStandalone PRIVATE
        "${CE_ROOT}/src/InstrumentHost/HostRuntimeMain.cpp"
        "${CE_ROOT}/src/InstrumentHost/HostRuntimeShell.cpp"
        ${CE_HOST_COMMON_SOURCES}
    )

    target_compile_definitions(CEHostStandalone PRIVATE
        JUCE_WEB_BROWSER=1
        JUCE_USE_WIN_WEBVIEW2=1
        JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
        JUCE_PLUGINHOST_VST3=1
        CEDITOR_DEV_MODE=$<IF:$<BOOL:${CEDITOR_DEV_MODE}>,1,0>
        CEHOST_PRODUCT_NAME="${CE_HOST_PRODUCT_NAME}"
        CEHOST_PRODUCT_VERSION="${CE_HOST_PRODUCT_VERSION}"
    )

    target_include_directories(CEHostStandalone PRIVATE
        "${WEBVIEW2_INCLUDE}"
        "${CE_ROOT}/src"
        "${CMAKE_BINARY_DIR}/PlayerWebData"
    )

    target_link_libraries(CEHostStandalone PRIVATE
        juce::juce_core
        # The licence check (Licensing/*.cpp in the shared host sources above) uses RSAKey and
        # SHA256. Missed when juce_cryptography was linked into the other four targets that
        # compile those sources, and invisible from Linux: both host targets are Windows-only,
        # so the first linker to see them was the owner's. LNK2019 on RSAKey was the symptom.
        juce::juce_cryptography
        juce::juce_audio_basics
        juce::juce_audio_devices
        juce::juce_audio_processors
        juce::juce_audio_utils
        juce::juce_data_structures
        juce::juce_events
        juce::juce_graphics
        juce::juce_gui_basics
        juce::juce_gui_extra
        "${WEBVIEW2_LIB_DIR}/WebView2LoaderStatic.lib"
        dwmapi
        PlayerWebData
    )

    juce_add_plugin(CEHostVST3
        PRODUCT_NAME "${CE_HOST_PRODUCT_NAME}"
        COMPANY_NAME "${CE_HOST_COMPANY_NAME}"
        PLUGIN_MANUFACTURER_CODE "${CE_HOST_MFR_CODE}"
        PLUGIN_CODE "${CE_HOST_PLUGIN_CODE}"
        VERSION "${CE_HOST_PRODUCT_VERSION}"
        FORMATS VST3
        IS_SYNTH TRUE
        NEEDS_MIDI_INPUT TRUE
        NEEDS_MIDI_OUTPUT FALSE
        VST3_CATEGORIES Instrument
        COPY_PLUGIN_AFTER_BUILD FALSE
    )

    target_sources(CEHostVST3 PRIVATE
        "${CE_ROOT}/src/InstrumentHost/HostPluginProcessor.cpp"
        ${CE_HOST_COMMON_SOURCES}
    )

    target_compile_definitions(CEHostVST3 PRIVATE
        JUCE_WEB_BROWSER=1
        JUCE_USE_WIN_WEBVIEW2=1
        JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
        JUCE_PLUGINHOST_VST3=1
        JUCE_VST3_CAN_REPLACE_VST2=0
        CEDITOR_DEV_MODE=$<IF:$<BOOL:${CEDITOR_DEV_MODE}>,1,0>
    )

    target_include_directories(CEHostVST3 PRIVATE
        "${WEBVIEW2_INCLUDE}"
        "${CE_ROOT}/src"
        "${CMAKE_BINARY_DIR}/PlayerWebData"
    )

    target_link_libraries(CEHostVST3 PRIVATE
        juce::juce_core
        # The licence check (Licensing/*.cpp in the shared host sources above) uses RSAKey and
        # SHA256. Missed when juce_cryptography was linked into the other four targets that
        # compile those sources, and invisible from Linux: both host targets are Windows-only,
        # so the first linker to see them was the owner's. LNK2019 on RSAKey was the symptom.
        juce::juce_cryptography
        juce::juce_audio_basics
        juce::juce_audio_devices
        juce::juce_audio_processors
        juce::juce_audio_utils
        juce::juce_data_structures
        juce::juce_events
        juce::juce_graphics
        juce::juce_gui_basics
        juce::juce_gui_extra
        "${WEBVIEW2_LIB_DIR}/WebView2LoaderStatic.lib"
        dwmapi
        PlayerWebData
    )
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

# --- Export pipeline: compiler-free identity (the template player) ---
#
# The one that decides whether a prebuilt binary can carry a per-panel identity. It links
# juce_audio_processors rather than juce_core alone, because the assertion that matters is against
# JUCE's OWN VST3ClientExtensions::convertJucePluginId -- comparing our runtime derivation to a
# reimplementation of it here would prove only that two copies of our arithmetic agree.
add_executable(CEditorIdentitySidecarTests
    "${CE_ROOT}/tests/PanelIdentitySidecarTests.cpp"
)

target_compile_features(CEditorIdentitySidecarTests PRIVATE cxx_std_23)

target_include_directories(CEditorIdentitySidecarTests PRIVATE
    "${CE_ROOT}/src"
)

target_link_libraries(CEditorIdentitySidecarTests PRIVATE
    juce::juce_audio_processors
)

add_test(NAME PanelIdentitySidecar COMMAND CEditorIdentitySidecarTests)
ce_configure_test(CEditorIdentitySidecarTests)

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

# --- Total Recall S2: when a restored patch may be pushed at the hardware ---
# All ordering and timing, which is the class of rule that is easy to get subtly wrong and
# impossible to test through PluginProcessor.h — that file needs WebView2 and does not build off
# Windows. RestorePolicy.h is a pure function of the situation for exactly that reason, so every
# ordering the plan warns about is driven here on any machine. juce_core only.
add_executable(CEditorRestorePolicyTests
    "${CE_ROOT}/tests/RestorePolicyTests.cpp"
)

target_include_directories(CEditorRestorePolicyTests PRIVATE
    "${CE_ROOT}/src"
)

target_link_libraries(CEditorRestorePolicyTests PRIVATE
    juce::juce_core
)

add_test(NAME RestorePolicy COMMAND CEditorRestorePolicyTests)
ce_configure_test(CEditorRestorePolicyTests)

# --- Total Recall S4: the exported plugin's program list ---
# Same reasoning as RestorePolicy above — the rules are a pure function of the baked document so
# they can be driven off Windows, and the failures they guard (a host caching getNumPrograms, asking
# for names it was never promised, refusing a plugin that claims zero programs) show up in no build.
add_executable(CEditorProgramBankTests
    "${CE_ROOT}/tests/ProgramBankTests.cpp"
)

target_include_directories(CEditorProgramBankTests PRIVATE
    "${CE_ROOT}/src"
)

target_link_libraries(CEditorProgramBankTests PRIVATE
    juce::juce_core
)

add_test(NAME ProgramBank COMMAND CEditorProgramBankTests)
ce_configure_test(CEditorProgramBankTests)

# --- Update check: is there a newer CEditor than this one? ---
# The feature is one HTTP GET and a version comparison. The GET needs Windows and a network; the
# comparison is the half that can be wrong in a way nobody notices — a build that quietly believes
# it is up to date — so it is a pure function with its own test.
add_executable(CEditorUpdateCheckTests
    "${CE_ROOT}/tests/UpdateCheckTests.cpp"
)

target_include_directories(CEditorUpdateCheckTests PRIVATE
    "${CE_ROOT}/src"
)

target_link_libraries(CEditorUpdateCheckTests PRIVATE
    juce::juce_core
)

add_test(NAME UpdateCheck COMMAND CEditorUpdateCheckTests)
ce_configure_test(CEditorUpdateCheckTests)

# --- CTRL49 control surface (Phase 1): vendor SysEx protocol library ---
# Pure std, no I/O; golden bytes from the external CTRL49 reverse-engineering handoff.
# Design record: docs/design/screen-builder-design.md.
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

# CTRL49 rack surface display payloads + the reducer's normalized control events (Stage 3).
# Pure std like the protocol tests; the payload shapes follow contracts proven on hardware.
add_executable(CEditorCtrl49RackDisplayTests
    "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
    "${CE_ROOT}/src/ControlSurface/Ctrl49Reducer.cpp"
    "${CE_ROOT}/src/ControlSurface/Ctrl49RackDisplay.cpp"
    "${CE_ROOT}/src/ControlSurface/Ctrl49PerformanceDisplay.cpp"
    "${CE_ROOT}/tests/Ctrl49RackDisplayTests.cpp"
)
target_compile_features(CEditorCtrl49RackDisplayTests PRIVATE cxx_std_23)
target_include_directories(CEditorCtrl49RackDisplayTests PRIVATE "${CE_ROOT}/src")
add_test(NAME Ctrl49RackDisplay COMMAND CEditorCtrl49RackDisplayTests)
ce_configure_test(CEditorCtrl49RackDisplayTests)

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
    # CTRL49 rack demo (Stage 3): the keyboard drives the instrument host's control pages —
    # real VST3 instruments through the Stage 2 parameter model, sharing the generated
    # standalone's per-user session by default. The one hardware demo that hosts plug-ins,
    # hence the JUCE hosting defines and the modal-loop permission (its console main loop
    # pumps the message thread itself).
    add_executable(Ctrl49RackDemo
        "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Reducer.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49RackDisplay.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49PerformanceDisplay.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49Session.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49WinMmOutput.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49PrivateInput.cpp"
        "${CE_ROOT}/src/ControlSurface/Ctrl49RackDemo.cpp"
        "${CE_ROOT}/src/InstrumentHost/PluginCatalog.cpp"
        "${CE_ROOT}/src/InstrumentHost/PluginScannerCoordinator.cpp"
        "${CE_ROOT}/src/Performance/PatternModel.cpp"
        "${CE_ROOT}/src/Performance/PatternCompiler.cpp"
        "${CE_ROOT}/src/Performance/PerformanceEngine.cpp"
        "${CE_ROOT}/src/InstrumentHost/RackModel.cpp"
        "${CE_ROOT}/src/InstrumentHost/InstrumentRackHost.cpp"
        "${CE_ROOT}/src/InstrumentHost/InstrumentHostService.cpp"
        "${CE_ROOT}/src/InstrumentHost/PlatformMatrix.cpp"
        "${CE_ROOT}/src/InstrumentHost/SupportBundle.cpp"
        "${CE_ROOT}/src/Licensing/Licence.cpp"
        "${CE_ROOT}/src/Licensing/Entitlements.cpp"
        "${CE_ROOT}/src/Licensing/LicenceStore.cpp"
        "${CE_ROOT}/src/ControlSurface/SurfaceProfile.cpp"
        "${CE_ROOT}/src/InstrumentHost/ParameterModel.cpp"
        "${CE_ROOT}/src/InstrumentHost/Library.cpp"
    )
    target_compile_features(Ctrl49RackDemo PRIVATE cxx_std_23)
    target_compile_definitions(Ctrl49RackDemo PRIVATE
        JUCE_PLUGINHOST_VST3=1
        JUCE_MODAL_LOOPS_PERMITTED=1
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_STANDALONE_APPLICATION=1
    )
    target_include_directories(Ctrl49RackDemo PRIVATE "${CE_ROOT}/src")
    target_link_libraries(Ctrl49RackDemo PRIVATE juce::juce_cryptography winmm juce::juce_audio_utils)

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

# --- Instrument host (VIP-successor Stage 1): VST3 catalogue + isolated scanner ----------------
# The reuse rulings and the reasoning behind this block are in
# docs/design/instrument-host-integration-audit.md. The catalogue and coordinator are
# juce_core-only ON PURPOSE: their tests drive a stub worker (ScannerStubMain.cpp) through
# every hostile behaviour — hang, crash, garbage, reported error — so the whole scan loop is
# provable on any machine with no real VST3 and no juce_audio_processors. Only the worker
# executable below ever loads a third-party module, and never in the editor's process.

add_executable(CEditorPluginCatalogTests
    "${CE_ROOT}/src/InstrumentHost/PluginCatalog.cpp"
    "${CE_ROOT}/tests/PluginCatalogTests.cpp"
)
target_compile_features(CEditorPluginCatalogTests PRIVATE cxx_std_23)
target_include_directories(CEditorPluginCatalogTests PRIVATE "${CE_ROOT}/src")
target_link_libraries(CEditorPluginCatalogTests PRIVATE juce::juce_core)
add_test(NAME PluginCatalog COMMAND CEditorPluginCatalogTests)
ce_configure_test(CEditorPluginCatalogTests)

# The licence document, its signature and the edition table (§19 "Trust", §20, §26.2, §27).
# juce_cryptography is the only module beyond juce_core: RSAKey and SHA256, the two primitives
# an offline signature check needs. No network, and nothing to link that could introduce one.
add_executable(CEditorLicensingTests
    "${CE_ROOT}/src/Licensing/Licence.cpp"
    "${CE_ROOT}/src/Licensing/Entitlements.cpp"
    "${CE_ROOT}/src/Licensing/LicenceStore.cpp"
    "${CE_ROOT}/tests/LicensingTests.cpp"
)
target_compile_features(CEditorLicensingTests PRIVATE cxx_std_23)
target_include_directories(CEditorLicensingTests PRIVATE "${CE_ROOT}/src")
target_link_libraries(CEditorLicensingTests PRIVATE juce::juce_core juce::juce_cryptography)
add_test(NAME Licensing COMMAND CEditorLicensingTests)
ce_configure_test(CEditorLicensingTests)

# The vendor's side of the licence system: generate a key pair, sign a licence, sign the sunset
# unlock, verify what came out. A licensing system with no way to issue a licence is not one.
# Not installed and not shipped — this is an operator tool, built on demand.
add_executable(CEditorLicenceTool EXCLUDE_FROM_ALL
    "${CE_ROOT}/src/Licensing/Licence.cpp"
    "${CE_ROOT}/tools/LicenceToolMain.cpp"
)
target_compile_features(CEditorLicenceTool PRIVATE cxx_std_23)
target_include_directories(CEditorLicenceTool PRIVATE "${CE_ROOT}/src")
target_link_libraries(CEditorLicenceTool PRIVATE juce::juce_core juce::juce_cryptography)
ce_configure_test(CEditorLicenceTool)

# The stub is deliberately JUCE-free (pure std): it stands in for the worker in tests, and a
# stub that could itself drag in module dependencies would defeat the point of having one.
add_executable(CEditorScannerStub
    "${CE_ROOT}/tests/ScannerStubMain.cpp"
)
target_compile_features(CEditorScannerStub PRIVATE cxx_std_23)

add_executable(CEditorPluginScannerCoordinatorTests
    "${CE_ROOT}/src/InstrumentHost/PluginCatalog.cpp"
    "${CE_ROOT}/src/InstrumentHost/PluginScannerCoordinator.cpp"
    "${CE_ROOT}/tests/PluginScannerCoordinatorTests.cpp"
)
target_compile_features(CEditorPluginScannerCoordinatorTests PRIVATE cxx_std_23)
target_include_directories(CEditorPluginScannerCoordinatorTests PRIVATE "${CE_ROOT}/src")
target_link_libraries(CEditorPluginScannerCoordinatorTests PRIVATE juce::juce_core)
add_test(NAME PluginScannerCoordinator
         COMMAND CEditorPluginScannerCoordinatorTests $<TARGET_FILE:CEditorScannerStub>)
ce_configure_test(CEditorPluginScannerCoordinatorTests)

# The rack: document model, per-part MIDI gate, and the live graph host. Split by dependency
# so each layer is testable at the cheapest tier that can prove it: the model is juce_core,
# the filter core is juce_core + juce_audio_basics (all the ordering rules, no X11 anywhere),
# and only the host tests — which drive the REAL AudioProcessorGraph with stub instruments —
# need juce_audio_processors, with the same Linux X11/ALSA dev-package story as
# CEditorPanelParametersTests.
add_executable(CEditorRackModelTests
    "${CE_ROOT}/src/Performance/PatternModel.cpp"
    "${CE_ROOT}/src/InstrumentHost/RackModel.cpp"
    "${CE_ROOT}/tests/RackModelTests.cpp"
)
target_compile_features(CEditorRackModelTests PRIVATE cxx_std_23)
target_include_directories(CEditorRackModelTests PRIVATE "${CE_ROOT}/src")
target_link_libraries(CEditorRackModelTests PRIVATE juce::juce_core)
add_test(NAME RackModel COMMAND CEditorRackModelTests)
ce_configure_test(CEditorRackModelTests)

add_executable(CEditorPartMidiFilterTests
    "${CE_ROOT}/tests/PartMidiFilterTests.cpp"
)
target_compile_features(CEditorPartMidiFilterTests PRIVATE cxx_std_23)
target_include_directories(CEditorPartMidiFilterTests PRIVATE "${CE_ROOT}/src")
target_link_libraries(CEditorPartMidiFilterTests PRIVATE
    juce::juce_core
    juce::juce_audio_basics
)
add_test(NAME PartMidiFilter COMMAND CEditorPartMidiFilterTests)
ce_configure_test(CEditorPartMidiFilterTests)

# The Stage 6 performance system: one transport, one compiled event model, one scheduler —
# plus the arpeggiator and MIDI FX that are modes over it rather than clocks of their own.
# juce_audio_basics is the whole dependency, so the timing arithmetic that decides where beat
# three lands is provable on any machine rather than only on a Windows audio device.
add_executable(CEditorPerformanceEngineTests
    "${CE_ROOT}/src/Performance/PatternModel.cpp"
    "${CE_ROOT}/src/Performance/PatternCompiler.cpp"
    "${CE_ROOT}/src/Performance/PerformanceEngine.cpp"
    "${CE_ROOT}/tests/PerformanceEngineTests.cpp"
)
target_compile_features(CEditorPerformanceEngineTests PRIVATE cxx_std_23)
target_include_directories(CEditorPerformanceEngineTests PRIVATE "${CE_ROOT}/src")
target_link_libraries(CEditorPerformanceEngineTests PRIVATE
    juce::juce_core
    juce::juce_audio_basics
)
add_test(NAME PerformanceEngine COMMAND CEditorPerformanceEngineTests)
ce_configure_test(CEditorPerformanceEngineTests)

add_executable(CEditorRackHostTests
    "${CE_ROOT}/src/Performance/PatternModel.cpp"
    "${CE_ROOT}/src/Performance/PatternCompiler.cpp"
    "${CE_ROOT}/src/Performance/PerformanceEngine.cpp"
    "${CE_ROOT}/src/InstrumentHost/RackModel.cpp"
    "${CE_ROOT}/src/InstrumentHost/InstrumentRackHost.cpp"
    "${CE_ROOT}/tests/RackHostTests.cpp"
)
target_compile_features(CEditorRackHostTests PRIVATE cxx_std_23)
target_include_directories(CEditorRackHostTests PRIVATE "${CE_ROOT}/src")
target_link_libraries(CEditorRackHostTests PRIVATE
    juce::juce_core
    juce::juce_audio_processors
)
add_test(NAME RackHost COMMAND CEditorRackHostTests)
ce_configure_test(CEditorRackHostTests)

# The service: the whole "instrumentHost" bridge command surface, kept out of the handlers
# file so it is provable here — command dispatch, session persistence, the load transaction
# and scan orchestration, driven with the stub instantiator and the stub scanner worker.
add_executable(CEditorInstrumentHostServiceTests
    "${CE_ROOT}/src/Performance/PatternModel.cpp"
    "${CE_ROOT}/src/Performance/PatternCompiler.cpp"
    "${CE_ROOT}/src/Performance/PerformanceEngine.cpp"
    "${CE_ROOT}/src/InstrumentHost/PluginCatalog.cpp"
    "${CE_ROOT}/src/InstrumentHost/PluginScannerCoordinator.cpp"
    "${CE_ROOT}/src/InstrumentHost/RackModel.cpp"
    "${CE_ROOT}/src/InstrumentHost/InstrumentRackHost.cpp"
    "${CE_ROOT}/src/InstrumentHost/InstrumentHostService.cpp"
    "${CE_ROOT}/src/InstrumentHost/PlatformMatrix.cpp"
    "${CE_ROOT}/src/InstrumentHost/SupportBundle.cpp"
    "${CE_ROOT}/src/Licensing/Licence.cpp"
    "${CE_ROOT}/src/Licensing/Entitlements.cpp"
    "${CE_ROOT}/src/Licensing/LicenceStore.cpp"
    "${CE_ROOT}/src/ControlSurface/SurfaceProfile.cpp"
    "${CE_ROOT}/src/ControlSurface/Ctrl49RackDisplay.cpp"
    "${CE_ROOT}/src/ControlSurface/Ctrl49PerformanceDisplay.cpp"
    "${CE_ROOT}/src/ControlSurface/Ctrl49Protocol.cpp"
    "${CE_ROOT}/src/InstrumentHost/ParameterModel.cpp"
    "${CE_ROOT}/src/InstrumentHost/Library.cpp"
    "${CE_ROOT}/tests/InstrumentHostServiceTests.cpp"
)
target_compile_features(CEditorInstrumentHostServiceTests PRIVATE cxx_std_23)
target_include_directories(CEditorInstrumentHostServiceTests PRIVATE "${CE_ROOT}/src")
target_link_libraries(CEditorInstrumentHostServiceTests PRIVATE
    juce::juce_core
    juce::juce_cryptography
    juce::juce_audio_utils   # AudioProcessorPlayer for the service's preview audio engine
)
add_test(NAME InstrumentHostService
         COMMAND CEditorInstrumentHostServiceTests $<TARGET_FILE:CEditorScannerStub>)
ce_configure_test(CEditorInstrumentHostServiceTests)

# The worker. Deliberately OUTSIDE the CEDITOR_BUILD_APP block: it needs none of what that
# block exists to gate (no WebView2, no juceaide, no BinaryData) — juce_audio_processors with
# VST3 hosting is its whole dependency, and that compiles on Linux too, given the same X11/ALSA
# dev packages CEditorPanelParametersTests already needs. Default follows the app because the
# worker ships beside it; -DCEDITOR_SCANNER_WORKER=ON builds it anywhere for verification.
option(CEDITOR_SCANNER_WORKER "Build the out-of-process VST3 scanner helper (CEditorPluginScanner)" ${CEDITOR_BUILD_APP_DEFAULT})
if (CEDITOR_SCANNER_WORKER)
    add_executable(CEditorPluginScanner
        "${CE_ROOT}/src/InstrumentHost/ScannerWorkerMain.cpp"
    )
    target_compile_features(CEditorPluginScanner PRIVATE cxx_std_23)
    target_compile_definitions(CEditorPluginScanner PRIVATE
        JUCE_PLUGINHOST_VST3=1
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_STANDALONE_APPLICATION=1
    )
    target_include_directories(CEditorPluginScanner PRIVATE "${CE_ROOT}/src")
    target_link_libraries(CEditorPluginScanner PRIVATE juce::juce_audio_processors)
    message(STATUS "CEditor: VST3 scanner worker ENABLED (CEditorPluginScanner).")
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
