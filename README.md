# 방산 동향 대시보드

글로벌 방위산업 동향 + Tavily 실시간 뉴스 대시보드.

## 프로젝트 구조

```
DASHBOARD/
├── index.html, css/, js/     # 프론트 (정적)
├── weather/                  # 날씨 페이지
├── server.py                 # 로컬: Python 서버 + Tavily 프록시
├── api/                      # Vercel Serverless
│   ├── tavily/search.js      # POST /api/tavily/search
│   └── health.js             # GET /api/health
├── lib/tavily-proxy.js       # Serverless 공통 Tavily 로직
├── vercel.json               # Vercel 설정
└── DEPLOY.md                 # 배포 가이드
```

## 로컬 실행 (Python)

```powershell
copy .env.example .env
python server.py
```

→ http://localhost:3000

## Vercel 배포

1. Vercel에 GitHub repo 연결
2. **Environment Variables** → `TAVILY_API_KEY` 등록
3. Deploy

자세한 내용: [DEPLOY.md](./DEPLOY.md)

## API

| Method | Path | 로컬 | Vercel |
|--------|------|------|--------|
| POST | `/api/tavily/search` | server.py | api/tavily/search.js |
| GET | `/api/fx/rates` | server.py | api/fx/rates.js |
| GET | `/api/health` | server.py | api/health.js |

프론트는 `js/tavily-client.js` → `/api/tavily/search` (키 없음)

## 기술 스택

- HTML / CSS / Vanilla JS / Chart.js
- Tavily (서버 프록시)
- 로컬: Python 3 · 배포: Vercel Serverless (Node 18+)
