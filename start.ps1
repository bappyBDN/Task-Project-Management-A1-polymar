# Starts both the backend (uvicorn) and frontend (vite) in separate windows.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

Write-Host "Starting backend (uvicorn)..." -ForegroundColor Cyan
Start-Process -FilePath "powershell" -ArgumentList "-NoExit","-Command","cd '$backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload" -WorkingDirectory $backend

Write-Host "Starting frontend (vite)..." -ForegroundColor Cyan
Start-Process -FilePath "powershell" -ArgumentList "-NoExit","-Command","cd '$frontend'; npm run dev" -WorkingDirectory $frontend

Write-Host "Both servers starting. Open http://localhost:5173" -ForegroundColor Green
