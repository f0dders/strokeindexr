"""Flask server for FairwayIQ."""

import json
import re
from flask import Flask, request, jsonify, Response, send_from_directory
from database import init_db, insert_round, get_rounds, get_round, delete_round, update_notes, get_stats_summary, get_trend_data
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
    url = (request.json or {}).get("url", "").strip()
    if not url:
        return jsonify({"error": "No URL provided"}), 400
    if "hole19golf.com" not in url:
        return jsonify({"error": "URL must be a Hole19 round URL"}), 400
    try:
        data = scrape_round(url)
        rid = insert_round(data)
        if not rid:
            return jsonify({"error": "Round already imported (duplicate URL)"}), 409
        return jsonify({"ok": True, "id": rid, "data": data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Stats API ─────────────────────────────────────────────────────────────────

@app.route("/api/stats/summary", methods=["GET"])
def api_stats_summary():
    return jsonify(get_stats_summary())


@app.route("/api/stats/trends", methods=["GET"])
def api_stats_trends():
    return jsonify(get_trend_data())


# ── AI API ────────────────────────────────────────────────────────────────────

def _build_provider(config: dict):
    from providers import (
        ClaudeProvider, OpenAIProvider, GeminiProvider,
        GroqProvider, MistralProvider, OpenRouterProvider,
        OllamaProvider, LMStudioProvider,
    )
    name = config.get("provider", "claude")
    model = config.get("model", "")
    key = config.get("api_key", "")
    url = config.get("base_url", "")

    mapping = {
        "claude": lambda: ClaudeProvider(api_key=key, model=model or ClaudeProvider.DEFAULT_MODEL),
        "openai": lambda: OpenAIProvider(api_key=key, model=model or "gpt-4o"),
        "gemini": lambda: GeminiProvider(api_key=key, model=model or "gemini-1.5-pro"),
        "groq": lambda: GroqProvider(api_key=key, model=model or "llama3-70b-8192"),
        "mistral": lambda: MistralProvider(api_key=key, model=model or "mistral-large-latest"),
        "openrouter": lambda: OpenRouterProvider(api_key=key, model=model or "anthropic/claude-3.5-sonnet"),
        "ollama": lambda: OllamaProvider(model=model or "llama3", base_url=url or "http://localhost:11434"),
        "lmstudio": lambda: LMStudioProvider(model=model or "local-model", base_url=url or "http://localhost:1234"),
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
        provider = _build_provider(request.json or {})
        prompt = prompts.round_debrief(r)
        def generate():
            for chunk in provider.stream(prompt):
                yield chunk
        return Response(generate(), mimetype="text/plain")
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/performance-summary", methods=["POST"])
def api_ai_performance_summary():
    rounds = get_rounds(limit=50)
    if not rounds:
        return jsonify({"error": "No rounds to analyse"}), 400
    try:
        provider = _build_provider(request.json or {})
        prompt = prompts.performance_summary(rounds)
        def generate():
            for chunk in provider.stream(prompt):
                yield chunk
        return Response(generate(), mimetype="text/plain")
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/practice-plan", methods=["POST"])
def api_ai_practice_plan():
    rounds = get_rounds(limit=50)
    if not rounds:
        return jsonify({"error": "No rounds to analyse"}), 400
    try:
        provider = _build_provider(request.json or {})
        prompt = prompts.practice_plan(rounds)
        def generate():
            for chunk in provider.stream(prompt):
                yield chunk
        return Response(generate(), mimetype="text/plain")
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── AI provider config check ──────────────────────────────────────────────────

@app.route("/api/providers", methods=["GET"])
def api_providers():
    from model_tier import PROVIDER_TIERS
    return jsonify(PROVIDER_TIERS)


if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5050, debug=False)
