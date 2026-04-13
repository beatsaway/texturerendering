@echo off
setlocal
cd /d "%~dp0"

echo Stopping anything listening on port 3000...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if ($c) { $c | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host ('  Killed PID ' + $_.OwningProcess) } } else { Write-Host '  (nothing on 3000)' }"

timeout /t 1 /nobreak >nul
echo.
echo Serving this folder at http://localhost:3000
echo Press Ctrl+C to stop the server.
echo.
start "" "http://localhost:3000"
npx --yes serve -l 3000 .

endlocal
