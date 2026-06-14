"""Flask server for FairwayIQ."""

from flask import Flask, request, jsonify, Response, send_from_directory
from database import (
    init_db, insert_round, replace_round, find_duplicate,
    get_rounds, get_round, delete_round,
    update_notes, save_debrief, save_short_summary,
    get_global_summary, save_global_summary,
    get_stats_summary, get_trend_data,
    load_config, save_config,
)
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
        return jsonify({"ok": True, "id": rid, "data": data, "method": method})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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


@app.route("/api/ai/global-summary", methods=["GET"])
def api_get_global_summary():
    return jsonify({
        "performance": get_global_summary("performance"),
        "practice":    get_global_summary("practice"),
    })


@app.route("/api/ai/global-summary", methods=["POST"])
def api_gen_global_summary():
    """Generate and save both short snapshot and full report for performance summary."""
    rounds = get_rounds(limit=50)
    if not rounds:
        return jsonify({"error": "No rounds to analyse"}), 400
    try:
        provider = _build_provider()

        # Short snapshot (non-streaming, fast)
        short_text = "".join(provider.stream(prompts.global_short_summary(rounds)))

        # Full report — stream to client and accumulate
        full_chunks = []
        def generate():
            for chunk in _safe_stream(
                provider,
                prompts.performance_summary(rounds),
                on_complete=lambda full: save_global_summary("performance", short_text, full),
            ):
                full_chunks.append(chunk)
                yield chunk

        return Response(generate(), mimetype="text/plain",
                        headers={"X-Short-Summary": short_text[:500]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/performance-summary", methods=["POST"])
def api_ai_performance_summary():
    rounds = get_rounds(limit=50)
    if not rounds:
        return jsonify({"error": "No rounds to analyse"}), 400
    try:
        provider = _build_provider()
        prompt = prompts.performance_summary(rounds)
        return Response(_safe_stream(provider, prompt), mimetype="text/plain")
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
