#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
NODE_BIN="$(command -v node)"
LOG_FILE="$HOME/.newsletter-blue-lava.log"
TARGET="scripts/newsletter/send-newsletter.mjs"

CRON_LINE="0 8 * * 1 cd $REPO_DIR && NODE_EXTRA_CA_CERTS=$HOME/.npm/macos-system-certs.pem NODE_USE_SYSTEM_CA=1 $NODE_BIN $TARGET >> $LOG_FILE 2>&1"

TMP_FILE="$(mktemp)"
{
  crontab -l 2>/dev/null | grep -v "$TARGET" | grep -v "CRON_TZ=Europe/Lisbon" || true
  echo "CRON_TZ=Europe/Lisbon"
  echo "$CRON_LINE"
} > "$TMP_FILE"

crontab "$TMP_FILE"
rm -f "$TMP_FILE"

echo "✅ Weekly schedule installed: Monday 08:00 Europe/Lisbon"
echo "Log file: $LOG_FILE"
