/* FairwayIQ frontend */

// ── State ────────────────────────────────────────────────────────────────────
let currentAnalysis = "performance";
let charts = {};

// ── Navigation ───────────────────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-links a").forEach(a => a.classList.remove("active"));
  const el = document.getElementById("view-" + name);
  if (el) el.classList.add("active");
  const link = document.querySelector(`.nav-links a[data-view="${name}"]`);
  if (link) link.classList.add("active");

  if (name === "dashboard") loadDashboard();
  if (name === "rounds") loadRounds();
}

document.querySelectorAll(".nav-links a").forEach(a => {
  a.addEventListener("click", e => { e.preventDefault(); showView(a.dataset.view); });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(val, suffix = "", decimals = 1) {
  if (val == null || val === "") return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return n.toFixed(decimals) + suffix;
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function scoreLabel(vs) {
  if (vs == null) return "";
  if (vs === 0) return '<span class="score-vs-par even">E</span>';
  if (vs > 0)  return `<span class="score-vs-par over">+${vs}</span>`;
  return `<span class="score-vs-par under">${vs}</span>`;
}

async function apiFetch(path, opts = {}) {
  const r = await fetch(path, opts);
  return r;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const [summary, trends] = await Promise.all([
    apiFetch("/api/stats/summary").then(r => r.json()),
    apiFetch("/api/stats/trends").then(r => r.json()),
  ]);

  renderStatCards(summary);
  renderCharts(trends);
}

function renderStatCards(s) {
  const cards = [
    { label: "Rounds Played", value: s.total_rounds ?? "—", sub: "total" },
    { label: "Best Handicap", value: fmt(s.best_handicap, "", 1), sub: "index" },
    { label: "Avg vs Par",    value: s.avg_score_vs_par != null ? (s.avg_score_vs_par >= 0 ? "+" : "") + fmt(s.avg_score_vs_par, "", 1) : "—", sub: "per round" },
    { label: "Avg Putts",     value: fmt(s.avg_putts, "", 1), sub: "per round" },
    { label: "Avg GIR",       value: fmt(s.avg_gir, "%"), sub: "greens in regulation" },
    { label: "Avg Fairways",  value: fmt(s.avg_fir, "%"), sub: "fairways hit" },
    { label: "Best Round",    value: s.best_score_vs_par != null ? (s.best_score_vs_par >= 0 ? "+" : "") + s.best_score_vs_par : "—", sub: "vs par" },
    { label: "Up & Down",     value: fmt(s.avg_up_and_down, "%"), sub: "average" },
  ];
  document.getElementById("statCards").innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
      <div class="sub">${c.sub}</div>
    </div>
  `).join("");
}

function mkChart(id, label, data, labels, color = "#2d6a4f") {
  if (charts[id]) charts[id].destroy();
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: color + "18",
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: color,
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: "#e8eee8" } },
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }
      }
    }
  });
}

function renderCharts(trends) {
  if (!trends.length) return;
  const labels = trends.map(r => fmtDate(r.date));
  mkChart("chartScore",  "Score vs Par",  trends.map(r => r.score_vs_par), labels, "#c0392b");
  mkChart("chartHcp",    "Handicap",      trends.map(r => r.handicap),     labels, "#2d6a4f");
  mkChart("chartGir",    "GIR %",         trends.map(r => r.gir_hit_pct),  labels, "#52b788");
  mkChart("chartPutts",  "Putts",         trends.map(r => r.putts),        labels, "#b7950b");

  // Score distribution doughnut for latest round
  const latest = trends[trends.length - 1];
  if (charts["chartDist"]) charts["chartDist"].destroy();
  const ctx = document.getElementById("chartDist");
  if (ctx && latest) {
    charts["chartDist"] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Eagles", "Birdies", "Pars", "Bogeys", "Doubles+"],
        datasets: [{
          data: [
            latest.eagles_pct   ?? 0,
            latest.birdies_pct  ?? 0,
            latest.pars_pct     ?? 0,
            latest.bogeys_pct   ?? 0,
            latest.doubles_plus_pct ?? 0,
          ],
          backgroundColor: ["#f4d03f","#52b788","#2d6a4f","#e67e22","#c0392b"],
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { callback: v => v + "%" }, grid: { color: "#e8eee8" } },
          x: { grid: { display: false } }
        }
      }
    });
  }
}

// ── Round History ─────────────────────────────────────────────────────────────
async function loadRounds() {
  const rounds = await apiFetch("/api/rounds").then(r => r.json());
  const el = document.getElementById("roundsList");
  if (!rounds.length) {
    el.innerHTML = `<div class="empty-state"><div class="icon">🏌️</div><p>No rounds yet. Import your first round from the Import page.</p></div>`;
    return;
  }
  el.innerHTML = rounds.map(r => `
    <div class="round-row" data-id="${r.id}">
      <span class="round-date">${fmtDate(r.date)}</span>
      <span class="round-course">${r.course || "Unknown Course"}</span>
      <span class="round-holes">${r.holes || "?"} holes</span>
      <span class="round-score">${r.score ?? "—"}</span>
      ${scoreLabel(r.score_vs_par)}
    </div>
  `).join("");
  el.querySelectorAll(".round-row").forEach(row => {
    row.addEventListener("click", () => showRoundDetail(+row.dataset.id));
  });
}

// ── Round Detail ──────────────────────────────────────────────────────────────
async function showRoundDetail(id) {
  const r = await apiFetch(`/api/rounds/${id}`).then(res => res.json());
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-links a").forEach(a => a.classList.remove("active"));
  document.getElementById("view-round-detail").classList.add("active");

  const vsLabel = r.score_vs_par != null
    ? (r.score_vs_par >= 0 ? "+" : "") + r.score_vs_par + " vs par"
    : "";

  document.getElementById("roundDetail").innerHTML = `
    <div class="detail-header">
      <h2>${r.course || "Unknown Course"}</h2>
      <div class="detail-meta">
        <span>📅 ${fmtDate(r.date)}</span>
        <span>⛳ ${r.holes || "?"} holes</span>
        ${r.duration ? `<span>⏱ ${r.duration}</span>` : ""}
        ${r.distance_miles ? `<span>🚶 ${r.distance_miles} miles</span>` : ""}
      </div>
    </div>

    <div class="detail-grid">
      <div class="detail-card">
        <h4>Scoring</h4>
        <div class="detail-stat"><span>Score</span><span class="dval">${r.score ?? "—"}</span></div>
        <div class="detail-stat"><span>Par</span><span class="dval">${r.par ?? "—"}</span></div>
        <div class="detail-stat"><span>vs Par</span><span class="dval">${vsLabel || "—"}</span></div>
        <div class="detail-stat"><span>Handicap</span><span class="dval">${fmt(r.handicap)}</span></div>
        <div class="detail-stat"><span>Putts</span><span class="dval">${r.putts ?? "—"}</span></div>
      </div>
      <div class="detail-card">
        <h4>Ball Striking</h4>
        <div class="detail-stat"><span>Fairways Hit</span><span class="dval">${fmt(r.fairway_hit_pct, "%")}</span></div>
        <div class="detail-stat"><span>Fairways Missed</span><span class="dval">${fmt(r.fairway_missed_pct, "%")}</span></div>
        <div class="detail-stat"><span>GIR</span><span class="dval">${fmt(r.gir_hit_pct, "%")}</span></div>
        <div class="detail-stat"><span>GIR Missed</span><span class="dval">${fmt(r.gir_missed_pct, "%")}</span></div>
      </div>
      <div class="detail-card">
        <h4>Par Averages</h4>
        <div class="detail-stat"><span>Par 3</span><span class="dval">${fmt(r.par3_avg)}</span></div>
        <div class="detail-stat"><span>Par 4</span><span class="dval">${fmt(r.par4_avg)}</span></div>
        <div class="detail-stat"><span>Par 5</span><span class="dval">${fmt(r.par5_avg)}</span></div>
        <div class="detail-stat"><span>Overall avg</span><span class="dval">${fmt(r.overall_avg)}</span></div>
      </div>
      <div class="detail-card">
        <h4>Short Game</h4>
        <div class="detail-stat"><span>Up & Down</span><span class="dval">${fmt(r.up_and_down_pct, "%")}</span></div>
        <div class="detail-stat"><span>Scrambling</span><span class="dval">${fmt(r.scrambling_pct, "%")}</span></div>
        <div class="detail-stat"><span>Sand Saves</span><span class="dval">${fmt(r.sand_saves_pct, "%")}</span></div>
        ${r.best_hole ? `<div class="detail-stat"><span>Best Hole</span><span class="dval">#${r.best_hole}</span></div>` : ""}
      </div>
      <div class="detail-card">
        <h4>Score Distribution</h4>
        <div class="detail-stat"><span>Eagles</span><span class="dval">${fmt(r.eagles_pct, "%")}</span></div>
        <div class="detail-stat"><span>Birdies</span><span class="dval">${fmt(r.birdies_pct, "%")}</span></div>
        <div class="detail-stat"><span>Pars</span><span class="dval">${fmt(r.pars_pct, "%")}</span></div>
        <div class="detail-stat"><span>Bogeys</span><span class="dval">${fmt(r.bogeys_pct, "%")}</span></div>
        <div class="detail-stat"><span>Doubles+</span><span class="dval">${fmt(r.doubles_plus_pct, "%")}</span></div>
      </div>
    </div>

    <div class="notes-section">
      <h4>Round Notes</h4>
      <textarea id="notesArea" placeholder="Add your own notes about this round...">${r.notes || ""}</textarea>
      <div style="margin-top:8px">
        <button class="btn-secondary" id="btnSaveNotes" data-id="${r.id}">Save Notes</button>
      </div>
    </div>

    <div class="detail-actions">
      <button class="btn-primary" id="btnDebriefThis" data-id="${r.id}">⚡ AI Round Debrief</button>
      <button class="btn-danger"  id="btnDeleteRound" data-id="${r.id}">Delete Round</button>
    </div>

    <div class="ai-debrief-box" id="debriefBox" ${r.ai_debrief ? "" : 'style="display:none"'}>
      <h4>AI Round Debrief
        <button class="btn-regen" id="btnRegenDebrief" title="Regenerate">↺ Regenerate</button>
      </h4>
      <div id="debriefOutput" class="ai-output">${r.ai_debrief ? marked.parse(r.ai_debrief) : ""}</div>
    </div>
  `;

  document.getElementById("btnSaveNotes").addEventListener("click", async () => {
    const notes = document.getElementById("notesArea").value;
    await apiFetch(`/api/rounds/${r.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    const btn = document.getElementById("btnSaveNotes");
    btn.textContent = "Saved ✓";
    setTimeout(() => btn.textContent = "Save Notes", 2000);
  });

  document.getElementById("btnDeleteRound").addEventListener("click", async () => {
    if (!confirm("Delete this round? This cannot be undone.")) return;
    await apiFetch(`/api/rounds/${r.id}`, { method: "DELETE" });
    showView("rounds");
  });

  async function runDebrief() {
    const box = document.getElementById("debriefBox");
    const out = document.getElementById("debriefOutput");
    box.style.display = "block";
    out.classList.add("streaming");
    out.innerHTML = '<span class="ai-placeholder">Generating debrief…</span>';
    box.scrollIntoView({ behavior: "smooth" });
    await streamAI(`/api/ai/round-debrief/${r.id}`, out);
    out.classList.remove("streaming");
  }

  document.getElementById("btnDebriefThis").addEventListener("click", runDebrief);
  document.getElementById("btnRegenDebrief").addEventListener("click", runDebrief);
}

document.getElementById("btnBackToRounds").addEventListener("click", () => showView("rounds"));

// ── Import ─────────────────────────────────────────────────────────────────────
document.getElementById("btnImport").addEventListener("click", async () => {
  const url = document.getElementById("importUrl").value.trim();
  const status = document.getElementById("importStatus");
  if (!url) return;

  status.className = "import-status loading";
  status.textContent = "Fetching round data from Hole19…";
  document.getElementById("btnImport").disabled = true;

  try {
    const r = await apiFetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Import failed");
    status.className = "import-status success";
    status.textContent = `✓ Round imported: ${data.data.course || "Unknown Course"} on ${fmtDate(data.data.date)}`;
    document.getElementById("importUrl").value = "";
  } catch (e) {
    status.className = "import-status error";
    status.textContent = `✗ ${e.message}`;
  } finally {
    document.getElementById("btnImport").disabled = false;
  }
});

// ── AI Analysis ───────────────────────────────────────────────────────────────
document.querySelectorAll(".ai-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".ai-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentAnalysis = tab.dataset.analysis;
    document.getElementById("aiOutput").innerHTML = '<span class="ai-placeholder">Click Generate Analysis to start.</span>';
  });
});

