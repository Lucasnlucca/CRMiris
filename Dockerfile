# Multi-stage build para aplicação Iris Horizon CRM (Frontend SPA + Backend API Bridge)
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependências
COPY package*.json ./
RUN npm install

# Copiar código fonte
COPY . .

# Variáveis de ambiente para o build do Vite
ARG VITE_APPWRITE_URL=https://bancosupa-appwrite.grtbdz.easypanel.host/v1
ARG VITE_APPWRITE_PROJECT_ID=6a6cac620021f4c64b3f
ARG VITE_APPWRITE_DATABASE_ID=crm_db
ARG VITE_APPWRITE_BUCKET_ID=crm_attachments

ENV VITE_APPWRITE_URL=$VITE_APPWRITE_URL
ENV VITE_APPWRITE_PROJECT_ID=$VITE_APPWRITE_PROJECT_ID
ENV VITE_APPWRITE_DATABASE_ID=$VITE_APPWRITE_DATABASE_ID
ENV VITE_APPWRITE_BUCKET_ID=$VITE_APPWRITE_BUCKET_ID

# Compilar produção
RUN npm run build

# Stage final com Nginx e Node.js runtime para o Backend API Bridge
FROM node:20-alpine AS runner

RUN apk add --no-cache nginx

WORKDIR /app

# Copiar build estático para o Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar código do backend e dependências
COPY --from=builder /app/server /app/server
COPY --from=builder /app/package*.json /app/
COPY --from=builder /app/node_modules /app/node_modules

# Configuração do Nginx
COPY nginx.conf /etc/nginx/http.d/default.conf

# Script de inicialização supervisionada
COPY server/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 80 3000 4173

CMD ["/app/entrypoint.sh"]
