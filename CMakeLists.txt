cmake_minimum_required(VERSION 3.24)
project(CEditor VERSION 0.1.0)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# JUCE 8.0.7 from local install
list(APPEND CMAKE_PREFIX_PATH "${CMAKE_SOURCE_DIR}/JUCE/lib/cmake/JUCE-8.0.7")
find_package(JUCE CONFIG REQUIRED)

# --- WebView2 SDK (from NuGet package in thirdparty/) ---
set(WEBVIEW2_DIR "${CMAKE_SOURCE_DIR}/thirdparty/webview2/build/native")
set(WEBVIEW2_INCLUDE "${WEBVIEW2_DIR}/include")
set(WEBVIEW2_LIB_DIR "${WEBVIEW2_DIR}/x64")

# --- Standalone GUI app ---
juce_add_gui_app(CEditor
    PRODUCT_NAME "CEditor"
    COMPANY_NAME "Tedjuh-inc"
)

target_sources(CEditor PRIVATE
    src/Main.cpp
    src/WebViewHost.cpp
    src/ValueTreeBridge.cpp
)

target_compile_definitions(CEditor PRIVATE
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2=1
    JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=0
    # Dev mode: load from Vite dev server (http://localhost:5173)
    # Set to 0 for production builds that serve from ResourceProvider
    CEDITOR_DEV_MODE=1
)

target_include_directories(CEditor PRIVATE "${WEBVIEW2_INCLUDE}")

target_link_libraries(CEditor PRIVATE
    juce::juce_core
    juce::juce_data_structures
    juce::juce_events
    juce::juce_graphics
    juce::juce_gui_basics
    juce::juce_gui_extra
    "${WEBVIEW2_LIB_DIR}/WebView2LoaderStatic.lib"
)

# JUCE handles the entry point via START_JUCE_APPLICATION
