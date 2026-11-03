@echo off
title FormFilla Builder & Packer
echo ============================================
echo       FormFilla Builder and Packer         
echo ============================================
echo.

echo [1/2] Running build and package script...
call npm run pack

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo --------------------------------------------
    echo ERROR: Build or packaging failed!
    echo --------------------------------------------
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ============================================
echo SUCCESS: FormFilla built and packed!
echo Package is ready: formfilla-store.zip
echo ============================================
echo.
pause
