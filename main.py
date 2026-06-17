"""Entry point for StrokeIndexr."""

import webbrowser
import threading
import time
from database import init_db
from server import app, _fetch_latest_version
from version import __version__

PORT = 5050

def open_browser():
    time.sleep(1.2)
    webbrowser.open(f"http://127.0.0.1:{PORT}")

if __name__ == "__main__":
    init_db()
    print(f"\n⛳  StrokeIndexr {__version__} starting at http://127.0.0.1:{PORT}\n")
    threading.Thread(target=open_browser, daemon=True).start()
    threading.Thread(target=_fetch_latest_version, daemon=True).start()
    app.run(host="127.0.0.1", port=PORT, debug=False)
