import { Icon } from '@/components/Icon';
import { useConfig } from '@/api/hooks';

export function PolicyView() {
  const { data, isLoading, isError, error } = useConfig();
  const policies = data?.policies ?? {
    allowedPaths: [],
    blockedPaths: [],
    requireApproval: [],
    blockedCommands: [],
    maxBashOutputBytes: 0,
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Policy</h1>
          <p className="page-sub">
            Policies are read fresh on every tool call — edits to <code className="mono">waymark.config.json</code>{' '}
            take effect immediately, with no restart required.
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
        <div className="policy-grid">
          <PolicyCard
            tone="ok"
            iconName="shield"
            title="Allowed paths"
            description="Agents may read and write files matching these globs."
            rules={policies.allowedPaths ?? []}
            kind="path"
            emptyLabel="No explicit allow list — default deny."
          />
          <PolicyCard
            tone="err"
            iconName="x"
            title="Blocked paths"
            description="Denied unconditionally. Checked before allowedPaths."
            rules={policies.blockedPaths ?? []}
            kind="path"
            emptyLabel="No blocked paths."
          />
          <PolicyCard
            tone="pending"
            iconName="bell"
            title="Requires approval"
            description="Writes here go pending until a reviewer decides."
            rules={policies.requireApproval ?? []}
            kind="path"
            emptyLabel="No paths require approval."
          />
          <PolicyCard
            tone="err"
            iconName="command"
            title="Blocked commands"
            description="Bash rules. Plain = substring match. Regex = i-flag JS regex."
            rules={policies.blockedCommands ?? []}
            kind="command"
            emptyLabel="No blocked commands."
          />
        </div>
      )}
    </>
  );
}

function PolicyCard({
  tone,
  iconName,
  title,
  description,
  rules,
  kind,
  emptyLabel,
}: {
  tone: 'ok' | 'err' | 'pending';
  iconName: React.ComponentProps<typeof Icon>['name'];
  title: string;
  description: string;
  rules: string[];
  kind: 'path' | 'command';
  emptyLabel: string;
}) {
  const toneColor = tone === 'ok' ? 'var(--ok)' : tone === 'err' ? 'var(--err)' : 'var(--pending)';
  return (
    <article className="policy-card">
      <div
        className="policy-card-title"
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}
      >
        <Icon name={iconName} size={14} style={{ color: toneColor }} />
        <span>{title}</span>
        <span className="chip mono" style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>
          {rules.length}
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10 }}>{description}</p>

      {rules.length === 0 ? (
        <div className="muted mono" style={{ fontSize: 11.5 }}>{emptyLabel}</div>
      ) : (
        <ul style={{ listStyle: 'none' }}>
          {rules.map((r) => (
            <PolicyRule key={r} rule={r} kind={kind} />
          ))}
        </ul>
      )}
    </article>
  );
}

function PolicyRule({ rule, kind }: { rule: string; kind: 'path' | 'command' }) {
  const isRegex = kind === 'command' && rule.startsWith('regex:');
  const value = isRegex ? rule.slice(6) : rule;
  const tagLabel = kind === 'path' ? 'glob' : isRegex ? 'regex' : 'plain';

  return (
    <li className="policy-rule">
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      <span className="tag">{tagLabel}</span>
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
