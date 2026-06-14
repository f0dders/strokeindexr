"""
World Handicap System (WHS) Handicap Index calculations.

Implements WHS Rules of Handicapping (2020 edition):
- Score differential per round (18-hole or 9-hole paired)
- Best-N-of-last-20 selection table
- ×0.96 multiplier, cap at 54.0

Not implemented (requires additional data): exceptional score reduction,
soft cap (+5 above low index), hard cap (+10 above low index).
"""

STD_SLOPE = 113
MULTIPLIER = 0.96
MAX_INDEX = 54.0
MAX_ROUNDS = 20

# WHS Table: number of 18-hole equivalent differentials → how many best ones to use
BEST_OF = {
    3: 1, 4: 1, 5: 1,
    6: 2, 7: 2, 8: 2,
    9: 3, 10: 3, 11: 3,
    12: 4, 13: 4, 14: 4,
    15: 5, 16: 5,
    17: 6, 18: 7, 19: 8,
}


def score_differential(score: float, course_rating: float, slope: int = STD_SLOPE) -> float:
    """WHS score differential: (113 / Slope) × (Score − Course Rating)."""
    return round((STD_SLOPE / slope) * (score - course_rating), 1)


def _round_differential(r: dict) -> tuple[float, bool]:
    """
    Return (differential, estimated) for a single round dict.
    `estimated` is True when we fall back to (score − par) because no CR/Slope is set.
    """
    score = r.get("score")
    par   = r.get("par")
    cr    = r.get("_course_rating")
    sl    = r.get("_slope_rating")

    if score is None or par is None:
        return None, False

    if cr and sl:
        return score_differential(score, cr, int(sl)), False
    else:
        return float(score - par), True  # fallback: CR=par, Slope=113


def build_differentials(rounds: list[dict]) -> list[dict]:
    """
    Process a chronologically sorted list of round dicts into 18-hole equivalent
    differentials per WHS §5.2.

    9-hole rounds are held until a second 9-hole round arrives; their differentials
    are summed to form one 18-hole equivalent. An unpaired 9-hole round at the end
    remains 'pending' and is excluded from the handicap calculation.

    Returns a list of dicts:
        date          – date of the later round (for the pair) or the round itself
        differential  – 18-hole equivalent score differential
        estimated     – True if CR/Slope was not available for either component
        paired        – True if this is a combined 9+9 differential
    """
    sorted_rounds = sorted(rounds, key=lambda r: (r.get("date") or ""))
    results   = []
    pending_9 = None  # dict: {sd, date, estimated}

    for r in sorted_rounds:
        holes = r.get("holes") or 18
        sd, estimated = _round_differential(r)
        if sd is None:
            continue

        if holes <= 9:
            if pending_9 is None:
                pending_9 = {"sd": sd, "date": r.get("date"), "estimated": estimated}
            else:
                results.append({
                    "date":         r.get("date"),
                    "differential": round(pending_9["sd"] + sd, 1),
                    "estimated":    estimated or pending_9["estimated"],
                    "paired":       True,
                })
                pending_9 = None
        else:
            results.append({
                "date":         r.get("date"),
                "differential": sd,
                "estimated":    estimated,
                "paired":       False,
            })

    # pending_9 (unpaired) is intentionally excluded per WHS rules

    return results


def index_from_differentials(diffs: list[float]) -> float | None:
    """
    Calculate WHS Handicap Index from a flat list of 18-hole equivalent differentials.
    Uses last 20, selects best N per BEST_OF table, multiplies by 0.96, caps at 54.0.
    Returns None if fewer than 3 differentials (insufficient data per WHS).
    """
    if not diffs:
        return None
    recent = diffs[-MAX_ROUNDS:]
    n = len(recent)
    if n < 3:
        return None
    best_count = BEST_OF.get(n, 8)
    best = sorted(recent)[:best_count]
    index = sum(best) / best_count * MULTIPLIER
    return min(round(index, 1), MAX_INDEX)


def current_index(rounds: list[dict]) -> dict:
    """
    Calculate current WHS Handicap Index from a list of round dicts.
    Each dict may include _course_rating and _slope_rating (injected from courses table).

    Returns:
        index              – float or None (None = insufficient data)
        differential_count – number of 18-hole equivalent differentials available
        pending_nine       – True if there is one unpaired 9-hole score
        estimated          – True if any differential in the last 20 used the fallback
        sufficient_data    – True if index could be calculated
    """
    sorted_rounds = sorted(rounds, key=lambda r: (r.get("date") or ""))

    # Check for pending 9-hole
    pending_9 = False
    nine_count = 0
    for r in sorted_rounds:
        if (r.get("holes") or 18) <= 9:
            nine_count += 1
    if nine_count % 2 == 1:
        pending_9 = True

    diff_info  = build_differentials(sorted_rounds)
    diffs      = [d["differential"] for d in diff_info]
    idx        = index_from_differentials(diffs)
    any_est    = any(d["estimated"] for d in diff_info[-MAX_ROUNDS:]) if diff_info else False

    return {
        "index":              idx,
        "differential_count": len(diffs),
        "pending_nine":       pending_9,
        "estimated":          any_est,
        "sufficient_data":    idx is not None,
    }


def index_history(rounds: list[dict]) -> list[dict]:
    """
    Calculate WHS index at each round date for trend charting.
    Returns list of {date, index, estimated} — only entries where index is calculable.
    """
    sorted_rounds = sorted(rounds, key=lambda r: (r.get("date") or ""))
    history = []

    for i in range(len(sorted_rounds)):
        subset     = sorted_rounds[: i + 1]
        diff_info  = build_differentials(subset)
        diffs      = [d["differential"] for d in diff_info]
        idx        = index_from_differentials(diffs)
        if idx is not None:
            any_est = any(d["estimated"] for d in diff_info)
            history.append({
                "date":      sorted_rounds[i].get("date"),
                "index":     idx,
                "estimated": any_est,
            })

    return history
