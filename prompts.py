"""AI prompt templates for FairwayIQ golf analysis."""


def round_debrief(round_data: dict) -> str:
    r = round_data
    return f"""You are an experienced golf coach and performance analyst. Analyse this golf round and provide a concise, actionable debrief.

ROUND DATA:
- Date: {r.get('date', 'Unknown')}
- Course: {r.get('course', 'Unknown')}
- Holes: {r.get('holes', 18)}
- Score: {r.get('score', '?')} ({'+' if (r.get('score_vs_par') or 0) >= 0 else ''}{r.get('score_vs_par', '?')} vs par {r.get('par', '?')})
- Handicap at time: {r.get('handicap', '?')}
- Total Putts: {r.get('putts', '?')}

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

Notes from player: {r.get('notes') or 'None'}

Please provide:
1. **Round Summary** — a brief narrative of how this round went
2. **Strengths** — what went well today
3. **Areas for Improvement** — the 2-3 most impactful things to work on
4. **Key Stat** — one number that tells the story of this round
5. **Practice Focus** — a specific drill or practice recommendation

Keep it concise, honest, and actionable. Avoid generic advice — ground everything in the actual numbers above."""


def performance_summary(rounds: list[dict]) -> str:
    n = len(rounds)
    if n == 0:
        return "No rounds available to analyse."

    rounds_text = ""
    for i, r in enumerate(rounds[-10:], 1):
        rounds_text += (
            f"\nRound {i}: {r.get('date')} | {r.get('course')} | "
            f"Score: {r.get('score')} ({'+' if (r.get('score_vs_par') or 0) >= 0 else ''}{r.get('score_vs_par')} vs par) | "
            f"HCP: {r.get('handicap')} | Putts: {r.get('putts')} | "
            f"GIR: {r.get('gir_hit_pct')}% | FIR: {r.get('fairway_hit_pct')}%"
        )

    latest_hcp = rounds[-1].get("handicap") if rounds else "?"
    earliest_hcp = rounds[0].get("handicap") if rounds else "?"

    return f"""You are an experienced golf coach. Analyse the following {n} rounds of golf data and provide a performance review.

ROUNDS (chronological order):
{rounds_text}

HANDICAP PROGRESSION: {earliest_hcp} → {latest_hcp}

Please provide a structured performance review covering:

1. **Overall Trend** — is this player improving, plateauing, or struggling? What does the trajectory look like?
2. **Consistent Strengths** — what aspects of the game are reliably good across rounds?
3. **Persistent Weaknesses** — what patterns keep costing shots?
4. **Putting Analysis** — how is the putting trend looking?
5. **Ball Striking Trend** — GIR and fairway trends
6. **Top 3 Recommendations** — the highest-impact changes this player could make right now
7. **Next Goal** — a realistic, specific target for the next 5 rounds

Be direct, data-driven, and honest. Avoid generic golf advice — everything should be grounded in the actual data patterns."""


def practice_plan(rounds: list[dict]) -> str:
    n = len(rounds)
    if n == 0:
        return "No rounds available to analyse."

    # Compute some averages for context
    avg_gir = sum(r.get("gir_hit_pct") or 0 for r in rounds) / n
    avg_fir = sum(r.get("fairway_hit_pct") or 0 for r in rounds) / n
    avg_putts = sum(r.get("putts") or 0 for r in rounds) / n
    avg_ud = sum(r.get("up_and_down_pct") or 0 for r in rounds) / n
    avg_scramble = sum(r.get("scrambling_pct") or 0 for r in rounds) / n
    avg_doubles = sum(r.get("doubles_plus_pct") or 0 for r in rounds) / n
    latest_hcp = rounds[-1].get("handicap") if rounds else "?"

    return f"""You are a golf coach creating a targeted practice plan. Use the player's statistics to design an efficient, prioritised practice schedule.

PLAYER PROFILE:
- Current Handicap: {latest_hcp}
- Rounds analysed: {n}

AVERAGES ACROSS ALL ROUNDS:
- Greens in Regulation: {avg_gir:.1f}%
- Fairways Hit: {avg_fir:.1f}%
- Putts per round: {avg_putts:.1f}
- Up & Down: {avg_ud:.1f}%
- Scrambling: {avg_scramble:.1f}%
- Double Bogey+ rate: {avg_doubles:.1f}%

Create a practical weekly practice plan that:
1. **Identifies the 3 biggest stroke-savers** based on the stats — what will drop the handicap fastest?
2. **Allocates practice time** — if this player has 3 hours per week to practice, how should they split it?
3. **Specific drills** — name actual drills for each area, not just "practice putting"
4. **Scoring zones focus** — highlight which par types need the most attention
5. **On-course strategy tips** — any course management changes that would immediately reduce scores

Keep it realistic for an 18-20 handicap player with limited practice time."""
