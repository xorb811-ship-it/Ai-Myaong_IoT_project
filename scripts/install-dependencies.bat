@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%.."
set "EXIT_CODE=0"
set "AUTO_PAUSE=0"

echo %CMDCMDLINE% | findstr /I /C:" /c " >nul
if not errorlevel 1 set "AUTO_PAUSE=1"

call :install_node "%REPO_ROOT%" "Root"
if errorlevel 1 set "EXIT_CODE=1"

call :install_node "%REPO_ROOT%\frontend" "Frontend"
if errorlevel 1 set "EXIT_CODE=1"

call :install_python "backend" "Backend"
if errorlevel 1 set "EXIT_CODE=1"

call :install_python "desktop" "Desktop"
if errorlevel 1 set "EXIT_CODE=1"

call :install_python "raspberrypi" "Raspberry Pi"
if errorlevel 1 set "EXIT_CODE=1"

if "%EXIT_CODE%"=="0" (
  echo.
  echo Dependency install finished successfully.
) else (
  echo.
  echo Dependency install finished with errors.
)

if "%AUTO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%

:install_node
set "PROJECT_PATH=%~1"
set "PROJECT_LABEL=%~2"

echo.
echo [%PROJECT_LABEL% npm]
if not exist "%PROJECT_PATH%\package.json" (
  echo package.json not found. Skipping.
  exit /b 0
)

pushd "%PROJECT_PATH%"
if exist "package-lock.json" (
  echo Running npm ci...
  call npm.cmd ci
  if errorlevel 1 (
    echo npm ci failed. Retrying with npm install...
    call npm.cmd install
  )
) else (
  echo Running npm install...
  call npm.cmd install
)
set "NODE_EXIT=%ERRORLEVEL%"
popd
exit /b %NODE_EXIT%

:install_python
set "TARGET_KEY=%~1"
set "TARGET_LABEL=%~2"
set "PROJECT_PATH=%REPO_ROOT%\%TARGET_KEY%"
set "VENV_PATH=%PROJECT_PATH%\.venv"
set "VENV_PY=%VENV_PATH%\Scripts\python.exe"
set "REQ_PATH=%PROJECT_PATH%\requirements.txt"

echo.
echo [%TARGET_LABEL% Python]
if not exist "%REQ_PATH%" (
  echo requirements.txt not found. Skipping.
  exit /b 0
)

if not exist "%VENV_PY%" (
  call :create_venv "%VENV_PATH%"
  if errorlevel 1 exit /b 1
)

call "%VENV_PY%" -m pip install --upgrade pip
if errorlevel 1 exit /b %ERRORLEVEL%

call "%VENV_PY%" -m pip install -r "%REQ_PATH%"
exit /b %ERRORLEVEL%

:create_venv
set "TARGET_VENV=%~1"
echo Creating virtual environment: %TARGET_VENV%

py -3.11 -m venv "%TARGET_VENV%" 2>nul
if not errorlevel 1 exit /b 0

python -m venv "%TARGET_VENV%" 2>nul
if not errorlevel 1 exit /b 0

python3 -m venv "%TARGET_VENV%" 2>nul
if not errorlevel 1 exit /b 0

echo Python 3.11 or compatible Python was not found.
exit /b 1
