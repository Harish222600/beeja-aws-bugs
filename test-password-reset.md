# Password Reset Fix - Testing Guide

## What was fixed:
1. **Created nginx.conf** - Added proper SPA routing configuration to handle `/update-password/:token` routes
2. **Updated Dockerfile** - Already configured to copy nginx.conf to container
3. **Fixed healthcheck** - Added `/health` endpoint in nginx configuration

## The Problem:
- When users clicked password reset links like `http://localhost:5173/update-password/abc123`, nginx returned empty response
- This happened because nginx tried to find a physical file at `/update-password/abc123` instead of serving the React app
- The fix adds `try_files $uri $uri/ /index.html;` which tells nginx to serve index.html for any route that doesn't exist as a physical file

## To test the fix:

### Step 1: Rebuild the frontend container
```bash
# Stop the current containers
docker-compose down

# Rebuild only the frontend service
docker-compose build frontend

# Start all services
docker-compose up -d
```

### Step 2: Test the password reset flow
1. Go to `http://localhost:5173/forgot-password`
2. Enter your email address
3. Check your email for the reset link
4. Click the reset link - it should now open the password reset page instead of showing an empty response

### Step 3: Verify other routes still work
- `http://localhost:5173/` - Home page
- `http://localhost:5173/login` - Login page  
- `http://localhost:5173/courses` - Courses page
- `http://localhost:5173/update-password/test123` - Should show the password reset form

## Key nginx configuration added:
```nginx
# Handle all routes - SPA fallback
location / {
    try_files $uri $uri/ /index.html;
}

# Specific handling for update-password routes
location ~* ^/update-password/.* {
    try_files $uri /index.html;
}

# Health check endpoint
location /health {
    return 200 "healthy\n";
}
```

This configuration ensures that:
- Static files (JS, CSS, images) are served directly
- API calls can be proxied to backend if needed
- All other routes (including `/update-password/:token`) serve the React app
- Health checks work properly for Docker
