import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from './Icon';
import { useActions } from '@/api/hooks';
import { useUI } from '@/store/ui';
import { cn, deriveIntent } from '@/lib/format';

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: IconName;
  group: string;
  keywords?: string;
  run: () => void;
}

interface Props { open: boolean; onClose: () => void }

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: actions = [] } = useActions();
  const { theme, density, setTheme, setDensity, setSelectedActionId } = useUI();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo<Item[]>(() => {
    const navItems: Item[] = [
      { id: 'go-actions', label: 'Go to Actions', icon: 'actions', group: 'Navigation', run: () => navigate('/') },
      { id: 'go-sessions', label: 'Go to Sessions', icon: 'sessions', group: 'Navigation', run: () => navigate('/sessions') },
      { id: 'go-approvals', label: 'Go to Approvals', icon: 'approvals', group: 'Navigation', run: () => navigate('/approvals') },
      { id: 'go-policy', label: 'Go to Policy', icon: 'policy', group: 'Navigation', run: () => navigate('/policy') },
      { id: 'go-stats', label: 'Go to Stats', icon: 'stats', group: 'Navigation', run: () => navigate('/stats') },
      { id: 'go-settings', label: 'Go to Settings', icon: 'settings', group: 'Navigation', run: () => navigate('/settings') },
    ];

    const cmdItems: Item[] = [
      {
        id: 'toggle-theme',
        label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
        icon: theme === 'dark' ? 'sun' : 'moon',
        group: 'Commands',
        keywords: 'theme dark light mode',
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'cycle-density',
        label: `Density: cycle to ${density === 'compact' ? 'comfy' : density === 'comfy' ? 'spacious' : 'compact'}`,
        icon: 'sliders',
        group: 'Commands',
        keywords: 'density compact comfy spacious',
        run: () => setDensity(density === 'compact' ? 'comfy' : density === 'comfy' ? 'spacious' : 'compact'),
      },
      {
        id: 'refresh-all',
        label: 'Refresh all data',
        hint: 'Invalidates every query',
        icon: 'rollback',
        group: 'Commands',
        keywords: 'reload refetch sync',
        run: () => qc.invalidateQueries(),
      },
    ];

    // Match "act:..." as an action id prefix; else search by intent / target / tool
    const actionItems: Item[] = actions.slice(0, 100).map((a) => ({
      id: `action:${a.action_id}`,
      label: deriveIntent(a),
      hint: a.target_path ?? a.action_id,
      icon: a.tool_name === 'bash' ? 'command' : a.tool_name === 'read_file' ? 'eye' : 'doc',
      group: 'Actions',
      keywords: `${a.tool_name} ${a.action_id} ${a.session_id} ${a.status} ${a.target_path ?? ''}`,
      run: () => {
        navigate('/');
        setSelectedActionId(a.action_id);
      },
    }));

    return [...navItems, ...cmdItems, ...actionItems];
  }, [theme, density, actions, navigate, qc, setTheme, setDensity, setSelectedActionId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    return items
      .filter((i) =>
        i.label.toLowerCase().includes(q) ||
        (i.hint ?? '').toLowerCase().includes(q) ||
        (i.keywords ?? '').toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [items, query]);

  // Reset active when filter changes; keep active in range
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (active >= filtered.length) setActive(Math.max(0, filtered.length - 1));
  }, [filtered, active]);

  // Focus input on open, blur previous focus, restore on close
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    setQuery('');
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(id);
      previous?.focus?.();
    };
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-pidx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[active]?.run(); onClose(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  // Group items in render
  const groups = filtered.reduce<Record<string, { item: Item; idx: number }[]>>((acc, it, idx) => {
    (acc[it.group] ??= []).push({ item: it, idx });
    return acc;
  }, {});

  return (
    <div
      className="palette-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={onClose}
    >
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="search" size={14} style={{ color: 'var(--ink-3)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type to navigate, search actions, or run a command…"
            aria-label="Command input"
            style={{ borderBottom: 'none', padding: '14px 0' }}
          />
          <span className="kbd">esc</span>
        </div>

        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>No matches.</div>
          ) : (
            Object.entries(groups).map(([group, members]) => (
              <div key={group}>
                <div style={{ padding: '8px 18px 4px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)' }}>
                  {group}
                </div>
                {members.map(({ item, idx }) => (
                  <button
                    key={item.id}
                    data-pidx={idx}
                    className={cn('palette-item', idx === active && 'on')}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => { item.run(); onClose(); }}
                    style={{ width: '100%', textAlign: 'left' }}
                  >
                    <Icon name={item.icon} size={14} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                    {item.hint && (
                      <span className="muted mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                        {item.hint}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, padding: '8px 14px', borderTop: '1px solid var(--line)', fontSize: 10.5, color: 'var(--ink-3)' }}>
          <span><span className="kbd">↑↓</span> navigate</span>
          <span><span className="kbd">↵</span> select</span>
          <span style={{ marginLeft: 'auto' }}><span className="kbd">⌘K</span> open</span>
        </div>
      </div>
    </div>
  );
}
