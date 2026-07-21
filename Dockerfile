# Multi-stage build для NDT Ninja PWA
# Stage 1: Build (Node.js для сборки)
FROM node:24-alpine AS builder

WORKDIR /app

# Создаём чистый .npmrc с public registry (игнорируем хостовый конфиг)
RUN echo "registry=https://registry.npmjs.org/" > ~/.npmrc

# Копируем только зависимости сначала (лучшее кэширование layer'ов)
COPY package*.json ./

# package-lock.json содержит ссылки на Nexus — заменяем их на public registry
RUN sed -i 's|https://nexus\.rusoft\.iset-soft\.ru/repository/npm-proxy/|https://registry.npmjs.org/|g' package-lock.json

# Устанавливаем ВСЕ зависимости (включая dev — они нужны для сборки через Vite)
RUN npm install && npm cache clean --force

# Копируем исходники и собираем
COPY . .
RUN npm run build

# Удаляем node_modules после сборки (уменьшим размер образа)
RUN rm -rf node_modules

# Stage 2: Production (nginx для серва статики)
FROM nginx:alpine AS production

# Убираем дефолтный конфиг
RUN rm /etc/nginx/conf.d/default.conf

# Копируем custom nginx конфиг
COPY nginx.conf /etc/nginx/nginx.conf

# Копируем собранную статику из builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
