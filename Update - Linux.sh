#!/bin/bash
cd "$(dirname "$0")"

if ! command -v git &>/dev/null; then
  echo ""
  echo "This update script requires Git. If you downloaded a ZIP, update by"
  echo "downloading the latest release from:"
  echo "https://github.com/f0dders/strokeindexr/releases/latest"
  echo ""
  exit 1
fi

if [ ! -d ".git" ]; then
  echo ""
  echo "This folder wasn't cloned from GitHub — it looks like a ZIP download."
  echo "To update, download the latest release from:"
  echo "https://github.com/f0dders/strokeindexr/releases/latest"
  echo ""
  echo "Your data folder (data/) will not be affected."
  echo ""
  exit 0
fi

echo ""
echo "⛳  Updating StrokeIndexr..."
echo ""
git pull origin main

source venv/bin/activate 2>/dev/null || true
pip install -q -r requirements.txt

echo ""
echo "✓ Update complete. Restart the app to use the new version."
echo ""
