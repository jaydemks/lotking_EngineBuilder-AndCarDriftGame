@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if "%PORT%"=="" set "PORT=5600"
if "%HOST%"=="" set "HOST=localhost"
if "%BIND%"=="" set "BIND=127.0.0.1"
if "%PAGE%"=="" set "PAGE=engine_editor.html"
set "URL=http://%HOST%:%PORT%/%PAGE%"
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

powershell -NoProfile -Command "if((Test-NetConnection -ComputerName '%HOST%' -Port %PORT% -InformationLevel Quiet)){ exit 1 } else { exit 0 }" >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERRORE: la porta %PORT% e' gia' occupata.
  echo Chiudi il vecchio server oppure rilancia con un'altra porta:
  echo   set PORT=5601
  echo   avvio.bat
  echo.
  pause
  exit /b 1
)

if exist "%~dp0serve_lan.py" (
  start "Lot King Editor Server" /D "%~dp0" cmd /k "%PYTHON_CMD% serve_lan.py --port %PORT% --bind %BIND%"
) else (
  start "Lot King Editor Server" /D "%~dp0" cmd /k "%PYTHON_CMD% -m http.server %PORT% --bind %BIND%"
)

timeout /t 2 /nobreak >nul
start "" "%URL%"
exit /b 0
