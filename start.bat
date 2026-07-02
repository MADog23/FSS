@echo off
title Financial Safety - Starting...

echo.
echo  =========================================
echo   Financial Safety Forecasting System
echo  =========================================
echo.

:: ── Check Node is available ──────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js not found. Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: ── Check .env exists ────────────────────────────────────────────────────
if not exist "backend\.env" (
    echo  ERROR: backend\.env not found.
    echo  Copy backend\.env.example to backend\.env and fill in your database details.
    echo.
    pause
    exit /b 1
)

:: ── Start backend ────────────────────────────────────────────────────────
echo  [1/3] Starting backend server...
start "Financial Safety - Backend" cmd /k "cd /d "%~dp0backend" && npm run dev"

:: Give the backend a moment to bind its port before the frontend starts
timeout /t 3 /nobreak >nul

:: ── Start frontend ───────────────────────────────────────────────────────
echo  [2/3] Starting frontend dev server...
start "Financial Safety - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

:: Give Vite a moment to compile before opening the browser
timeout /t 4 /nobreak >nul

:: ── Open browser ─────────────────────────────────────────────────────────
echo  [3/3] Opening browser...
start "" "http://localhost:5173"

echo.
echo  =========================================
echo   All services started.
echo.
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:3001
echo   Health   : http://localhost:3001/health
echo.
echo   Close the two server windows to stop.
echo  =========================================
echo.
pause
