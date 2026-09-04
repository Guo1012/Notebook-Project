#!/usr/bin/env bash
# Lumen 本地开发一键启动：notebook-service / runtime-service / runtime-gateway / frontend
#
# 用法:
#   ./dev.sh          启动全部四个进程（前台，Ctrl+C 全部停止）
#   ./dev.sh stop     停掉四个端口上已有的进程
#
# 端口约定:
#   8000  notebook-service  (document plane，factory 模式)
#   8100  runtime-service   (runtime control plane)
#   8200  runtime-gateway   (jupyter 代理)
#   5173  frontend          (vite dev)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$ROOT/.venv"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"

PORT_TO_NAME=(8000:notebook-service 8100:runtime-service 8200:runtime-gateway 5173:frontend)

port_pid() {
  # -sTCP:LISTEN 只匹配监听进程，避免误匹配到「已建立连接」的客户端进程
  lsof -ti tcp:"$1" -sTCP:LISTEN 2>/dev/null | head -1 || true
}

stop_all() {
  echo "==> 停止所有服务"
  for entry in "${PORT_TO_NAME[@]}"; do
    local port="${entry%%:*}"
    local pid
    pid="$(port_pid "$port")"
    if [[ -n "$pid" ]]; then
      echo "    停止 $entry (pid $pid)"
      kill "$pid" 2>/dev/null || true
    fi
  done
}

if [[ "${1:-}" == "stop" ]]; then
  stop_all
  exit 0
fi

# 若对应端口已被占用则跳过，避免重复启动
declare -a STARTED_PIDS=()

start_service() {
  local name="$1" port="$2"
  shift 2
  if [[ -n "$(port_pid "$port")" ]]; then
    echo "==> $name 已在端口 $port 运行，跳过"
    return
  fi
  echo "==> 启动 $name (:$port)"
  "$@" >> "$LOGS/$name.log" 2>&1 &
  STARTED_PIDS+=($!)
}

cleanup() {
  echo ""
  echo "==> 停止本次启动的进程"
  for pid in "${STARTED_PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup INT TERM

# 1) notebook-service —— factory 模式，必须带 --factory（main.py 无模块级 app）
start_service notebook-service 8000 \
  bash -c "cd '$ROOT/notebook-service' && exec '$VENV/bin/uvicorn' app.main:create_app --factory --host 127.0.0.1 --port 8000"

# 2) runtime-service
start_service runtime-service 8100 \
  bash -c "cd '$ROOT/runtime-service' && exec '$VENV/bin/uvicorn' app.main:app --host 127.0.0.1 --port 8100"

# 3) runtime-gateway
start_service runtime-gateway 8200 \
  bash -c "cd '$ROOT/runtime-gateway' && exec '$VENV/bin/uvicorn' app.main:app --host 127.0.0.1 --port 8200"

# 4) frontend (vite dev)
start_service frontend 5173 \
  bash -c "cd '$ROOT/frontend' && exec npm run dev -- --host 127.0.0.1"

echo ""
echo "=============================================="
echo "  已就绪，浏览器打开 http://localhost:5173"
echo "  各服务日志见 $LOGS/*.log"
echo "  按 Ctrl+C 停止本次启动的全部进程"
echo "=============================================="
echo ""

wait
