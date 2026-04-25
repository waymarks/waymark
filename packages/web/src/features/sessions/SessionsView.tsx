import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { ActionRow } from '@/components/ActionRow';
import { Drawer } from '@/components/Drawer';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useActions, useRollbackSession } from '@/api/hooks';
import { cn, parseServerDate, timeAgo } from '@/lib/format';
import { useUI } from '@/store/ui';
import type { ActionRow as ActionRowT } from '@/api/types';

interface Aggregate {
  session_id: string;
  latest: number;
  live: boolean;
  total: number;
  pending: number;
  errors: number;
  writes: number;
  rolledBack: number;
  rows: ActionRowT[];
  started: string;
}

export function SessionsView() {
  const { data: actions = [], isLoading, isError, error } = useActions();
  const { selectedActionId, setSelectedActionId } = useUI();
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const rollback = useRollbackSession();

  const aggregates = useMemo<Aggregate[]>(() => {
    const byId = new Map<string, ActionRowT[]>();
    for (const a of actions) {
      const sid = a.session_id || 'unknown';
      if (!byId.has(sid)) byId.set(sid, []);
      byId.get(sid)!.push(a);
    }
    const now = Date.now();
    const out: Aggregate[] = [];
    for (const [sid, rows] of byId.entries()) {
      const ts = (r: ActionRowT) => parseServerDate(r.created_at)?.getTime() ?? 0;
      rows.sort((x, y) => ts(y) - ts(x));
      const latest = ts(rows[0]);
      out.push({
        session_id: sid,
        latest,
        live: now - latest < 5 * 60 * 1000,
        total: rows.length,
        pending: rows.filter((r) => r.status === 'pending').length,
        errors: rows.filter((r) => r.status === 'error' || r.status === 'blocked' || r.status === 'rejected').length,
        writes: rows.filter((r) => r.tool_name === 'write_file' && !r.rolled_back).length,
        rolledBack: rows.filter((r) => r.rolled_back).length,
        rows,
        started: rows[rows.length - 1].created_at,
      });
    }
    out.sort((a, b) => b.latest - a.latest);
    return out;
  }, [actions]);

  const selectedAction = useMemo(
    () => actions.find((a) => a.action_id === selectedActionId) ?? null,
    [actions, selectedActionId],
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sessions</h1>
          <p className="page-sub">
            One session = one agent process. Atomic rollback restores every action in a session to its before-snapshot.
          </p>
        </div>
        <div className="page-meta">
          {aggregates.length > 0 && <span>{aggregates.length} session{aggregates.length === 1 ? '' : 's'}</span>}
        </div>
      </div>

      {isError && (
        <div className="banner err">
          Couldn't load sessions. {error instanceof Error ? error.message : ''}
        </div>
      )}

      {isLoading && aggregates.length === 0 ? (
        <div className="card">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{ padding: 18, borderTop: i ? '1px solid var(--line)' : 'none' }}>
              <div className="skeleton" style={{ width: '40%', height: 14, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '80%', height: 10 }} />
            </div>
          ))}
        </div>
      ) : aggregates.length === 0 ? (
        <div className="empty">
          <div className="empty-title">No sessions yet.</div>
          <div className="empty-sub">A session starts when an agent first calls an MCP tool.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {aggregates.map((g) => {
            const isOpen = openSession === g.session_id;
            const canRollback = g.writes > 0 && g.rolledBack < g.total;
            return (
              <article
                key={g.session_id}
                className={cn('card', g.live && 'live-card')}
                style={g.live ? { borderColor: 'oklch(0.74 0.13 155 / 0.35)' } : undefined}
              >
                <header className="card-header" style={{ flexWrap: 'wrap', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <div className="session-avatar">{g.session_id.slice(0, 2).toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="card-title" style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                        <code>{g.session_id}</code>
                        {g.live && <span className="session-live-tag">live</span>}
                      </div>
                      <div className="card-sub mono" style={{ marginTop: 2 }}>
                        {g.total} actions · started {timeAgo(g.started)} · latest {timeAgo(new Date(g.latest).toISOString())}
                      </div>
                    </div>
                  </div>

                  <div className="session-stats" style={{ flexShrink: 0 }}>
                    <span className="stat"><strong>{g.total}</strong> actions</span>
                    <span className="stat"><strong>{g.writes}</strong> writes</span>
                    {g.pending > 0 && <span className="stat warn"><strong>{g.pending}</strong> pending</span>}
                    {g.errors > 0 && <span className="stat err"><strong>{g.errors}</strong> errors</span>}
                    {g.rolledBack > 0 && <span className="stat"><strong>{g.rolledBack}</strong> reverted</span>}
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      className="btn"
                      onClick={() => setOpenSession(isOpen ? null : g.session_id)}
                      aria-expanded={isOpen}
                    >
                      <Icon name="chevron" size={12} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                      {isOpen ? 'Hide actions' : 'Show actions'}
                    </button>
                    <button
                      className="btn danger"
                      disabled={!canRollback || rollback.isPending}
                      onClick={() => setConfirm(g.session_id)}
                    >
                      <Icon name="rollback" size={12} />
                      Rollback
                    </button>
                  </div>
                </header>

                {isOpen && (
                  <div className="card-body flush">
                    {g.rows.map((r) => (
                      <ActionRow
                        key={r.action_id}
                        row={r}
                        focused={r.action_id === selectedActionId}
                        onOpen={(row) => setSelectedActionId(row.action_id)}
                      />
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={confirm !== null}
        title="Roll back entire session?"
        body={
          <span>
            Every write in this session will be restored to its before-snapshot. Reads and bash commands are ignored.
            This cannot be undone.
          </span>
        }
        confirmLabel="Roll back session"
        tone="danger"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) rollback.mutate(confirm);
          setConfirm(null);
        }}
      />

      <Drawer action={selectedAction} onClose={() => setSelectedActionId(null)} />
    </>
  );
}
