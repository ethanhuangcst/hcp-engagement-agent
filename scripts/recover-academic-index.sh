#!/usr/bin/env bash
# feature-10（MKB2-04 / DEF-004）：学术索引损坏恢复 runbook（rag-design §20.2）。
# 语料全在盘上（data/rag/corpus/），清库后全量重灌，验收 ≤5 分钟恢复 28/28 ready。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SECONDS=0

echo "[1/5] 停 Qdrant"
pkill -f "tools/qdrant/qdrant" 2>/dev/null || true
for _ in $(seq 1 20); do
  pgrep -f "tools/qdrant/qdrant" >/dev/null 2>&1 || break
  sleep 0.5
done
pgrep -f "tools/qdrant/qdrant" >/dev/null 2>&1 && { echo "Qdrant 未退出，中止"; exit 1; }

echo "[2/5] 删存储目录 data/qdrant（WAL/shard 损坏不可恢复，全清重灌）"
rm -rf "$ROOT/data/qdrant"

echo "[3/5] 重启 Qdrant 并等就绪"
nohup "$ROOT/scripts/start-qdrant.sh" > "$ROOT/data/qdrant-recover.log" 2>&1 &
for _ in $(seq 1 60); do
  curl -sf http://127.0.0.1:6333/collections >/dev/null 2>&1 && break
  sleep 1
done
curl -sf http://127.0.0.1:6333/collections >/dev/null 2>&1 || { echo "Qdrant 未就绪，看 data/qdrant-recover.log"; exit 1; }

echo "[4/5] 重灌学术索引（语料在盘，--force --no-fetch），t=${SECONDS}s"
npm run seed:academic-batch -w @hca/medical-kb -- --force --no-fetch
echo "[4/5] 学术重灌完成，t=${SECONDS}s"

echo "[5/5] 重灌合规索引，t=${SECONDS}s"
npm run seed:compliance -w @hca/medical-kb
echo "[5/5] 合规重灌完成，t=${SECONDS}s"

echo "恢复完成，总耗时 ${SECONDS}s（验收 ≤300s）"
