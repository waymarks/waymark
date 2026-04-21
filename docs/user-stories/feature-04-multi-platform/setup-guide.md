# Feature 04: Multi-Platform Support — Setup Guide

> **[← Overview](./README.md)** | [Testing Guide](./testing-guide.md)

---

## Prerequisites (All Platforms)

- Node.js 18 or later (`node --version` to confirm)
- npm 9 or later (included with Node.js 18+)
- Claude Code or Claude Desktop installed and configured
- Network access to `localhost:3001` (or custom port if configured)

---

## Installation by Platform

### macOS

```bash
# Install Waymark CLI globally
npm install -g @way_marks/cli

# Verify installation
npx @way_marks/cli --version

# Initialize Waymark in your project
cd your-project
npx @way_marks/cli init

# Start the Waymark server
npx @way_marks/cli start
```

**Apple Silicon (M1/M2/M3)**: No additional steps required — the binary is universal.

**Gatekeeper warning**: If macOS blocks the binary on first run, go to **System Settings → Privacy & Security** and click **Allow Anyway**.

---

### Windows (PowerShell)

```powershell
# Install Waymark CLI globally
npm install -g @way_marks/cli

# Verify installation
npx @way_marks/cli --version

# Initialize Waymark in your project
cd your-project
npx @way_marks/cli init

# Start the Waymark server
npx @way_marks/cli start
```

**Windows Defender**: If the binary is quarantined, add an exclusion:
```powershell
# Add exclusion (run as Administrator)
Add-MpPreference -ExclusionPath "$env:APPDATA\npm\node_modules\@way_marks"
```

**Firewall**: If the dashboard (port 3001) is inaccessible, add an inbound rule:
```powershell
# Add firewall rule (run as Administrator)
New-NetFirewallRule -DisplayName "Waymark Dashboard" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
```

---

### Linux (Ubuntu/Debian)

```bash
# Install Waymark CLI globally
npm install -g @way_marks/cli

# Verify installation
npx @way_marks/cli --version

# Initialize Waymark in your project
cd your-project
npx @way_marks/cli init

# Start the Waymark server
npx @way_marks/cli start
```

#### Linux: Running as a systemd Service (Recommended for CI/CD)

Create a service unit file at `/etc/systemd/system/waymark.service`:

```ini
[Unit]
Description=Waymark AI Agent Governance Server
After=network.target

[Service]
Type=simple
User=your-ci-user
WorkingDirectory=/path/to/your-project
ExecStart=/usr/local/bin/npx @way_marks/cli start --headless
Restart=on-failure
RestartSec=5
Environment=WAYMARK_SMTP_HOST=smtp.yourdomain.com
Environment=WAYMARK_SMTP_PORT=587
Environment=WAYMARK_SMTP_USER=waymark@yourdomain.com
Environment=WAYMARK_SMTP_PASS=your-password
Environment=WAYMARK_APPROVAL_EMAIL=platform-team@yourdomain.com

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable waymark
sudo systemctl start waymark
sudo systemctl status waymark
```

---

## Cross-Platform `waymark.config.json`

The same configuration file works on all platforms. File paths in the config use forward slashes — Waymark normalizes Windows backslash paths automatically.

```json
{
  "version": "2",
  "platforms": ["claude"],
  "policies": {
    "allowedPaths": [
      "src/**",
      "tests/**",
      "docs/**"
    ],
    "blockedPaths": [
      ".env.production",
      "secrets/**"
    ],
    "blockedCommands": [
      "DROP TABLE",
      "DROP DATABASE",
      "rm -rf",
      "Remove-Item -Recurse",
      "del /s /q",
      "format"
    ],
    "requireApproval": [
      "src/db/migrations/**",
      "deploy/**",
      "infrastructure/**"
    ]
  }
}
```

> **Note**: `blockedCommands` supports both Unix (`rm -rf`) and Windows (`Remove-Item -Recurse`, `del /s /q`) destructive command patterns in the same config. Waymark applies the full list on all platforms.

---

## MCP Configuration by Platform

### macOS and Linux

Claude Code reads MCP configuration from:
```
~/.claude/claude_desktop_config.json
```

Add Waymark as an MCP server:

```json
{
  "mcpServers": {
    "waymark": {
      "command": "npx",
      "args": ["@way_marks/cli", "mcp"],
      "cwd": "/path/to/your-project"
    }
  }
}
```

### Windows (PowerShell)

The config file location on Windows:
```
%APPDATA%\Claude\claude_desktop_config.json
```

PowerShell path expansion:
```powershell
notepad "$env:APPDATA\Claude\claude_desktop_config.json"
```

Configuration (same JSON format):
```json
{
  "mcpServers": {
    "waymark": {
      "command": "npx",
      "args": ["@way_marks/cli", "mcp"],
      "cwd": "C:\\Users\\yourname\\projects\\your-project"
    }
  }
}
```

> **Windows paths in JSON**: Use double backslashes (`\\`) or forward slashes (`/`) in JSON strings.

---

## Verifying Cross-Platform Setup

On each platform, after installation:

1. Run `npx @way_marks/cli start`
2. Open `http://localhost:3001` in a browser
3. Navigate to **Settings → Platform** — confirm the detected platform (Windows / macOS / Linux) is correct
4. Run a quick test write via Claude Code
5. Confirm the action appears in the dashboard History with the correct platform label

---

*[Testing Guide →](./testing-guide.md)*
