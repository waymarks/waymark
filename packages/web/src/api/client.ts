export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

import type {
  ActionRow,
  AgentSession,
  AgentRateLimitsResponse,
  AgentPortsResponse,
  AgentSnapshot,
  ApprovalRequest,
  ApprovalRoute,
  EscalationRequest,
  EscalationRule,
  HubProject,
  PolicyConfig,
  ProjectInfo,
  RemediationBlocksResponse,
  SessionActionsResponse,
  SessionRollbackResponse,
  SessionSummary,
  SummaryStats,
  TeamMember,
  VersionInfo,
} from './types';

export const api = {
  getActions: () => request<ActionRow[]>('/api/actions'),
  getConfig: () => request<PolicyConfig>('/api/config'),
  updatePolicies: (body: NonNullable<PolicyConfig['policies']>) =>
    request<{ success: boolean; policies: NonNullable<PolicyConfig['policies']> }>('/api/config/policies', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  getSessions: () => request<SessionSummary[]>('/api/sessions'),
  getSessionActions: (sessionId: string) =>
    request<SessionActionsResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/actions`),
  getStats: () => request<SummaryStats>('/api/stats'),
  getProject: () => request<ProjectInfo>('/api/project'),
  getVersion: () => request<VersionInfo>('/api/version'),
  getHubProjects: () => request<Record<string, HubProject>>('/api/hub/projects'),

  getTeam: () => request<TeamMember[]>('/api/team/members'),
  addTeamMember: (body: { member_id: string; name: string; email: string; slack_id?: string }) =>
    request<{ success: boolean }>('/api/team/members', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeTeamMember: (id: string) =>
    request<{ success: boolean }>(`/api/team/members/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getApprovalRoutes: () => request<ApprovalRoute[]>('/api/approval-routes'),
  addApprovalRoute: (body: {
    route_id: string;
    name: string;
    approver_ids: string[];
    description?: string;
    condition_type?: string;
    condition_json?: string;
  }) =>
    request<{ success: boolean }>('/api/approval-routes', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteApprovalRoute: (id: string) =>
    request<{ success: boolean }>(`/api/approval-routes/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getEscalationRules: () => request<EscalationRule[]>('/api/escalations/rules'),
  addEscalationRule: (body: {
    rule_id: string;
    name: string;
    escalation_targets: string[];
    description?: string;
    timeout_hours?: number;
  }) =>
    request<{ success: boolean }>('/api/escalations/rules', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteEscalationRule: (id: string) =>
    request<{ success: boolean }>(`/api/escalations/rules/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getRemediationBlocks: () => request<RemediationBlocksResponse>('/api/remediation/blocks'),

  // Hub — cross-project ops served by whichever Waymark dashboard the user has open.
  hubPause: (id: string) =>
    request<{ success: boolean }>(`/api/hub/projects/${encodeURIComponent(id)}/pause`, { method: 'POST' }),
  hubResume: (id: string) =>
    request<{ success: boolean }>(`/api/hub/projects/${encodeURIComponent(id)}/resume`, { method: 'POST' }),
  hubStop: (id: string) =>
    request<{ success: boolean; killed: { api: boolean; mcp: boolean }; message?: string }>(
      `/api/hub/projects/${encodeURIComponent(id)}/stop`,
      { method: 'POST' },
    ),
  hubGc: () => request<{ success: boolean; removed: number }>('/api/hub/gc', { method: 'POST' }),

  // Probe a peer Waymark instance on its own port. CORS allowance lives on the
  // peer's server; failure is silent so dead peers just show as "—".
  getPeerStats: async (port: number, signal?: AbortSignal): Promise<SummaryStats | null> => {
    try {
      const res = await fetch(`http://localhost:${port}/api/stats`, { signal });
      if (!res.ok) return null;
      return (await res.json()) as SummaryStats;
    } catch {
      return null;
    }
  },

  // Agent monitor
  getAgentSessions: (params?: { agent?: string; status?: string }) => {
    const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString() : '';
    return request<{ sessions: AgentSession[]; count: number }>(`/api/agent-monitor/sessions${qs ? '?' + qs : ''}`);
  },
  getAgentSession: (id: string) =>
    request<{ session: AgentSession }>(`/api/agent-monitor/sessions/${encodeURIComponent(id)}`),
  getAgentRateLimits: () => request<AgentRateLimitsResponse>('/api/agent-monitor/rate-limits'),
  getAgentPorts: () => request<AgentPortsResponse>('/api/agent-monitor/ports'),
  getAgentSnapshot: () => request<AgentSnapshot>('/api/agent-monitor/snapshot'),
  pauseAgentSession: (sessionId: string) =>
    request<{ success: boolean; action: string; pid: number }>(`/api/agent-monitor/sessions/${encodeURIComponent(sessionId)}/pause`, { method: 'POST' }),
  resumeAgentSession: (sessionId: string) =>
    request<{ success: boolean; action: string; pid: number }>(`/api/agent-monitor/sessions/${encodeURIComponent(sessionId)}/resume`, { method: 'POST' }),

  approveAction: (id: string) =>
    request<{ success: boolean }>(`/api/actions/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
  approveActionWithEdit: (id: string, content: string) =>
    request<{ success: boolean }>(`/api/actions/${encodeURIComponent(id)}/approve-with-edit`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  rejectAction: (id: string, reason: string) =>
    request<{ success: boolean }>(`/api/actions/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  rollbackAction: (id: string) =>
    request<{ success: boolean }>(`/api/actions/${encodeURIComponent(id)}/rollback`, { method: 'POST' }),
  rollbackSession: (id: string) =>
    request<SessionRollbackResponse>(`/api/sessions/${encodeURIComponent(id)}/rollback`, { method: 'POST' }),
  rollbackPartial: (sessionId: string, actionIds: string[]) =>
    request<{ success: boolean; actions_rolled_back: number; restored: string[]; errors?: string[] }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/rollback-partial`,
      { method: 'POST', body: JSON.stringify({ action_ids: actionIds }) }
    ),
  getAnalyticsSummary: () =>
    request<{ top_blocked_paths: Array<{ path: string; hits: number }>; busiest_hours: Array<{ hour: string; count: number }>; avg_approval_latency_minutes: number | null; policy_accuracy: { false_positives: number; true_positives: number } }>('/api/analytics/summary'),

  getPendingApprovals: () => request<ApprovalRequest[]>('/api/approvals/pending'),
  approveRequest: (requestId: string, approverId: string, reason?: string) =>
    request<{ success: boolean }>(`/api/approvals/${encodeURIComponent(requestId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approver_id: approverId, reason }),
    }),
  rejectRequest: (requestId: string, approverId: string, reason?: string) =>
    request<{ success: boolean }>(`/api/approvals/${encodeURIComponent(requestId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ approver_id: approverId, reason }),
    }),

  getPendingEscalations: () => request<EscalationRequest[]>('/api/escalations/pending'),
  decideEscalation: (
    requestId: string,
    targetId: string,
    decision: 'proceed' | 'block',
    reason?: string,
  ) =>
    request<{ success: boolean }>(`/api/escalations/${encodeURIComponent(requestId)}/decide`, {
      method: 'POST',
      body: JSON.stringify({ target_id: targetId, decision, reason }),
    }),

  getSessionDiff: (sessionId: string) =>
    request<{ session_id: string; patches: Array<{ path: string; before: string; after: string; action_id: string; created_at: string }>; total_files: number }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/diff`
    ),

  replayAction: (actionId: string) =>
    request<{ success: boolean; original_action_id: string; new_action_id: string }>(
      `/api/actions/${encodeURIComponent(actionId)}/replay`,
      { method: 'POST' }
    ),

  testPolicy: (body: { path?: string; command?: string; action?: 'read' | 'write' }) =>
    request<{ input: string; resolved?: string; decision: string; reason: string; matchedRule: string }>(
      '/api/policy/test',
      { method: 'POST', body: JSON.stringify(body) }
    ),

  getPolicyHits: () =>
    request<Array<{ rule: string; hits: number }>>('/api/policy/hits'),
};
