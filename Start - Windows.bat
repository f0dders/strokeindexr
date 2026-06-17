@echo off
cd /d "%~dp0"

:: Check Python is installed
python --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo  StrokeIndexr needs Python 3.10 or later to run.
  echo.
  echo  Python was not found on your system.
  echo.
  echo  To install it:
  echo    1. Go to https://www.python.org/downloads/
  echo    2. Download and run the installer for Windows
  echo    3. IMPORTANT: tick "Add Python to PATH" during installation
  echo    4. Double-click Start - Windows.bat again
  echo.
  pause
  exit /b 1
)

:: Check Python version is 3.10+
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PYVER=%%v
for /f "tokens=1,2 delims=." %%a in ("%PYVER%") do (
  set MAJOR=%%a
  set MINOR=%%b
)
if %MAJOR% LSS 3 (
  echo.
  echo  StrokeIndexr requires Python 3.10 or later. You have %PYVER%.
  echo  Please update at https://www.python.org/downloads/
  echo.
  pause
  exit /b 1
)
if %MAJOR% EQU 3 if %MINOR% LSS 10 (
  echo.
  echo  StrokeIndexr requires Python 3.10 or later. You have %PYVER%.
  echo  Please update at https://www.python.org/downloads/
  echo.
  pause
  exit /b 1
)

if not exist venv (
  echo.
  echo Setting up for the first time -- this will take a minute...
  python -m venv venv
)

call venv\Scripts\activate
pip install -q -r requirements.txt

echo.
echo Starting StrokeIndexr...
echo.
python main.py
pause
