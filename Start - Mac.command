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

echo ""
echo "⛳  Starting FairwayIQ..."
echo ""
python3 main.py
