@echo off
setlocal
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\tools\scripts\package-installer.ps1" -StageOnly
exit /b %errorlevel%
