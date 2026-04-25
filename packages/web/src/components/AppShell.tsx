import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { CommandPalette } from './CommandPalette';
import { useUI, ACCENT_SWATCHES } from '@/store/ui';
import { useActions, usePendingApprovals, usePendingEscalations, useSessions } from '@/api/hooks';
import { cn } from '@/lib/format';

interface NavEntry { id: string; label: string; icon: IconName; count?: number; attn?: boolean }

export function AppShell({ children, topbar }: { children: ReactNode; topbar?: ReactNode }) {
  const { theme, density, accent } = useUI();
  const { data: actions = [], isError } = useActions();
  const { data: sessions = [] } = useSessions();
  const { data: pendingApprovals = [] } = usePendingApprovals();
  const { data: pendingEscalations = [] } = usePendingEscalations();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
    const { c, ring } = ACCENT_SWATCHES[accent];
    document.documentElement.style.setProperty('--acc', c);
    document.documentElement.style.setProperty('--acc-dim', ring);
  }, [theme, density, accent]);

  const pendingActions = actions.filter((a) => a.status === 'pending').length;
  const approvalQueue = pendingApprovals.length + pendingEscalations.length;
  const approvalAttn = approvalQueue > 0 || pendingActions > 0;
  const approvalCount = approvalQueue + pendingActions;

  const primaryNav: NavEntry[] = useMemo(() => [
    { id: '/',          label: 'Actions',   icon: 'actions',   count: actions.length },
    { id: '/sessions',  label: 'Sessions',  icon: 'sessions',  count: sessions.length },
    { id: '/approvals', label: 'Approvals', icon: 'approvals', count: approvalCount, attn: approvalAttn },
    { id: '/policy',    label: 'Policy',    icon: 'policy' },
    { id: '/stats',     label: 'Stats',     icon: 'stats' },
  ], [actions.length, sessions.length, approvalCount, approvalAttn]);

  return (
    <div className="app">
      <aside className="nav">
        <div className="brand">
          <div className="brand-mark" aria-hidden>W</div>
          <div>
            <div className="brand-name">waymark</div>
            <div className="brand-sub">agent action viewer</div>
          </div>
        </div>

        <div>
          <div className="nav-section-label">Workspace</div>
          <ul className="nav-list">
            {primaryNav.map((n) => (
              <li key={n.id}>
                <NavLink to={n.id} end className={({ isActive }) => cn('nav-item', isActive && 'active')}>
                  <Icon name={n.icon} className="nav-icon" />
                  <span className="nav-label">{n.label}</span>
                  {n.count !== undefined && (
                    <span className={cn('nav-count', n.attn && 'attn')}>{n.count}</span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="nav-section-label">Project</div>
          <ul className="nav-list">
            <li>
              <NavLink to="/settings" className={({ isActive }) => cn('nav-item', isActive && 'active')}>
                <Icon name="settings" className="nav-icon" />
                <span className="nav-label">Settings</span>
              </NavLink>
            </li>
          </ul>
        </div>

        <div className="nav-footer">
          <div className="server-row">
            <span className={cn('status-dot', isError && 'off')} aria-hidden />
            <span>{isError ? 'API unreachable' : 'MCP server live'}</span>
            <span className="server-port">:3001</span>
          </div>
        </div>
      </aside>

      <div className="main">
        <Topbar onOpenPalette={() => setPaletteOpen(true)}>{topbar}</Topbar>
        <main className="page">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function Topbar({ children, onOpenPalette }: { children?: ReactNode; onOpenPalette: () => void }) {
  const { search, setSearch } = useUI();
  const location = useLocation();

  const pageLabel =
    location.pathname === '/' ? 'Actions' :
    location.pathname.slice(1).split('/')[0] || 'Actions';

  return (
    <header className="topbar">
      <div className="crumbs">
        <span className="crumb current">{pageLabel.charAt(0).toUpperCase() + pageLabel.slice(1)}</span>
        <span className="crumb-sep">·</span>
        <span className="crumb">live</span>
      </div>

      <div className="search">
        <Icon name="search" size={14} />
        <input
          id="wm-search"
          placeholder="Filter the current view…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter"
        />
      </div>

      <button
        className="btn ghost"
        onClick={onOpenPalette}
        aria-label="Open command palette"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <Icon name="command" size={12} />
        Commands
        <span className="kbd">⌘K</span>
      </button>

      <div className="topbar-right">{children}</div>
    </header>
  );
}
