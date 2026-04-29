import { useState } from 'react';
import { useAgentSnapshot } from '@/api/hooks';
import type { AgentSession } from '@/api/types';
import { SessionCard } from './SessionCard';
import { RateLimitBadge } from './RateLimitBadge';
import { PortsList } from './PortsList';
import { Icon } from '@/components/Icon';
import { cn } from '@/lib/format';

type AgentFilter = 'all' | 'claude' | 'codex' | 'copilot';
type StatusFilter = 'all' | 'active' | 'waiting' | 'done';
type TabId = 'sessions' | 'rate-limits' | 'ports';

// Match the canonical SessionStatus union (collectors/types.ts).
// Server-side MultiCollector.tick() normalization guarantees one of these values.
const ACTIVE_STATUSES = new Set(['thinking', 'executing']);
const WAITING_STATUSES = new Set(['waiting', 'rateLimited']);
const DONE_STATUSES = new Set(['done']);

function matchesStatus(session: AgentSession, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return ACTIVE_STATUSES.has(session.status);
  if (filter === 'waiting') return WAITING_STATUSES.has(session.status);
  if (filter === 'done') return DONE_STATUSES.has(session.status);
  return true;
}

export function AgentMonitorView() {
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tab, setTab] = useState<TabId>('sessions');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: snapshot, isLoading, isError, error, dataUpdatedAt } = useAgentSnapshot();

  const sessions = (snapshot?.sessions ?? []).filter((s) => {
    if (agentFilter !== 'all' && s.agentCli !== agentFilter) return false;
    if (!matchesStatus(s, statusFilter)) return false;
    return true;
  });

  const activeSessions = (snapshot?.sessions ?? []).filter((s) => ACTIVE_STATUSES.has(s.status));
  const selected = sessions.find((s) => s.sessionId === selectedId) ?? null;

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Agent Monitor</h1>
          <p className="page-sub">
            Live view of running AI agent sessions (Claude, Codex, GitHub Copilot CLI).
            Refreshes every 3 seconds.
          </p>
        </div>
        <div className="page-meta">
          <span>{(snapshot?.sessions ?? []).length} total</span>
          {activeSessions.length > 0 && <span className="badge-ok">{activeSessions.length} active</span>}
          {lastUpdated && <span className="text-muted">updated {lastUpdated}</span>}
        </div>
      </div>

      {isError && (
        <div className="banner err">
          Cannot reach agent monitor. {error instanceof Error ? error.message : ''}
        </div>
      )}

      {/* Tabs */}
      <div className="tab-row" role="tablist">
        {(['sessions', 'rate-limits', 'ports'] as TabId[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={cn('tab-btn', tab === t && 'active')}
            onClick={() => setTab(t)}
          >
            {t === 'sessions' ? `Sessions (${sessions.length})` : t === 'rate-limits' ? 'Rate Limits' : 'Ports'}
          </button>
        ))}
      </div>

      {/* Sessions tab */}
      {tab === 'sessions' && (
        <>
          {/* Filters */}
          <div className="filter-row">
            <div className="filter-group" role="group" aria-label="Agent filter">
              {(['all', 'claude', 'codex', 'copilot'] as AgentFilter[]).map((f) => (
                <button
                  key={f}
                  className={cn('filter-btn', agentFilter === f && 'active')}
                  onClick={() => setAgentFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="filter-group" role="group" aria-label="Status filter">
              {(['all', 'active', 'waiting', 'done'] as StatusFilter[]).map((f) => (
                <button
                  key={f}
                  className={cn('filter-btn', statusFilter === f && 'active')}
                  onClick={() => setStatusFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {isLoading && !snapshot ? (
            <div className="empty-state">
              <Icon name="agent" size={32} />
              <p>Loading agent sessions…</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="empty-state">
              <Icon name="agent" size={32} />
              <p>No agent sessions found.</p>
              {agentFilter !== 'all' && <p className="text-muted">Filtered by: {agentFilter}</p>}
              {statusFilter !== 'all' && <p className="text-muted">Status: {statusFilter}</p>}
            </div>
          ) : (
            <div className="session-grid">
              {sessions.map((s) => (
                <SessionCard
                  key={s.sessionId}
                  session={s}
                  selected={s.sessionId === selectedId}
                  onClick={() => setSelectedId(s.sessionId === selectedId ? null : s.sessionId)}
                />
              ))}
            </div>
          )}

          {/* Detail panel */}
          {selected && (
            <div className="session-detail">
              <div className="detail-header">
                <h2 className="detail-title">Session detail — {selected.agentCli}</h2>
                <button className="btn ghost" onClick={() => setSelectedId(null)}>
                  <Icon name="x" size={14} />
                </button>
              </div>
              <dl className="detail-grid">
                <dt>Session ID</dt><dd><code>{selected.sessionId}</code></dd>
                <dt>PID</dt><dd>{selected.pid}</dd>
                <dt>CWD</dt><dd><code>{selected.cwd}</code></dd>
                <dt>Model</dt><dd>{selected.model || '—'}</dd>
                <dt>Turns</dt><dd>{selected.turnCount}</dd>
                <dt>Compactions</dt><dd>{selected.compactionCount}</dd>
                <dt>Context window</dt><dd>{(selected.contextWindow ?? 0).toLocaleString()} tokens</dd>
                <dt>Input tokens</dt><dd>{(selected.totalInputTokens ?? 0).toLocaleString()}</dd>
                <dt>Output tokens</dt><dd>{(selected.totalOutputTokens ?? 0).toLocaleString()}</dd>
                {(selected.totalCacheRead ?? 0) > 0 && <><dt>Cache read</dt><dd>{selected.totalCacheRead.toLocaleString()}</dd></>}
                {selected.version && <><dt>Version</dt><dd>{selected.version}</dd></>}
              </dl>

              {(selected.toolCalls ?? []).length > 0 && (
                <div className="detail-section">
                  <h3>Recent tool calls</h3>
                  <ul className="tool-calls-list">
                    {(selected.toolCalls ?? []).slice(0, 20).map((tc, i) => (
                      <li key={i} className="tool-call-item">
                        <code>{tc.name}</code>
                        <span className="tool-arg">{tc.arg}</span>
                        {tc.durationMs > 0 && <span className="tool-duration">{tc.durationMs}ms</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(selected.fileAccesses ?? []).length > 0 && (
                <div className="detail-section">
                  <h3>File accesses</h3>
                  <ul className="file-access-list">
                    {(selected.fileAccesses ?? []).slice(0, 30).map((fa, i) => (
                      <li key={i} className="file-access-item">
                        <span className="fa-op">{fa.operation}</span>
                        <code>{fa.path}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(selected.children ?? []).length > 0 && (
                <div className="detail-section">
                  <h3>Child processes</h3>
                  <ul className="children-list">
                    {(selected.children ?? []).map((c) => (
                      <li key={c.pid}>
                        <code>{c.command}</code> (PID {c.pid})
                        {c.port && <> · port {c.port}</>}
                        {c.memKb > 0 && <> · {Math.round(c.memKb / 1024)} MB</>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Rate limits tab */}
      {tab === 'rate-limits' && (
        <div className="tab-content">
          <RateLimitBadge rateLimits={snapshot?.rateLimits ?? []} />
        </div>
      )}

      {/* Ports tab */}
      {tab === 'ports' && (
        <div className="tab-content">
          <PortsList
            agentPorts={snapshot?.sessions.flatMap((s) =>
              (s.children ?? [])
                .filter((c) => c.port)
                .map((c) => ({ port: c.port!, pid: c.pid, command: c.command, sessionId: s.sessionId, agentCli: s.agentCli }))
            ) ?? []}
            orphanPorts={snapshot?.orphanPorts ?? []}
          />
        </div>
      )}
    </>
  );
}
