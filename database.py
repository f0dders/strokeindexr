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
                ai_debrief TEXT,
                holes_json TEXT
            )
        """)
        for col, typedef in [
            ("ai_debrief", "TEXT"),
            ("holes_json", "TEXT"),
            ("playing_hcp", "REAL"),
            ("ai_short_summary", "TEXT"),
            ("tee_colour", "TEXT"),
        ]:
            try:
                conn.execute(f"ALTER TABLE rounds ADD COLUMN {col} {typedef}")
            except Exception:
                pass
        # Backfill existing rounds with no tee_colour as Yellow
        conn.execute("UPDATE rounds SET tee_colour = 'Yellow' WHERE tee_colour IS NULL")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS global_summaries (
                type TEXT PRIMARY KEY,
                short_summary TEXT,
                full_report TEXT,
                generated_at TEXT
            )
        """)
        for col, typedef in [("round_count", "INTEGER")]:
            try:
                conn.execute(f"ALTER TABLE global_summaries ADD COLUMN {col} {typedef}")
            except Exception:
                pass

        conn.execute("""
            CREATE TABLE IF NOT EXISTS courses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Per-tee CR/Slope columns (White/Yellow/Red/Blue × 18H/9H)
        for tee in ("white", "yellow", "red", "blue"):
            for holes in ("18", "9"):
                for stat, typedef in (("cr", "REAL"), ("slope", "INTEGER")):
                    col = f"{tee}_{stat}_{holes}"
                    try:
                        conn.execute(f"ALTER TABLE courses ADD COLUMN {col} {typedef}")
                    except Exception:
                        pass
        # Seed courses from any already-imported rounds
        _sync_courses(conn)
        conn.commit()


def _sync_courses(conn):
    """Ensure every unique course name in rounds has a courses row."""
    rows = conn.execute(
        "SELECT DISTINCT course FROM rounds WHERE course IS NOT NULL"
    ).fetchall()
    for row in rows:
        conn.execute(
            "INSERT OR IGNORE INTO courses (name) VALUES (?)", (row["course"],)
        )


def sync_courses():
    """Public entry — call after inserting/replacing a round."""
    with get_conn() as conn:
        _sync_courses(conn)
        conn.commit()


def get_courses() -> list[dict]:
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM courses ORDER BY name"
        ).fetchall()]


def get_course(course_id: int) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM courses WHERE id = ?", (course_id,)).fetchone()
        return dict(row) if row else None


def get_course_by_name(name: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM courses WHERE name = ?", (name,)).fetchone()
        return dict(row) if row else None


TEE_COLOURS = ("White", "Yellow", "Red", "Blue")

def update_course_ratings(course_id: int, ratings: dict, notes: str | None):
    """
    ratings: dict keyed by e.g. 'yellow_cr_18', 'yellow_slope_18', etc.
    Accepts any subset; unknown keys are ignored.
    """
    valid_cols = {
        f"{t.lower()}_{s}_{h}"
        for t in TEE_COLOURS for h in ("18", "9") for s in ("cr", "slope")
    }
    sets, vals = [], []
    for k, v in ratings.items():
        if k in valid_cols:
            sets.append(f"{k} = ?")
            vals.append(v if v not in ("", None) else None)
    sets.append("notes = ?")
    vals.append(notes)
    vals.append(course_id)
    with get_conn() as conn:
        conn.execute(f"UPDATE courses SET {', '.join(sets)} WHERE id = ?", vals)
        conn.commit()


def get_rounds_for_course(course_name: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM rounds WHERE course = ? ORDER BY date DESC",
            (course_name,)
        ).fetchall()
        return [dict(r) for r in rows]


def get_all_rounds_with_course_ratings() -> list[dict]:
    """Return all rounds joined with tee-specific CR/Slope for WHS calculation."""
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT r.*,
                CASE LOWER(r.tee_colour)
                    WHEN 'white'  THEN CASE WHEN r.holes <= 9 THEN c.white_cr_9  ELSE c.white_cr_18  END
                    WHEN 'yellow' THEN CASE WHEN r.holes <= 9 THEN c.yellow_cr_9 ELSE c.yellow_cr_18 END
                    WHEN 'red'    THEN CASE WHEN r.holes <= 9 THEN c.red_cr_9    ELSE c.red_cr_18    END
                    WHEN 'blue'   THEN CASE WHEN r.holes <= 9 THEN c.blue_cr_9   ELSE c.blue_cr_18   END
                    ELSE               CASE WHEN r.holes <= 9 THEN c.yellow_cr_9 ELSE c.yellow_cr_18 END
                END AS _course_rating,
                CASE LOWER(r.tee_colour)
                    WHEN 'white'  THEN CASE WHEN r.holes <= 9 THEN c.white_slope_9  ELSE c.white_slope_18  END
                    WHEN 'yellow' THEN CASE WHEN r.holes <= 9 THEN c.yellow_slope_9 ELSE c.yellow_slope_18 END
                    WHEN 'red'    THEN CASE WHEN r.holes <= 9 THEN c.red_slope_9    ELSE c.red_slope_18    END
                    WHEN 'blue'   THEN CASE WHEN r.holes <= 9 THEN c.blue_slope_9   ELSE c.blue_slope_18   END
                    ELSE               CASE WHEN r.holes <= 9 THEN c.yellow_slope_9 ELSE c.yellow_slope_18 END
                END AS _slope_rating
            FROM rounds r
            LEFT JOIN courses c ON c.name = r.course
            ORDER BY r.date ASC
        """).fetchall()
        return [dict(r) for r in rows]


def find_duplicate(data: dict) -> dict | None:
    """Return existing round if data matches an already-imported round."""
    with get_conn() as conn:
        # URL import: match on hole19_id
        if data.get("hole19_id"):
            row = conn.execute(
                "SELECT * FROM rounds WHERE hole19_id = ?", (data["hole19_id"],)
            ).fetchone()
            if row:
                return dict(row)
        # Email import: match on date + course (case-insensitive)
        if data.get("date") and data.get("course"):
            row = conn.execute(
                "SELECT * FROM rounds WHERE date = ? AND LOWER(course) = LOWER(?)",
                (data["date"], data["course"]),
            ).fetchone()
            if row:
                return dict(row)
    return None


def replace_round(existing_id: int, data: dict) -> int:
    """Delete existing round and insert replacement, returning new id."""
    with get_conn() as conn:
        conn.execute("DELETE FROM rounds WHERE id = ?", (existing_id,))
        conn.commit()
    return insert_round(data)


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


def save_short_summary(round_id: int, text: str):
    with get_conn() as conn:
        conn.execute("UPDATE rounds SET ai_short_summary = ? WHERE id = ?", (text, round_id))
        conn.commit()


def get_global_summary(summary_type: str = "performance") -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM global_summaries WHERE type = ?", (summary_type,)
        ).fetchone()
        return dict(row) if row else None


def save_global_summary(summary_type: str, short_summary: str, full_report: str, round_count: int = 0):
    with get_conn() as conn:
        try:
            conn.execute("ALTER TABLE global_summaries ADD COLUMN round_count INTEGER DEFAULT 0")
        except Exception:
            pass
        conn.execute("""
            INSERT INTO global_summaries (type, short_summary, full_report, generated_at, round_count)
            VALUES (?, ?, ?, datetime('now'), ?)
            ON CONFLICT(type) DO UPDATE SET
                short_summary = excluded.short_summary,
                full_report   = excluded.full_report,
                generated_at  = excluded.generated_at,
                round_count   = excluded.round_count
        """, (summary_type, short_summary, full_report, round_count))
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
