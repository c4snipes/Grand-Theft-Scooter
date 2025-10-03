# ---- build stage ----
FROM node:20 AS build
WORKDIR /app

# Copy manifest(s) first for better layer caching
COPY package.json package-lock.json* ./

# Install deps: use npm ci if lockfile exists, else npm install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Bring in the rest of the app and build
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
