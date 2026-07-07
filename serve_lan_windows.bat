@echo off
setlocal

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8000"

cd /d "%~dp0"

echo Lot King LAN server for Windows
echo Root: %CD%
echo Bind: 0.0.0.0:%PORT%
echo.
echo Open from this computer:
echo   http://127.0.0.1:%PORT%/
echo   http://127.0.0.1:%PORT%/gameplay.html
echo   http://127.0.0.1:%PORT%/engine_editor.html
echo.
echo Open from phone/tablet on the same Wi-Fi:
powershell -NoProfile -Command "$port=$env:PORT; Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.AddressState -eq 'Preferred' -and $_.InterfaceAlias -notlike '*WSL*' -and $_.InterfaceAlias -notlike '*vEthernet*' -and $_.InterfaceAlias -notlike '*Loopback*' } | Sort-Object InterfaceAlias,IPAddress | ForEach-Object { '  http://' + $_.IPAddress + ':' + $port + '/'; '  http://' + $_.IPAddress + ':' + $port + '/gameplay.html'; '  http://' + $_.IPAddress + ':' + $port + '/engine_editor.html' }"
echo.
echo If the phone cannot connect, allow Python through Windows Firewall.
echo Press Ctrl+C to stop.
echo.

py -3 serve_lan.py --port %PORT% --bind 0.0.0.0
if errorlevel 1 (
  python serve_lan.py --port %PORT% --bind 0.0.0.0
)

pause
