# API 키 보안 가이드

Tavily API 키는 **브라우저·Git·Cursor AI에 노출되면 안 됩니다.**

## 구조

```
.env                 ← 실제 키 (Git·AI 차단, 로컬 전용)
.env.example         ← 템플릿만 (키 없음, 커밋 가능)
server.py            ← Python 로컬 (GET /api/health 포함)
lib/tavily-proxy.js  ← Vercel Serverless + Node dev-server 공통
api/tavily/search.js ← Vercel 배포용api/tavily/search.js ← Vercel 배포용 프록시
js/tavily-client.js  ← 프론트: /api/tavily/search 만 호출 (키 없음)
```

## 로컬 설정 (1회)

1. `.env.example` 을 복사해 `.env` 생성

   ```powershell
   copy .env.example .env
   ```

2. `.env` 파일을 열어 키 입력 (채팅·코드에 붙여넣지 마세요)

   ```
   TAVILY_API_KEY=tvly-xxxxxxxx

   # ExchangeRate-API — https://www.exchangerate-api.com/
   EXCHANGERATE_API_KEY=xxxxxxxx
   ```

3. Python으로 로컬 서버 실행:

   ```powershell
   python server.py
   ```

4. `http://localhost:3000` 접속

(Node.js가 설치되어 있으면 `npm run dev` 도 가능합니다.)

## 배포 (Vercel)

- `.env` 파일은 **업로드하지 않습니다**
- Vercel Dashboard → **Settings → Environment Variables** → `TAVILY_API_KEY`
- Production / Preview / Development 모두 등록
- 배포 가이드: [DEPLOY.md](./DEPLOY.md)
## 절대 하지 말 것

- `js/*.js`, `index.html` 에 API 키 직접 작성
- `.env` 를 Git에 커밋
- Cursor 채팅에 API 키 붙여넣기

## AI(Cursor) 차단

`.cursorignore` 에 `.env` 가 등록되어 있어, 에이전트가 해당 파일을 읽지 않습니다.
