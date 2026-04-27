cmake_minimum_required(VERSION 3.24)
project(CEditor VERSION 0.1.0)

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
    juce::juce_data_structures
    juce::juce_events
    juce::juce_graphics
    juce::juce_gui_basics
    juce::juce_gui_extra
    "${WEBVIEW2_LIB_DIR}/WebView2LoaderStatic.lib"
    dwmapi
    CEditorData
)

add_executable(CEditorDeviceProfileTests
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileEngine.cpp"
    "${CE_ROOT}/src/DeviceProfile/DeviceProfileService.cpp"
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
)

install(TARGETS CEditor
    RUNTIME DESTINATION "."
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
