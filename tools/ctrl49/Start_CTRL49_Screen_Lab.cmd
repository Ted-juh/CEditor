@echo off
REM Double-click launcher for the CTRL49 screen lab: the showcase of baked-PNG pages, or the
REM stress page that measures what the screen can draw. Connect the CTRL49 and close VIP,
REM your DAW and HoSTage / CEditor first (only one program can own the screen).

setlocal
set "HERE=%~dp0"
set "EXE=%HERE%..\..\build\native\Debug\Ctrl49ScreenLab.exe"
if not exist "%EXE%" set "EXE=%HERE%..\..\build\native\Release\Ctrl49ScreenLab.exe"

if not exist "%EXE%" (
    echo Could not find Ctrl49ScreenLab.exe under build\native\Debug or build\native\Release.
    echo Build it first:  cmake --build build/native --config Debug --target Ctrl49ScreenLab
    echo.
    pause
    exit /b 1
)

echo   1  Showcase   - five pages: faders, pads, sequencer, envelope, meters
echo   2  Stress     - raise the drawing load until the screen stutters
choice /c 12 /n /m "Which one? [1/2] "
if errorlevel 2 (set "MODE=stress") else (set "MODE=showcase")

"%EXE%" %MODE% "%HERE%screen-lab"

echo.
echo (exit code %ERRORLEVEL%)
pause
