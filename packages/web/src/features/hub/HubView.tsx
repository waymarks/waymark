import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  useHubGc,
  useHubPause,
  useHubProjects,
  useHubResume,
  useHubStop,
  useProject,
} from '@/api/hooks';
import type { HubProject } from '@/api/types';
import { cn, compressPath, parseServerDate, timeAgo } from '@/lib/format';
import { PeerStats } from './PeerStats';

export function HubView() {
  const { data: hubMap = {}, isLoading, isError, error } = useHubProjects();
  const { data: current } = useProject();

  const projects = useMemo(() => {
    const list = Object.values(hubMap);
    list.sort((a, b) => {
      // Running before paused before stopped, then most-recent first.
      const order = (s: string) => (s === 'running' ? 0 : s === 'paused' ? 1 : 2);
      const r = order(a.status) - order(b.status);
      if (r !== 0) return r;
      const aTs = a.startedAt ? parseServerDate(a.startedAt)?.getTime() ?? 0 : 0;
      const bTs = b.startedAt ? parseServerDate(b.startedAt)?.getTime() ?? 0 : 0;
      return bTs - aTs;
    });
    return list;
  }, [hubMap]);

  const counts = useMemo(() => ({
    total: projects.length,
    running: projects.filter((p) => p.status === 'running').length,
    paused: projects.filter((p) => p.status === 'paused').length,
    stopped: projects.filter((p) => p.status === 'stopped').length,
  }), [projects]);

  const gc = useHubGc();
  const [confirmGc, setConfirmGc] = useState(false);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hub</h1>
          <p className="page-sub">
            Every Waymark instance registered on this machine. Open one, pause the agent, or
            stop the server — without leaving the dashboard you're already in.
          </p>
        </div>
        <div className="page-meta">
          <span>{counts.total} project{counts.total === 1 ? '' : 's'}</span>
          {counts.running > 0 && <span className="live" style={{ color: 'var(--ok)' }}>{counts.running} running</span>}
          {counts.paused > 0 && <span style={{ color: 'var(--pending)' }}>{counts.paused} paused</span>}
          {counts.stopped > 0 && <span>{counts.stopped} stopped</span>}
        </div>
      </div>

      {isError && (
        <div className="banner err">
          Couldn't load hub. {error instanceof Error ? error.message : ''}
        </div>
      )}

      <div className="toolbar">
        <span className="muted" style={{ fontSize: 12 }}>
          Live counts probe each peer every 5 s. Stopped projects keep their entry for 7 days.
        </span>
        <div className="toolbar-spacer" />
        <button
          className="btn ghost"
          onClick={() => setConfirmGc(true)}
          disabled={gc.isPending || counts.stopped === 0}
          title={counts.stopped === 0 ? 'No stopped projects to clean up' : 'Garbage collect stopped projects > 7 days old'}
        >
          <Icon name="trash" size={12} /> Clean up stopped
        </button>
      </div>

      {isLoading && projects.length === 0 ? (
        <div className="card"><div className="card-body"><div className="skeleton" style={{ height: 64 }} /></div></div>
      ) : projects.length === 0 ? (
        <div className="empty">
          <div className="empty-title">No projects registered.</div>
          <div className="empty-sub">Run <code>npx @way_marks/cli init</code> + <code>start</code> in another project to see it here.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {projects.map((p) => (
            <ProjectRow key={p.id} project={p} isCurrent={current?.projectName === p.projectName && current?.port === p.port} />
          ))}
        </div>
      )}

      <ConfirmModal
        open={confirmGc}
        title="Garbage collect stopped projects?"
        body={<span>Removes registry entries for projects that have been stopped for more than 7 days. Has no effect on running or paused projects.</span>}
        confirmLabel="Clean up"
        onClose={() => setConfirmGc(false)}
        onConfirm={() => { gc.mutate(); setConfirmGc(false); }}
      />
    </>
  );
}

function ProjectRow({ project, isCurrent }: { project: HubProject; isCurrent: boolean }) {
  const pause = useHubPause();
  const resume = useHubResume();
  const stop = useHubStop();
  const [confirmStop, setConfirmStop] = useState(false);

  const url = `http://localhost:${project.port}`;
  const isRunning = project.status === 'running';
  const isPaused = project.status === 'paused';

  return (
    <>
      <article
        className={cn('card', isCurrent && 'live-card')}
        style={isCurrent ? { borderColor: 'oklch(0.74 0.13 155 / 0.4)' } : undefined}
      >
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 14, alignItems: 'center' }}>
          <div className={cn('status-dot', !isRunning && 'off')} aria-hidden style={{
            background: isRunning ? 'var(--ok)' : isPaused ? 'var(--pending)' : 'var(--ink-4)',
            boxShadow: isRunning ? undefined : 'none',
            animation: isRunning ? undefined : 'none',
          }} />

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span className="card-title">{project.projectName}</span>
              {isCurrent && <span className="policy-chip allow">this dashboard</span>}
              <span className="muted mono" style={{ fontSize: 11 }}>:{project.port}</span>
              <span className="muted mono" style={{ fontSize: 11 }}>{project.status}</span>
            </div>
            <div className="card-sub mono" style={{ marginTop: 2 }}>
              {compressPath(project.projectRoot, 5)}
              {project.startedAt && (
                <> · started {timeAgo(parseServerDate(project.startedAt)?.toISOString() ?? null)}</>
              )}
              {project.user && <> · {project.user}@{project.hostname ?? 'local'}</>}
            </div>
          </div>

          <PeerStats port={project.port} enabled={isRunning} />

          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <a className="btn" href={url} target="_blank" rel="noreferrer noopener" aria-label={`Open ${project.projectName}`}>
              <Icon name="external" size={12} /> Open
            </a>
            {isRunning && (
              <button
                className="btn ghost"
                onClick={() => pause.mutate(project.id)}
                disabled={pause.isPending}
              >
                Pause
              </button>
            )}
            {isPaused && (
              <button
                className="btn ghost"
                onClick={() => resume.mutate(project.id)}
                disabled={resume.isPending}
              >
                Resume
              </button>
            )}
            {(isRunning || isPaused) && !isCurrent && (
              <button
                className="btn danger"
                onClick={() => setConfirmStop(true)}
                disabled={stop.isPending}
              >
                <Icon name="x" size={12} /> Stop
              </button>
            )}
          </div>
        </div>
      </article>

      <ConfirmModal
        open={confirmStop}
        title={`Stop ${project.projectName}?`}
        body={
          <span>
            Sends SIGTERM to its MCP and API processes, releases port :{project.port}, and marks the
            registry entry as stopped. The agent in that project will lose its Waymark guard until
            you restart it.
          </span>
        }
        confirmLabel="Stop"
        tone="danger"
        onClose={() => setConfirmStop(false)}
        onConfirm={() => { stop.mutate(project.id); setConfirmStop(false); }}
      />
    </>
  );
}
