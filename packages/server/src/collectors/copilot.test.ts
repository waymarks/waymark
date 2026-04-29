/**
 * Fixture-based integration test for the GitHub Copilot CLI collector.
 *
 * Locks the contract that all event payloads are nested under `ev.data` and
 * that a malformed line in `events.jsonl` does not poison the whole session.
 *
 * The fixture lives at __fixtures__/copilot/<uuid>/ and looks like a real
 * `~/.copilot/session-state/<uuid>/` directory:
 *
 *   workspace.yaml      — flat key:value, no yaml dep needed
 *   inuse.<pid>.lock    — empty file; presence + filename → active PID
 *   events.jsonl        — one canonical event of each type the collector reads,
 *                         plus one malformed line in the middle to confirm the
 *                         per-line try/catch keeps the session alive
 *
 * The PID 99999 is intentionally chosen to never be running. The collector
 * still surfaces the session because the lock file alone marks it active —
 * `pidAlive` flips to false but the row stays.
 */

import * as path from 'path';
import { CopilotCollector } from './copilot';
import { ProcInfo } from './types';

const FIXTURE_SESSIONS_DIR = path.join(__dirname, '__fixtures__', 'copilot');
const SESSION_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function emptyMaps() {
  return {
    proc: new Map<number, ProcInfo>(),
    children: new Map<number, number[]>(),
    ports: new Map<number, number[]>(),
    git: new Map<string, { added: number; modified: number }>(),
  };
}

describe('CopilotCollector — fixture-based integration', () => {
  it('discovers a session from the lock file', () => {
    const c = new CopilotCollector(FIXTURE_SESSIONS_DIR);
    const m = emptyMaps();
    const sessions = c.collect(m.proc, m.children, m.ports, m.git);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.sessionId).toBe(SESSION_UUID);
    expect(sessions[0]!.pid).toBe(99999);
    expect(sessions[0]!.agentCli).toBe('copilot');
  });

  it('extracts model + cwd + branch + currentTask from workspace.yaml + events.jsonl', () => {
    const c = new CopilotCollector(FIXTURE_SESSIONS_DIR);
    const m = emptyMaps();
    const [s] = c.collect(m.proc, m.children, m.ports, m.git);
    expect(s!.cwd).toBe('/tmp/fixture-project');
    expect(s!.gitBranch).toBe('main');
    expect(s!.model).toBe('claude-sonnet-4-6');
    // currentTasks[0] is the workspace.yaml `summary` field — Copilot's
    // canonical "what is this session about" answer. Per-message content lives
    // in events.jsonl but is too noisy to surface as the task.
    expect(s!.currentTasks[0]).toContain('Fixture session');
  });

  it('sums output tokens across assistant.message events', () => {
    const c = new CopilotCollector(FIXTURE_SESSIONS_DIR);
    const m = emptyMaps();
    const [s] = c.collect(m.proc, m.children, m.ports, m.git);
    // m1: 250 + m2: 420 + m3: 180 = 850. The malformed line between m2 and m3
    // must NOT cause m3 to be lost.
    expect(s!.totalOutputTokens).toBe(850);
  });

  it('records turn count from assistant.turn_end events', () => {
    const c = new CopilotCollector(FIXTURE_SESSIONS_DIR);
    const m = emptyMaps();
    const [s] = c.collect(m.proc, m.children, m.ports, m.git);
    expect(s!.turnCount).toBe(1);
  });

  it('reads context tokens from session.compaction_complete', () => {
    const c = new CopilotCollector(FIXTURE_SESSIONS_DIR);
    const m = emptyMaps();
    const [s] = c.collect(m.proc, m.children, m.ports, m.git);
    // Indirect signal: contextPercent computed against contextWindow > 0
    // means preCompactionTokens was successfully read from data.preCompactionTokens.
    expect(s!.contextPercent).toBeGreaterThan(0);
  });

  it('captures tool calls', () => {
    const c = new CopilotCollector(FIXTURE_SESSIONS_DIR);
    const m = emptyMaps();
    const [s] = c.collect(m.proc, m.children, m.ports, m.git);
    expect(s!.toolCalls.length).toBeGreaterThanOrEqual(1);
    const readTool = s!.toolCalls.find((tc) => tc.name === 'read_file');
    expect(readTool).toBeDefined();
  });

  it('returns nothing when the sessions dir does not exist', () => {
    const c = new CopilotCollector('/no/such/dir/exists');
    const m = emptyMaps();
    expect(c.collect(m.proc, m.children, m.ports, m.git)).toEqual([]);
  });
});
