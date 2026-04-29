import type { AgentSession } from '@/api/types';
import { cn } from '@/lib/format';

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
        <span className="session-pid">PID {session.pid}</span>
        <span className="session-age">{ageStr(session.startedAt)}</span>
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
        </div>

        <div className="metric-item">
          <div className="metric-label">Tokens</div>
          <div className="metric-value">{fmtTokens(totalTokens)}</div>
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
