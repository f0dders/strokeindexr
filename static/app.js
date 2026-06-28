/* StrokeIndexr frontend */

// ── Helpers ───────────────────────────────────────────────────────────────────
function weatherIcon(condition) {
  if (!condition) return "🌤";
  const c = condition.toLowerCase();
  if (c.includes("thunder")) return "⛈";
  if (c.includes("snow"))    return "❄️";
  if (c.includes("shower"))  return "🌦";
  if (c.includes("rain"))    return "🌧";
  if (c.includes("drizzle")) return "🌦";
  if (c.includes("fog"))     return "🌫";
  if (c.includes("cloudy"))  return "⛅";
  if (c.includes("clear"))   return "☀️";
  return "🌤";
}

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
  if (name === "courses") loadCourses();
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

function holeStripHTML(holesJson) {
  if (!holesJson) return "";
  let holes;
  try { holes = typeof holesJson === "string" ? JSON.parse(holesJson) : holesJson; }
  catch { return ""; }
  if (!holes?.length) return "";

  const cells = holes.map(h => {
    const strokes = h.hole_score?.total_of_strokes;
    const par     = h.hole_tee?.par;
    const seq     = h.sequence;
    if (strokes == null || par == null) return `<span class="hs-cell hs-unknown" title="H${seq}: ?">?</span>`;
    const diff = strokes - par;
    let cls, label;
    if (diff <= -2)       { cls = "hs-eagle";  label = "Eagle"; }
    else if (diff === -1) { cls = "hs-birdie"; label = "Birdie"; }
    else if (diff === 0)  { cls = "hs-par";    label = "Par"; }
    else if (diff === 1)  { cls = "hs-bogey";  label = "Bogey"; }
    else                  { cls = "hs-double"; label = diff === 2 ? "Double bogey" : `+${diff}`; }
    return `<span class="hs-cell ${cls}" title="H${seq} (par ${par}): ${strokes} — ${label}">${strokes}</span>`;
  }).join("");

  return `<div class="hole-strip">${cells}</div>`;
}

async function apiFetch(path, opts = {}) {
  const r = await fetch(path, opts);
  return r;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const [summary, trends, globalSummary, whs] = await Promise.all([
    apiFetch("/api/stats/summary").then(r => r.json()),
    apiFetch("/api/stats/trends").then(r => r.json()),
    apiFetch("/api/ai/global-summary").then(r => r.json()),
    apiFetch("/api/whs").then(r => r.json()),
  ]);

  renderStatCards(summary, whs);
  renderCharts(trends, whs, summary);
  renderGlobalSummary(globalSummary.performance);
}

function renderGlobalSummary(gs) {
  const el = document.getElementById("globalSummary");
  if (!el) return;

  if (!gs?.short_summary) {
    el.innerHTML = `
      <p class="ai-placeholder" style="margin-bottom:12px">No AI summary yet.</p>
      <button class="btn-primary" id="btnGenGlobalNow">Go to AI Analysis to generate →</button>
    `;
    document.getElementById("btnGenGlobalNow").addEventListener("click", () => showView("ai"));
    return;
  }

  el.innerHTML = `
    <div class="gs-snapshot">${gs.short_summary}</div>
    <div class="gs-footer">
      <a class="gs-view-link" href="#" id="gsViewFull">View full analysis →</a>
    </div>
  `;
  document.getElementById("gsViewFull").addEventListener("click", e => {
    e.preventDefault();
    showView("ai");
  });
}

