"""Hole19 round URL scraper — extracts from embedded React JSON props."""

import json
import re
import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


def _extract_hole19_id(url: str) -> str:
    return url.rstrip("/").split("/")[-1]


def _parse_scorecard(data: dict) -> dict:
    """Extract fields from the MyScorecard React component JSON."""
    out = {}
    out["course"] = data.get("course_name")
    out["par"] = data.get("course_par")
    out["holes"] = data.get("holes_number")
    out["handicap"] = data.get("playing_hcp")

    played = data.get("played_date", "")
    if played:
        out["date"] = played[:10]  # yyyy-mm-dd

    holes = data.get("holes", [])
    if holes:
        total_strokes = sum(h["hole_score"]["total_of_strokes"] for h in holes if not h["hole_score"].get("scratched"))
        total_putts   = sum(h["hole_score"].get("total_of_putts", 0) for h in holes)
        total_par     = sum(h["hole_tee"]["par"] for h in holes)

        out["score"]        = total_strokes
        out["putts"]        = total_putts
        out["score_vs_par"] = total_strokes - total_par

        # GIR
        gir_eligible = [h for h in holes if h["hole_score"].get("green_in_regulation") is not None]
        if gir_eligible:
            gir_hit = sum(1 for h in gir_eligible if h["hole_score"]["green_in_regulation"])
            out["gir_hit_pct"]  = round(gir_hit / len(gir_eligible) * 100, 1)
            out["gir_missed_pct"] = round(100 - out["gir_hit_pct"], 1)

        # Fairways (only par 4s/5s eligible)
        fir_eligible = [h for h in holes if h["hole_tee"]["par"] >= 4 and h["hole_score"].get("fairway_hit") is not None]
        if fir_eligible:
            fir_hit  = sum(1 for h in fir_eligible if h["hole_score"]["fairway_hit"] in ("center", "target"))
            fir_miss = sum(1 for h in fir_eligible if h["hole_score"]["fairway_hit"] in ("left", "right"))
            out["fairway_hit_pct"]    = round(fir_hit / len(fir_eligible) * 100, 1)
            out["fairway_missed_pct"] = round(fir_miss / len(fir_eligible) * 100, 1)
            out["fairway_other_pct"]  = round(100 - out["fairway_hit_pct"] - out["fairway_missed_pct"], 1)

        # Par averages
        for par_val in (3, 4, 5):
            par_holes = [h for h in holes if h["hole_tee"]["par"] == par_val and not h["hole_score"].get("scratched")]
            if par_holes:
                avg = sum(h["hole_score"]["total_of_strokes"] for h in par_holes) / len(par_holes)
                out[f"par{par_val}_avg"] = round(avg, 2)

        if holes:
            out["overall_avg"] = round(total_strokes / len(holes), 2)

        # Score distribution
        n = len(holes)
        def count_pct(fn): return round(sum(1 for h in holes if fn(h)) / n * 100, 1) if n else 0
        out["eagles_pct"]      = count_pct(lambda h: h["hole_score"]["total_of_strokes"] <= h["hole_tee"]["par"] - 2)
        out["birdies_pct"]     = count_pct(lambda h: h["hole_score"]["total_of_strokes"] == h["hole_tee"]["par"] - 1)
        out["pars_pct"]        = count_pct(lambda h: h["hole_score"]["total_of_strokes"] == h["hole_tee"]["par"])
        out["bogeys_pct"]      = count_pct(lambda h: h["hole_score"]["total_of_strokes"] == h["hole_tee"]["par"] + 1)
        out["doubles_plus_pct"]= count_pct(lambda h: h["hole_score"]["total_of_strokes"] >= h["hole_tee"]["par"] + 2)

        # Best hole (lowest vs par)
        best = min(holes, key=lambda h: h["hole_score"]["total_of_strokes"] - h["hole_tee"]["par"])
        out["best_hole"] = best["sequence"]

        out["holes_json"] = json.dumps(holes)

    return out


