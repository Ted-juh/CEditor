@echo off
REM CTRL49 -> real synth first light (Phase 4). Encoder 1 drives GAIA filter cutoff via a
REM real Roland DT1 SysEx, and the CTRL49 screen shows the value.
REM
REM Connect the GAIA (or edit PROFILE/PARAM below for another synth) AND close VIP / your
REM DAW first (they hold the CTRL49 hidden input). If you don't know the synth's MIDI port
REM name, run once with anything and the tool prints the available ports; then type the
REM right one at the prompt.

setlocal
set "HERE=%~dp0"
set "EXE=%HERE%..\..\build\native\Debug\Ctrl49SynthTest.exe"
set "PROFILE=%HERE%..\..\CE\profiles\test\roland-gaia.ceditor-device.json"
set "LUA=%HERE%CEditor_Knob_Test.lua"
set "PNG=%HERE%knob_strip.png"
set "PARAM=filter.cutoff"

if not exist "%EXE%" (
    echo Could not find Ctrl49SynthTest.exe at:
    echo   %EXE%
    echo Build it:  cmake --build build/native --config Debug --target Ctrl49SynthTest
    echo.
    pause
    exit /b 1
)

set /p SYNTHPORT=Synth MIDI-out port name (e.g. SH-01, GAIA, or part of it):

"%EXE%" "%PROFILE%" "%LUA%" "%PNG%" "%SYNTHPORT%" "%PARAM%"

echo.
echo (exit code %ERRORLEVEL%)
pause
