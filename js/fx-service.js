/**
 * 환율 — GET /api/fx/rates (서버 프록시)
 */

let fxChartInstance = null;

const FX_SOURCE_LABELS = {
  "exchangerate-api": "실시간",
  "open.er-api": "실시간",
  frankfurter: "ECB",
};

async function fetchFxData() {
  let res;
  try {
    res = await fetch("/api/fx/rates", { cache: "no-store" });
  } catch {
    throw new Error("환율 서버에 연결할 수 없습니다. python server.py 실행 여부를 확인하세요.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "환율 조회 실패");
  }
  return data;
}

function formatFxBadge(exchangeRates) {
  const source = exchangeRates.source || "";
  const label = FX_SOURCE_LABELS[source] || (exchangeRates.live ? "실시간" : source);
  const timePart = exchangeRates.updated?.split(" ").slice(1, 3).join(" ") || "";
  return timePart ? `${label} · ${timePart}` : label || "—";
}

function renderFxRates(exchangeRates) {
  const updatedEl = document.getElementById("fx-updated");
  if (updatedEl) {
    updatedEl.textContent = formatFxBadge(exchangeRates);
    updatedEl.title = `${exchangeRates.source || ""} · ${exchangeRates.updated || ""}`;
    updatedEl.classList.toggle("fx-updated--live", Boolean(exchangeRates.live));
    updatedEl.classList.toggle("fx-updated--mock", !exchangeRates.live);
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

function renderFxChart(exchangeRates) {
  const canvas = document.getElementById("chart-fx");
  if (!canvas || !exchangeRates.usdTrend) return;

  const trend = exchangeRates.usdTrend;
  if (!trend.data?.length) return;

  if (fxChartInstance) {
    fxChartInstance.destroy();
  }

  fxChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: trend.labels,
      datasets: [{
        label: "USD/KRW",
        data: trend.data,
        borderColor: "#f0a030",
        backgroundColor: "rgba(240, 160, 48, 0.08)",
        borderWidth: 1.5,
        pointRadius: 0,
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
          ticks: { font: { size: 9 }, maxTicksLimit: 5 },
        },
        y: {
          display: false,
          min: Math.min(...trend.data) - 5,
          max: Math.max(...trend.data) + 5,
        },
      },
    },
  });
}

function renderFxFallback(errMessage) {
  const mock = DEFENSE_DATA?.exchangeRates;
  if (!mock) return;
  renderFxRates({ ...mock, live: false });
  renderFxChart(mock);
  const updatedEl = document.getElementById("fx-updated");
  if (updatedEl) {
    updatedEl.textContent = "목업";
    updatedEl.title = errMessage || "API 실패 — 목업 데이터";
    updatedEl.classList.add("fx-updated--mock");
    updatedEl.classList.remove("fx-updated--live");
  }
}

async function loadFxRates() {
  try {
    const data = await fetchFxData();
    renderFxRates(data);
    renderFxChart(data);
  } catch (err) {
    console.warn("FX API error:", err.message);
    renderFxFallback(err.message);
  }
}
