@echo off
echo 🔧 Fixing Sharp module error in Docker containers...

REM Stop existing containers
echo 📦 Stopping existing containers...
docker-compose down

REM Remove existing backend image to force rebuild
echo 🗑️ Removing existing backend image...
docker rmi beeja-supa-merge-backend 2>nul

REM Clear Docker build cache for backend
echo 🧹 Clearing Docker build cache...
docker builder prune -f

REM Rebuild and start containers
echo 🔨 Rebuilding containers with Sharp fix...
docker-compose build --no-cache backend

echo 🚀 Starting containers...
docker-compose up -d

REM Wait for containers to start
echo ⏳ Waiting for containers to start...
timeout /t 10 /nobreak >nul

REM Check container status
echo 📊 Container status:
docker-compose ps

REM Check backend logs for Sharp errors
echo 📋 Checking backend logs for Sharp errors...
docker-compose logs backend | findstr /i sharp
if errorlevel 1 echo No Sharp errors found in logs

echo ✅ Sharp fix deployment complete!
echo 💡 If you still see Sharp errors, try running: docker-compose exec backend npm run rebuild-sharp
pause
