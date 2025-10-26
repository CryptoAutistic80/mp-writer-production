FROM node:20-alpine
WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm install

# Copy source and run dev server
COPY . .

EXPOSE 3000
CMD ["npx", "nx", "dev", "frontend", "--port=3000", "--hostname=0.0.0.0"]

