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
  if (name === "ai") loadAiAnalysis();
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
  const [summary, trends, globalSummary] = await Promise.all([
    apiFetch("/api/stats/summary").then(r => r.json()),
    apiFetch("/api/stats/trends").then(r => r.json()),
    apiFetch("/api/ai/global-summary").then(r => r.json()),
  ]);

  renderStatCards(summary);
  renderCharts(trends);
  renderGlobalSummary(globalSummary.performance);
}

function renderGlobalSummary(gs) {
  const el = document.getElementById("globalSummary");
  if (!el) return;

  if (!gs) {
    el.innerHTML = `
      <p class="ai-placeholder" style="margin-bottom:12px">No AI summary yet.</p>
      <button class="btn-primary" id="btnGenGlobalNow">Generate Summary Now</button>
    `;
    document.getElementById("btnGenGlobalNow").addEventListener("click", async () => {
      el.innerHTML = `<p class="ai-placeholder">Generating summary…</p>`;
      const r = await apiFetch("/api/ai/global-summary", { method: "POST" });
      if (r.ok) { const reader = r.body.getReader(); while (!(await reader.read()).done) {} }
      loadDashboard();
    });
    return;
  }

  const updated = gs.generated_at
    ? `<span class="gs-updated">Updated ${gs.generated_at.split("T")[0] || gs.generated_at.substring(0,10)}</span>`
    : "";

  el.innerHTML = `
    <div class="gs-snapshot">${gs.short_summary || ""}</div>
    ${updated}
    ${gs.full_report ? `
      <button class="btn-toggle-report" id="btnToggleReport">Show full report ↓</button>
      <div class="gs-full-report hidden" id="gsFullReport">
        ${marked.parse(gs.full_report)}
      </div>
    ` : ""}
  `;

  document.getElementById("btnToggleReport")?.addEventListener("click", function() {
    const rep = document.getElementById("gsFullReport");
    rep.classList.toggle("hidden");
    this.textContent = rep.classList.contains("hidden") ? "Show full report ↓" : "Hide full report ↑";
  });
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

// ── Shot map ──────────────────────────────────────────────────────────────────
function renderShotMapHTML(holesJson) {
  if (!holesJson) return "";
  let holes;
  try { holes = JSON.parse(holesJson); } catch { return ""; }
  const tracked = holes.filter(h => h.hole_score.stroke_scores?.length);
  if (!tracked.length) return "";

  const panels = tracked.map(h => `
    <div class="shot-map-panel">
      <div class="shot-map-hole-title">
        Hole ${h.sequence} — Par ${h.hole_tee.par} &nbsp;|&nbsp;
        ${h.hole_score.stroke_scores.length} shot${h.hole_score.stroke_scores.length > 1 ? "s" : ""} tracked
      </div>
      <div id="shotmap-${h.sequence}" class="shot-map-container"></div>
    </div>
  `).join("");

  return `
    <div class="shot-map-section">
      <h4>Shot Tracking</h4>
      <div class="shot-map-grid">${panels}</div>
    </div>`;
}

function initShotMaps(holesJson) {
  if (!holesJson || typeof L === "undefined") return;
  let holes;
  try { holes = JSON.parse(holesJson); } catch { return; }
  const tracked = holes.filter(h => h.hole_score.stroke_scores?.length);

  function divIcon(html) {
    return L.divIcon({ html, className: "", iconSize: [28, 28], iconAnchor: [14, 14] });
  }

  tracked.forEach(h => {
    const el = document.getElementById(`shotmap-${h.sequence}`);
    if (!el || el._leaflet_id) return; // already initialised

    const map = L.map(el, { zoomControl: true, attributionControl: true });

    // Satellite layer (Esri, free, no key needed)
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Tiles © Esri | Map data © OpenStreetMap contributors", maxZoom: 20 }
    ).addTo(map);

    // OSM labels overlay so street/feature names show on top of satellite
    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "", maxZoom: 20, opacity: 0.35 }
    ).addTo(map);

    const latlngs = [];

    // Tee marker
    const tee = [h.hole_score.tee_latitude, h.hole_score.tee_longitude];
    latlngs.push(tee);
    L.marker(tee, { icon: divIcon('<div class="map-marker-tee">T</div>') })
      .addTo(map)
      .bindPopup(`<div class="map-popup"><strong>Tee — Hole ${h.sequence}</strong>Par ${h.hole_tee.par} &nbsp;|&nbsp; SI ${h.hole_tee.stroke_index ?? "—"}<br>${Math.round(h.hole_tee.distance)}y from tee</div>`);

    // Shot markers
    h.hole_score.stroke_scores.forEach(shot => {
      const pos = [shot.latitude, shot.longitude];
      latlngs.push(pos);
      const club = shot.club || "Unknown";
      const dist = shot.distance ? `${shot.distance}y` : "—";
      const lie  = shot.lie_name || shot.lie || "—";
      L.marker(pos, { icon: divIcon(`<div class="map-marker-shot">${shot.sequence}</div>`) })
        .addTo(map)
        .bindPopup(`<div class="map-popup"><strong>Shot ${shot.sequence}</strong>${club} &nbsp;|&nbsp; ${dist}<br>Lie: ${lie}</div>`);
    });

    // Flag marker if position recorded
    const flagLat = h.hole_score.custom_flag_latitude;
    const flagLon = h.hole_score.custom_flag_longitude;
    if (flagLat && flagLon) {
      const flagPos = [flagLat, flagLon];
      latlngs.push(flagPos);
      L.marker(flagPos, { icon: divIcon('<div class="map-marker-flag">⛳</div>') })
        .addTo(map)
        .bindPopup(`<div class="map-popup"><strong>Flag — Hole ${h.sequence}</strong></div>`);
    }

    // Dashed line: tee → shots (→ flag)
    L.polyline(latlngs, { color: "#fff", weight: 2, dashArray: "6 4", opacity: 0.85 }).addTo(map);

    // Fit view with generous padding
    map.fitBounds(L.latLngBounds(latlngs).pad(0.45));
  });
}