document.getElementById("btnRunAi").addEventListener("click", async () => {
  const out = document.getElementById("aiOutput");
  const endpoint = currentAnalysis === "performance"
    ? "/api/ai/performance-summary"
    : "/api/ai/practice-plan";
  out.classList.add("streaming");
  out.innerHTML = '<span class="ai-placeholder">Generating…</span>';
  await streamAI(endpoint, out);
  out.classList.remove("streaming");
});

// ── AI streaming helper ───────────────────────────────────────────────────────
async function streamAI(endpoint, outputEl) {
  try {
    // Config is read server-side from data/config.json — no keys sent over the wire
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      outputEl.innerHTML = `<span style="color:var(--red)">Error: ${err.error || resp.statusText}</span>`;
      return;
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let raw = "";
    outputEl.innerHTML = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
      outputEl.innerHTML = marked.parse(raw);
    }
  } catch (e) {
    outputEl.innerHTML = `<span style="color:var(--red)">Error: ${e.message}</span>`;
  }
}

// ── AI Settings modal ─────────────────────────────────────────────────────────
const modal = document.getElementById("modalSettings");
const localProviders = ["ollama", "lmstudio"];

function updateSettingsFields() {
  const p = document.getElementById("aiProvider").value;
  const isLocal = localProviders.includes(p);
  document.getElementById("labelApiKey").classList.toggle("hidden", isLocal);
  document.getElementById("labelBaseUrl").classList.toggle("hidden", !isLocal);
}

document.getElementById("aiProvider").addEventListener("change", updateSettingsFields);

document.getElementById("btnSettings").addEventListener("click", async () => {
  // Load current config from server — key is masked (bullets) for display
  try {
    const cfg = await apiFetch("/api/config").then(r => r.json());
    document.getElementById("aiProvider").value = cfg.provider || "claude";
    document.getElementById("aiApiKey").value   = cfg.api_key  || "";
    document.getElementById("aiModel").value    = cfg.model    || "";
    document.getElementById("aiBaseUrl").value  = cfg.base_url || "";
  } catch (_) {}
  updateSettingsFields();
  modal.classList.remove("hidden");
});

document.getElementById("btnCancelSettings").addEventListener("click", () => modal.classList.add("hidden"));

document.getElementById("btnSaveSettings").addEventListener("click", async () => {
  const btn = document.getElementById("btnSaveSettings");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await apiFetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: document.getElementById("aiProvider").value,
        api_key:  document.getElementById("aiApiKey").value,
        model:    document.getElementById("aiModel").value,
        base_url: document.getElementById("aiBaseUrl").value,
      }),
    });
    modal.classList.add("hidden");
  } catch (e) {
    alert("Failed to save settings: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save";
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadDashboard();
