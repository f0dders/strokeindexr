"""AI prompt templates for StrokeIndexr golf analysis."""

import json as _json
from datetime import date as _date


def _location_context(r: dict) -> str:
    """Return a brief climate/location note based on hole 1 GPS coordinates."""
    try:
        holes = _json.loads(r.get("holes_json") or "[]")
        if not holes:
            return ""
        h1 = holes[0].get("hole_score", {})
        lat = h1.get("tee_latitude")
        lon = h1.get("tee_longitude")
        if lat is None or lon is None:
            return ""
        # Rough region detection by lat/lon bounding boxes
        if 49 <= lat <= 61 and -11 <= lon <= 2:
            return "UK/Ireland (temperate maritime climate — wind, cold, and rain are normal playing conditions here)"
        if 35 <= lat <= 71 and 2 <= lon <= 32:
            return "Continental Europe (temperate climate — seasonal variation, wind normal)"
        if 25 <= lat <= 50 and -125 <= lon <= -65:
            return "North America"
        if -45 <= lat <= -10 and 110 <= lon <= 155:
            return "Australia/New Zealand"
        if lat >= 55:
            return "Northern latitude — cold and wind are routine conditions"
        return ""
    except Exception:
        return ""


def _hole_breakdown(r: dict) -> str:
    """Build a compact per-hole table for the AI from holes_json."""
    try:
        holes = _json.loads(r.get("holes_json") or "[]")
        if not holes:
            return "Not available."
        lines = ["Hole | Par | SI | Strokes | vsPar | Putts | Penalties | Sand | FIR | GIR | Notes"]
        lines.append("-----|-----|----|---------|-------|-------|-----------|------|-----|-----|------")
        for h in holes:
            hs  = h.get("hole_score", {})
            ht  = h.get("hole_tee", {})
            num = h.get("sequence", "?")
            par = ht.get("par", "?")
            si  = ht.get("stroke_index", "?")
            strokes   = hs.get("total_of_strokes", "?")
            putts     = hs.get("total_of_putts", "?")
            penalties = hs.get("total_of_penalties") or 0
            sand      = hs.get("total_of_sand_shots") or 0
            scratched = hs.get("scratched", False)
            gir       = hs.get("green_in_regulation")
            fir_raw   = hs.get("fairway_hit")

            vs_par = (strokes - par) if isinstance(strokes, int) and isinstance(par, int) else "?"
            vs_par_str = f"+{vs_par}" if isinstance(vs_par, int) and vs_par > 0 else str(vs_par)

            fir_str = {"center": "✓", "target": "✓", "left": "L", "right": "R"}.get(fir_raw, "—")
            gir_str = "✓" if gir else ("—" if gir is None else "✗")

            notes = []
            if scratched:
                notes.append("pickup")
            if penalties >= 2:
                notes.append(f"{penalties}pen (likely S&D)")
            elif penalties == 1:
                notes.append("1pen")
            if sand:
                notes.append(f"{sand} bunker")

            lines.append(
                f"  {num:>2} |  {par}  | {si:>2} |    {strokes}    |  {vs_par_str:>4} |"
                f"   {putts}   |     {penalties}     |  {sand}   |  {fir_str}  |  {gir_str}  | {', '.join(notes)}"
            )
        return "\n".join(lines)
    except Exception:
        return "Not available."


def _weather_str(r: dict) -> str:
    parts = []
    if r.get("weather_temp_c") is not None:
        parts.append(f"{r['weather_temp_c']}°C")
    if r.get("weather_wind_kph") is not None:
        parts.append(f"wind {r['weather_wind_kph']} km/h")
    if r.get("weather_precip_mm") is not None and r["weather_precip_mm"] > 0:
        parts.append(f"rain {r['weather_precip_mm']}mm")
    if r.get("weather_condition"):
        parts.append(r["weather_condition"])
    return ", ".join(parts) if parts else "not recorded"


def _session_str(tee_time: str | None) -> str:
    if not tee_time:
        return "unknown"
    try:
        hour = int(tee_time.split(":")[0])
        if hour < 12:
            return f"Morning ({tee_time})"
        if hour < 17:
            return f"Afternoon ({tee_time})"
        return f"Evening ({tee_time})"
    except Exception:
        return tee_time


