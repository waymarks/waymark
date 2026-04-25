import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useUI, ACCENT_SWATCHES, type Accent, type Density, type Theme, type Grouping } from '@/store/ui';
import { cn } from '@/lib/format';

export function TweaksPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const { theme, density, grouping, accent, setTheme, setDensity, setGrouping, setAccent } = useUI();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        aria-label="Preferences"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="sliders" size={16} />
      </button>
      {open && (
        <div className="tweaks" role="dialog" aria-label="Preferences">
          <h4>Appearance</h4>
          <TweakRow label="Theme">
            <Segmented<Theme>
              options={['dark', 'light']}
              value={theme}
              onChange={setTheme}
            />
          </TweakRow>
          <TweakRow label="Density">
            <Segmented<Density>
              options={['compact', 'comfy', 'spacious']}
              value={density}
              onChange={setDensity}
            />
          </TweakRow>
          <TweakRow label="Grouping">
            <Segmented<Grouping>
              options={['session', 'flat']}
              value={grouping}
              onChange={setGrouping}
            />
          </TweakRow>
          <TweakRow label="Accent">
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
          </TweakRow>
        </div>
      )}
    </div>
  );
}

function TweakRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tweak-row">
      <label>{label}</label>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="tweak-group" role="group">
      {options.map((o) => (
        <button
          key={o}
          className={cn(value === o && 'on')}
          onClick={() => onChange(o)}
          type="button"
        >
          {o}
        </button>
      ))}
    </div>
  );
}
