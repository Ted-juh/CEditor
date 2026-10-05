@echo off
REM Double-click launcher for the HoSTage feature mockups (screen-lab\feature-mockups), one preset
REM with five pages: Sound Atlas, Motion, Capture, Stage, Chords. Needs a Ctrl49ScreenLab.exe with
REM the preset mode, beside this file or built under build\native. Connect the CTRL49 and close
REM VIP, your DAW and HoSTage / CEditor first (only one program can own the screen).

setlocal
set "HERE=%~dp0"
set "EXE=%HERE%Ctrl49ScreenLab.exe"
if not exist "%EXE%" set "EXE=%HERE%..\..\build\native\Release\Ctrl49ScreenLab.exe"
if not exist "%EXE%" set "EXE=%HERE%..\..\build\native\Debug\Ctrl49ScreenLab.exe"

if not exist "%EXE%" (
    echo Could not find Ctrl49ScreenLab.exe beside this file or under build\native.
    echo Build it first:  cmake --build build/native --config Release --target Ctrl49ScreenLab
    echo.
    pause
    exit /b 1
)

echo   Page ^< ^> walks the five pages:
echo   1  Sound Atlas   the library as a map; E4 picks the sound whose colour the screen takes
echo   2  Motion        four parameters and the modulation pushing them, moving
echo   3  Capture       the last two minutes of playing; turn E5 to keep the box as a loop
echo   4  Stage         the setlist cue screen; E1 picks the song
echo   5  Chords        the chord held and the next chords on the pads; E1 key, E2 scale
echo   Ctrl+C stops.
echo.
"%EXE%" preset "%HERE%screen-lab\feature-mockups\hostage-features\Design.ctrl49preset"

echo.
echo (exit code %ERRORLEVEL%)
pause
