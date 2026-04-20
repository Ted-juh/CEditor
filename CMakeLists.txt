cmake_minimum_required(VERSION 3.24)
project(CEditor VERSION 0.1.0)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CE_ROOT "${CMAKE_SOURCE_DIR}/CE")

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
    "${CE_ROOT}/src/WebViewHost.cpp"
    "${CE_ROOT}/src/ValueTreeBridge.cpp"
    "${CE_ROOT}/src/ValueTreeBridgeHandlers.cpp"
    "${CE_ROOT}/src/ValueTreeBridgeState.cpp"
)

target_compile_definitions(CEditor PRIVATE
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2=1
    JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=0
    # Dev mode: load from Vite dev server (http://localhost:5173)
    # Set to 0 for production builds that serve from ResourceProvider
    CEDITOR_DEV_MODE=1
)

target_include_directories(CEditor PRIVATE
    "${WEBVIEW2_INCLUDE}"
    "${CMAKE_BINARY_DIR}/BinaryData"
)

target_link_libraries(CEditor PRIVATE
    juce::juce_core
    juce::juce_data_structures
    juce::juce_events
    juce::juce_graphics
    juce::juce_gui_basics
    juce::juce_gui_extra
    "${WEBVIEW2_LIB_DIR}/WebView2LoaderStatic.lib"
    dwmapi
    CEditorData
)

# JUCE handles the entry point via START_JUCE_APPLICATION
# Run this from the CE/web/ directory:
# cd CE/web && npm run dev
# That starts the Vite dev server with hot reload. It'll show the localhost URL (usually http://localhost:5173) in the terminal output.


# “Earth is the insane asylum of the universe.”
# ― Albert Einstein