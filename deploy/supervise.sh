#!/bin/bash
# supervise.sh — 用 tmux 拉起 hub 会话 + cc 会话,并监护:hub 不监听就重启、cc 会话没了就重开。
# 由 systemd 常驻(见 companion.service)。手动跑也行:bash deploy/supervise.sh
set -u

REPO="${REPO:-/path/to/this/repo}"        # ← 改成你的仓库路径
PORT="${CHANNEL_PORT:-3456}"
CLAUDE_BIN="${CLAUDE_BIN:-/usr/bin/claude}"
BUN_BIN="${BUN_BIN:-$HOME/.bun/bin/bun}"

start_hub() {
  echo "[supervise] starting hub"
  # .env 由 hub 自己读(或在此 export);hub 崩了 tmux 会话即退,监护循环会拉起
  tmux new-session -d -s hub "cd $REPO && exec $BUN_BIN run src/hub.ts"
}

start_cc() {
  echo "[supervise] starting cc"
  # HUB_CC=1:告诉 MCP server(src/server.ts)「这是主 cc 会话,允许接 bridge」。
  # 别的 claude -p 子进程不带这个变量 → 不抢 bridge(治多进程互踢导致的断连)。
  tmux new-session -d -s cc "cd $REPO && HUB_CC=1 exec $CLAUDE_BIN --permission-mode acceptEdits"
}

tmux start-server 2>/dev/null || true
start_hub
sleep 6
start_cc

# 监护循环
while true; do
  sleep 30
  if ! ss -tln 2>/dev/null | grep -q ":$PORT "; then
    echo "[supervise] hub not listening on $PORT → restart"
    tmux kill-session -t hub 2>/dev/null || true
    start_hub
    sleep 6
  fi
  if ! tmux has-session -t cc 2>/dev/null; then
    echo "[supervise] cc session gone → restart"
    start_cc
  fi
done
