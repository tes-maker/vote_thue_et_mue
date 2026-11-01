#!/bin/sh
set -eu

: "${PGHOST:?Configurez PGHOST}"
: "${PGPORT:=5432}"
: "${PGDATABASE:?Configurez PGDATABASE}"
: "${PGUSER:?Configurez PGUSER}"
: "${PGPASSFILE:?Configurez PGPASSFILE}"
export PGPORT

backup_dir=/var/backups/vote-cm
umask 077
mkdir -p "$backup_dir"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary=$(mktemp "$backup_dir/.votes-$stamp.XXXXXX")
backup="$backup_dir/votes-$stamp-${temporary##*.}.dump"
trap 'rm -f -- "$temporary"' EXIT HUP INT TERM

pg_dump --no-password --format=custom --file="$temporary" "$PGDATABASE"
pg_restore --list "$temporary" >/dev/null
mv -- "$temporary" "$backup"
find "$backup_dir" -maxdepth 1 -type f -name 'votes-*.dump' -mtime +30 -delete
