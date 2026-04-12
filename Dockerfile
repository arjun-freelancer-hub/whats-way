# Build stage
FROM node:20-slim AS builder
WORKDIR /app

# Install system dependencies (needed for some npm packages)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY packages/diploy-core ./packages/diploy-core

# Install ALL dependencies (including devDependencies for build)
RUN npm install

# Copy source
COPY . .

# Build frontend and backend
# Memory limit is increased to handle Vite build on complex projects
ENV NODE_OPTIONS="--max-old-space-size=1536"
RUN npm run build

# Production stage
FROM node:20-slim
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
COPY packages/diploy-core ./packages/diploy-core
RUN npm install --omit=dev

# Copy build artifacts and necessary folders from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Create uploads directory
RUN mkdir -p uploads

# Runtime env
ENV NODE_ENV=production
ENV PORT=5000

# Expose port
EXPOSE 5000

# Start command: 
# 1. Sync database schema (db:push)
# 2. Start the production server
# 1. Sync schema 2. Start server
CMD ["sh", "-c", "npm run db:push && npm run start"]