def _gap_days(rounds_sorted: list[dict], idx: int) -> str:
    if idx == 0:
        return "first round in window"
    try:
        prev = _date.fromisoformat(rounds_sorted[idx - 1]["date"])
        curr = _date.fromisoformat(rounds_sorted[idx]["date"])
        days = (curr - prev).days
        if days <= 7:
            return f"{days}d since last round"
        if days <= 21:
            return f"{days}d since last round (over a week's gap)"
        return f"{days}d since last round (rusty — {days // 7} weeks off)"
    except Exception:
        return ""


def _hcp_history_str(hcp_history: list[dict], from_date: str = None) -> str:
    """Summarise handicap index trajectory from history entries."""
    if not hcp_history:
        return "No handicap history available."
    relevant = [h for h in hcp_history if not from_date or h["date"] >= from_date]
    if not relevant:
        relevant = hcp_history
    first = relevant[0]
    last  = relevant[-1]
    direction = "improved" if last["index"] < first["index"] else \
                "worsened"  if last["index"] > first["index"] else "stable"
    change = round(last["index"] - first["index"], 1)
    change_str = f"{'+' if change > 0 else ''}{change}"
    overall_first = hcp_history[0]
    overall_last  = hcp_history[-1]
    return (
        f"Current index: {last['index']} | "
        f"Over this window: {first['index']} → {last['index']} ({change_str}, {direction}) | "
        f"All-time: {overall_first['index']} → {overall_last['index']}"
    )


def _shot_sequence(r: dict) -> str:
    """
    Build a shot-by-shot breakdown for holes where Hole19 tracked individual strokes.
    Only emits output for holes with tracking data — absent data is not mentioned.
    """
    try:
        holes = _json.loads(r.get("holes_json") or "[]")
        tracked = [(h, h.get("hole_score", {}).get("stroke_scores") or []) for h in holes if h.get("hole_score", {}).get("stroke_scores")]
        if not tracked:
            return ""
        lines = ["Shot tracking (partial — only holes where Hole19 recorded individual strokes):"]
        lines.append("Note: tracking is often incomplete; absence of data does not mean the shot did not occur.")
        for h, strokes in tracked:
            ht  = h.get("hole_tee", {})
            hs  = h.get("hole_score", {})
            num = h.get("sequence", "?")
            par = ht.get("par", "?")
            total = hs.get("total_of_strokes", "?")
            lines.append(f"\n  Hole {num} (par {par}, score {total}):")
            for s in strokes:
                club     = s.get("club") or "unknown club"
                dist     = s.get("distance")
                lie_after = s.get("lie_name") or s.get("lie") or "unknown"
                dist_str  = f"{dist} yds" if dist else "distance not recorded"
                lines.append(f"    Shot {s.get('sequence', '?')}: {club} — {dist_str} — landed: {lie_after}")
        return "\n".join(lines)
    except Exception:
        return ""


def _club_profile(rounds: list[dict]) -> str:
    """
    Aggregate tracked shot distances by club across a list of rounds.
    Only includes clubs with at least one tracked shot.
    """
    try:
        from collections import defaultdict
        club_distances: dict[str, list[float]] = defaultdict(list)
        for r in rounds:
            holes = _json.loads(r.get("holes_json") or "[]")
            for h in holes:
                for s in (h.get("hole_score", {}).get("stroke_scores") or []):
                    club = s.get("club")
                    dist = s.get("distance")
                    if club and dist and isinstance(dist, (int, float)) and dist > 0:
                        club_distances[club].append(float(dist))
        if not club_distances:
            return ""
        lines = ["Club distance profile (from tracked shots — sample sizes may be small):"]
        # Sort by average distance descending
        for club, dists in sorted(club_distances.items(), key=lambda x: -sum(x[1]) / len(x[1])):
            avg  = sum(dists) / len(dists)
            lo   = min(dists)
            hi   = max(dists)
            n    = len(dists)
            rng  = f"{lo:.0f}–{hi:.0f} yds" if lo != hi else f"{lo:.0f} yds"
            lines.append(f"  {club}: avg {avg:.0f} yds ({rng}, {n} shot{'s' if n > 1 else ''})")
        lines.append("Use these distances as a guide only — wind, lie, and fatigue affect carry.")
        return "\n".join(lines)
    except Exception:
        return ""


