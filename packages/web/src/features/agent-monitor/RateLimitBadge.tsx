import type { AgentRateLimitInfo } from '@/api/types';
import { cn } from '@/lib/format';

interface Props {
  rateLimits: AgentRateLimitInfo[];
}

function UsagePill({ label, pct }: { label: string; pct: number }) {
  const cls = pct >= 90 ? 'pill-danger' : pct >= 60 ? 'pill-warn' : 'pill-ok';
  return (
    <span className={cn('rate-pill', cls)}>
      {label}: {Math.round(pct)}%
    </span>
  );
}

function UsageBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? 'var(--err)' : pct >= 60 ? 'var(--warn)' : 'var(--ok)';
  return (
    <div className="rl-bar-track" title={`${Math.round(pct)}% used`}>
      <div className="rl-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

export function RateLimitBadge({ rateLimits }: Props) {
  if (rateLimits.length === 0) {
    return (
      <div className="rate-limit-setup">
        <strong>Rate limit data unavailable</strong>
        <p>Waymark needs the StatusLine hook to read Claude's API rate limits in real time.</p>
        <ol>
          <li>Run <code className="inline-code">waymark setup-hook</code> in your terminal</li>
          <li>Restart Claude Code — rate limits appear here within 30 seconds</li>
        </ol>
        <p className="text-muted">
          Alternatively, rate limits may be auto-detected from your active Claude session transcript.
          Start a Claude session and check back shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="rate-limit-badges">
      {rateLimits.map((rl) => (
        <div key={rl.source} className="rate-limit-card">
          <div className="rate-limit-card-header">
            <span className="rate-source">{rl.source}</span>
            <div className="rate-pills">
              <UsagePill label="5h" pct={rl.fiveHour.usedPercent} />
              {rl.sevenDay && <UsagePill label="7d" pct={rl.sevenDay.usedPercent} />}
            </div>
            <span className="rate-reset text-muted">
              resets {new Date(rl.fiveHour.resetsAtIso).toLocaleTimeString()}
            </span>
          </div>
          <div className="rate-limit-bars">
            <div className="rl-bar-row">
              <span className="rl-bar-label">5h</span>
              <UsageBar pct={rl.fiveHour.usedPercent} />
            </div>
            {rl.sevenDay && (
              <div className="rl-bar-row">
                <span className="rl-bar-label">7d</span>
                <UsageBar pct={rl.sevenDay.usedPercent} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
