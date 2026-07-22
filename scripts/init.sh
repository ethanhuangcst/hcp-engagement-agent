#!/usr/bin/env bash
# Bootstrap HCP Engagement Assistant from a clean machine or existing clone.
#
#   bash scripts/init.sh
#   bash scripts/init.sh --clone-to ~/code/hcp-engagement-agent
#   npm run init
#
# Steps: git clone/pull → .env + data dirs → npm (npmmirror) + sharp → Qdrant binary
#        → build workspace → db:migrate → start qdrant / MCP / web
#
# Env overrides:
#   GIT_URL            default https://gitee.com/woodsw0rd/hcp-engagement-assistant.git
#   GIT_BRANCH         default main
#   NPM_REGISTRY       default https://registry.npmmirror.com
#   GITHUB_PROXY       default https://ghfast.top/  (Qdrant + optional sharp prebuild)
#   SHARP_LIBVIPS_HOST default https://npmmirror.com/mirrors/sharp-libvips
#   SHARP_BINARY_HOST  default https://npmmirror.com/mirrors/sharp
set -euo pipefail

GIT_URL="${GIT_URL:-https://gitee.com/woodsw0rd/hcp-engagement-assistant.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
GITHUB_PROXY="${GITHUB_PROXY:-https://ghfast.top/}"
SHARP_LIBVIPS_HOST="${SHARP_LIBVIPS_HOST:-https://npmmirror.com/mirrors/sharp-libvips}"
SHARP_BINARY_HOST="${SHARP_BINARY_HOST:-https://npmmirror.com/mirrors/sharp}"

SKIP_GIT=0
SKIP_INSTALL=0
SKIP_BUILD=0
SKIP_MIGRATE=0
SKIP_SEED=0
SKIP_START=0
CLONE_TO=""

usage() {
  cat <<'EOF'
Bootstrap HCP Engagement Assistant: git → mirror install (npm/sharp/Qdrant) → build → migrate → start.

  npm run init
  bash scripts/init.sh
  bash scripts/init.sh --clone-to ~/code/hcp-engagement-agent

Env: GIT_URL, GIT_BRANCH, NPM_REGISTRY, GITHUB_PROXY, SHARP_LIBVIPS_HOST, SHARP_BINARY_HOST

Flags:
  --clone-to DIR   Clone into DIR then init
  --skip-git       Do not clone/pull
  --skip-install   Skip npm + Qdrant binary download
  --skip-build     Skip npm run build
  --skip-migrate   Skip db:migrate
  --skip-seed      Skip rag:seed-compliance
  --no-seed        Same as --skip-seed
  --skip-start     Install/build only; do not start processes
  -h, --help       Show help

Stop: npm run stop
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --clone-to) CLONE_TO="${2:-}"; shift 2 ;;
    --skip-git) SKIP_GIT=1; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-migrate) SKIP_MIGRATE=1; shift ;;
    --skip-seed|--no-seed) SKIP_SEED=1; shift ;;
    --skip-start) SKIP_START=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage >&2; exit 1 ;;
  esac
done

log() { printf '\n==> %s\n' "$*"; }
die() { echo "error: $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "need command: $1"
}

resolve_root_from_script() {
  cd "$(dirname "$0")/.." && pwd
}

is_repo_root() {
  local dir="$1"
  [[ -f "$dir/package.json" ]] && grep -q '"name": "hcp-engagement-assistant"' "$dir/package.json" 2>/dev/null
}

ensure_repo() {
  if [[ -n "$CLONE_TO" ]]; then
    if [[ -d "$CLONE_TO/.git" ]] && is_repo_root "$CLONE_TO"; then
      log "Repo exists at $CLONE_TO — git pull ($GIT_BRANCH)"
      git -C "$CLONE_TO" fetch origin
      git -C "$CLONE_TO" checkout "$GIT_BRANCH"
      git -C "$CLONE_TO" pull --ff-only origin "$GIT_BRANCH" || true
      ROOT="$(cd "$CLONE_TO" && pwd)"
    else
      log "Cloning $GIT_URL ($GIT_BRANCH) → $CLONE_TO"
      mkdir -p "$(dirname "$CLONE_TO")"
      git clone -b "$GIT_BRANCH" "$GIT_URL" "$CLONE_TO"
      ROOT="$(cd "$CLONE_TO" && pwd)"
    fi
    return
  fi

  ROOT="$(resolve_root_from_script)"
  if ! is_repo_root "$ROOT"; then
    die "not inside hcp-engagement-assistant; use --clone-to DIR"
  fi
  if [[ "$SKIP_GIT" -eq 0 ]]; then
    log "git pull ($GIT_BRANCH) in $ROOT"
    if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      git -C "$ROOT" fetch origin 2>/dev/null || true
      git -C "$ROOT" checkout "$GIT_BRANCH" 2>/dev/null || true
      git -C "$ROOT" pull --ff-only origin "$GIT_BRANCH" 2>/dev/null \
        || git -C "$ROOT" pull --ff-only 2>/dev/null \
        || echo "warn: git pull skipped (offline or no upstream)"
    fi
  fi
}