def _club_profile_data(rounds: list[dict]) -> list[dict]:
    """Return club distance data as JSON-serialisable list for the profile page."""
    try:
        from collections import defaultdict
        club_distances: dict[str, list[float]] = defaultdict(list)
        for r in rounds:
            holes = _json.loads(r.get("holes_json") or "[]")
            for h in holes:
                for s in (h.get("hole_score", {}).get("stroke_scores") or []):
                    club = s.get("club")
                    dist = s.get("distance")
                    if club and dist and isinstance(dist, (int, float)) and dist > 0:
                        club_distances[club].append(float(dist))
        result = []
        for club, dists in sorted(club_distances.items(), key=lambda x: -sum(x[1]) / len(x[1])):
            avg = sum(dists) / len(dists)
            result.append({
                "club": club,
                "avg": round(avg),
                "min": round(min(dists)),
                "max": round(max(dists)),
                "shots": len(dists),
            })
        return result
    except Exception:
        return []


def _profile_context(profile: dict) -> str:
    """Format player profile for injection into AI prompts."""
    p = profile or {}
    if not p or not p.get("ai_include", True):
        return ""
    lines = []
    if p.get("age"):
        lines.append(f"Age: {p['age']}")
    if p.get("dominant_hand"):
        hand = "right-handed" if p["dominant_hand"] == "right" else "left-handed"
        lines.append(f"Dominant hand: {hand}")
    first = p.get("first_played_year")
    since = p.get("playing_since_year")
    try:
        first_int = int(first) if first else None
        since_int = int(since) if since else None
    except (TypeError, ValueError):
        first_int = since_int = None
    if first_int and since_int and since_int > first_int + 2:
        lines.append(f"Golf background: first played in {first}, took a significant break, returning player since {since}")
    elif since:
        lines.append(f"Golf background: playing since {since}")
    elif first:
        lines.append(f"Golf background: playing since {first}")
    freq_map = {
        "rarely":     "rarely (rounds only, no practice sessions)",
        "occasional": "occasionally (1–2 practice sessions a month)",
        "weekly":     "weekly range sessions",
        "frequent":   "several times a week",
    }
    freq = p.get("practice_frequency")
    if freq:
        lines.append(f"Practice frequency: {freq_map.get(freq, freq)}")
    if p.get("preferred_format"):
        lines.append(f"Preferred format: {p['preferred_format']}")
    if p.get("has_lessons"):
        lines.append("Currently taking lessons — please avoid contradicting the coach's advice in recommendations")
    weakness_labels = {
        "driving_accuracy":  "driving accuracy",
        "driving_distance":  "driving distance",
        "iron_play":         "iron play",
        "chipping":          "chipping",
        "bunker":            "bunker play",
        "putting":           "putting",
        "course_management": "course management",
        "mental_game":       "mental game",
    }
    weaknesses = p.get("weaknesses") or []
    if weaknesses:
        w_labels = [weakness_labels.get(w, w) for w in weaknesses]
        lines.append(f"Self-assessed areas to work on: {', '.join(w_labels)}")
    if p.get("weakness_notes"):
        lines.append(f"Additional self-assessment notes: {p['weakness_notes']}")
    if p.get("physical_notes"):
        lines.append(f"Physical considerations: {p['physical_notes']}")
    if not lines:
        return ""
    return "PLAYER PROFILE:\n" + "\n".join(f"- {l}" for l in lines)


