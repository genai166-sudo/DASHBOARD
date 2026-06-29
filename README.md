# 방산 동향 대시보드

글로벌 방위산업 동향을 한눈에 볼 수 있는 웹 대시보드입니다.

## 프로젝트 구조

```
DASHBOARD/
├── .env.example          # 키 템플릿 (커밋 OK)
├── .env                  # 실제 Tavily 키 — Git·AI 차단 (직접 생성)
├── .gitignore
├── .cursorignore         # Cursor AI가 .env 읽지 못하게 차단
├── SECRETS.md            # API 키 설정 가이드
├── index.html            # 방산 대시보드
├── server.py             # Python 로컬 서버 (권장)
├── js/                   # 차트·데이터·tavily-client.js
├── css/
├── weather/              # 날씨 페이지
├── server/               # Node 로컬 서버 (선택)
│   ├── dev-server.js
│   └── lib/tavily-proxy.js
└── api/tavily/search.js  # Vercel 배포용 서버리스 프록시
```

## 포함 내용

- **KPI 카드** — 글로벌 방위비, M&A, 수출 집중도, AI·드론 예산
- **지역별 방위비 추이** — 북미·유럽·아시아·중동 (2019–2025E)
- **무기체계별 수출 비중** — 항공, 미사일, 함정 등
- **주요국 GDP 대비 방위비**
- **방산기업 매출 Top 10**
- **핵심 기술 투자 성장률** — AI, 드론, 사이버, 우주 등
- **방산 뉴스 피드** & **분쟁·긴장 지수**
- **한국 방산 수출 현황**

## 실행 방법

### 정적만 (Tavily API 미사용)

`index.html`을 브라우저에서 직접 열거나 정적 서버 사용.

### Tavily API 사용 (권장)

API 키는 **서버 프록시**를 통해서만 호출됩니다. [SECRETS.md](./SECRETS.md) 참고.

```powershell
copy .env.example .env
# .env 에 TAVILY_API_KEY 입력 (채팅에 붙여넣지 마세요)

python server.py
```

→ `http://localhost:3000`

**주의:** `index.html` 더블클릭(`file://`)으로는 Tavily 뉴스가 동작하지 않습니다. 반드시 `python server.py`로 실행하세요.

Node.js가 있으면 `npm run dev`도 사용 가능합니다.
### 배포 (Vercel)

- `.env` 파일은 업로드하지 않음
- Vercel 대시보드 → Environment Variables → `TAVILY_API_KEY` 등록

## 기술 스택

- HTML / CSS / Vanilla JavaScript
- [Chart.js](https://www.chartjs.org/) (CDN)
- Tavily — 서버 프록시 (`server/`, `api/`)

## 데이터

공개 자료(SIPRI, IISS, Jane's, KIDA 등) 기반 **추정·목업 데이터**입니다.  
실제 의사결정에는 공식 통계를 참고하세요.
