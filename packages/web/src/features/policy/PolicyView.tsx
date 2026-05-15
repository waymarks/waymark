import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { useConfig, usePolicyHits, useUpdatePolicies } from '@/api/hooks';
import { api } from '@/api/client';
import type { PolicyConfig } from '@/api/types';

type Policies = NonNullable<PolicyConfig['policies']>;

export function PolicyView() {
  const { data, isLoading, isError, error } = useConfig();
  const update = useUpdatePolicies();

  const policies: Required<Policies> = {
    allowedPaths: data?.policies?.allowedPaths ?? [],
    blockedPaths: data?.policies?.blockedPaths ?? [],
    requireApproval: data?.policies?.requireApproval ?? [],
    blockedCommands: data?.policies?.blockedCommands ?? [],
    requireApprovalBash: data?.policies?.requireApprovalBash ?? [],
    allowedCommands: data?.policies?.allowedCommands ?? [],
    maxBashOutputBytes: data?.policies?.maxBashOutputBytes ?? 10000,
  };

  function save(patch: Partial<Policies>) {
    update.mutate({ ...policies, ...patch });
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Policy</h1>
          <p className="page-sub">
            Edits write to <code className="mono">waymark.config.json</code> and take effect on the next tool call — no restart required.
          </p>
        </div>
        <div className="page-meta">
          {data?.version && <span>version {data.version}</span>}
          {typeof policies.maxBashOutputBytes === 'number' && (
            <span>max stdout {policies.maxBashOutputBytes.toLocaleString()} bytes</span>
          )}
        </div>
      </div>

      {isError && (
        <div className="banner err">
          Couldn't load policy. {error instanceof Error ? error.message : ''}
        </div>
      )}

      {isLoading && !data ? (
        <PolicySkeleton />
      ) : (
        <>
          <div className="policy-grid">
            <EditableCard
              tone="ok"
              iconName="shield"
              title="Allowed paths"
              description="Agents may read and write files matching these globs."
              rules={policies.allowedPaths}
              kind="path"
              emptyLabel="No explicit allow list — default deny."
              placeholder="./src/**"
              onSave={(rules) => save({ allowedPaths: rules })}
              saving={update.isPending}
            />
            <EditableCard
              tone="err"
              iconName="x"
              title="Blocked paths"
              description="Denied unconditionally. Checked before allowedPaths."
              rules={policies.blockedPaths}
              kind="path"
              emptyLabel="No blocked paths."
              placeholder="./.env"
              onSave={(rules) => save({ blockedPaths: rules })}
              saving={update.isPending}
            />
            <EditableCard
              tone="pending"
              iconName="bell"
              title="Requires approval"
              description="Writes here go pending until a reviewer decides."
              rules={policies.requireApproval}
              kind="path"
              emptyLabel="No paths require approval."
              placeholder="./deploy/**"
              onSave={(rules) => save({ requireApproval: rules })}
              saving={update.isPending}
            />
            <EditableCard
              tone="err"
              iconName="command"
              title="Blocked commands"
              description="Bash rules. Plain = substring match. Prefix regex: for a JS regex."
              rules={policies.blockedCommands}
              kind="command"
              emptyLabel="No blocked commands."
              placeholder="rm -rf"
              onSave={(rules) => save({ blockedCommands: rules })}
              saving={update.isPending}
            />
            <EditableCard
              tone="pending"
              iconName="command"
              title="Approval-gated commands"
              description="These bash patterns queue for human approval rather than executing immediately."
              rules={policies.requireApprovalBash}
              kind="command"
              emptyLabel="No approval-gated commands."
              placeholder="git push"
              onSave={(rules) => save({ requireApprovalBash: rules })}
              saving={update.isPending}
            />
            <EditableCard
              tone="ok"
              iconName="command"
              title="Allowed commands"
              description="Bash whitelist. When non-empty, only these commands are permitted."
              rules={policies.allowedCommands}
              kind="command"
              emptyLabel="No whitelist — all non-blocked commands are allowed."
              placeholder="npm test"
              onSave={(rules) => save({ allowedCommands: rules })}
              saving={update.isPending}
            />
          </div>
          <PolicyTester />
          <PolicyHits />
        </>
      )}
    </>
  );
}

