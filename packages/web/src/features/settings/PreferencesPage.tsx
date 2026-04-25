import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { ACCENT_SWATCHES, useUI, type Accent, type Density, type Grouping, type Theme } from '@/store/ui';
import { cn } from '@/lib/format';

export function PreferencesPage() {
  const {
    theme, density, grouping, accent, reviewerId,
    setTheme, setDensity, setGrouping, setAccent, setReviewerId,
  } = useUI();

  const [draftReviewer, setDraftReviewer] = useState(reviewerId);
  const dirty = draftReviewer.trim() !== reviewerId;

  return (
    <>
      <h2>Preferences</h2>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Reviewer identity</div>
            <div className="card-sub">
              Used when approving, rejecting, or deciding escalations. Must match an approver id in the route or
              escalation target list for the server to accept the decision.
            </div>
          </div>
        </header>
        <div className="card-body">
          <div className="field" style={{ maxWidth: 360 }}>
            <label htmlFor="reviewer-id">Your reviewer id</label>
            <input
              id="reviewer-id"
              value={draftReviewer}
              placeholder="alice@waymark.dev"
              onChange={(e) => setDraftReviewer(e.target.value)}
            />
            <span className="hint">Stored in <code>localStorage</code> only — nothing is sent until you act.</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              className="btn primary"
              disabled={!dirty || !draftReviewer.trim()}
              onClick={() => setReviewerId(draftReviewer.trim())}
            >
              <Icon name="check" size={12} /> Save
            </button>
            <button
              className="btn ghost"
              disabled={!dirty}
              onClick={() => setDraftReviewer(reviewerId)}
            >
              Reset
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <div className="card-title">Appearance</div>
            <div className="card-sub">
              Same controls as the Tweaks popover in the topbar. Preferences are saved per browser.
            </div>
          </div>
        </header>
        <div className="card-body" style={{ display: 'grid', gap: 12 }}>
          <PrefRow label="Theme">
            <Segmented<Theme> options={['dark', 'light']} value={theme} onChange={setTheme} />
          </PrefRow>
          <PrefRow label="Density">
            <Segmented<Density> options={['compact', 'comfy', 'spacious']} value={density} onChange={setDensity} />
          </PrefRow>
          <PrefRow label="Grouping">
            <Segmented<Grouping> options={['session', 'flat']} value={grouping} onChange={setGrouping} />
          </PrefRow>
          <PrefRow label="Accent">
            <div className="accent-swatches">
              {(Object.keys(ACCENT_SWATCHES) as Accent[]).map((k) => (
                <button
                  key={k}
                  className={cn('accent-swatch', accent === k && 'on')}
                  style={{ background: ACCENT_SWATCHES[k].c }}
                  aria-label={`Accent ${k}`}
                  onClick={() => setAccent(k)}
                />
              ))}
            </div>
          </PrefRow>
        </div>
      </section>
    </>
  );
}

function PrefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tweak-row" style={{ padding: '6px 0' }}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  options, value, onChange,
}: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tweak-group" role="group">
      {options.map((o) => (
        <button key={o} className={cn(value === o && 'on')} onClick={() => onChange(o)} type="button">
          {o}
        </button>
      ))}
    </div>
  );
}
