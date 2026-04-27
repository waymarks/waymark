import { useHubPeerStats } from '@/api/hooks';

/**
 * Compact stats badge for a peer Waymark instance. Probes the peer's
 * /api/stats every 5 s; while probing it shows a skeleton, while a peer is
 * unreachable it shows a soft `—` so a dead instance never looks alarming.
 */
export function PeerStats({ port, enabled }: { port: number; enabled: boolean }) {
  const { data, isLoading, isError } = useHubPeerStats(port, enabled);

  if (!enabled) {
    return <Badge label="—" sub="not running" />;
  }
  if (isLoading && !data) {
    return (
      <div className="skeleton" style={{ width: 110, height: 30, borderRadius: 6 }} />
    );
  }
  if (isError || !data) {
    return <Badge label="—" sub="unreachable" tone="err" />;
  }
  const total = data.totalActions ?? 0;
  const pending = data.pendingCount ?? 0;
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
      <span><strong style={{ color: 'var(--ink-1)' }}>{total}</strong> <span className="muted">actions</span></span>
      {pending > 0 && (
        <span style={{ color: 'var(--pending)' }}><strong>{pending}</strong> pending</span>
      )}
    </div>
  );
}

function Badge({ label, sub, tone }: { label: string; sub?: string; tone?: 'err' | 'muted' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 90 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: tone === 'err' ? 'var(--err)' : 'var(--ink-2)' }}>{label}</span>
      {sub && <span className="muted" style={{ fontSize: 10.5 }}>{sub}</span>}
    </div>
  );
}
