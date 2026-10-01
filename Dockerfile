# Multi-stage build para aplicação Vite + React
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependências
COPY package*.json ./
RUN npm ci

# Copiar código fonte
COPY . .

# Variáveis de ambiente para o build do Vite
ARG VITE_APPWRITE_URL=https://bancosupa-appwrite.grtbdz.easypanel.host/v1
ARG VITE_APPWRITE_PROJECT_ID=6a6cac620021f4c64b3f
ARG VITE_APPWRITE_DATABASE_ID=crm_db

ENV VITE_APPWRITE_URL=$VITE_APPWRITE_URL
ENV VITE_APPWRITE_PROJECT_ID=$VITE_APPWRITE_PROJECT_ID
ENV VITE_APPWRITE_DATABASE_ID=$VITE_APPWRITE_DATABASE_ID

# Compilar produção
RUN npm run build

# Stage final com Nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