function renderStatCards(s, whs) {
  const whsCurrent = whs?.current;
  const hcpMode    = localStorage.getItem("hcpMode") || "whs";
  const useWhs     = hcpMode === "whs";

  const whsVal = whsCurrent?.sufficient_data
    ? whsCurrent.index + (whsCurrent.estimated ? "*" : "")
    : "—";
  const excluded = whsCurrent?.excluded_rounds ?? [];
  const whsSub = whsCurrent?.sufficient_data
    ? (whsCurrent.estimated ? "WHS index (est.)" : "WHS index")
    : "WHS index (need 3+ rounds)";

  const hcpVal  = useWhs ? whsVal : (s.latest_handicap != null ? s.latest_handicap : "—");
  const hcpSub  = useWhs ? whsSub : "Hole19 playing handicap";
  const hcpHigh = useWhs ? whsCurrent?.sufficient_data : s.latest_handicap != null;
  const excNote = useWhs && excluded.length
    ? `<div class="whs-excluded-note">${excluded.length} round${excluded.length > 1 ? "s" : ""} excluded from WHS</div>`
    : "";

  const cards = [
    { label: "Rounds Played",  value: s.total_rounds ?? "—",  sub: "total" },
    { label: "Handicap",       value: hcpVal,                  sub: hcpSub, highlight: hcpHigh, note: excNote },
    { label: "Avg vs Par",     value: s.avg_score_vs_par != null ? (s.avg_score_vs_par >= 0 ? "+" : "") + fmt(s.avg_score_vs_par, "", 1) : "—", sub: "per round" },
    { label: "Avg Putts",      value: fmt(s.avg_putts, "", 1), sub: "per round" },
    { label: "Avg GIR",        value: fmt(s.avg_gir, "%"),     sub: "greens in regulation" },
    { label: "Avg Fairways",   value: fmt(s.avg_fir, "%"),     sub: "fairways hit" },
    { label: "Best Round",     value: s.best_score_vs_par != null ? (s.best_score_vs_par >= 0 ? "+" : "") + s.best_score_vs_par : "—", sub: "vs par" },
    { label: "Up & Down",      value: fmt(s.avg_up_and_down, "%"), sub: "average" },
  ];
  document.getElementById("statCards").innerHTML = cards.map(c => `
    <div class="stat-card${c.highlight ? " stat-card-highlight" : ""}">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
      <div class="sub">${c.sub}</div>
      ${c.note ?? ""}
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

function mkChartMulti(id, datasets, labels) {
  if (charts[id]) charts[id].destroy();
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: {
        y: { grid: { color: "#e8eee8" } },
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }
      }
    }
  });
}

function renderCharts(trends, whs, summary = {}) {
  if (!trends.length) return;
  const labels = trends.map(r => fmtDate(r.date));
  mkChart("chartScore", "Score vs Par", trends.map(r => r.score_vs_par), labels, "#c0392b");

  // Handicap chart: Hole19 playing HCP + WHS index side-by-side
  const whsHistory = whs?.history ?? [];
  if (whsHistory.length) {
    // Map WHS history by date for alignment with trend labels
    const whsByDate = {};
    whsHistory.forEach(h => { whsByDate[h.date] = h.index; });
    const whsData = trends.map(r => whsByDate[r.date] ?? null);
    mkChartMulti("chartHcp", [
      {
        label: "WHS Index",
        data: whsData,
        borderColor: "#2d6a4f",
        backgroundColor: "#2d6a4f18",
        borderWidth: 2, pointRadius: 4, pointBackgroundColor: "#2d6a4f",
        tension: 0.3, fill: false, spanGaps: true,
      },
      {
        label: "Playing HCP (Hole19)",
        data: trends.map(r => r.handicap),
        borderColor: "#b7950b",
        backgroundColor: "transparent",
        borderWidth: 2, borderDash: [5, 4], pointRadius: 3,
        pointBackgroundColor: "#b7950b",
        tension: 0.3, fill: false,
      },
    ], labels);
  } else {
    mkChart("chartHcp", "Playing HCP (Hole19)", trends.map(r => r.handicap), labels, "#2d6a4f");
  }
  mkChart("chartGir",    "GIR %",         trends.map(r => r.gir_hit_pct),  labels, "#52b788");
  mkChart("chartPutts",  "Putts",         trends.map(r => r.putts),        labels, "#b7950b");

  // Score distribution — latest round + overall average overlay
  const latest = trends[trends.length - 1];
  if (charts["chartDist"]) charts["chartDist"].destroy();
  const ctx = document.getElementById("chartDist");
  if (ctx && latest) {
    charts["chartDist"] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Eagles", "Birdies", "Pars", "Bogeys", "Doubles+"],
        datasets: [
          {
            label: "Latest round",
            data: [
              latest.eagles_pct       ?? 0,
              latest.birdies_pct      ?? 0,
              latest.pars_pct         ?? 0,
              latest.bogeys_pct       ?? 0,
              latest.doubles_plus_pct ?? 0,
            ],
            backgroundColor: ["#f4d03f","#52b788","#2d6a4f","#e67e22","#c0392b"],
            borderRadius: 6,
            order: 1,
          },
          {
            label: "All-round average",
            data: [
              summary.avg_eagles_pct       ?? 0,
              summary.avg_birdies_pct      ?? 0,
              summary.avg_pars_pct         ?? 0,
              summary.avg_bogeys_pct       ?? 0,
              summary.avg_doubles_plus_pct ?? 0,
            ],
            backgroundColor: "rgba(100,116,139,0.2)",
            borderColor:     "rgba(100,116,139,0.45)",
            borderWidth: 2,
            borderRadius: 6,
            order: 2,
          }
        ]
      },
      options: {
        responsive: true,

        plugins: {
          legend: { display: true, position: "top", labels: { boxWidth: 12, font: { size: 12 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } },
        },
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

// ── Compact mini scorecard (round history cards) ────────────────────────────
function miniScorecardHTML(holesJson) {
  if (!holesJson) return "";
  let holes;
  try { holes = typeof holesJson === "string" ? JSON.parse(holesJson) : holesJson; }
  catch { return ""; }
  if (!holes?.length) return "";

  const isEighteen = holes.length > 9;
  const front = isEighteen ? holes.slice(0, 9) : holes;
  const back  = isEighteen ? holes.slice(9) : [];

  function hsCls(s, p) {
    if (s == null || p == null) return "hs-unknown";
    const d = s - p;
    if (d <= -2) return "hs-eagle";
    if (d === -1) return "hs-birdie";
    if (d === 0)  return "hs-par";
    if (d === 1)  return "hs-bogey";
    return "hs-double";
  }

  function cells(group, row) {
    return group.map(h => {
      const s = h.hole_score?.total_of_strokes, p = h.hole_tee?.par, n = h.sequence;
      const scratched = h.hole_score?.scratched;
      if (row === "hole")  return `<td class="msc-td msc-hole">${n}</td>`;
      if (row === "par")   return `<td class="msc-td msc-par">${p ?? ""}</td>`;
      if (scratched) return `<td class="msc-td"><span class="hs-cell hs-pickup" title="H${n}: picked up (${s} strokes)">•</span></td>`;
      return `<td class="msc-td"><span class="hs-cell ${hsCls(s, p)}">${s ?? "?"}</span></td>`;
    }).join("");
  }

  function tot(group, field) {
    return group.reduce((s, h) => s + ((field === "par" ? h.hole_tee?.par : h.hole_score?.total_of_strokes) ?? 0), 0);
  }

  const fPar = tot(front, "par"), fScore = tot(front, "score");
  const bPar = isEighteen ? tot(back, "par") : 0;
  const bScore = isEighteen ? tot(back, "score") : 0;

  const subCls = "msc-td msc-sub";
  const colSep = `<td class="msc-sep"></td>`;

  const holeRow  = `<tr class="msc-tr-holes"><td class="msc-label">HOLE</td>${cells(front,"hole")}<td class="${subCls}">OUT</td>${isEighteen ? colSep + cells(back,"hole") + `<td class="${subCls}">IN</td><td class="${subCls} msc-tot">TOT</td>` : ""}</tr>`;
  const parRow   = `<tr class="msc-tr-par"><td class="msc-label">PAR</td>${cells(front,"par")}<td class="${subCls}">${fPar}</td>${isEighteen ? colSep + cells(back,"par") + `<td class="${subCls}">${bPar}</td><td class="${subCls} msc-tot">${fPar+bPar}</td>` : ""}</tr>`;
  const scoreRow = `<tr class="msc-tr-score"><td class="msc-label">SCORE</td>${cells(front,"score")}<td class="${subCls} msc-sub-score">${fScore}</td>${isEighteen ? colSep + cells(back,"score") + `<td class="${subCls} msc-sub-score">${bScore}</td><td class="${subCls} msc-tot msc-sub-score">${fScore+bScore}</td>` : ""}</tr>`;

  return `<div class="msc-wrap"><table class="msc">${holeRow}${parRow}${scoreRow}</table></div>`;
}

// ── TV-style scorecard banner ───────────────────────────────────────────────
function tvScorecardHTML(holesJson) {
  if (!holesJson) return "";
  let holes;
  try { holes = typeof holesJson === "string" ? JSON.parse(holesJson) : holesJson; }
  catch { return ""; }
  if (!holes?.length) return "";

  const isEighteen = holes.length > 9;
  const front = holes.slice(0, 9);
  const back  = isEighteen ? holes.slice(9) : [];
  const sum   = (hs, fn) => hs.reduce((s, h) => s + fn(h), 0);
  const outPar   = sum(front, h => h.hole_tee.par);
  const inPar    = sum(back,  h => h.hole_tee.par);
  const outScore = sum(front, h => h.hole_score.total_of_strokes);
  const inScore  = sum(back,  h => h.hole_score.total_of_strokes);
  const totalPar   = outPar + inPar;
  const totalScore = outScore + inScore;
  const totalVsP = totalScore - totalPar;
  const totalVsPLabel = totalVsP === 0 ? "E" : (totalVsP > 0 ? `+${totalVsP}` : `${totalVsP}`);
  const totalVsPClass = totalVsP < 0 ? "tv-badge-under" : totalVsP === 0 ? "tv-badge-even" : "tv-badge-over";

  function buildRow(rowCls, label, valueFn, outVal, inVal, totalVal, totalCls = "") {
    let cells = "";
    holes.forEach((h, i) => {
      cells += `<div class="tv-cell">${valueFn(h)}</div>`;
      if (i === 8 && isEighteen) cells += `<div class="tv-cell tv-sub">${outVal}</div>`;
    });
    if (isEighteen) cells += `<div class="tv-cell tv-sub">${inVal}</div>`;
    cells += `<div class="tv-cell tv-total ${totalCls}">${totalVal}</div>`;
    return `<div class="tv-row ${rowCls}"><div class="tv-cell tv-rowlabel">${label}</div>${cells}</div>`;
  }

  const holeRow = buildRow("tv-row-holes", "", h => h.sequence, "OUT", "IN", "TOT");
  const parRow   = buildRow("tv-row-par", "Par", h => h.hole_tee.par, outPar, inPar, totalPar);
  const scoreRow = buildRow("tv-row-score", "Score", h => {
    const strokes = h.hole_score.total_of_strokes;
    const par     = h.hole_tee.par;
    if (h.hole_score.scratched) return `<span class="hs-cell hs-pickup" title="Picked up (${strokes} strokes)">•</span>`;
    const d = strokes - par;
    const cls = d <= -2 ? "hs-eagle" : d === -1 ? "hs-birdie" : d === 0 ? "hs-par" : d === 1 ? "hs-bogey" : "hs-double";
    return `<span class="hs-cell ${cls}">${strokes}</span>`;
  }, outScore, inScore, totalScore, totalVsPClass);

  return `
    <div class="tv-scorecard">
      ${holeRow}
      ${parRow}
      ${scoreRow}
      <div class="tv-vs-par-row">
        <span class="tv-vs-par-badge ${totalVsPClass}">${totalVsPLabel}</span>
        <span class="tv-vs-par-text">vs par</span>
      </div>
    </div>`;
}

// ── Scorecard renderer ────────────────────────────────────────────────────────
function renderScorecard(holesJson) {
  if (!holesJson) return "";
  let holes;
  try { holes = JSON.parse(holesJson); } catch { return ""; }
  if (!holes.length) return "";

  function scoreClass(strokes, par) {
    const d = strokes - par;
    if (d <= -2) return "hs-cell hs-eagle";
    if (d === -1) return "hs-cell hs-birdie";
    if (d === 0)  return "hs-cell hs-par";
    if (d === 1)  return "hs-cell hs-bogey";
    return "hs-cell hs-double";
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
    const girLabel = hs.green_in_regulation == null ? `<span class="fir-na">—</span>`
      : hs.green_in_regulation ? `<span class="gir-hit">✓</span>` : `<span class="gir-miss">✗</span>`;
    const dist = ht.distance ? Math.round(ht.distance) + "y" : "—";

    if (hs.scratched) {
      return `<tr class="sc-row-pickup">
        <td>Hole ${h.sequence}</td>
        <td>${ht.par}</td>
        <td>${ht.stroke_index ?? "—"}</td>
        <td>${dist}</td>
        <td><span class="hs-cell hs-pickup" title="Picked up (${hs.total_of_strokes} strokes)">•</span></td>
        <td>—</td>
        <td>${hs.total_of_putts || "—"}</td>
        <td>${girLabel}</td>
        <td>${firCell(hs.fairway_hit, ht.par)}</td>
        <td>${hs.total_of_penalties || 0}</td>
      </tr>`;
    }

    const cls = scoreClass(hs.total_of_strokes, ht.par);
    const vsP = hs.total_of_strokes - ht.par;
    const vsPLabel = vsP === 0 ? "E" : (vsP > 0 ? `+${vsP}` : `${vsP}`);

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
      ${tvScorecardHTML(holesJson)}
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
      <div class="round-row-header">
        <div class="round-row-hdr-left">
          <div class="round-course">${r.course || "Unknown Course"}</div>
          <div class="round-row-meta">
            <span class="round-date">${fmtDate(r.date)}</span>
            <span class="round-holes">${r.holes || "?"}H</span>
            ${r.tee_colour ? teeBadge(r.tee_colour) : ""}
            ${r.scoring_mode && r.scoring_mode !== "stroke_play" ? `<span class="format-badge" title="Stableford round — included in handicap trend as an approximation">${r.scoring_mode.charAt(0).toUpperCase() + r.scoring_mode.slice(1)}</span>` : ""}
            ${r.handicap_excluded || (r.holes !== 9 && r.holes !== 18) ? `<span class="hcp-excluded-badge" title="${r.holes !== 9 && r.holes !== 18 ? `Non-standard (${r.holes}H)` : "Manually excluded"}">WHS excl.</span>` : ""}
            ${r.putts_unreliable ? `<span class="putts-unreliable-badge" title="Hole19 did not record putt data for several holes">⚠ putts</span>` : ""}
          </div>
        </div>
        <div class="round-row-hdr-right">
          <span class="round-score">${r.score ?? "—"}</span>
          ${scoreLabel(r.score_vs_par)}
        </div>
      </div>
      <div class="round-row-body">
        ${miniScorecardHTML(r.holes_json)}
        <div class="round-row-chips">
          ${r.gir_hit_pct != null ? `<span class="crr-chip" title="GIR">⛳ ${r.gir_hit_pct}%</span>` : ""}
          ${r.fairway_hit_pct != null ? `<span class="crr-chip" title="FIR">🎯 ${r.fairway_hit_pct}%</span>` : ""}
          ${r.putts != null && !r.putts_unreliable ? `<span class="crr-chip" title="Putts">⛏ ${r.putts}</span>` : ""}
          ${r.tee_time ? `<span class="crr-chip" title="Tee time">🕐 ${r.tee_time}</span>` : ""}
          ${r.weather_temp_c != null ? `<span class="crr-chip" title="Temperature">🌡 ${r.weather_temp_c}°C</span>` : ""}
          ${r.weather_wind_kph != null ? `<span class="crr-chip" title="Wind speed">💨 ${r.weather_wind_kph} km/h</span>` : ""}
          ${r.weather_condition ? `<span class="crr-chip" title="Conditions">${weatherIcon(r.weather_condition)} ${r.weather_condition}</span>` : ""}
        </div>
      </div>
    </div>
  `).join("");
  el.querySelectorAll(".round-row").forEach(row => {
    row.addEventListener("click", () => showRoundDetail(+row.dataset.id));
  });
}