ensure_env_and_dirs() {
  log "Ensure .env and data directories"
  cd "$ROOT"
  if [[ ! -f .env ]]; then
    cp .env.example .env
    echo "created .env from .env.example — edit DATABASE_URL before migrate/start if needed"
  fi
  mkdir -p \
    data/rag/corpus/academic \
    data/rag/corpus/compliance \
    data/rag/corpus/tenants \
    data/qdrant \
    tools/qdrant \
    .run/logs
}

# Export env that sharp install scripts read (bypass npm 10 unknown-config filter).
export_sharp_mirrors() {
  export npm_config_sharp_libvips_binary_host="$SHARP_LIBVIPS_HOST"
  export npm_config_sharp_binary_host="$SHARP_BINARY_HOST"
  export npm_config_registry="$NPM_REGISTRY"
}

clear_sharp_mirrors() {
  unset npm_config_sharp_libvips_binary_host npm_config_sharp_binary_host || true
}

repair_sharp_tree() {
  log "Repair sharp native bindings via mirrors"
  export_sharp_mirrors
  local dir script
  # shellcheck disable=SC2044
  while IFS= read -r script; do
    dir="$(dirname "$(dirname "$script")")"
    echo "  sharp @ $dir"
    (
      cd "$dir"
      if [[ -f install/libvips.js ]]; then
        node install/libvips.js || true
        [[ -f install/dll-copy.js ]] && node install/dll-copy.js || true
      fi
      # Prefer prebuild via GitHub proxy when npmmirror has no sharp prebuilds
      if command -v npx >/dev/null 2>&1; then
        host="${GITHUB_PROXY}"
        [[ "$host" != */ ]] && host="${host}/"
        npx --yes prebuild-install -r napi \
          --host "${host}https://github.com/lovell/sharp/releases/download" \
          2>/dev/null \
          || npx --yes prebuild-install 2>/dev/null \
          || true
      fi
      node -e "require('sharp'); console.log('    ok', require('./package.json').version)" 2>/dev/null \
        || echo "    warn: sharp still unloadable at $dir (Next image / Xenova may fail until fixed)"
    )
  done < <(find "$ROOT/node_modules" -path '*/sharp/install/libvips.js' 2>/dev/null | sort -u)
}

install_npm_deps() {
  log "npm install (registry=$NPM_REGISTRY)"
  cd "$ROOT"
  export_sharp_mirrors
  # npm 10+ ignores unknown sharp_* in .npmrc; install JS first, then repair natives.
  if ! npm install --registry="$NPM_REGISTRY" --foreground-scripts; then
    echo "warn: npm install with scripts failed — retry with --ignore-scripts + sharp repair"
    npm install --registry="$NPM_REGISTRY" --ignore-scripts
  fi
  repair_sharp_tree
  clear_sharp_mirrors
}

install_qdrant() {
  log "Download Qdrant binary (mirror)"
  cd "$ROOT"
  GITHUB_PROXY="$GITHUB_PROXY" QDRANT_DOWNLOAD_ONLY=1 bash "$ROOT/scripts/start-qdrant.sh"
}

build_packages() {
  log "Build workspace packages (dist/)"
  cd "$ROOT"
  npm run build
}

env_needs_db_secret() {
  grep -qE 'YOUR_PASSWORD|postgres:YOUR_|DATABASE_URL=$' "$ROOT/.env" 2>/dev/null
}

