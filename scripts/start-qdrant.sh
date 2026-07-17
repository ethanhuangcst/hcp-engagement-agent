#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/tools/qdrant" "$ROOT/data/qdrant"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64|aarch64) ASSET=qdrant-aarch64-apple-darwin.tar.gz ;;
  x86_64) ASSET=qdrant-x86_64-apple-darwin.tar.gz ;;
  *) echo "unsupported arch $ARCH"; exit 1 ;;
esac
VER="${QDRANT_VERSION:-v1.14.1}"
URL="https://github.com/qdrant/qdrant/releases/download/${VER}/${ASSET}"
TGZ="$ROOT/tools/qdrant/qdrant.tgz"
if [[ ! -x "$ROOT/tools/qdrant/qdrant" ]]; then
  echo "Downloading $URL"
  curl -L --retry 5 --retry-delay 2 -o "$TGZ" "$URL"
  tar -xzf "$TGZ" -C "$ROOT/tools/qdrant"
  rm -f "$TGZ"
  # tarball may unpack flat or nested
  if [[ ! -x "$ROOT/tools/qdrant/qdrant" ]]; then
    find "$ROOT/tools/qdrant" -type f -name qdrant -perm +111 | head -1 | while read -r bin; do
      cp "$bin" "$ROOT/tools/qdrant/qdrant"
    done
  fi
  chmod +x "$ROOT/tools/qdrant/qdrant"
fi
export QDRANT__STORAGE__STORAGE_PATH="$ROOT/data/qdrant"
export QDRANT__SERVICE__HTTP_PORT=6333
export QDRANT__SERVICE__HOST=127.0.0.1
echo "Starting Qdrant on 127.0.0.1:6333 (storage=$QDRANT__STORAGE__STORAGE_PATH)"
exec "$ROOT/tools/qdrant/qdrant"
