@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "REPO_ROOT=%~dp0"
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"
set "EXIT_CODE=0"
set "AUTO_PAUSE=0"
echo %CMDCMDLINE% | findstr /I /C:" /c " >nul
if not errorlevel 1 set "AUTO_PAUSE=1"

set /p PYTHON_VERSION=<"%REPO_ROOT%\.python-version"
set /p NODE_VERSION=<"%REPO_ROOT%\.nvmrc"

if not defined PYTHON_VERSION (
  echo .python-version was not found or is empty.
  set "EXIT_CODE=1"
  goto finish
)

if not defined NODE_VERSION (
  echo .nvmrc was not found or is empty.
  set "EXIT_CODE=1"
  goto finish
)

call :ensure_python || set "EXIT_CODE=1"
if "%EXIT_CODE%"=="1" goto finish
call :ensure_node || set "EXIT_CODE=1"
if "%EXIT_CODE%"=="1" goto finish

echo.
echo Toolchain is ready.
echo Python target: %PYTHON_VERSION%
echo Node target: %NODE_VERSION%
goto finish

:ensure_python
echo Checking Python %PYTHON_VERSION%...

for /f "usebackq delims=" %%V in (`py -3.11 -c "import sys; print('.'.join(map(str, sys.version_info[:3])))" 2^>nul`) do set "CURRENT_PYTHON=%%V"
if defined CURRENT_PYTHON (
  if /I "%CURRENT_PYTHON%"=="%PYTHON_VERSION%" (
    echo Python %CURRENT_PYTHON% is already active through py launcher.
    exit /b 0
  )
  echo Python 3.11 is installed, but exact version is %CURRENT_PYTHON%.
)

where winget >nul 2>&1
if errorlevel 1 (
  echo winget was not found. Install Python %PYTHON_VERSION% manually and run again.
  exit /b 1
)

echo Installing Python %PYTHON_VERSION% with winget...
winget install --exact --id Python.Python.3.11 --version %PYTHON_VERSION% --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo Failed to install Python %PYTHON_VERSION% automatically.
  exit /b 1
)

for /f "usebackq delims=" %%V in (`py -3.11 -c "import sys; print('.'.join(map(str, sys.version_info[:3])))" 2^>nul`) do set "CURRENT_PYTHON=%%V"
if /I "%CURRENT_PYTHON%"=="%PYTHON_VERSION%" (
  echo Python %CURRENT_PYTHON% is ready.
  exit /b 0
)

echo Python installation finished, but the current shell does not see %PYTHON_VERSION% yet.
echo Open a new cmd window and run this script again.
exit /b 1

:ensure_node
echo.
echo Checking Node.js %NODE_VERSION%...

for /f "usebackq delims=" %%V in (`cmd /d /c "node -p process.versions.node" 2^>nul`) do set "CURRENT_NODE=%%V"
if defined CURRENT_NODE (
  if /I "!CURRENT_NODE:~0,3!"=="%NODE_VERSION%." (
    echo Node.js !CURRENT_NODE! is already active.
    exit /b 0
  )
  echo Current Node.js version is !CURRENT_NODE!.
)

where nvm >nul 2>&1
if not errorlevel 1 (
  call :install_node_with_nvm
  exit /b %ERRORLEVEL%
)

where winget >nul 2>&1
if errorlevel 1 (
  echo nvm-windows was not found. Install Node.js %NODE_VERSION% manually or install nvm-windows and run again.
  exit /b 1
)

echo Installing nvm-windows with winget...
winget install --exact --id CoreyButler.NVMforWindows --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo Failed to install nvm-windows automatically.
  exit /b 1
)

echo nvm-windows was installed. Open a new cmd window and run this script again.
exit /b 1

:install_node_with_nvm
echo Installing and activating Node.js %NODE_VERSION% with nvm-windows...
nvm install %NODE_VERSION%
if errorlevel 1 exit /b 1
nvm use %NODE_VERSION%
if errorlevel 1 exit /b 1

for /f "usebackq delims=" %%V in (`cmd /d /c "node -p process.versions.node" 2^>nul`) do set "CURRENT_NODE=%%V"
if /I "!CURRENT_NODE:~0,3!"=="%NODE_VERSION%." (
  echo Node.js !CURRENT_NODE! is ready.
  exit /b 0
)

echo Node.js installation finished, but the current shell does not see version %NODE_VERSION% yet.
echo Open a new cmd window and run this script again.
exit /b 1

:finish
if "%AUTO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%
