import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  useAddApprovalRoute,
  useApprovalRoutes,
  useDeleteApprovalRoute,
  useTeam,
} from '@/api/hooks';
import { timeAgo } from '@/lib/format';

function parseList(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function ApprovalRoutesPage() {
  const { data: routes = [], isLoading, isError, error } = useApprovalRoutes();
  const { data: team = [] } = useTeam();
  const add = useAddApprovalRoute();
  const remove = useDeleteApprovalRoute();

  const [routeId, setRouteId] = useState('');
  const [name, setName] = useState('');
  const [approverIds, setApproverIds] = useState('');
  const [description, setDescription] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);

  const reset = () => { setRouteId(''); setName(''); setApproverIds(''); setDescription(''); };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ids = approverIds.split(',').map((s) => s.trim()).filter(Boolean);
    if (!routeId.trim() || !name.trim() || ids.length === 0) return;
    add.mutate(
      {
        route_id: routeId.trim(),
        name: name.trim(),
        approver_ids: ids,
        description: description.trim() || undefined,
      },
      { onSuccess: reset },
    );
  };

  return (
    <>
      <h2>Approval routes</h2>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Add route</div>
            <div className="card-sub">
              Approver ids must match members. {team.length > 0 && `Available: ${team.map((m) => m.member_id).join(', ')}`}
            </div>
          </div>
        </header>
        <form className="card-body" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="r-id">Route id</label>
              <input id="r-id" required value={routeId} onChange={(e) => setRouteId(e.target.value)} placeholder="prod-write-route" />
            </div>
            <div className="field">
              <label htmlFor="r-name">Name</label>
              <input id="r-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Production writes" />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="r-approvers">Approver ids</label>
              <input
                id="r-approvers"
                required
                value={approverIds}
                onChange={(e) => setApproverIds(e.target.value)}
                placeholder="alice, bob"
              />
              <span className="hint">Comma-separated list of member ids.</span>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="r-desc">Description (optional)</label>
              <input id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Two-person review for production writes" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn primary" type="submit" disabled={add.isPending}>
              <Icon name="plus" size={12} /> {add.isPending ? 'Adding…' : 'Add route'}
            </button>
            <button className="btn ghost" type="button" onClick={reset} disabled={add.isPending}>Reset</button>
          </div>
        </form>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Routes</div>
            <div className="card-sub">{routes.length} configured</div>
          </div>
        </header>
        {isError ? (
          <div className="banner err" style={{ margin: 18 }}>
            Couldn't load routes. {error instanceof Error ? error.message : ''}
          </div>
        ) : isLoading && routes.length === 0 ? (
          <div className="card-body"><div className="skeleton" style={{ height: 36 }} /></div>
        ) : routes.length === 0 ? (
          <div className="empty" style={{ margin: 18 }}>
            <div className="empty-title">No routes yet.</div>
            <div className="empty-sub">Add a route to control which approvers see which kind of write.</div>
          </div>
        ) : (
          <ul className="list">
            {routes.map((r) => {
              const ids = parseList(r.approver_ids);
              return (
                <li key={r.route_id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-title">
                      {r.name} <span className="muted mono" style={{ fontSize: 11 }}>· {r.route_id}</span>
                    </div>
                    <div className="list-sub">
                      {ids.length} approver{ids.length === 1 ? '' : 's'} ({ids.join(', ')}) · {r.required_approvers} required · added {timeAgo(r.created_at)}
                    </div>
                    {r.description && (
                      <div style={{ color: 'var(--ink-2)', fontSize: 12, marginTop: 4 }}>{r.description}</div>
                    )}
                  </div>
                  <button
                    className="btn ghost"
                    aria-label={`Delete ${r.name}`}
                    onClick={() => setConfirm(r.route_id)}
                    disabled={remove.isPending}
                  >
                    <Icon name="trash" size={12} /> Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmModal
        open={confirm !== null}
        title="Delete this route?"
        body={<span>Existing approval requests using this route will not be affected.</span>}
        confirmLabel="Delete"
        tone="danger"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) remove.mutate(confirm);
          setConfirm(null);
        }}
      />
    </>
  );
}
