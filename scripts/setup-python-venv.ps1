param(
  [ValidateSet("backend", "desktop", "raspberrypi", "frontend", "all")]
  [string]$Target = "all",
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$localTempRoot = Join-Path $repoRoot ".tmp\\python-setup"

$targets = @{
  backend = @{
    Label = "Backend"
    Path = "backend"
    Requirements = "requirements.txt"
  }
  desktop = @{
    Label = "Desktop"
    Path = "desktop"
    Requirements = "requirements.txt"
  }
  raspberrypi = @{
    Label = "Raspberry Pi"
    Path = "raspberrypi"
    Requirements = "requirements.txt"
  }
  frontend = @{
    Label = "Frontend"
    Path = "frontend"
    PackageLock = "package-lock.json"
  }
}

function Get-PythonCommand {
  if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3.11 --version *> $null
    if ($LASTEXITCODE -eq 0) {
      return "py -3.11"
    }
  }

  if (Get-Command python3.11 -ErrorAction SilentlyContinue) {
    return "python3.11"
  }

  throw "Python 3.11 is required. Install Python 3.11.9 and run this script again."
}

function Get-VenvPythonPath {
  param(
    [string]$ProjectPath
  )

  $windowsPath = Join-Path $ProjectPath ".venv\\Scripts\\python.exe"
  if (Test-Path $windowsPath) {
    return $windowsPath
  }

  $unixPath = Join-Path $ProjectPath ".venv\\bin\\python"
  if (Test-Path $unixPath) {
    return $unixPath
  }

  throw "Virtual environment Python executable was not created for $ProjectPath."
}

function Test-NpmInCmd {
  $cmdPath = Join-Path $env:SystemRoot "System32\\cmd.exe"
  if (-not (Test-Path $cmdPath)) {
    throw "cmd.exe was not found."
  }

  $nodeVersion = (& $cmdPath /d /c "node -p process.versions.node" 2>$null | Select-Object -First 1).Trim()
  if (-not $nodeVersion) {
    throw "Node.js was not found in cmd. Install Node.js 22 and run this script again."
  }

  if (-not $nodeVersion.StartsWith("22.")) {
    throw "Node.js 22 is required. Current version: $nodeVersion"
  }

  & $cmdPath /d /c "npm --version" *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "npm was not found in cmd. Install Node.js 22 and run this script again."
  }

  return $cmdPath
}

function Initialize-Venv {
  param(
    [string]$Key
  )

  $config = $targets[$Key]
  $projectPath = Join-Path $repoRoot $config.Path
  $requirementsPath = Join-Path $projectPath $config.Requirements
  $venvPath = Join-Path $projectPath ".venv"
  $pythonCommand = Get-PythonCommand
  $targetTempPath = Join-Path $localTempRoot $Key

  New-Item -ItemType Directory -Force -Path $targetTempPath | Out-Null

  $originalTemp = $env:TEMP
  $originalTmp = $env:TMP
  $env:TEMP = $targetTempPath
  $env:TMP = $targetTempPath

  Write-Host ""
  Write-Host "[$($config.Label)] $projectPath"

  try {
    if (-not (Test-Path $venvPath)) {
      Write-Host "Creating virtual environment with Python 3.11..."
      Invoke-Expression "& $pythonCommand -m venv --without-pip `"$venvPath`""
    } else {
      Write-Host "Virtual environment already exists."
    }

    $venvPython = Get-VenvPythonPath -ProjectPath $projectPath

    if ($SkipInstall) {
      Write-Host "Skipping package install."
      return
    }

    if (-not (Test-Path $requirementsPath)) {
      Write-Host "No requirements file found. Skipping package install."
      return
    }

    Write-Host "Installing packages from $($config.Requirements)..."
    Invoke-Expression "& $pythonCommand -m pip --python `"$venvPython`" install --upgrade pip"
    Invoke-Expression "& $pythonCommand -m pip --python `"$venvPython`" install -r `"$requirementsPath`""
  } finally {
    $env:TEMP = $originalTemp
    $env:TMP = $originalTmp
  }
}

function Initialize-Frontend {
  $config = $targets["frontend"]
  $projectPath = Join-Path $repoRoot $config.Path
  $lockfilePath = Join-Path $projectPath $config.PackageLock
  $cmdPath = Test-NpmInCmd

  Write-Host ""
  Write-Host "[$($config.Label)] $projectPath"

  if ($SkipInstall) {
    Write-Host "Skipping package install."
    return
  }

  if (Test-Path $lockfilePath) {
    Write-Host "Installing packages with cmd /c npm ci..."
    Push-Location $projectPath
    try {
      & $cmdPath /d /c "npm ci"
    } finally {
      Pop-Location
    }
    return
  }

  Write-Host "Installing packages with cmd /c npm install..."
  Push-Location $projectPath
  try {
    & $cmdPath /d /c "npm install"
  } finally {
    Pop-Location
  }
}

$selectedTargets = if ($Target -eq "all") {
  @("backend", "desktop", "raspberrypi", "frontend")
} else {
  @($Target)
}

foreach ($selectedTarget in $selectedTargets) {
  if ($selectedTarget -eq "frontend") {
    Initialize-Frontend
  } else {
    Initialize-Venv -Key $selectedTarget
  }
}

Write-Host ""
Write-Host "Done."
