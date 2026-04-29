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

export function RateLimitBadge({ rateLimits }: Props) {
  if (rateLimits.length === 0) {
    return (
      <div className="rate-limit-empty">
        No rate limit data — install the abtop StatusLine hook to enable.
      </div>
    );
  }

  return (
    <div className="rate-limit-badges">
      {rateLimits.map((rl) => (
        <div key={rl.source} className="rate-limit-row">
          <span className="rate-source">{rl.source}</span>
          <UsagePill label="5h" pct={rl.fiveHour.usedPercent} />
          {rl.sevenDay && <UsagePill label="7d" pct={rl.sevenDay.usedPercent} />}
          <span className="rate-reset">resets {new Date(rl.fiveHour.resetsAtIso).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}
