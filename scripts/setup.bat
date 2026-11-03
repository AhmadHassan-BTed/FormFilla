@echo off
title FormFilla - Local Setup Bootstrapper
echo ===================================================
echo.
echo FormFilla Extension - Development Environment Setup
echo ===================================================
echo.
echo Checking Node.js installation...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js v18 or higher.
    pause
    exit /b 1
)
echo Node.js found: 
node --version
echo.
echo Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install failed. Check the output above.
    pause
    exit /b 1
)
echo.
echo Building extension...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build failed. Check the output above.
    pause
    exit /b 1
)
echo.
echo Build complete!
echo.
echo To load FormFilla into Chrome:
echo 1. Open Google Chrome and go to chrome://extensions/
echo 2. Enable Developer mode (toggle in top-right corner)
echo 3. Click "Load unpacked"
echo 4. Select the "dist" folder inside this directory
echo.
pause