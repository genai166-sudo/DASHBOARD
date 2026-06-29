/**
 * 환율 — GET /api/fx/rates · 차트 /api/fx/chart (실시간 API만, 목업 없음)
 */

const FX_INTRADAY_INTERVALS = new Set(["1m", "10m", "30m"]);

let fxChartInstance = null;
let fxInterval = "7d";
let fxChartTimer = null;

async function fetchFxData() {
  let res;
  try {
    res = await fetch("/api/fx/rates");
  } catch {
    throw new Error("환율 서버에 연결할 수 없습니다. python server.py 실행 여부를 확인하세요.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "환율 조회 실패");
  }
  return data;
}

async function fetchFxChartData(interval) {
  let res;
  try {
    res = await fetch(`/api/fx/chart?interval=${encodeURIComponent(interval)}`);
  } catch {
    throw new Error("환율 차트 서버에 연결할 수 없습니다.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "환율 차트 조회 실패");
  }
  return data;
}

function renderFxRates(exchangeRates) {
  const updatedEl = document.getElementById("fx-updated");
  if (updatedEl) {
    const timePart = exchangeRates.updated?.split(" ").slice(1, 3).join(" ") || exchangeRates.updated;
    updatedEl.textContent = timePart || "—";
    updatedEl.title = `${exchangeRates.source || ""} · ${exchangeRates.updated || ""}`;
    updatedEl.classList.toggle("fx-updated--live", Boolean(exchangeRates.live));
    updatedEl.classList.remove("fx-updated--mock");
  }

  const list = document.getElementById("fx-rates");
  if (!list) return;

  list.innerHTML = exchangeRates.rates
    .map((r) => {
      const dir = r.change >= 0 ? "up" : "down";
      const sign = r.change >= 0 ? "+" : "";
      return `
        <div class="fx-row">
          <span class="fx-row__pair">${r.pair}</span>
          <span class="fx-row__value">${r.value.toLocaleString("ko-KR", { minimumFractionDigits: 2 })}</span>
          <span class="fx-row__change ${dir}">${sign}${r.change.toFixed(2)} (${sign}${r.changePct.toFixed(2)}%)</span>
        </div>`;
    })
    .join("");
}

function setFxIntervalActive(interval) {
  document.querySelectorAll(".fx-interval").forEach((btn) => {
    btn.classList.toggle("fx-interval--active", btn.dataset.interval === interval);
  });
}

function setFxChartHint(message, visible = false) {
  const el = document.getElementById("fx-chart-hint");
  if (!el) return;
  el.hidden = !visible;
  el.textContent = message || "";
}

function clearFxChart() {
  if (fxChartInstance) {
    fxChartInstance.destroy();
    fxChartInstance = null;
  }
}

function isIntradayInterval(interval) {
  return FX_INTRADAY_INTERVALS.has(interval);
}

function renderFxChart(trend) {
  const canvas = document.getElementById("chart-fx");
  const interval = trend?.interval || fxInterval;
  const hasData = Array.isArray(trend?.data) && trend.data.length > 0;

  if (!canvas || !hasData) {
    clearFxChart();
    setFxChartHint(
      isIntradayInterval(interval)
        ? "분봉 데이터 없음 — 서버 실행 후 1분마다 수집됩니다"
        : "실시간 차트 데이터 없음",
      true
    );
    return;
  }

  if (isIntradayInterval(interval) && !trend.live) {
    clearFxChart();
    setFxChartHint("분봉 데이터 없음 — 서버 실행 후 1분마다 수집됩니다", true);
    return;
  }

  setFxChartHint(`${trend.intervalLabel || interval} · USD/KRW · 실시간`, false);

  if (fxChartInstance) {
    fxChartInstance.destroy();
  }

  const values = trend.data;
  const padding = Math.max(1, (Math.max(...values) - Math.min(...values)) * 0.08);

  fxChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: trend.labels,
      datasets: [{
        label: "USD/KRW",
        data: values,
        borderColor: "#f0a030",
        backgroundColor: "rgba(240, 160, 48, 0.08)",
        borderWidth: 1.5,
        pointRadius: values.length <= 12 ? 2 : 0,
        tension: 0.35,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.parsed.y.toFixed(2) + "원",
          },
        },
      },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          ticks: { font: { size: 9 }, maxTicksLimit: 6 },
        },
        y: {
          display: false,
          min: Math.min(...values) - padding,
          max: Math.max(...values) + padding,
        },
      },
    },
  });
}

function renderFxEmpty() {
  const updatedEl = document.getElementById("fx-updated");
  if (updatedEl) {
    updatedEl.textContent = "오류";
    updatedEl.classList.remove("fx-updated--live", "fx-updated--mock");
  }

  const list = document.getElementById("fx-rates");
  if (list) {
    list.innerHTML = `<div class="news-empty">환율 API 연결 실패 — python server.py 확인</div>`;
  }

  clearFxChart();
  setFxChartHint("실시간 환율을 불러올 수 없습니다", true);
}

async function loadFxChart() {
  try {
    const trend = await fetchFxChartData(fxInterval);
    renderFxChart(trend);
  } catch (err) {
    console.warn("FX chart error:", err.message);
    clearFxChart();
    setFxChartHint(
      isIntradayInterval(fxInterval)
        ? "분봉 데이터 없음 — 서버 실행 후 1분마다 수집됩니다"
        : "차트 데이터를 불러올 수 없습니다",
      true
    );
  }
}

function scheduleFxChartRefresh() {
  clearInterval(fxChartTimer);
  const ms = isIntradayInterval(fxInterval) ? 60_000 : 5 * 60_000;
  fxChartTimer = setInterval(() => loadFxChart(), ms);
}

function initFxIntervals() {
  const container = document.getElementById("fx-intervals");
  if (!container) return;

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".fx-interval");
    if (!btn?.dataset.interval) return;

    fxInterval = btn.dataset.interval;
    setFxIntervalActive(fxInterval);
    loadFxChart();
    scheduleFxChartRefresh();
  });

  setFxIntervalActive(fxInterval);
}

async function loadFxRates() {
  try {
    const data = await fetchFxData();
    renderFxRates(data);
    await loadFxChart();
    scheduleFxChartRefresh();
  } catch (err) {
    console.warn("FX API error:", err.message);
    renderFxEmpty();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initFxIntervals();
});
