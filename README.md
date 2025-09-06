mp-writer

Project skeleton generated with Nx (Next.js + NestJS) following the instructions in `architectureSetup.md`.

Quick Start
- Install Node.js 20+ and Docker
- From the workspace root `mp-writer/`:
  - Dev: `npx nx serve backend-api` and `npx nx serve frontend`
  - Build: `npx nx build backend-api` and `npx nx build frontend`
  - Docker Compose (Mongo + API + Frontend): `docker compose up --build`

Environment
- `MONGO_URI`: defaults to `mongodb://localhost:27017/mp_writer` when not set
- `JWT_SECRET`: required for JWT issuance
- `APP_ORIGIN`: frontend origin for CORS (e.g., `http://localhost:3000`)
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- OpenAI: `OPENAI_API_KEY` (optional in dev), `OPENAI_MODEL` (default `gpt-4o-mini`)

Notes
- Backend uses `ConfigModule` and `MongooseModule.forRootAsync` with global `ValidationPipe`.
- Shared Nest modules live in `libs/nest-modules` for future features (auth, users, etc.).
- Security: `helmet` enabled and CORS configured to `APP_ORIGIN`.
- Rate limit: `@nestjs/throttler` at 60 req/min per IP.

Readiness & Health
- `/api/health`: Nest Terminus endpoint reports Mongo connectivity.
- Docker Compose:
  - `mongo` has a `healthcheck` using `mongosh ping`.
  - `backend-api` waits for `mongo` healthy and has its own HTTP healthcheck.
  - `frontend` waits for `backend-api` to be healthy.

Auth & API (Backend)
- Google Sign-in: `GET /api/auth/google` then `GET /api/auth/google/callback`
- Current user: `GET /api/auth/me` (Authorization: `Bearer <token>`)
- Purchases: `GET /api/purchases`, `POST /api/purchases`, `GET /api/purchases/:id`
- OpenAI: `POST /api/ai/generate` (Authorization required)
