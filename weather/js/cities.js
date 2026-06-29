const KOREAN_CITIES = [
  { id: "seoul", name: "서울", lat: 37.5665, lon: 126.9780 },
  { id: "busan", name: "부산", lat: 35.1796, lon: 129.0756 },
  { id: "incheon", name: "인천", lat: 37.4563, lon: 126.7052 },
  { id: "daegu", name: "대구", lat: 35.8714, lon: 128.6014 },
  { id: "daejeon", name: "대전", lat: 36.3504, lon: 127.3845 },
  { id: "gwangju", name: "광주", lat: 35.1595, lon: 126.8526 },
  { id: "ulsan", name: "울산", lat: 35.5384, lon: 129.3114 },
  { id: "jeju", name: "제주", lat: 33.4996, lon: 126.5312 },
];

const WMO_WEATHER = {
  0: { label: "맑음", icon: "☀️" },
  1: { label: "대체로 맑음", icon: "🌤️" },
  2: { label: "부분적으로 흐림", icon: "⛅" },
  3: { label: "흐림", icon: "☁️" },
  45: { label: "안개", icon: "🌫️" },
  48: { label: "서리 안개", icon: "🌫️" },
  51: { label: "이슬비", icon: "🌦️" },
  53: { label: "이슬비", icon: "🌦️" },
  55: { label: "강한 이슬비", icon: "🌧️" },
  61: { label: "약한 비", icon: "🌧️" },
  63: { label: "비", icon: "🌧️" },
  65: { label: "강한 비", icon: "🌧️" },
  71: { label: "약한 눈", icon: "🌨️" },
  73: { label: "눈", icon: "🌨️" },
  75: { label: "강한 눈", icon: "❄️" },
  77: { label: "진눈깨비", icon: "🌨️" },
  80: { label: "소나기", icon: "🌦️" },
  81: { label: "소나기", icon: "🌦️" },
  82: { label: "강한 소나기", icon: "⛈️" },
  85: { label: "눈 소나기", icon: "🌨️" },
  86: { label: "강한 눈 소나기", icon: "❄️" },
  95: { label: "뇌우", icon: "⛈️" },
  96: { label: "우박 동반 뇌우", icon: "⛈️" },
  99: { label: "강한 우박 뇌우", icon: "⛈️" },
};

function getWeatherInfo(code) {
  return WMO_WEATHER[code] || { label: "알 수 없음", icon: "🌡️" };
}
