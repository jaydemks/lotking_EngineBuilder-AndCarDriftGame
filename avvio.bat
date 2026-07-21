@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if "%PORT%"=="" set "PORT=5700"
set "REQUESTED_PORT=%PORT%"
if "%HOST%"=="" set "HOST=localhost"
if "%BIND%"=="" set "BIND=127.0.0.1"
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

set "PORT="
for /f "usebackq tokens=1,2 delims==" %%P in (`powershell -NoProfile -Command "$start=[int]$env:REQUESTED_PORT; $last=[Math]::Min(65535,$start+200); $ip=[Net.IPAddress]::Parse($env:BIND); foreach($candidate in ($start..$last)){ $listener=$null; try { $listener=[Net.Sockets.TcpListener]::new($ip,$candidate); $listener.Start(); $listener.Stop(); Write-Output ('LOTKING_PORT='+$candidate); break } catch { if($listener){ try { $listener.Stop() } catch {} } } }"`) do if /i "%%P"=="LOTKING_PORT" if not defined PORT set "PORT=%%Q"
if not defined PORT (
  echo.
  echo ERRORE: Windows non consente di aprire la porta %REQUESTED_PORT% o le 200 porte successive.
  echo Controlla firewall, antivirus e porte riservate di Windows.
  echo.
  pause
  exit /b 1
)

if not "%PORT%"=="%REQUESTED_PORT%" echo Porta %REQUESTED_PORT% non disponibile: uso automaticamente la porta %PORT%.

set "URL=http://%HOST%:%PORT%/%PAGE%"

start "Lot King Editor Local Server" /D "%~dp0" cmd /k "%PYTHON_CMD% serve_local.py %PORT% --bind %BIND%"

timeout /t 2 /nobreak >nul
start "" "%URL%"
exit /b 0
