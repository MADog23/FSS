@echo off
title Financial Safety - Updating...

echo.
echo  =========================================
echo   Financial Safety - Update Tool
echo  =========================================
echo.

:: ── Locate the zip ───────────────────────────────────────────────────────
:: Looks for any financial-safety-v*.zip in the same folder as this script,
:: or in the current user's Downloads folder. Uses the most recently modified
:: one if multiple are found.

set "ZIP_PATH="

:: Check same folder as this script first
for /f "delims=" %%f in ('dir /b /o-d "%~dp0financial-safety-v*.zip" 2^>nul') do (
    if not defined ZIP_PATH set "ZIP_PATH=%~dp0%%f"
)

:: Fall back to Downloads folder
if not defined ZIP_PATH (
    for /f "delims=" %%f in ('dir /b /o-d "%USERPROFILE%\Downloads\financial-safety-v*.zip" 2^>nul') do (
        if not defined ZIP_PATH set "ZIP_PATH=%USERPROFILE%\Downloads\%%f"
    )
)

if not defined ZIP_PATH (
    echo  ERROR: No update zip found.
    echo.
    echo  Place the financial-safety-v*.zip file in one of these locations:
    echo    - Same folder as this script: %~dp0
    echo    - Your Downloads folder:      %USERPROFILE%\Downloads\
    echo.
    pause
    exit /b 1
)

echo  Found update file: %ZIP_PATH%
echo.

:: ── Confirm before proceeding ────────────────────────────────────────────
set /p CONFIRM= Proceed with update? This will overwrite app files (your .env is safe). [Y/N]: 
if /i not "%CONFIRM%"=="Y" (
    echo  Update cancelled.
    pause
    exit /b 0
)
echo.

:: ── Stop any running servers ─────────────────────────────────────────────
echo  [1/5] Stopping any running server windows...
taskkill /fi "WindowTitle eq Financial Safety - Backend*" /f >nul 2>&1
taskkill /fi "WindowTitle eq Financial Safety - Frontend*" /f >nul 2>&1
timeout /t 1 /nobreak >nul

:: ── Back up .env ─────────────────────────────────────────────────────────
echo  [2/5] Backing up .env...
if exist "backend\.env" (
    copy /y "backend\.env" "backend\.env.backup" >nul
    echo        Saved to backend\.env.backup
)

:: ── Extract zip over existing files ──────────────────────────────────────
echo  [3/5] Extracting update...

:: PowerShell's Expand-Archive is available on Windows 10+ without extra installs
powershell -NoProfile -Command ^
  "Expand-Archive -Path '%ZIP_PATH%' -DestinationPath '%~dp0' -Force" ^
  2>&1

if errorlevel 1 (
    echo.
    echo  ERROR: Extraction failed. Your files have not been changed.
    echo  Restoring .env backup...
    if exist "backend\.env.backup" copy /y "backend\.env.backup" "backend\.env" >nul
    pause
    exit /b 1
)

:: ── Restore .env (in case zip overwrote it) ───────────────────────────────
if exist "backend\.env.backup" (
    copy /y "backend\.env.backup" "backend\.env" >nul
    echo        .env restored from backup
)

:: ── Reinstall dependencies ────────────────────────────────────────────────
echo  [4/5] Installing dependencies...
echo        Backend...
cd /d "%~dp0backend" && npm install --silent
echo        Frontend...
cd /d "%~dp0frontend" && npm install --silent
cd /d "%~dp0"

:: ── Remind about migrations ───────────────────────────────────────────────
echo.
echo  [5/5] Done.
echo.
echo  =========================================
echo   Update complete.
echo.
echo   IMPORTANT - check release notes:
echo   If this update includes a database
echo   migration, run it in pgAdmin now:
echo.
echo     backend\src\db\migrations\
echo.
echo   Then run start.bat to launch the app.
echo  =========================================
echo.
pause
