@echo off
REM Double-click launcher for the CTRL49 filmstrip-knob beauty test.
REM Passes the Lua page + filmstrip (next to this script) with absolute paths and pauses
REM on exit so any message stays visible. Connect the CTRL49 and close VIP / your DAW first.

setlocal
set "HERE=%~dp0"
set "EXE=%HERE%..\..\build\native\Debug\Ctrl49KnobTest.exe"

if not exist "%EXE%" (
    echo Could not find Ctrl49KnobTest.exe at:
    echo   %EXE%
    echo Build it first:  cmake --build build/native --config Debug --target Ctrl49KnobTest
    echo.
    pause
    exit /b 1
)

"%EXE%" "%HERE%CEditor_Knob_Test.lua" "%HERE%knob_strip.png"

echo.
echo (exit code %ERRORLEVEL%)
pause