// ── Scorecard renderer ────────────────────────────────────────────────────────
function renderScorecard(holesJson) {
  if (!holesJson) return "";
  let holes;
  try { holes = JSON.parse(holesJson); } catch { return ""; }
  if (!holes.length) return "";

  function scoreClass(strokes, par) {
    const d = strokes - par;
    if (d <= -2) return "sc-eagle";
    if (d === -1) return "sc-birdie";
    if (d === 0)  return "sc-par";
    if (d === 1)  return "sc-bogey";
    return "sc-double";
  }

  function firCell(hit, par) {
    if (par < 4) return `<span class="fir-na">—</span>`;
    if (hit === "center" || hit === "target") return `<span class="fir-hit">✓</span>`;
    if (hit === "left")  return `<span class="fir-miss">L</span>`;
    if (hit === "right") return `<span class="fir-miss">R</span>`;
    return `<span class="fir-na">—</span>`;
  }

  const totalPar     = holes.reduce((s, h) => s + h.hole_tee.par, 0);
  const totalScore   = holes.reduce((s, h) => s + h.hole_score.total_of_strokes, 0);
  const totalPutts   = holes.reduce((s, h) => s + (h.hole_score.total_of_putts || 0), 0);
  const totalPenalty = holes.reduce((s, h) => s + (h.hole_score.total_of_penalties || 0), 0);

  const rows = holes.map(h => {
    const hs  = h.hole_score;
    const ht  = h.hole_tee;
    const cls = scoreClass(hs.total_of_strokes, ht.par);
    const vsP = hs.total_of_strokes - ht.par;
    const vsPLabel = vsP === 0 ? "E" : (vsP > 0 ? `+${vsP}` : `${vsP}`);
    const girLabel = hs.green_in_regulation == null ? `<span class="fir-na">—</span>`
      : hs.green_in_regulation ? `<span class="gir-hit">✓</span>` : `<span class="gir-miss">✗</span>`;
    const dist = ht.distance ? Math.round(ht.distance) + "y" : "—";

    return `<tr>
      <td>Hole ${h.sequence}</td>
      <td>${ht.par}</td>
      <td>${ht.stroke_index ?? "—"}</td>
      <td>${dist}</td>
      <td><span class="${cls}">${hs.total_of_strokes}</span></td>
      <td>${vsPLabel}</td>
      <td>${hs.total_of_putts ?? "—"}</td>
      <td>${girLabel}</td>
      <td>${firCell(hs.fairway_hit, ht.par)}</td>
      <td>${hs.total_of_penalties || 0}</td>
    </tr>`;
  }).join("");

  const totalVsP = totalScore - totalPar;
  const totalVsPLabel = totalVsP === 0 ? "E" : (totalVsP > 0 ? `+${totalVsP}` : `${totalVsP}`);

  return `
    <div class="scorecard-section">
      <h4>Scorecard</h4>
      <table class="scorecard-table">
        <thead>
          <tr>
            <th>Hole</th><th>Par</th><th>SI</th><th>Dist</th>
            <th>Score</th><th>vs Par</th><th>Putts</th><th>GIR</th><th>FIR</th><th>Pen</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr>
            <td>Total</td><td>${totalPar}</td><td>—</td><td>—</td>
            <td>${totalScore}</td><td>${totalVsPLabel}</td><td>${totalPutts}</td>
            <td>—</td><td>—</td><td>${totalPenalty}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
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
      ${r.ai_short_summary ? `<p class="round-short-summary">${r.ai_short_summary}</p>` : ""}
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

    ${renderScorecard(r.holes_json)}
    ${renderShotMapHTML(r.holes_json)}

    <div class="notes-section">
      <h4>Round Notes</h4>
      <textarea id="notesArea" placeholder="Add your own notes about this round...">${r.notes || ""}</textarea>
      <div style="margin-top:8px">
        <button class="btn-secondary" id="btnSaveNotes" data-id="${r.id}">Save Notes</button>
      </div>
    </div>

    <div class="detail-actions">
      <button class="btn-primary" id="btnDebriefThis" data-id="${r.id}">⚡ ${r.ai_debrief ? "Regenerate AI Debrief" : "Generate AI Debrief"}</button>
      ${r.hole19_url ? `<button class="btn-secondary" id="btnReimport" data-id="${r.id}">↻ Re-import from Hole19</button>` : ""}
      <button class="btn-danger"  id="btnDeleteRound" data-id="${r.id}">Delete Round</button>
    </div>

    <div class="ai-debrief-box" id="debriefBox" ${r.ai_debrief ? "" : 'style="display:none"'}>
      <button class="btn-toggle-report" id="btnToggleDebrief">
        ${r.ai_debrief ? "Show full debrief ↓" : ""}
      </button>
      <div id="debriefOutput" class="ai-output hidden">${r.ai_debrief ? marked.parse(r.ai_debrief) : ""}</div>
    </div>
  `;

  // Initialise Leaflet maps after DOM is ready
  initShotMaps(r.holes_json);

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

  document.getElementById("btnReimport")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnReimport");
    btn.disabled = true;
    btn.textContent = "Re-importing…";
    try {
      const res = await apiFetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: r.hole19_url, overwrite: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Re-import failed");
      // Reload the detail view with fresh data
      showRoundDetail(data.id);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "↻ Re-import from Hole19";
      alert(`Re-import failed: ${e.message}`);
    }
  });

  async function runDebrief() {
    const box = document.getElementById("debriefBox");
    const out = document.getElementById("debriefOutput");
    const toggleBtn = document.getElementById("btnToggleDebrief");
    box.style.display = "block";
    out.classList.remove("hidden");
    out.classList.add("streaming");
    out.innerHTML = '<span class="ai-placeholder">Generating debrief…</span>';
    if (toggleBtn) toggleBtn.textContent = "Hide full debrief ↑";
    box.scrollIntoView({ behavior: "smooth" });
    await streamAI(`/api/ai/round-debrief/${r.id}`, out);
    out.classList.remove("streaming");
    if (toggleBtn) toggleBtn.textContent = "Hide full debrief ↑";
    document.getElementById("btnDebriefThis").textContent = "Regenerate AI Debrief";
  }

  document.getElementById("btnDebriefThis").addEventListener("click", runDebrief);

  document.getElementById("btnToggleDebrief")?.addEventListener("click", function() {
    const out = document.getElementById("debriefOutput");
    out.classList.toggle("hidden");
    this.textContent = out.classList.contains("hidden") ? "Show full debrief ↓" : "Hide full debrief ↑";
  });
}

