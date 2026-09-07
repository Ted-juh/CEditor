cmake_minimum_required(VERSION 3.22)
project(ProbeSynth VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 20)
find_package(JUCE CONFIG REQUIRED)

juce_add_plugin(ProbeSynth
    PRODUCT_NAME "Probe Synth"
    COMPANY_NAME "CEditor Verification"
    PLUGIN_MANUFACTURER_CODE Cedv
    PLUGIN_CODE Prb1
    FORMATS VST3
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE)

target_sources(ProbeSynth PRIVATE ProbeSynth.cpp)
target_compile_definitions(ProbeSynth PUBLIC
    JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_DISPLAY_SPLASH_SCREEN=0)
target_link_libraries(ProbeSynth PRIVATE juce::juce_audio_utils juce::juce_dsp)
