"""Flask server for StrokeIndexr."""

from flask import Flask, request, jsonify, Response, send_from_directory
from database import (
    init_db, insert_round, replace_round, find_duplicate,
    get_rounds, get_round, delete_round,
    update_notes, save_debrief, save_short_summary, set_handicap_excluded,
    get_global_summary, save_global_summary,
    get_latest_round_date, get_rounds_in_window,
    get_stats_summary, get_trend_data,
    get_courses, get_course, update_course_ratings,
    get_rounds_for_course, get_all_rounds_with_course_ratings,
    sync_courses, TEE_COLOURS,
    get_courses_with_hierarchy, get_suggested_links,
    link_courses, unlink_course,
    load_config, save_config,
)
from whs import current_index, index_history
from scraper import scrape_round
import prompts

app = Flask(__name__, static_folder="static", static_url_path="")


# ── Static files ──────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# ── Rounds API ────────────────────────────────────────────────────────────────

@app.route("/api/rounds", methods=["GET"])
def api_get_rounds():
    return jsonify(get_rounds())


@app.route("/api/rounds/<int:round_id>", methods=["GET"])
def api_get_round(round_id):
    r = get_round(round_id)
    if not r:
        return jsonify({"error": "Not found"}), 404
    return jsonify(r)


@app.route("/api/rounds/<int:round_id>", methods=["DELETE"])
def api_delete_round(round_id):
    delete_round(round_id)
    return jsonify({"ok": True})


@app.route("/api/rounds/<int:round_id>/notes", methods=["POST"])
def api_update_notes(round_id):
    notes = request.json.get("notes", "")
    update_notes(round_id, notes)
    return jsonify({"ok": True})


