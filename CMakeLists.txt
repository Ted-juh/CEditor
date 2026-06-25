cmake_minimum_required(VERSION 3.24)
project(CEditor VERSION 0.2.0)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CE_ROOT "${CMAKE_SOURCE_DIR}/CE")
option(CEDITOR_DEV_MODE "Load the frontend from the Vite dev server" ON)

# JUCE 8.0.7 from local install
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
set(CE_VST_PANEL_PATH   "C:/tmp/gaia-filter.cepanel" CACHE STRING "Panel document the plugin loads")

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

    # Window-closed integration: panel -> gathered scripts -> runtime -> dispatch -> API callbacks.
    add_executable(CEditorPlayerScriptTests "${CE_ROOT}/tests/PlayerScriptIntegrationTests.cpp")
    target_link_libraries(CEditorPlayerScriptTests PRIVATE ceditor_scripting juce::juce_core)
    target_include_directories(CEditorPlayerScriptTests PRIVATE "${CE_ROOT}/src")

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
