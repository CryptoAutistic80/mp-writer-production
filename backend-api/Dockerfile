FROM node:20-alpine AS builder
WORKDIR /app

# Install full workspace dependencies for building
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
# Build and prepare pruned output for runtime
RUN npx nx run backend-api:prune

FROM node:20-alpine AS runner
WORKDIR /app

# Copy pruned dist output
COPY --from=builder /app/dist/backend-api ./

# Install only production deps for the pruned app
RUN npm install --omit=dev

EXPOSE 4000
ENV PORT=4000 \
    ADDRESS_DEBUG=0 \
    GETADDRESS_API_KEY= \
    DATA_ENCRYPTION_KEY= \
    DATA_ENCRYPTION_KEY_PRIMARY= \
    DATA_ENCRYPTION_KEYS= \
    DATA_ENCRYPTION_KEY_MASTER= \
    DATA_ENCRYPTION_KEY_VERSIONS=

CMD ["node", "main.js"]
