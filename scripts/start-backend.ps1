$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\\backend")

if (Test-Path ".\\.venv\\Scripts\\python.exe") {
  .\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
} elseif (Test-Path ".\\.venv\\bin\\python") {
  .\\.venv\\bin\\python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
} else {
  py -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
}
