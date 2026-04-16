import 'dotenv/config';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { getActions, getAction, markRolledBack, getSessions, getPendingCount, getActionsWithFiltering, archiveOldActions, getSummaryStats, ActionFilter, insertAction } from '../db/database';
import { loadConfig } from '../policies/engine';
import { approvePendingAction, rejectPendingAction } from '../approvals/handler';

// Import registry for Phase 2 hub navigation
const registryPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.waymark', 'registry.json');
function getRegistryProjects() {
  try {
    if (!fs.existsSync(registryPath)) return [];
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return registry.projects || [];
  } catch {
    return [];
  }
}

// Phase 4: Garbage collection for registry
function garbageCollectRegistryFile(): number {
  try {
    if (!fs.existsSync(registryPath)) return 0;
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const cutoffTime = new Date();
    cutoffTime.setDate(cutoffTime.getDate() - 7);
    
    let removed = 0;
    const projects = registry.projects || {};
    const idsToRemove: string[] = [];
    
    for (const [id, entry] of Object.entries(projects) as any[]) {
      if (entry.status === 'stopped' && entry.stoppedAt) {
        const stoppedTime = new Date(entry.stoppedAt);
        if (stoppedTime < cutoffTime) {
          idsToRemove.push(id);
        }
      }
    }
    
    for (const id of idsToRemove) {
      delete registry.projects[id];
      removed++;
    }
    
    if (removed > 0) {
      registry.lastUpdated = new Date().toISOString();
      fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
    }
    
    return removed;
  } catch {
    return 0;
  }
}

const app = express();
const PORT = parseInt(process.env.WAYMARK_PORT || '3001', 10);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve UI — path works for both ts-node (src/api/) and compiled (dist/api/)
const UI_DIR = path.resolve(__dirname, '../../src/ui');
app.use(express.static(UI_DIR));