def _miss_pattern(rounds: list[dict]) -> str:
    """
    Aggregate lie outcomes from tracked shots to surface miss direction patterns.
    """
    try:
        from collections import Counter
        lie_counts: Counter = Counter()
        total = 0
        for r in rounds:
            holes = _json.loads(r.get("holes_json") or "[]")
            for h in holes:
                for s in (h.get("hole_score", {}).get("stroke_scores") or []):
                    lie = s.get("lie_name") or s.get("lie")
                    if lie:
                        lie_counts[lie.lower()] += 1
                        total += 1
        if not lie_counts or total < 3:
            return ""
        lines = [f"Shot outcome distribution ({total} tracked shots):"]
        for lie, count in lie_counts.most_common():
            pct = count / total * 100
            lines.append(f"  {lie.title()}: {count} ({pct:.0f}%)")
        return "\n".join(lines)
    except Exception:
        return ""


def _frequency_summary(rounds_sorted: list[dict]) -> str:
    if len(rounds_sorted) < 2:
        return "Only one round in window — no frequency data."
    try:
        first = _date.fromisoformat(rounds_sorted[0]["date"])
        last  = _date.fromisoformat(rounds_sorted[-1]["date"])
        span_days = max((last - first).days, 1)
        span_weeks = span_days / 7
        rate = len(rounds_sorted) / (span_days / 30)
        gaps = []
        for i in range(1, len(rounds_sorted)):
            prev = _date.fromisoformat(rounds_sorted[i - 1]["date"])
            curr = _date.fromisoformat(rounds_sorted[i]["date"])
            gaps.append((curr - prev).days)
        max_gap = max(gaps)
        avg_gap = sum(gaps) / len(gaps)
        lines = [
            f"{rate:.1f} rounds/month over {span_weeks:.0f} weeks",
            f"Average gap between rounds: {avg_gap:.0f} days",
        ]
        if max_gap >= 21:
            lines.append(f"Longest gap: {max_gap} days ({max_gap // 7} weeks without play)")
        return " | ".join(lines)
    except Exception:
        return ""


def parse_email(email_text: str) -> str:
    return f"""You are a data extraction assistant. Extract golf round statistics from the following Hole19 round summary email and return them as a single JSON object.

EMAIL TEXT:
{email_text}

Return ONLY a JSON code block with these exact keys (use null for any value not found):
```json
{{
  "date": "YYYY-MM-DD",
  "course": "Course Name",
  "holes": 9,
  "par": 36,
  "score": 54,
  "score_vs_par": 18,
  "handicap": 18.5,
  "putts": 17,
  "fairway_hit_pct": 33.3,
  "fairway_missed_pct": 50.0,
  "fairway_other_pct": 16.7,
  "gir_hit_pct": 11.1,
  "gir_missed_pct": 88.9,
  "par3_avg": 5.0,
  "par4_avg": 6.2,
  "par5_avg": 6.5,
  "overall_avg": 6.0,
  "up_and_down_pct": 25.0,
  "scrambling_pct": 0.0,
  "sand_saves_pct": 0.0,
  "eagles_pct": 0.0,
  "birdies_pct": 0.0,
  "pars_pct": 11.1,
  "bogeys_pct": 33.3,
  "doubles_plus_pct": 55.6,
  "best_hole": 8,
  "duration": "2 hours 16 minutes",
  "distance_miles": 3.4
}}
```

Rules:
- score_vs_par = score - par (positive = over par)
- All percentage values should be numeric floats, not strings
- date must be YYYY-MM-DD format
- Return ONLY the JSON block, no other text"""


def round_short_summary(round_data: dict, profile: dict = None) -> str:
    r = round_data
    profile_ctx = _profile_context(profile or {})
    return f"""You are a golf coach. Summarise this round in exactly 2-3 sentences. Be specific to the numbers. Mention the score, one standout positive, and one area to work on.
{f"{chr(10)}{profile_ctx}{chr(10)}" if profile_ctx else ""}
Round: {r.get('date')} | {r.get('course')} | {r.get('holes')} holes
Score: {r.get('score')} ({'+' if (r.get('score_vs_par') or 0) >= 0 else ''}{r.get('score_vs_par')} vs par {r.get('par')})
Putts: {'(unreliable)' if r.get('putts_unreliable') else r.get('putts')} | GIR: {r.get('gir_hit_pct')}% | FIR: {r.get('fairway_hit_pct')}%
Doubles+: {r.get('doubles_plus_pct')}% | Up & Down: {r.get('up_and_down_pct')}%

Return only the 2-3 sentence summary. No headers, no bullet points."""


