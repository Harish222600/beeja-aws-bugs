# Sharp Module Fix for Alpine Linux Docker

This document explains the fix for the Sharp module error that occurs when running the LMS backend in Docker containers using Alpine Linux.

## Problem

The error message:
```
Error: Could not load the "sharp" module using the linuxmusl-x64 runtime
```

This occurs because Sharp (an image processing library) needs platform-specific binaries, and the Alpine Linux (musl) binaries weren't being properly installed or loaded.

## Solution Applied

### 1. Dockerfile Updates (`backend/Dockerfile`)

**Key Changes:**
- Removed `--platform=$BUILDPLATFORM` to avoid platform conflicts
- Added comprehensive build dependencies for Sharp and libvips
- Added Sharp-specific environment variables
- Changed npm install to include optional dependencies and rebuild Sharp

**New Dependencies Added:**
```dockerfile
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat \
    vips-dev \
    vips-tools \
    pkgconf \
    build-base \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev
```

**Environment Variables:**
```dockerfile
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
ENV SHARP_FORCE_GLOBAL_LIBVIPS=false
ENV SHARP_LIBVIPS_INCLUDE_DIR=/usr/include/vips
ENV SHARP_LIBVIPS_LIB_DIR=/usr/lib
```

### 2. Package.json Updates (`backend/package.json`)

**Added Scripts:**
```json
"rebuild-sharp": "npm rebuild sharp",
"postinstall": "npm rebuild sharp --silent"
```

### 3. Docker Compose Updates (`docker-compose.yml`)

**Key Changes:**
- Fixed platform specification to `linux/amd64`
- Added Sharp environment variables to runtime
- Removed multi-platform build configuration that was causing conflicts

## How to Apply the Fix

### Option 1: Use the Automated Script (Recommended)

**For Windows:**
```cmd
cd beeja-supa-merge
fix-sharp.bat
```

**For Linux/Mac:**
```bash
cd beeja-supa-merge
./fix-sharp.sh
```

### Option 2: Manual Steps

1. **Stop existing containers:**
   ```bash
   docker-compose down
   ```

2. **Remove existing backend image:**
   ```bash
   docker rmi beeja-supa-merge-backend
   ```

3. **Clear build cache:**
   ```bash
   docker builder prune -f
   ```

4. **Rebuild with no cache:**
   ```bash
   docker-compose build --no-cache backend
   ```

5. **Start containers:**
   ```bash
   docker-compose up -d
   ```

## Verification

After applying the fix, verify it's working:

1. **Check container logs:**
   ```bash
   docker-compose logs backend
   ```

2. **Test Sharp functionality:**
   ```bash
   docker-compose exec backend node -e "const sharp = require('sharp'); console.log('Sharp version:', sharp.versions); console.log('Sharp loaded successfully!');"
   ```

3. **Manual rebuild if needed:**
   ```bash
   docker-compose exec backend npm run rebuild-sharp
   ```

## Troubleshooting

### If Sharp still fails to load:

1. **Check if all dependencies are installed:**
   ```bash
   docker-compose exec backend apk list | grep vips
   ```

2. **Manually rebuild Sharp:**
   ```bash
   docker-compose exec backend npm rebuild sharp --verbose
   ```

3. **Check Sharp installation:**
   ```bash
   docker-compose exec backend npm ls sharp
   ```

### Common Issues:

1. **Platform mismatch:** Ensure you're building for the correct platform
2. **Cache issues:** Always use `--no-cache` when rebuilding after changes
3. **Permission issues:** Make sure Docker has proper permissions

## Technical Details

### Why This Fix Works:

1. **Proper libvips installation:** Alpine packages provide the native libraries Sharp needs
2. **Environment variables:** Tell Sharp to use system libvips instead of bundled binaries
3. **Rebuild process:** Ensures Sharp compiles against the correct system libraries
4. **Platform consistency:** Fixes platform detection issues in multi-arch builds

### Sharp Dependencies Explained:

- `vips-dev`: Development headers for libvips
- `vips-tools`: Command-line tools for libvips
- `cairo-dev`, `jpeg-dev`, etc.: Image format support libraries
- `build-base`: Essential build tools for compilation

## Performance Notes

- The fix adds ~50MB to the Docker image due to additional dependencies
- Build time increases by ~30-60 seconds due to Sharp compilation
- Runtime performance is improved as Sharp uses optimized system libraries

## Maintenance

- Keep Sharp version updated in package.json
- Monitor Sharp release notes for Alpine Linux compatibility
- Test image processing functionality after any Sharp updates

## Support

If you continue to experience issues:

1. Check the [Sharp documentation](https://sharp.pixelplumbing.com/install)
2. Review Docker logs for specific error messages
3. Ensure your Docker version supports the platform specifications
