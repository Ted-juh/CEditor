@echo off
setlocal
cd /d "%~dp0"

REM Started by double-click rather than typed in a shell? Then pause on exit so
REM the error is readable before the window closes.
set "INTERACTIVE=0"
echo %cmdcmdline% | findstr /i /c:"%~nx0" >nul 2>&1 && set "INTERACTIVE=1"

REM The whole session is recorded to build-installer.log via a transcript, which
REM copies the console without touching the streams — build tools write warnings
REM to stderr, and rewiring stderr (Tee-Object + strict mode) turned the first
REM harmless warning into a fatal error. The transcript just watches.
powershell -ExecutionPolicy Bypass -Command "Start-Transcript -Path '.\build-installer.log' -Force | Out-Null; $ec = 0; try { & '.\tools\scripts\package-installer.ps1'; if ($LASTEXITCODE) { $ec = $LASTEXITCODE } } catch { Write-Host $_; $ec = 1 } finally { Stop-Transcript | Out-Null }; exit $ec"
set "EC=%errorlevel%"

if not "%EC%"=="0" (
    echo.
    echo *** Installer build failed. Full output: %~dp0build-installer.log ***
    if "%INTERACTIVE%"=="1" pause
)
exit /b %EC%
