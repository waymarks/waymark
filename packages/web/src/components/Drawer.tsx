import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { ConfirmModal } from './ConfirmModal';
import type { ActionRow } from '@/api/types';
import { useApproveAction, useRejectAction, useRollbackAction } from '@/api/hooks';
import { bashCommand, deriveIntent, parseInput, rowState, simpleLineDiff } from '@/lib/format';
import { useFocusTrap } from '@/lib/focusTrap';

interface Props {
  action: ActionRow | null;
  onClose: () => void;
}

export function Drawer({ action, onClose }: Props) {
  const approve = useApproveAction();
  const reject = useRejectAction();
  const rollback = useRollbackAction();

  const [confirm, setConfirm] = useState<null | 'reject' | 'rollback'>(null);
  const drawerRef = useRef<HTMLElement>(null);
  useFocusTrap(drawerRef, !!action && !confirm);

  useEffect(() => {
    if (!action) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirm) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [action, confirm, onClose]);

  if (!action) return null;

  const state = rowState(action);
  const isPending = action.status === 'pending' && action.decision === 'pending';
  const isWrite = action.tool_name === 'write_file';
  const canRollback = isWrite && !action.rolled_back && state === 'ok' && !action.approved_by;
  const payload = parseInput(action);
  const diff = isWrite ? simpleLineDiff(action.before_snapshot, action.after_snapshot) : [];

  const onApproveConfirmed = () => approve.mutate(action.action_id, { onSuccess: onClose });
  const onRejectConfirmed = (reason?: string) => {
    reject.mutate(
      { id: action.action_id, reason: reason || 'Not approved' },
      { onSuccess: onClose },
    );
    setConfirm(null);
  };
  const onRollbackConfirmed = () => {
    rollback.mutate(action.action_id, { onSuccess: onClose });
    setConfirm(null);
  };

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <aside
        ref={drawerRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
      >
        <div className="drawer-head">
          <div>
            <div id="drawer-title" className="drawer-head-title">{deriveIntent(action)}</div>
            <div className="drawer-head-sub">{action.tool_name} · {action.action_id}</div>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close detail">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="drawer-body">
          <section className="drawer-section">
            <div className="drawer-section-title">Overview</div>
            <dl className="kv-grid">
              <dt>session</dt><dd>{action.session_id}</dd>
              <dt>status</dt><dd>{action.status}</dd>
              <dt>decision</dt><dd>{action.decision || '—'}</dd>
              {action.matched_rule && (<><dt>matched rule</dt><dd>{action.matched_rule}</dd></>)}
              {action.policy_reason && (<><dt>reason</dt><dd>{action.policy_reason}</dd></>)}
              {action.approved_by && (<><dt>approved by</dt><dd>{action.approved_by}</dd></>)}
              {action.rejected_reason && (<><dt>rejected</dt><dd>{action.rejected_reason}</dd></>)}
              <dt>created</dt><dd>{action.created_at}</dd>
              {action.target_path && (<><dt>target</dt><dd>{action.target_path}</dd></>)}
            </dl>
          </section>

          {action.tool_name === 'bash' && (
            <section className="drawer-section">
              <div className="drawer-section-title">Command</div>
              <pre className="code-block">{bashCommand(action)}</pre>
            </section>
          )}

          {isWrite && diff.length > 0 && (
            <section className="drawer-section">
              <div className="drawer-section-title">Diff</div>
              <div className="diff">
                <div className="diff-hdr">
                  <div>before</div>
                  <div>after</div>
                </div>
                <div className="diff-body">
                  <pre>{diff.map((d, i) => (
                    <span key={i} className={d.t === 'eq' ? '' : (d.t === 'add' ? '' : 'del')}>
                      {d.l}{'\n'}
                    </span>
                  ))}</pre>
                  <pre>{diff.map((d, i) => (
                    <span key={i} className={d.t === 'eq' ? '' : (d.t === 'del' ? '' : 'add')}>
                      {d.r}{'\n'}
                    </span>
                  ))}</pre>
                </div>
              </div>
            </section>
          )}

          <section className="drawer-section">
            <div className="drawer-section-title">Payload</div>
            <pre className="code-block">{JSON.stringify(payload, null, 2)}</pre>
          </section>

          {action.stdout && (
            <section className="drawer-section">
              <div className="drawer-section-title">Stdout</div>
              <pre className="code-block">{action.stdout}</pre>
            </section>
          )}
          {action.stderr && (
            <section className="drawer-section">
              <div className="drawer-section-title">Stderr</div>
              <pre className="code-block" style={{ color: 'var(--err)' }}>{action.stderr}</pre>
            </section>
          )}
          {action.error_message && (
            <section className="drawer-section">
              <div className="drawer-section-title">Error</div>
              <pre className="code-block" style={{ color: 'var(--err)' }}>{action.error_message}</pre>
            </section>
          )}
        </div>

        <div className="drawer-foot">
          {isPending ? (
            <>
              <button
                className="btn danger btn-lg"
                onClick={() => setConfirm('reject')}
                disabled={reject.isPending}
              >
                <Icon name="x" size={14} />Reject
              </button>
              <button
                className="btn ok btn-lg"
                onClick={onApproveConfirmed}
                disabled={approve.isPending}
              >
                <Icon name="check" size={14} />{approve.isPending ? 'Approving…' : 'Approve'}
              </button>
            </>
          ) : canRollback ? (
            <button
              className="btn btn-lg"
              onClick={() => setConfirm('rollback')}
              disabled={rollback.isPending}
            >
              <Icon name="rollback" size={14} />Rollback
            </button>
          ) : (
            <span className="muted">No actions available</span>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </aside>

      <ConfirmModal
        open={confirm === 'reject'}
        title="Reject this action?"
        body={<span>The agent will see a rejection and stop. Add an optional reason so the log is clear.</span>}
        withReason
        reasonPlaceholder="Why reject?"
        confirmLabel="Reject"
        tone="danger"
        onClose={() => setConfirm(null)}
        onConfirm={(reason) => onRejectConfirmed(reason)}
      />
      <ConfirmModal
        open={confirm === 'rollback'}
        title="Roll back this write?"
        body={<span>Waymark will restore the file to its before-snapshot. This cannot be undone.</span>}
        confirmLabel="Roll back"
        onClose={() => setConfirm(null)}
        onConfirm={onRollbackConfirmed}
      />
    </>
  );
}
