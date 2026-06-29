const CHART_DEFAULTS = {
  color: "#8b9cb3",
  borderColor: "#243044",
  font: { family: "'JetBrains Mono', monospace", size: 11 },
};

Chart.defaults.color = CHART_DEFAULTS.color;
Chart.defaults.borderColor = CHART_DEFAULTS.borderColor;
Chart.defaults.font = CHART_DEFAULTS.font;

const TAG_LABELS = {
  budget: { text: "예산", class: "tag--budget" },
  export: { text: "수출", class: "tag--export" },
  tech: { text: "기술", class: "tag--tech" },
  conflict: { text: "분쟁", class: "tag--conflict" },
  alliance: { text: "동맹", class: "tag--alliance" },
};

const SEVERITY_LABELS = {
  high: "HIGH",
  medium: "MED",
  low: "LOW",
};

function initClock() {
  const el = document.getElementById("current-time");
  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
  tick();
  setInterval(tick, 1000);
}

function initRegionalChart() {
  new Chart(document.getElementById("chart-regional"), {
    type: "line",
    data: DEFENSE_DATA.regional,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { boxWidth: 12, padding: 16 } },
      },
      scales: {
        y: {
          grid: { color: "rgba(36, 48, 68, 0.5)" },
          ticks: { callback: (v) => v + "B" },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

function initWeaponsChart() {
  new Chart(document.getElementById("chart-weapons"), {
    type: "doughnut",
    data: {
      labels: DEFENSE_DATA.weapons.labels,
      datasets: [{
        data: DEFENSE_DATA.weapons.data,
        backgroundColor: DEFENSE_DATA.weapons.colors,
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "right", labels: { boxWidth: 10, padding: 10 } },
      },
    },
  });
}

function initGdpChart() {
  new Chart(document.getElementById("chart-gdp"), {
    type: "bar",
    data: {
      labels: DEFENSE_DATA.gdpRatio.labels,
      datasets: [{
        data: DEFENSE_DATA.gdpRatio.data,
        backgroundColor: DEFENSE_DATA.gdpRatio.data.map((v) =>
          v >= 5 ? "#e85555" : v >= 3 ? "#f0a030" : "#3dd68c"
        ),
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: "rgba(36, 48, 68, 0.5)" },
          ticks: { callback: (v) => v + "%" },
          max: 8,
        },
        y: { grid: { display: false } },
      },
    },
  });
}

function initCompaniesChart() {
  new Chart(document.getElementById("chart-companies"), {
    type: "bar",
    data: {
      labels: DEFENSE_DATA.companies.labels,
      datasets: [{
        data: DEFENSE_DATA.companies.data,
        backgroundColor: "rgba(77, 166, 255, 0.7)",
        hoverBackgroundColor: "#4da6ff",
        borderRadius: 3,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: "rgba(36, 48, 68, 0.5)" },
          ticks: { callback: (v) => "$" + v + "B" },
        },
        y: { grid: { display: false }, ticks: { font: { size: 10 } } },
      },
    },
  });
}

function initTechChart() {
  new Chart(document.getElementById("chart-tech"), {
    type: "radar",
    data: {
      labels: DEFENSE_DATA.techGrowth.labels,
      datasets: [{
        data: DEFENSE_DATA.techGrowth.data,
        backgroundColor: "rgba(61, 214, 140, 0.15)",
        borderColor: "#3dd68c",
        pointBackgroundColor: "#3dd68c",
        pointRadius: 4,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          angleLines: { color: "rgba(36, 48, 68, 0.6)" },
          grid: { color: "rgba(36, 48, 68, 0.4)" },
          pointLabels: { font: { size: 10 } },
          ticks: { display: false, stepSize: 30 },
          suggestedMin: 0,
          suggestedMax: 150,
        },
      },
    },
  });
}

function initKoreaChart() {
  new Chart(document.getElementById("chart-korea"), {
    type: "bar",
    data: {
      labels: DEFENSE_DATA.koreaExport.labels,
      datasets: [{
        label: "수출액 (조원)",
        data: DEFENSE_DATA.koreaExport.data,
        backgroundColor: [
          "rgba(61, 214, 140, 0.4)",
          "rgba(61, 214, 140, 0.55)",
          "rgba(61, 214, 140, 0.7)",
          "rgba(61, 214, 140, 0.55)",
          "rgba(61, 214, 140, 0.85)",
        ],
        borderColor: "#3dd68c",
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.parsed.y + " 조원",
          },
        },
      },
      scales: {
        y: {
          grid: { color: "rgba(36, 48, 68, 0.5)" },
          ticks: { callback: (v) => v + "조" },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

function initConflictIndex() {
  const container = document.getElementById("conflict-index");
  container.innerHTML = DEFENSE_DATA.conflicts
    .map((c) => `
      <div class="conflict-item">
        <div class="conflict-item__header">
          <span class="conflict-item__name">${c.name}</span>
          <span class="conflict-item__level level--${c.severity}">${SEVERITY_LABELS[c.severity]} ${c.level}</span>
        </div>
        <div class="conflict-item__bar">
          <div class="conflict-item__fill fill--${c.severity}" style="width: ${c.level}%"></div>
        </div>
      </div>`)
    .join("");
}

const BID_STATUS_CLASS = {
  urgent: "urgent",
  open: "open",
  closed: "closed",
};

function initIntelBids() {
  const container = document.getElementById("intel-bids");
  container.innerHTML = DEFENSE_DATA.bids
    .map((bid) => `
      <div class="bid-item">
        <div class="bid-item__top">
          <span class="bid-item__id">${bid.id}</span>
          <span class="bid-item__deadline bid-item__deadline--${BID_STATUS_CLASS[bid.status]}">${bid.deadline}</span>
        </div>
        <div class="bid-item__title">${bid.title}</div>
        <div class="bid-item__meta">
          <span>${bid.agency}</span>
          <span class="bid-item__budget">${bid.budget}</span>
        </div>
      </div>`)
    .join("");
}

function initIntelFx() {
  /* fx-service.js → loadFxRates() */
}

const INSIGHT_PREFIX = {
  opportunity: "▲",
  risk: "⚠",
  watch: "◉",
};

function initIntelAi() {
  const ai = DEFENSE_DATA.aiAnalysis;
  const container = document.getElementById("intel-ai");

  container.innerHTML = `
    <div class="ai-brief">
      <div class="ai-brief__top">
        <span class="ai-brief__sentiment ai-brief__sentiment--${ai.sentiment}">${ai.sentimentLabel}</span>
        <div class="ai-brief__confidence">
          <span class="ai-brief__confidence-label">신뢰도</span>
          <span class="ai-brief__confidence-value">${ai.confidence}%</span>
        </div>
      </div>
      <p class="ai-brief__summary">${ai.summary}</p>
      <ul class="ai-brief__insights">
        ${ai.insights
          .map(
            (ins) =>
              `<li class="ai-brief__insight ai-brief__insight--${ins.type}">${INSIGHT_PREFIX[ins.type]} ${ins.text}</li>`
          )
          .join("")}
      </ul>
      <div class="ai-brief__scores">
        ${ai.sectorScores
          .map(
            (s) =>
              `<div class="ai-score"><span class="ai-score__name">${s.name}</span><span class="ai-score__value">${s.score}</span></div>`
          )
          .join("")}
      </div>
      <div class="ai-brief__footer">${ai.generatedAt}</div>
    </div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  initNewsSearch();
  loadTavilyNews(document.getElementById("news-search-input")?.value);
  initIntelBids();
  loadFxRates();
  initIntelAi();
  initRegionalChart();
  initWeaponsChart();
  initGdpChart();
  initCompaniesChart();
  initTechChart();
  initKoreaChart();
  initConflictIndex();
});
