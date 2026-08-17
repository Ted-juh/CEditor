@echo off
REM CTRL49 multi-knob page -> real synth (Phase 5). Eight encoders drive eight assigned
REM GAIA parameters; Page Left/Right switches assignment pages. Edit ASSIGNMENT below to
REM point at a different synth/profile (SH-201, AN1x). Connect the synth AND close VIP /
REM your DAW first (they hold the CTRL49 hidden input). If the synth port name is unknown,
REM type anything at the prompt and the tool lists the available ports.

setlocal
set "HERE=%~dp0"
set "EXE=%HERE%..\..\build\native\Debug\Ctrl49MultiTest.exe"
set "ASSIGNMENT=%HERE%gaia-filter-amp.assignment.json"
set "LUA=%HERE%CEditor_MultiKnob.lua"
set "PNG=%HERE%knob_strip.png"

if not exist "%EXE%" (
    echo Could not find Ctrl49MultiTest.exe at:
    echo   %EXE%
    echo Build it:  cmake --build build/native --config Debug --target Ctrl49MultiTest
    echo.
    pause
    exit /b 1
)

set /p SYNTHPORT=Synth MIDI-out port name (e.g. SH-01, GAIA, or part of it):

"%EXE%" "%ASSIGNMENT%" "%LUA%" "%PNG%" "%SYNTHPORT%"

echo.
echo (exit code %ERRORLEVEL%)
pause
