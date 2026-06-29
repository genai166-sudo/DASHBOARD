let map = null;
let markers = [];
let weatherData = {};
let selectedCityId = "seoul";

async function fetchWeather() {
  const lats = KOREAN_CITIES.map((c) => c.lat).join(",");
  const lons = KOREAN_CITIES.map((c) => c.lon).join(",");
  const params = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "weather_code",
      "wind_speed_10m",
      "wind_direction_10m",
      "precipitation",
    ].join(","),
    timezone: "Asia/Seoul",
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error("Open-Meteo API 요청 실패");
  return res.json();
}

function windDirection(deg) {
  const dirs = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  return dirs[Math.round(deg / 45) % 8];
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function renderCityList() {
  const list = document.getElementById("city-list");
  list.innerHTML = KOREAN_CITIES.map((city) => {
    const w = weatherData[city.id];
    if (!w) return "";
    const info = getWeatherInfo(w.weather_code);
    const active = city.id === selectedCityId ? " active" : "";
    return `
      <li class="city-item${active}" data-id="${city.id}">
        <span class="city-item__icon">${info.icon}</span>
        <div class="city-item__info">
          <div class="city-item__name">${city.name}</div>
          <div class="city-item__desc">${info.label}</div>
        </div>
        <span class="city-item__temp">${Math.round(w.temperature_2m)}°</span>
      </li>`;
  }).join("");

  list.querySelectorAll(".city-item").forEach((el) => {
    el.addEventListener("click", () => selectCity(el.dataset.id));
  });
}

function renderDetail(cityId) {
  const city = KOREAN_CITIES.find((c) => c.id === cityId);
  const w = weatherData[cityId];
  const container = document.getElementById("detail-panel");

  if (!city || !w) {
    container.innerHTML = `<div class="detail-placeholder">도시를 선택하세요</div>`;
    return;
  }

  const info = getWeatherInfo(w.weather_code);
  container.innerHTML = `
    <div class="detail-hero">
      <div class="detail-hero__icon">${info.icon}</div>
      <div class="detail-hero__city">${city.name}</div>
      <div class="detail-hero__temp">${Math.round(w.temperature_2m)}°C</div>
      <div class="detail-hero__desc">${info.label}</div>
    </div>
    <div class="detail-grid">
      <div class="detail-stat">
        <div class="detail-stat__label">체감온도</div>
        <div class="detail-stat__value">${Math.round(w.apparent_temperature)}°C</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat__label">습도</div>
        <div class="detail-stat__value">${w.relative_humidity_2m}%</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat__label">풍속</div>
        <div class="detail-stat__value">${w.wind_speed_10m} km/h</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat__label">풍향</div>
        <div class="detail-stat__value">${windDirection(w.wind_direction_10m)}</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat__label">강수량</div>
        <div class="detail-stat__value">${w.precipitation} mm</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat__label">좌표</div>
        <div class="detail-stat__value">${city.lat.toFixed(2)}, ${city.lon.toFixed(2)}</div>
      </div>
    </div>
    <div class="detail-updated">갱신: ${formatTime(w.time)} · Open-Meteo</div>`;
}

function selectCity(cityId) {
  selectedCityId = cityId;
  renderCityList();
  renderDetail(cityId);

  const city = KOREAN_CITIES.find((c) => c.id === cityId);
  if (map && city) {
    map.flyTo([city.lat, city.lon], 9, { duration: 1.2 });
  }
}

function buildPopupHtml(city, w) {
  const info = getWeatherInfo(w.weather_code);
  return `
    <strong>${city.name}</strong>
    <div class="popup-temp">${Math.round(w.temperature_2m)}°C</div>
    <div class="popup-desc">${info.icon} ${info.label}</div>`;
}

function createMarkerIcon(temp) {
  return L.divIcon({
    className: "weather-marker",
    html: `<span class="weather-marker__inner">${Math.round(temp)}°</span>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function initMap() {
  map = L.map("map", {
    center: [36.3, 127.5],
    zoom: 7,
    zoomControl: false,
  });

  L.control.zoom({ position: "topright" }).addTo(map);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map);

  KOREAN_CITIES.forEach((city) => {
    const w = weatherData[city.id];
    if (!w) return;

    const marker = L.marker([city.lat, city.lon], {
      icon: createMarkerIcon(w.temperature_2m),
    })
      .addTo(map)
      .bindPopup(buildPopupHtml(city, w));

    marker.on("click", () => selectCity(city.id));
    markers.push(marker);
  });
}

function parseWeatherResponse(data) {
  if (Array.isArray(data)) {
    data.forEach((item, i) => {
      weatherData[KOREAN_CITIES[i].id] = item.current;
    });
  } else {
    weatherData[KOREAN_CITIES[0].id] = data.current;
  }
}

async function init() {
  const loadingEl = document.getElementById("loading");
  const errorEl = document.getElementById("error");

  try {
    loadingEl.hidden = false;
    const data = await fetchWeather();
    parseWeatherResponse(data);
    loadingEl.hidden = true;

    renderCityList();
    renderDetail(selectedCityId);
    initMap();
  } catch (err) {
    loadingEl.hidden = true;
    errorEl.hidden = false;
    errorEl.textContent = `날씨 데이터를 불러오지 못했습니다: ${err.message}`;
  }
}

document.addEventListener("DOMContentLoaded", init);