@app.route("/api/import", methods=["POST"])
def api_import():
    body = request.json or {}
    url = body.get("url", "").strip()
    overwrite = body.get("overwrite", False)
    if not url:
        return jsonify({"error": "No URL provided"}), 400
    if "hole19golf.com" not in url:
        return jsonify({"error": "URL must be a Hole19 round URL"}), 400
    try:
        data = scrape_round(url)
        existing = find_duplicate(data)
        if existing and not overwrite:
            return jsonify({"duplicate": True, "existing": {
                "id": existing["id"], "course": existing["course"],
                "date": existing["date"], "score": existing["score"],
            }}), 409
        if existing and overwrite:
            rid = replace_round(existing["id"], data)
        else:
            rid = insert_round(data)
        sync_courses()
        return jsonify({"ok": True, "id": rid, "data": data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/import/email", methods=["POST"])
def api_import_email():
    """Parse a pasted Hole19 email. Uses structured parser first, AI as fallback."""
    import json as _json, re as _re
    from email_parser import parse_hole19_email
    body = request.json or {}
    text = body.get("text", "").strip()
    overwrite = body.get("overwrite", False)
    if not text:
        return jsonify({"error": "No email text provided"}), 400

    # ── Primary: structured parser (instant, no API cost) ────────────────────
    try:
        data = parse_hole19_email(text)
        method = "structured"
    except Exception as parse_err:
        # ── Fallback: AI extraction ───────────────────────────────────────────
        try:
            provider = _build_provider()
            raw = "".join(provider.stream(prompts.parse_email(text)))
            m = _re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, _re.S)
            if not m:
                m = _re.search(r"(\{[^{}]{50,}\})", raw, _re.S)
            if not m:
                return jsonify({"error": f"Structured parser failed ({parse_err}) and AI could not extract data either"}), 422
            data = _json.loads(m.group(1))
            method = "ai"
        except Exception as ai_err:
            return jsonify({"error": f"Structured parse failed: {parse_err}. AI fallback failed: {ai_err}"}), 500

    if not data.get("date") or not data.get("course"):
        return jsonify({"error": "Could not extract date or course from email"}), 422

    try:
        existing = find_duplicate(data)
        if existing and not overwrite:
            return jsonify({"duplicate": True, "existing": {
                "id": existing["id"], "course": existing["course"],
                "date": existing["date"], "score": existing["score"],
            }}), 409
        if existing and overwrite:
            rid = replace_round(existing["id"], data)
        else:
            rid = insert_round(data)
        sync_courses()
        return jsonify({"ok": True, "id": rid, "data": data, "method": method})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Courses API ──────────────────────────────────────────────────────────────

@app.route("/api/courses/suggestions", methods=["GET"])
def api_course_suggestions():
    return jsonify(get_suggested_links())


@app.route("/api/courses/link", methods=["POST"])
def api_link_courses():
    body = request.json or {}
    child_ids  = body.get("child_ids", [])
    parent_name = body.get("parent_name", "")
    if not child_ids or not parent_name:
        return jsonify({"error": "child_ids and parent_name required"}), 400
    parent_id = link_courses(child_ids, parent_name)
    return jsonify({"ok": True, "parent_id": parent_id})


@app.route("/api/courses/<int:course_id>/unlink", methods=["POST"])
def api_unlink_course(course_id):
    unlink_course(course_id)
    return jsonify({"ok": True})


@app.route("/api/courses", methods=["GET"])
def api_get_courses():
    courses = get_courses_with_hierarchy()
    # Annotate each with aggregate stats from rounds
    import json as _json

    def annotate(c):
        rounds = get_rounds_for_course(c["name"])
        # Include children's rounds in parent stats
        for child in c.get("children", []):
            rounds += get_rounds_for_course(child["name"])
        scores_vs_par = [r["score_vs_par"] for r in rounds if r.get("score_vs_par") is not None]
        c["times_played"]  = len(rounds)
        c["best_vs_par"]   = min(scores_vs_par) if scores_vs_par else None
        c["avg_vs_par"]    = round(sum(scores_vs_par) / len(scores_vs_par), 1) if scores_vs_par else None
        putts = [r["putts"] for r in rounds if r.get("putts")]
        c["avg_putts"]     = round(sum(putts) / len(putts), 1) if putts else None
        gir = [r["gir_hit_pct"] for r in rounds if r.get("gir_hit_pct") is not None]
        c["avg_gir"]       = round(sum(gir) / len(gir), 1) if gir else None
        fir = [r["fairway_hit_pct"] for r in rounds if r.get("fairway_hit_pct") is not None]
        c["avg_fir"]       = round(sum(fir) / len(fir), 1) if fir else None
        return c

    for c in courses:
        annotate(c)
        for child in c.get("children", []):
            annotate(child)
    return jsonify(courses)


@app.route("/api/courses/<int:course_id>", methods=["GET"])
def api_get_course(course_id):
    from database import get_courses_with_hierarchy
    c = get_course(course_id)
    if not c:
        return jsonify({"error": "Not found"}), 404

    # Attach children if this is a parent course
    all_courses = get_courses_with_hierarchy()
    for entry in all_courses:
        if entry["id"] == course_id:
            c["children"] = entry.get("children", [])
            break
    else:
        c["children"] = []

    # Gather rounds: own rounds + all children's rounds
    own_rounds = get_rounds_for_course(c["name"])
    child_rounds = []
    for child in c["children"]:
        child["rounds"] = get_rounds_for_course(child["name"])
        child_rounds += child["rounds"]
    all_rounds = own_rounds + child_rounds

    # Split by hole count for the breakdown
    rounds_18 = [r for r in all_rounds if (r.get("holes") or 0) > 9]
    rounds_9  = [r for r in all_rounds if (r.get("holes") or 0) <= 9]
    rounds = all_rounds

    # Per-hole averages across all rounds that have holes_json
    import json as _json
    hole_totals = {}  # seq -> {strokes, putts, gir_hits, gir_total, fir_hits, fir_total, count}
    for r in rounds:
        if not r.get("holes_json"):
            continue
        try:
            holes = _json.loads(r["holes_json"])
        except Exception:
            continue
        for h in holes:
            seq = h.get("sequence")
            hs  = h.get("hole_score", {})
            ht  = h.get("hole_tee", {})
            if seq is None:
                continue
            if seq not in hole_totals:
                hole_totals[seq] = {"par": ht.get("par"), "strokes": 0, "putts": 0,
                                    "gir_hits": 0, "gir_total": 0,
                                    "fir_hits": 0, "fir_total": 0, "count": 0}
            t = hole_totals[seq]
            t["strokes"] += hs.get("total_of_strokes") or 0
            t["putts"]   += hs.get("total_of_putts") or 0
            t["count"]   += 1
            if hs.get("green_in_regulation") is not None:
                t["gir_total"] += 1
                if hs["green_in_regulation"]:
                    t["gir_hits"] += 1
            par = ht.get("par", 4)
            if par >= 4 and hs.get("fairway_hit") is not None:
                t["fir_total"] += 1
                if hs["fairway_hit"] in ("target", "center"):
                    t["fir_hits"] += 1

    per_hole = []
    for seq in sorted(hole_totals):
        t = hole_totals[seq]
        n = t["count"]
        per_hole.append({
            "hole":      seq,
            "par":       t["par"],
            "avg_score": round(t["strokes"] / n, 2) if n else None,
            "avg_putts": round(t["putts"]   / n, 2) if n else None,
            "gir_pct":   round(t["gir_hits"] / t["gir_total"] * 100, 1) if t["gir_total"] else None,
            "fir_pct":   round(t["fir_hits"] / t["fir_total"] * 100, 1) if t["fir_total"] else None,
            "rounds":    n,
        })

    return jsonify({
        **c,
        "rounds":    rounds,
        "rounds_18": rounds_18,
        "rounds_9":  rounds_9,
        "per_hole":  per_hole,
    })


@app.route("/api/courses/<int:course_id>", methods=["PUT"])
def api_update_course(course_id):
    body  = request.json or {}
    notes = body.pop("notes", None)
    update_course_ratings(course_id, ratings=body, notes=notes)
    return jsonify({"ok": True})


@app.route("/api/rounds/<int:round_id>/handicap-exclude", methods=["POST"])
def api_handicap_exclude(round_id):
    excluded = (request.json or {}).get("excluded", False)
    set_handicap_excluded(round_id, excluded)
    return jsonify({"ok": True})


@app.route("/api/rounds/<int:round_id>/tee", methods=["POST"])
def api_set_tee(round_id):
    tee = (request.json or {}).get("tee_colour", "Yellow")
    if tee not in TEE_COLOURS:
        return jsonify({"error": "Invalid tee colour"}), 400
    from database import get_conn
    with get_conn() as conn:
        conn.execute("UPDATE rounds SET tee_colour = ? WHERE id = ?", (tee, round_id))
        conn.commit()
    return jsonify({"ok": True})


# ── WHS API ───────────────────────────────────────────────────────────────────

@app.route("/api/whs", methods=["GET"])
def api_whs():
    rounds = get_all_rounds_with_course_ratings()
    return jsonify({
        "current": current_index(rounds),
        "history": index_history(rounds),
    })


# ── Stats API ─────────────────────────────────────────────────────────────────

@app.route("/api/stats/summary", methods=["GET"])
def api_stats_summary():
    return jsonify(get_stats_summary())


@app.route("/api/stats/trends", methods=["GET"])
def api_stats_trends():
    return jsonify(get_trend_data())


# ── Config API (API keys stored server-side in data/config.json) ──────────────

@app.route("/api/config", methods=["GET"])
def api_get_config():
    cfg = load_config()
    # Mask the key so it never leaves the server in plain text after initial save
    masked = {**cfg}
    if masked.get("api_key"):
        masked["api_key"] = "•" * 8
    return jsonify(masked)


@app.route("/api/config", methods=["POST"])
def api_save_config():
    incoming = request.json or {}
    cfg = load_config()
    # Only overwrite the key if it looks like a real key:
    # - not empty, not the masked placeholder (••••••••)
    # - not an obvious test/placeholder value
    # - never overwrite a real existing key with a shorter/fake one
    _TEST_PATTERNS = ("test", "placeholder", "example", "your-key", "sk-ant-test", "sk-test")
    new_key = incoming.get("api_key", "").strip()
    existing_key = cfg.get("api_key", "")
    is_masked = not new_key.strip("•")
    is_test = any(p in new_key.lower() for p in _TEST_PATTERNS)
    has_real_key = bool(existing_key) and not any(p in existing_key.lower() for p in _TEST_PATTERNS)
    if new_key and not is_masked and not is_test:
        cfg["api_key"] = new_key
    elif is_test and has_real_key:
        pass  # never overwrite a real key with a test value
    cfg["provider"] = incoming.get("provider", cfg.get("provider", "claude"))
    cfg["model"]    = incoming.get("model",    cfg.get("model", ""))
    cfg["base_url"] = incoming.get("base_url", cfg.get("base_url", ""))
    save_config(cfg)
    return jsonify({"ok": True})


# ── AI API ────────────────────────────────────────────────────────────────────

def _safe_stream(provider, prompt, on_complete=None):
    """Wrap provider.stream() so errors mid-stream are surfaced to the client."""
    try:
        buf = []
        for chunk in provider.stream(prompt):
            buf.append(chunk)
            yield chunk
        if on_complete:
            on_complete("".join(buf))
    except Exception as e:
        # Emit a sentinel the frontend can detect — double-newline then the error
        yield f"\n\n__AI_ERROR__: {e}"


def _build_provider():
    """Build an AI provider from the saved server-side config."""
    from providers import (
        ClaudeProvider, OpenAIProvider, GeminiProvider,
        GroqProvider, MistralProvider, OpenRouterProvider,
        OllamaProvider, LMStudioProvider,
    )
    cfg = load_config()
    name = cfg.get("provider", "claude")
    model = cfg.get("model", "")
    key = cfg.get("api_key", "")
    url = cfg.get("base_url", "")

    mapping = {
        "claude":      lambda: ClaudeProvider(api_key=key, model=model or ClaudeProvider.DEFAULT_MODEL),
        "openai":      lambda: OpenAIProvider(api_key=key, model=model or "gpt-4o"),
        "gemini":      lambda: GeminiProvider(api_key=key, model=model or "gemini-1.5-pro"),
        "groq":        lambda: GroqProvider(api_key=key, model=model or "llama3-70b-8192"),
        "mistral":     lambda: MistralProvider(api_key=key, model=model or "mistral-large-latest"),
        "openrouter":  lambda: OpenRouterProvider(api_key=key, model=model or "anthropic/claude-3.5-sonnet"),
        "ollama":      lambda: OllamaProvider(model=model or "llama3", base_url=url or "http://localhost:11434"),
        "lmstudio":    lambda: LMStudioProvider(model=model or "local-model", base_url=url or "http://localhost:1234"),
    }
    factory = mapping.get(name)
    if not factory:
        raise ValueError(f"Unknown provider: {name}")
    return factory()


@app.route("/api/ai/round-debrief/<int:round_id>", methods=["POST"])
def api_ai_round_debrief(round_id):
    r = get_round(round_id)
    if not r:
        return jsonify({"error": "Round not found"}), 404
    try:
        provider = _build_provider()
        prompt = prompts.round_debrief(r)
        return Response(
            _safe_stream(provider, prompt, on_complete=lambda text: save_debrief(round_id, text)),
            mimetype="text/plain",
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/round-short-summary/<int:round_id>", methods=["POST"])
def api_ai_round_short_summary(round_id):
    r = get_round(round_id)
    if not r:
        return jsonify({"error": "Round not found"}), 404
    try:
        provider = _build_provider()
        prompt = prompts.round_short_summary(r)
        text = "".join(provider.stream(prompt))
        if text.startswith("\n\n__AI_ERROR__"):
            return jsonify({"error": text}), 500
        save_short_summary(round_id, text)
        return jsonify({"ok": True, "summary": text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _default_window():
    """Return (from_date, to_date) for the default 90-day window anchored to latest round."""
    from datetime import date, timedelta
    latest = get_latest_round_date()
    if not latest:
        return None, None
    to_dt   = date.fromisoformat(latest)
    from_dt = to_dt - timedelta(days=90)
    return from_dt.isoformat(), to_dt.isoformat()


@app.route("/api/ai/global-summary", methods=["GET"])
def api_get_global_summary():
    from_date, to_date = _default_window()
    return jsonify({
        "performance":  get_global_summary("performance"),
        "practice":     get_global_summary("practice"),
        "default_from": from_date,
        "default_to":   to_date,
        "latest_round_date": get_latest_round_date(),
    })


@app.route("/api/ai/global-summary", methods=["POST"])
def api_gen_global_summary():
    """
    Generate global summary for the requested date window.
    Body: {from_date?, to_date?, type?, auto?}

    Skips generation if the stored summary already covers the same window
    and round count — unless `force` is true.

    If `auto` is true (called from import flow), also skips if the new round
    date is not newer than the stored latest_round_date watermark.
    """
    body      = request.json or {}
    summary_type = body.get("type", "performance")
    force     = body.get("force", False)
    auto      = body.get("auto", False)

    from_date = body.get("from_date")
    to_date   = body.get("to_date")
    if not from_date or not to_date:
        from_date, to_date = _default_window()
    if not from_date:
        return jsonify({"error": "No rounds in database"}), 400

    rounds = get_rounds_in_window(from_date, to_date)
    if not rounds:
        return jsonify({"skipped": True, "reason": "no_rounds_in_window",
                        "from_date": from_date, "to_date": to_date}), 200

    latest_round_date = get_latest_round_date()

    # Auto-regen guard: skip if no new calendar rounds since last generation
    stored = get_global_summary(summary_type)
    if auto and not force and stored:
        stored_watermark = stored.get("latest_round_date")
        if stored_watermark and latest_round_date and latest_round_date <= stored_watermark:
            return jsonify({"skipped": True, "reason": "no_new_rounds"}), 200

    # Manual regen guard: skip if same window and same round count
    if not auto and not force and stored:
        if (stored.get("from_date") == from_date and
                stored.get("to_date") == to_date and
                stored.get("round_count") == len(rounds)):
            return jsonify({"skipped": True, "reason": "window_unchanged"}), 200

    try:
        provider = _build_provider()

        # Get WHS index for richer prompts
        all_rounds_whs = get_all_rounds_with_course_ratings()
        whs = current_index(all_rounds_whs)
        whs_index = whs.get("index")

        short_text = "".join(provider.stream(
            prompts.global_short_summary(rounds, whs_index=whs_index,
                                         from_date=from_date, to_date=to_date)
        ))

        round_count = len(rounds)
        prompt_fn = prompts.performance_summary if summary_type == "performance" else prompts.practice_plan

        def generate():
            yield from _safe_stream(
                provider,
                prompt_fn(rounds, whs_index=whs_index, from_date=from_date, to_date=to_date),
                on_complete=lambda full: save_global_summary(
                    summary_type, short_text, full,
                    round_count=round_count,
                    from_date=from_date, to_date=to_date,
                    latest_round_date=latest_round_date,
                ),
            )

        return Response(generate(), mimetype="text/plain")
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/practice-plan", methods=["POST"])
def api_ai_practice_plan():
    rounds = get_rounds(limit=50)
    if not rounds:
        return jsonify({"error": "No rounds to analyse"}), 400
    try:
        provider = _build_provider()
        prompt = prompts.practice_plan(rounds)
        return Response(_safe_stream(provider, prompt), mimetype="text/plain")
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Provider list ─────────────────────────────────────────────────────────────

@app.route("/api/providers", methods=["GET"])
def api_providers():
    from model_tier import PROVIDER_TIERS
    return jsonify(PROVIDER_TIERS)


if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5050, debug=False)
