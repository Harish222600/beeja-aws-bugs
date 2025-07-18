FROM node:18 as builder

WORKDIR /app

COPY package*.json ./
# Install all dependencies including devDependencies for build
RUN npm ci

COPY . .

# Increase memory limit for build
ENV NODE_OPTIONS="--max-old-space-size=2048"

RUN npm run build

# Production stage - lightweight nginx for serving static files
FROM nginx:1.25-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built assets to nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration (will be overridden by docker-compose volume mount)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create volume mount point for sharing with reverse proxy
VOLUME ["/usr/share/nginx/html"]

# Create non-root user for security
RUN addgroup -g 1001 -S nginx && \
    adduser -S nginx -u 1001 -G nginx

# Change ownership of nginx directories
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d

# Switch to non-root user
USER nginx

EXPOSE 80

# Enhanced health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
