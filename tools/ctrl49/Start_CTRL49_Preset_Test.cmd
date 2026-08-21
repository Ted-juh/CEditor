@echo off
REM CTRL49 preset browser (Phase 7). Shows a bank of patch names on the screen; the data
REM dial scrolls, pressing the dial loads the patch (Bank Select + Program Change) on the
REM synth. Edit BANK below for a different synth. Connect the synth AND close VIP / your DAW.
REM If the synth port name (from the bank's "port") is unknown, the tool lists ports; pass an
REM override as the 3rd argument.

setlocal
set "HERE=%~dp0"
set "EXE=%HERE%..\..\build\native\Debug\Ctrl49PresetTest.exe"
set "BANK=%HERE%gaia-patches.presetbank.json"
set "LUA=%HERE%CEditor_PresetList.lua"

if not exist "%EXE%" (
    echo Could not find Ctrl49PresetTest.exe at:
    echo   %EXE%
    echo Build it:  cmake --build build/native --config Debug --target Ctrl49PresetTest
    echo.
    pause
    exit /b 1
)

set /p SYNTHPORT=Synth MIDI-out port override (blank = use the bank's "port"):

"%EXE%" "%BANK%" "%LUA%" %SYNTHPORT%

echo.
echo (exit code %ERRORLEVEL%)
pause
