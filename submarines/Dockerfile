# Development Dockerfile with hot reload
FROM golang:1.24-alpine

WORKDIR /app

# Install air for hot reloading
RUN go install github.com/air-verse/air@latest

# Install other dependencies
RUN apk add --no-cache git

# Copy go mod files and download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the code
COPY . .

# Expose port
EXPOSE 8080

# Use air for hot reloading
CMD ["air", "-c", ".air.toml"]
