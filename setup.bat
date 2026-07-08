@echo off
title Hired - Local Setup Bootstrapper
echo ===================================================
echo Hired Extension - Development Environment Setup
echo ===================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js from https://nodejs.org/ first.
    echo.
    pause
    exit /b 1
)

echo [1/3] Installing NPM packages...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install NPM dependencies.
    echo.
    pause
    exit /b 1
)
echo.

echo [2/3] Checking environment configurations...
if not exist .env (
    echo Copying .env.example to .env...
    copy .env.example .env >nul
) else (
    echo .env configuration file already exists.
)
echo.

echo [3/3] Compiling extension files...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build compilation failed.
    echo.
    pause
    exit /b 1
)
echo.

echo ===================================================
echo Setup Completed Successfully!
echo ===================================================
echo.
echo To load Hired into Chrome:
echo 1. Open Google Chrome and go to chrome://extensions/
echo 2. Enable "Developer mode" in the top-right corner.
echo 3. Click "Load unpacked" and select the folder:
echo    %~dp0dist
echo.
pause