def _parse_stats(text: str) -> dict:
    """Extract the inline JS stats object (driving_accuracy, etc.)."""
    out = {}
    m = re.search(
        r"driving_accuracy:\s*[\"']([\d.]+)[\"'].*?"
        r"percentage_fairways_left:\s*[\"']([\d.]+)[\"'].*?"
        r"percentage_fairways_right:\s*[\"']([\d.]+)[\"'].*?"
        r"percentage_gir_hit:\s*[\"']([\d.]+)[\"'].*?"
        r"percentage_gir_miss:\s*[\"']([\d.]+)[\"'].*?"
        r"putts:\s*[\"']([\d.]+)[\"']",
        text, re.S
    )
    if m:
        fir = float(m.group(1))
        fl  = float(m.group(2))
        fr  = float(m.group(3))
        out["fairway_hit_pct"]    = fir
        out["fairway_missed_pct"] = round(fl + fr, 1)
        out["fairway_other_pct"]  = round(100 - fir - (fl + fr), 1)
        out["gir_hit_pct"]  = float(m.group(4))
        out["gir_missed_pct"] = float(m.group(5))
        out["putts"] = int(float(m.group(6)))

    # Up & Down
    ud = re.search(r"up_and_down_percentage:\s*[\"']([\d.]+)[\"']", text)
    if ud: out["up_and_down_pct"] = float(ud.group(1))

    scr = re.search(r"scrambling_percentage:\s*[\"']([\d.]+)[\"']", text)
    if scr: out["scrambling_pct"] = float(scr.group(1))

    ss = re.search(r"sand_saves_percentage:\s*[\"']([\d.]+)[\"']", text)
    if ss: out["sand_saves_pct"] = float(ss.group(1))

    dur = re.search(r"duration[\"']?\s*[:=]\s*[\"']([\w\s]+)[\"']", text, re.I)
    if dur: out["duration"] = dur.group(1).strip()

    dist = re.search(r"distance[\"']?\s*[:=]\s*[\"']([\d.]+)[\"']", text, re.I)
    if dist: out["distance_miles"] = float(dist.group(1))

    return out


def scrape_round(url: str) -> dict:
    """Fetch a Hole19 round page and return a dict ready for DB insertion."""
    resp = requests.get(url, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    data: dict = {
        "hole19_url": url,
        "hole19_id": _extract_hole19_id(url),
    }

    # Primary source: React on Rails JSON props embedded in <script type="application/json">
    for script in soup.find_all("script", {"type": "application/json"}):
        try:
            props = json.loads(script.string)
        except Exception:
            continue

        component = script.get("data-component-name", "")

        if component == "MyScorecard" and "data" in props:
            data.update(_parse_scorecard(props["data"]))

        # RoundStats or similar component
        if "driving_accuracy" in str(props):
            stats_data = props.get("data", props)
            if isinstance(stats_data, dict):
                if "driving_accuracy" in stats_data:
                    fir = float(stats_data.get("driving_accuracy", 0))
                    fl  = float(stats_data.get("percentage_fairways_left", 0))
                    fr  = float(stats_data.get("percentage_fairways_right", 0))
                    data.setdefault("fairway_hit_pct", fir)
                    data.setdefault("fairway_missed_pct", round(fl + fr, 1))
                    data.setdefault("gir_hit_pct", float(stats_data.get("percentage_gir_hit", 0)))
                    data.setdefault("gir_missed_pct", float(stats_data.get("percentage_gir_miss", 0)))
                    data.setdefault("putts", int(float(stats_data.get("putts", 0))))
                    if "up_and_down_percentage" in stats_data:
                        data["up_and_down_pct"] = float(stats_data["up_and_down_percentage"])
                    if "scrambling_percentage" in stats_data:
                        data["scrambling_pct"] = float(stats_data["scrambling_percentage"])
                    if "sand_saves_percentage" in stats_data:
                        data["sand_saves_pct"] = float(stats_data["sand_saves_percentage"])

    # Fallback: parse inline JS stats blob
    if "gir_hit_pct" not in data:
        fallback = _parse_stats(resp.text)
        for k, v in fallback.items():
            data.setdefault(k, v)

    # Distance and duration from page text
    full_text = resp.text
    dist_m = re.search(r"([\d.]+)\s*miles?", full_text, re.I)
    if dist_m:
        data.setdefault("distance_miles", float(dist_m.group(1)))

    dur_m = re.search(r"(\d+\s*h(?:ours?)?\s*\d*\s*m(?:in(?:utes?)?)?)", full_text, re.I)
    if dur_m:
        data.setdefault("duration", dur_m.group(1).strip())

    return data