document.getElementById("btnBackToRounds").addEventListener("click", () => showView("rounds"));

// ── Import tabs ───────────────────────────────────────────────────────────────
document.querySelectorAll(".import-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".import-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".itab-panel").forEach(p => p.classList.add("hidden"));
    tab.classList.add("active");
    document.getElementById("itab-" + tab.dataset.itab).classList.remove("hidden");
    document.getElementById("importStatus").className = "import-status";
  });
});

// ── Import helpers ────────────────────────────────────────────────────────────
function importAiEnabled() {
  return document.getElementById("chkImportAi")?.checked;
}

function setImportStatus(cls, html) {
  const el = document.getElementById("importStatus");
  el.className = "import-status " + cls;
  el.innerHTML = html;
}

function showDuplicatePrompt(existing, onReplace) {
  const d = fmtDate(existing.date);
  const vsP = existing.score_vs_par != null
    ? ` (${existing.score_vs_par >= 0 ? "+" : ""}${existing.score_vs_par})`
    : "";
  setImportStatus("warn", `
    <div class="dup-prompt">
      <strong>Round already imported:</strong> ${existing.course} on ${d}, score ${existing.score ?? "—"}${vsP}
      <div class="dup-actions">
        <button class="btn-primary btn-sm" id="btnDupReplace">Replace with new data</button>
        <button class="btn-secondary btn-sm" id="btnDupKeep">Keep existing</button>
      </div>
    </div>
  `);
  document.getElementById("btnDupReplace").addEventListener("click", onReplace);
  document.getElementById("btnDupKeep").addEventListener("click", () => {
    setImportStatus("", "");
  });
}

