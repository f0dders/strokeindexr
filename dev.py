"""Development entry point — auto-reloads on Python file changes."""

from database import init_db
from server import app

if __name__ == "__main__":
    init_db()
    print("\n⛳  FairwayIQ DEV MODE — auto-reload enabled\n")
    app.run(host="127.0.0.1", port=5050, debug=True, use_reloader=True)
