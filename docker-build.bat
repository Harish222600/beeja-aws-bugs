@echo off
REM Docker Build Script for LMS Backend (Windows)
REM This script fixes the bcrypt architecture mismatch issue

echo 🚀 Starting Docker build process...

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker and try again.
    pause
    exit /b 1
)

REM Check if .env file exists
if not exist ".\backend\.env" (
    echo [WARNING] .env file not found. Creating from template...
    copy ".\backend\.env.example" ".\backend\.env"
    echo [WARNING] Please edit .\backend\.env with your actual configuration values before running the containers.
)

REM Clean up any existing containers and images
echo [INFO] Cleaning up existing containers and images...
docker-compose down -v 2>nul
docker system prune -f

REM Build with no cache to ensure fresh bcrypt compilation
echo [INFO] Building Docker images with no cache (this may take a few minutes)...
docker-compose build --no-cache --parallel

REM Start the services
echo [INFO] Starting services...
docker-compose up -d

REM Wait for services to be ready
echo [INFO] Waiting for services to be ready...
timeout /t 10 /nobreak >nul

REM Check service health
echo [INFO] Checking service health...
docker-compose ps | findstr "Up" >nul
if errorlevel 1 (
    echo [WARNING] Services are starting up. Check logs with: docker-compose logs
) else (
    echo [INFO] ✅ Services are running!
    echo.
    echo 🌐 Backend API: http://localhost:5001
    echo 🗄️  MongoDB: localhost:27017
    echo.
    echo 📋 Useful commands:
    echo   View logs: docker-compose logs -f
    echo   Stop services: docker-compose down
    echo   Restart: docker-compose restart
    echo.
)

REM Show running containers
echo [INFO] Running containers:
docker-compose ps

echo.
echo [INFO] 🎉 Docker setup complete!
echo [WARNING] If you encounter any issues, check the logs with: docker-compose logs backend

pause
