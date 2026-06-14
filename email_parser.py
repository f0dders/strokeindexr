"""
Parser for Hole19 round summary emails.

Attempts structured extraction first (tab-separated scorecard format).
Returns a dict ready for DB insertion, matching the same schema as scraper.py.
Raises ValueError if the text doesn't look like a Hole19 round email.
"""

import json
import re


def parse_hole19_email(text: str) -> dict:
    """Main entry point. Returns round dict or raises ValueError."""
    if "hole19" not in text.lower() and "hole 19" not in text.lower():
        raise ValueError("Does not appear to be a Hole19 round summary email")

    data = {}

    # ── Date ──────────────────────────────────────────────────────────────────
    date_m = re.search(r"(\d{2}/\d{2}/\d{4})", text)
    if date_m:
        d, mo, y = date_m.group(1).split("/")
        data["date"] = f"{y}-{mo}-{d}"

    # ── Course ────────────────────────────────────────────────────────────────
    # Prefer "round at X." pattern, then fall back to a standalone Golf Club line
    course_m = re.search(r"round at (.+?)\.", text, re.I)
    if course_m:
        data["course"] = course_m.group(1).strip()
    else:
        cm2 = re.search(r"^(.+Golf Club.+)$", text, re.M | re.I)
        if cm2:
            data["course"] = cm2.group(1).strip()

    # ── Holes / Par / Tee ─────────────────────────────────────────────────────
    holes_m = re.search(r"(\d+)\s+HOLES\s+PAR:\s*(\d+)", text, re.I)
    if holes_m:
        data["holes"] = int(holes_m.group(1))
        data["par"]   = int(holes_m.group(2))

    # ── Total score and vs-par ────────────────────────────────────────────────
    # Pattern: "46 +10" or "72 E" or "68 -4" on a line
    score_m = re.search(r"^(\d{2,3})\s+([+-]\d+|E)\s*$", text, re.M)
    if score_m:
        data["score"] = int(score_m.group(1))
        vp = score_m.group(2)
        data["score_vs_par"] = 0 if vp == "E" else int(vp)

    # ── Aggregate stats: FAIRWAYS / GIR / PUTTS ──────────────────────────────
    # These appear on one tab-separated line: "43%\t22%\t14"
    # preceded by the header "FAIRWAYS\tGIR\tPUTTS"
    agg_m = re.search(r"FAIRWAYS.*?GIR.*?PUTTS.*?\n(\d+)%[\t ]+(\d+)%[\t ]+(\d+)", text, re.I | re.S)
    if agg_m:
        data["fairway_hit_pct"]    = float(agg_m.group(1))
        data["gir_hit_pct"]        = float(agg_m.group(2))
        data["putts"]              = int(agg_m.group(3))
        data["fairway_missed_pct"] = round(100 - data["fairway_hit_pct"], 1)
        data["gir_missed_pct"]     = round(100 - data["gir_hit_pct"], 1)

    # ── Best hole ─────────────────────────────────────────────────────────────
    best_m = re.search(r"BEST HOLE\s+\S+\s+(\d+)\s+PAR", text, re.I)
    if best_m:
        data["best_hole"] = int(best_m.group(1))

    # ── Longest drive ─────────────────────────────────────────────────────────
    ld_m = re.search(r"LONGEST DRIVE\s+(\d+)\s+YDS", text, re.I)
    if ld_m:
        data["longest_drive_yds"] = int(ld_m.group(1))

    # ── Hole-by-hole scorecard parsing ────────────────────────────────────────
    holes_data = _parse_scorecard_rows(text, data.get("holes", 9))
    if holes_data:
        data["holes_json"] = json.dumps(holes_data)
        data = _derive_stats_from_holes(data, holes_data)

    if not data.get("date") or not data.get("course"):
        raise ValueError("Could not extract date or course from email")

    return data


