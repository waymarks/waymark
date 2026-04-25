import { Icon } from '@/components/Icon';
import { useHubProjects, useProject } from '@/api/hooks';
import { compressPath, parseServerDate, timeAgo } from '@/lib/format';
import { cn } from '@/lib/format';

export function ProjectsPage() {
  const { data: current } = useProject();
  const { data: hub = {}, isLoading, isError, error } = useHubProjects();
  const projects = Object.values(hub);

  return (
    <>
      <h2>Projects</h2>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Current project</div>
            <div className="card-sub">The Waymark instance serving this dashboard.</div>
          </div>
        </header>
        <div className="card-body">
          {current ? (
            <dl className="kv-grid" style={{ gridTemplateColumns: '140px 1fr' }}>
              <dt>name</dt><dd>{current.projectName}</dd>
              <dt>port</dt><dd>:{current.port}</dd>
              {current.projectRoot && (<><dt>root</dt><dd>{current.projectRoot}</dd></>)}
            </dl>
          ) : (
            <div className="muted">Loading…</div>
          )}
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Hub</div>
            <div className="card-sub">Other Waymark instances on this machine. Click to open.</div>
          </div>
        </header>
        {isError ? (
          <div className="banner err" style={{ margin: 18 }}>
            Couldn't load hub. {error instanceof Error ? error.message : ''}
          </div>
        ) : isLoading && projects.length === 0 ? (
          <div className="card-body"><div className="skeleton" style={{ height: 36 }} /></div>
        ) : projects.length === 0 ? (
          <div className="empty" style={{ margin: 18 }}>
            <div className="empty-title">No other projects.</div>
            <div className="empty-sub">Run <code>npx @way_marks/cli start</code> in another project to register it here.</div>
          </div>
        ) : (
          <ul className="list">
            {projects.map((p) => {
              const startedDate = p.startedAt ? parseServerDate(p.startedAt) : null;
              const isRunning = p.status === 'running';
              const url = `http://localhost:${p.port}/`;
              return (
                <li key={p.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-title" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className={cn('status-dot', !isRunning && 'off')} aria-hidden />
                      {p.projectName}
                      <span className="muted mono" style={{ fontSize: 11 }}>· :{p.port}</span>
                    </div>
                    <div className="list-sub">
                      {compressPath(p.projectRoot, 4)}
                      {startedDate && ` · started ${timeAgo(startedDate.toISOString())}`}
                    </div>
                  </div>
                  <a
                    className="btn ghost"
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`Open ${p.projectName} dashboard`}
                  >
                    <Icon name="external" size={12} /> Open
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
