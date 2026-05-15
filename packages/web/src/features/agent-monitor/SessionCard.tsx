import type { AgentSession } from '@/api/types';
import { cn } from '@/lib/format';
import { usePauseAgentSession, useResumeAgentSession } from '@/api/hooks';

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const pts = data.slice(-20);
  if (pts.length < 2) return null;
  const max = Math.max(...pts, 1);
  const coords = pts.map((v, i) =>
    `${(i / (pts.length - 1)) * 58},${18 - (v / max) * 16}`
  ).join(' ');
  return (
    <svg width="60" height="20" className="sparkline" aria-hidden="true">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function ageStr(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function statusClass(status: string): string {
  switch (status) {
    case 'thinking':
    case 'running':
    case 'executing': return 'badge-executing';
    case 'waiting':
    case 'pending':
    case 'idle':      return 'badge-waiting';
    case 'done':
    case 'completed': return 'badge-ok';
    case 'error':     return 'badge-err';
    default:          return 'badge-default';
  }
}

function fmtTokens(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface Props {
  session: AgentSession;
  selected?: boolean;
  onClick?: () => void;
}

export function SessionCard({ session, selected, onClick }: Props) {
  const totalTokens = (session.totalInputTokens ?? 0) + (session.totalOutputTokens ?? 0);
  const task = session.currentTasks?.[0] ?? null;
  const pause = usePauseAgentSession();
  const resume = useResumeAgentSession();
  const isActive = session.status === 'thinking' || session.status === 'executing' || session.status === 'running';

  // Sparkline data
  const tokenHistory = session.tokenHistory ?? [];
  const ctxHistory = session.contextHistory ?? [];
  const ctxWindow = session.contextWindow || 200_000;
  const ctxPctHistory = ctxHistory.map((t) => Math.round((t / ctxWindow) * 100));
  const lastCtxPct = ctxPctHistory[ctxPctHistory.length - 1] ?? 0;
  const ctxColor = lastCtxPct >= 85 ? 'var(--err)' : lastCtxPct >= 60 ? 'var(--warn)' : 'var(--ok)';

  // Token burn rate (tokens added in last turn)
  const burnRate = tokenHistory.length >= 2
    ? tokenHistory[tokenHistory.length - 1] - tokenHistory[tokenHistory.length - 2]
    : 0;

  return (
    <div
      className={cn('session-card', selected && 'selected')}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      aria-selected={selected}
    >
      <div className="session-card-header">
        <span className={cn('badge', statusClass(session.status))}>{session.status}</span>
        <span className="session-agent">{session.agentCli}</span>
        {session.isWaymarkControlled && (
          <span className="badge badge-waymark" title="Tool calls intercepted by Waymark policy">⬡ W</span>
        )}
        <span className="session-pid">PID {session.pid}</span>
        <span className="session-age">{ageStr(session.startedAt)}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          {isActive ? (
            <button
              className="btn"
              style={{ fontSize: 10, padding: '2px 7px' }}
              disabled={pause.isPending}
              onClick={() => pause.mutate(session.sessionId)}
              title="Pause agent (SIGSTOP)"
            >
              Pause
            </button>
          ) : (
            <button
              className="btn ok"
              style={{ fontSize: 10, padding: '2px 7px' }}
              disabled={resume.isPending}
              onClick={() => resume.mutate(session.sessionId)}
              title="Resume agent (SIGCONT)"
            >
              Resume
            </button>
          )}
        </div>
      </div>

      <div className="session-project">{session.projectName || session.cwd}</div>

      {task && <div className="session-task">{task}</div>}

      <div className="session-metrics">
        <div className="metric-item">
          <div className="metric-label">Context</div>
          <div className="context-bar">
            <div
              className={cn('context-fill', session.contextPercent > 80 && 'context-fill-warn')}
              style={{ width: `${Math.min(100, session.contextPercent)}%` }}
            />
          </div>
          <div className="metric-value">{Math.round(session.contextPercent)}%</div>
          {ctxPctHistory.length >= 2 && (
            <Sparkline data={ctxPctHistory} color={ctxColor} />
          )}
        </div>

        <div className="metric-item">
          <div className="metric-label">Tokens</div>
          <div className="metric-value">
            {fmtTokens(totalTokens)}
            {burnRate > 0 && <span className="burn-rate">+{fmtTokens(burnRate)}/turn</span>}
          </div>
          {tokenHistory.length >= 2 && (
            <Sparkline data={tokenHistory} color="var(--acc)" />
          )}
        </div>

        <div className="metric-item">
          <div className="metric-label">Turns</div>
          <div className="metric-value">{session.turnCount}</div>
        </div>

        {session.memMb > 0 && (
          <div className="metric-item">
            <div className="metric-label">Mem</div>
            <div className="metric-value">{Math.round(session.memMb)} MB</div>
          </div>
        )}
      </div>

      {(session.gitBranch || session.gitAdded + session.gitModified > 0) && (
        <div className="session-git">
          {session.gitBranch && <span className="git-branch">⎇ {session.gitBranch}</span>}
          {session.gitAdded > 0 && <span className="git-added">+{session.gitAdded}</span>}
          {session.gitModified > 0 && <span className="git-modified">~{session.gitModified}</span>}
        </div>
      )}

      {session.model && (
        <div className="session-model">{session.model}</div>
      )}
    </div>
  );
}
