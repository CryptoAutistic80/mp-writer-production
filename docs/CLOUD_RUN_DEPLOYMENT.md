# Google Cloud Run Deployment Guide

This guide explains how to deploy the MP Writer application (backend + frontend) as a single Docker container to Google Cloud Run via Docker Hub.

## Architecture

The Cloud Run deployment runs both the NestJS backend API and Next.js frontend in a single container:

- **Backend**: Runs on internal port `4000` (not exposed externally)
- **Frontend**: Runs on Cloud Run's `PORT` (default `8080`) and proxies `/api/*` requests to the backend
- **Single Entry Point**: Cloud Run routes all traffic to the frontend, which proxies API requests internally

## Prerequisites

1. **Docker Desktop** installed and running
2. **Docker Hub Account** (already logged in)
3. **Google Cloud Account** with billing enabled
4. **gcloud CLI** installed: https://cloud.google.com/sdk/docs/install
5. **Required Secrets** ready:
   - MongoDB connection string (`MONGO_URI`)
   - JWT secret (`JWT_SECRET`)
   - Data encryption key (`DATA_ENCRYPTION_KEY`)
   - OpenAI API key (`OPENAI_API_KEY`)
   - Redis URL (`REDIS_URL`)
   - Optional: Stripe keys, Google OAuth keys, etc.

## Step 1: Set Up Google Cloud

### 1.1 Authenticate with Google Cloud

```bash
gcloud auth login
```

### 1.2 Create or Select a Project

```bash
# Create new project
gcloud projects create YOUR-PROJECT-ID --name="MP Writer"

# Or select existing project
gcloud config set project YOUR-PROJECT-ID
```

### 1.3 Enable Required APIs

```bash
gcloud services enable run.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

### 1.4 Set Up External Services

#### Option A: MongoDB Atlas (Recommended)
1. Create a MongoDB Atlas cluster: https://www.mongodb.com/cloud/atlas
2. Whitelist Cloud Run IP ranges (or allow all IPs: `0.0.0.0/0`)
3. Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/mp_writer`

#### Option B: Google Cloud Memorystore for Redis
```bash
gcloud redis instances create mp-writer-redis \
  --size=1 \
  --region=europe-west2 \
  --redis-version=redis_7_0
```

## Step 2: Store Secrets in Google Secret Manager

Store sensitive environment variables as secrets:

```bash
# Required secrets
echo -n "mongodb+srv://..." | gcloud secrets create MONGO_URI --data-file=-
echo -n "$(openssl rand -hex 32)" | gcloud secrets create JWT_SECRET --data-file=-
echo -n "$(openssl rand -hex 32)" | gcloud secrets create DATA_ENCRYPTION_KEY --data-file=-
echo -n "sk-..." | gcloud secrets create OPENAI_API_KEY --data-file=-
echo -n "redis://..." | gcloud secrets create REDIS_URL --data-file=-

# Optional secrets (if using Stripe)
echo -n "sk_live_..." | gcloud secrets create STRIPE_SECRET_KEY --data-file=-
echo -n "whsec_..." | gcloud secrets create STRIPE_WEBHOOK_SECRET --data-file=-

# Optional secrets (if using Google OAuth)
echo -n "YOUR-CLIENT-ID" | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-
echo -n "YOUR-CLIENT-SECRET" | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-
```

## Step 3: Build and Push Docker Image

### 3.1 Build the Image Locally

```bash
# Build for Cloud Run
docker build -f Dockerfile.cloudrun -t mp-writer-cloudrun .
```

This will take several minutes on the first build.

### 3.2 Test Locally (Optional but Recommended)

Create a test `.env.cloudrun` file with your actual values:

```bash
docker run -p 8080:8080 \
  -e PORT=8080 \
  -e NODE_ENV=production \
  -e MONGO_URI="your-mongo-uri" \
  -e JWT_SECRET="your-jwt-secret" \
  -e DATA_ENCRYPTION_KEY="your-data-key" \
  -e OPENAI_API_KEY="your-openai-key" \
  -e REDIS_URL="your-redis-url" \
  -e APP_ORIGIN="http://localhost:8080" \
  -e TRUST_PROXY=1 \
  mp-writer-cloudrun
```

Visit `http://localhost:8080` to test the application.

### 3.3 Tag and Push to Docker Hub

Replace `YOUR_DOCKERHUB_USERNAME` with your actual Docker Hub username:

