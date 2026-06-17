"""SQLite database layer for StrokeIndexr."""

import json
import re
import sqlite3
import os
import shutil
from pathlib import Path
from platformdirs import user_data_dir

# Standard per-OS data directory: ~/Library/Application Support/strokeindexr (Mac),
# %APPDATA%\strokeindexr (Windows), ~/.local/share/strokeindexr (Linux)
_APP_DIR   = Path(user_data_dir("strokeindexr", "f0dders"))
_LEGACY_DIR = Path(__file__).parent / "data"

def _migrate_if_needed():
    """Move data/ from alongside the app to the OS data directory on first run."""
    if _APP_DIR.exists():
        return
    if _legacy_db := _LEGACY_DIR / "golf.db":
        if _legacy_db.exists():
            _APP_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copytree(_LEGACY_DIR, _APP_DIR, dirs_exist_ok=True)
            return
    _APP_DIR.mkdir(parents=True, exist_ok=True)

_migrate_if_needed()

DB_PATH     = str(_APP_DIR / "golf.db")
CONFIG_PATH = str(_APP_DIR / "config.json")


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
            ("handicap_excluded", "INTEGER DEFAULT 0"),
            ("scoring_mode", "TEXT DEFAULT 'stroke_play'"),
            ("tee_time", "TEXT"),
            ("weather_temp_c", "REAL"),
            ("weather_wind_kph", "REAL"),
            ("weather_precip_mm", "REAL"),
            ("weather_condition", "TEXT"),
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
        for col, typedef in [
            ("round_count",       "INTEGER"),
            ("from_date",         "TEXT"),
            ("to_date",           "TEXT"),
            ("latest_round_date", "TEXT"),
        ]:
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
        # Parent course link (for grouping front/back 9 halves)
        try:
            conn.execute("ALTER TABLE courses ADD COLUMN parent_course_id INTEGER REFERENCES courses(id)")
        except Exception:
            pass
        # Course description (AI-fetched or manually entered)
        try:
            conn.execute("ALTER TABLE courses ADD COLUMN description TEXT")
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

_UNSET = object()