function EditableCard({
  tone, iconName, title, description, rules, kind, emptyLabel, placeholder, onSave, saving,
}: {
  tone: 'ok' | 'err' | 'pending';
  iconName: React.ComponentProps<typeof Icon>['name'];
  title: string;
  description: string;
  rules: string[];
  kind: 'path' | 'command';
  emptyLabel: string;
  placeholder: string;
  onSave: (rules: string[]) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState('');
  const toneColor = tone === 'ok' ? 'var(--ok)' : tone === 'err' ? 'var(--err)' : 'var(--pending)';

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed || rules.includes(trimmed)) { setDraft(''); return; }
    onSave([...rules, trimmed]);
    setDraft('');
  };

  const remove = (rule: string) => onSave(rules.filter((r) => r !== rule));

  return (
    <article className="policy-card">
      <div className="policy-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon name={iconName} size={14} style={{ color: toneColor }} />
        <span>{title}</span>
        <span className="chip mono" style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>{rules.length}</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10 }}>{description}</p>

      {rules.length === 0 ? (
        <div className="muted mono" style={{ fontSize: 11.5, marginBottom: 10 }}>{emptyLabel}</div>
      ) : (
        <ul style={{ listStyle: 'none', marginBottom: 10 }}>
          {rules.map((r) => (
            <EditableRule key={r} rule={r} kind={kind} onRemove={() => remove(r)} saving={saving} />
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          style={{ flex: 1, fontSize: 12 }}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          disabled={saving}
        />
        <button className="btn ok" style={{ fontSize: 12, padding: '3px 10px' }} onClick={add} disabled={saving || !draft.trim()}>
          Add
        </button>
      </div>
    </article>
  );
}

function EditableRule({ rule, kind, onRemove, saving }: { rule: string; kind: 'path' | 'command'; onRemove: () => void; saving: boolean }) {
  const isRegex = kind === 'command' && rule.startsWith('regex:');
  const value = isRegex ? rule.slice(6) : rule;
  const tagLabel = kind === 'path' ? 'glob' : isRegex ? 'regex' : 'plain';

  return (
    <li className="policy-rule" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{value}</span>
      <span className="tag">{tagLabel}</span>
      <button
        className="btn"
        style={{ padding: '1px 6px', fontSize: 11, color: 'var(--err)', flexShrink: 0 }}
        onClick={onRemove}
        disabled={saving}
        aria-label={`Remove ${value}`}
      >
        <Icon name="x" size={10} />
      </button>
    </li>
  );
}

function PolicySkeleton() {
  return (
    <div className="policy-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="policy-card">
          <div className="skeleton" style={{ width: '40%', height: 14, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: '90%', height: 10, marginBottom: 14 }} />
          <div className="skeleton" style={{ width: '70%', height: 10, marginBottom: 6 }} />
          <div className="skeleton" style={{ width: '60%', height: 10, marginBottom: 6 }} />
          <div className="skeleton" style={{ width: '80%', height: 10 }} />
        </div>
      ))}
    </div>
  );
}

type PolicyTestResult = { input: string; resolved?: string; decision: string; reason: string; matchedRule: string };

function PolicyTester() {
  const [mode, setMode] = useState<'path' | 'command'>('path');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<PolicyTestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onTest = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const body = mode === 'path' ? { path: input } : { command: input };
      const r = await api.testPolicy(body);
      setResult(r);
    } catch (e: any) {
      setErr(e.message ?? 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const decisionColor = result
    ? result.decision === 'allow' ? 'var(--ok)' : result.decision === 'pending' ? 'var(--pending)' : 'var(--err)'
    : undefined;

  return (
    <section className="card" style={{ marginTop: 14 }}>
      <header className="card-header">
        <div>
          <div className="card-title">Policy tester</div>
          <div className="card-sub">Check how the current policy evaluates a path or command</div>
        </div>
      </header>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
            <input type="radio" checked={mode === 'path'} onChange={() => setMode('path')} />
            File path
          </label>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
            <input type="radio" checked={mode === 'command'} onChange={() => setMode('command')} />
            Bash command
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ flex: 1 }}
            placeholder={mode === 'path' ? './src/index.ts' : 'git push origin main'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onTest()}
          />
          <button className="btn ok" onClick={onTest} disabled={loading || !input.trim()}>
            {loading ? 'Testing…' : 'Test'}
          </button>
        </div>
        {err && <div className="banner err" style={{ padding: '6px 10px', fontSize: 12 }}>{err}</div>}
        {result && (
          <dl className="kv-grid" style={{ fontSize: 12 }}>
            <dt>decision</dt><dd style={{ color: decisionColor, fontWeight: 600 }}>{result.decision}</dd>
            <dt>reason</dt><dd>{result.reason}</dd>
            <dt>matched rule</dt><dd className="mono">{result.matchedRule}</dd>
            {result.resolved && (<><dt>resolved path</dt><dd className="mono">{result.resolved}</dd></>)}
          </dl>
        )}
      </div>
    </section>
  );
}

function PolicyHits() {
  const { data: hits = [] } = usePolicyHits();
  if (hits.length === 0) return null;
  const max = Math.max(...hits.map((h) => h.hits));
  return (
    <section className="card" style={{ marginTop: 14 }}>
      <header className="card-header">
        <div>
          <div className="card-title">Rule hit counts</div>
          <div className="card-sub">How often each policy rule has been triggered</div>
        </div>
      </header>
      <div className="card-body">
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hits.map((h) => (
            <li key={h.rule} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span className="mono" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.rule}</span>
              <div style={{ width: 120, height: 8, background: 'var(--bg-2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(h.hits / max) * 100}%`, height: '100%', background: 'var(--acc)', opacity: 0.7 }} />
              </div>
              <span className="mono muted" style={{ fontSize: 11, width: 28, textAlign: 'right' }}>{h.hits}×</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
