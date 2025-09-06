FROM node:20-alpine AS builder
WORKDIR /app

# Install full workspace dependencies for building
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
# Build and prepare pruned output for runtime
RUN npx nx run backend-api:prune

FROM node:20-alpine AS runner
WORKDIR /app

# Copy pruned dist output
COPY --from=builder /app/dist/backend-api ./

# Install only production deps for the pruned app
RUN npm ci --omit=dev

EXPOSE 4000
ENV PORT=4000

CMD ["node", "main.js"]
