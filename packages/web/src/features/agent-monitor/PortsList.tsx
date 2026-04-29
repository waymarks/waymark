import type { AgentPortEntry, OrphanPortEntry } from '@/api/types';

interface Props {
  agentPorts: AgentPortEntry[];
  orphanPorts: OrphanPortEntry[];
}

export function PortsList({ agentPorts, orphanPorts }: Props) {
  const hasAny = agentPorts.length > 0 || orphanPorts.length > 0;

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
                <th>PID</th>
                <th>Agent</th>
                <th>Command</th>
                <th>Session</th>
              </tr>
            </thead>
            <tbody>
              {agentPorts.map((p) => (
                <tr key={`${p.pid}-${p.port}`}>
                  <td>{p.port}</td>
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
          <h3 className="ports-section-title orphan">Orphan ports (no live session)</h3>
          <table className="ports-table">
            <thead>
              <tr>
                <th>Port</th>
                <th>PID</th>
                <th>Command</th>
                <th>Last project</th>
              </tr>
            </thead>
            <tbody>
              {orphanPorts.map((p) => (
                <tr key={`${p.pid}-${p.port}`} className="orphan-row">
                  <td>{p.port}</td>
                  <td>{p.pid}</td>
                  <td><code>{p.command}</code></td>
                  <td>{p.projectName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
