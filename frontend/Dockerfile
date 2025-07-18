FROM node:18

WORKDIR /app

COPY . .

# Increase memory limit
ENV NODE_OPTIONS="--max-old-space-size=2048"

RUN npm install
RUN npm run build

FROM nginx:alpine
COPY --from=0 /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1
