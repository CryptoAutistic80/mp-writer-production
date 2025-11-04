# Environment Variables Reference

This document maps environment variables from `env.backend.txt` and `env.frontend.txt` to Cloud Build substitution variables.

## Backend Variables (`cloudbuild.backend.yaml`)

### Required (Must Set in Cloud Build Trigger)

| Cloud Build Variable | Environment Variable | Description | Example |
|---------------------|---------------------|-------------|---------|
| `_MONGO_URI` | `MONGO_URI` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/mpwriter` |
| `_REDIS_URL` | `REDIS_URL` | Redis connection string | `redis://10.0.0.3:6379` |
| `_JWT_SECRET` | `JWT_SECRET` | JWT signing secret (min 32 chars) | Generate: `openssl rand -hex 32` |
| `_DATA_ENCRYPTION_KEY` | `DATA_ENCRYPTION_KEY` | Data encryption key | Generate: `openssl rand -hex 32` |
| `_OPENAI_API_KEY` | `OPENAI_API_KEY` | OpenAI API key | `sk-proj-...` |
| `_APP_ORIGIN` | `APP_ORIGIN` | Frontend URL for CORS | `https://your-frontend.run.app` |

### Optional with Defaults (Already Set)

| Cloud Build Variable | Environment Variable | Default Value | Description |
|---------------------|---------------------|---------------|-------------|
| `_TRUST_PROXY` | `TRUST_PROXY` | `1` | Trust proxy headers (required for Cloud Run) |
| `_STRIPE_CHECKOUT_ENABLED` | `STRIPE_CHECKOUT_ENABLED` | `0` | Enable Stripe checkout |
| `_STRIPE_CURRENCY` | `STRIPE_CURRENCY` | `gbp` | Stripe currency code |
| `_ADDRESS_DEBUG` | `ADDRESS_DEBUG` | `0` | Address lookup debug logging |

### Optional OpenAI Models (Defaults Provided)

| Cloud Build Variable | Environment Variable | Default Value |
|---------------------|---------------------|---------------|
| `_OPENAI_MODEL` | `OPENAI_MODEL` | `gpt-4o-mini` |
| `_OPENAI_TRANSCRIPTION_MODEL` | `OPENAI_TRANSCRIPTION_MODEL` | `gpt-4o-mini-transcribe` |
| `_OPENAI_FOLLOW_UP_MODEL` | `OPENAI_FOLLOW_UP_MODEL` | `gpt-5-mini` |
| `_OPENAI_LETTER_MODEL` | `OPENAI_LETTER_MODEL` | `gpt-5` |
| `_OPENAI_LETTER_VERBOSITY` | `OPENAI_LETTER_VERBOSITY` | `medium` |
| `_OPENAI_LETTER_REASONING_EFFORT` | `OPENAI_LETTER_REASONING_EFFORT` | `high` |
| `_OPENAI_DEEP_RESEARCH_MODEL` | `OPENAI_DEEP_RESEARCH_MODEL` | `o4-mini-deep-research` |
| `_OPENAI_DEEP_RESEARCH_ENABLE_WEB_SEARCH` | `OPENAI_DEEP_RESEARCH_ENABLE_WEB_SEARCH` | `true` |
| `_OPENAI_DEEP_RESEARCH_ENABLE_CODE_INTERPRETER` | `OPENAI_DEEP_RESEARCH_ENABLE_CODE_INTERPRETER` | `false` |
| `_OPENAI_DEEP_RESEARCH_REASONING_SUMMARY` | `OPENAI_DEEP_RESEARCH_REASONING_SUMMARY` | `auto` |
| `_OPENAI_DEEP_RESEARCH_REASONING_EFFORT` | `OPENAI_DEEP_RESEARCH_REASONING_EFFORT` | `medium` |

### Optional Stripe (Only if Checkout Enabled)

