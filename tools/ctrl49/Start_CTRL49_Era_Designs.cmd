@echo off
REM Double-click launcher for the ten era designs (screen-lab\era-presets), five pages each:
REM Controls, Mixer, Envelope, and an arpeggiator on a piano roll (Arp Edit, Arp Play). Needs a
REM Ctrl49ScreenLab.exe with the preset mode, beside this file or built under build\native.
REM Connect the CTRL49 and close VIP, your DAW and HoSTage / CEditor first (only one program can
REM own the screen).

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

echo   Flat to skeuomorphic:
echo   1  Metro Tiles 2012   black, solid colour tiles
echo   2  Midnight 2020      a dark software synth, thin coloured arcs
echo   3  Swiss Flat 2011    off-white, four colour-coded knobs
echo   4  Blueprint 1965     white line drawing on drafting blue
echo   5  Neo Brutal 2023    thick outlines, hard shadows, loud colour
echo   6  Dot Matrix 1983    a backlit monochrome LCD
echo   7  Red Lead 1997      red virtual analogue, LED rings
echo   8  Rhythm Box 1980    drum-machine plastic
echo   9  Walnut 1971        black panel, walnut cheeks, fluted knobs
echo   0  Test Bench 1958    hammertone enamel, a CRT, chicken-head knobs
choice /c 1234567890 /n /m "Which design? [1-9, 0] "
set "DESIGN=metro-tiles-2012"
if errorlevel 2 set "DESIGN=midnight-2020"
if errorlevel 3 set "DESIGN=swiss-flat-2011"
if errorlevel 4 set "DESIGN=blueprint-1965"
if errorlevel 5 set "DESIGN=neo-brutal-2023"
if errorlevel 6 set "DESIGN=dot-matrix-1983"
if errorlevel 7 set "DESIGN=red-lead-1997"
if errorlevel 8 set "DESIGN=rhythm-box-1980"
if errorlevel 9 set "DESIGN=walnut-1971"
if errorlevel 10 set "DESIGN=test-bench-1958"

echo.
echo Page ^< ^> walks Controls, Mixer, Envelope, Arp Edit, Arp Play. Ctrl+C stops.
"%EXE%" preset "%HERE%screen-lab\era-presets\%DESIGN%\Design.ctrl49preset"

echo.
echo (exit code %ERRORLEVEL%)
pause
