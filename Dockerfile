FROM node:20-slim

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev --no-package-lock

# Copy all project files
COPY . .

# Build the TypeScript code
RUN npm run build

# Use non-root user for better security
USER node

# Command to start the application
CMD ["npm", "start"]