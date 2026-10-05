@echo off
REM Double-click launcher for the HoSTage feature mockups (screen-lab\feature-mockups): two presets
REM of five pages each. Needs a Ctrl49ScreenLab.exe with the preset mode, beside this file or built
REM under build\native. Connect the CTRL49 and close VIP, your DAW and HoSTage / CEditor first
REM (only one program can own the screen).

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

echo   1  HoSTage Features
echo        Sound Atlas   the library as a map; E4 picks the sound whose colour the screen takes
echo        Motion        four parameters and the modulation pushing them, moving
echo        Capture       the last two minutes of playing; turn E5 to keep the box as a loop
echo        Stage         the setlist cue screen; E1 picks the song
echo        Chords        the chord held and the next chords on the pads; E1 key, E2 scale
echo   2  HoSTage Rig
echo        Layers        every part's key range over the keys; E1 picks the part
echo        Effects       what every effect is doing to the sound; E1 picks the slot
echo        Soundcheck    the setlist checked before the show; turn E3 to check again
echo        Discover      what you own and never opened, nearest to what you play
echo        Changes       the sound against its saved version; E1 listens from A to B
choice /c 12 /n /m "Which preset? [1, 2] "
set "DESIGN=hostage-features"
if errorlevel 2 set "DESIGN=hostage-rig"

echo.
echo Page ^< ^> walks the five pages. Ctrl+C stops.
"%EXE%" preset "%HERE%screen-lab\feature-mockups\%DESIGN%\Design.ctrl49preset"

echo.
echo (exit code %ERRORLEVEL%)
pause