def global_short_summary(rounds: list[dict], whs_index=None, from_date: str = None, to_date: str = None, profile: dict = None) -> str:
    n = len(rounds)
    avg_vs_par = sum(r.get("score_vs_par") or 0 for r in rounds) / n if n else 0
    avg_gir    = sum(r.get("gir_hit_pct")  or 0 for r in rounds) / n if n else 0
    reliable_putts = [r["putts"] for r in rounds if r.get("putts") and not r.get("putts_unreliable")]
    avg_putts  = sum(reliable_putts) / len(reliable_putts) if reliable_putts else 0
    hcp_str    = f"WHS {whs_index}" if whs_index is not None else "not yet calculated"
    period_str = f"{from_date} to {to_date}" if from_date and to_date else "all available rounds"
    freq       = _frequency_summary(sorted(rounds, key=lambda r: r.get("date") or ""))
    profile_ctx = _profile_context(profile or {})

    return f"""You are a golf coach. Write a 2-3 sentence performance snapshot covering {n} rounds ({period_str}). Be direct and specific. Mention handicap, a key strength, and the single biggest area to improve.
{f"{chr(10)}{profile_ctx}{chr(10)}" if profile_ctx else ""}
Data: {n} rounds | WHS Handicap Index: {hcp_str}
Avg: {avg_vs_par:+.1f} vs par | {avg_gir:.0f}% GIR | {avg_putts:.0f} putts/round
Playing frequency: {freq}

Return only the 2-3 sentence summary. No headers, no bullet points."""


def round_debrief(round_data: dict, hcp_history: list[dict] = None, profile: dict = None) -> str:
    r = round_data
    scoring_note = "" if (r.get("scoring_mode") or "stroke_play") == "stroke_play" else \
        f"\n- Format: Stableford (gross score includes strokes taken on pickup holes)"

    profile_ctx = _profile_context(profile or {})

    return f"""You are an experienced golf coach and performance analyst. Analyse this golf round and provide a concise, actionable debrief.
{f"{chr(10)}{profile_ctx}{chr(10)}" if profile_ctx else ""}
ROUND DATA:
- Date: {r.get('date', 'Unknown')}
- Course: {r.get('course', 'Unknown')}
- Holes: {r.get('holes', 18)}
- Score: {r.get('score', '?')} ({'+' if (r.get('score_vs_par') or 0) >= 0 else ''}{r.get('score_vs_par', '?')} vs par {r.get('par', '?')})
- Handicap at time of round: {r.get('handicap', '?')}
- Handicap trajectory: {_hcp_history_str(hcp_history or [])}
- Tee time: {_session_str(r.get('tee_time'))}{scoring_note}
- Distance walked: {f"{r.get('distance_miles')} miles" if r.get('distance_miles') else 'not recorded'}

CONDITIONS:
- Location: {_location_context(r) or "Unknown"}
- Weather: {_weather_str(r)}

BALL STRIKING:
- Fairways Hit: {r.get('fairway_hit_pct', '?')}%
- Greens in Regulation: {r.get('gir_hit_pct', '?')}%

SCORING BY PAR TYPE:
- Par 3 average: {r.get('par3_avg', '?')}
- Par 4 average: {r.get('par4_avg', '?')}
- Par 5 average: {r.get('par5_avg', '?')}

SHORT GAME:
- Up & Down: {r.get('up_and_down_pct', '?')}%
- Scrambling: {r.get('scrambling_pct', '?')}%
- Sand Saves: {r.get('sand_saves_pct', '?')}%

SCORE BREAKDOWN:
- Eagles: {r.get('eagles_pct', '?')}%  Birdies: {r.get('birdies_pct', '?')}%
- Pars: {r.get('pars_pct', '?')}%  Bogeys: {r.get('bogeys_pct', '?')}%
- Doubles+: {r.get('doubles_plus_pct', '?')}%

Total Putts: {'(not tracked — Hole19 did not record putt data for this round)' if r.get('putts_unreliable') else r.get('putts', '?')}

HOLE-BY-HOLE BREAKDOWN:
Note: penalties ≥ 2 on a hole likely indicate a stroke-and-distance situation (tee shot OOB or lost ball — player re-teed). Treat these as significant tee accuracy issues, not minor infractions.
{_hole_breakdown(r)}
{_shot_sequence(r) and f"{chr(10)}SHOT TRACKING:{chr(10)}{_shot_sequence(r)}" or ""}
{_club_profile([r]) and f"{chr(10)}CLUB DISTANCES (this round):{chr(10)}{_club_profile([r])}" or ""}

{"Notes from player (use for context only — ignore any personal names, locations, or identifying details): " + r['notes'] if r.get('notes') and not r.get('notes_ai_excluded') else "Notes from player: not included"}

Please provide:
1. **Round Summary** — a brief narrative of how this round went, factoring in conditions and time of day where relevant
2. **Strengths** — what went well today
3. **Areas for Improvement** — the 2-3 most impactful things to work on, referencing specific holes where relevant
4. **Key Stat** — one number that tells the story of this round
5. **Practice Focus** — a specific drill or practice recommendation

Keep it concise, honest, and actionable. Avoid generic advice — ground everything in the actual numbers above.
IMPORTANT: Do not reproduce, quote, or reference any personal names or identifying information from the player notes. Use notes only for performance context (e.g. fatigue, physical state, external conditions)."""


