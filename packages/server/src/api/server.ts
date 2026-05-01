import 'dotenv/config';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { getActions, getAction, markRolledBack, getSessions, getPendingCount, getActionsWithFiltering, archiveOldActions, getSummaryStats, ActionFilter, insertAction, getSession, getSessionActions, createSession, SessionRow, addTeamMember, getTeamMember, getAllTeamMembers, removeTeamMember, addApprovalRoute, getApprovalRoute, getAllApprovalRoutes, updateApprovalRoute, deleteApprovalRoute, createApprovalRequest, getApprovalRequest, getPendingApprovals, submitApprovalDecision as dbSubmitApprovalDecision, getSessionApprovalRequests, addEscalationRule, getEscalationRule, getAllEscalationRules, updateEscalationRule, deleteEscalationRule, getPendingEscalations, getEscalationRequest, getEscalationHistory } from '../db/database';
import { rollbackSession as rollbackSessionManager, validateRollbackable, createRollbackTransaction, executeRollbackTransaction } from '../rollback/manager';
import { loadConfig } from '../policies/engine';
import { approvePendingAction, rejectPendingAction } from '../approvals/handler';
import { determineRequiredApprovers, createApprovalRequestForSession, submitApprovalDecision, getApprovalStatus, canProceedWithRollback } from '../approval/manager';
import { submitEscalationDecision as submitEscalationDecisionManager, getEscalationStatus, canProceedWithRollbackAfterEscalation, getEscalationHistoryForSession } from '../escalation/manager';
import { attachSubscriber, emit } from './events';
import { MultiCollector } from '../collectors/multi-collector';
import { createAgentMonitorRouter } from './routes/agent-monitor';

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

interface RegistryEntry {
  id: string;
  projectRoot: string;
  projectName: string;
  port: number;
  mcp_pid?: number;
  api_pid?: number;
  status: 'running' | 'paused' | 'stopped';
  startedAt: string;
  stoppedAt?: string;
  pausedAt?: string;
  hostname?: string;
  user?: string;
}

function readRegistry(): { projects: Record<string, RegistryEntry>; releasedPorts?: number[]; lastUpdated?: string } {
  if (!fs.existsSync(registryPath)) return { projects: {}, releasedPorts: [] };
  try {
    const r = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return { projects: r.projects || {}, releasedPorts: r.releasedPorts || [], lastUpdated: r.lastUpdated };
  } catch {
    return { projects: {}, releasedPorts: [] };
  }
}

function writeRegistry(reg: { projects: Record<string, RegistryEntry>; releasedPorts?: number[]; lastUpdated?: string }): void {
  reg.lastUpdated = new Date().toISOString();
  fs.writeFileSync(registryPath, JSON.stringify({ version: 1, ...reg }, null, 2) + '\n');
}

function mutateRegistryEntry(id: string, mutator: (e: RegistryEntry) => void): RegistryEntry | null {
  const reg = readRegistry();
  const entry = reg.projects[id];
  if (!entry) return null;
  mutator(entry);
  reg.projects[id] = entry;
  writeRegistry(reg);
  return entry;
}

