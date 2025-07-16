# Docker Setup for LMS Backend

This guide explains how to run the LMS backend using Docker, including fixes for common issues like bcrypt architecture mismatch.

## Prerequisites

- Docker installed on your system
- Docker Compose installed on your system

## Quick Start (Recommended)

### 1. Automated Setup

Use the provided build scripts for easy setup:

**Linux/macOS:**
```bash
./docker-build.sh
```

**Windows:**
```cmd
docker-build.bat
```

These scripts will:
- Check Docker availability
- Create .env file from template if needed
- Clean up existing containers
- Build images with proper architecture support
- Start all services
- Verify health status

### 2. Manual Setup

If you prefer manual setup:

#### Environment Setup

Copy the environment template and configure your variables:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your actual configuration values:
- Supabase URL and keys
- JWT secret
- Email configuration
- Razorpay credentials (if using payments)

#### Build and Run

Start the entire stack (MongoDB + Backend):

```bash
# Clean build to fix bcrypt issues
docker-compose build --no-cache
docker-compose up -d
```

This will:
- Start MongoDB on port 27017
- Start the backend API on port 5001
- Create persistent volumes for data storage
- Rebuild native modules (like bcrypt) for correct architecture

### 3. Check Status

View running containers:
```bash
docker-compose ps
```

View logs:
```bash
# All services
docker-compose logs

# Backend only
docker-compose logs backend

# MongoDB only
docker-compose logs mongodb
```

### 4. Stop Services

```bash
docker-compose down
```

To also remove volumes (⚠️ this will delete all data):
```bash
docker-compose down -v
```

## Manual Docker Build

If you prefer to build and run the backend container manually:

### Build the Image

```bash
cd backend
docker build -t lms-backend .
```

### Run the Container

```bash
docker run -d \
  --name lms-backend \
  -p 5001:5001 \
  --env-file .env \
  lms-backend
```

## Environment Variables

Key environment variables that must be configured:

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URL` | MongoDB connection string | Yes |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `JWT_SECRET` | Secret for JWT token signing | Yes |
| `PORT` | Server port (default: 5001) | No |
| `NODE_ENV` | Environment (development/production) | No |

## Volumes

The Docker setup creates the following volumes:

- `mongodb_data`: Stores MongoDB data
- `backend_uploads`: Stores uploaded files

## Network

All services run on the `lms-network` bridge network, allowing them to communicate using service names.

## Health Checks

The backend container includes health checks that verify the API is responding correctly.

## Troubleshooting

### Container won't start
1. Check logs: `docker-compose logs backend`
2. Verify environment variables are set correctly
3. Ensure MongoDB is running and accessible

### Database connection issues
1. Verify MongoDB is running: `docker-compose ps`
2. Check MongoDB logs: `docker-compose logs mongodb`
3. Verify MONGODB_URL in .env file

### Port conflicts
If port 5001 or 27017 are already in use, modify the ports in `docker-compose.yml`:

```yaml
services:
  backend:
    ports:
      - "5002:5001"  # Change host port to 5002
  mongodb:
    ports:
      - "27018:27017"  # Change host port to 27018
```

### File upload issues
Ensure the uploads volume is properly mounted and the container has write permissions.

### bcrypt Architecture Mismatch Error

If you encounter the error:
```
Error: Error loading shared library /app/node_modules/bcrypt/lib/binding/napi-v3/bcrypt_lib.node: Exec format error
```

This indicates a CPU architecture mismatch. The updated Dockerfile fixes this by:

1. **Using Alpine Linux base image** with proper build tools
2. **Rebuilding native modules** during container build
3. **Platform-specific builds** using `--platform=$BUILDPLATFORM`
4. **Excluding host node_modules** via .dockerignore

**Solution:**
```bash
# Clean rebuild (recommended)
docker-compose down -v
docker system prune -f
docker-compose build --no-cache
docker-compose up -d

# Or use the automated script
./docker-build.sh  # Linux/macOS
docker-build.bat   # Windows
```

**Manual fix for existing containers:**
```bash
# Enter the container and rebuild bcrypt
docker-compose exec backend npm rebuild bcrypt --build-from-source
docker-compose restart backend
```

## Development

For development with hot reload, you can override the command:

```bash
docker-compose run --rm -p 5001:5001 backend npm run dev
```

Or modify the docker-compose.yml to use nodemon:

```yaml
services:
  backend:
    command: npm run dev
    volumes:
      - ./backend:/app
      - /app/node_modules
```

## Production Considerations

For production deployment:

1. Use environment-specific .env files
2. Set up proper secrets management
3. Configure reverse proxy (nginx)
4. Set up SSL/TLS certificates
5. Configure backup strategies for MongoDB
6. Monitor container health and logs
7. Set resource limits in docker-compose.yml

Example resource limits:
```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
