import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgentSnapshot, useAgentHistory, useKillOrphanPort } from '@/api/hooks';
import type { AgentSession, AgentHistoryEntry } from '@/api/types';
import { SessionCard } from './SessionCard';
import { RateLimitBadge } from './RateLimitBadge';
import { PortsList } from './PortsList';
import { Icon } from '@/components/Icon';
import { cn, timeAgo } from '@/lib/format';
import { useUI } from '@/store/ui';

type AgentFilter = 'all' | 'claude' | 'codex' | 'copilot';
type StatusFilter = 'all' | 'active' | 'waiting' | 'done';
type TabId = 'sessions' | 'rate-limits' | 'ports' | 'history';

interface DetailModal { open: boolean; title: string; content: string; }

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

function fmtDuration(startMs: number, endMs: number): string {
  const s = Math.floor((endMs - startMs) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function fmtTokens(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function AgentMonitorView() {
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tab, setTab] = useState<TabId>('sessions');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<DetailModal>({ open: false, title: '', content: '' });
  const [showAllTools, setShowAllTools] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [historyAgentFilter, setHistoryAgentFilter] = useState<string>('all');
  const navigate = useNavigate();
  const { setSearch } = useUI();
  const { data: historyData } = useAgentHistory();
  const killPort = useKillOrphanPort();

  const openModal = (title: string, content: string) =>
    setModal({ open: true, title, content });

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
        {(['sessions', 'rate-limits', 'ports', 'history'] as TabId[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={cn('tab-btn', tab === t && 'active')}
            onClick={() => setTab(t)}
          >
            {t === 'sessions' ? `Sessions (${sessions.length})`
              : t === 'rate-limits' ? 'Rate Limits'
              : t === 'ports' ? 'Ports'
              : `History (${(historyData?.history ?? []).length})`}
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
                <h2 className="detail-title">
                  Session detail — {selected.agentCli}
                  {selected.isWaymarkControlled && (
                    <span className="badge badge-waymark" title="Tool calls intercepted by Waymark">⬡ Waymark</span>
                  )}
                </h2>
                <button className="btn ghost" onClick={() => setSelectedId(null)}>
                  <Icon name="x" size={14} />
                </button>
              </div>
              <div className="session-detail-scroll">
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

                {selected.initialPrompt && (
                  <div className="detail-section">
                    <h3>
                      Initial prompt
                      <button className="btn ghost detail-expand-btn"
                        onClick={() => openModal('Initial prompt', selected.initialPrompt)}>
                        view full
                      </button>
                    </h3>
                    <pre className="detail-prompt-preview">{selected.initialPrompt.slice(0, 300)}{selected.initialPrompt.length > 300 ? '…' : ''}</pre>
                  </div>
                )}

                {(selected.toolCalls ?? []).length > 0 && (
                  <div className="detail-section">
                    <h3>
                      Tool calls ({(selected.toolCalls ?? []).length})
                      {!showAllTools && (selected.toolCalls ?? []).length > 8 && (
                        <button className="btn ghost detail-expand-btn" onClick={() => setShowAllTools(true)}>
                          show all {(selected.toolCalls ?? []).length}
                        </button>
                      )}
                    </h3>
                    <ul className="tool-calls-list">
                      {(selected.toolCalls ?? []).slice(0, showAllTools ? undefined : 8).map((tc, i) => (
                        <li key={i} className="tool-call-item clickable"
                          onClick={() => openModal(`Tool call: ${tc.name}`, tc.arg || '(no args)')}
                          title="Click to view full content">
                          <code>{tc.name}</code>
                          <span className="tool-arg">{tc.arg}</span>
                          {tc.durationMs > 0 && <span className="tool-duration">{tc.durationMs}ms</span>}
                        </li>
                      ))}
                    </ul>
                    {showAllTools && (
                      <button className="btn ghost detail-expand-btn" onClick={() => setShowAllTools(false)}>
                        collapse
                      </button>
                    )}
                  </div>
                )}

                {(selected.fileAccesses ?? []).length > 0 && (
                  <div className="detail-section">
                    <h3>
                      File accesses ({(selected.fileAccesses ?? []).length})
                      {!showAllFiles && (selected.fileAccesses ?? []).length > 10 && (
                        <button className="btn ghost detail-expand-btn" onClick={() => setShowAllFiles(true)}>
                          show all {(selected.fileAccesses ?? []).length}
                        </button>
                      )}
                    </h3>
                    <ul className="file-access-list">
                      {(selected.fileAccesses ?? []).slice(0, showAllFiles ? undefined : 10).map((fa, i) => (
                        <li key={i} className="file-access-item">
                          <span className="fa-op">{fa.operation}</span>
                          <button
                            className="btn ghost"
                            style={{ padding: 0, fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'left' }}
                            onClick={() => { setSearch(fa.path); navigate('/'); }}
                            title="Filter actions by this path"
                          >
                            {fa.path}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {showAllFiles && (
                      <button className="btn ghost detail-expand-btn" onClick={() => setShowAllFiles(false)}>
                        collapse
                      </button>
                    )}
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
            onKillOrphan={(pid) => killPort.mutate(pid)}
          />
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="tab-content">
          <div className="filter-row" style={{ marginBottom: 12 }}>
            <select
              className="filter-select"
              value={historyAgentFilter}
              onChange={(e) => setHistoryAgentFilter(e.target.value)}
            >
              <option value="all">All agents</option>
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
          </div>
          {(historyData?.history ?? []).length === 0 ? (
            <div className="empty-state">
              <Icon name="agent" size={32} />
              <p>No agent history yet.</p>
              <p className="text-muted">Completed agent sessions will appear here.</p>
            </div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Project</th>
                  <th>Duration</th>
                  <th>Tokens</th>
                  <th>Turns</th>
                  <th>Model</th>
                  <th>Waymark</th>
                  <th>Ended</th>
                </tr>
              </thead>
              <tbody>
                {(historyData?.history ?? [])
                  .filter((h: AgentHistoryEntry) => historyAgentFilter === 'all' || h.agentCli === historyAgentFilter)
                  .map((h: AgentHistoryEntry) => (
                    <tr key={h.sessionId}>
                      <td><span className="badge badge-default">{h.agentCli}</span></td>
                      <td>{h.projectName || <span className="text-muted">{h.cwd}</span>}</td>
                      <td>{h.startedAt && h.endedAt ? fmtDuration(h.startedAt, h.endedAt) : '—'}</td>
                      <td>{fmtTokens((h.totalInputTokens ?? 0) + (h.totalOutputTokens ?? 0))}</td>
                      <td>{h.turnCount}</td>
                      <td className="text-muted">{h.model || '—'}</td>
                      <td>{h.waymarkControlled ? <span className="badge badge-waymark">⬡</span> : <span className="text-muted">—</span>}</td>
                      <td className="text-muted">{h.endedAt ? timeAgo(new Date(h.endedAt).toISOString()) : '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Full-content detail modal */}
      {modal.open && (
        <div className="detail-modal-overlay" onClick={() => setModal({ open: false, title: '', content: '' })}>
          <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="detail-modal-header">
              <h3>{modal.title}</h3>
              <button className="btn ghost" onClick={() => setModal({ open: false, title: '', content: '' })}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <pre className="detail-modal-pre">{modal.content}</pre>
          </div>
        </div>
      )}
    </>
  );
}
