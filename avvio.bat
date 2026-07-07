@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if "%PORT%"=="" set "PORT=5600"
set "PAGE=index.html"
set "URL=http://127.0.0.1:%PORT%/%PAGE%"
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

start "Lot King Editor Server" /D "%~dp0" cmd /k "%PYTHON_CMD% -m http.server %PORT% --bind 127.0.0.1"

timeout /t 2 /nobreak >nul
start "" "%URL%"
exit /b 0
