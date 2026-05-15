import { useState } from 'react';
import type { AgentPortEntry, OrphanPortEntry } from '@/api/types';

interface Props {
  agentPorts: AgentPortEntry[];
  orphanPorts: OrphanPortEntry[];
  onKillOrphan?: (pid: number) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  browser: 'browser',
  api: 'api',
  db: 'db',
  system: 'system',
  local: 'local',
  other: 'other',
};

export function PortsList({ agentPorts, orphanPorts, onKillOrphan }: Props) {
  const [catFilter, setCatFilter] = useState<string>('all');
  const hasAny = agentPorts.length > 0 || orphanPorts.length > 0;

  const filteredOrphans = catFilter === 'all'
    ? orphanPorts
    : orphanPorts.filter((p) => p.category === catFilter);

  const allCats = [...new Set(orphanPorts.map((p) => p.category).filter(Boolean))];

  if (!hasAny) {
    return <div className="ports-empty">No agent-held ports detected.</div>;
  }

  return (
    <div className="ports-list">
      {agentPorts.length > 0 && (
        <section>
          <h3 className="ports-section-title">Agent ports</h3>
          <table className="ports-table">
            <thead>
              <tr>
                <th>Port</th>
                <th>Visibility</th>
                <th>Category</th>
                <th>PID</th>
                <th>Agent</th>
                <th>Command</th>
                <th>Session</th>
              </tr>
            </thead>
            <tbody>
              {agentPorts.map((p) => (
                <tr key={`${p.pid}-${p.port}`}>
                  <td><strong>{p.port}</strong></td>
                  <td>
                    <span className={p.isPublic ? 'port-public' : 'port-private'}>
                      {p.isPublic ? '🌐 public' : '🔒 local'}
                    </span>
                  </td>
                  <td>
                    {p.category && (
                      <span className={`port-cat port-cat-${p.category}`}>
                        {CATEGORY_LABELS[p.category] ?? p.category}
                      </span>
                    )}
                  </td>
                  <td>{p.pid}</td>
                  <td>{p.agentCli}</td>
                  <td><code>{p.command}</code></td>
                  <td className="port-session-id">{p.sessionId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {orphanPorts.length > 0 && (
        <section>
          <div className="ports-section-header">
            <h3 className="ports-section-title orphan">Orphan ports (no live session)</h3>
            {allCats.length > 1 && (
              <select className="filter-select" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
                <option value="all">All categories</option>
                {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
          <table className="ports-table">
            <thead>
              <tr>
                <th>Port</th>
                <th>Visibility</th>
                <th>Category</th>
                <th>PID</th>
                <th>Command</th>
                <th>Last project</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrphans.map((p) => (
                <tr key={`${p.pid}-${p.port}`} className="orphan-row">
                  <td><strong>{p.port}</strong></td>
                  <td>
                    <span className={p.isPublic ? 'port-public' : 'port-private'}>
                      {p.isPublic ? '🌐 public' : '🔒 local'}
                    </span>
                  </td>
                  <td>
                    {p.category && (
                      <span className={`port-cat port-cat-${p.category}`}>
                        {CATEGORY_LABELS[p.category] ?? p.category}
                      </span>
                    )}
                  </td>
                  <td>{p.pid}</td>
                  <td><code>{p.command}</code></td>
                  <td>{p.projectName || '—'}</td>
                  <td>
                    {onKillOrphan && (
                      <button
                        className="btn err"
                        style={{ fontSize: 10, padding: '2px 7px' }}
                        onClick={() => {
                          if (window.confirm(`Kill process PID ${p.pid} (port ${p.port})?`)) {
                            onKillOrphan(p.pid);
                          }
                        }}
                        title="Terminate this orphan process"
                      >
                        Kill
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