def _parse_row(text: str, label: str, n_holes: int) -> list[str] | None:
    """Extract a tab-separated row by its leading label."""
    # Use a single \t as the label/data separator — \s*\t would greedily
    # consume leading empty column tabs and shift all values left.
    pattern = rf"^{re.escape(label)}\t(.+)$"
    m = re.search(pattern, text, re.M | re.I)
    if not m:
        return None
    parts = [p.strip() for p in m.group(1).split("\t")]
    # Pad or trim to n_holes + 1 (last cell is often the total)
    while len(parts) < n_holes + 1:
        parts.append("")
    return parts[:n_holes + 1]


def _parse_scorecard_rows(text: str, n_holes: int) -> list[dict]:
    """
    Parse the tab-delimited scorecard block into a list of hole dicts
    matching the same schema used by the URL scraper's holes_json.
    """
    par_row   = _parse_row(text, "Par",   n_holes)
    dist_row  = _parse_row(text, "Tee",   n_holes)
    si_row    = _parse_row(text, "SI",    n_holes)
    score_row = _parse_row(text, "Score", n_holes) or _parse_row(text, "Score  ", n_holes)
    putts_row = _parse_row(text, "Putts", n_holes)
    fir_row   = _parse_row(text, "Fair.", n_holes)
    gir_row   = _parse_row(text, "GIR",  n_holes)
    pen_row   = _parse_row(text, "Pen.",  n_holes)
    sand_row  = _parse_row(text, "Sand",  n_holes)

    if not par_row or not score_row:
        return []

    holes = []
    for i in range(n_holes):
        par = _to_int(par_row[i]) or 4

        # Score cell: "6+2", "4E", "3-1" etc.
        raw_score = score_row[i] if score_row else ""
        strokes = _parse_score_cell(raw_score, par)

        # Fairway: map Hole19 labels to scraper values
        fir_raw = (fir_row[i] if fir_row else "").lower()
        if "target" in fir_raw or "centre" in fir_raw or "center" in fir_raw:
            fairway_hit = "target"
        elif "left" in fir_raw:
            fairway_hit = "left"
        elif "right" in fir_raw:
            fairway_hit = "right"
        elif "other" in fir_raw or "penalty" in fir_raw:
            fairway_hit = "other"
        else:
            fairway_hit = None  # par 3 or not recorded

        # GIR: cell explicitly contains "GIR" if hit; None means not tracked
        gir_raw = (gir_row[i] if gir_row else "").strip().lower()
        if "gir" in gir_raw:
            gir = True
        elif gir_row is not None:
            gir = False   # row exists but cell is empty → missed
        else:
            gir = None    # row not found in email at all

        hole = {
            "sequence": i + 1,
            "hole_tee": {
                "par": par,
                "stroke_index": _to_int(si_row[i]) if si_row else None,
                "distance": _to_float(dist_row[i]) if dist_row else None,
            },
            "hole_score": {
                "total_of_strokes": strokes,
                "total_of_putts":   _to_int(putts_row[i]) if putts_row else None,
                "green_in_regulation": gir,
                "fairway_hit":      fairway_hit,
                "total_of_penalties": _to_int(pen_row[i]) if pen_row else 0,
                "total_of_sand_shots": _to_int(sand_row[i]) if sand_row else 0,
                # No GPS from email
                "tee_latitude": None,
                "tee_longitude": None,
                "custom_flag_latitude": None,
                "custom_flag_longitude": None,
                "stroke_scores": [],
            },
        }
        holes.append(hole)

    return holes


def _parse_score_cell(cell: str, par: int) -> int:
    """Parse score cells like '6+2', '4E', '3-1', '5+1'."""
    cell = cell.strip()
    # Remove dot/bullet characters used as visual separators
    cell = re.sub(r"[•·]", "", cell).strip()
    # Try "NUMBERsign" format: "6+2", "4E", "3-1"
    m = re.match(r"(\d+)([+-]\d+|E)?", cell)
    if m:
        return int(m.group(1))
    # Fallback: derive from par + vs_par suffix
    vp_m = re.search(r"([+-]\d+|E)$", cell)
    if vp_m:
        vp = vp_m.group(1)
        delta = 0 if vp == "E" else int(vp)
        return par + delta
    return par  # worst-case guess


