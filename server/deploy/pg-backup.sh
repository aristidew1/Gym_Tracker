#!/usr/bin/env bash
# Daily Postgres backup, run by gymtracker-backup.timer.
# Dumps locally, ships off-box, then prunes local dumps older than 14 days.
#
# TODO before first real deploy: fill in the off-box destination (an
# rclone remote for B2/S3, or `scp` to a second box) — a backup that never
# leaves this VPS does not survive disk failure or losing the account.
set -euo pipefail

BACKUP_DIR="/var/backups/gymtracker"
DB_NAME="gymtracker"
DB_USER="gymtracker"
DATE=$(date +%F)
DUMP_FILE="$BACKUP_DIR/gymtracker-$DATE.dump"

mkdir -p "$BACKUP_DIR"
pg_dump -Fc -U "$DB_USER" -h localhost "$DB_NAME" > "$DUMP_FILE"

# --- off-box copy: fill this in ---
# rclone copy "$DUMP_FILE" remote:gymtracker-backups/
# --- end off-box copy ---

find "$BACKUP_DIR" -name 'gymtracker-*.dump' -mtime +14 -delete

echo "Backup complete: $DUMP_FILE"
