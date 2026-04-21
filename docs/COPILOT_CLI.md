# Waymark + GitHub Copilot CLI Integration

> **Status**: EXPERIMENTAL ⚠️  
> Support for GitHub Copilot CLI is new. If you encounter issues, please report them.

---

## What This Does

This setup allows Waymark to log and monitor GitHub Copilot CLI commands alongside your other Waymark-tracked activities.

**Limitations**:
- ✅ CLI commands are logged to Waymark dashboard
- ✅ You can view command history with timestamps
- ⚠️ **CLI-only**: Does NOT work in VS Code, JetBrains, or other editors
- ⚠️ **No file interception**: File operations aren't monitored (shell only)
- ⚠️ **Experimental**: Fewer features than Claude MCP support

**Best for**:
- Terminal users who prefer `copilot` CLI commands
- Users who want to audit their Copilot CLI usage
- Teams wanting to track all AI agent activity in one place

---

## Prerequisites

1. **GitHub Copilot CLI installed**
   ```bash
   npm install -g @github/copilot-cli
   copilot --version  # Should work
   ```

2. **GitHub authentication**
   ```bash
   copilot auth login
   ```

3. **Waymark initialized in your project**
   ```bash
   cd your-project
   waymark init  # Choose "GitHub Copilot CLI" or "Both"
   ```

---

## Setup Steps

### Step 1: Find Your Copilot Binary

```bash
which copilot
# Output example: /usr/local/bin/copilot
# or on Windows: C:\Users\<user>\AppData\Local\Programs\Python\Python311\Scripts\copilot.exe
```

Remember this path for next steps.

### Step 2: Start Waymark

```bash
cd your-project
npx @way_marks/cli start
# Output: Server running at http://localhost:3001
# Keep this terminal open or run in background
```

### Step 3: Create Wrapper Script

Waymark provides a setup command:

```bash
npx @way_marks/cli setup-copilot-wrapper
```

This will:
1. Detect your copilot binary location
2. Rename original to `copilot-original`
3. Create wrapper script at `/usr/local/bin/copilot`
4. Test the wrapper
5. Print setup summary