// ── Round Detail ──────────────────────────────────────────────────────────────
async function showRoundDetail(id) {
  const [r, whs] = await Promise.all([
    apiFetch(`/api/rounds/${id}`).then(res => res.json()),
    apiFetch("/api/whs").then(res => res.json()),
  ]);
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-links a").forEach(a => a.classList.remove("active"));
  document.getElementById("view-round-detail").classList.add("active");

  const vsLabel = r.score_vs_par != null
    ? (r.score_vs_par >= 0 ? "+" : "") + r.score_vs_par + " vs par"
    : "";

  // Find WHS index at this round's date (last history entry on or before this date)
  const whsHistory = whs?.history ?? [];
  const roundDate  = r.date ?? "";
  const whsAtRound = whsHistory.filter(h => h.date <= roundDate).pop();
  const whsLabel   = whsAtRound
    ? whsAtRound.index + (whsAtRound.estimated ? "*" : "")
    : (whs?.current?.sufficient_data ? whs.current.index : null);

  document.getElementById("roundDetail").innerHTML = `
    <div class="detail-header">
      <h2>${r.course || "Unknown Course"}</h2>
      <div class="detail-meta">
        <span>📅 ${fmtDate(r.date)}</span>
        <span>⛳ ${r.holes || "?"} holes</span>
        ${r.tee_colour ? teeBadge(r.tee_colour) : ""}
        ${r.duration ? `<span>⏱ ${r.duration}</span>` : ""}
        ${r.distance_miles ? `<span>🚶 ${r.distance_miles} miles</span>` : ""}
      </div>
      ${r.ai_short_summary ? `<p class="round-short-summary" id="roundShortSummary">${r.ai_short_summary}</p>` : ""}
    </div>

    <div class="detail-grid">
      <div class="detail-card">
        <h4>Scoring</h4>
        <div class="detail-stat"><span>Score</span><span class="dval">${r.score ?? "—"}</span></div>
        <div class="detail-stat"><span>Par</span><span class="dval">${r.par ?? "—"}</span></div>
        <div class="detail-stat"><span>vs Par</span><span class="dval">${vsLabel || "—"}</span></div>
        <div class="detail-stat"><span>Playing HCP (Hole19)</span><span class="dval">${fmt(r.handicap)}</span></div>
        ${whsLabel != null ? `<div class="detail-stat whs-row"><span>WHS Index <span class="whs-badge">WHS</span></span><span class="dval whs-val">${whsLabel}</span></div>` : ""}
        <div class="detail-stat"><span>Putts</span><span class="dval">${r.putts_unreliable ? `<span class="putts-unreliable" title="Hole19 did not record putt data for several holes in this round">⚠ unreliable</span>` : (r.putts ?? "—")}</span></div>
      </div>
      <div class="detail-card">
        <h4>WHS Eligibility</h4>
        ${r.holes !== 9 && r.holes !== 18
          ? `<p class="whs-ineligible-note">⚠ This round has a non-standard hole count (${r.holes}H) and is automatically excluded from WHS calculations.</p>`
          : `<div class="whs-exclude-toggle">
               <label class="toggle-label">
                 <input type="checkbox" id="chkHcpExclude" ${r.handicap_excluded ? "checked" : ""} />
                 Exclude this round from WHS handicap
               </label>
               <p class="ratings-note">Use this for rounds played in unusual conditions, practice rounds, or any round you don't want counted.</p>
             </div>`
        }
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
      ${r.weather_condition || r.weather_temp_c != null ? `
      <div class="detail-card">
        <h4>Conditions</h4>
        ${r.tee_time ? `<div class="detail-stat"><span>Tee Time</span><span class="dval">🕐 ${r.tee_time}</span></div>` : ""}
        ${r.weather_condition ? `<div class="detail-stat"><span>Weather</span><span class="dval">${weatherIcon(r.weather_condition)} ${r.weather_condition}</span></div>` : ""}
        ${r.weather_temp_c != null ? `<div class="detail-stat"><span>Temperature</span><span class="dval">🌡 ${r.weather_temp_c}°C</span></div>` : ""}
        ${r.weather_wind_kph != null ? `<div class="detail-stat"><span>Wind Speed</span><span class="dval">💨 ${r.weather_wind_kph} km/h</span></div>` : ""}
        ${r.weather_precip_mm != null ? `<div class="detail-stat"><span>Precipitation</span><span class="dval">🌧 ${r.weather_precip_mm} mm</span></div>` : ""}
      </div>` : ""}
    </div>

    ${renderScorecard(r.holes_json)}
    ${renderShotMapHTML(r.holes_json)}

    <div class="notes-section">
      <div class="notes-header">
        <h4>Round Notes</h4>
        <span class="notes-status" id="notesStatus"></span>
      </div>
      <textarea id="notesArea" placeholder="How did you feel? Any context that affected your game — fatigue, conditions, distractions...">${r.notes || ""}</textarea>
      <div class="notes-footer">
        <label class="toggle-label notes-ai-toggle">
          <input type="checkbox" id="chkNotesAiExclude" ${r.notes_ai_excluded ? "checked" : ""} />
          Exclude from AI analysis
        </label>
        <p class="ratings-note">Notes are used by the AI coach for context only — no personal names or identifying details will be referenced.</p>
        <button class="btn-notes-save" id="btnSaveNotes" data-id="${r.id}">Save</button>
      </div>
    </div>

    <div class="round-action-bar">
      <div class="round-action-left">
        <button class="btn-primary" id="btnDebriefThis" data-id="${r.id}">⚡ ${r.ai_debrief ? "Regenerate full report" : r.ai_short_summary ? "Generate full report" : "Generate AI Analysis"}</button>
        ${r.hole19_url ? `<button class="btn-secondary" id="btnReimport" data-id="${r.id}">↻ Re-import from Hole19</button>` : ""}
        ${r.ai_debrief ? `
          <button class="btn-secondary" id="btnToggleDebrief">Show full report ↓</button>
          <button class="btn-secondary" id="btnExportDebrief">⬇ Export PDF</button>
        ` : ""}
      </div>
      <button class="btn-danger" id="btnDeleteRound" data-id="${r.id}">Delete Round</button>
    </div>

    <div class="ai-debrief-box hidden" id="debriefBox">
      <div id="debriefOutput" class="ai-output">${r.ai_debrief ? marked.parse(r.ai_debrief) : ""}</div>
    </div>
  `;

  // Initialise Leaflet maps after DOM is ready
  initShotMaps(r.holes_json);

  document.getElementById("chkHcpExclude")?.addEventListener("change", async (e) => {
    await apiFetch(`/api/rounds/${r.id}/handicap-exclude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ excluded: e.target.checked }),
    });
  });

  document.getElementById("chkNotesAiExclude")?.addEventListener("change", async (e) => {
    await apiFetch(`/api/rounds/${r.id}/notes-ai-exclude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ excluded: e.target.checked }),
    });
  });

  const notesArea  = document.getElementById("notesArea");
  const notesStatus = document.getElementById("notesStatus");
  const btnSaveNotes = document.getElementById("btnSaveNotes");

  async function saveNotes() {
    const notes = notesArea.value;
    btnSaveNotes.textContent = "Saving…";
    btnSaveNotes.disabled = true;
    await apiFetch(`/api/rounds/${r.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    notesStatus.textContent = "Saved";
    notesStatus.className = "notes-status notes-saved";
    btnSaveNotes.textContent = "Save";
    btnSaveNotes.disabled = false;
    btnSaveNotes.classList.remove("notes-dirty");
    setTimeout(() => { notesStatus.textContent = ""; notesStatus.className = "notes-status"; }, 2500);
  }

  notesArea.addEventListener("input", () => {
    notesStatus.textContent = "Unsaved changes";
    notesStatus.className = "notes-status notes-unsaved";
    btnSaveNotes.classList.add("notes-dirty");
  });

  notesArea.addEventListener("blur", saveNotes);
  btnSaveNotes.addEventListener("click", saveNotes);

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
      if (importAiEnabled()) {
        btn.textContent = "Generating AI summary…";
        await apiFetch(`/api/ai/round-short-summary/${data.id}`, { method: "POST" });
      }
      showRoundDetail(data.id);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "↻ Re-import from Hole19";
      alert(`Re-import failed: ${e.message}`);
    }
  });

  async function runAiAnalysis() {
    const btn = document.getElementById("btnDebriefThis");
    const out = document.getElementById("debriefOutput");
    btn.disabled = true;
    btn.textContent = "Generating…";

    // Short summary first — fast, updates the header immediately
    try {
      const sr = await apiFetch(`/api/ai/round-short-summary/${r.id}`, { method: "POST" });
      const sd = await sr.json();
      if (sr.ok && sd.summary) {
        let snap = document.getElementById("roundShortSummary");
        if (!snap) {
          snap = document.createElement("p");
          snap.id = "roundShortSummary";
          snap.className = "round-short-summary";
          document.querySelector(".detail-header").appendChild(snap);
        }
        snap.textContent = sd.summary;
      }
    } catch (_) {}

    // Full debrief — stream into box, show it
    const box = document.getElementById("debriefBox");
    box.classList.remove("hidden");
    out.classList.add("streaming");
    out.innerHTML = '<span class="ai-placeholder">Generating full report…</span>';

    // Ensure toggle + export buttons exist in the action bar
    const actionLeft = document.querySelector(".round-action-left");
    if (actionLeft && !document.getElementById("btnToggleDebrief")) {
      const tb = document.createElement("button");
      tb.className = "btn-secondary";
      tb.id = "btnToggleDebrief";
      tb.textContent = "Hide full report ↑";
      tb.addEventListener("click", toggleDebrief);
      actionLeft.appendChild(tb);
    } else if (document.getElementById("btnToggleDebrief")) {
      document.getElementById("btnToggleDebrief").textContent = "Hide full report ↑";
    }
    if (actionLeft && !document.getElementById("btnExportDebrief")) {
      const eb = document.createElement("button");
      eb.className = "btn-secondary";
      eb.id = "btnExportDebrief";
      eb.textContent = "⬇ Export PDF";
      eb.addEventListener("click", exportRoundDebrief);
      actionLeft.appendChild(eb);
    }

    box.scrollIntoView({ behavior: "smooth" });
    await streamAI(`/api/ai/round-debrief/${r.id}`, out);
    out.classList.remove("streaming");
    btn.disabled = false;
    btn.textContent = "↺ Regenerate AI Analysis";
  }

  function exportRoundDebrief() {
    const content = document.getElementById("debriefOutput")?.innerHTML;
    if (!content) return;
    const title = `Round Debrief — ${r.course || "Unknown Course"} (${fmtDate(r.date)})`;
    exportToPDF(title, content);
  }

  function toggleDebrief() {
    const box = document.getElementById("debriefBox");
    const btn = document.getElementById("btnToggleDebrief");
    box.classList.toggle("hidden");
    btn.textContent = box.classList.contains("hidden") ? "Show full report ↓" : "Hide full report ↑";
  }

  document.getElementById("btnDebriefThis").addEventListener("click", runAiAnalysis);
  document.getElementById("btnToggleDebrief")?.addEventListener("click", toggleDebrief);
  document.getElementById("btnExportDebrief")?.addEventListener("click", exportRoundDebrief);
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
  return document.getElementById("chkImportAi")?.checked ||
         document.getElementById("chkImportAiEmail")?.checked;
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

const TEE_COLOURS = ["White", "Yellow", "Red", "Blue"];
const TEE_CSS = { White: "tee-white", Yellow: "tee-yellow", Red: "tee-red", Blue: "tee-blue" };

function teeBadge(colour) {
  if (!colour) return "";
  return `<span class="tee-badge ${TEE_CSS[colour] || ""}">${colour}</span>`;
}

// ── Import wizard ─────────────────────────────────────────────────────────────

function showTeePrompt(roundId, course, courseId, holes, onDone) {
  setImportStatus("wizard", `
    <div class="wizard-step">
      <div class="wizard-header">
        <span class="wizard-step-label">Step 1 of 2</span>
        <strong>Which tees did you play at ${course}?</strong>
      </div>
      <div class="wizard-actions">
        ${TEE_COLOURS.map(t => `<button class="btn-secondary btn-sm btn-tee" data-tee="${t}">${teeBadge(t)} ${t}</button>`).join("")}
      </div>
    </div>
  `);
  document.querySelectorAll(".btn-tee").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tee = btn.dataset.tee;
      await apiFetch(`/api/rounds/${roundId}/tee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tee_colour: tee }),
      });
      if (courseId) {
        await showRatingsStep(courseId, course, tee, holes, () => onDone(tee));
      } else {
        onDone(tee);
      }
    });
  });
}