def update_course_ratings(course_id: int, ratings: dict, notes=_UNSET, description=_UNSET):
    """
    ratings: dict keyed by e.g. 'yellow_cr_18', 'yellow_slope_18', etc.
    Accepts any subset; unknown keys are ignored.
    notes/description are only written if explicitly passed (not _UNSET),
    so saving ratings doesn't clobber notes and vice versa.
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
    if notes is not _UNSET:
        sets.append("notes = ?")
        vals.append(notes)
    if description is not _UNSET:
        sets.append("description = ?")
        vals.append(description)
    if not sets:
        return
    vals.append(course_id)
    with get_conn() as conn:
        conn.execute(f"UPDATE courses SET {', '.join(sets)} WHERE id = ?", vals)
        conn.commit()


def get_rounds_for_course(course_name: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            f"""SELECT *, {PUTTS_UNRELIABLE_EXPR} as putts_unreliable
                FROM rounds WHERE course = ? ORDER BY date DESC""",
            (course_name,)
        ).fetchall()
        return [dict(r) for r in rows]


def get_all_rounds_with_course_ratings() -> list[dict]:
    """
    Return all rounds joined with tee-specific CR/Slope for WHS calculation.
    For 9-hole rounds, falls back to the parent course's 9H rating when the
    child course (Front/Back 9) doesn't have its own rating set.
    """
    def _cr_expr(holes_cond):
        def col(tee, h, table="c"):
            return f"{table}.{tee}_{h}"
        def coalesce_tee(tee, h_child, h_parent):
            return f"COALESCE({col(tee+'_cr', h_child)}, {col(tee+'_cr', h_parent, 'p')})"
        return f"""CASE LOWER(r.tee_colour)
                    WHEN 'white'  THEN {coalesce_tee('white',  h_child, h_child)}
                    WHEN 'yellow' THEN {coalesce_tee('yellow', h_child, h_child)}
                    WHEN 'red'    THEN {coalesce_tee('red',    h_child, h_child)}
                    WHEN 'blue'   THEN {coalesce_tee('blue',   h_child, h_child)}
                    ELSE               {coalesce_tee('yellow', h_child, h_child)}
                END"""

    with get_conn() as conn:
        rows = conn.execute("""
            SELECT r.*,
                CASE LOWER(r.tee_colour)
                    WHEN 'white'  THEN COALESCE(CASE WHEN r.holes<=9 THEN c.white_cr_9  ELSE c.white_cr_18  END, CASE WHEN r.holes<=9 THEN p.white_cr_9  ELSE p.white_cr_18  END)
                    WHEN 'yellow' THEN COALESCE(CASE WHEN r.holes<=9 THEN c.yellow_cr_9 ELSE c.yellow_cr_18 END, CASE WHEN r.holes<=9 THEN p.yellow_cr_9 ELSE p.yellow_cr_18 END)
                    WHEN 'red'    THEN COALESCE(CASE WHEN r.holes<=9 THEN c.red_cr_9    ELSE c.red_cr_18    END, CASE WHEN r.holes<=9 THEN p.red_cr_9    ELSE p.red_cr_18    END)
                    WHEN 'blue'   THEN COALESCE(CASE WHEN r.holes<=9 THEN c.blue_cr_9   ELSE c.blue_cr_18   END, CASE WHEN r.holes<=9 THEN p.blue_cr_9   ELSE p.blue_cr_18   END)
                    ELSE               COALESCE(CASE WHEN r.holes<=9 THEN c.yellow_cr_9 ELSE c.yellow_cr_18 END, CASE WHEN r.holes<=9 THEN p.yellow_cr_9 ELSE p.yellow_cr_18 END)
                END AS _course_rating,
                CASE LOWER(r.tee_colour)
                    WHEN 'white'  THEN COALESCE(CASE WHEN r.holes<=9 THEN c.white_slope_9  ELSE c.white_slope_18  END, CASE WHEN r.holes<=9 THEN p.white_slope_9  ELSE p.white_slope_18  END)
                    WHEN 'yellow' THEN COALESCE(CASE WHEN r.holes<=9 THEN c.yellow_slope_9 ELSE c.yellow_slope_18 END, CASE WHEN r.holes<=9 THEN p.yellow_slope_9 ELSE p.yellow_slope_18 END)
                    WHEN 'red'    THEN COALESCE(CASE WHEN r.holes<=9 THEN c.red_slope_9    ELSE c.red_slope_18    END, CASE WHEN r.holes<=9 THEN p.red_slope_9    ELSE p.red_slope_18    END)
                    WHEN 'blue'   THEN COALESCE(CASE WHEN r.holes<=9 THEN c.blue_slope_9   ELSE c.blue_slope_18   END, CASE WHEN r.holes<=9 THEN p.blue_slope_9   ELSE p.blue_slope_18   END)
                    ELSE               COALESCE(CASE WHEN r.holes<=9 THEN c.yellow_slope_9 ELSE c.yellow_slope_18 END, CASE WHEN r.holes<=9 THEN p.yellow_slope_9 ELSE p.yellow_slope_18 END)
                END AS _slope_rating
            FROM rounds r
            LEFT JOIN courses c ON c.name = r.course
            LEFT JOIN courses p ON p.id = c.parent_course_id
            ORDER BY r.date ASC
        """).fetchall()
        return [dict(r) for r in rows]


# ── Course name / linking helpers ─────────────────────────────────────────────

_HALF_SUFFIX = re.compile(
    r'\s*[\(\-]\s*(Front|Back)\s*(9|Nine|9\s*Holes?)?\s*\)?$',
    re.IGNORECASE,
)

def course_base_name(name: str) -> str:
    """Strip front/back 9 suffixes to get the parent course base name."""
    return _HALF_SUFFIX.sub("", name).strip()


def get_suggested_links() -> list[dict]:
    """
    Return groups of unlinked courses that look like halves of the same course.
    Each group: {base_name, courses: [...]}.
    """
    from collections import defaultdict
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM courses WHERE parent_course_id IS NULL"
        ).fetchall()
    groups = defaultdict(list)
    for row in rows:
        d = dict(row)
        base = course_base_name(d["name"])
        if base != d["name"]:          # has a recognisable half-suffix
            groups[base].append(d)
    return [
        {"base_name": base, "courses": cs}
        for base, cs in groups.items()
        if len(cs) >= 2
    ]


def link_courses(child_ids: list[int], parent_name: str) -> int:
    """
    Create (or find) a parent course with parent_name and link child_ids to it.
    Returns the parent course id.
    """
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM courses WHERE name = ?", (parent_name,)
        ).fetchone()
        if row:
            parent_id = row["id"]
        else:
            cur = conn.execute(
                "INSERT INTO courses (name) VALUES (?)", (parent_name,)
            )
            parent_id = cur.lastrowid
        for cid in child_ids:
            conn.execute(
                "UPDATE courses SET parent_course_id = ? WHERE id = ?",
                (parent_id, cid),
            )
        conn.commit()
    return parent_id


def unlink_course(child_id: int):
    """Remove a course's parent link."""
    with get_conn() as conn:
        conn.execute(
            "UPDATE courses SET parent_course_id = NULL WHERE id = ?", (child_id,)
        )
        conn.commit()


