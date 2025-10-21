# Dockerfile for database migrations
FROM node:22-slim

WORKDIR /app

# Install only the packages needed for migrations
COPY migrate/package.json ./

# Install dependencies
RUN npm install

# Copy migration files and config
COPY migrate/migrations ./migrations
COPY migrate/migrations.json ./migrations.json

# Default command - run all pending migrations using config file
CMD ["npx", "node-pg-migrate", "up", "--config-file", "migrations.json"]