**Manual Setup** (if automatic doesn't work):

```bash
# 1. Find copilot location
which copilot
# /usr/local/bin/copilot (example)

# 2. Move original
sudo mv /usr/local/bin/copilot /usr/local/bin/copilot-original

# 3. Create wrapper script
cat > /tmp/copilot-wrapper.sh << 'EOF'
#!/bin/bash
# Waymark Copilot CLI wrapper
PROJECT_ROOT=$(pwd)
COPILOT_BIN="/usr/local/bin/copilot-original"

# Log to Waymark API (non-blocking)
if [ -S ~/.waymark/waymark.sock ] || [ -f ~/.waymark/waymark.pid ]; then
  curl -s -X POST http://localhost:3001/api/cli-action \
    -H "Content-Type: application/json" \
    -d "{\"command\":\"copilot\",\"args\":\"$*\",\"cwd\":\"$PROJECT_ROOT\"}" &
fi

# Execute original copilot
exec "$COPILOT_BIN" "$@"
EOF

chmod +x /tmp/copilot-wrapper.sh
sudo mv /tmp/copilot-wrapper.sh /usr/local/bin/copilot
```

### Step 4: Verify Setup

```bash
copilot --version
# Should output copilot version without errors
# You should see activity logged in Waymark dashboard
```

---

## Using Copilot CLI with Waymark

### Normal Usage

```bash
# Ask a question
copilot "How do I read a file in Node.js?"

# Get help
copilot --help

# Run a command
copilot run "ls -la"
```

All commands are automatically logged to Waymark.

### View Logs

**In Dashboard**:
```
http://localhost:3001
→ Filter by: Source = "CLI" (or Tool = "copilot")
```

**In Terminal**:
```bash
npx @way_marks/cli logs --tool copilot --limit 10
```

---

## Troubleshooting

### Wrapper Not Found

```
copilot: command not found
```

**Solution**:
```bash
# Check wrapper exists
ls -la /usr/local/bin/copilot

# Check it's executable
file /usr/local/bin/copilot
# Should output: Bourne-Again shell script

# Check PATH
echo $PATH | grep /usr/local/bin

# Re-run setup
npx @way_marks/cli setup-copilot-wrapper
```

### Original Copilot Not Found After Wrapper Creation

```bash
/usr/local/bin/copilot-original: command not found
```

**Solution**:
1. Restore original:
   ```bash
   which copilot-original  # Find it
   sudo mv /usr/local/bin/copilot-original /usr/local/bin/copilot
   ```

2. Re-install GitHub Copilot CLI:
   ```bash
   npm install -g @github/copilot-cli
   ```

3. Run setup again:
   ```bash
   npx @way_marks/cli setup-copilot-wrapper
   ```

### Commands Not Logged to Waymark

1. **Check Waymark is running**:
   ```bash
   curl http://localhost:3001/api/health
   # Should return 200 OK
   ```

2. **Check wrapper is being used**:
   ```bash
   which copilot
   # Should output: /usr/local/bin/copilot
   
   file /usr/local/bin/copilot
   # Should show: Bourne-Again shell script
   ```

3. **Check dashboard**:
   - Open http://localhost:3001
   - Look for recent actions
   - Filter by Tool = "copilot"

4. **Check wrapper permissions**:
   ```bash
   ls -l /usr/local/bin/copilot
   # Should show: -rwxr-xr-x (executable)
   ```

### Permission Denied

```
bash: /usr/local/bin/copilot: Permission denied
```

**Solution**:
```bash
sudo chmod +x /usr/local/bin/copilot
```

---

## Uninstalling Wrapper

To restore original behavior:

```bash
# 1. Remove wrapper
sudo rm /usr/local/bin/copilot

# 2. Restore original
sudo mv /usr/local/bin/copilot-original /usr/local/bin/copilot

# 3. Verify
which copilot
copilot --version
```

---

## How It Works

```
┌──────────────────────┐
│  User runs:          │
│  copilot "explain"   │
└──────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│  /usr/local/bin/copilot (wrapper)│
│  ├─ Logs to Waymark API          │
│  │  POST /api/cli-action         │
│  └─ Forwards to copilot-original │
└──────────────────────────────────┘
         │
         ▼
┌──────────────────────┐
│  Waymark Dashboard   │
│  Shows: CLI: copilot │
└──────────────────────┘
```

---

## Supported Platforms

| Platform | Supported | Notes |
|----------|-----------|-------|
| macOS | ✅ Yes | Requires `/usr/local/bin/` or similar in PATH |
| Linux | ✅ Yes | Same as macOS |
| Windows | ⚠️ Partial | PowerShell wrapper would be needed |

Windows users: If you'd like support, please file an issue with your Python/Copilot installation path.

---

## Platform-Specific Notes

### macOS / Linux

Uses standard bash wrapper script. Should work out of the box.

**Troubleshooting**:
- Ensure `/usr/local/bin/` is in your `$PATH`: `echo $PATH`
- Use `sudo` if you get permission errors

### Windows (PowerShell)

Wrapper support is planned. For now:

1. Manual logging via Waymark API:
   ```powershell
   $body = @{
       command = "copilot"
       args = "your-question"
       cwd = (Get-Location).Path
   } | ConvertTo-Json
   
   Invoke-WebRequest -Uri "http://localhost:3001/api/cli-action" `
       -Method POST `
       -Body $body `
       -ContentType "application/json"
   
   & C:\path\to\copilot.exe $args
   ```

2. Or create a PowerShell function in your `$PROFILE`:
   ```powershell
   function copilot {
       # Log to Waymark
       $body = @{
           command = "copilot"
           args = $args -join " "
           cwd = (Get-Location).Path
       } | ConvertTo-Json
       
       try {
           Invoke-WebRequest -Uri "http://localhost:3001/api/cli-action" `
               -Method POST -Body $body -ContentType "application/json" -TimeoutSec 1 | Out-Null
       } catch {}
       
       # Execute copilot
       & C:\path\to\copilot-original.exe @args
   }
   ```

---

## FAQ

**Q: Does Waymark intercept Copilot Chat in VS Code?**  
A: No. Copilot Chat uses a different protocol. Waymark only works with the CLI.

**Q: Can I use both Claude and Copilot CLI?**  
A: Yes! Select "Both" during `waymark init`. Use Claude MCP in your code editor, and Copilot CLI in the terminal.

**Q: What if Copilot CLI gets updated?**  
A: The wrapper should still work. If it breaks, file an issue and we'll fix it.

**Q: Are commands sent to Anthropic?**  
A: No. Commands are logged locally to your `.waymark/waymark.db` SQLite database only.

**Q: Can I view command output in Waymark?**  
A: Currently, Waymark logs command + args. Full output capture is planned.

---

## Next Steps

1. ✅ **Setup wrapper**: Run `npx @way_marks/cli setup-copilot-wrapper`
2. ✅ **Test**: `copilot --version` (should work)
3. ✅ **View logs**: Open http://localhost:3001 and run a copilot command
4. 📖 **Read main docs**: See `README.md` for more features

---

## Getting Help

If something doesn't work:

1. Check this guide's **Troubleshooting** section
2. Run `npx @way_marks/cli status` to verify Waymark is running
3. Check dashboard for any error messages
4. File an issue on GitHub with:
   - Your OS and shell (`echo $SHELL`)
   - Output of `which copilot` and `file /usr/local/bin/copilot`
   - Output of `copilot --version`
   - Any error messages from the terminal

---

## Feedback

This is experimental support. If you have suggestions or find bugs:

- 💬 GitHub Issues: Report problems
- 📝 Discussions: Share feedback
- ⭐ Star the repo: If it's helpful!

Thanks for trying Waymark + Copilot CLI! 🚀
