@echo off
setlocal EnableExtensions

set "TARGET=%~1"
if not defined TARGET set "TARGET=all"
set "EXIT_CODE=0"
set "AUTO_PAUSE=0"
echo %CMDCMDLINE% | findstr /I /C:" /c " >nul
if not errorlevel 1 set "AUTO_PAUSE=1"

set "REPO_ROOT=%~dp0"
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"
set /p EXPECTED_PYTHON=<"%REPO_ROOT%\.python-version"
set /p EXPECTED_NODE=<"%REPO_ROOT%\.nvmrc"
set "NEED_BACKEND=0"
set "NEED_DESKTOP=0"
set "NEED_RASPBERRYPI=0"
set "NEED_FRONTEND=0"
set "CODEX_NO_PAUSE=1"

if /I "%TARGET%"=="backend" call :prepare_python_target backend Backend || set "EXIT_CODE=1"
if /I "%TARGET%"=="desktop" call :prepare_python_target desktop Desktop || set "EXIT_CODE=1"
if /I "%TARGET%"=="raspberrypi" call :prepare_python_target raspberrypi Raspberry Pi || set "EXIT_CODE=1"
if /I "%TARGET%"=="all" (
  call :prepare_python_target backend Backend || set "EXIT_CODE=1"
  call :prepare_python_target desktop Desktop || set "EXIT_CODE=1"
  call :prepare_python_target raspberrypi Raspberry Pi || set "EXIT_CODE=1"
)
if "%EXIT_CODE%"=="1" goto finish

if /I "%TARGET%"=="frontend" goto rebuild_frontend
if /I "%TARGET%"=="backend" goto rebuild_python
if /I "%TARGET%"=="desktop" goto rebuild_python
if /I "%TARGET%"=="raspberrypi" goto rebuild_python
if /I "%TARGET%"=="all" goto rebuild_all

echo Invalid target: %TARGET%
echo Use one of: backend, desktop, raspberrypi, frontend, all
set "EXIT_CODE=1"
goto finish

:prepare_python_target
set "TARGET_KEY=%~1"
set "TARGET_LABEL=%~2"
set "VENV_PATH=%REPO_ROOT%\%TARGET_KEY%\.venv"
set "VENV_PY=%VENV_PATH%\Scripts\python.exe"

echo.
echo [%TARGET_LABEL%]
if not exist "%VENV_PY%" (
  echo No virtual environment found.
  call set "NEED_%TARGET_KEY%=1"
  exit /b 0
)

call :python_target_is_valid %TARGET_KEY%
if not errorlevel 1 (
  echo Existing environment is valid. Keeping %VENV_PATH%
  exit /b 0
)

echo Existing environment needs rebuild. Removing %VENV_PATH%
rmdir /s /q "%VENV_PATH%"
if exist "%VENV_PATH%" (
  echo Failed to remove %VENV_PATH%
  exit /b 1
)
call set "NEED_%TARGET_KEY%=1"
exit /b 0

:python_target_is_valid
set "CHECK_KEY=%~1"
set "CHECK_VENV_PY=%REPO_ROOT%\%CHECK_KEY%\.venv\Scripts\python.exe"

for /f "delims=" %%V in ('%CHECK_VENV_PY% -c "import sys; print(sys.version.split()[0])"') do set "CURRENT_PYTHON=%%V"
if /I not "%CURRENT_PYTHON%"=="%EXPECTED_PYTHON%" exit /b 1

if /I "%CHECK_KEY%"=="backend" (
  "%CHECK_VENV_PY%" -c "import fastapi, cv2" 1>nul 2>nul
  exit /b %ERRORLEVEL%
)

if /I "%CHECK_KEY%"=="desktop" (
  "%CHECK_VENV_PY%" -c "import cv2, ultralytics, requests" 1>nul 2>nul
  exit /b %ERRORLEVEL%
)

