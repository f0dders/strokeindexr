"""AI prompt templates for StrokeIndexr golf analysis."""

from datetime import date as _date


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


def round_short_summary(round_data: dict) -> str:
    r = round_data
    return f"""You are a golf coach. Summarise this round in exactly 2-3 sentences. Be specific to the numbers. Mention the score, one standout positive, and one area to work on.

Round: {r.get('date')} | {r.get('course')} | {r.get('holes')} holes
Score: {r.get('score')} ({'+' if (r.get('score_vs_par') or 0) >= 0 else ''}{r.get('score_vs_par')} vs par {r.get('par')})
Putts: {'(unreliable)' if r.get('putts_unreliable') else r.get('putts')} | GIR: {r.get('gir_hit_pct')}% | FIR: {r.get('fairway_hit_pct')}%
Doubles+: {r.get('doubles_plus_pct')}% | Up & Down: {r.get('up_and_down_pct')}%

Return only the 2-3 sentence summary. No headers, no bullet points."""


def global_short_summary(rounds: list[dict], whs_index=None, from_date: str = None, to_date: str = None) -> str:
    n = len(rounds)
    avg_vs_par = sum(r.get("score_vs_par") or 0 for r in rounds) / n if n else 0
    avg_gir    = sum(r.get("gir_hit_pct")  or 0 for r in rounds) / n if n else 0
    reliable_putts = [r["putts"] for r in rounds if r.get("putts") and not r.get("putts_unreliable")]
    avg_putts  = sum(reliable_putts) / len(reliable_putts) if reliable_putts else 0
    hcp_str    = f"WHS {whs_index}" if whs_index is not None else "not yet calculated"
    period_str = f"{from_date} to {to_date}" if from_date and to_date else "all available rounds"
    freq       = _frequency_summary(sorted(rounds, key=lambda r: r.get("date") or ""))

    return f"""You are a golf coach. Write a 2-3 sentence performance snapshot covering {n} rounds ({period_str}). Be direct and specific. Mention handicap, a key strength, and the single biggest area to improve.

Data: {n} rounds | WHS Handicap Index: {hcp_str}
Avg: {avg_vs_par:+.1f} vs par | {avg_gir:.0f}% GIR | {avg_putts:.0f} putts/round
Playing frequency: {freq}

Return only the 2-3 sentence summary. No headers, no bullet points."""


def round_debrief(round_data: dict) -> str:
    r = round_data
    scoring_note = "" if (r.get("scoring_mode") or "stroke_play") == "stroke_play" else \
        f"\n- Format: Stableford (gross score includes strokes taken on pickup holes)"

    return f"""You are an experienced golf coach and performance analyst. Analyse this golf round and provide a concise, actionable debrief.

ROUND DATA:
- Date: {r.get('date', 'Unknown')}
- Course: {r.get('course', 'Unknown')}
- Holes: {r.get('holes', 18)}
- Score: {r.get('score', '?')} ({'+' if (r.get('score_vs_par') or 0) >= 0 else ''}{r.get('score_vs_par', '?')} vs par {r.get('par', '?')})
- Handicap at time of round: {r.get('handicap', '?')}
- Tee time: {_session_str(r.get('tee_time'))}{scoring_note}
- Distance walked: {f"{r.get('distance_miles')} miles" if r.get('distance_miles') else 'not recorded'}

CONDITIONS:
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

Notes from player: {r.get('notes') or 'None'}

Please provide:
1. **Round Summary** — a brief narrative of how this round went, factoring in conditions and time of day where relevant
2. **Strengths** — what went well today
3. **Areas for Improvement** — the 2-3 most impactful things to work on
4. **Key Stat** — one number that tells the story of this round
5. **Practice Focus** — a specific drill or practice recommendation

Keep it concise, honest, and actionable. Avoid generic advice — ground everything in the actual numbers above."""


def performance_summary(rounds: list[dict], whs_index=None, from_date: str = None, to_date: str = None) -> str:
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

    return f"""You are an experienced golf coach. Analyse these {n} rounds ({period_str}) and provide a performance review.

PLAYER: WHS Handicap Index {hcp_str}

PLAYING FREQUENCY:
{freq}

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


def practice_plan(rounds: list[dict], whs_index=None, from_date: str = None, to_date: str = None) -> str:
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

    return f"""You are a golf coach creating a targeted practice plan based on {n} rounds ({period_str}).

PLAYER: WHS Handicap Index {hcp_str}

PLAYING FREQUENCY:
{freq}

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