async function showRatingsStep(courseId, course, tee, holes, onDone) {
  // Check if ratings already exist for this tee
  const status = await apiFetch(`/api/courses/${courseId}/ratings-status?tee=${tee.toLowerCase()}&holes=${holes}`)
    .then(r => r.json()).catch(() => ({ has_ratings: true }));
  if (status.has_ratings) { onDone(); return; }

  const holeSuffix = holes <= 9 ? "9" : "18";
  const cfg = await apiFetch("/api/config").then(r => r.json()).catch(() => ({}));
  const aiAvailable = !!(cfg.api_key || cfg.provider === "ollama" || cfg.provider === "lmstudio");

  setImportStatus("wizard", `
    <div class="wizard-step">
      <div class="wizard-header">
        <span class="wizard-step-label">Step 2 of 2</span>
        <strong>Course ratings for ${course} — ${tee} tees (${holes}H)</strong>
        <p class="wizard-note">These are used for accurate WHS handicap and AI analysis. You can add them now or skip and add later via the Courses page.</p>
      </div>
      <div class="wizard-ratings-form">
        <label class="wizard-field">
          <span>Course Rating (CR)</span>
          <input type="number" id="wizCr" step="0.1" min="55" max="80" placeholder="e.g. 69.5" />
        </label>
        <label class="wizard-field">
          <span>Slope Rating</span>
          <input type="number" id="wizSlope" step="1" min="55" max="155" placeholder="e.g. 118" />
        </label>
      </div>
      <div id="wizAiSuggestion" class="wizard-ai-suggestion hidden"></div>
      <div class="wizard-actions">
        ${aiAvailable ? `<button class="btn-secondary btn-sm" id="btnWizAiLookup">✦ Ask AI</button>` : ""}
        <button class="btn-primary btn-sm" id="btnWizSaveRatings">Save &amp; Continue</button>
        <button class="btn-secondary btn-sm" id="btnWizSkip">Skip for now</button>
      </div>
    </div>
  `);

  if (aiAvailable) {
    document.getElementById("btnWizAiLookup").addEventListener("click", async () => {
      const btn = document.getElementById("btnWizAiLookup");
      const box = document.getElementById("wizAiSuggestion");
      btn.disabled = true;
      btn.textContent = "Looking up…";
      box.className = "wizard-ai-suggestion";
      box.innerHTML = "Asking AI…";
      try {
        const res = await apiFetch("/api/courses/ai-lookup-ratings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ course, tee_colour: tee, holes }),
        }).then(r => r.json());
        if (res.cr && res.slope) {
          document.getElementById("wizCr").value    = res.cr;
          document.getElementById("wizSlope").value = res.slope;
          const conf = res.confidence === "high" ? "✓ High confidence" : res.confidence === "medium" ? "~ Medium confidence" : "⚠ Low confidence — please verify";
          box.innerHTML = `<span class="conf-${res.confidence}">${conf}</span> ${res.note ? `— ${res.note}` : ""}`;
        } else {
          box.innerHTML = `<span class="conf-low">AI couldn't find ratings for this course. Enter manually.</span>`;
        }
      } catch(e) {
        box.innerHTML = `<span class="conf-low">AI lookup failed: ${e.message}</span>`;
      }
      btn.disabled = false;
      btn.textContent = "✦ Ask AI";
    });
  }

  document.getElementById("btnWizSaveRatings").addEventListener("click", async () => {
    const cr    = parseFloat(document.getElementById("wizCr").value);
    const slope = parseInt(document.getElementById("wizSlope").value);
    if (!cr || !slope) { alert("Please enter both CR and Slope, or click Skip."); return; }
    const key = `${tee.toLowerCase()}_cr_${holeSuffix}`;
    const sKey = `${tee.toLowerCase()}_slope_${holeSuffix}`;
    await apiFetch(`/api/courses/${courseId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: cr, [sKey]: slope }),
    });
    onDone();
  });

  document.getElementById("btnWizSkip").addEventListener("click", () => onDone());
}

function showAiProgress(steps, activeIndex) {
  const el = document.getElementById("importStatus");
  el.className = "import-status loading";
  el.innerHTML = `
    <div class="ai-progress">
      ${steps.map((s, i) => `
        <div class="ai-progress-step ${i < activeIndex ? "done" : i === activeIndex ? "active" : ""}">
          <span class="ai-progress-dot"></span>
          <span>${s}</span>
        </div>`).join("")}
      <div class="ai-progress-timer" id="aiProgressTimer"></div>
    </div>`;
}

async function runPostImportAi(roundId, statusPrefix) {
  const steps = ["Importing round data", "Generating round summary", "Updating overall analysis"];
  showAiProgress(steps, 1);

  // Start elapsed timer
  const start = Date.now();
  const timerEl = () => document.getElementById("aiProgressTimer");
  const timerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - start) / 1000);
    const el = timerEl();
    if (el) el.textContent = `${s}s elapsed…`;
  }, 1000);

  try {
    // Step: short summary
    const sr = await apiFetch(`/api/ai/round-short-summary/${roundId}`, { method: "POST" });
    if (!sr.ok) {
      const e = await sr.json().catch(() => ({}));
      throw new Error(`AI summary failed: ${e.error || sr.statusText}`);
    }

    // Step: global summary — auto mode, only regenerates if new round added
    showAiProgress(steps, 2);
    const gs = await apiFetch("/api/ai/global-summary").then(r => r.json()).catch(() => ({}));
    const body = {
      type:      "performance",
      auto:      true,
      from_date: gs.default_from,
      to_date:   gs.default_to,
    };
    const gr = await apiFetch("/api/ai/global-summary", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    if (gr.ok && gr.headers.get("content-type")?.includes("text")) {
      // Drain the stream so save_global_summary fires server-side
      const reader = gr.body.getReader();
      while (!(await reader.read()).done) {}
    }
  } finally {
    clearInterval(timerInterval);
  }
}

// ── Import from URL ───────────────────────────────────────────────────────────
async function doUrlImport(url, overwrite = false) {
  const useAi = importAiEnabled();
  const notes = document.getElementById("importNotes").value.trim();
  const notesExcluded = document.getElementById("chkImportNotesExclude").checked;
  document.getElementById("btnImport").disabled = true;
  setImportStatus("loading", "Fetching round data from Hole19…");
  try {
    const r = await apiFetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, overwrite, notes, notes_ai_excluded: notesExcluded }),
    });
    const data = await r.json();
    if (r.status === 409 && data.duplicate) {
      document.getElementById("btnImport").disabled = false;
      showDuplicatePrompt(data.existing, () => doUrlImport(url, true));
      return;
    }
    if (!r.ok) throw new Error(data.error || "Import failed");
    const course = data.data.course || "Unknown Course";
    const holes  = data.data.holes || 18;
    const prefix = `✓ ${course} on ${fmtDate(data.data.date)} imported.`;
    showTeePrompt(data.id, course, data.course_id, holes, async (tee) => {
      if (useAi) {
        await runPostImportAi(data.id, prefix);
      }
      document.getElementById("importUrl").value = "";
      document.getElementById("importNotes").value = "";
      document.getElementById("chkImportNotesExclude").checked = false;
      setImportStatus("", "");
      showRoundDetail(data.id);
    });
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
  const notes = document.getElementById("importNotesEmail").value.trim();
  const notesExcluded = document.getElementById("chkImportNotesExcludeEmail").checked;
  document.getElementById("btnImportEmail").disabled = true;
  setImportStatus("loading", "Extracting stats from email…");
  try {
    const r = await apiFetch("/api/import/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, overwrite, notes, notes_ai_excluded: notesExcluded }),
    });
    const data = await r.json();
    if (r.status === 409 && data.duplicate) {
      document.getElementById("btnImportEmail").disabled = false;
      showDuplicatePrompt(data.existing, () => doEmailImport(text, true));
      return;
    }
    if (!r.ok) throw new Error(data.error || "Import failed");
    const course = data.data.course || "Unknown Course";
    const holes  = data.data.holes || 18;
    const method = data.method === "ai" ? " (via AI extraction)" : "";
    const prefix = `✓ ${course} on ${fmtDate(data.data.date)} imported${method}.`;
    showTeePrompt(data.id, course, data.course_id, holes, async (tee) => {
      if (useAi) {
        await runPostImportAi(data.id, prefix);
      }
      document.getElementById("importEmailText").value = "";
      document.getElementById("importNotesEmail").value = "";
      document.getElementById("chkImportNotesExcludeEmail").checked = false;
      setImportStatus("", "");
      showRoundDetail(data.id);
    });
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

// ── Courses ───────────────────────────────────────────────────────────────────
function courseCardHTML(c) {
  const children   = c.children || [];
  const hasChildren = children.length > 0;
  const ownOnly    = c.has_own_rounds || !hasChildren;
  const qualifier  = !ownOnly ? " · 9H" : "";

  const ratingBadges = TEE_COLOURS.filter(t => c[t.toLowerCase()+"_cr_18"]).map(t =>
    `<span class="cc-rating-badge">${teeBadge(t)} <span>CR ${c[t.toLowerCase()+"_cr_18"]} / ${c[t.toLowerCase()+"_slope_18"] ?? "—"}</span></span>`
  ).join("");

  const fmtVsPar = v => v == null ? null : (v > 0 ? "+" : "") + v;
  const statVal  = v => v == null
    ? `<span class="cc-stat-val cc-stat-empty">—</span>`
    : `<span class="cc-stat-val">${v}</span>`;

  const stats = `
    <div class="cc-stats">
      <div class="cc-stat">
        <span class="cc-stat-label">Best${qualifier}</span>
        ${statVal(fmtVsPar(c.best_vs_par))}
      </div>
      <div class="cc-stat">
        <span class="cc-stat-label">Avg${qualifier}</span>
        ${statVal(fmtVsPar(c.avg_vs_par))}
      </div>
      <div class="cc-stat">
        <span class="cc-stat-label">Avg putts</span>
        ${statVal(c.avg_putts)}
      </div>
      <div class="cc-stat">
        <span class="cc-stat-label">GIR</span>
        ${statVal(c.avg_gir != null ? c.avg_gir + "%" : null)}
      </div>
    </div>`;

  const childRows = hasChildren ? `
    <div class="cc-children">
      ${children.map(ch => {
        const fmtVsP = v => v == null ? "" : ` · ${v > 0 ? "+" : ""}${v} avg`;
        return `<div class="cc-child-row" data-id="${ch.id}">
          <span class="cc-child-name">${ch.name}</span>
          <span class="cc-child-meta">${ch.times_played ?? 0} round${(ch.times_played ?? 0) !== 1 ? "s" : ""}${fmtVsP(ch.avg_vs_par)}</span>
          <span class="cc-child-arrow">›</span>
        </div>`;
      }).join("")}
    </div>` : "";

  const footer = ratingBadges
    ? `<div class="cc-footer">${ratingBadges}</div>`
    : `<div class="cc-footer cc-footer-empty">No tee ratings set</div>`;

  return `
    <div class="course-card" data-id="${c.id}">
      <div class="cc-header">
        <div class="cc-name">${c.name}</div>
        <span class="cc-rounds-pill">${c.times_played} round${c.times_played !== 1 ? "s" : ""}</span>
      </div>
      <div class="cc-body">
        ${stats}
        ${footer}
        ${childRows}
      </div>
    </div>
  `;
}

async function loadCourses() {
  const el = document.getElementById("coursesList");
  el.innerHTML = "<p>Loading…</p>";
  const [courses, suggestions] = await Promise.all([
    apiFetch("/api/courses").then(r => r.json()),
    apiFetch("/api/courses/suggestions").then(r => r.json()),
  ]);
  if (!courses.length) {
    el.innerHTML = "<p class='subtle'>No courses yet. Import a round to get started.</p>";
    return;
  }

  // Suggestions banner
  let suggestHTML = "";
  if (suggestions.length) {
    suggestHTML = suggestions.map(s => `
      <div class="course-suggestion" data-ids="${s.courses.map(c=>c.id).join(",")}" data-name="${s.base_name}">
        <div class="suggestion-text">
          <strong>Link suggestion:</strong>
          ${s.courses.map(c => `<em>${c.name}</em>`).join(" + ")}
          look like halves of <strong>${s.base_name}</strong>
        </div>
        <div class="suggestion-actions">
          <button class="btn-primary btn-sm btn-confirm-link">Link them</button>
          <button class="btn-secondary btn-sm btn-dismiss-link">Dismiss</button>
        </div>
      </div>
    `).join("");
  }

  el.innerHTML = suggestHTML + courses.map(c => courseCardHTML(c)).join("");

  el.querySelectorAll(".course-card").forEach(card => {
    card.addEventListener("click", () => showCourseDetail(+card.dataset.id));
  });
  el.querySelectorAll(".cc-child-row").forEach(row => {
    row.addEventListener("click", e => {
      e.stopPropagation();
      showCourseDetail(+row.dataset.id);
    });
  });

  // Suggestion confirm
  el.querySelectorAll(".btn-confirm-link").forEach(btn => {
    btn.addEventListener("click", async e => {
      const row = e.target.closest(".course-suggestion");
      const ids = row.dataset.ids.split(",").map(Number);
      const name = row.dataset.name;
      await apiFetch("/api/courses/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ child_ids: ids, parent_name: name }),
      });
      loadCourses();
    });
  });

  el.querySelectorAll(".btn-dismiss-link").forEach(btn => {
    btn.addEventListener("click", e => {
      e.target.closest(".course-suggestion").remove();
    });
  });
}

function roundsTableHTML(rounds) {
  if (!rounds.length) return "<p class='subtle'>No rounds.</p>";
  return `<div class="course-rounds-list">
    ${rounds.map(r => `
      <div class="course-round-row" data-id="${r.id}">
        <div class="crr-main">
          <span class="crr-date">${fmtDate(r.date)}</span>
          <span class="crr-holes">${r.holes}H</span>
          ${r.tee_colour ? teeBadge(r.tee_colour) : ""}
          <span class="crr-score">${r.score ?? "—"} (${r.score_vs_par != null ? (r.score_vs_par > 0 ? "+" : "") + r.score_vs_par : "—"})</span>
        </div>
        <div class="crr-chips">
          ${r.gir_hit_pct != null ? `<span class="crr-chip" title="GIR">⛳ ${r.gir_hit_pct}%</span>` : ""}
          ${r.fairway_hit_pct != null ? `<span class="crr-chip" title="FIR">🎯 ${r.fairway_hit_pct}%</span>` : ""}
          <span class="crr-chip ${r.putts_unreliable ? "crr-chip-warn" : ""}" title="Putts">${r.putts_unreliable ? "⚠ putts unreliable" : `⛏ ${r.putts ?? "—"}`}</span>
        </div>
      </div>
    `).join("")}
  </div>`;
}

function holeTableHTML(perHole) {
  if (!perHole.length) return "";
  return `
    <div class="hole-card-strip">
      ${perHole.map(h => {
        const vp = h.avg_score != null && h.par != null ? (h.avg_score - h.par).toFixed(2) : null;
        const vpNum = vp != null ? +vp : null;
        const cls = vpNum == null ? "" : vpNum < -0.05 ? "under-par" : vpNum > 0.05 ? "over-par" : "even-par";
        return `
          <div class="hole-card">
            <div class="hole-card-num">${h.hole}</div>
            <div class="hole-card-par">Par ${h.par ?? "—"}</div>
            <div class="hole-card-avg ${cls}">${h.avg_score ?? "—"}</div>
            <div class="hole-card-vp ${cls}">${vp != null ? (vpNum > 0 ? "+" : "") + vp : "—"}</div>
            <div class="hole-card-meta">
              ${h.gir_pct != null ? `<span title="GIR">⛳ ${h.gir_pct}%</span>` : ""}
              ${h.fir_pct != null ? `<span title="FIR">🎯 ${h.fir_pct}%</span>` : ""}
              <span title="Avg putts">⛏ ${h.avg_putts ?? "—"}</span>
            </div>
          </div>`;
      }).join("")}
    </div>`;
}

function miniStatsHTML(rounds) {
  const scores = rounds.map(r => r.score_vs_par).filter(x => x != null);
  const best   = scores.length ? Math.min(...scores) : null;
  const avg    = scores.length ? (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1) : null;
  const putts  = rounds.filter(r => r.putts && !r.putts_unreliable).map(r => r.putts);
  const avgP   = putts.length ? (putts.reduce((a,b) => a+b, 0) / putts.length).toFixed(1) : null;
  const girs   = rounds.map(r => r.gir_hit_pct).filter(x => x != null);
  const avgGir = girs.length ? (girs.reduce((a,b) => a+b, 0) / girs.length).toFixed(1) : null;
  const firs   = rounds.map(r => r.fairway_hit_pct).filter(x => x != null);
  const avgFir = firs.length ? (firs.reduce((a,b) => a+b, 0) / firs.length).toFixed(1) : null;
  return `
    <div class="cd-stat-cards">
      <div class="cd-stat-card"><span class="cd-stat-label">Rounds</span><span class="cd-stat-val">${rounds.length}</span></div>
      ${best  != null ? `<div class="cd-stat-card"><span class="cd-stat-label">Best</span><span class="cd-stat-val">${best > 0 ? "+" : ""}${best}</span></div>` : ""}
      ${avg   != null ? `<div class="cd-stat-card"><span class="cd-stat-label">Avg Score</span><span class="cd-stat-val">${avg > 0 ? "+" : ""}${avg}</span></div>` : ""}
      ${avgP  != null ? `<div class="cd-stat-card"><span class="cd-stat-label">Avg Putts</span><span class="cd-stat-val">${avgP}</span></div>` : ""}
      ${avgGir!= null ? `<div class="cd-stat-card"><span class="cd-stat-label">Avg GIR</span><span class="cd-stat-val">${avgGir}%</span></div>` : ""}
      ${avgFir!= null ? `<div class="cd-stat-card"><span class="cd-stat-label">Avg FIR</span><span class="cd-stat-val">${avgFir}%</span></div>` : ""}
    </div>`;
}

function bestRoundOf(rounds) {
  const scores = rounds.map(r => r.score_vs_par).filter(x => x != null);
  if (!scores.length) return null;
  const best = Math.min(...scores);
  return rounds.find(r => r.score_vs_par === best);
}

function hsLegendHTML() {
  return `
    <div class="hs-legend">
      <span class="hs-legend-item"><span class="hs-cell hs-eagle">2</span> Eagle</span>
      <span class="hs-legend-item"><span class="hs-cell hs-birdie">3</span> Birdie</span>
      <span class="hs-legend-item"><span class="hs-cell hs-par">4</span> Par</span>
      <span class="hs-legend-item"><span class="hs-cell hs-bogey">5</span> Bogey</span>
      <span class="hs-legend-item"><span class="hs-cell hs-double">6</span> Double+</span>
    </div>`;
}

async function showCourseDetail(id) {
  const c = await apiFetch(`/api/courses/${id}`).then(r => r.json());
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-course-detail").classList.add("active");

  const el       = document.getElementById("courseDetail");
  const all      = c.rounds     || [];
  const r18      = c.rounds_18  || [];
  const r9       = c.rounds_9   || [];
  const perHole  = c.per_hole   || [];
  const children = c.children   || [];
  const isParent = children.length > 0;

  // My Record stats
  const scores      = all.map(r => r.score_vs_par).filter(x => x != null);
  const best        = scores.length ? Math.min(...scores) : null;
  const lastPlayed  = all.length ? all.slice().sort((a,b) => b.date.localeCompare(a.date))[0] : null;
  const teeBreakdown = TEE_COLOURS.map(t => {
    const n = all.filter(r => (r.tee_colour||"").toLowerCase() === t.toLowerCase()).length;
    return n ? `${teeBadge(t)} ${n}` : "";
  }).filter(Boolean).join("  ");

  // Personal best, split by hole count (a 9-hole best and an 18-hole best are
  // different records — not comparable, so they're never merged into one).
  const best18 = bestRoundOf(r18);
  const best9  = bestRoundOf(r9);
  const bestBlocks = [
    best18 ? { round: best18, label: "18 holes" } : null,
    best9  ? { round: best9,  label: "9 holes" }  : null,
  ].filter(Boolean);

  const unlinkBtn = c.parent_course_id
    ? `<button class="btn-secondary btn-sm" id="btnUnlink">Unlink from parent</button>`
    : "";

  const cfg = await apiFetch("/api/config").then(r => r.json()).catch(() => ({}));
  const aiAvailable = !!(cfg.api_key || cfg.provider === "ollama" || cfg.provider === "lmstudio");

  el.innerHTML = `
    <div class="cd-header-row">
      <h1>${c.name}</h1>
      ${unlinkBtn}
    </div>

    <!-- My Record banner -->
    <div class="cd-record-banner">
      <div class="cd-record-stat">
        <span class="cd-record-label">Rounds played</span>
        <span class="cd-record-val">${all.length}</span>
      </div>
      <div class="cd-record-stat">
        <span class="cd-record-label">Best score</span>
        <span class="cd-record-val">${best != null ? (best > 0 ? "+" : "") + best : "—"}</span>
      </div>
      <div class="cd-record-stat">
        <span class="cd-record-label">Last played</span>
        <span class="cd-record-val">${lastPlayed ? fmtDate(lastPlayed.date) : "—"}</span>
      </div>
      ${teeBreakdown ? `<div class="cd-record-stat cd-record-tees"><span class="cd-record-label">Tees played</span><span class="cd-record-val tee-breakdown">${teeBreakdown}</span></div>` : ""}
    </div>

    <!-- Description -->
    <div class="cd-section">
      <div class="cd-description-header">
        <h3>About this course</h3>
        <div class="cd-description-header-actions">
          ${aiAvailable ? `<button class="btn-secondary btn-sm" id="btnFetchDesc">✦ Ask AI</button>` : ""}
          <button class="btn-icon" id="btnEditDesc" title="Edit description">✎</button>
        </div>
      </div>
      <div id="descView" class="cd-description-view ${c.description ? "" : "cd-description-empty"}">${
        c.description ? marked.parse(c.description) : "No description yet — click ✎ to add one, or ✦ Ask AI to fetch one."
      }</div>
      <div id="descEdit" class="cd-description-edit hidden">
        <textarea id="courseDescription" class="cd-description-textarea" rows="4" placeholder="Add a description of this course…">${c.description ?? ""}</textarea>
        <p class="ratings-note">Supports basic markdown — **bold**, *italic*, and lists.</p>
        <div class="cd-description-actions">
          <button class="btn-primary btn-sm" id="btnSaveDesc">Save</button>
          <button class="btn-secondary btn-sm" id="btnCancelDesc">Cancel</button>
          <span id="descSaved" class="ratings-saved hidden">Saved ✓</span>
        </div>
      </div>
    </div>

    <!-- My Notes (personal, always visible — separate from course settings) -->
    <div class="cd-section">
      <h3>My Notes</h3>
      <p class="chart-desc">Your own reminders about this course — parking, conditions, tips for next time.</p>
      <textarea id="courseNotes" class="cd-description-textarea" rows="2" placeholder="e.g. Park behind the clubhouse, hole 7 plays longer than the yardage suggests…">${c.notes ?? ""}</textarea>
      <div class="cd-description-actions">
        <button class="btn-primary btn-sm" id="btnSaveNotes">Save</button>
        <span id="notesSaved" class="ratings-saved hidden">Saved ✓</span>
      </div>
    </div>

    <!-- Score trend -->
    ${all.length >= 2 ? `
      <div class="cd-section">
        <h3>Score trend</h3>
        <p class="chart-desc">Shots over or under par for each round here, in the order you played them — lower is better.${
          r9.length && r18.length ? " 9-hole and 18-hole rounds are plotted as separate lines since they aren't directly comparable." : ""
        }</p>
        <canvas id="cdScoreChart" class="cd-score-chart"></canvas>
      </div>
    ` : ""}

    <!-- Avg stats -->
    ${all.length ? `
      <div class="cd-section">
        <h3>${isParent ? "Combined Averages" : "Averages"}</h3>
        ${isParent ? `
          <p class="chart-desc">Combines results from both halves below — click through for each one's own per-hole detail.</p>
          <div class="holes-breakdown">
            <div class="breakdown-block">
              <div class="breakdown-label">18-Hole</div>
              ${miniStatsHTML(r18)}
            </div>
            <div class="breakdown-block">
              <div class="breakdown-label">9-Hole</div>
              ${miniStatsHTML(r9)}
            </div>
          </div>
          <div class="cd-children-links">
            ${children.map(ch => `<button class="cd-child-link" data-child-id="${ch.id}"><strong>${ch.name}</strong> — ${ch.times_played ?? 0} round${ch.times_played !== 1 ? "s" : ""}</button>`).join("")}
          </div>
        ` : miniStatsHTML(all)}
      </div>
    ` : ""}

    <!-- Personal best -->
    ${bestBlocks.length ? `
      <div class="cd-section">
        <h3>Personal Best</h3>
        ${bestBlocks.map(b => `
          <div class="cd-best-block">
            <div class="cd-best-block-label">${bestBlocks.length > 1 ? b.label + " · " : ""}<span class="cd-best-meta">${fmtDate(b.round.date)}</span></div>
            ${tvScorecardHTML(b.round.holes_json)}
          </div>
        `).join("")}
        ${hsLegendHTML()}
      </div>
    ` : ""}

    <!-- Per-hole averages -->
    ${isParent ? `
      <div class="cd-section">
        <h3>Per-Hole Averages</h3>
        <p class="chart-desc">Not shown on this combined page — the two halves are different physical holes. View each one's breakdown below:</p>
        <div class="cd-children-links">
          ${children.map(ch => `<button class="cd-child-link" data-child-id="${ch.id}"><strong>${ch.name}</strong></button>`).join("")}
        </div>
      </div>
    ` : perHole.length ? `
      <div class="cd-section">
        <h3>Per-Hole Averages</h3>
        <p class="chart-desc">Average score per hole across all your rounds here. Colour shows performance vs par — green is under, red is over.</p>
        ${holeTableHTML(perHole)}
        <div class="hole-card-legend">⛳ GIR &nbsp; 🎯 FIR &nbsp; ⛏ Avg putts</div>
      </div>
    ` : ""}

    <!-- All rounds -->
    <div class="cd-section">
      <h3>Round History</h3>
      ${isParent ? `
        ${r18.length ? `<div class="breakdown-label" style="margin-bottom:8px">18-Hole</div>${roundsTableHTML(r18)}` : ""}
        ${r9.length  ? `<div class="breakdown-label" style="margin:16px 0 8px">9-Hole</div>${roundsTableHTML(r9)}` : ""}
      ` : roundsTableHTML(all)}
    </div>

    <!-- Course settings (collapsible) -->
    <div class="cd-section cd-section-settings">
      <button type="button" class="cd-settings-toggle" id="cdSettingsToggle">
        <span class="cd-settings-icon">⚙</span>
        <span class="cd-settings-title">
          <span class="cd-settings-title-main">Course Settings</span>
          <span class="cd-settings-title-sub">Course Rating &amp; Slope, per tee</span>
        </span>
        <span class="cd-settings-chevron" id="cdSettingsChevron">▾</span>
      </button>
      <div class="cd-settings-body hidden" id="cdSettingsBody">
        <form id="courseRatingsForm" class="ratings-form" style="margin-top:4px">
          ${TEE_COLOURS.map(tee => `
            <div class="ratings-tee-group">
              <div class="ratings-tee-label">${teeBadge(tee)} ${tee} Tees</div>
              <div class="ratings-row">
                <label>18H CR<input type="number" step="0.1" data-col="${tee.toLowerCase()}_cr_18" value="${c[tee.toLowerCase()+"_cr_18"] ?? ""}" placeholder="70.5" /></label>
                <label>18H Slope<input type="number" data-col="${tee.toLowerCase()}_slope_18" value="${c[tee.toLowerCase()+"_slope_18"] ?? ""}" placeholder="125" /></label>
                <label>9H CR<input type="number" step="0.1" data-col="${tee.toLowerCase()}_cr_9" value="${c[tee.toLowerCase()+"_cr_9"] ?? ""}" placeholder="35.2" /></label>
                <label>9H Slope<input type="number" data-col="${tee.toLowerCase()}_slope_9" value="${c[tee.toLowerCase()+"_slope_9"] ?? ""}" placeholder="120" /></label>
              </div>
            </div>
          `).join("")}
          <div style="display:flex;align-items:center;gap:12px">
            <button type="submit" class="btn-primary" id="btnSaveRatings">Save Ratings</button>
            <span id="ratingsSaved" class="ratings-saved hidden">Saved ✓</span>
          </div>
        </form>
        <p class="ratings-note" style="margin-top:10px">${isParent
          ? "Set 18H ratings here. 9H ratings can also be set here to apply to both halves, or individually on each half's page."
          : "CR and Slope per tee. Used for WHS — set Yellow tees first for accurate differentials."
        }</p>
      </div>
    </div>
  `;

  // Score trend chart(s)
  if (all.length >= 2) {
    if (r9.length && r18.length) {
      const dates = Array.from(new Set(all.map(r => r.date))).sort();
      const labels = dates.map(fmtDate);
      const map9  = {}; r9.forEach(r  => map9[r.date]  = r.score_vs_par);
      const map18 = {}; r18.forEach(r => map18[r.date] = r.score_vs_par);
      mkChartMulti("cdScoreChart", [
        { label: "9 holes",  data: dates.map(d => map9[d]  ?? null), borderColor: "#b7950b", backgroundColor: "#b7950b18", borderWidth: 2, pointRadius: 4, pointBackgroundColor: "#b7950b", tension: 0.3 },
        { label: "18 holes", data: dates.map(d => map18[d] ?? null), borderColor: "#2d6a4f", backgroundColor: "#2d6a4f18", borderWidth: 2, pointRadius: 4, pointBackgroundColor: "#2d6a4f", tension: 0.3 },
      ], labels);
    } else {
      const sorted = all.slice().sort((a,b) => a.date.localeCompare(b.date));
      mkChart("cdScoreChart", "Score vs Par", sorted.map(r => r.score_vs_par), sorted.map(r => fmtDate(r.date)), "#2d6a4f");
    }
  }

  // Description: view/edit toggle, save, AI fetch
  function openDescEdit() {
    document.getElementById("descView").classList.add("hidden");
    document.getElementById("descEdit").classList.remove("hidden");
    document.getElementById("courseDescription").focus();
  }
  function closeDescEdit() {
    document.getElementById("descView").classList.remove("hidden");
    document.getElementById("descEdit").classList.add("hidden");
  }
  document.getElementById("btnEditDesc").addEventListener("click", openDescEdit);
  document.getElementById("btnCancelDesc").addEventListener("click", closeDescEdit);

  document.getElementById("btnSaveDesc").addEventListener("click", async () => {
    const desc = document.getElementById("courseDescription").value.trim() || null;
    await apiFetch(`/api/courses/${id}`, {
      method: "PUT", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ description: desc }),
    });
    const view = document.getElementById("descView");
    view.innerHTML = desc ? marked.parse(desc) : "No description yet — click ✎ to add one, or ✦ Ask AI to fetch one.";
    view.classList.toggle("cd-description-empty", !desc);
    closeDescEdit();
    document.getElementById("descSaved").classList.remove("hidden");
    setTimeout(() => document.getElementById("descSaved").classList.add("hidden"), 2000);
  });

  document.getElementById("btnFetchDesc")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnFetchDesc");
    btn.disabled = true; btn.textContent = "Fetching…";
    try {
      const res = await apiFetch(`/api/courses/${id}/ai-description`, { method: "POST" }).then(r => r.json());
      if (res.description) {
        document.getElementById("courseDescription").value = res.description;
        openDescEdit();
      } else alert("AI couldn't find a description for this course.");
    } catch(e) { alert("AI lookup failed: " + e.message); }
    btn.disabled = false; btn.textContent = "✦ Ask AI";
  });

  // My Notes: save
  document.getElementById("btnSaveNotes").addEventListener("click", async () => {
    const notes = document.getElementById("courseNotes").value.trim() || null;
    await apiFetch(`/api/courses/${id}`, {
      method: "PUT", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ notes }),
    });
    document.getElementById("notesSaved").classList.remove("hidden");
    setTimeout(() => document.getElementById("notesSaved").classList.add("hidden"), 2000);
  });

  // Course settings collapsible
  document.getElementById("cdSettingsToggle").addEventListener("click", () => {
    const body = document.getElementById("cdSettingsBody");
    const chevron = document.getElementById("cdSettingsChevron");
    body.classList.toggle("hidden");
    document.getElementById("cdSettingsToggle").classList.toggle("open", !body.classList.contains("hidden"));
    chevron.textContent = body.classList.contains("hidden") ? "▾" : "▴";
  });

  document.getElementById("courseRatingsForm").addEventListener("submit", async e => {
    e.preventDefault();
    const body = {};
    document.querySelectorAll("#courseRatingsForm input[data-col]").forEach(inp => {
      const v = inp.value.trim();
      body[inp.dataset.col] = v ? (inp.dataset.col.includes("slope") ? parseInt(v) : parseFloat(v)) : null;
    });
    await apiFetch(`/api/courses/${id}`, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    document.getElementById("ratingsSaved").classList.remove("hidden");
    setTimeout(() => document.getElementById("ratingsSaved").classList.add("hidden"), 2000);
  });

  el.querySelectorAll(".course-round-row").forEach(row => {
    row.addEventListener("click", () => showRoundDetail(+row.dataset.id));
  });

  el.querySelectorAll(".cd-child-link").forEach(btn => {
    btn.addEventListener("click", () => showCourseDetail(+btn.dataset.childId));
  });

  document.getElementById("btnUnlink")?.addEventListener("click", async () => {
    await apiFetch(`/api/courses/${id}/unlink`, { method: "POST" });
    showView("courses");
  });
}

document.getElementById("btnBackToCourses").addEventListener("click", () => {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-courses").classList.add("active");
});

// ── AI Analysis ───────────────────────────────────────────────────────────────
function fmtDateShort(d) {
  if (!d) return "?";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

async function loadAiAnalysis() {
  const gs     = await apiFetch("/api/ai/global-summary").then(r => r.json());
  const stored = currentAnalysis === "practice" ? gs.practice : gs.performance;
  const out    = document.getElementById("aiOutput");
  const btn    = document.getElementById("btnRunAi");
  const meta   = document.getElementById("aiAnalysisMeta");

  // Populate date pickers with stored window or server default
  const fromEl = document.getElementById("aiFromDate");
  const toEl   = document.getElementById("aiToDate");
  if (!fromEl.value) {
    fromEl.value = stored?.from_date || gs.default_from || "";
    toEl.value   = stored?.to_date   || gs.default_to   || "";
  }
  _updateWindowNote(gs.default_from, gs.default_to);

  if (stored?.full_report) {
    out.innerHTML = marked.parse(stored.full_report);
    btn.textContent = "↺ Regenerate";
    document.getElementById("btnExportAnalysis").classList.remove("hidden");

    const dateStr  = stored.generated_at ? stored.generated_at.substring(0, 10) : "unknown";
    const daysAgo  = stored.generated_at ? Math.floor((Date.now() - new Date(stored.generated_at)) / 86400000) : null;
    const ageLabel = daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`;
    const windowStr = stored.from_date && stored.to_date
      ? `${fmtDateShort(stored.from_date)} – ${fmtDateShort(stored.to_date)}`
      : "all rounds";
    const hasNewRound = gs.latest_round_date && stored.latest_round_date &&
                        gs.latest_round_date > stored.latest_round_date;

    meta.innerHTML = `
      <span class="ai-meta-item">Generated ${ageLabel} (${dateStr})</span>
      <span class="ai-meta-item">${stored.round_count || 0} rounds · ${windowStr}</span>
      ${hasNewRound
        ? `<span class="ai-meta-stale">⚠ New round added since last analysis — regenerate to include</span>`
        : `<span class="ai-meta-ok">✓ Up to date</span>`}
    `;
  } else {
    out.innerHTML = '<span class="ai-placeholder">No analysis yet — set the date window and click Generate.</span>';
    btn.textContent = "Generate Analysis";
    document.getElementById("btnExportAnalysis").classList.add("hidden");
    meta.innerHTML = gs.latest_round_date
      ? `<span class="ai-meta-stale">⚠ Rounds available — generate an analysis to see insights</span>`
      : "";
  }
}

function _updateWindowNote(defaultFrom, defaultTo) {
  const fromEl = document.getElementById("aiFromDate");
  const toEl   = document.getElementById("aiToDate");
  const note   = document.getElementById("aiWindowNote");
  if (!note) return;
  const isDefault = fromEl.value === defaultFrom && toEl.value === defaultTo;
  note.textContent = isDefault ? "Default: last 90 days" : "Custom window";
}

document.querySelectorAll(".ai-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".ai-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentAnalysis = tab.dataset.analysis;
    // Clear date pickers so they reload from stored summary for this tab
    document.getElementById("aiFromDate").value = "";
    document.getElementById("aiToDate").value   = "";
    loadAiAnalysis();
  });
});