async function runPostImportAi(roundId, statusPrefix) {
  // Step: short summary
  setImportStatus("loading", `${statusPrefix} Generating round summary…`);
  const sr = await apiFetch(`/api/ai/round-short-summary/${roundId}`, { method: "POST" });
  if (!sr.ok) {
    const e = await sr.json().catch(() => ({}));
    setImportStatus("error", `✗ AI summary failed: ${e.error || sr.statusText}`);
    return;
  }

  // Step: global summary (streams, we just wait for completion)
  setImportStatus("loading", `${statusPrefix} Updating overall analysis…`);
  const gr = await apiFetch("/api/ai/global-summary", { method: "POST" });
  if (gr.ok) {
    // Drain the stream so save_global_summary fires server-side
    const reader = gr.body.getReader();
    while (!(await reader.read()).done) {}
  }
}

// ── Import from URL ───────────────────────────────────────────────────────────
async function doUrlImport(url, overwrite = false) {
  const useAi = importAiEnabled();
  document.getElementById("btnImport").disabled = true;
  setImportStatus("loading", "Fetching round data from Hole19…");
  try {
    const r = await apiFetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, overwrite }),
    });
    const data = await r.json();
    if (r.status === 409 && data.duplicate) {
      document.getElementById("btnImport").disabled = false;
      showDuplicatePrompt(data.existing, () => doUrlImport(url, true));
      return;
    }
    if (!r.ok) throw new Error(data.error || "Import failed");
    const prefix = `✓ ${data.data.course || "Unknown Course"} on ${fmtDate(data.data.date)} imported.`;
    if (useAi) {
      await runPostImportAi(data.id, prefix);
      setImportStatus("success", `${prefix} AI analysis ready.`);
    } else {
      setImportStatus("success", prefix);
    }
    document.getElementById("importUrl").value = "";
  } catch (e) {
    setImportStatus("error", `✗ ${e.message}`);
  } finally {
    document.getElementById("btnImport").disabled = false;
  }
}

