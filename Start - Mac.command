#!/bin/bash
cd "$(dirname "$0")"

# Check Python is installed
if ! command -v python3 &>/dev/null; then
  echo ""
  echo "⛳  StrokeIndexr needs Python 3.10 or later to run."
  echo ""
  echo "   Python was not found on your system."
  echo ""
  echo "   To install it:"
  echo "   1. Go to https://www.python.org/downloads/"
  echo "   2. Download and install the latest version for Mac"
  echo "   3. Double-click Start - Mac.command again"
  echo ""
  sleep 5
  exit 1
fi

# Check Python version is 3.10+
PY_VER=$(python3 -c "import sys; print(sys.version_info.major * 100 + sys.version_info.minor)")
if [ "$PY_VER" -lt 310 ]; then
  echo ""
  echo "⛳  StrokeIndexr requires Python 3.10 or later."
  echo "   You have $(python3 --version). Please update at https://www.python.org/downloads/"
  echo ""
  sleep 5
  exit 1
fi

# Create venv if needed
if [ ! -d "venv" ]; then
  echo ""
  echo "Setting up for the first time — this will take a minute..."
  python3 -m venv venv
fi

source venv/bin/activate

# Install/update dependencies
pip install -q --disable-pip-version-check -r requirements.txt

lsof -ti:5050 | xargs kill -9 2>/dev/null && echo "Stopped existing server on port 5050."

echo ""
echo "⛳  Starting StrokeIndexr..."
echo ""
python3 main.py
