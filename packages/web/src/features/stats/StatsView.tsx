import { useMemo } from 'react';
import { useActions, useStats } from '@/api/hooks';
import { Icon, type IconName } from '@/components/Icon';
import { compressPath, parseServerDate } from '@/lib/format';

interface Bucket { total: number; errors: number; blocked: number }

const BUCKET_COUNT = 30;
const BUCKET_MS = 10 * 60 * 1000; // 10 minutes → last 5 hours

export function StatsView() {
  const { data: stats, isLoading, isError, error } = useStats();
  const { data: actions = [] } = useActions();

  const buckets = useMemo<Bucket[]>(() => {
    const now = Date.now();
    const start = now - BUCKET_COUNT * BUCKET_MS;
    const out: Bucket[] = Array.from({ length: BUCKET_COUNT }, () => ({ total: 0, errors: 0, blocked: 0 }));
    for (const a of actions) {
      const d = parseServerDate(a.created_at);
      if (!d) continue;
      const t = d.getTime();
      if (t < start || t > now) continue;
      const idx = Math.min(BUCKET_COUNT - 1, Math.floor((t - start) / BUCKET_MS));
      out[idx].total += 1;
      if (a.status === 'error') out[idx].errors += 1;
      if (a.status === 'blocked' || a.decision === 'block') out[idx].blocked += 1;
    }
    return out;
  }, [actions]);

  const totalInWindow = buckets.reduce((s, b) => s + b.total, 0);
  const errorsInWindow = buckets.reduce((s, b) => s + b.errors + b.blocked, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Stats</h1>
          <p className="page-sub">
            Activity across all sessions. Sparkline groups the last 5 hours into 10-minute buckets.
          </p>
        </div>
        <div className="page-meta">
          {stats && <span>{stats.totalActions} total</span>}
          {stats && <span>{stats.todayCount} today</span>}
        </div>
      </div>

      {isError && (
        <div className="banner err">Couldn't load stats. {error instanceof Error ? error.message : ''}</div>
      )}

      {isLoading && !stats ? (
        <StatsSkeleton />
      ) : stats ? (
        <>
          <div className="stat-grid">
            <Stat label="Total actions" value={stats.totalActions} sub={`${stats.thisWeekCount} this week`} />
            <Stat
              label="Pending"
              value={stats.pendingCount}
              tone={stats.pendingCount > 0 ? 'pending' : undefined}
              sub={stats.pendingCount > 0 ? 'agent paused' : 'all clear'}
            />
            <Stat
              label="Rejected"
              value={stats.rejectedCount}
              tone={stats.rejectedCount > 0 ? 'err' : undefined}
              sub="this lifetime"
            />
            <Stat
              label="Approved"
              value={stats.approvedCount}
              tone={stats.approvedCount > 0 ? 'ok' : undefined}
              sub={`${stats.todayCount} today`}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14, marginBottom: 18 }}>
            <section className="card">
              <header className="card-header">
                <div>
                  <div className="card-title">Activity</div>
                  <div className="card-sub">
                    Last 5 hours · {totalInWindow} action{totalInWindow === 1 ? '' : 's'}
                    {errorsInWindow > 0 && `, ${errorsInWindow} red`}
                  </div>
                </div>
              </header>
              <div className="card-body">
                <Sparkline buckets={buckets} />
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-3)', fontSize: 10, fontFamily: 'var(--font-mono)', marginTop: 6 }}>
                  <span>5h ago</span>
                  <span>now</span>
                </div>
              </div>
            </section>

            <section className="card">
              <header className="card-header">
                <div>
                  <div className="card-title">By tool</div>
                  <div className="card-sub">Top 5 tools across all sessions</div>
                </div>
              </header>
              <div className="card-body">
                <ByToolChart rows={stats.topTools} />
              </div>
            </section>
          </div>

          <section className="card">
            <header className="card-header">
              <div>
                <div className="card-title">Hot paths</div>
                <div className="card-sub">Most frequently touched files</div>
              </div>
            </header>
            <div className="card-body">
              {stats.topPaths.length === 0 ? (
                <div className="muted">No path data yet.</div>
              ) : (
                <ul className="list" style={{ margin: '-6px -18px -18px' }}>
                  {stats.topPaths.map((p) => (
                    <li key={p.path}>
                      <Icon name="doc" size={14} style={{ color: 'var(--ink-3)' }} />
                      <span className="mono" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {compressPath(p.path, 5)}
                      </span>
                      <span className="mono muted" style={{ fontSize: 12 }}>{p.count}×</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone?: 'ok' | 'err' | 'pending';
}) {
  const color =
    tone === 'ok' ? 'var(--ok)' : tone === 'err' ? 'var(--err)' : tone === 'pending' ? 'var(--pending)' : undefined;
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-delta">{sub}</div>
    </div>
  );
}

function Sparkline({ buckets }: { buckets: Bucket[] }) {
  const height = 80;
  const max = Math.max(1, ...buckets.map((b) => b.total));
  const w = 100 / buckets.length;
  return (
    <svg
      className="spark"
      style={{ height, width: '100%' }}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
    >
      {buckets.map((b, i) => {
        const h = (b.total / max) * (height - 6);
        const red = b.errors + b.blocked > 0;
        return (
          <rect
            key={i}
            x={i * w + 0.3}
            y={height - h - 2}
            width={Math.max(0.5, w - 0.6)}
            height={Math.max(1, h)}
            rx={0.6}
            fill={red ? 'var(--err)' : 'var(--acc)'}
            opacity={red ? 0.88 : 0.55}
          />
        );
      })}
    </svg>
  );
}

const TOOL_ICONS: Record<string, IconName> = {
  write_file: 'doc',
  read_file: 'eye',
  delete_file: 'trash',
  bash: 'command',
  copilot: 'command',
};

function ByToolChart({ rows }: { rows: Array<{ tool: string; count: number }> }) {
  if (rows.length === 0) return <div className="muted">No tool usage yet.</div>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r) => {
        const icon = TOOL_ICONS[r.tool] ?? 'command';
        return (
          <div key={r.tool} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <span className="tool-tag" data-tool={r.tool} style={{ minWidth: 110 }}>
              <span className="tdot" />
              <Icon name={icon} size={11} />
              {r.tool}
            </span>
            <div
              style={{ flex: 1, height: 8, background: 'var(--bg-2)', borderRadius: 3, overflow: 'hidden' }}
            >
              <div
                style={{
                  width: `${(r.count / max) * 100}%`,
                  height: '100%',
                  background: 'var(--acc)',
                  opacity: 0.7,
                }}
              />
            </div>
            <span className="mono muted" style={{ fontSize: 11, width: 32, textAlign: 'right' }}>{r.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <>
      <div className="stat-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card">
            <div className="skeleton" style={{ width: '50%', height: 10, marginBottom: 10 }} />
            <div className="skeleton" style={{ width: '30%', height: 24, marginBottom: 10 }} />
            <div className="skeleton" style={{ width: '70%', height: 10 }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 18 }}>
        <div className="skeleton" style={{ width: '100%', height: 80 }} />
      </div>
    </>
  );
}
