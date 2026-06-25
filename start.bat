@echo off
cd /d "%~dp0"

echo Cleaning up old instances on ports 4000 / 3000...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 4000,3000 -ErrorAction SilentlyContinue | Select-Object -Expand OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo Starting Abyss Backend...
start "Abyss Backend" cmd /k "cd /d "%~dp0ai-radio\server" && node index.mjs"

echo Starting Abyss Frontend...
start "Abyss Frontend" cmd /k "cd /d "%~dp0ai-radio-v1" && node node_modules\vite\bin\vite.js"

echo.
echo Both services started.
echo Backend:  http://localhost:4000
echo Frontend: http://localhost:3000
