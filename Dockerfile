FROM node:20-slim

WORKDIR /app

# Install build dependencies for node-gyp
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies first (including dev dependencies needed for build)
RUN npm ci

# Copy all project files
COPY . .

# Build the TypeScript code
RUN npm run build

# Clean up dev dependencies after build
RUN npm ci --omit=dev --production

# Use non-root user for better security
USER node

# Command to start the application
CMD ["npm", "start"]