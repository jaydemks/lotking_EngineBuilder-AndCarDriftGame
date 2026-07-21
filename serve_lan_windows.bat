@echo off
setlocal

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8000"

cd /d "%~dp0"

echo Starting Lot King LAN server for Windows...
echo If port %PORT% is reserved or occupied, the server will choose the next available port.
echo.

py -3 serve_lan.py --port %PORT% --bind 0.0.0.0
if errorlevel 1 (
  python serve_lan.py --port %PORT% --bind 0.0.0.0
)

pause