document.getElementById("btnImport").addEventListener("click", () => {
  const url = document.getElementById("importUrl").value.trim();
  if (url) doUrlImport(url);
});

// ── Import from email ─────────────────────────────────────────────────────────
async function doEmailImport(text, overwrite = false) {
  const useAi = importAiEnabled();
  document.getElementById("btnImportEmail").disabled = true;
  setImportStatus("loading", "Extracting stats from email…");
  try {
    const r = await apiFetch("/api/import/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, overwrite }),
    });
    const data = await r.json();
    if (r.status === 409 && data.duplicate) {
      document.getElementById("btnImportEmail").disabled = false;
      showDuplicatePrompt(data.existing, () => doEmailImport(text, true));
      return;
    }
    if (!r.ok) throw new Error(data.error || "Import failed");
    const method = data.method === "ai" ? " (via AI extraction)" : "";
    const prefix = `✓ ${data.data.course || "Unknown Course"} on ${fmtDate(data.data.date)} imported${method}.`;
    if (useAi) {
      await runPostImportAi(data.id, prefix);
      setImportStatus("success", `${prefix} AI analysis ready.`);
    } else {
      setImportStatus("success", prefix);
    }
    document.getElementById("importEmailText").value = "";
  } catch (e) {
    setImportStatus("error", `✗ ${e.message}`);
  } finally {
    document.getElementById("btnImportEmail").disabled = false;
  }
}

document.getElementById("btnImportEmail").addEventListener("click", () => {
  const text = document.getElementById("importEmailText").value.trim();
  if (text) doEmailImport(text);
});

// ── AI Analysis ───────────────────────────────────────────────────────────────
async function loadAiAnalysis() {
  const gs = await apiFetch("/api/ai/global-summary").then(r => r.json());
  const stored = gs.performance;
  const out = document.getElementById("aiOutput");
  const btn = document.getElementById("btnRunAi");
  if (stored?.full_report) {
    const updated = stored.generated_at
      ? ` <span class="gs-updated">Generated ${stored.generated_at.substring(0,10)}</span>` : "";
    out.innerHTML = marked.parse(stored.full_report) + updated;
    btn.textContent = "↺ Regenerate";
  } else {
    out.innerHTML = '<span class="ai-placeholder">No analysis yet — click Generate to create one.</span>';
    btn.textContent = "Generate Analysis";
  }
}

document.querySelectorAll(".ai-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".ai-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentAnalysis = tab.dataset.analysis;
    document.getElementById("aiOutput").innerHTML = '<span class="ai-placeholder">Click Generate to start.</span>';
  });
});

document.getElementById("btnRunAi").addEventListener("click", async () => {
  const out = document.getElementById("aiOutput");
  const endpoint = currentAnalysis === "performance"
    ? "/api/ai/global-summary"
    : "/api/ai/practice-plan";
  out.classList.add("streaming");
  out.innerHTML = '<span class="ai-placeholder">Generating…</span>';
  document.getElementById("btnRunAi").disabled = true;
  await streamAI(endpoint, out);
  out.classList.remove("streaming");
  document.getElementById("btnRunAi").disabled = false;
  document.getElementById("btnRunAi").textContent = "↺ Regenerate";
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
    // Check for server-side error sentinel emitted mid-stream
    const errMatch = raw.match(/__AI_ERROR__: (.+)/);
    if (errMatch) {
      outputEl.innerHTML = `<span style="color:var(--red)">AI error: ${errMatch[1]}</span>`;
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
