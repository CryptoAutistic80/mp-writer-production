# Cloud Run Deployment Guide

This guide explains how to deploy the MP Writer backend and frontend to Google Cloud Run using Cloud Build.

## Prerequisites

1. **Google Cloud Project** with billing enabled
2. **Artifact Registry** repository created:
   ```bash
   gcloud artifacts repositories create mpwriter-repo \
     --repository-format=docker \
     --location=europe-west1 \
     --description="MP Writer container images"
   ```
3. **Cloud Build API** enabled
4. **Cloud Run API** enabled
5. **MongoDB** and **Redis** instances accessible from Cloud Run (e.g., MongoDB Atlas, Cloud Memorystore)

## Required Environment Variables

### Backend (`cloudbuild.backend.yaml`)

**Required:**
- `_MONGO_URI` - MongoDB connection string (e.g., `mongodb+srv://user:pass@cluster.mongodb.net/dbname`)
- `_REDIS_URL` - Redis connection string (e.g., `redis://10.0.0.3:6379`)
- `_JWT_SECRET` - JWT signing secret (min 32 chars)
  ```bash
  openssl rand -hex 32
  ```
- `_DATA_ENCRYPTION_KEY` - Data encryption key
  ```bash
  openssl rand -hex 32
  ```
- `_OPENAI_API_KEY` - OpenAI API key (from https://platform.openai.com/api-keys)
- `_APP_ORIGIN` - Frontend URL (e.g., `https://mp-writer-production-frontend-xxx.run.app`)

**Optional:**
- `_STRIPE_CHECKOUT_ENABLED` - Set to `1` to enable Stripe checkout
- `_STRIPE_SECRET_KEY` - Stripe secret key (if checkout enabled)
- `_STRIPE_WEBHOOK_SECRET` - Stripe webhook secret (if checkout enabled)
- `_STRIPE_PRICE_ID_CREDITS_3` - Stripe price ID for 3 credits package
- `_STRIPE_PRICE_ID_CREDITS_6` - Stripe price ID for 6 credits package
- `_STRIPE_PRICE_ID_CREDITS_12` - Stripe price ID for 12 credits package
- `_GOOGLE_CLIENT_ID` - Google OAuth client ID
- `_GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `_GOOGLE_CALLBACK_URL` - Google OAuth callback URL
- `_GETADDRESS_API_KEY` - GetAddress.io API key for UK address lookup

### Frontend (`cloudbuild.frontend.yaml`)

**Required:**
- `_NEXT_PUBLIC_BACKEND_URL` - Backend API URL (e.g., `https://mp-writer-production-backend-xxx.run.app`)

**Optional:**
- `_NEXT_PUBLIC_ENABLE_DEMO_PURCHASE` - Set to `1` to enable demo purchase mode (default: `0`)

## Deployment Methods

### Method 1: Manual Deployment via gcloud

Deploy backend:
```bash
gcloud builds submit \
  --config=cloudbuild.backend.yaml \
  --region=europe-west1 \
  --substitutions=_MONGO_URI="mongodb+srv://...",_REDIS_URL="redis://...",_JWT_SECRET="your-secret",_DATA_ENCRYPTION_KEY="your-key",_OPENAI_API_KEY="sk-...",_APP_ORIGIN="https://your-frontend.run.app"
```

Deploy frontend:
```bash
gcloud builds submit \
  --config=cloudbuild.frontend.yaml \
  --region=europe-west1 \
  --substitutions=_NEXT_PUBLIC_BACKEND_URL="https://your-backend.run.app"
```

### Method 2: Cloud Build Triggers (Recommended)

Set up automated deployments from GitHub/GitLab.

#### Backend Trigger

1. Go to **Cloud Build > Triggers** in Google Cloud Console
2. Click **Create Trigger**
3. Configure:
   - **Name**: `deploy-backend-production`
   - **Event**: Push to branch `main` (or your preferred branch)
   - **Source**: Your repository
   - **Configuration**: Cloud Build configuration file
   - **Location**: `/cloudbuild.backend.yaml`
   - **Advanced > Substitution variables**: Add all required variables:
     - `_MONGO_URI`: `mongodb+srv://...`
     - `_REDIS_URL`: `redis://...`
     - `_JWT_SECRET`: `your-32-char-secret`
     - `_DATA_ENCRYPTION_KEY`: `your-32-char-key`
     - `_OPENAI_API_KEY`: `sk-...`
     - `_APP_ORIGIN`: `https://your-frontend.run.app`

#### Frontend Trigger

1. Go to **Cloud Build > Triggers**
2. Click **Create Trigger**
3. Configure:
   - **Name**: `deploy-frontend-production`
   - **Event**: Push to branch `main`
   - **Source**: Your repository
   - **Configuration**: Cloud Build configuration file
   - **Location**: `/cloudbuild.frontend.yaml`
   - **Advanced > Substitution variables**:
     - `_NEXT_PUBLIC_BACKEND_URL`: `https://your-backend.run.app`

### Method 3: Secret Manager (Most Secure)

For production, use Google Secret Manager instead of substitution variables:

1. **Create secrets:**
   ```bash
   echo -n "your-jwt-secret" | gcloud secrets create mp-writer-jwt-secret --data-file=-
   echo -n "your-encryption-key" | gcloud secrets create mp-writer-encryption-key --data-file=-
   echo -n "your-openai-key" | gcloud secrets create mp-writer-openai-key --data-file=-
   # ... repeat for other secrets
   ```

2. **Modify cloudbuild.backend.yaml** to use `--set-secrets` instead of `--set-env-vars`:
   ```yaml
   - '--set-secrets'
   - 'JWT_SECRET=mp-writer-jwt-secret:latest,DATA_ENCRYPTION_KEY=mp-writer-encryption-key:latest,OPENAI_API_KEY=mp-writer-openai-key:latest'
   ```

3. **Grant Cloud Run access to secrets:**
   ```bash
   gcloud secrets add-iam-policy-binding mp-writer-jwt-secret \
     --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```

## Deployment Order

1. **Deploy Backend First** - Get the backend URL from Cloud Run
2. **Update Frontend Config** - Set `_NEXT_PUBLIC_BACKEND_URL` to the backend URL
3. **Deploy Frontend** - Get the frontend URL
4. **Update Backend Config** - Set `_APP_ORIGIN` to the frontend URL and redeploy backend

## Troubleshooting

### Backend won't start
- Check logs: Go to Cloud Run service → Logs tab
- Common issues:
  - Missing environment variables
  - MongoDB/Redis unreachable (check network/firewall)
  - Invalid credentials

### Frontend can't connect to backend
- Check `NEXT_PUBLIC_BACKEND_URL` is correct
- Check backend CORS settings (`APP_ORIGIN`)
- Verify backend is running and accessible

### Build fails
- Check Docker build logs in Cloud Build history
- Verify Dockerfile syntax
- Check `.dockerignore` isn't excluding needed files

## Monitoring

- **Logs**: Cloud Run → Service → Logs tab
- **Metrics**: Cloud Run → Service → Metrics tab
- **Errors**: Error Reporting in Google Cloud Console

## Cost Optimization

- Adjust `--min-instances` based on traffic (0 for dev, 1+ for prod)
- Adjust `--max-instances` to prevent runaway costs
- Use `--cpu-throttling` for background jobs
- Monitor costs in Cloud Billing

## Security Checklist

- ✅ Use Secret Manager for sensitive values
- ✅ Enable VPC connector for database access (if needed)
- ✅ Configure CORS properly (`APP_ORIGIN`)
- ✅ Use HTTPS only (Cloud Run enforces this)
- ✅ Rotate secrets regularly
- ✅ Review IAM permissions
- ✅ Enable Cloud Armor (optional, for DDoS protection)

