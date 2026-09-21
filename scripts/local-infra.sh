#!/usr/bin/env bash
# Starts Postgres and Redis for local development without Homebrew services.
#
#   scripts/local-infra.sh start    start both, create the databases if missing
#   scripts/local-infra.sh stop     stop both
#   scripts/local-infra.sh status   say what is running
#
# Why this exists: `brew services` runs under launchd, which fails in ways that
# have nothing to do with this project (a stale plist, a different user owning
# the data directory). Running the two servers directly from a directory inside
# the repo removes the dependency on either, and the data survives a restart.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/.tooling/pgdata"
LOG_DIR="$ROOT/.tooling/logs"
PORT_PG=5432
PORT_REDIS=6379

# Homebrew's Postgres is keg-only, so its binaries are not on PATH by default.
for dir in /opt/homebrew/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@17/bin \
  /usr/local/opt/postgresql@16/bin /opt/homebrew/bin /usr/local/bin; do
  [ -d "$dir" ] && PATH="$dir:$PATH"
done

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing '$1'. Install it with: brew install postgresql@16 redis" >&2
    exit 1
  }
}

pg_up() { pg_isready -q -h localhost -p "$PORT_PG"; }
redis_up() { redis-cli -p "$PORT_REDIS" ping >/dev/null 2>&1; }

start() {
  need initdb; need pg_ctl; need psql; need redis-server; need redis-cli
  mkdir -p "$LOG_DIR"

  if ! redis_up; then
    redis-server --port "$PORT_REDIS" --daemonize yes --dir "$LOG_DIR" >/dev/null
    echo "redis: started on $PORT_REDIS"
  else
    echo "redis: already running"
  fi

  if pg_up; then
    echo "postgres: already running on $PORT_PG"
  else
    if [ ! -f "$DATA/PG_VERSION" ]; then
      initdb -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null
      echo "postgres: initialised $DATA"
    fi
    # timezone=UTC is load-bearing; see the README's note on the connection string.
    # max_connections matches docker-compose.yml: the clustered API and the load
    # test open more concurrent connections than the default 100 allows, and the
    # failure ("too many clients already") looks like an application fault.
    pg_ctl -D "$DATA" -l "$LOG_DIR/postgres.log" -w \
      -o "-p $PORT_PG -k /tmp -c timezone=UTC -c max_connections=300" start >/dev/null
    echo "postgres: started on $PORT_PG"
  fi

  psql -h localhost -p "$PORT_PG" -U postgres -d postgres -qtAc \
    "SELECT 1 FROM pg_roles WHERE rolname='ticketing'" | grep -q 1 ||
    psql -h localhost -p "$PORT_PG" -U postgres -d postgres -q \
      -c "CREATE ROLE ticketing SUPERUSER LOGIN PASSWORD 'ticketing'"

  for db in ticketing ticketing_test; do
    psql -h localhost -p "$PORT_PG" -U postgres -d postgres -qtAc \
      "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 ||
      psql -h localhost -p "$PORT_PG" -U postgres -d postgres -q \
        -c "CREATE DATABASE $db OWNER ticketing"
  done
  echo "ready. Next: npm run db:migrate && npm run db:seed"
}

stop() {
  if [ -f "$DATA/postmaster.pid" ]; then pg_ctl -D "$DATA" -m fast stop >/dev/null && echo "postgres: stopped"; fi
  if redis_up; then redis-cli -p "$PORT_REDIS" shutdown nosave 2>/dev/null || true; echo "redis: stopped"; fi
}

status() {
  if pg_up; then echo "postgres: up"; else echo "postgres: down"; fi
  if redis_up; then echo "redis: up"; else echo "redis: down"; fi
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *) echo "usage: $0 start|stop|status" >&2; exit 2 ;;
esac
