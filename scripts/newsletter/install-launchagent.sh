#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST_PATH="$HOME/Library/LaunchAgents/ai.bluelava.newsletter.plist"
LOG_FILE="$HOME/.newsletter-blue-lava.log"
NODE_BIN="/opt/homebrew/bin/node"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>ai.bluelava.newsletter</string>

    <key>ProgramArguments</key>
    <array>
      <string>$NODE_BIN</string>
      <string>scripts/newsletter/send-newsletter.mjs</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$REPO_DIR</string>

    <key>StartCalendarInterval</key>
    <dict>
      <key>Weekday</key>
      <integer>2</integer>
      <key>Hour</key>
      <integer>8</integer>
      <key>Minute</key>
      <integer>0</integer>
    </dict>

    <key>EnvironmentVariables</key>
    <dict>
      <key>HOME</key>
      <string>$HOME</string>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
      <key>TZ</key>
      <string>Europe/Lisbon</string>
      <key>NODE_EXTRA_CA_CERTS</key>
      <string>$HOME/.npm/macos-system-certs.pem</string>
      <key>NODE_USE_SYSTEM_CA</key>
      <string>1</string>
    </dict>

    <key>StandardOutPath</key>
    <string>$LOG_FILE</string>
    <key>StandardErrorPath</key>
    <string>$LOG_FILE</string>
  </dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/ai.bluelava.newsletter" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl kickstart -k "gui/$(id -u)/ai.bluelava.newsletter" || true

echo "✅ Weekly schedule installed with launchd (Monday 08:00 Europe/Lisbon)"
echo "Agent: $PLIST_PATH"
echo "Log: $LOG_FILE"
