@echo off
setlocal
cd /d "%~dp0"

REM Started by double-click rather than typed in a shell? Then pause on exit so
REM the error is readable before the window closes.
set "INTERACTIVE=0"
echo %cmdcmdline% | findstr /i /c:"%~nx0" >nul 2>&1 && set "INTERACTIVE=1"

REM Everything the packaging script prints — including a failure — is mirrored
REM to build-installer.log so the output survives the window.
powershell -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; try { & '.\tools\scripts\package-installer.ps1' *>&1 | Tee-Object -FilePath '.\build-installer.log' } catch { $_ | Tee-Object -FilePath '.\build-installer.log' -Append; exit 1 }"
set "EC=%errorlevel%"

if not "%EC%"=="0" (
    echo.
    echo *** Installer build failed. Full output: %~dp0build-installer.log ***
    if "%INTERACTIVE%"=="1" pause
)
exit /b %EC%