function tryKill(pid: number | undefined): boolean {
  if (!pid) return false;
  try { process.kill(pid, 'SIGTERM'); return true; } catch { return false; }
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
// Fallback only — `waymark start` always passes WAYMARK_PORT explicitly.
// 47000 is the new default range (47000-47999); 3001 was the legacy default.
const PORT = parseInt(process.env.WAYMARK_PORT || '47000', 10);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Same-machine peer CORS for the Hub view: another Waymark dashboard on a
// different localhost port may probe this server's /api/* (e.g. /api/stats,
// /api/hub/*). Allow it without opening up arbitrary remote origins.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});

// Serve UI — path works for both ts-node (src/api/) and compiled (dist/api/).
const UI_DIR = path.resolve(__dirname, '../../src/ui-dist');
const UI_INDEX = path.join(UI_DIR, 'index.html');
const UI_BUILT = fs.existsSync(UI_INDEX);
if (UI_BUILT) {
  app.use(express.static(UI_DIR));
} else {
  console.warn(
    '[waymark] ui-dist/ not found — dashboard will return a setup banner. ' +
    'Run `npm run build -w @way_marks/web` to build the dashboard.',
  );
}

// Agent monitor — MultiCollector on a 2 s timer (mirrors abtop polling interval).
// .unref() so the timer doesn't keep the event loop alive on SIGTERM; the API
// process should exit cleanly via the http server close.
const agentCollector = new MultiCollector();
let latestAgentSnapshot = agentCollector.tick();
const agentCollectorTimer = setInterval(() => {
  latestAgentSnapshot = agentCollector.tick();
}, 2000);
agentCollectorTimer.unref();

// Mount agent-monitor REST API
app.use('/api/agent-monitor', createAgentMonitorRouter(() => latestAgentSnapshot));

// GET /api/events — Server-Sent Events stream for live UI updates
app.get('/api/events', (req, res) => {
  const detach = attachSubscriber(res);
  req.on('close', detach);
});

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
    emit('actions', { action_id: req.params.action_id, kind: 'approved' });
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
    emit('actions', { action_id: req.params.action_id, kind: 'rejected' });
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
      emit('actions', { action_id: action.action_id, kind: 'rolled_back' });
      return res.json({ success: true, action: 'deleted', message: `Deleted new file: ${action.target_path}` });
    }

    // Restore file to before_snapshot
    fs.mkdirSync(path.dirname(action.target_path), { recursive: true });
    fs.writeFileSync(action.target_path, action.before_snapshot, 'utf8');

    markRolledBack(action.action_id);
    emit('actions', { action_id: action.action_id, kind: 'rolled_back' });

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
      if (result.success) {
        emit('actions', { action_id: actionValue, kind: 'approved' });
      }
      return res.json({ text: result.success ? '✅ Approved by slack' : `❌ Error: ${result.error}` });
    }
    if (actionId === 'waymark_reject') {
      const result = await rejectPendingAction(actionValue, 'Rejected via Slack');
      if (result.success) {
        emit('actions', { action_id: actionValue, kind: 'rejected' });
      }
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

// Phase 1: GET /api/sessions/:session_id — get session details
app.get('/api/sessions/:session_id', (req, res) => {
  try {
    const { session_id } = req.params;
    const session = getSession(session_id);
    if (!session) {
      return res.status(404).json({ error: `Session ${session_id} not found` });
    }
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Phase 1: GET /api/sessions/:session_id/actions — get all actions in session
app.get('/api/sessions/:session_id/actions', (req, res) => {
  try {
    const { session_id } = req.params;
    const actions = getSessionActions(session_id);
    res.json({
      session_id,
      action_count: actions.length,
      actions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Phase 1: POST /api/sessions/:session_id/rollback — rollback entire session
app.post('/api/sessions/:session_id/rollback', (req, res) => {
  try {
    const { session_id } = req.params;

    // Get session
    const session = getSession(session_id);
    if (!session) {
      return res.status(404).json({ error: `Session ${session_id} not found` });
    }

    // Prevent rolling back already rolled back sessions
    if (session.status === 'rolled_back') {
      return res.status(400).json({ error: 'Session already rolled back' });
    }

    // Get all actions in session
    const actions = getSessionActions(session_id);
    if (actions.length === 0) {
      return res.status(400).json({ error: 'Session has no actions to rollback' });
    }

    // Validate all actions are reversible
    const validation = validateRollbackable(actions);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Cannot rollback session',
        validation,
      });
    }

    // Create and execute rollback transaction
    const transaction = createRollbackTransaction(session_id, actions);
    const result = executeRollbackTransaction(transaction);

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        message: 'Rollback failed',
      });
    }

    emit('sessions', { session_id, kind: 'rolled_back', count: actions.length });
    emit('actions', { session_id, kind: 'session_rolled_back' });
    res.json({
      success: true,
      message: `Rolled back session ${session_id}`,
      actions_rolled_back: actions.length,
      files_restored: result.filesRestored,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Phase 1: GET /api/sessions/:session_id/status — check rollback status
app.get('/api/sessions/:session_id/status', (req, res) => {
  try {
    const { session_id } = req.params;
    const session = getSession(session_id);
    if (!session) {
      return res.status(404).json({ error: `Session ${session_id} not found` });
    }

    const actions = getSessionActions(session_id);
    const rolledBackCount = actions.filter((a) => a.rolled_back === 1).length;

    res.json({
      session_id,
      status: session.status,
      total_actions: actions.length,
      rolled_back_actions: rolledBackCount,
      rolled_back_at: session.rolled_back_at,
      is_rolled_back: session.status === 'rolled_back',
    });
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

// GET /api/project — returns live project metadata for the running server.
// Source of truth: .waymark/config.json (written by `waymark start`).
// Falls back to env-only state when running stand-alone (no .waymark/ yet).
app.get('/api/project', (_req, res) => {
  try {
    const projectRoot = process.env.WAYMARK_PROJECT_ROOT || process.cwd();
    const configPath = path.join(projectRoot, '.waymark', 'config.json');
    if (!fs.existsSync(configPath)) {
      return res.json({ projectName: null, port: PORT, projectRoot });
    }
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      projectName?: string;
      port?: number;
      projectRoot?: string;
    };
    res.json({
      projectName: cfg.projectName || null,
      port: cfg.port || PORT,
      projectRoot: cfg.projectRoot || projectRoot,
    });
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

// ============================================================================
// Hub: cross-project mutations driven from any peer's dashboard.
// All write to ~/.waymark/registry.json the same way the CLI does.
// ============================================================================

// POST /api/hub/projects/:id/pause — flip status to paused (port retained)
app.post('/api/hub/projects/:id/pause', (req, res) => {
  try {
    const { id } = req.params;
    const updated = mutateRegistryEntry(id, (e) => {
      e.status = 'paused';
      e.pausedAt = new Date().toISOString();
    });
    if (!updated) return res.status(404).json({ error: `Project not found: ${id}` });
    res.json({ success: true, project: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hub/projects/:id/resume — flip status back to running
app.post('/api/hub/projects/:id/resume', (req, res) => {
  try {
    const { id } = req.params;
    const updated = mutateRegistryEntry(id, (e) => {
      e.status = 'running';
      delete e.pausedAt;
    });
    if (!updated) return res.status(404).json({ error: `Project not found: ${id}` });
    res.json({ success: true, project: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hub/projects/:id/stop — SIGTERM the peer's mcp+api, mark stopped,
// release the port for reuse. Mirrors `waymark stop` behaviour without needing
// the user to cd into the other project.
app.post('/api/hub/projects/:id/stop', (req, res) => {
  try {
    const { id } = req.params;
    const reg = readRegistry();
    const entry = reg.projects[id];
    if (!entry) return res.status(404).json({ error: `Project not found: ${id}` });

    const killedApi = tryKill(entry.api_pid);
    const killedMcp = tryKill(entry.mcp_pid);

    entry.status = 'stopped';
    entry.stoppedAt = new Date().toISOString();
    reg.projects[id] = entry;

    // Release port for reuse (mirrors registry.releasePort behaviour).
    if (entry.port && Array.isArray(reg.releasedPorts)) {
      reg.releasedPorts.push(entry.port);
    } else {
      reg.releasedPorts = [entry.port];
    }
    writeRegistry(reg);

    res.json({
      success: true,
      project: entry,
      killed: { api: killedApi, mcp: killedMcp },
      message: killedApi || killedMcp ? `Stopped ${id}.` : `${id} was not running (registry cleaned).`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hub/gc — alias of /api/registry/cleanup; convenient from the Hub UI.
app.post('/api/hub/gc', (_req, res) => {
  try {
    const removed = garbageCollectRegistryFile();
    res.json({ success: true, removed, message: `Garbage collected ${removed} stale entries` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PHASE 2: Team Approval Routing Endpoints
// ============================================================================

// GET /api/team/members — list all team members
app.get('/api/team/members', (req, res) => {
  try {
    const members = getAllTeamMembers();
    res.json(members);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/team/members — add team member
app.post('/api/team/members', (req, res) => {
  try {
    const { member_id, name, email, slack_id } = req.body;
    const added_by = req.body.added_by || 'system';

    if (!member_id || !name || !email) {
      return res.status(400).json({ error: 'Missing required fields: member_id, name, email' });
    }

    // Check if email already exists
    const existing = getAllTeamMembers().find(m => m.email === email);
    if (existing) {
      return res.status(400).json({ error: `Email ${email} already in use` });
    }

    addTeamMember(member_id, name, email, added_by, slack_id);
    emit('team', { member_id, kind: 'added' });
    res.json({ success: true, member_id, message: `Added team member: ${name}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/team/members/:member_id — remove team member
app.delete('/api/team/members/:member_id', (req, res) => {
  try {
    const { member_id } = req.params;

    const member = getTeamMember(member_id);
    if (!member) {
      return res.status(404).json({ error: `Team member ${member_id} not found` });
    }

    removeTeamMember(member_id);
    emit('team', { member_id, kind: 'removed' });
    res.json({ success: true, message: `Removed team member: ${member.name}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/approval-routes — list all approval routing rules
app.get('/api/approval-routes', (req, res) => {
  try {
    const routes = getAllApprovalRoutes();
    res.json(routes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/approval-routes — create approval routing rule
app.post('/api/approval-routes', (req, res) => {
  try {
    const { route_id, name, approver_ids, description, condition_type, condition_json } = req.body;
    const created_by = req.body.created_by || 'system';

    if (!route_id || !name || !Array.isArray(approver_ids) || approver_ids.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: route_id, name, approver_ids (array)' });
    }

    addApprovalRoute(route_id, name, approver_ids, created_by, description, condition_type, condition_json);
    emit('approval-routes', { route_id, kind: 'added' });
    res.json({ success: true, route_id, message: `Created approval route: ${name}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/approval-routes/:route_id — update approval routing rule
app.put('/api/approval-routes/:route_id', (req, res) => {
  try {
    const { route_id } = req.params;
    const { name, description, approver_ids } = req.body;

    const route = getApprovalRoute(route_id);
    if (!route) {
      return res.status(404).json({ error: `Approval route ${route_id} not found` });
    }

    updateApprovalRoute(route_id, { name, description, approver_ids });
    emit('approval-routes', { route_id, kind: 'updated' });
    res.json({ success: true, message: `Updated approval route: ${route_id}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/approval-routes/:route_id — delete approval routing rule
app.delete('/api/approval-routes/:route_id', (req, res) => {
  try {
    const { route_id } = req.params;

    const route = getApprovalRoute(route_id);
    if (!route) {
      return res.status(404).json({ error: `Approval route ${route_id} not found` });
    }

    deleteApprovalRoute(route_id);
    emit('approval-routes', { route_id, kind: 'deleted' });
    res.json({ success: true, message: `Deleted approval route: ${route_id}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/approvals/pending — get pending approvals for current user
app.get('/api/approvals/pending', (req, res) => {
  try {
    const approver_id = req.query.approver_id as string | undefined;
    const pending = getPendingApprovals(approver_id);
    res.json(pending);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/approvals/:request_id — get approval request details and status
app.get('/api/approvals/:request_id', (req, res) => {
  try {
    const { request_id } = req.params;

    const request = getApprovalRequest(request_id);
    if (!request) {
      return res.status(404).json({ error: `Approval request ${request_id} not found` });
    }

    try {
      const status = getApprovalStatus(request_id);
      res.json({
        request,
        status,
      });
    } catch (err: any) {
      res.json({ request, status_error: err.message });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/approvals/:request_id/approve — submit approval decision
app.post('/api/approvals/:request_id/approve', (req, res) => {
  try {
    const { request_id } = req.params;
    const { approver_id, reason } = req.body;

    if (!approver_id) {
      return res.status(400).json({ error: 'Missing required field: approver_id' });
    }

    const status = submitApprovalDecision(request_id, approver_id, 'approve', reason);
    emit('approvals', { request_id, kind: 'approve', approver_id });
    res.json({
      success: true,
      message: `Approved by ${approver_id}`,
      status,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/approvals/:request_id/reject — submit rejection decision
app.post('/api/approvals/:request_id/reject', (req, res) => {
  try {
    const { request_id } = req.params;
    const { approver_id, reason } = req.body;

    if (!approver_id) {
      return res.status(400).json({ error: 'Missing required field: approver_id' });
    }

    const status = submitApprovalDecision(request_id, approver_id, 'reject', reason);
    emit('approvals', { request_id, kind: 'reject', approver_id });
    res.json({
      success: true,
      message: `Rejected by ${approver_id}`,
      status,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/approvals/history/:session_id — get approval history for session
app.get('/api/approvals/history/:session_id', (req, res) => {
  try {
    const { session_id } = req.params;

    const requests = getSessionApprovalRequests(session_id);
    res.json({
      session_id,
      approval_requests: requests,
      total: requests.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PHASE 3: Approval Escalation Endpoints
// ============================================================================

// GET /api/escalations/rules — list all escalation rules
app.get('/api/escalations/rules', (req, res) => {
  try {
    const rules = getAllEscalationRules();
    res.json(rules);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/escalations/rules — create escalation rule
app.post('/api/escalations/rules', (req, res) => {
  try {
    const { rule_id, name, escalation_targets, description, timeout_hours } = req.body;
    const created_by = req.body.created_by || 'system';

    if (!rule_id || !name || !Array.isArray(escalation_targets) || escalation_targets.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: rule_id, name, escalation_targets (array)' });
    }

    addEscalationRule(rule_id, name, escalation_targets, created_by, description, timeout_hours);
    emit('escalation-rules', { rule_id, kind: 'added' });
    res.json({ success: true, rule_id, message: `Created escalation rule: ${name}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/escalations/rules/:rule_id — update escalation rule
app.put('/api/escalations/rules/:rule_id', (req, res) => {
  try {
    const { rule_id } = req.params;
    const { name, description, escalation_targets, timeout_hours } = req.body;

    const rule = getEscalationRule(rule_id);
    if (!rule) {
      return res.status(404).json({ error: `Escalation rule ${rule_id} not found` });
    }

    updateEscalationRule(rule_id, { name, description, escalation_targets, timeout_hours });
    emit('escalation-rules', { rule_id, kind: 'updated' });
    res.json({ success: true, message: `Updated escalation rule: ${rule_id}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/escalations/rules/:rule_id — delete escalation rule
app.delete('/api/escalations/rules/:rule_id', (req, res) => {
  try {
    const { rule_id } = req.params;

    const rule = getEscalationRule(rule_id);
    if (!rule) {
      return res.status(404).json({ error: `Escalation rule ${rule_id} not found` });
    }

    deleteEscalationRule(rule_id);
    emit('escalation-rules', { rule_id, kind: 'deleted' });
    res.json({ success: true, message: `Deleted escalation rule: ${rule_id}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/escalations/pending — get pending escalations
app.get('/api/escalations/pending', (req, res) => {
  try {
    const pending = getPendingEscalations();
    res.json(pending);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/escalations/:request_id — get escalation details and status
app.get('/api/escalations/:request_id', (req, res) => {
  try {
    const { request_id } = req.params;

    const request = getEscalationRequest(request_id);
    if (!request) {
      return res.status(404).json({ error: `Escalation request ${request_id} not found` });
    }

    try {
      const status = getEscalationStatus(request_id);
      res.json({
        request,
        status,
      });
    } catch (err: any) {
      res.json({ request, status_error: err.message });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/escalations/:request_id/decide — submit escalation decision
app.post('/api/escalations/:request_id/decide', (req, res) => {
  try {
    const { request_id } = req.params;
    const { target_id, decision, reason } = req.body;

    if (!target_id || !decision) {
      return res.status(400).json({ error: 'Missing required fields: target_id, decision' });
    }

    if (!['proceed', 'block'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be "proceed" or "block"' });
    }

    const status = submitEscalationDecisionManager(request_id, target_id, decision, reason);
    emit('escalations', { request_id, kind: 'decided', decision, target_id });
    emit('approvals', { request_id, kind: 'escalation_decided' });
    res.json({
      success: true,
      message: `${target_id} decided to ${decision}`,
      status,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/escalations/history/:session_id — get escalation history for session
app.get('/api/escalations/history/:session_id', (req, res) => {
  try {
    const { session_id } = req.params;

    const history = getEscalationHistoryForSession(session_id);
    res.json({
      session_id,
      escalation_requests: history,
      total: history.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Phase 4: Remediation Endpoints
// ============================================================================

// POST /api/remediation/assess — analyze risk of session
app.post('/api/remediation/assess', (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) {
      return res.status(400).json({ error: 'Missing required field: session_id' });
    }

    // Get session and actions
    const session = getSession(session_id);
    if (!session) {
      return res.status(404).json({ error: `Session ${session_id} not found` });
    }

    const actions = getSessionActions(session_id);

    // Note: In production, would import and use actual Risk Assessment Engine
    // For now, return placeholder
    res.json({
      session_id,
      action_count: actions.length,
      risk_assessment: {
        score: 5.0,
        level: 'medium',
        message: 'Risk assessment module available in Phase 4A implementation',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/remediation/evaluate-policy — check policy compliance
app.post('/api/remediation/evaluate-policy', (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) {
      return res.status(400).json({ error: 'Missing required field: session_id' });
    }

    // Get session and actions
    const session = getSession(session_id);
    if (!session) {
      return res.status(404).json({ error: `Session ${session_id} not found` });
    }

    res.json({
      session_id,
      violations: [],
      message: 'Policy evaluation module available in Phase 4B implementation',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/remediation/recommend — get remediation strategies
app.post('/api/remediation/recommend', (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) {
      return res.status(400).json({ error: 'Missing required field: session_id' });
    }

    // Get session and actions
    const session = getSession(session_id);
    if (!session) {
      return res.status(404).json({ error: `Session ${session_id} not found` });
    }

    res.json({
      session_id,
      recommendations: {
        primary_strategy: 'escalation',
        alternatives: [],
        message: 'Remediation recommender available in Phase 4C implementation',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/remediation/blocks — list blocked sessions
app.get('/api/remediation/blocks', (req, res) => {
  try {
    res.json({
      blocks: [],
      total: 0,
      message: 'Auto-block storage available in Phase 4D implementation',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/remediation/blocks/:block_id/unblock — admin override
app.post('/api/remediation/blocks/:block_id/unblock', (req, res) => {
  try {
    const { block_id } = req.params;
    const { reason } = req.body;

    // Check admin role (placeholder)
    const isAdmin = req.headers['x-user-role'] === 'admin';
    if (!isAdmin) {
      return res.status(401).json({ error: 'Admin role required to override blocks' });
    }

    res.json({
      block_id,
      unblocked: true,
      unblock_reason: reason,
      message: 'Block override recorded',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/remediation/policies — list active policies
app.get('/api/remediation/policies', (req, res) => {
  try {
    res.json({
      policies: [],
      total: 0,
      message: 'Policy storage available in Phase 4B implementation',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/remediation/policies — create policy
app.post('/api/remediation/policies', (req, res) => {
  try {
    const { name, description, category, rules } = req.body;

    if (!name || !category) {
      return res.status(400).json({ error: 'Missing required fields: name, category' });
    }

    res.status(201).json({
      policy_id: `policy-${Date.now()}`,
      name,
      description,
      category,
      rules: rules || [],
      enabled: true,
      created_at: new Date().toISOString(),
      message: 'Policy creation implemented in Phase 4B',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/remediation/policies/:policy_id — update policy
app.put('/api/remediation/policies/:policy_id', (req, res) => {
  try {
    const { policy_id } = req.params;
    const { name, description, enabled, rules } = req.body;

    res.json({
      policy_id,
      name,
      description,
      enabled,
      rules,
      updated_at: new Date().toISOString(),
      message: 'Policy update implemented in Phase 4B',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/remediation/policies/:policy_id — delete policy
app.delete('/api/remediation/policies/:policy_id', (req, res) => {
  try {
    const { policy_id } = req.params;

    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback: serve UI for any unmatched route. If the dashboard hasn't been
// built yet, emit a friendly setup banner instead of a 404.
// API paths that reach here have no matching route — return JSON so the
// client never receives HTML and silently misparses it as a JSON error.
app.get('*', (_req, res) => {
  if (_req.path.startsWith('/api/')) {
    return res.status(404).json({ error: `No route: ${_req.method} ${_req.path}` });
  }
  if (UI_BUILT) {
    return res.sendFile(UI_INDEX);
  }
  res.status(503).type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"/><title>Waymark — dashboard not built</title>
<style>body{font:14px/1.5 -apple-system,system-ui,sans-serif;color:#1d2126;background:#fafaf8;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:520px;padding:32px}h1{margin:0 0 8px;font-size:18px}code{background:#ebebe8;padding:2px 6px;border-radius:4px;font-family:ui-monospace,Menlo,monospace}</style>
</head><body><main>
<h1>Dashboard not built</h1>
<p>The Waymark API is running, but the React dashboard hasn't been built yet.</p>
<p>Run <code>npm run build -w @way_marks/web</code> from the project root, then refresh.</p>
</main></body></html>`);
});

app.listen(PORT, () => {
  console.log(`Waymark UI + API running at http://localhost:${PORT}`);
});

export default app;
