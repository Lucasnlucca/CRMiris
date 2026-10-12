#!/bin/sh
set -e

echo "=================================================="
echo "Iniciando Iris Horizon CRM - Produção Segura"
echo "Data/Hora: $(date -u)"
echo "=================================================="

# 1. Iniciar o Backend API Bridge Node.js na porta 3001 em background
echo "[1/2] Iniciando Backend API Bridge (porta 3001)..."
node /app/server/server.cjs &
BRIDGE_PID=$!

# Aguarda inicialização do bridge
sleep 1

# 2. Iniciar o Nginx (porta 80 / 3000 / 4173)
echo "[2/2] Iniciando Nginx Reverse Proxy..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Tratamento de sinais para desligamento gracioso
trap 'echo "Encerrando contêiner..."; kill -TERM $BRIDGE_PID $NGINX_PID 2>/dev/null; exit 0' SIGTERM SIGINT

# Monitorar ambos os processos de forma compatível com Alpine/Busybox
while kill -0 $BRIDGE_PID 2>/dev/null && kill -0 $NGINX_PID 2>/dev/null; do
    sleep 2
done

echo "Alerta: Um dos processos encerrou. Finalizando contêiner para reinicialização pelo orchestrator..."
kill -TERM $BRIDGE_PID $NGINX_PID 2>/dev/null || true
exit 1
