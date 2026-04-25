import { useRemediationBlocks } from '@/api/hooks';

export function RemediationPage() {
  const { data, isLoading, isError, error } = useRemediationBlocks();

  return (
    <>
      <h2>Remediation blocks</h2>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Auto-blocks</div>
            <div className="card-sub">
              Risk-engine-derived rules that auto-block sessions exhibiting suspicious patterns. Configure thresholds in <code>waymark.config.json</code>.
            </div>
          </div>
        </header>
        <div className="card-body">
          {isError ? (
            <div className="banner err">Couldn't load blocks. {error instanceof Error ? error.message : ''}</div>
          ) : isLoading ? (
            <div className="skeleton" style={{ height: 36 }} />
          ) : data?.message && (data.blocks?.length ?? 0) === 0 ? (
            <div className="empty">
              <div className="empty-title">Auto-block storage not yet implemented.</div>
              <div className="empty-sub">{data.message}</div>
            </div>
          ) : (data?.blocks?.length ?? 0) === 0 ? (
            <div className="empty">
              <div className="empty-title">No auto-blocks active.</div>
              <div className="empty-sub">Once the risk engine flags a session, blocks appear here.</div>
            </div>
          ) : (
            <pre className="code-block">{JSON.stringify(data?.blocks, null, 2)}</pre>
          )}
        </div>
      </section>
    </>
  );
}
