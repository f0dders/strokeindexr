@echo off
cd /d "%~dp0"

if not exist venv (
  echo Setting up virtual environment...
  python -m venv venv
)

call venv\Scripts\activate
pip install -q -r requirements.txt

echo.
echo Starting FairwayIQ in DEV mode (auto-reload on)...
echo.
python dev.py
pause
