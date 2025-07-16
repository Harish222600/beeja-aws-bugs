# Use specific platform for consistent builds
FROM node:18-alpine

# Install build dependencies for native modules including Sharp
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

# Set working directory
WORKDIR /app

# Set environment variables for Sharp and node-gyp
ENV PYTHON=/usr/bin/python3
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
ENV SHARP_FORCE_GLOBAL_LIBVIPS=false
ENV SHARP_LIBVIPS_INCLUDE_DIR=/usr/include/vips
ENV SHARP_LIBVIPS_LIB_DIR=/usr/lib

# Copy package files first for better caching
COPY package*.json ./

# Clear npm cache and install dependencies with Sharp rebuild
RUN npm cache clean --force && \
    npm ci --only=production --include=optional && \
    npm rebuild sharp --verbose

# Copy application code (node_modules excluded via .dockerignore)
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5001/', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["npm","start"]
