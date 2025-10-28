mp-writer
=========

MP Writer helps UK constituents turn their concerns into researched, persuasive letters for their Member of Parliament. The workspace is an Nx monorepo with a NestJS API, a Next.js 15 application, and shared libraries for common modules. Features include postcode → MP lookup, deep-research assisted drafting, audio transcription, saved letters, and a credit-based billing model with optional Stripe checkout.

## Technology Snapshot
- Nx 21 workspace (`apps`: `backend-api`, `frontend`)
- Backend: NestJS 11, MongoDB, Redis, Passport (Google), Stripe checkout, OpenAI Responses API
- Frontend: Next.js 15 app router, React 19, TanStack Query, streaming UX for the Writing Desk
- Shared libs: `libs/nest-modules` (guards, CSRF, audit logging, shared DTOs)

## Prerequisites
- Node.js 20.x (ships with npm 10)
- MongoDB 7+ and Redis 7 (local or hosted) – the dev docker stack provides both
- OpenAI API key with access to `gpt-4o-mini` and `o4-mini-deep-research`
- Docker Desktop (optional, recommended)
- Stripe CLI (optional, only required when working on checkout)

## First-Time Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment template and fill the required values:
   ```bash
   cp .env.example .env
   ```
   - **Required**: `MONGO_URI`, `REDIS_URL`, `JWT_SECRET` (>=32 chars), `DATA_ENCRYPTION_KEY`, `OPENAI_API_KEY`, `APP_ORIGIN`
   - The backend refuses to start if required secrets are missing or invalid.
3. (Optional) Create `.env.local` for overrides used by `docker-compose.dev.yml`.

### Running the stack locally
Choose either the Nx terminals or the docker compose stack:

- **Nx terminals (Atlas or local Mongo/Redis)**
  ```bash
  # Terminal 1 – backend API on http://localhost:4000
  PORT=4000 npx nx serve backend-api

  # Terminal 2 – frontend on http://localhost:3000
  npx nx dev frontend
  ```

- **Docker compose (local Mongo + Redis + hot reload)**
  ```bash
  docker compose -f docker-compose.dev.yml up --build
  ```
  The compose stack mounts the workspace into the containers for live reload.

To stop either stack use `Ctrl+C`, or `docker compose -f docker-compose.dev.yml down --remove-orphans` for Docker.

### Production-style build
```bash
npx nx build backend-api
npx nx build frontend
# Or build full images
docker compose build
```

## Environment Configuration Guide
`.env.example` documents every variable. Highlights:

- **Core services**: `MONGO_URI`, `REDIS_URL`, `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `APP_ORIGIN`, `OPENAI_API_KEY`
- **Optional integrations**:
  - Stripe checkout (`STRIPE_*`, `NEXT_PUBLIC_STRIPE_*`) – only required when `STRIPE_CHECKOUT_ENABLED=1`
  - Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`)
  - GetAddress.io for address enrichment (`GETADDRESS_API_KEY`, `ADDRESS_DEBUG`)
- **Frontend**: Prefix public config with `NEXT_PUBLIC_` (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ENABLE_DEMO_PURCHASE`, etc.)

The backend validates configuration on boot; misconfigured keys result in a startup failure with a descriptive message.

## Nx Targets & Scripts
| Purpose | Command |
|---------|---------|
| Backend dev server | `npx nx serve backend-api` |
| Frontend dev server | `npx nx dev frontend` |
| Backend unit tests | `npx nx test backend-api` |
| Frontend unit tests | `npx nx test frontend` |
| Backend e2e (Jest) | `npx nx e2e backend-api-e2e` |
| Frontend e2e (Playwright) | `npx nx e2e frontend-e2e` |
| Format/lint (workspace rules) | `npx nx lint <project>` |
| Clear unsecured dev data | `npm run clear-dev-data` |

Tests expect MongoDB/Redis. When running via Docker the services are already available; otherwise point `MONGO_URI`/`REDIS_URL` to your instances and export the same env vars in the test shell.

## Key Features
- **Writing Desk**: Credit-metered streaming composition with tone selection, citation capture, follow-up prompts, PDF/DOCX export, and optional audio transcription (`/api/ai/*`).
- **Deep Research**: Background research pipeline that fans out via OpenAI “deep research” APIs while persisting progress in Redis for recovery.
- **MP Lookup**: Constituency lookup via Postcodes.io with enrichment from the UK Parliament Members API and resilience via Cockatiel circuit breakers.
- **Identity & Security**: JWT auth with Google sign-in, CSRF guard for browser sessions, rate-limiting buckets (`default`, `ai`, `credit`, `webhook`), audited privileged actions, and encrypted at-rest PII.
- **Credits & Checkout**: Balance endpoints in `user-credits` module plus optional Stripe checkout (webhooks validated against `STRIPE_WEBHOOK_SECRET`).
- **Saved Letters**: Persisted drafts and generated letters (`/api/user/saved-letters`) for revisit and export.

## Stripe Workflow
When working on billing:
1. Install the Stripe CLI and sign in.
2. Run `./scripts/stripe-local-setup.sh` to start a local webhook listener.
3. Follow `STRIPE_QUICKSTART.md` for the short flow or `STRIPE_TESTING.md` for scenario walkthroughs.
4. Implementation notes live in `STRIPE_IMPLEMENTATION.md`.

## Project Layout
```
backend-api/           NestJS service (modules: auth, ai, checkout, mps, etc.)
backend-api-e2e/       Jest e2e specs for backend
frontend/              Next.js app (App Router)
frontend-e2e/          Playwright specs
libs/nest-modules/     Shared Nest providers (CSRF guard, audit logger, etc.)
scripts/               Utility scripts (Stripe setup, data maintenance)
docs/                  Additional engineering documentation
STRIPE_*.md            Stripe checkout docs (quick start, testing, implementation)
audit.md               Historical security & stability audit log
docker-compose*.yml    Dev/prod compose stacks
```

## Health & Troubleshooting
- API health check: `GET http://localhost:4000/api/health` (validates Mongo/Redis connectivity via Nest Terminus).
- Saved MP: `GET /api/user/mp` (requires auth), managed by `user-mp` module.
- Redis-backed streaming state: check keys with `redis-cli KEYS streaming:*` to diagnose stuck runs.
- For docker issues when switching stacks, remove old containers then prune networks: `docker rm -f mp-writer-* && docker network prune`.

## Further Reading
- `docs/development.md` – deeper workflow notes (env profiles, debugging tips)
- `docs/architecture.md` – module-level architecture overview
- `audit.md` – resolved security/concurrency issues and mitigations
- Stripe docs listed above

Have suggestions or questions? Raise them in issues or drop a note in the audit log so the next engineer knows what changed.
