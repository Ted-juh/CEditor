@echo off
REM Double-click launcher for the era designs (screen-lab\era-presets): six skins of five pages
REM (Controls, Mixer, Envelope, Sequencer, Arpeggiator), and a piano-roll arpeggiator. Needs a
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

echo   Flat to skeuomorphic, newest to oldest:
echo   1  Swiss Flat 2011    flat colour, tinted knobs
echo   2  Dot Matrix 1983    a backlit monochrome LCD
echo   3  Red Lead 1997      red virtual analogue, LED rings
echo   4  Rhythm Box 1980    drum-machine plastic, coloured step keys
echo   5  Walnut 1971        black panel, walnut cheeks, fluted knobs
echo   6  Test Bench 1958    hammertone enamel, a CRT, chicken-head knobs
echo   7  Arpeggiator        a pattern arpeggiator as a piano roll, in Rhythm Box 1980
choice /c 1234567 /n /m "Which design? [1-7] "
set "DESIGN=swiss-flat-2011"
if errorlevel 2 set "DESIGN=dot-matrix-1983"
if errorlevel 3 set "DESIGN=red-lead-1997"
if errorlevel 4 set "DESIGN=rhythm-box-1980"
if errorlevel 5 set "DESIGN=walnut-1971"
if errorlevel 6 set "DESIGN=test-bench-1958"
if errorlevel 7 set "DESIGN=rhythm-box-1980-roll"

echo.
echo Page ^< ^> walks the pages. Ctrl+C stops.
"%EXE%" preset "%HERE%screen-lab\era-presets\%DESIGN%\Design.ctrl49preset"

echo.
echo (exit code %ERRORLEVEL%)
pause
