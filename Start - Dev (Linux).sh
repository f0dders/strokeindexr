#!/bin/bash
cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
  echo "Setting up virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt

echo ""
echo "⛳  Starting FairwayIQ in DEV mode (auto-reload on)..."
echo ""
python3 dev.py
