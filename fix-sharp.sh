#!/bin/bash

echo "🔧 Fixing Sharp module error in Docker containers..."

# Stop existing containers
echo "📦 Stopping existing containers..."
docker-compose down

# Remove existing backend image to force rebuild
echo "🗑️ Removing existing backend image..."
docker rmi beeja-supa-merge-backend 2>/dev/null || true

# Clear Docker build cache for backend
echo "🧹 Clearing Docker build cache..."
docker builder prune -f

# Rebuild and start containers
echo "🔨 Rebuilding containers with Sharp fix..."
docker-compose build --no-cache backend

echo "🚀 Starting containers..."
docker-compose up -d

# Wait for containers to start
echo "⏳ Waiting for containers to start..."
sleep 10

# Check container status
echo "📊 Container status:"
docker-compose ps

# Check backend logs for Sharp errors
echo "📋 Checking backend logs for Sharp errors..."
docker-compose logs backend | grep -i sharp || echo "No Sharp errors found in logs"

echo "✅ Sharp fix deployment complete!"
echo "💡 If you still see Sharp errors, try running: docker-compose exec backend npm run rebuild-sharp"
