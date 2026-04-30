import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  useActions,
  useApproveAction,
  useApproveRequest,
  useDecideEscalation,
  usePendingApprovals,
  usePendingEscalations,
  useRejectAction,
  useRejectRequest,
} from '@/api/hooks';
import type { ActionRow, ApprovalRequest, EscalationRequest } from '@/api/types';
import { cn, parseServerDate, timeAgo } from '@/lib/format';
import { useUI } from '@/store/ui';

type Tab = 'pending' | 'escalated' | 'history';

export function ApprovalsView() {
  const { data: pending = [], isLoading: loadPending, isError: errPending } = usePendingApprovals();
  const { data: escalated = [], isLoading: loadEsc, isError: errEsc } = usePendingEscalations();
  const { data: allActions = [] } = useActions();

  // Phase 1 policy-held actions: simple requireApproval items from action_log
  const pendingActions = allActions.filter((a) => a.decision === 'pending' && a.status === 'pending');

  const [tab, setTab] = useState<Tab>('pending');
  const totalPending = pending.length + pendingActions.length;
  const totalLive = totalPending + escalated.length;

  // Auto-route to escalated tab when there are no approvals but there are escalations.
  const effectiveTab: Tab = tab === 'pending' && totalPending === 0 && escalated.length > 0 ? 'escalated' : tab;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Approvals</h1>
          <p className="page-sub">
            Reviewer inbox for actions held by policy. Pending requests are held on the triggering agent;
            escalated requests timed out and were routed to a backup reviewer.
          </p>
        </div>
        <div className="page-meta">
          {totalLive > 0 ? (
            <span className="live" style={{ color: 'var(--pending)' }}>
              {totalLive} awaiting
            </span>
          ) : (
            <span>All clear</span>
          )}
        </div>
      </div>

      {(errPending || errEsc) && (
        <div className="banner err">Couldn't load the approvals queue. Retrying…</div>
      )}

      <div className="pill-row" role="tablist" aria-label="Approval queues">
        <TabPill id="pending" label="Pending" count={totalPending} current={effectiveTab} onClick={setTab} attn />
        <TabPill id="escalated" label="Escalated" count={escalated.length} current={effectiveTab} onClick={setTab} attn />
        <TabPill id="history" label="History" count={undefined} current={effectiveTab} onClick={setTab} />
      </div>

      {effectiveTab === 'pending' &&
        (loadPending && totalPending === 0 ? (
          <QueueSkeleton />
        ) : totalPending === 0 ? (
          <Empty icon="check" title="Inbox zero." sub="No approvals awaiting decision." />
        ) : (
          <div className="queue">
            {pendingActions.map((action) => (
              <PendingActionCard key={action.action_id} action={action} />
            ))}
            {pending.map((req) => (
              <ApprovalCard key={req.request_id} req={req} />
            ))}
          </div>
        ))}

      {effectiveTab === 'escalated' &&
        (loadEsc && escalated.length === 0 ? (
          <QueueSkeleton />
        ) : escalated.length === 0 ? (
          <Empty icon="check" title="No escalations." sub="Requests that time out will surface here." />
        ) : (
          <div className="queue">
            {escalated.map((req) => (
              <EscalationCard key={req.request_id} req={req} />
            ))}
          </div>
        ))}

      {effectiveTab === 'history' && (
        <Empty
          icon="doc"
          title="History view coming soon."
          sub="Once a session is selected we'll show the full approval + escalation history here. For now, use the Sessions tab."
        />
      )}
    </>
  );
}

function TabPill({
  id,
  label,
  count,
  current,
  onClick,
  attn = false,
}: {
  id: Tab;
  label: string;
  count: number | undefined;
  current: Tab;
  onClick: (t: Tab) => void;
  attn?: boolean;
}) {
  const active = current === id;
  return (
    <button
      role="tab"
      aria-selected={active}
      className={cn('pill', active && 'active', attn && count !== undefined && count > 0 && 'attn')}
      onClick={() => onClick(id)}
    >
      {label}
      {count !== undefined && <span className="pill-count">{count}</span>}
    </button>
  );
}

function QueueSkeleton() {
  return (
    <div className="queue">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="skeleton" style={{ width: '60%', height: 14 }} />
          <div className="skeleton" style={{ width: '40%', height: 10 }} />
          <div className="skeleton" style={{ width: '100%', height: 38 }} />
        </div>
      ))}
    </div>
  );
}

