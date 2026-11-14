#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
usage() {
  cat <<'HELP'
Usage: ./scripts/docker.sh [up|down|restart|build|logs|status|smoke|help]
  up       Build and launch on localhost:3000; wait until healthy (default).
  down     Stop containers; keep all verification data and reports.
  restart  Restart the existing service without rebuilding or deleting data.
  build    Build the local application image.
  logs     Follow application logs (Ctrl-C only stops following).
  status   Show container readiness and published port.
  smoke    Execute two genuine offline demo runs and check report downloads.

First use creates a private .env.docker from .env.docker.example.
Edit it for an optional 8090 key, login password, or different host port.
Requires Docker with Compose v2.20+ (Docker Desktop recommended).
INVARIANT_DOCKER_ENV_FILE selects another environment file.
COMPOSE_PROJECT_NAME selects another isolated Compose project/volume.
HELP
}
action="${1:-up}"
case "$action" in help|-h|--help) usage; exit 0 ;; up|down|restart|build|logs|status|smoke) ;; *) usage >&2; exit 2 ;; esac
if ! command -v docker >/dev/null 2>&1; then echo "Install/start Docker Desktop (or Docker Engine with Compose)." >&2; exit 1; fi
if ! docker compose version >/dev/null 2>&1; then echo "Docker Compose v2.20+ is required; install the Compose plugin." >&2; exit 1; fi
if ! docker info >/dev/null 2>&1; then echo "Docker is not running. Start Docker Desktop/the Docker daemon." >&2; exit 1; fi
ENV_FILE="${INVARIANT_DOCKER_ENV_FILE:-$ROOT/.env.docker}"
if [[ ! -f "$ENV_FILE" ]]; then
  (umask 077; cp "$ROOT/.env.docker.example" "$ENV_FILE")
  echo "Created $ENV_FILE (no API key required for built-in demos)."
fi
# Never copy .git or a developer credential file into the image.
if command -v git >/dev/null 2>&1 && revision="$(git -C "$ROOT" rev-parse --verify HEAD 2>/dev/null)"; then
  export INVARIANT_SOURCE_COMMIT="$revision"
  if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then export INVARIANT_SOURCE_DIRTY=true; else export INVARIANT_SOURCE_DIRTY=false; fi
else
  export INVARIANT_SOURCE_COMMIT=unknown INVARIANT_SOURCE_DIRTY=unknown
fi
compose=(docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" -f "$ROOT/compose.yaml")
# Validate without printing configuration: config output can reveal runtime secrets.
"${compose[@]}" config --quiet
case "$action" in
  up) "${compose[@]}" up --build --detach --wait --wait-timeout 120; "${compose[@]}" ps; echo "Ready. Use localhost and the published host port above (default http://localhost:3000)." ;;
  down) "${compose[@]}" down; echo "Stopped. Verification data remains in the named volume." ;;
  restart) "${compose[@]}" restart; "${compose[@]}" up --detach --wait --wait-timeout 120 ;;
  build) "${compose[@]}" build ;;
  logs) "${compose[@]}" logs --follow --tail 100 ;;
  status) "${compose[@]}" ps ;;
  smoke) "${compose[@]}" exec -T invariant node docker/smoke.mjs ;;
esac
