import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  useAddEscalationRule,
  useDeleteEscalationRule,
  useEscalationRules,
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

export function EscalationRulesPage() {
  const { data: rules = [], isLoading, isError, error } = useEscalationRules();
  const { data: team = [] } = useTeam();
  const add = useAddEscalationRule();
  const remove = useDeleteEscalationRule();

  const [ruleId, setRuleId] = useState('');
  const [name, setName] = useState('');
  const [targets, setTargets] = useState('');
  const [timeout, setTimeoutHours] = useState('24');
  const [description, setDescription] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);

  const reset = () => { setRuleId(''); setName(''); setTargets(''); setTimeoutHours('24'); setDescription(''); };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const list = targets.split(',').map((s) => s.trim()).filter(Boolean);
    if (!ruleId.trim() || !name.trim() || list.length === 0) return;
    const hours = Number.parseInt(timeout, 10);
    add.mutate(
      {
        rule_id: ruleId.trim(),
        name: name.trim(),
        escalation_targets: list,
        description: description.trim() || undefined,
        timeout_hours: Number.isFinite(hours) ? hours : undefined,
      },
      { onSuccess: reset },
    );
  };

  return (
    <>
      <h2>Escalation rules</h2>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Add rule</div>
            <div className="card-sub">
              When an approval request times out, it's routed to the listed targets.
              {team.length > 0 && ` Available: ${team.map((m) => m.member_id).join(', ')}`}
            </div>
          </div>
        </header>
        <form className="card-body" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="e-id">Rule id</label>
              <input id="e-id" required value={ruleId} onChange={(e) => setRuleId(e.target.value)} placeholder="security-escalation" />
            </div>
            <div className="field">
              <label htmlFor="e-name">Name</label>
              <input id="e-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Security lead override" />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="e-targets">Targets</label>
              <input
                id="e-targets"
                required
                value={targets}
                onChange={(e) => setTargets(e.target.value)}
                placeholder="security-lead, oncall"
              />
              <span className="hint">Comma-separated member ids.</span>
            </div>
            <div className="field">
              <label htmlFor="e-timeout">Timeout (hours)</label>
              <input
                id="e-timeout"
                type="number"
                min={1}
                value={timeout}
                onChange={(e) => setTimeoutHours(e.target.value)}
              />
            </div>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="e-desc">Description (optional)</label>
              <input id="e-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn primary" type="submit" disabled={add.isPending}>
              <Icon name="plus" size={12} /> {add.isPending ? 'Adding…' : 'Add rule'}
            </button>
            <button className="btn ghost" type="button" onClick={reset} disabled={add.isPending}>Reset</button>
          </div>
        </form>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Rules</div>
            <div className="card-sub">{rules.length} configured</div>
          </div>
        </header>
        {isError ? (
          <div className="banner err" style={{ margin: 18 }}>
            Couldn't load rules. {error instanceof Error ? error.message : ''}
          </div>
        ) : isLoading && rules.length === 0 ? (
          <div className="card-body"><div className="skeleton" style={{ height: 36 }} /></div>
        ) : rules.length === 0 ? (
          <div className="empty" style={{ margin: 18 }}>
            <div className="empty-title">No rules yet.</div>
            <div className="empty-sub">Add a rule so approvals don't sit forever when reviewers are offline.</div>
          </div>
        ) : (
          <ul className="list">
            {rules.map((r) => {
              const targets = parseList(r.escalation_targets);
              return (
                <li key={r.rule_id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-title">
                      {r.name} <span className="muted mono" style={{ fontSize: 11 }}>· {r.rule_id}</span>
                    </div>
                    <div className="list-sub">
                      {targets.length} target{targets.length === 1 ? '' : 's'} ({targets.join(', ')}) · timeout {r.timeout_hours}h · added {timeAgo(r.created_at)}
                    </div>
                    {r.description && (
                      <div style={{ color: 'var(--ink-2)', fontSize: 12, marginTop: 4 }}>{r.description}</div>
                    )}
                  </div>
                  <button
                    className="btn ghost"
                    aria-label={`Delete ${r.name}`}
                    onClick={() => setConfirm(r.rule_id)}
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
        title="Delete this rule?"
        body={<span>Existing escalation requests using this rule will not be affected.</span>}
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
