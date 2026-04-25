import { useMemo } from 'react';
import { ActionRow } from '@/components/ActionRow';
import { SessionGroup } from '@/components/SessionGroup';
import { Drawer } from '@/components/Drawer';
import type { ActionRow as ActionRowT } from '@/api/types';
import { useActions } from '@/api/hooks';
import { groupBySession } from '@/lib/format';
import { useUI, type ActionsFilter } from '@/store/ui';
import { cn } from '@/lib/format';

const FILTERS: ActionsFilter[] = ['all', 'pending', 'blocked', 'errors', 'writes', 'bash'];

export function ActionsView() {
  const { data: actions = [], isLoading, isError, error } = useActions();
  const { filter, setFilter, search, grouping, selectedActionId, setSelectedActionId } = useUI();

  const counts = useMemo(
    () => ({
      all: actions.length,
      pending: actions.filter((a) => a.status === 'pending').length,
      blocked: actions.filter((a) => a.status === 'blocked' || a.decision === 'block').length,
      errors: actions.filter((a) => a.status === 'error').length,
      writes: actions.filter((a) => a.tool_name === 'write_file').length,
      bash: actions.filter((a) => a.tool_name === 'bash').length,
    }),
    [actions],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return actions.filter((a) => {
      if (filter === 'pending' && a.status !== 'pending') return false;
      if (filter === 'blocked' && a.status !== 'blocked' && a.decision !== 'block') return false;
      if (filter === 'errors' && a.status !== 'error') return false;
      if (filter === 'writes' && a.tool_name !== 'write_file') return false;
      if (filter === 'bash' && a.tool_name !== 'bash') return false;
      if (q) {
        const hay = [
          a.tool_name,
          a.target_path || '',
          a.intent || '',
          a.input_payload || '',
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [actions, filter, search]);

  const selectedAction = useMemo(
    () => actions.find((a) => a.action_id === selectedActionId) ?? null,
    [actions, selectedActionId],
  );

  const onOpen = (row: ActionRowT) => setSelectedActionId(row.action_id);
  const onCloseDrawer = () => setSelectedActionId(null);

  const groups = useMemo(() => groupBySession(filtered), [filtered]);
  const pending = counts.pending;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Actions</h1>
          <p className="page-sub">Every MCP tool call intercepted by Waymark, with policy decision and full payload.</p>
        </div>
        <div className="page-meta">
          {counts.all > 0 && <span>{counts.all} total</span>}
          {pending > 0 && <span className="live" style={{ color: 'var(--pending)' }}>{pending} pending</span>}
        </div>
      </div>

      {pending > 0 && (
        <div className="approval-banner" role="status">
          <span className="approval-banner-dot" aria-hidden />
          <div className="approval-banner-text">
            <div className="approval-banner-title">
              {pending} action{pending === 1 ? '' : 's'} awaiting approval
            </div>
            <div className="approval-banner-sub">Agent is paused until you decide.</div>
          </div>
          <button className="btn primary" onClick={() => setFilter('pending')}>Review →</button>
        </div>
      )}

      {isError && (
        <div className="banner err">
          Couldn't reach the Waymark API. {error instanceof Error ? error.message : ''}
        </div>
      )}

      <div className="pill-row" role="tablist" aria-label="Action filters">
        {FILTERS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={filter === k}
            className={cn('pill', filter === k && 'active', k === 'pending' && pending > 0 && 'attn')}
            onClick={() => setFilter(k)}
          >
            {k}
            <span className="pill-count">{counts[k]}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, padding: 14, borderTop: i ? '1px solid var(--line)' : 'none' }}>
                <div className="skeleton" style={{ width: 54, height: 14 }} />
                <div className="skeleton" style={{ width: 90, height: 18 }} />
                <div className="skeleton" style={{ flex: 1, height: 18 }} />
                <div className="skeleton" style={{ width: 70, height: 18 }} />
              </div>
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyActions hasAny={actions.length > 0} />
      ) : grouping === 'session' ? (
        <div>
          {groups.map((g) => (
            <SessionGroup key={g.session_id} group={g} focusedId={selectedActionId} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {filtered.map((a) => (
            <ActionRow key={a.action_id} row={a} focused={a.action_id === selectedActionId} onOpen={onOpen} />
          ))}
        </div>
      )}

      <Drawer action={selectedAction} onClose={onCloseDrawer} />
    </>
  );
}

function EmptyActions({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="empty">
      <div className="empty-title">{hasAny ? 'No actions match.' : 'No actions yet.'}</div>
      <div className="empty-sub">
        {hasAny
          ? 'Try a different filter or clear the search.'
          : 'Actions will appear here the moment an agent calls an MCP tool. Waymark intercepts every call, applies your policy, and logs it.'}
      </div>
      {!hasAny && (
        <div className="empty-hint">npx @way_marks/cli status</div>
      )}
    </div>
  );
}
