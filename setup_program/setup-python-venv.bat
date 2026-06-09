@echo off
setlocal EnableExtensions

set "TARGET="
set "SKIP_INSTALL=0"
set "EXIT_CODE=0"
set "AUTO_PAUSE=0"
if defined CODEX_NO_PAUSE set "AUTO_PAUSE=0"
echo %CMDCMDLINE% | findstr /I /C:" /c " >nul
if not errorlevel 1 if not defined CODEX_NO_PAUSE set "AUTO_PAUSE=1"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="-Target" (
  set "TARGET=%~2"
  shift
  shift
  goto parse_args
)
if /I "%~1"=="-SkipInstall" (
  set "SKIP_INSTALL=1"
  shift
  goto parse_args
)
echo Unknown argument: %~1
set "EXIT_CODE=1"
goto finish

:args_done
if not defined TARGET (
  echo Select a target to set up:
  echo   1. backend
  echo   2. desktop
  echo   3. raspberrypi
  echo   4. frontend
  echo   5. all
  set /p TARGET=Enter target name ^(backend/desktop/raspberrypi/frontend/all^):
  if not defined TARGET set "TARGET=all"
)

set "REPO_ROOT=%~dp0"
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"

if /I "%TARGET%"=="frontend" call :setup_frontend || set "EXIT_CODE=1"
if /I "%TARGET%"=="backend" call :resolve_python || set "EXIT_CODE=1"
if /I "%TARGET%"=="desktop" call :resolve_python || set "EXIT_CODE=1"
if /I "%TARGET%"=="raspberrypi" call :resolve_python || set "EXIT_CODE=1"
if "%EXIT_CODE%"=="1" goto finish
if /I "%TARGET%"=="backend" call :setup_python_target backend Backend || set "EXIT_CODE=1"
if /I "%TARGET%"=="desktop" call :setup_python_target desktop Desktop || set "EXIT_CODE=1"
if /I "%TARGET%"=="raspberrypi" call :setup_python_target raspberrypi Raspberry Pi || set "EXIT_CODE=1"
if /I "%TARGET%"=="all" (
  call :resolve_python || set "EXIT_CODE=1"
  if "%EXIT_CODE%"=="1" goto finish
  call :setup_python_target backend Backend || set "EXIT_CODE=1"
  call :setup_python_target desktop Desktop || set "EXIT_CODE=1"
  call :setup_python_target raspberrypi Raspberry Pi || set "EXIT_CODE=1"
  call :setup_frontend || set "EXIT_CODE=1"
)

if /I not "%TARGET%"=="backend" if /I not "%TARGET%"=="desktop" if /I not "%TARGET%"=="raspberrypi" if /I not "%TARGET%"=="frontend" if /I not "%TARGET%"=="all" (
  echo Invalid target: %TARGET%
  set "EXIT_CODE=1"
  goto finish
)

echo.
if "%EXIT_CODE%"=="0" (
  echo Setup finished successfully.
) else (
  echo Setup finished with errors.
)
goto finish

:resolve_python
py -3.11 --version >nul 2>&1
if not errorlevel 1 (
  set "PYTHON_CMD=py -3.11"
  exit /b 0
)

python3.11 --version >nul 2>&1
if not errorlevel 1 (
  set "PYTHON_CMD=python3.11"
  exit /b 0
)

echo Python 3.11 is required. Install Python 3.11.9 and run this script again.
exit /b 1

:setup_python_target
set "TARGET_KEY=%~1"
set "TARGET_LABEL=%~2"
set "PROJECT_PATH=%REPO_ROOT%\%TARGET_KEY%"
set "VENV_PATH=%PROJECT_PATH%\.venv"
set "VENV_PY=%VENV_PATH%\Scripts\python.exe"
set "REQ_PATH=%PROJECT_PATH%\requirements.txt"
set "TEMP_PATH=%REPO_ROOT%\.tmp\python-setup\%TARGET_KEY%"

if not exist "%TEMP_PATH%" mkdir "%TEMP_PATH%" >nul 2>&1

echo.
echo [%TARGET_LABEL%] %PROJECT_PATH%
if /I "%TARGET_KEY%"=="backend" echo Packages: Python 3.11.9, OpenCV 4.13.0.92
if /I "%TARGET_KEY%"=="desktop" echo Packages: Python 3.11.9, OpenCV 4.13.0.92, Ultralytics 8.4.52
if /I "%TARGET_KEY%"=="raspberrypi" echo Packages: Python 3.11.9 and Raspberry Pi dependencies

