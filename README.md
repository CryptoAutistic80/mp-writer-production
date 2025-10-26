mp-writer

Project skeleton generated with Nx (Next.js + NestJS) following the instructions in `architectureSetup.md`.

Quick Start
- Install Node.js 20+ and Docker
- From the workspace root `mp-writer/`:
  - Dev: Ensure `.env` has `MONGO_URI` pointing to your persistent Atlas cluster, then run backend and frontend in separate terminals:
    - Terminal 1 (Backend): `PORT=4000 npx nx serve backend-api`
    - Terminal 2 (Frontend): `npx nx dev frontend` (runs on default port 3000)
  - Build: `npx nx build backend-api` and `npx nx build frontend`
  - Docker Compose (API + Frontend against Atlas): `docker compose up --build`
  - Tests:
    - Frontend: `npx jest --config frontend/jest.config.js`
    - Backend API: `npx jest --config backend-api/jest.config.js`

Environment
- `MONGO_URI`: required; set to your production Atlas connection string
- `JWT_SECRET`: required for JWT issuance
- `APP_ORIGIN`: frontend origin for CORS (e.g., `http://localhost:3000`)
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- OpenAI: `OPENAI_API_KEY` (optional in dev), `OPENAI_MODEL` (default `gpt-4o-mini`)
  - Deep research extras: `OPENAI_DEEP_RESEARCH_REASONING_SUMMARY` (default `auto`),
    `OPENAI_DEEP_RESEARCH_REASONING_EFFORT` (default `medium`). The default
    `o4-mini-deep-research` model only accepts `medium`; other values will fall back
    automatically.
- HTTPS enforcement: set `TRUST_PROXY=1` when running behind a reverse proxy (e.g., Cloud Run) so the API redirects HTTP traffic to HTTPS and honors `X-Forwarded-*` headers.

Notes
- Backend uses `ConfigModule` and `MongooseModule.forRootAsync` with global `ValidationPipe`.
- Shared Nest modules live in `libs/nest-modules` for future features (auth, users, etc.).
- Security: `helmet` enabled and CORS configured to `APP_ORIGIN`.
- Rate limit: `@nestjs/throttler` at 60 req/min per IP.

Readiness & Health
- `/api/health`: Nest Terminus endpoint reports Mongo connectivity.
- Docker Compose: `backend-api` and `frontend` services only; provide `MONGO_URI` via environment for Atlas access.

Auth & API (Backend)
- Google Sign-in: `GET /api/auth/google` then `GET /api/auth/google/callback`
- Current user: `GET /api/auth/me` (Authorization: `Bearer <token>`)
- Purchases: `GET /api/purchases`, `POST /api/purchases`, `GET /api/purchases/:id`
- OpenAI: `POST /api/ai/generate` (Authorization required)
- Saved letters: `GET /api/user/saved-letters` (Authorization required) — optional query
  params `from`, `to`, `page`, `pageSize`; responds with `{ data, total, page, pageSize }`
  so the UI can paginate saved correspondence.

Persisting a User's MP
- Model: separate collection `user_mps` keyed by `user` (ObjectId). See `backend-api/src/user-mp/schemas/user-mp.schema.ts`.
- Endpoints (auth required):
  - `GET /api/user/mp` — return the saved MP for the current user.
  - `PUT /api/user/mp` — upsert `{ constituency, mp }`.
  - `DELETE /api/user/mp` — clear saved MP.
- Frontend integration: `frontend/src/components/mpFetch.tsx`
  - Auto-loads saved MP on mount.
  - Saves after successful lookup.
  - “Change my MP” clears server state and returns to search.
