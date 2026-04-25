import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import { cn } from '@/lib/format';
import { PreferencesPage } from './PreferencesPage';
import { TeamPage } from './TeamPage';
import { ApprovalRoutesPage } from './ApprovalRoutesPage';
import { EscalationRulesPage } from './EscalationRulesPage';
import { RemediationPage } from './RemediationPage';
import { ProjectsPage } from './ProjectsPage';

interface Entry { to: string; label: string; icon: IconName }

const NAV: Entry[] = [
  { to: 'preferences', label: 'Preferences', icon: 'sliders' },
  { to: 'team', label: 'Team', icon: 'team' },
  { to: 'approval-routes', label: 'Approval routes', icon: 'approvals' },
  { to: 'escalation-rules', label: 'Escalation rules', icon: 'bell' },
  { to: 'remediation', label: 'Remediation blocks', icon: 'shield' },
  { to: 'projects', label: 'Projects', icon: 'folder' },
];

export function SettingsShell() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">
            Team, approval routing, escalation rules, and per-workspace preferences. Everything here is project-local.
          </p>
        </div>
      </div>

      <div className="settings">
        <nav className="settings-nav" aria-label="Settings">
          {NAV.map((e) => (
            <NavLink
              key={e.to}
              to={e.to}
              className={({ isActive }) => cn(isActive && 'active')}
              end={false}
            >
              <Icon name={e.icon} size={14} />
              <span>{e.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="settings-section">
          <Routes>
            <Route index element={<Navigate to="preferences" replace />} />
            <Route path="preferences" element={<PreferencesPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="approval-routes" element={<ApprovalRoutesPage />} />
            <Route path="escalation-rules" element={<EscalationRulesPage />} />
            <Route path="remediation" element={<RemediationPage />} />
            <Route path="projects" element={<ProjectsPage />} />
          </Routes>
        </div>
      </div>
    </>
  );
}
