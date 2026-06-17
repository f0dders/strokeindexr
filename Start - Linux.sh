#!/bin/bash
cd "$(dirname "$0")"

# Check Python is installed
if ! command -v python3 &>/dev/null; then
  echo ""
  echo "⛳  StrokeIndexr needs Python 3.10 or later to run."
  echo ""
  echo "   Python was not found on your system."
  echo "   Install it with your package manager, for example:"
  echo ""
  echo "   Ubuntu/Debian:  sudo apt install python3 python3-pip python3-venv"
  echo "   Fedora:         sudo dnf install python3"
  echo "   Arch:           sudo pacman -S python"
  echo ""
  echo "   Then run this script again."
  echo ""
  exit 1
fi

# Check Python version is 3.10+
PY_VER=$(python3 -c "import sys; print(sys.version_info.major * 100 + sys.version_info.minor)")
if [ "$PY_VER" -lt 310 ]; then
  echo ""
  echo "⛳  StrokeIndexr requires Python 3.10 or later."
  echo "   You have $(python3 --version). Please update and try again."
  echo ""
  exit 1
fi

# Create venv if needed
if [ ! -d "venv" ]; then
  echo ""
  echo "Setting up for the first time — this will take a minute..."
  python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt

echo ""
echo "⛳  Starting StrokeIndexr..."
echo ""
python3 main.py
