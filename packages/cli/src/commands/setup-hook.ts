import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Claude Code's settings.json hooks structure:
// {
//   "hooks": {
//     "Stop": [ { "hooks": [{ "type": "command", "command": "..." }] } ]
//   }
// }
//
// Stop hooks fire after every Claude response turn and receive via stdin:
//   { "session_id": "...", "transcript_path": "/path/to/transcript.jsonl" }
//
// The script scans the transcript for rate-limit system messages and writes
// ~/.claude/abtop-rate-limits.json in the format the Waymark rate-limit
// collector expects.

const HOOK_COMMAND = path.join(os.homedir(), '.claude', 'waymark-rate-limit-hook');

// Matches lines like: "5h window 34% used, resets at 2026-05-15T18:00:00Z"
// or: "Rate limit: 5h 34% resets 1715790000"
const HOOK_SCRIPT = `#!/bin/bash
# Waymark rate-limit Stop hook — installed by: waymark setup-hook
# Reads the Claude transcript after each response, extracts rate-limit info,
# and writes ~/.claude/abtop-rate-limits.json for the Waymark dashboard.

set -euo pipefail

OUTPUT="$HOME/.claude/abtop-rate-limits.json"

# Read the hook payload from stdin
PAYLOAD="$(cat)"
TRANSCRIPT_PATH="$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('transcript_path',''))" 2>/dev/null || true)"

if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# Scan last 200 lines for rate-limit system messages
# Matches patterns like: "5h window 34% used, resets at 2026-05-15T18:00:00Z"
#                     or: "[Rate limit: 5h 34% used resets_at 1715790000]"
LAST_LINES="$(tail -n 200 "$TRANSCRIPT_PATH" 2>/dev/null || true)"

PCT=""
RESETS=""

# Try to extract 5h usage percentage
PCT="$(echo "$LAST_LINES" | grep -oP '5h[^0-9]*\K[0-9]+(?=%)' | tail -1 || true)"
RESETS="$(echo "$LAST_LINES" | grep -oP 'resets.at.?\K[0-9T:Z.+-]+' | tail -1 || true)"

if [ -z "$PCT" ]; then
  exit 0
fi

# Convert ISO resets_at to unix timestamp if needed
RESETS_EPOCH=0
if echo "$RESETS" | grep -qE '^[0-9]{10}$'; then
  RESETS_EPOCH="$RESETS"
elif [ -n "$RESETS" ]; then
  RESETS_EPOCH="$(date -j -f '%Y-%m-%dT%H:%M:%SZ' "$RESETS" '+%s' 2>/dev/null || date -d "$RESETS" '+%s' 2>/dev/null || echo 0)"
fi

NOW="$(date '+%s')"

cat > "$OUTPUT" << JSONEOF
{
  "source": "claude",
  "five_hour": {
    "used_percentage": $PCT,
    "resets_at": $RESETS_EPOCH
  },
  "updated_at": $NOW
}
JSONEOF
`;

export async function run(): Promise<void> {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  // Write the hook script
  try {
    fs.mkdirSync(path.dirname(HOOK_COMMAND), { recursive: true });
    fs.writeFileSync(HOOK_COMMAND, HOOK_SCRIPT, { mode: 0o755 });
    console.log(`✓ Installed hook script: ${HOOK_COMMAND}`);
  } catch (err: any) {
    console.error(`Failed to write hook script: ${err.message}`);
    process.exit(1);
  }

  // Read or init settings.json
  let settings: Record<string, any> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      console.error('Warning: ~/.claude/settings.json is not valid JSON — creating a fresh one.');
    }
  }

  // Claude Code hooks are keyed by event type in settings.hooks object
  if (!settings['hooks'] || Array.isArray(settings['hooks'])) {
    // Migrate from old array format or start fresh
    settings['hooks'] = {};
  }

  const stopHooks: any[] = settings['hooks']['Stop'] ?? [];

  // Check if our hook is already registered
  const alreadyInstalled = stopHooks.some(
    (entry: any) =>
      Array.isArray(entry.hooks) &&
      entry.hooks.some((h: any) => h.type === 'command' && h.command === HOOK_COMMAND),
  );

  if (alreadyInstalled) {
    console.log('Rate-limit hook already configured in ~/.claude/settings.json');
    console.log('No changes made.');
    return;
  }

  settings['hooks']['Stop'] = [
    ...stopHooks,
    {
      hooks: [{ type: 'command', command: HOOK_COMMAND }],
    },
  ];

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    console.log(`✓ Registered Stop hook in ~/.claude/settings.json`);
  } catch (err: any) {
    console.error(`Failed to update settings.json: ${err.message}`);
    process.exit(1);
  }

  console.log('');
  console.log('Done. Restart Claude Code for the hook to activate.');
  console.log('Rate limits will appear in the Waymark dashboard after your next agent response.');
  console.log('');
  console.log('Note: rate limit data only appears if Claude Code includes it in session');
  console.log('transcripts. If the dashboard still shows no data, you can also install the');
  console.log('abtop StatusLine extension which writes rate-limit data directly.');
}
