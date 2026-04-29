import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { TweaksPopover } from '@/components/TweaksPopover';
import { useEventStream } from '@/api/eventStream';
import { ActionsView } from '@/features/actions/ActionsView';
import { SessionsView } from '@/features/sessions/SessionsView';
import { ApprovalsView } from '@/features/approvals/ApprovalsView';
import { PolicyView } from '@/features/policy/PolicyView';
import { StatsView } from '@/features/stats/StatsView';
import { HubView } from '@/features/hub/HubView';
import { SettingsShell } from '@/features/settings/SettingsShell';
import { AgentMonitorView } from '@/features/agent-monitor/AgentMonitorView';

export function App() {
  useEventStream();
  return (
    <AppShell topbar={<TweaksPopover />}>
      <Routes>
        <Route path="/" element={<ActionsView />} />
        <Route path="/sessions" element={<SessionsView />} />
        <Route path="/approvals" element={<ApprovalsView />} />
        <Route path="/policy" element={<PolicyView />} />
        <Route path="/stats" element={<StatsView />} />
        <Route path="/hub" element={<HubView />} />
        <Route path="/agents" element={<AgentMonitorView />} />
        <Route path="/settings/*" element={<SettingsShell />} />
      </Routes>
    </AppShell>
  );
}
