const DEFENSE_DATA = {
  regional: {
    labels: ["2019", "2020", "2021", "2022", "2023", "2024", "2025E"],
    datasets: [
      {
        label: "북미",
        data: [732, 758, 778, 865, 915, 948, 982],
        borderColor: "#4da6ff",
        backgroundColor: "rgba(77, 166, 255, 0.1)",
        tension: 0.3,
        fill: true,
      },
      {
        label: "유럽",
        data: [356, 362, 380, 418, 465, 512, 548],
        borderColor: "#b48cff",
        backgroundColor: "rgba(180, 140, 255, 0.08)",
        tension: 0.3,
        fill: true,
      },
      {
        label: "아시아·태평양",
        data: [478, 492, 510, 545, 578, 612, 648],
        borderColor: "#3dd68c",
        backgroundColor: "rgba(61, 214, 140, 0.08)",
        tension: 0.3,
        fill: true,
      },
      {
        label: "중동",
        data: [168, 172, 178, 192, 205, 218, 228],
        borderColor: "#f0a030",
        backgroundColor: "rgba(240, 160, 48, 0.08)",
        tension: 0.3,
        fill: true,
      },
    ],
  },

  weapons: {
    labels: ["항공", "미사일·방어", "함정", "지상장비", "전자·C4ISR", "기타"],
    data: [28, 22, 14, 18, 12, 6],
    colors: ["#4da6ff", "#e85555", "#3dd68c", "#f0a030", "#b48cff", "#5a6d85"],
  },

  gdpRatio: {
    labels: ["미국", "사우디", "이스라엘", "러시아", "한국", "프랑스", "영국", "중국", "일본", "독일"],
    data: [3.4, 7.4, 5.3, 4.1, 2.8, 2.1, 2.3, 1.7, 1.1, 1.5],
  },

  companies: {
    labels: [
      "Lockheed Martin",
      "RTX (Raytheon)",
      "Northrop Grumman",
      "Boeing Defense",
      "General Dynamics",
      "BAE Systems",
      "L3Harris",
      "Airbus Defence",
      "Leonardo",
      "Hanwha Aerospace",
    ],
    data: [71.0, 43.1, 39.3, 27.4, 42.8, 28.5, 21.9, 12.8, 15.2, 8.6],
  },

  techGrowth: {
    labels: ["AI·자율무기", "드론/UAS", "사이버방어", "우주·위성", "전자전", "양자·센서"],
    data: [142, 118, 95, 87, 76, 64],
  },

  koreaExport: {
    labels: ["2020", "2021", "2022", "2023", "2024"],
    data: [2.8, 7.0, 17.3, 14.0, 19.5],
  },

  news: [
    {
      date: "2025-06-28",
      title: "NATO, 2035년까지 방위비 GDP 5% 목표 합의 추진",
      summary: "32개 회원국 중 23개국이 증액 계획 발표. 동유럽 전선 강화 예산 집중.",
      tag: "budget",
    },
    {
      date: "2025-06-25",
      title: "한국, 폴란드 K2 전차 2차 추가 수출 계약 체결",
      summary: "180대 규모, 총 6조원 규모. 유럽 방산 시장 진출 가속.",
      tag: "export",
    },
    {
      date: "2025-06-22",
      title: "미 국방부, Replicator 2.0 — 대규모 자율 드론 fleet 투자",
      summary: "2026 회계연도 AI·자율무기 예산 120억 달러 편성.",
      tag: "tech",
    },
    {
      date: "2025-06-18",
      title: "우크라이나-러시아 분쟁 4년차, 장기화에 따른 탄약 소모 우려",
      summary: "NATO 탄약 비축량 30% 이하. 생산능력 확대 긴급 과제.",
      tag: "conflict",
    },
    {
      date: "2025-06-15",
      title: "AUKUS 2단계 — 핵잠수함·하이퍼소닉 공동개발 본격화",
      summary: "호주·영국·미국 3국, 2030년대 초 핵잠수함 건조 착수.",
      tag: "alliance",
    },
    {
      date: "2025-06-10",
      title: "중동 분쟁 확대 — 방공·미사ile 방어 수요 급증",
      summary: "Patriot, THAAD, Iron Dome 등 방공체계 수출 문의 3배 증가.",
      tag: "conflict",
    },
    {
      date: "2025-06-05",
      title: "유럽 방산기업 M&A 활발 — Rheinmetall·KNDS 통합 논의",
      summary: "유럽 자체 방위산업 역량 강화 움직임. 미국 의존도 축소 목표.",
      tag: "export",
    },
  ],

  conflicts: [
    { name: "우크라이나-러시아", level: 92, severity: "high" },
    { name: "중동 (이스라엘·이란)", level: 78, severity: "high" },
    { name: "대만 해협", level: 65, severity: "medium" },
    { name: "북한 핵·미사일", level: 58, severity: "medium" },
    { name: "적도 기니", level: 42, severity: "medium" },
    { name: "남중국해", level: 35, severity: "low" },
  ],

  intelNews: [
    {
      time: "09:42",
      title: "NATO 동유럽 전선 탄약 비축 30% 미만 — 긴급 조달 논의",
      hot: true,
    },
    {
      time: "09:18",
      title: "폴란드 K2 전차 2차 물량 협상 — 국내 방산주 수혜 기대",
      hot: false,
    },
    {
      time: "08:55",
      title: "미 국방부 Replicator 2.0 예산안 의회 통과 임박",
      hot: true,
    },
    {
      time: "08:30",
      title: "사우디, Patriot·THAAD 추가 도입 검토 — 중동 방공 수요↑",
      hot: false,
    },
    {
      time: "07:50",
      title: "Rheinmetall·KNDS 통합 MOU 서명 — 유럽 방산 재편 가속",
      hot: false,
    },
  ],

  bids: [
    {
      id: "DAPA-2025-0847",
      title: "K21 장갑차 후속 양산 2차",
      agency: "방위사업청",
      budget: "1.2조원",
      deadline: "D-12",
      status: "open",
    },
    {
      id: "NATO-JSS-26",
      title: "Joint Strike Support Drone Fleet",
      agency: "NATO Support Agency",
      budget: "$2.4B",
      deadline: "D-28",
      status: "open",
    },
    {
      id: "US-Army-AMMO",
      title: "155mm 탄약 3년 공급 IDIQ",
      agency: "U.S. Army",
      budget: "$7.8B",
      deadline: "D-5",
      status: "urgent",
    },
    {
      id: "DAPA-2025-0831",
      title: "함대 MRO 통합 유지보수",
      agency: "방위사업청",
      budget: "8,400억원",
      deadline: "D-19",
      status: "open",
    },
    {
      id: "AUS-LAND-400",
      title: "Land 400 Phase 3 IFV",
      agency: "Australian DoD",
      budget: "A$5.2B",
      deadline: "마감",
      status: "closed",
    },
  ],

  exchangeRates: {
    updated: "2025-06-29 09:00 KST",
    rates: [
      { pair: "USD/KRW", value: 1386.50, change: 4.20, changePct: 0.30 },
      { pair: "EUR/KRW", value: 1498.20, change: -2.80, changePct: -0.19 },
      { pair: "JPY/KRW", value: 9.42, change: 0.05, changePct: 0.53 },
      { pair: "CNY/KRW", value: 191.30, change: 0.80, changePct: 0.42 },
    ],
    usdTrend: {
      labels: ["6/23", "6/24", "6/25", "6/26", "6/27", "6/28", "6/29"],
      data: [1372.0, 1378.5, 1381.2, 1384.8, 1382.3, 1382.30, 1386.50],
    },
  },

  aiAnalysis: {
    generatedAt: "2025-06-29 09:45 KST",
    sentiment: "positive",
    sentimentLabel: "방산 섹터 긍정",
    confidence: 78,
    summary:
      "지정학 리스크 확대와 NATO·중동 방위비 증액이 방산 수요를 견인 중. 한국 K2·K9 수출 모멘텀과 AI·드론 조달 확대가 핵심 테마.",
    insights: [
      { type: "opportunity", text: "유럽·중동 방공·지상장비 수출 수요 지속 — K2·천무·K9 체계 우위" },
      { type: "risk", text: "원·달러 1,380원대 상회 — 해외 계약 원화환산 수익성 모니터링 필요" },
      { type: "watch", text: "미 Replicator·NATO 드론 fleet 조달 — UAS·AI 융합 기업 수혜 가능" },
    ],
    sectorScores: [
      { name: "지상장비", score: 85 },
      { name: "방공·미사일", score: 82 },
      { name: "UAS·드론", score: 79 },
      { name: "함정·해양", score: 61 },
    ],
  },
};
