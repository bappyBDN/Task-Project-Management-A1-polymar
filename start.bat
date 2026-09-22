@echo off
REM Starts both the backend and frontend in separate windows.
cd /d "%~dp0"

echo Starting backend (uvicorn)...
start "Anwar Backend" powershell -NoExit -Command "cd '%cd%\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload"

echo Starting frontend (vite)...
start "Anwar Frontend" powershell -NoExit -Command "cd '%cd%\frontend'; npm run dev"

echo.
echo Both servers starting. Open http://localhost:5173
pause