set "TEMP=%TEMP_PATH%"
set "TMP=%TEMP_PATH%"

if not exist "%VENV_PY%" (
  echo Creating virtual environment with Python 3.11...
  %PYTHON_CMD% -m venv --without-pip "%VENV_PATH%"
  if errorlevel 1 exit /b 1
) else (
  echo Virtual environment already exists.
)

if "%SKIP_INSTALL%"=="1" (
  echo Skipping package install.
  exit /b 0
)

if not exist "%REQ_PATH%" (
  echo No requirements file found. Skipping package install.
  exit /b 0
)

echo Installing packages from requirements.txt...
%PYTHON_CMD% -m pip --python "%VENV_PY%" install --upgrade pip
if errorlevel 1 exit /b 1
%PYTHON_CMD% -m pip --python "%VENV_PY%" install -r "%REQ_PATH%"
if errorlevel 1 exit /b 1
exit /b 0

:setup_frontend
set "PROJECT_PATH=%REPO_ROOT%\frontend"
set "LOCKFILE_PATH=%PROJECT_PATH%\package-lock.json"
set "NODE_VERSION="
set /p EXPECTED_NODE=<"%REPO_ROOT%\.nvmrc"

echo.
echo [Frontend] %PROJECT_PATH%
echo Packages: Node.js 22.x and frontend npm dependencies

for /f "usebackq delims=" %%V in (`cmd /d /c "node -p process.versions.node" 2^>nul`) do set "NODE_VERSION=%%V"
call :ensure_expected_node
if errorlevel 1 exit /b 1

cmd /d /c "npm --version" >nul 2>&1
if errorlevel 1 (
  echo npm was not found in cmd. Install Node.js 22 and run this script again.
  exit /b 1
)

if "%SKIP_INSTALL%"=="1" (
  echo Skipping package install.
  exit /b 0
)

pushd "%PROJECT_PATH%"
if exist "%LOCKFILE_PATH%" (
  echo Installing packages with cmd /c npm ci...
  cmd /d /c "npm ci"
  if errorlevel 1 (
    echo npm ci failed. package-lock.json may be out of sync.
    echo Retrying with cmd /c npm install...
    cmd /d /c "npm install"
  )
) else (
  echo Installing packages with cmd /c npm install...
  cmd /d /c "npm install"
)
set "NPM_EXIT=%ERRORLEVEL%"
popd

if not "%NPM_EXIT%"=="0" exit /b %NPM_EXIT%
exit /b 0

:ensure_expected_node
if not defined NODE_VERSION (
  echo Node.js was not found in cmd. Trying nvm-windows...
) else if "%NODE_VERSION:~0,3%"=="%EXPECTED_NODE%." (
  echo Node.js %NODE_VERSION% is active.
  exit /b 0
) else (
  echo Current Node.js version is %NODE_VERSION%. Trying nvm use %EXPECTED_NODE%...
)

where nvm >nul 2>&1
if errorlevel 1 (
  if not defined NODE_VERSION (
    echo Node.js %EXPECTED_NODE% was not found and nvm-windows is not available.
  ) else (
    echo Node.js %EXPECTED_NODE% is required. Current version: %NODE_VERSION%
  )
  exit /b 1
)

nvm use %EXPECTED_NODE%
if errorlevel 1 (
  echo Node.js %EXPECTED_NODE% is not installed. Trying nvm install %EXPECTED_NODE%...
  nvm install %EXPECTED_NODE%
  if errorlevel 1 (
    echo Failed to install Node.js %EXPECTED_NODE% with nvm-windows.
    echo Run setup-toolchain.bat or install Node.js %EXPECTED_NODE% manually.
    exit /b 1
  )

  nvm use %EXPECTED_NODE%
  if errorlevel 1 (
    echo Failed to activate Node.js %EXPECTED_NODE% with nvm-windows.
    echo Run setup-toolchain.bat or install Node.js %EXPECTED_NODE% manually.
    exit /b 1
  )
)

set "NODE_VERSION="
for /f "usebackq delims=" %%V in (`cmd /d /c "node -p process.versions.node" 2^>nul`) do set "NODE_VERSION=%%V"
if defined NODE_VERSION if "%NODE_VERSION:~0,3%"=="%EXPECTED_NODE%." (
  echo Node.js %NODE_VERSION% is now active.
  exit /b 0
)

echo Node.js %EXPECTED_NODE% is required. Current version: %NODE_VERSION%
exit /b 1

:finish
if "%AUTO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%