def _to_int(s: str) -> int | None:
    if not s:
        return None
    m = re.search(r"-?\d+", s)
    return int(m.group()) if m else None


def _to_float(s: str) -> float | None:
    if not s:
        return None
    m = re.search(r"[\d.]+", s)
    return float(m.group()) if m else None


def _derive_stats_from_holes(data: dict, holes: list[dict]) -> dict:
    """Recalculate aggregate stats from hole-by-hole data for accuracy."""
    n = len(holes)
    if not n:
        return data

    total_score = sum(h["hole_score"]["total_of_strokes"] for h in holes)
    total_par   = sum(h["hole_tee"]["par"] for h in holes)
    total_putts = sum(h["hole_score"]["total_of_putts"] or 0 for h in holes)

    data["score"]        = total_score
    data["par"]          = total_par
    data["score_vs_par"] = total_score - total_par
    data["putts"]        = total_putts  # always use hole sum — most accurate

    # Par averages
    for pv in (3, 4, 5):
        ph = [h for h in holes if h["hole_tee"]["par"] == pv]
        if ph:
            data[f"par{pv}_avg"] = round(
                sum(h["hole_score"]["total_of_strokes"] for h in ph) / len(ph), 2
            )
    data["overall_avg"] = round(total_score / n, 2)

    # Score distribution
    def pct(fn):
        return round(sum(1 for h in holes if fn(h)) / n * 100, 1)

    data["eagles_pct"]       = pct(lambda h: h["hole_score"]["total_of_strokes"] <= h["hole_tee"]["par"] - 2)
    data["birdies_pct"]      = pct(lambda h: h["hole_score"]["total_of_strokes"] == h["hole_tee"]["par"] - 1)
    data["pars_pct"]         = pct(lambda h: h["hole_score"]["total_of_strokes"] == h["hole_tee"]["par"])
    data["bogeys_pct"]       = pct(lambda h: h["hole_score"]["total_of_strokes"] == h["hole_tee"]["par"] + 1)
    data["doubles_plus_pct"] = pct(lambda h: h["hole_score"]["total_of_strokes"] >= h["hole_tee"]["par"] + 2)

    # GIR from holes (overrides email aggregate if we have it)
    gir_eligible = [h for h in holes if h["hole_score"]["green_in_regulation"] is not None]
    if gir_eligible:
        gir_hit = sum(1 for h in gir_eligible if h["hole_score"]["green_in_regulation"])
        data["gir_hit_pct"]   = round(gir_hit / len(gir_eligible) * 100, 1)
        data["gir_missed_pct"] = round(100 - data["gir_hit_pct"], 1)

    # FIR from holes
    fir_eligible = [h for h in holes if h["hole_tee"]["par"] >= 4 and h["hole_score"]["fairway_hit"] is not None]
    if fir_eligible:
        fir_hit  = sum(1 for h in fir_eligible if h["hole_score"]["fairway_hit"] in ("target", "center"))
        fir_miss = sum(1 for h in fir_eligible if h["hole_score"]["fairway_hit"] in ("left", "right"))
        data["fairway_hit_pct"]    = round(fir_hit  / len(fir_eligible) * 100, 1)
        data["fairway_missed_pct"] = round(fir_miss / len(fir_eligible) * 100, 1)
        data["fairway_other_pct"]  = round(100 - data["fairway_hit_pct"] - data["fairway_missed_pct"], 1)

    # Best hole
    best = min(holes, key=lambda h: h["hole_score"]["total_of_strokes"] - h["hole_tee"]["par"])
    data.setdefault("best_hole", best["sequence"])

    return data