```bash
# Tag the image
docker tag mp-writer-cloudrun YOUR_DOCKERHUB_USERNAME/mp-writer:latest

# Push to Docker Hub (you should already be logged in)
docker push YOUR_DOCKERHUB_USERNAME/mp-writer:latest
```

## Step 4: Deploy to Google Cloud Run

### 4.1 Update Memory (CRITICAL!)

**IMPORTANT**: If you deployed via the Cloud Run console, it likely set memory to 512MiB, which is **too low** for both services. Update it immediately:

```bash
gcloud run services update mp-writer \
  --region=europe-west2 \
  --memory=2Gi \
  --cpu=2
```

### 4.2 Deploy with Secrets

Replace placeholders with your values:

```bash
gcloud run deploy mp-writer \
  --image=docker.io/YOUR_DOCKERHUB_USERNAME/mp-writer:latest \
  --platform=managed \
  --region=europe-west2 \
  --allow-unauthenticated \
  --port=8080 \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --concurrency=80 \
  --min-instances=0 \
  --max-instances=10 \
  --startup-cpu-boost \
  --set-env-vars="NODE_ENV=production,TRUST_PROXY=1,APP_ORIGIN=https://YOUR-DOMAIN.com,OPENAI_MODEL=gpt-5-mini,NEXT_PUBLIC_API_URL=/api" \
  --set-secrets="MONGO_URI=MONGO_URI:latest,JWT_SECRET=JWT_SECRET:latest,DATA_ENCRYPTION_KEY=DATA_ENCRYPTION_KEY:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,REDIS_URL=REDIS_URL:latest"
```