document.getElementById("btnRunAi").addEventListener("click", async () => {
  const out      = document.getElementById("aiOutput");
  const fromDate = document.getElementById("aiFromDate").value;
  const toDate   = document.getElementById("aiToDate").value;
  const btn      = document.getElementById("btnRunAi");

  out.classList.add("streaming");
  out.innerHTML = '<span class="ai-placeholder">Generating…</span>';
  btn.disabled  = true;

  const body = {
    type:      currentAnalysis,
    from_date: fromDate || undefined,
    to_date:   toDate   || undefined,
  };

  const resp = await apiFetch("/api/ai/global-summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (resp.headers.get("content-type")?.includes("application/json")) {
    const data = await resp.json();
    if (data.skipped) {
      const reasons = {
        window_unchanged: "Window and data unchanged — nothing to regenerate.",
        no_rounds_in_window: `No rounds between ${fmtDateShort(fromDate)} and ${fmtDateShort(toDate)}. Try widening the date range.`,
        no_new_rounds: "No new rounds since last generation.",
      };
      out.classList.remove("streaming");
      out.innerHTML = `<span class="ai-placeholder">${reasons[data.reason] || "Skipped."}</span>`;
      btn.disabled = false;
      return;
    }
    out.innerHTML = `<span style="color:var(--red)">Error: ${data.error || "Unknown error"}</span>`;
    out.classList.remove("streaming");
    btn.disabled = false;
    return;
  }

  // Stream response
  const reader  = resp.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.includes("__AI_ERROR__:")) {
      out.innerHTML = `<span style="color:var(--red)">${text.split("__AI_ERROR__:")[1].trim()}</span>`;
      break;
    }
    out.innerHTML = marked.parse(text);
  }

  out.classList.remove("streaming");
  btn.disabled = false;
  btn.textContent = "↺ Regenerate";
  document.getElementById("btnExportAnalysis").classList.remove("hidden");
  loadAiAnalysis();
});