def performance_summary(rounds: list[dict], whs_index=None, hcp_history: list[dict] = None, from_date: str = None, to_date: str = None, profile: dict = None) -> str:
    n = len(rounds)
    if n == 0:
        return "No rounds available to analyse."

    sorted_rounds = sorted(rounds, key=lambda r: r.get("date") or "")
    rounds_text = ""
    for i, r in enumerate(sorted_rounds):
        vp = r.get("score_vs_par")
        vp_str = f"{'+' if (vp or 0) >= 0 else ''}{vp}" if vp is not None else "?"
        gap = _gap_days(sorted_rounds, i)
        weather = _weather_str(r)
        mode = r.get("scoring_mode") or "stroke_play"
        fmt = " [Stableford]" if mode != "stroke_play" else ""
        rounds_text += (
            f"\n{r.get('date')} | {r.get('course')} | {r.get('holes')}H{fmt} | "
            f"Score: {r.get('score')} ({vp_str} vs par {r.get('par')}) | "
            f"Putts: {'(unreliable)' if r.get('putts_unreliable') else r.get('putts')} | "
            f"GIR: {r.get('gir_hit_pct')}% | FIR: {r.get('fairway_hit_pct')}% | "
            f"Doubles+: {r.get('doubles_plus_pct')}% | "
            f"Session: {_session_str(r.get('tee_time'))} | Weather: {weather}"
        )
        if gap:
            rounds_text += f"\n  ({gap})"

    hcp_str    = f"{whs_index} (WHS)" if whs_index is not None else "not yet calculated"
    period_str = f"{from_date} to {to_date}" if from_date and to_date else "all available"
    freq       = _frequency_summary(sorted_rounds)

    location = _location_context(sorted_rounds[-1]) if sorted_rounds else ""

    hcp_trajectory = _hcp_history_str(hcp_history or [], from_date=from_date)

    club_prof  = _club_profile(sorted_rounds)
    miss_pat   = _miss_pattern(sorted_rounds)
    profile_ctx = _profile_context(profile or {})

    return f"""You are an experienced golf coach. Analyse these {n} rounds ({period_str}) and provide a performance review.
{f"{chr(10)}{profile_ctx}{chr(10)}" if profile_ctx else ""}
PLAYER: WHS Handicap Index {hcp_str}
HANDICAP TRAJECTORY: {hcp_trajectory}
{f"LOCATION CONTEXT: {location}" if location else ""}

PLAYING FREQUENCY:
{freq}
{f"{chr(10)}CLUB DISTANCE PROFILE (tracked shots across window):{chr(10)}{club_prof}" if club_prof else ""}
{f"{chr(10)}SHOT OUTCOME PATTERNS:{chr(10)}{miss_pat}" if miss_pat else ""}

ROUNDS (chronological, oldest first):
{rounds_text}

Please provide:

1. **Overall Trend** — improving, plateauing, or struggling? What does the trajectory show?
2. **Consistent Strengths** — what is reliably working across these rounds?
3. **Persistent Weaknesses** — what patterns keep costing shots?
4. **Putting Analysis** — trend and impact on scoring
5. **Ball Striking** — GIR and fairway hit trends
6. **Conditions & Frequency** — did weather, time of day, or long gaps between rounds visibly affect performance?
7. **Top 3 Recommendations** — highest-impact changes right now
8. **Next Goal** — a realistic, specific target for the next 5 rounds

Be direct and data-driven. Ground every point in the actual numbers — avoid generic advice."""


