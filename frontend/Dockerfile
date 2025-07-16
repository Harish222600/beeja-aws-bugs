FROM node:18 AS build
WORKDIR /app
COPY package.json ./
RUN npm install --force
COPY . .

RUN npm run build

FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1
