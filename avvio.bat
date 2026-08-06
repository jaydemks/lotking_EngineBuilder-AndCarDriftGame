@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if "%PORT%"=="" set "PORT=5700"
if "%PAGE%"=="" set "PAGE=index.html"
set "PYTHON_CMD="

where py >nul 2>nul
if not errorlevel 1 set "PYTHON_CMD=py -3"

if "%PYTHON_CMD%"=="" (
  where python >nul 2>nul
  if not errorlevel 1 set "PYTHON_CMD=python"
)

if "%PYTHON_CMD%"=="" (
  echo.
  echo ERRORE: Python 3 non trovato.
  echo Installa Python 3, poi rilancia questo file.
  echo.
  pause
  exit /b 1
)

rem Local editor: loopback only. Network/LAN access uses serve_lan_windows.bat.
rem Python reuses only a LOT KING server from this exact checkout. If the port
rem belongs to an older/different copy it selects the next free loopback port.
start "Lot King Editor Local Server" /min /D "%~dp0" cmd /c "%PYTHON_CMD% serve_local.py %PORT% --bind 127.0.0.1 --page %PAGE% --open-browser"
exit /b 0
