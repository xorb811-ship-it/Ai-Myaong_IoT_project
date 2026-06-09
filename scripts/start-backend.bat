@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "PROJECT_PATH=%SCRIPT_DIR%..\backend"
set "EXIT_CODE=0"
set "AUTO_PAUSE=0"
echo %CMDCMDLINE% | findstr /I /C:" /c " >nul
if not errorlevel 1 set "AUTO_PAUSE=1"

pushd "%PROJECT_PATH%"
set "PYTHONPATH=%SCRIPT_DIR%.."

if exist ".venv\Scripts\python.exe" (
  .venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  goto finish
)

if exist ".venv\bin\python" (
  .venv\bin\python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  goto finish
)

py -3.11 --version >nul 2>&1
if not errorlevel 1 (
  py -3.11 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  goto finish
)

python3.11 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
set "EXIT_CODE=%ERRORLEVEL%"
popd
goto finish

:finish
if "%AUTO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%
