FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application
COPY . .

# Build application (for production)
# RUN npm run build

# Expose port
EXPOSE 3000

# Development command (override in docker-compose)
CMD ["npm", "run", "dev"]