run_migrate() {
  log "db:migrate"
  cd "$ROOT"
  if env_needs_db_secret; then
    echo "warn: DATABASE_URL still a placeholder — skip migrate. Edit .env then: npm run db:migrate"
    return 0
  fi
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  npm run db:migrate
}

wait_http() {
  local url="$1" name="$2" tries="${3:-60}"
  local i=0
  while [[ $i -lt $tries ]]; do
    # --max-time: avoid hanging forever if a process accepts TCP but never responds
    if curl -sf --connect-timeout 2 --max-time 15 "$url" >/dev/null 2>&1; then
      echo "  $name ready ($url)"
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "warn: $name not ready after ${tries}s ($url)" >&2
  return 1
}

start_bg() {
  local name="$1"
  shift
  local logf="$ROOT/.run/logs/${name}.log"
  local pidf="$ROOT/.run/${name}.pid"
  if [[ -f "$pidf" ]] && kill -0 "$(cat "$pidf")" 2>/dev/null; then
    echo "  $name already running pid=$(cat "$pidf")"
    return 0
  fi
  # Detach from the init shell (macOS has no setsid; nohup + disown)
  nohup "$@" >"$logf" 2>&1 < /dev/null &
  echo $! >"$pidf"
  disown "$(cat "$pidf")" 2>/dev/null || true
  echo "  started $name pid=$(cat "$pidf") log=$logf"
}

start_services() {
  log "Start services"
  cd "$ROOT"
  if env_needs_db_secret; then
    echo "warn: DATABASE_URL still a placeholder — starting Qdrant only; MCP/Web need a real .env"
    export GITHUB_PROXY
    start_bg qdrant bash "$ROOT/scripts/start-qdrant.sh"
    wait_http "http://127.0.0.1:6333/readyz" "qdrant" 45 || wait_http "http://127.0.0.1:6333/" "qdrant" 15 || true
    echo "Edit $ROOT/.env then re-run: npm run init -- --skip-git --skip-install --skip-build"
    return 0
  fi
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  export HCA_DATA_DIR="${HCA_DATA_DIR:-$ROOT/data}"
  export MCP_TRANSPORT="${MCP_TRANSPORT:-http}"
  export MCP_PORT="${MCP_PORT:-3200}"
  export GITHUB_PROXY

  start_bg qdrant bash "$ROOT/scripts/start-qdrant.sh"
  wait_http "http://127.0.0.1:6333/readyz" "qdrant" 45 || wait_http "http://127.0.0.1:6333/" "qdrant" 15 || true

  if [[ "$SKIP_SEED" -eq 0 ]]; then
    log "Seed compliance corpus → Qdrant"
    npm run rag:seed-compliance || echo "warn: seed failed (Qdrant/embedding); continue"
  fi

  start_bg mcp npm run dev:hcp-twin-mcp
  wait_http "http://127.0.0.1:${MCP_PORT}/health" "hcp-twin-mcp" 60 || true

  start_bg web npm run dev:web
  # Prefer /twins (lighter than marketing /) and allow first Turbopack compile
  wait_http "http://127.0.0.1:3001/twins" "web" 120 || true

  cat <<EOF

Services
  Qdrant     http://127.0.0.1:6333
  MCP        http://127.0.0.1:${MCP_PORT}/mcp  (health: /health)
  Web        http://127.0.0.1:3001

Logs        $ROOT/.run/logs/
Stop        bash scripts/stop.sh
EOF
}

main() {
  require_cmd git
  require_cmd node
  require_cmd npm
  require_cmd curl

  local node_major
  node_major="$(node -p "process.versions.node.split('.')[0]")"
  [[ "$node_major" -ge 20 ]] || die "Node >= 20 required (found $(node -v))"

  ensure_repo
  ensure_env_and_dirs

  if [[ "$SKIP_INSTALL" -eq 0 ]]; then
    install_npm_deps
    install_qdrant
  fi
  if [[ "$SKIP_BUILD" -eq 0 ]]; then
    build_packages
  fi
  if [[ "$SKIP_MIGRATE" -eq 0 ]]; then
    run_migrate || echo "warn: migrate failed — fix DATABASE_URL and re-run: npm run db:migrate"
  fi
  if [[ "$SKIP_START" -eq 0 ]]; then
    start_services
  else
    log "Done (start skipped). Next: npm run start:qdrant & npm run dev:hcp-twin-mcp & npm run dev:web"
  fi
}

main
