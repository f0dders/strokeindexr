@echo off
cd /d "%~dp0"

git --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo  This update script requires Git. If you downloaded a ZIP, update by
  echo  downloading the latest release from:
  echo  https://github.com/f0dders/strokeindexr/releases/latest
  echo.
  pause
  exit /b 1
)

if not exist ".git" (
  echo.
  echo  This folder wasn't cloned from GitHub -- it looks like a ZIP download.
  echo  To update, download the latest release from:
  echo  https://github.com/f0dders/strokeindexr/releases/latest
  echo.
  echo  Your data folder (data\) will not be affected.
  echo.
  pause
  exit /b 0
)

echo.
echo  Updating StrokeIndexr...
echo.
git pull origin main

call venv\Scripts\activate 2>nul
pip install -q --disable-pip-version-check -r requirements.txt

echo.
echo  Update complete. Restart the app to use the new version.
echo.
pause
