# Docker Frontend Fix - Password Reset Link Issue

## Problem
The password reset links sent via email were not working because:
1. Frontend service was missing from docker-compose.yml
2. Backend was generating reset URLs with incorrect FRONTEND_URL
3. Frontend container wasn't properly configured for SPA routing

## Solution Implemented

### 1. Added Frontend Service to Docker Compose
- Added `frontend` service to `docker-compose.yml`
- Configured proper networking between frontend and backend
- Set up health checks and resource limits

### 2. Updated Frontend Docker Configuration
- Created custom `nginx.conf` for proper SPA routing
- Updated `Dockerfile` to use custom nginx configuration
- Added health check endpoint at `/health`
- Installed curl for health checks

### 3. Fixed Environment Variables
- Set `FRONTEND_URL=http://localhost:5173` in backend environment
- This ensures password reset emails contain correct URLs

### 4. Network Configuration
- Frontend runs on port 5173 (mapped from container port 80)
- Backend runs on port 5001
- Both services are on the same Docker network for internal communication

## Files Modified

### New Files Created:
- `frontend/nginx.conf` - Custom nginx configuration for SPA routing
- `docker-rebuild.sh` - Linux/Mac rebuild script
- `docker-rebuild.bat` - Windows rebuild script
- `DOCKER_FRONTEND_FIX.md` - This documentation

### Modified Files:
- `docker-compose.yml` - Added frontend service and FRONTEND_URL environment variable
- `frontend/Dockerfile` - Updated to use custom nginx config and health checks

## How to Deploy

### Option 1: Using the rebuild script (Recommended)
```bash
# On Windows
docker-rebuild.bat

# On Linux/Mac
chmod +x docker-rebuild.sh
./docker-rebuild.sh
```

### Option 2: Manual commands
```bash
# Stop existing containers
docker-compose down

# Remove old images to force rebuild
docker rmi beeja-supa-merge-frontend beeja-supa-merge-backend

# Build and start containers
docker-compose up --build -d

# Check status
docker-compose ps
```

## Verification Steps

1. **Check all containers are running:**
   ```bash
   docker-compose ps
   ```
   All services should show "Up" status.

2. **Test frontend accessibility:**
   - Open browser to http://localhost:5173
   - Frontend should load properly

3. **Test password reset flow:**
   - Go to http://localhost:5173/forgot-password
   - Enter a valid email address
   - Check email for reset link
   - Click the reset link - it should now open the UpdatePassword page

4. **Check container logs if issues occur:**
   ```bash
   docker-compose logs frontend
   docker-compose logs backend
   ```

## Technical Details

### Frontend Container
- **Base Image:** nginx:alpine
- **Port Mapping:** 5173:80 (host:container)
- **Health Check:** GET /health endpoint
- **SPA Routing:** All routes fallback to index.html

### Backend Container
- **Environment:** FRONTEND_URL=http://localhost:5173
- **Password Reset URLs:** Now correctly point to containerized frontend

### Network Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │    MongoDB      │
│   (nginx:80)    │    │   (node:5001)   │    │   (mongo:27017) │
│   Port: 5173    │◄──►│   Port: 5001    │◄──►│   Port: 27017   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                        lms-network (bridge)
```

## Troubleshooting

### Frontend not loading
- Check if port 5173 is available: `netstat -an | findstr 5173`
- Check container logs: `docker-compose logs frontend`
- Verify nginx configuration: `docker exec lms-frontend cat /etc/nginx/conf.d/default.conf`

### Password reset links still not working
- Verify FRONTEND_URL in backend: `docker exec lms-backend env | grep FRONTEND_URL`
- Check backend logs for email sending: `docker-compose logs backend`
- Test the reset URL manually in browser

### Container build failures
- Clear Docker cache: `docker system prune -a`
- Check Dockerfile syntax
- Ensure all required files exist

## Security Considerations

- Frontend container runs nginx with security headers
- Health check endpoints don't expose sensitive information
- CORS is properly configured between frontend and backend
- Resource limits prevent container resource exhaustion

## Performance Optimizations

- Gzip compression enabled in nginx
- Static asset caching configured
- Container resource limits set appropriately
- Multi-stage Docker builds for smaller image sizes