document.getElementById("btnExportAnalysis").addEventListener("click", () => {
  const content = document.getElementById("aiOutput")?.innerHTML;
  if (!content) return;
  const label = currentAnalysis === "performance" ? "Performance Summary" : "Practice Plan";
  exportToPDF(`StrokeIndexr ${label}`, content);
});

// ── PDF export ────────────────────────────────────────────────────────────────
function exportToPDF(title, htmlContent) {
  // Strip leading H1 from AI output — it duplicates our header
  const cleaned = htmlContent.replace(/^\s*<h1[^>]*>.*?<\/h1>\s*/i, "");
  htmlContent = cleaned;
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @page { margin: 18mm 20mm; size: A4; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 13.5px; line-height: 1.75;
      color: #1a1a2e; max-width: 680px; margin: 0 auto; padding: 0;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .pdf-header {
      border-bottom: 3px solid #1e4d35;
      padding-bottom: 14px; margin-bottom: 6px;
    }
    .pdf-title {
      font-size: 20px; font-weight: 700; color: #1e4d35;
      margin: 0 0 4px; line-height: 1.3;
    }
    .pdf-meta {
      font-size: 11.5px; color: #6b7280; margin: 0;
      display: flex; gap: 16px;
    }
    .pdf-meta span::before { content: "·"; margin-right: 6px; color: #d1d5db; }
    .pdf-meta span:first-child::before { content: ""; margin: 0; }
    h1 { font-size: 17px; font-weight: 700; color: #1e4d35;
         margin: 28px 0 8px; padding-bottom: 6px;
         border-bottom: 1px solid #e5e7eb; }
    h2 { font-size: 14px; font-weight: 600; color: #374151; margin: 20px 0 6px; }
    h3 { font-size: 13px; font-weight: 600; color: #374151; margin: 16px 0 4px; }
    p  { margin: 8px 0; }
    ul, ol { margin: 6px 0; padding-left: 20px; }
    li { margin: 5px 0; }
    strong { font-weight: 600; color: #111827; }
    em { color: #374151; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin: 12px 0; }
    th { background: #f3f4f6; font-weight: 600; text-align: left;
         padding: 7px 10px; border: 1px solid #e5e7eb; color: #374151; }
    td { padding: 6px 10px; border: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #fafafa; }
    code { font-family: ui-monospace, monospace; font-size: 12px;
           background: #f3f4f6; padding: 1px 5px; border-radius: 3px; }
    blockquote { border-left: 3px solid #1e4d35; margin: 12px 0;
                 padding: 4px 14px; color: #4b5563; background: #f9fafb; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
    @media print {
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="pdf-header">
    <p class="pdf-title">${title}</p>
    <p class="pdf-meta">
      <span>StrokeIndexr</span>
      <span>${date}</span>
    </p>
  </div>
  ${htmlContent}
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`);
  win.document.close();
}

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
  try {
    const cfg = await apiFetch("/api/config").then(r => r.json());
    document.getElementById("aiProvider").value = cfg.provider || "claude";
    document.getElementById("aiApiKey").value   = cfg.api_key  || "";
    document.getElementById("aiModel").value    = cfg.model    || "";
    document.getElementById("aiBaseUrl").value  = cfg.base_url || "";
    // notes_ai_default: true = include (default), false = exclude
    document.getElementById("notesAiDefault").checked = cfg.notes_ai_default !== false;
  } catch (_) {}
  updateSettingsFields();

  // Load handicap mode from localStorage
  document.getElementById("hcpMode").value = localStorage.getItem("hcpMode") || "whs";

  // Show current WHS index
  try {
    const whs = await apiFetch("/api/whs").then(r => r.json());
    const cur = whs?.current;
    document.getElementById("whsCurrentDisplay").textContent = cur?.sufficient_data
      ? cur.index + (cur.estimated ? "*" : "") + (cur.estimated ? "  (estimated — add course ratings for accuracy)" : "")
      : "Insufficient data (need 3+ eligible rounds)";
    document.getElementById("whsRecalcDetail").classList.add("hidden");
  } catch (_) {}

  modal.classList.remove("hidden");
});

document.getElementById("btnRecalcWhs").addEventListener("click", async () => {
  const btn    = document.getElementById("btnRecalcWhs");
  const detail = document.getElementById("whsRecalcDetail");
  btn.disabled = true;
  btn.textContent = "Calculating…";
  try {
    const whs = await apiFetch("/api/whs").then(r => r.json());
    const cur  = whs?.current;
    const excl = cur?.excluded_rounds ?? [];
    document.getElementById("whsCurrentDisplay").textContent = cur?.sufficient_data
      ? cur.index + (cur.estimated ? "*" : "")
      : "Insufficient data (need 3+ eligible rounds)";
    detail.classList.remove("hidden");
    detail.innerHTML = cur?.sufficient_data
      ? `<span class="whs-recalc-ok">✓ Index recalculated from ${cur.differential_count} differential${cur.differential_count !== 1 ? "s" : ""}</span>`
        + (excl.length ? `<br><span class="whs-recalc-excl">${excl.length} round${excl.length > 1 ? "s" : ""} excluded — manage in round detail</span>` : "")
        + (cur.pending_nine ? `<br><span class="whs-recalc-excl">1 unpaired 9-hole round pending a second 9-hole score</span>` : "")
      : `<span class="whs-recalc-excl">Not enough eligible rounds yet</span>`;
  } catch (e) {
    detail.classList.remove("hidden");
    detail.innerHTML = `<span style="color:var(--red)">Error: ${e.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "↺ Recalculate";
  }
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
        provider:         document.getElementById("aiProvider").value,
        api_key:          document.getElementById("aiApiKey").value,
        model:            document.getElementById("aiModel").value,
        base_url:         document.getElementById("aiBaseUrl").value,
        notes_ai_default: document.getElementById("notesAiDefault").checked,
      }),
    });
    localStorage.setItem("hcpMode", document.getElementById("hcpMode").value);
    modal.classList.add("hidden");
    loadDashboard();
  } catch (e) {
    alert("Failed to save settings: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save";
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadDashboard();

// ── Version / update check ────────────────────────────────────────────────────
(async () => {
  try {
    const v = await apiFetch("/api/version").then(r => r.json());
    const label = document.getElementById("versionLabel");
    if (label) label.textContent = v.local;
    if (v.update_available) {
      const banner = document.getElementById("updateBanner");
      const link   = document.getElementById("updateBannerLink");
      if (banner && link) {
        link.href = v.release_url;
        banner.style.display = "flex";
      }
    }
  } catch { /* no network, silently skip */ }
})();