**Important Configuration Notes:**
- **Memory**: Start with `2Gi` minimum (both services need memory). If you see OOM errors, increase to `4Gi`.
- **Startup CPU Boost**: `--startup-cpu-boost` helps containers start faster (used in first request).
- **Port**: Must be `8080` (Cloud Run's default) - this is what the frontend listens on.
- **Startup Timeout**: If startup takes longer than 240s, Cloud Run will fail. The default timeout should be sufficient.

### 4.3 Deploy with Optional Features

If you're using Stripe or Google OAuth, add these flags:

```bash
# Add Stripe environment variables
  --set-env-vars="STRIPE_CHECKOUT_ENABLED=1,NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED=1" \
  --set-secrets="STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest" \
  --set-env-vars="NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_..."

# Add Google OAuth
  --set-secrets="GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest" \
  --set-env-vars="GOOGLE_CALLBACK_URL=https://YOUR-DOMAIN.com/api/auth/google/callback"
```

### 4.3 Verify Deployment

After deployment completes, Cloud Run will provide a URL like:
```
https://mp-writer-xxxxx-uc.a.run.app
```

Visit this URL to verify the deployment.

## Step 5: Set Up Custom Domain (Optional)

### 5.1 Map Custom Domain

```bash
gcloud run domain-mappings create \
  --service=mp-writer \
  --domain=yourdomain.com \
  --region=europe-west2
```

### 5.2 Update DNS Records

Follow the instructions from Cloud Run to add the required DNS records to your domain registrar.

### 5.3 Update APP_ORIGIN

After the domain is mapped, update the APP_ORIGIN:

```bash
gcloud run services update mp-writer \
  --region=europe-west2 \
  --set-env-vars="APP_ORIGIN=https://yourdomain.com"
```

## Step 6: Monitor and Maintain

### View Logs

```bash
gcloud run services logs read mp-writer --region=europe-west2 --limit=100
```

### Update Deployment

When you make changes:

```bash
# Rebuild and push
docker build -f Dockerfile.cloudrun -t mp-writer-cloudrun .
docker tag mp-writer-cloudrun YOUR_DOCKERHUB_USERNAME/mp-writer:latest
docker push YOUR_DOCKERHUB_USERNAME/mp-writer:latest

# Redeploy (Cloud Run will pull the new image)
gcloud run services update mp-writer \
  --region=europe-west2 \
  --image=docker.io/YOUR_DOCKERHUB_USERNAME/mp-writer:latest
```

### View Service Details

```bash
gcloud run services describe mp-writer --region=europe-west2
```

## Architecture Details

### How It Works

1. **Cloud Run** receives HTTP/HTTPS requests on the service URL
2. **Frontend (Next.js)** listens on the Cloud Run `PORT` (8080)
3. **Backend (NestJS)** runs internally on port 4000
4. **Next.js rewrites** proxy `/api/*` requests to `http://localhost:4000/api/*`
5. The startup script (`start-cloudrun.sh`) orchestrates both processes

### Environment Variables

| Variable | Purpose | Set Where |
|----------|---------|-----------|
| `PORT` | Frontend listen port (injected by Cloud Run) | Cloud Run |
| `BACKEND_PORT` | Backend internal port | Dockerfile |
| `NEXT_BACKEND_ORIGIN` | Backend URL for frontend proxy | Dockerfile |
| `NODE_ENV` | Node environment | Cloud Run |
| `TRUST_PROXY` | Enable proxy trust (for HTTPS) | Cloud Run |
| `APP_ORIGIN` | CORS origin for backend | Cloud Run |
| `K_SERVICE` | Cloud Run service name (auto-injected) | Cloud Run |

### Security Features

✅ **HTTPS Enforcement**: Backend detects Cloud Run and enforces HTTPS  
✅ **Trust Proxy**: Backend trusts Cloud Run's X-Forwarded-* headers  
✅ **Secrets Management**: Sensitive data stored in Secret Manager  
✅ **Non-root User**: Container runs as non-root user (nodejs:1001)  
✅ **Minimal Base Image**: Alpine Linux for reduced attack surface  
✅ **CORS Protection**: Backend validates origin against APP_ORIGIN  
✅ **Security Headers**: Helmet.js and Next.js CSP configured  

### Cost Optimization

- **Min Instances: 0** - Scales to zero when not in use
- **Max Instances: 10** - Prevents runaway costs
- **Request Timeout: 300s** - 5 minutes for long-running requests
- **Concurrency: 80** - Each instance handles up to 80 concurrent requests

Estimated cost for low traffic: **$5-20/month**

## Troubleshooting

### Container Fails to Start

Check logs:
```bash
gcloud run services logs read mp-writer --region=europe-west2 --limit=50
```

**Common Issues and Solutions:**

1. **"Container failed to start and listen on port 8080"**
   - **Cause**: Container takes too long to start, or frontend not listening on correct port
   - **Solution**: 
     - Increase memory: `--memory=2Gi` or `--memory=4Gi` (Cloud Run console defaults to 512MiB which is too low!)
     - Check logs for startup errors
     - Verify frontend starts on `$PORT` environment variable

2. **"Backend not healthy"**
   - **Cause**: MongoDB/Redis not accessible or health check fails
   - **Solution**: 
     - Verify MongoDB Atlas network access (whitelist `0.0.0.0/0` or Cloud Run IP ranges)
     - Check Redis connectivity
     - Health check will fail if DB is unreachable, but container can still run

3. **"Port mismatch"**
   - **Cause**: Container not listening on Cloud Run's PORT env var
   - **Solution**: Frontend automatically uses `$PORT` (8080), backend uses `BACKEND_PORT` (4000)

4. **"Out of Memory (OOM)"**
   - **Cause**: 512MiB memory too low for both services
   - **Solution**: Increase to at least `--memory=2Gi` using gcloud CLI:
     ```bash
     gcloud run services update mp-writer \
       --region=europe-west2 \
       --memory=2Gi
     ```

5. **Missing secrets**
   - Verify all required secrets are set in Secret Manager
   - Ensure secrets are referenced in `--set-secrets` flag

### 502 Bad Gateway

Usually means the container isn't listening on the correct port:
- Verify `PORT` environment variable is being used
- Check that the container exposes port 8080
- Review startup script logs

### CORS Errors

Update `APP_ORIGIN` to match your domain:
```bash
gcloud run services update mp-writer \
  --region=europe-west2 \
  --set-env-vars="APP_ORIGIN=https://yourdomain.com"
```

### Database Connection Issues

- **MongoDB Atlas**: Whitelist Cloud Run IPs or use `0.0.0.0/0`
- **Redis**: Ensure Redis URL is accessible from Cloud Run
- Check that `MONGO_URI` and `REDIS_URL` secrets are set correctly

## Additional Resources

- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Docker Hub Documentation](https://docs.docker.com/docker-hub/)
- [MongoDB Atlas Setup](https://www.mongodb.com/docs/atlas/getting-started/)
- [Google Secret Manager](https://cloud.google.com/secret-manager/docs)

