#!/bin/bash

# Docker Build Script for LMS Backend
# This script fixes the bcrypt architecture mismatch issue

set -e

echo "🚀 Starting Docker build process..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if .env file exists
if [ ! -f "./backend/.env" ]; then
    print_warning ".env file not found. Creating from template..."
    cp ./backend/.env.example ./backend/.env
    print_warning "Please edit ./backend/.env with your actual configuration values before running the containers."
fi

# Clean up any existing containers and images
print_status "Cleaning up existing containers and images..."
docker-compose down -v 2>/dev/null || true
docker system prune -f

# Build with no cache to ensure fresh bcrypt compilation
print_status "Building Docker images with no cache (this may take a few minutes)..."
docker-compose build --no-cache --parallel

# Start the services
print_status "Starting services..."
docker-compose up -d

# Wait for services to be healthy
print_status "Waiting for services to be ready..."
sleep 10

# Check service health
print_status "Checking service health..."
if docker-compose ps | grep -q "Up (healthy)"; then
    print_status "✅ Services are running and healthy!"
    echo ""
    echo "🌐 Backend API: http://localhost:5001"
    echo "🗄️  MongoDB: localhost:27017"
    echo ""
    echo "📋 Useful commands:"
    echo "  View logs: docker-compose logs -f"
    echo "  Stop services: docker-compose down"
    echo "  Restart: docker-compose restart"
    echo ""
else
    print_warning "Services are starting up. Check logs with: docker-compose logs"
fi

# Show running containers
print_status "Running containers:"
docker-compose ps

echo ""
print_status "🎉 Docker setup complete!"
print_warning "If you encounter any issues, check the logs with: docker-compose logs backend"
