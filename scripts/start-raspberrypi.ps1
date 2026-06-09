$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\\raspberrypi")

if (Test-Path ".\\.venv\\Scripts\\python.exe") {
  .\\.venv\\Scripts\\python.exe .\\main.py
} elseif (Test-Path ".\\.venv\\bin\\python") {
  .\\.venv\\bin\\python .\\main.py
} else {
  py .\\main.py
}