def get_courses_with_hierarchy() -> list[dict]:
    """
    Return courses for the list view:
    - Parent courses (or parents with no parent themselves) with children embedded
    - Standalone courses (no parent, no half-suffix) returned as-is
    Children are not returned as top-level entries.
    """
    with get_conn() as conn:
        all_courses = [dict(r) for r in conn.execute("SELECT * FROM courses ORDER BY name").fetchall()]

    by_id = {c["id"]: c for c in all_courses}
    parents = {}   # id -> course dict with children list
    standalone = []

    for c in all_courses:
        pid = c.get("parent_course_id")
        if pid:
            if pid not in parents:
                parent = by_id.get(pid, {"id": pid, "name": "Unknown"})
                parents[pid] = {**parent, "children": []}
            parents[pid]["children"].append(c)
        elif c["id"] not in parents:
            standalone.append(c)

    # Merge parents into standalone list (parent may already be in standalone)
    result = []
    seen = set()
    for c in standalone:
        cid = c["id"]
        if cid in parents:
            result.append({**parents[cid]})
        else:
            result.append({**c, "children": []})
        seen.add(cid)
    # Any parent that wasn't in standalone (shouldn't happen, but be safe)
    for pid, p in parents.items():
        if pid not in seen:
            result.append(p)

    return sorted(result, key=lambda c: c["name"])


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


PUTTS_UNRELIABLE_EXPR = """(
    holes_json IS NOT NULL AND
    (SELECT COUNT(*) FROM json_each(holes_json)
     WHERE json_extract(value, '$.hole_score.total_of_putts') = 0) >= 2
)"""


def get_rounds(limit: int = 100, offset: int = 0) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            f"""SELECT id, date, course, holes, score, score_vs_par, par, putts,
                      handicap, tee_colour, handicap_excluded, ai_short_summary,
                      holes_json, gir_hit_pct, fairway_hit_pct, scoring_mode,
                      tee_time, weather_temp_c, weather_wind_kph, weather_precip_mm, weather_condition,
                      {PUTTS_UNRELIABLE_EXPR} as putts_unreliable
               FROM rounds ORDER BY date DESC, imported_at DESC LIMIT ? OFFSET ?""",
            (limit, offset),
        ).fetchall()
        return [dict(r) for r in rows]


def get_round(round_id: int) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            f"SELECT *, {PUTTS_UNRELIABLE_EXPR} as putts_unreliable FROM rounds WHERE id = ?",
            (round_id,)
        ).fetchone()
        return dict(row) if row else None