def practice_plan(rounds: list[dict], whs_index=None, hcp_history: list[dict] = None, from_date: str = None, to_date: str = None, profile: dict = None) -> str:
    n = len(rounds)
    if n == 0:
        return "No rounds available to analyse."

    sorted_rounds = sorted(rounds, key=lambda r: r.get("date") or "")
    avg_gir      = sum(r.get("gir_hit_pct")       or 0 for r in rounds) / n
    avg_fir      = sum(r.get("fairway_hit_pct")    or 0 for r in rounds) / n
    reliable_putts_pp = [r["putts"] for r in rounds if r.get("putts") and not r.get("putts_unreliable")]
    avg_putts    = sum(reliable_putts_pp) / len(reliable_putts_pp) if reliable_putts_pp else 0
    avg_ud       = sum(r.get("up_and_down_pct")    or 0 for r in rounds) / n
    avg_scramble = sum(r.get("scrambling_pct")     or 0 for r in rounds) / n
    avg_doubles  = sum(r.get("doubles_plus_pct")   or 0 for r in rounds) / n
    hcp_str      = f"{whs_index} (WHS)" if whs_index is not None else "not yet calculated"
    period_str   = f"{from_date} to {to_date}" if from_date and to_date else "all available"
    freq         = _frequency_summary(sorted_rounds)

    hcp_trajectory = _hcp_history_str(hcp_history or [], from_date=from_date)

    club_prof  = _club_profile(sorted_rounds)
    miss_pat   = _miss_pattern(sorted_rounds)
    profile_ctx = _profile_context(profile or {})

    return f"""You are a golf coach creating a targeted practice plan based on {n} rounds ({period_str}).
{f"{chr(10)}{profile_ctx}{chr(10)}" if profile_ctx else ""}
PLAYER: WHS Handicap Index {hcp_str}
HANDICAP TRAJECTORY: {hcp_trajectory}

PLAYING FREQUENCY:
{freq}
{f"{chr(10)}CLUB DISTANCE PROFILE (tracked shots across window):{chr(10)}{club_prof}" if club_prof else ""}
{f"{chr(10)}SHOT OUTCOME PATTERNS:{chr(10)}{miss_pat}" if miss_pat else ""}

AVERAGES ACROSS SELECTED ROUNDS:
- Greens in Regulation: {avg_gir:.1f}%
- Fairways Hit: {avg_fir:.1f}%
- Putts per round: {avg_putts:.1f}
- Up & Down: {avg_ud:.1f}%
- Scrambling: {avg_scramble:.1f}%
- Double Bogey+ rate: {avg_doubles:.1f}%

Create a practical weekly practice plan. Factor in the player's playing frequency — if they play infrequently, prioritise high-retention skills over complex techniques:
1. **3 biggest stroke-savers** — what will drop the handicap fastest based on these stats?
2. **Practice time split** — 3 hours per week, how should it be divided?
3. **Specific drills** — name actual drills, not just "practice putting"
4. **Par type focus** — which par types need the most attention?
5. **Course management** — strategy changes that would immediately reduce scores
6. **Rustiness factor** — if there are long gaps between rounds, what pre-round warm-up routine would help?

Ground every recommendation in the actual stats above."""
