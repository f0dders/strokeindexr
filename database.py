"""SQLite database layer for FairwayIQ."""

import json
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "golf.db")
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "data", "config.json")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS rounds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hole19_url TEXT UNIQUE,
                hole19_id TEXT UNIQUE,
                imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                date TEXT,
                course TEXT,
                holes INTEGER,
                duration TEXT,
                distance_miles REAL,

                par INTEGER,
                score INTEGER,
                score_vs_par INTEGER,
                putts INTEGER,
                handicap REAL,

                fairway_hit_pct REAL,
                fairway_missed_pct REAL,
                fairway_other_pct REAL,

                gir_hit_pct REAL,
                gir_missed_pct REAL,

                par3_avg REAL,
                par4_avg REAL,
                par5_avg REAL,
                overall_avg REAL,

                up_and_down_pct REAL,
                scrambling_pct REAL,
                sand_saves_pct REAL,

                eagles_pct REAL,
                birdies_pct REAL,
                pars_pct REAL,
                bogeys_pct REAL,
                doubles_plus_pct REAL,

                best_hole INTEGER,
                notes TEXT,
                ai_debrief TEXT
            )
        """)
        # Migrate: add ai_debrief column to existing DBs that predate it
        try:
            conn.execute("ALTER TABLE rounds ADD COLUMN ai_debrief TEXT")
        except Exception:
            pass
        conn.commit()


def insert_round(data: dict) -> int:
    cols = ", ".join(data.keys())
    placeholders = ", ".join("?" * len(data))
    with get_conn() as conn:
        cur = conn.execute(
            f"INSERT OR IGNORE INTO rounds ({cols}) VALUES ({placeholders})",
            list(data.values()),
        )
        conn.commit()
        return cur.lastrowid


def get_rounds(limit: int = 100, offset: int = 0) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM rounds ORDER BY date DESC, imported_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return [dict(r) for r in rows]


def get_round(round_id: int) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM rounds WHERE id = ?", (round_id,)).fetchone()
        return dict(row) if row else None


def delete_round(round_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM rounds WHERE id = ?", (round_id,))
        conn.commit()


def update_notes(round_id: int, notes: str):
    with get_conn() as conn:
        conn.execute("UPDATE rounds SET notes = ? WHERE id = ?", (notes, round_id))
        conn.commit()


def save_debrief(round_id: int, text: str):
    with get_conn() as conn:
        conn.execute("UPDATE rounds SET ai_debrief = ? WHERE id = ?", (text, round_id))
        conn.commit()


# ── Config (API keys, AI settings) ───────────────────────────────────────────

def load_config() -> dict:
    if not os.path.exists(CONFIG_PATH):
        return {}
    try:
        with open(CONFIG_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(config: dict):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)


def get_stats_summary() -> dict:
    with get_conn() as conn:
        row = conn.execute("""
            SELECT
                COUNT(*) as total_rounds,
                MIN(handicap) as best_handicap,
                AVG(score_vs_par) as avg_score_vs_par,
                AVG(putts) as avg_putts,
                AVG(gir_hit_pct) as avg_gir,
                AVG(fairway_hit_pct) as avg_fir,
                AVG(up_and_down_pct) as avg_up_and_down,
                MIN(score_vs_par) as best_score_vs_par
            FROM rounds
        """).fetchone()
        return dict(row) if row else {}


def get_trend_data() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT date, course, holes, score_vs_par, handicap, putts,
                   gir_hit_pct, fairway_hit_pct, pars_pct, bogeys_pct,
                   doubles_plus_pct, birdies_pct
            FROM rounds
            ORDER BY date ASC, imported_at ASC
        """).fetchall()
        return [dict(r) for r in rows]