def delete_round(round_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM rounds WHERE id = ?", (round_id,))
        conn.commit()


def patch_round_fields(round_id: int, fields: dict):
    """Update specific fields on a round without touching anything else."""
    if not fields:
        return
    sets = ", ".join(f"{k} = ?" for k in fields)
    with get_conn() as conn:
        conn.execute(f"UPDATE rounds SET {sets} WHERE id = ?", [*fields.values(), round_id])
        conn.commit()


def get_rounds_missing_fields(field_names: list[str]) -> list[dict]:
    """Return rounds that have a hole19_url but are missing any of the given fields."""
    conditions = " OR ".join(f"{f} IS NULL" for f in field_names)
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT id, hole19_url, holes_json, date, tee_time FROM rounds "
            f"WHERE hole19_url IS NOT NULL AND ({conditions})"
        ).fetchall()
        return [dict(r) for r in rows]


def update_notes(round_id: int, notes: str):
    with get_conn() as conn:
        conn.execute("UPDATE rounds SET notes = ? WHERE id = ?", (notes, round_id))
        conn.commit()


def set_handicap_excluded(round_id: int, excluded: bool):
    with get_conn() as conn:
        conn.execute(
            "UPDATE rounds SET handicap_excluded = ? WHERE id = ?",
            (1 if excluded else 0, round_id),
        )
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


def save_global_summary(summary_type: str, short_summary: str, full_report: str,
                        round_count: int = 0, from_date: str = None,
                        to_date: str = None, latest_round_date: str = None):
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO global_summaries
                (type, short_summary, full_report, generated_at, round_count,
                 from_date, to_date, latest_round_date)
            VALUES (?, ?, ?, datetime('now'), ?, ?, ?, ?)
            ON CONFLICT(type) DO UPDATE SET
                short_summary      = excluded.short_summary,
                full_report        = excluded.full_report,
                generated_at       = excluded.generated_at,
                round_count        = excluded.round_count,
                from_date          = excluded.from_date,
                to_date            = excluded.to_date,
                latest_round_date  = excluded.latest_round_date
        """, (summary_type, short_summary, full_report, round_count,
              from_date, to_date, latest_round_date))
        conn.commit()


def get_latest_round_date() -> str | None:
    """Return the most recent round date in the database."""
    with get_conn() as conn:
        row = conn.execute("SELECT MAX(date) AS d FROM rounds").fetchone()
        return row["d"] if row else None


def get_rounds_in_window(from_date: str, to_date: str) -> list[dict]:
    """Return rounds whose date falls within [from_date, to_date] inclusive."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM rounds WHERE date >= ? AND date <= ? ORDER BY date ASC",
            (from_date, to_date),
        ).fetchall()
        return [dict(r) for r in rows]


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
                AVG(CASE WHEN NOT (holes_json IS NOT NULL AND (SELECT COUNT(*) FROM json_each(holes_json) WHERE json_extract(value, '$.hole_score.total_of_putts') = 0) >= 2) THEN putts END) as avg_putts,
                AVG(gir_hit_pct) as avg_gir,
                AVG(fairway_hit_pct) as avg_fir,
                AVG(up_and_down_pct) as avg_up_and_down,
                MIN(score_vs_par) as best_score_vs_par,
                AVG(eagles_pct) as avg_eagles_pct,
                AVG(birdies_pct) as avg_birdies_pct,
                AVG(pars_pct) as avg_pars_pct,
                AVG(bogeys_pct) as avg_bogeys_pct,
                AVG(doubles_plus_pct) as avg_doubles_plus_pct,
                (SELECT handicap FROM rounds ORDER BY date DESC, imported_at DESC LIMIT 1) as latest_handicap
            FROM rounds
        """).fetchone()
        return dict(row) if row else {}


def get_trend_data() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(f"""
            SELECT date, course, holes, score_vs_par, handicap,
                   CASE WHEN {PUTTS_UNRELIABLE_EXPR} THEN NULL ELSE putts END as putts,
                   gir_hit_pct, fairway_hit_pct, pars_pct, bogeys_pct,
                   doubles_plus_pct, birdies_pct
            FROM rounds
            ORDER BY date ASC, imported_at ASC
        """).fetchall()
        return [dict(r) for r in rows]
