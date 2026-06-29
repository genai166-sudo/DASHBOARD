# Vercel 배포 가이드

## 구조

| 환경 | 실행 | API |
|------|------|-----|
| **로컬** | `python server.py` | Python 프록시 |
| **Vercel** | Git push / `vercel deploy` | `api/tavily/search.js` Serverless |

프론트는 동일하게 `POST /api/tavily/search` 호출 (키 없음).

## 1. Vercel 프로젝트 연결

```powershell
npm i -g vercel
cd c:\LIG\DASHBOARD
vercel login
vercel link
```

또는 GitHub repo 연결 → Vercel Dashboard → Import Project

## 2. 환경 변수 (필수)

Vercel Dashboard → **Settings → Environment Variables**

| Name | Value | Environment |
|------|-------|-------------|
| `TAVILY_API_KEY` | (본인 키) | Production, Preview, Development |

<p style="color:red;font-weight:bold">.env 파일 업로드 금지. Vercel UI에서만 등록.</p>

## 3. 배포

```powershell
vercel --prod
```

Git 연동 시 `main` push마다 자동 배포.

## 4. 확인

- `https://YOUR-PROJECT.vercel.app/` — 대시보드
- `https://YOUR-PROJECT.vercel.app/api/health` — `{ "ok": true, "tavilyConfigured": true }`
- 뉴스 검색 버튼 → Tavily 결과

## 5. 로컬 (Python)

```powershell
copy .env.example .env
# .env 에 TAVILY_API_KEY 입력

python server.py
```

→ http://localhost:3000

## 6. 로컬 (Vercel 미리보기, 선택)

`.env` 또는 `vercel env pull` 후:

```powershell
vercel dev
```

→ http://localhost:3000 (Vercel과 동일 Serverless 경로)
