# Development Workflow

This guide expands on the README with day-to-day tips, environment shortcuts, and debugging steps for MP Writer contributors.

## Environment Management
- Copy `.env.example` to `.env` and override secrets as needed. The backend validates configuration on boot; errors list missing or malformed keys.
- Use `.env.local` when running the dev Docker stack (`docker-compose.dev.yml`). Anything in `.env.local` is merged on top of `.env`.
- **Mongo & Redis**: the dev compose file ships with both. If you prefer local services, update `MONGO_URI`/`REDIS_URL` accordingly.
- **OpenAI options**:
  - `OPENAI_MODEL` (default `gpt-4o-mini`) controls the main writing model.
  - `OPENAI_DEEP_RESEARCH_*` tune the deep research pipeline; defaults match OpenAI’s allowed values for `o4-mini-deep-research`.
  - `OPENAI_DEEP_RESEARCH_ENABLE_WEB_SEARCH=true` lets OpenAI hit web search during research runs.
- **Credits in dev**: set `ALLOW_DEV_CREDIT_MUTATION=1` (default) to enable manual credit top-ups without Stripe. The frontend toggles the “demo purchase” button with `NEXT_PUBLIC_ENABLE_DEMO_PURCHASE`.

## Core Commands
| Task | Command | Notes |
|------|---------|-------|
| Backend dev server | `PORT=4000 npx nx serve backend-api` | Runs Nest with hot reload |
| Frontend dev server | `npx nx dev frontend` | Next.js App Router on port 3000 |
| Run both via Docker | `docker compose -f docker-compose.dev.yml up --build` | Provides Mongo + Redis |
| Lint workspace | `npx nx lint backend-api` / `npx nx lint frontend` | Uses project-specific ESLint configs |
| Unit tests | `npx nx test backend-api` / `npx nx test frontend` | Ensure Mongo/Redis env vars are set |
| E2E tests | `npx nx e2e backend-api-e2e` / `npx nx e2e frontend-e2e` | Frontend suite needs `npx playwright install` once |
| Affected targets | `npx nx affected --target=test --base=origin/main` | Useful on feature branches |
| Clear dev data | `npm run clear-dev-data` | Purges writing desk jobs & saved letters |

## Stripe Integration Notes
1. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and log in (`stripe login`).
2. Run `./scripts/stripe-local-setup.sh` to create `.env` (if missing) and start a webhook listener.
3. `STRIPE_TESTING.md` walks through full scenario testing; `STRIPE_QUICKSTART.md` has the short version.
4. Set `STRIPE_CHECKOUT_ENABLED=0` to fall back to manual “demo” credit grants.

## Debugging Tips
- **Backend logs** land in the terminal where `nx serve backend-api` runs. Use `DEBUG=mp-writer:*` (see logger usage) to increase verbosity when necessary.
- **Mongo shell**: `mongosh "${MONGO_URI}"` then inspect collections (`db.writingdeskjobs.findOne()`, etc.) to confirm state transitions.
- **Redis**: `redis-cli -u "${REDIS_URL}" KEYS "streaming:*"` surfaces in-flight jobs. Use `TTL <key>` to inspect expiry timers.
- **Stripe webhooks**: tail the Stripe CLI terminal for `checkout.session.completed` events. Replays can be triggered via `stripe trigger checkout.session.completed`.
- **Streaming hiccups**: if a client loses connection mid-run, revisit `/writingDesk`; the frontend asks to resume using the stored job in Mongo + Redis.
- **CSRF errors**: ensure requests go through `apiClient` (it fetches `/api/auth/csrf-token`). Third-party REST tools should include the `__Host-csrf-token` cookie + `X-CSRF-Token` header.

## Testing Playbook
- **Backend**: Jest lives under `backend-api/src/**/*.spec.ts`. Use `npx nx test backend-api --watch` for TDD loops.
- **Frontend**: React Testing Library specs live in `frontend/src/**/__tests__`. Invoke `npx nx test frontend`.
- **E2E**:
  - Backend e2e tests (`backend-api-e2e/`) hit the API directly via supertest.
  - Frontend e2e tests (`frontend-e2e/`) use Playwright. Start services first (`nx serve` or Docker), then run `npx nx e2e frontend-e2e`.
- **Manual scenarios**:
  - Writing Desk without credits: confirm the UI blocks generation and prompts for top-up.
  - Writing Desk recovery: start a letter, refresh the page, ensure resume modal appears.
  - Saved letters pagination: visit `/myLetters`, verify filters (`from`, `to`) work.

## Data Reset & Seed
- `npm run clear-dev-data` removes non-encrypted dev data from `writingdeskjobs` and `usersavedletters`.
- To reset everything locally when using Docker: `docker compose -f docker-compose.dev.yml down -v` (removes Mongo volume) then bring it back up.
- For a clean Redis cache: `redis-cli -u "${REDIS_URL}" FLUSHDB` (only in dev).

## Useful File Landmarks
- `backend-api/src/app/app.module.ts`: Root module + environment validation.
- `backend-api/src/ai/ai.service.ts`: The core Writing Desk orchestration.
- `backend-api/src/checkout/checkout.service.ts`: Stripe session + webhook logic.
- `frontend/src/app/writingDesk/`: Page, client orchestrator, and supporting modals.
- `frontend/src/lib/api-client.ts`: Fetch wrapper (CSRF + refresh logic).
- `libs/nest-modules/`: Shared guards/providers (e.g., CSRF guard, audit module).

## Troubleshooting Checklist
- Backend fails to start? Check the env validation message—usually a missing secret or malformed URL.
- Stripe webhook signature errors? Ensure `STRIPE_WEBHOOK_SECRET` matches the listener output and restart the backend.
- `429 Too Many Requests` from AI endpoints? Rate limits have separate buckets; wait for TTL expiry or check Redis for stuck keys.
- `401` after redeploy? Old cookies may linger. Clear browser cookies for the domain or hit `/api/auth/logout`.

## Next Steps
After getting comfortable with the workflow, review:
- `docs/architecture.md` for a mental map of services and data flow.
- `audit.md` to understand prior security considerations.
- Open issues / TODOs in the code (search for `TODO(`) for bite-sized contributions.
