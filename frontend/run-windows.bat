@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if not exist "node_modules" (
  if exist "package-lock.json" (
    npm ci || npm install
  ) else (
    npm install
  )
)

npm run dev
