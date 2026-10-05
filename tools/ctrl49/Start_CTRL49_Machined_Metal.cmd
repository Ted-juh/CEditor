@echo off
setlocal
set "EXE=%~dp0..\..\build\native\Release\Ctrl49ScreenLab.exe"
if not exist "%EXE%" set "EXE=%~dp0..\..\build\native\Debug\Ctrl49ScreenLab.exe"
if not exist "%EXE%" (
    echo Build Ctrl49ScreenLab first, or use the packaged test launcher.
    pause
    exit /b 1
)
echo Machined Metal - CTRL49 screen preset
echo Close HoSTage / CEditor, VIP and your DAW before starting.
echo Page Left / Right: Controls, Mixer, Envelope.
echo E1-E4: knobs or ADSR. E1-E8: mixer faders. Ctrl+C: stop.
echo Demonstration values only; no synth output.
"%EXE%" preset "%~dp0screen-lab\machined-metal\MachinedMetal.ctrl49preset"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" pause
exit /b %RESULT%