| Cloud Build Variable | Environment Variable | Description |
|---------------------|---------------------|-------------|
| `_STRIPE_SECRET_KEY` | `STRIPE_SECRET_KEY` | Stripe secret key (starts with `sk_`) |
| `_STRIPE_WEBHOOK_SECRET` | `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret (starts with `whsec_`) |
| `_STRIPE_PRICE_ID_CREDITS_3` | `STRIPE_PRICE_ID_CREDITS_3` | Price ID for 3 credits |
| `_STRIPE_PRICE_ID_CREDITS_6` | `STRIPE_PRICE_ID_CREDITS_6` | Price ID for 6 credits |
| `_STRIPE_PRICE_ID_CREDITS_12` | `STRIPE_PRICE_ID_CREDITS_12` | Price ID for 12 credits |
| `_STRIPE_AMOUNT_CREDITS_3` | `STRIPE_AMOUNT_CREDITS_3` | Amount in pence (e.g., 300 = £3.00) |
| `_STRIPE_AMOUNT_CREDITS_6` | `STRIPE_AMOUNT_CREDITS_6` | Amount in pence |
| `_STRIPE_AMOUNT_CREDITS_12` | `STRIPE_AMOUNT_CREDITS_12` | Amount in pence |

### Optional Google OAuth

| Cloud Build Variable | Environment Variable | Description |
|---------------------|---------------------|-------------|
| `_GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `_GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `_GOOGLE_CALLBACK_URL` | `GOOGLE_CALLBACK_URL` | OAuth callback URL |

### Optional Advanced

| Cloud Build Variable | Environment Variable | Description |
|---------------------|---------------------|-------------|
| `_STREAMING_STATE_TTL_MS` | `STREAMING_STATE_TTL_MS` | Streaming state TTL in milliseconds |
| `_GETADDRESS_API_KEY` | `GETADDRESS_API_KEY` | GetAddress.io API key for UK address lookup |
| `_OPENAI_DEEP_RESEARCH_WEB_SEARCH_CONTEXT_SIZE` | `OPENAI_DEEP_RESEARCH_WEB_SEARCH_CONTEXT_SIZE` | Web search context size |
| `_OPENAI_DEEP_RESEARCH_VECTOR_STORE_IDS` | `OPENAI_DEEP_RESEARCH_VECTOR_STORE_IDS` | Comma-separated vector store IDs |
| `_OPENAI_DEEP_RESEARCH_MAX_TOOL_CALLS` | `OPENAI_DEEP_RESEARCH_MAX_TOOL_CALLS` | Max tool calls per request |

---

## Frontend Variables (`cloudbuild.frontend.yaml`)

### Required (Must Set in Cloud Build Trigger)

| Cloud Build Variable | Environment Variable | Description | Example |
|---------------------|---------------------|-------------|---------|
| `_NEXT_BACKEND_ORIGIN` | `NEXT_BACKEND_ORIGIN` | Backend URL for server-side requests | `https://your-backend.run.app` |

### Optional with Defaults (Already Set)

| Cloud Build Variable | Environment Variable | Default Value | Description |
|---------------------|---------------------|---------------|-------------|
| `_NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_API_URL` | `/api` | Client-side API path |
| `_NEXT_PUBLIC_ENABLE_DEMO_PURCHASE` | `NEXT_PUBLIC_ENABLE_DEMO_PURCHASE` | `0` | Enable demo purchase mode |
| `_NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED` | `NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED` | `0` | Enable Stripe checkout |

### Optional Stripe (Only if Checkout Enabled)

| Cloud Build Variable | Environment Variable | Description |
|---------------------|---------------------|-------------|
| `_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (starts with `pk_`) |

---

## Quick Deployment Command

### Backend (Minimal Required Variables)

```bash
gcloud builds submit \
  --config=cloudbuild.backend.yaml \
  --region=europe-west1 \
  --substitutions="\
_MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/mpwriter,\
_REDIS_URL=redis://your-redis:6379,\
_JWT_SECRET=$(openssl rand -hex 32),\
_DATA_ENCRYPTION_KEY=$(openssl rand -hex 32),\
_OPENAI_API_KEY=sk-your-key,\
_APP_ORIGIN=https://your-frontend.run.app"
```

### Frontend (Minimal Required Variables)

```bash
gcloud builds submit \
  --config=cloudbuild.frontend.yaml \
  --region=europe-west1 \
  --substitutions="_NEXT_BACKEND_ORIGIN=https://your-backend.run.app"
```

---

## Notes

1. **Generate secrets:**
   ```bash
   openssl rand -hex 32  # For JWT_SECRET and DATA_ENCRYPTION_KEY
   ```

2. **All optional variables with defaults** are already configured in the `substitutions` section of each YAML file

3. **Empty string defaults** (`''`) mean the variable is truly optional and won't cause validation errors if not set

4. **Variables in CAPS** in env files = actual environment variables passed to the container

5. **Variables with `_` prefix** = Cloud Build substitution variables (set in trigger config)

