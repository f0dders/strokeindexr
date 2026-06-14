#!/bin/bash
cd "$(dirname "$0")"

# Create venv if needed
if [ ! -d "venv" ]; then
  echo "Setting up virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate

# Install/update dependencies
pip install -q -r requirements.txt

lsof -ti:5050 | xargs kill -9 2>/dev/null && echo "Stopped existing server on port 5050."

echo ""
echo "⛳  Starting FairwayIQ..."
echo ""
python3 main.py