// GET /api/actions — list all actions (or ?count=true for pending count)
app.get('/api/actions', (req, res) => {
  try {
    if (req.query.count === 'true') {
      return res.json({ count: getPendingCount() });
    }
    const actions = getActions();
    res.json(actions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Phase 3: GET /api/actions/paginated — paginated actions with filtering
app.get('/api/actions/paginated', (req, res) => {
  try {
    const filter: ActionFilter = {
      status: req.query.status as string | undefined,
      tool_name: req.query.tool_name as string | undefined,
      search: req.query.search as string | undefined,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
    };
    const result = getActionsWithFiltering(filter);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Phase 3: GET /api/stats — summary statistics
app.get('/api/stats', (req, res) => {
  try {
    const stats = getSummaryStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Phase 5B: POST /api/cli-action — log GitHub Copilot CLI command
// Called by copilot-cli-wrapper.sh when user runs: copilot [command]
app.post('/api/cli-action', (req, res) => {
  try {
    const { command, args, cwd, timestamp, shell, user } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'Missing command field' });
    }

    // Generate action ID and session ID
    const action_id = `cli-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const session_id = 'cli-session';  // All CLI actions share same session
    
    // Log CLI action using insertAction function
    insertAction({
      action_id,
      session_id,
      tool_name: 'copilot',
      input_payload: JSON.stringify({ command, args, cwd, shell, user }),
      status: 'executed',  // CLI always executes (no approval flow)
      event_type: 'execution',
      observation_context: `CLI: ${command} ${args}`,
      request_source: 'cli',
      source: 'cli',  // Distinguish from MCP
    });

    res.json({ 
      success: true, 
      action_id,
      message: `Logged Copilot CLI: ${command} ${args}`
    });
  } catch (err: any) {
    console.error('Error logging CLI action:', err);
    res.status(500).json({ error: err.message });
  }
});

// Phase 3: POST /api/maintenance/archive — archive old actions
app.post('/api/maintenance/archive', (req, res) => {
  try {
    const daysOld = parseInt(req.body?.daysOld as string) || 30;
    const archived = archiveOldActions(daysOld);
    res.json({ success: true, archived, message: `Archived ${archived} actions older than ${daysOld} days` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/actions/:action_id/approve
app.post('/api/actions/:action_id/approve', async (req, res) => {
  try {
    const result = await approvePendingAction(req.params.action_id, 'ui');
    if (!result.success) {
      const status = result.error === 'Action not found' ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/actions/:action_id/reject
app.post('/api/actions/:action_id/reject', async (req, res) => {
  try {
    const reason = (req.body?.reason as string) || 'Rejected';
    const result = await rejectPendingAction(req.params.action_id, reason);
    if (!result.success) {
      const status = result.error === 'Action not found' ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/actions/:action_id/status — lightweight status for agent polling
app.get('/api/actions/:action_id/status', (req, res) => {
  try {
    const action = getAction(req.params.action_id);
    if (!action) {
      return res.status(404).json({ error: 'Action not found' });
    }
    res.json({
      status: action.status,
      decision: action.decision,
      approved_by: action.approved_by,
      approved_at: action.approved_at,
      rejected_reason: action.rejected_reason,
      rejected_at: action.rejected_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/actions/:action_id — single action
app.get('/api/actions/:action_id', (req, res) => {
  try {
    const action = getAction(req.params.action_id);
    if (!action) {
      return res.status(404).json({ error: 'Action not found' });
    }
    res.json(action);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/actions/:action_id/rollback
app.post('/api/actions/:action_id/rollback', (req, res) => {
  try {
    const action = getAction(req.params.action_id);

    if (!action) {
      return res.status(404).json({ error: 'Action not found' });
    }

    if (action.tool_name !== 'write_file') {
      return res.status(400).json({ error: 'Rollback only supported for write_file actions' });
    }

    if (action.rolled_back) {
      return res.status(400).json({ error: 'Action already rolled back' });
    }

    if (!action.target_path) {
      return res.status(400).json({ error: 'No target path on this action' });
    }

    // Bug 3: if no before_snapshot, file was newly created — delete it
    if (!action.before_snapshot) {
      fs.unlinkSync(action.target_path);
      markRolledBack(action.action_id);
      return res.json({ success: true, action: 'deleted', message: `Deleted new file: ${action.target_path}` });
    }

    // Restore file to before_snapshot
    fs.mkdirSync(path.dirname(action.target_path), { recursive: true });
    fs.writeFileSync(action.target_path, action.before_snapshot, 'utf8');

    markRolledBack(action.action_id);

    res.json({ success: true, action: 'restored', message: `Restored ${action.target_path} to previous state` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/slack/interact — Slack interactive components (button clicks)
// For local development: use ngrok or similar to expose this endpoint publicly: ngrok http 3001
app.post('/api/slack/interact', async (req, res) => {
  let payload: any;
  try {
    payload = JSON.parse(req.body.payload);
  } catch (err: any) {
    console.error('Slack interact parse error:', err);
    return res.status(400).json({ error: 'Invalid payload format' });
  }
  try {
    if (!payload?.actions?.[0]) {
      return res.status(400).json({ error: 'No actions in payload' });
    }
    const slackAction = payload.actions[0];
    const actionId: string = slackAction.action_id;
    const actionValue: string = slackAction.value; // waymark action_id

    if (actionId === 'waymark_approve') {
      const result = await approvePendingAction(actionValue, 'slack');
      return res.json({ text: result.success ? '✅ Approved by slack' : `❌ Error: ${result.error}` });
    }
    if (actionId === 'waymark_reject') {
      const result = await rejectPendingAction(actionValue, 'Rejected via Slack');
      return res.json({ text: result.success ? '❌ Rejected by slack' : `❌ Error: ${result.error}` });
    }
    res.status(400).json({ error: `Unknown action_id: ${actionId}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions
app.get('/api/sessions', (req, res) => {
  try {
    const sessions = getSessions();
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/config
app.get('/api/config', (req, res) => {
  try {
    res.json(loadConfig());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/project — returns project metadata from .waymark/config.json
app.get('/api/project', (req, res) => {
  try {
    const configPath = path.join(
      process.env.WAYMARK_PROJECT_ROOT || process.cwd(),
      '.waymark',
      'config.json'
    );
    if (!fs.existsSync(configPath)) {
      return res.json({ projectName: null, port: PORT });
    }
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { projectName?: string; port?: number };
    res.json({ projectName: cfg.projectName || null, port: cfg.port || PORT });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hub/projects — Phase 2: returns all registered projects (optional hub feature)
app.get('/api/hub/projects', (req, res) => {
  try {
    const projects = getRegistryProjects();
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Phase 4: POST /api/registry/cleanup — garbage collect stale entries
app.post('/api/registry/cleanup', (req, res) => {
  try {
    const removed = garbageCollectRegistryFile();
    res.json({ success: true, removed, message: `Garbage collected ${removed} stale entries` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback: serve UI for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(UI_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Waymark UI + API running at http://localhost:${PORT}`);
});

export default app;
