@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "PROJECT_PATH=%SCRIPT_DIR%..\frontend"
set "REPO_ROOT=%SCRIPT_DIR%.."
set /p EXPECTED_NODE=<"%REPO_ROOT%\.nvmrc"
set "EXIT_CODE=0"
set "AUTO_PAUSE=0"
echo %CMDCMDLINE% | findstr /I /C:" /c " >nul
if not errorlevel 1 set "AUTO_PAUSE=1"

call :ensure_expected_node || set "EXIT_CODE=1"
if "%EXIT_CODE%"=="1" goto finish

pushd "%PROJECT_PATH%"
if not exist "node_modules" (
  if exist "package-lock.json" (
    echo node_modules not found. Trying cmd /c npm ci...
    cmd /d /c "npm ci"
    if errorlevel 1 (
      echo npm ci failed. package-lock.json may be out of sync.
      echo Retrying with cmd /c npm install...
      cmd /d /c "npm install"
      if errorlevel 1 (
        set "EXIT_CODE=%ERRORLEVEL%"
        popd
        goto finish
      )
    )
  ) else (
    echo node_modules not found. Running cmd /c npm install...
    cmd /d /c "npm install"
    if errorlevel 1 (
      set "EXIT_CODE=%ERRORLEVEL%"
      popd
      goto finish
    )
  )
)
cmd /d /c "npm run dev"
set "EXIT_CODE=%ERRORLEVEL%"
popd

:finish
if "%AUTO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%

:ensure_expected_node
set "NODE_VERSION="
for /f "usebackq delims=" %%V in (`cmd /d /c "node -p process.versions.node" 2^>nul`) do set "NODE_VERSION=%%V"
if defined NODE_VERSION if "%NODE_VERSION:~0,3%"=="%EXPECTED_NODE%." (
  echo Node.js %NODE_VERSION% is active.
  exit /b 0
)

where nvm >nul 2>&1
if errorlevel 1 (
  if defined NODE_VERSION (
    echo Node.js %EXPECTED_NODE% is required. Current version: %NODE_VERSION%
  ) else (
    echo Node.js %EXPECTED_NODE% was not found and nvm-windows is not available.
  )
  exit /b 1
)

if defined NODE_VERSION (
  echo Current Node.js version is %NODE_VERSION%. Trying nvm use %EXPECTED_NODE%...
) else (
  echo Trying nvm use %EXPECTED_NODE%...
)

nvm use %EXPECTED_NODE%
if errorlevel 1 (
  echo Node.js %EXPECTED_NODE% is not installed. Trying nvm install %EXPECTED_NODE%...
  nvm install %EXPECTED_NODE%
  if errorlevel 1 (
    echo Failed to install Node.js %EXPECTED_NODE% with nvm-windows.
    exit /b 1
  )

  nvm use %EXPECTED_NODE%
  if errorlevel 1 (
    echo Failed to activate Node.js %EXPECTED_NODE% with nvm-windows.
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