function Empty({ icon, title, sub }: { icon: 'check' | 'doc'; title: string; sub: string }) {
  return (
    <div className="empty">
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 8 }}>
        <Icon name={icon} size={24} />
      </div>
      <div className="empty-title">{title}</div>
      <div className="empty-sub">{sub}</div>
    </div>
  );
}

function parseList(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

// ── Phase 1: simple policy-held action card ─────────────────────────────────
function PendingActionCard({ action }: { action: ActionRow }) {
  const approve = useApproveAction();
  const reject = useRejectAction();
  const [modal, setModal] = useState<null | 'approve' | 'reject'>(null);

  const label = action.target_path
    ? action.target_path.split('/').slice(-2).join('/')
    : action.tool_name;

  return (
    <>
      <article className="queue-card card">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="policy-chip pending">policy hold</span>
            <span className="mono muted" style={{ fontSize: 11 }}>{action.tool_name}</span>
            <span className="mono muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{timeAgo(action.created_at)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div className="card-title" title={action.target_path ?? undefined}>{label}</div>
          </div>
          <dl className="kv-grid">
            <dt>rule</dt><dd>{action.matched_rule ?? '—'}</dd>
            <dt>reason</dt><dd>{action.policy_reason ?? '—'}</dd>
            <dt>session</dt><dd><code>{action.session_id.slice(0, 8)}…</code></dd>
          </dl>
        </div>
        <footer className="drawer-foot" style={{ borderTop: '1px solid var(--line)' }}>
          <button
            className="btn danger"
            onClick={() => setModal('reject')}
            disabled={reject.isPending}
          >
            <Icon name="x" size={12} /> Reject
          </button>
          <div className="spacer" />
          <button
            className="btn primary"
            onClick={() => setModal('approve')}
            disabled={approve.isPending}
          >
            <Icon name="check" size={12} /> Approve
          </button>
        </footer>
      </article>

      <ConfirmModal
        open={modal === 'approve'}
        title="Approve this action?"
        body={<span>The agent will be unblocked and the write will proceed.</span>}
        confirmLabel="Approve"
        onClose={() => setModal(null)}
        onConfirm={() => {
          approve.mutate(action.action_id);
          setModal(null);
        }}
      />
      <ConfirmModal
        open={modal === 'reject'}
        title="Reject this action?"
        body={<span>The agent will see a rejection and the write will be cancelled.</span>}
        withReason
        reasonPlaceholder="Why reject?"
        confirmLabel="Reject"
        tone="danger"
        onClose={() => setModal(null)}
        onConfirm={(reason) => {
          reject.mutate({ id: action.action_id, reason: reason ?? 'Rejected' });
          setModal(null);
        }}
      />
    </>
  );
}

function ApprovalCard({ req }: { req: ApprovalRequest }) {
  const reviewerId = useUI((s) => s.reviewerId);
  const approve = useApproveRequest(reviewerId);
  const reject = useRejectRequest(reviewerId);
  const approvers = parseList(req.approver_ids);
  const [modal, setModal] = useState<null | 'approve' | 'reject'>(null);

  return (
    <>
      <article className="queue-card card">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="policy-chip pending">awaiting approval</span>
            <span className="mono muted" style={{ fontSize: 11 }}>route {req.route_id}</span>
            <span className="mono muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{timeAgo(req.triggered_at)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div className="card-title">Session <code>{req.session_id}</code></div>
            <div className="mono muted" style={{ fontSize: 12 }}>triggered by {req.triggered_by}</div>
          </div>
          <dl className="kv-grid">
            <dt>approvers</dt><dd>{approvers.length ? approvers.join(', ') : 'any'}</dd>
            <dt>votes</dt>
            <dd>
              {req.approved_count} approve · {req.rejected_count} reject
            </dd>
            <dt>request</dt><dd>{req.request_id}</dd>
          </dl>
        </div>
        <footer className="drawer-foot" style={{ borderTop: '1px solid var(--line)' }}>
          <button
            className="btn danger"
            onClick={() => setModal('reject')}
            disabled={reject.isPending}
          >
            <Icon name="x" size={12} /> Reject
          </button>
          <div className="spacer" />
          <button
            className="btn primary"
            onClick={() => setModal('approve')}
            disabled={approve.isPending}
          >
            <Icon name="check" size={12} /> Approve
          </button>
        </footer>
      </article>

      <ConfirmModal
        open={modal === 'approve'}
        title="Approve this request?"
        body={<span>You are approving as <strong>{reviewerId}</strong>.</span>}
        withReason
        reasonPlaceholder="Optional note"
        confirmLabel="Approve"
        onClose={() => setModal(null)}
        onConfirm={(reason) => {
          approve.mutate({ requestId: req.request_id, reason });
          setModal(null);
        }}
      />
      <ConfirmModal
        open={modal === 'reject'}
        title="Reject this request?"
        body={<span>The agent will see a rejection and stop.</span>}
        withReason
        reasonPlaceholder="Why reject?"
        confirmLabel="Reject"
        tone="danger"
        onClose={() => setModal(null)}
        onConfirm={(reason) => {
          reject.mutate({ requestId: req.request_id, reason });
          setModal(null);
        }}
      />
    </>
  );
}

function EscalationCard({ req }: { req: EscalationRequest }) {
  const reviewerId = useUI((s) => s.reviewerId);
  const targets = parseList(req.escalation_targets);
  // Prefer the stored reviewer if they're a target, else fall back to the first target.
  const targetId = targets.includes(reviewerId) ? reviewerId : targets[0] ?? reviewerId;
  const decide = useDecideEscalation(targetId);
  const [modal, setModal] = useState<null | 'proceed' | 'block'>(null);

  const deadline = useMemo(() => {
    const d = parseServerDate(req.escalation_deadline);
    if (!d) return null;
    const diff = d.getTime() - Date.now();
    const minutes = Math.round(diff / 60_000);
    if (minutes <= 0) return { label: 'deadline passed', overdue: true };
    if (minutes < 60) return { label: `deadline in ${minutes}m`, overdue: false };
    return { label: `deadline in ${Math.round(minutes / 60)}h`, overdue: false };
  }, [req.escalation_deadline]);

  return (
    <>
      <article className="queue-card card">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="policy-chip block" title="Escalated">escalated</span>
            {deadline && (
              <span
                className="mono"
                style={{ fontSize: 11, color: deadline.overdue ? 'var(--err)' : 'var(--pending)' }}
              >
                {deadline.label}
              </span>
            )}
            <span className="mono muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
              triggered {timeAgo(req.escalation_triggered_at)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div className="card-title">Session <code>{req.session_id}</code></div>
            <div className="mono muted" style={{ fontSize: 12 }}>from approval {req.approval_request_id}</div>
          </div>
          <dl className="kv-grid">
            <dt>targets</dt><dd>{targets.length ? targets.join(', ') : '—'}</dd>
            <dt>deadline</dt><dd>{req.escalation_deadline}</dd>
            <dt>request</dt><dd>{req.request_id}</dd>
          </dl>
        </div>
        <footer className="drawer-foot" style={{ borderTop: '1px solid var(--line)' }}>
          <button
            className="btn danger"
            onClick={() => setModal('block')}
            disabled={decide.isPending}
          >
            <Icon name="x" size={12} /> Block
          </button>
          <div className="spacer" />
          <button
            className="btn primary"
            onClick={() => setModal('proceed')}
            disabled={decide.isPending}
          >
            <Icon name="check" size={12} /> Allow to proceed
          </button>
        </footer>
      </article>

      <ConfirmModal
        open={modal === 'proceed'}
        title="Allow this request to proceed?"
        body={<span>Agent will be unblocked as <strong>{targetId}</strong>.</span>}
        withReason
        reasonPlaceholder="Optional note"
        confirmLabel="Allow"
        onClose={() => setModal(null)}
        onConfirm={(reason) => {
          decide.mutate({ requestId: req.request_id, decision: 'proceed', reason });
          setModal(null);
        }}
      />
      <ConfirmModal
        open={modal === 'block'}
        title="Block this request?"
        body={<span>Agent will be denied and the session will remain paused.</span>}
        withReason
        reasonPlaceholder="Why block?"
        confirmLabel="Block"
        tone="danger"
        onClose={() => setModal(null)}
        onConfirm={(reason) => {
          decide.mutate({ requestId: req.request_id, decision: 'block', reason });
          setModal(null);
        }}
      />
    </>
  );
}
