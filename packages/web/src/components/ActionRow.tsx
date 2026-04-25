import { useState } from 'react';
import { Icon } from './Icon';
import { ConfirmModal } from './ConfirmModal';
import type { ActionRow as ActionRowT } from '@/api/types';
import { useApproveAction, useRejectAction, useRollbackAction } from '@/api/hooks';
import { basename, bashCommand, compressPath, deriveIntent, rowState, timeAgo } from '@/lib/format';

interface Props {
  row: ActionRowT;
  focused?: boolean;
  onOpen: (row: ActionRowT) => void;
}

export function ActionRow({ row, focused, onOpen }: Props) {
  const state = rowState(row);
  const isObs = row.event_type === 'observation';
  const isPending = row.status === 'pending' && row.decision === 'pending';
  const canRollback = row.tool_name === 'write_file' && !row.rolled_back && state === 'ok' && !row.approved_by;

  const approve = useApproveAction();
  const reject = useRejectAction();
  const rollback = useRollbackAction();

  const [confirm, setConfirm] = useState<null | 'reject' | 'rollback'>(null);

  const intent = deriveIntent(row);
  const cmd = row.tool_name === 'bash' ? bashCommand(row) : '';
  const path = row.target_path;

  const subLine = row.tool_name === 'bash' ? (
    <span className="intent-path mono">{cmd.length > 80 ? cmd.slice(0, 78) + '…' : cmd}</span>
  ) : (
    <span className="intent-path">
      <span className="dim">{compressPath(path).replace(basename(path), '')}</span>
      {basename(path)}
    </span>
  );

  const policyChip = (() => {
    if (isObs) return <span className="policy-chip obs">plan-mode</span>;
    if (row.decision === 'block') return <span className="policy-chip block" title={row.policy_reason ?? undefined}>blocked</span>;
    if (row.status === 'rejected' || row.decision === 'rejected')
      return <span className="policy-chip block" title={row.rejected_reason ?? undefined}>rejected</span>;
    if (row.decision === 'pending') return <span className="policy-chip pending" title={row.policy_reason ?? undefined}>approval</span>;
    if (row.approved_by) return <span className="policy-chip allow" title={`by ${row.approved_by}`}>approved</span>;
    if (row.rolled_back) return <span className="policy-chip">rolled back</span>;
    if (row.matched_rule) return <span className="policy-chip allow" title={row.matched_rule}>allowed</span>;
    return null;
  })();

  return (
    <>
      <div
        className={`action-row${focused ? ' focused' : ''}${isObs ? ' obs' : ''}`}
        data-state={state}
      >
        <div className="row-rail" />
        <button
          type="button"
          className="action-row-open"
          onClick={() => onOpen(row)}
          aria-label={`${intent} — ${state}. Open detail.`}
        >
          <span className="row-time">{timeAgo(row.created_at)}</span>
          <span className="tool-tag" data-tool={row.tool_name}>
            <span className="tdot" />{row.tool_name}
          </span>
          <span className="row-intent">
            <span className="intent-line">{intent}</span>
            <span className="intent-sub">
              {subLine}
              {policyChip}
            </span>
          </span>
          <span className="status-tag" data-s={state === 'ok' ? 'success' : state}>
            <span className="sdot" />
            {state === 'ok' ? 'success' : state}
          </span>
        </button>
        <div className="row-actions">
          {isPending && (
            <>
              <button
                className="btn ok"
                onClick={(_e) => { approve.mutate(row.action_id); }}
                disabled={approve.isPending}
              >
                <Icon name="check" size={12} />Approve
              </button>
              <button
                className="btn danger"
                onClick={(_e) => { setConfirm('reject'); }}
                disabled={reject.isPending}
              >
                <Icon name="x" size={12} />Reject
              </button>
            </>
          )}
          {canRollback && (
            <button
              className="btn ghost"
              onClick={(e) => { e.stopPropagation(); setConfirm('rollback'); }}
              disabled={rollback.isPending}
            >
              <Icon name="rollback" size={12} />Rollback
            </button>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirm === 'reject'}
        title="Reject this action?"
        body={<span>{intent}</span>}
        withReason
        reasonPlaceholder="Why reject?"
        confirmLabel="Reject"
        tone="danger"
        onClose={() => setConfirm(null)}
        onConfirm={(reason) => {
          reject.mutate({ id: row.action_id, reason: reason || 'Not approved' });
          setConfirm(null);
        }}
      />
      <ConfirmModal
        open={confirm === 'rollback'}
        title="Roll back this write?"
        body={<span>Restore {basename(path)} to its before-snapshot.</span>}
        confirmLabel="Roll back"
        onClose={() => setConfirm(null)}
        onConfirm={() => { rollback.mutate(row.action_id); setConfirm(null); }}
      />
    </>
  );
}