if /I "%CHECK_KEY%"=="raspberrypi" (
  "%CHECK_VENV_PY%" -c "import flask, serial, dotenv" 1>nul 2>nul
  exit /b %ERRORLEVEL%
)

exit /b 1

:rebuild_python
echo.
call set "CURRENT_NEED=%%NEED_%TARGET%%"
if not "%CURRENT_NEED%"=="1" (
  echo %TARGET% environment is already valid. Skipping rebuild.
  set "EXIT_CODE=0"
  goto finish
)
echo Rebuilding %TARGET% environment...
call "%REPO_ROOT%\setup-python-venv.bat" -Target %TARGET%
set "EXIT_CODE=%ERRORLEVEL%"
goto finish

:rebuild_frontend
echo.
echo Checking frontend dependencies...
call :frontend_needs_rebuild
if errorlevel 1 (
  set "NEED_FRONTEND=1"
  pushd "%REPO_ROOT%\frontend"
  if exist "node_modules" (
    echo Removing frontend\node_modules
    rmdir /s /q "node_modules"
  ) else (
    echo No node_modules directory found.
  )
  popd
) else (
  echo Existing frontend dependencies look valid. Keeping node_modules
)
if not "%NEED_FRONTEND%"=="1" (
  echo Frontend environment is already valid. Skipping rebuild.
  set "EXIT_CODE=0"
  goto finish
)
call "%REPO_ROOT%\setup-python-venv.bat" -Target frontend
set "EXIT_CODE=%ERRORLEVEL%"
goto finish

:rebuild_all
echo.
echo Rebuilding all environments...
call :frontend_needs_rebuild
if errorlevel 1 (
  set "NEED_FRONTEND=1"
  pushd "%REPO_ROOT%\frontend"
  if exist "node_modules" (
    echo Removing frontend\node_modules
    rmdir /s /q "node_modules"
  ) else (
    echo No node_modules directory found.
  )
  popd
) else (
  echo [Frontend]
  echo Existing frontend dependencies look valid. Keeping node_modules
)
if "%NEED_BACKEND%"=="1" call "%REPO_ROOT%\setup-python-venv.bat" -Target backend || set "EXIT_CODE=1"
if "%NEED_DESKTOP%"=="1" call "%REPO_ROOT%\setup-python-venv.bat" -Target desktop || set "EXIT_CODE=1"
if "%NEED_RASPBERRYPI%"=="1" call "%REPO_ROOT%\setup-python-venv.bat" -Target raspberrypi || set "EXIT_CODE=1"
if "%NEED_FRONTEND%"=="1" call "%REPO_ROOT%\setup-python-venv.bat" -Target frontend || set "EXIT_CODE=1"
if "%NEED_BACKEND%%NEED_DESKTOP%%NEED_RASPBERRYPI%%NEED_FRONTEND%"=="0000" (
  echo All environments are already valid. Skipping rebuild.
  set "EXIT_CODE=0"
)
goto finish

:frontend_needs_rebuild
set "CURRENT_NODE="
if not exist "%REPO_ROOT%\frontend\node_modules" exit /b 1
for /f "usebackq delims=" %%V in (`cmd /d /c "node -p process.versions.node" 2^>nul`) do set "CURRENT_NODE=%%V"
if defined CURRENT_NODE if "%CURRENT_NODE:~0,3%"=="%EXPECTED_NODE%." exit /b 0
where nvm >nul 2>&1
if errorlevel 1 exit /b 1
nvm use %EXPECTED_NODE% >nul 2>&1
set "CURRENT_NODE="
for /f "usebackq delims=" %%V in (`cmd /d /c "node -p process.versions.node" 2^>nul`) do set "CURRENT_NODE=%%V"
if defined CURRENT_NODE if "%CURRENT_NODE:~0,3%"=="%EXPECTED_NODE%." exit /b 0
exit /b 1

:finish
if "%AUTO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%
