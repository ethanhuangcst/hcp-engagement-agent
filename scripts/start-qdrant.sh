#!/usr/bin/env bash
# Download (via optional GitHub proxy) and run local Qdrant on 127.0.0.1:6333.
# Env:
#   QDRANT_VERSION   default v1.14.1
#   GITHUB_PROXY     e.g. https://ghfast.top/  (prefix for github.com URLs)
#   QDRANT_DOWNLOAD_ONLY=1  download binary only, do not exec
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/tools/qdrant" "$ROOT/data/qdrant"

ARCH="$(uname -m)"
OS="$(uname -s)"
case "$OS/$ARCH" in
  Darwin/arm64|Darwin/aarch64) ASSET=qdrant-aarch64-apple-darwin.tar.gz ;;
  Darwin/x86_64) ASSET=qdrant-x86_64-apple-darwin.tar.gz ;;
  Linux/x86_64|Linux/amd64) ASSET=qdrant-x86_64-unknown-linux-gnu.tar.gz ;;
  Linux/aarch64|Linux/arm64) ASSET=qdrant-aarch64-unknown-linux-gnu.tar.gz ;;
  *)
    echo "unsupported platform $OS/$ARCH (use Docker: qdrant/qdrant:${QDRANT_VERSION:-v1.14.1})" >&2
    exit 1
    ;;
esac

VER="${QDRANT_VERSION:-v1.14.1}"
UPSTREAM="https://github.com/qdrant/qdrant/releases/download/${VER}/${ASSET}"
# ghfast / ghproxy style: PREFIX + full https://github.com/... URL
PROXY="${GITHUB_PROXY:-https://ghfast.top/}"
[[ -n "$PROXY" && "$PROXY" != */ ]] && PROXY="${PROXY}/"
if [[ "${USE_GITHUB_DIRECT:-0}" == "1" || -z "$PROXY" ]]; then
  URL="$UPSTREAM"
else
  URL="${PROXY}${UPSTREAM}"
fi
URL="${QDRANT_DOWNLOAD_URL:-$URL}"

BIN="$ROOT/tools/qdrant/qdrant"
TGZ="$ROOT/tools/qdrant/qdrant.tgz"

download_qdrant() {
  echo "Downloading Qdrant ${VER} (${ASSET})"
  echo "  url: $URL"
  if ! curl -fL --retry 5 --retry-delay 2 --connect-timeout 30 -o "$TGZ" "$URL"; then
    echo "Mirror/proxy download failed; retrying upstream GitHub…" >&2
    curl -fL --retry 5 --retry-delay 2 --connect-timeout 30 -o "$TGZ" "$UPSTREAM"
  fi
  tar -xzf "$TGZ" -C "$ROOT/tools/qdrant"
  rm -f "$TGZ"
  if [[ ! -x "$BIN" ]]; then
    found="$(find "$ROOT/tools/qdrant" -type f -name qdrant 2>/dev/null | head -1 || true)"
    if [[ -n "$found" ]]; then
      cp "$found" "$BIN"
    fi
  fi
  chmod +x "$BIN"
  [[ -x "$BIN" ]] || {
    echo "qdrant binary missing after extract" >&2
    exit 1
  }
}

if [[ ! -x "$BIN" ]]; then
  download_qdrant
fi

if [[ "${QDRANT_DOWNLOAD_ONLY:-0}" == "1" ]]; then
  echo "Qdrant binary ready: $BIN"
  exit 0
fi

export QDRANT__STORAGE__STORAGE_PATH="$ROOT/data/qdrant"
export QDRANT__SERVICE__HTTP_PORT=6333
export QDRANT__SERVICE__HOST=127.0.0.1
echo "Starting Qdrant on 127.0.0.1:6333 (storage=$QDRANT__STORAGE__STORAGE_PATH)"
exec "$BIN"
