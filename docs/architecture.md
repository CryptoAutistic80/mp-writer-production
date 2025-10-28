# Architecture Overview

MP Writer is an Nx monorepo that packages a NestJS backend (`backend-api`) and a Next.js frontend (`frontend`). MongoDB stores user data and generated artefacts, while Redis coordinates long-lived streaming jobs and throttling counters. This document sketches the high-level shape of the system so new contributors can find their bearings quickly.

## Runtime Topology
- **Frontend (`frontend/`)** runs on Next.js 15 (App Router) and talks to the API through relative `/api/*` routes. It relies on React Server Components with client islands for interactive flows (dashboard, writing desk, credit shop).
- **Backend (`backend-api/`)** exposes the REST/gRPC surface (currently REST only) on port 4000. The Nest application wires together domain modules (AI, checkout, MP lookup, etc.) via dependency injection.
- **MongoDB** persists all durable state: users, credits, saved MPs, writing desk jobs, purchase records, audit events.
- **Redis** underpins the streaming experience and various rate/circuit breakers: it stores run checkpoints, resumable job metadata, and tracks token usage.
- **External services**:
  - OpenAI Responses and Speech APIs for research, drafting, and transcription.
  - Postcodes.io and the UK Parliament Members API for constituency/MP details.
  - GetAddress.io for user address enrichment.
  - Stripe Checkout + webhooks for credit purchases.

## Backend Modules
All backend modules live under `backend-api/src`. The most frequently touched modules are:

- `ai/`: Orchestrates the Writing Desk. `AiService` streams research and letter content through OpenAI, mediates credit deductions (`UserCreditsService`), and persists job state in MongoDB + Redis. SSE-compatible payloads are produced via RxJS `ReplaySubject`s so clients can resume after reconnecting.
- `checkout/`: Handles Stripe checkout session creation and webhook fulfilment (`CheckoutService`). Hardened with signature validation, price/amount verification, MongoDB transactions, and replay-safe fulfilment using unique indexes.
- `purchases/`, `user-credits/`, `user-saved-letters/`: Support modules that encapsulate credit balance updates, purchase history, and generated artefact storage. The repository layer keeps MongoDB access consistent.
- `auth/`: Google OAuth login, JWT issuance, cookie management, refresh tokens, and CSRF token distribution. The `CsrfModule` registers a guard that protects all mutating routes except those decorated with the custom bypass decorator (used for Stripe webhooks).
- `mps/`: Constituency and MP lookup using circuit-breaker-wrapped Postcodes.io + Parliament API requests. Intelligent fallbacks ensure we still resolve MPs during upstream outages.
- `streaming-state/`: Redis-backed coordination for long-running runs. Prevents duplicate generation, recovers orphaned runs, and enforces TTLs.
- `common/audit/`: Writes structured audit events (module, action, actor, metadata) so sensitive flows leave an immutable trail.

The Nest root module (`src/app/app.module.ts`) wires these together, applying `ThrottlerModule` buckets (`default`, `ai`, `credit`, `webhook`) and validating configuration via `ConfigModule` before the app boots.

## Data Model Highlights
- **Users (`users` collection)**: Stores OAuth identity, encrypted PII (address, phone), and the current credit balance.
- **Writing Desk Jobs (`writingdeskjobs`)**: Tracks intake form data, streaming status, tone, and associated OpenAI response IDs. Redis stores the active run channels so clients can reconnect to in-flight work.
- **Saved Letters (`usersavedletters`)**: Snapshot of generated letters, searchable by response ID or date range via pagination.
- **Purchases (`purchases`)**: Stripe session metadata and fulfilment status. Unique index on `metadata.stripeSessionId` enforces idempotence.
- **User MPs (`usermps`)**: Saved MP lookup results, keyed by user.

All sensitive fields (addresses, phone numbers) pass through `CryptoModule`’s `EncryptionService` before storage. Decryption happens only when the authenticated user requests their own data.

## Frontend Structure
- `src/app/`: App Router routes (home, dashboard, writing desk, credit shop, saved letters, etc.). Each route composes client components for interactive segments.
- `src/features/writing-desk/`: Hooks, components, and utilities for the Writing Desk UI, including SSE/SSE-like streaming handling, resume modals, and tone presets.
- `src/components/`: Shared UI (hero, address form, MP lookup widget) and cross-cutting utilities (audio transcription button, toast notifications).
- `src/lib/api-client.ts`: Central fetch wrapper that injects credentials, handles CSRF token retrieval, and triggers JWT refresh flows. All data mutations run through this helper to satisfy CSRF requirements.

Client components rely on TanStack Query for cache management, and React Markdown / HTML utilities for presenting generated letters. Streaming responses are rendered progressively with optimistic UI updates.

## Authentication & Session Flow
1. User initiates Google OAuth (`/api/auth/google`).
2. Backend issues signed JWT + refresh token cookies (`__Host-mpw_session`, etc.).
3. `apiClient` attaches cookies and obtains CSRF tokens (`/api/auth/csrf-token`) before mutating requests.
4. Refresh tokens are rotated on `/api/auth/refresh`, and a CSRF failure triggers a refresh + retry.
5. Guards (`JwtAuthGuard`, `CsrfGuard`) ensure only authenticated, CSRF-protected requests reach the domain modules.

## Streaming & Credits
- Credit deductions happen atomically inside MongoDB transactions (`UserCreditsService.deductCredits`) immediately before a run starts.
- `StreamingStateService` records the run in Redis, streaming payloads are buffered (2000-item ring buffers), and inactivity timers abort silent runs.
- On errors, credits are refunded within the same transactional boundary to avoid negative balances.
- Frontend listens for `status`, `delta`, `letter_delta`, and `complete` payload types to update the UI in real-time.

## Deployment Notes
- `Dockerfile.prod` builds separate frontend/backend images; `docker-compose.yml` assembles them alongside Redis. Critical secrets in the compose file use `${VAR:?error}` syntax to fail fast when missing.
- `docker-compose.dev.yml` spawns hot-reloading containers with bind mounts and bundled Mongo/Redis for local development.
- Health checks (`/api/health`) use Nest Terminus’ Mongo indicator so orchestrators can drop unhealthy pods/containers.

## Observability & Audit
- Structured logs (Nest `Logger`) include module context; Stripe and AI flows log success/failure with session or run IDs.
- Audit records help trace privileged actions (credit grants, Stripe fulfilment, etc.) back to actors.
- Throttling and circuit breaker warnings surface via logs; Redis keys prefixed `streaming:*` reveal stuck or orphaned runs.

## Where to Look Next
- Need the step-by-step developer workflow? See `docs/development.md`.
- Want to inspect Stripe changes? `STRIPE_IMPLEMENTATION.md` summarises the risk fixes and flow.
- For security context, consult `audit.md`, which documents the resolved high-risk findings and mitigations.
