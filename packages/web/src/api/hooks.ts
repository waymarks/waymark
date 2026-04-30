import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useToast } from '@/components/ToastContext';

// SSE drives most invalidation; polling is a safety net for stale browser tabs.
const POLL_MS = 30_000;

export function useActions() {
  return useQuery({
    queryKey: ['actions'],
    queryFn: api.getActions,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: api.getConfig,
    refetchInterval: 30_000,
  });
}

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: api.getSessions,
    refetchInterval: POLL_MS,
  });
}

export function useSessionActions(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: ['session-actions', sessionId],
    queryFn: () => api.getSessionActions(sessionId!),
    enabled: !!sessionId,
    refetchInterval: POLL_MS,
  });
}

export function useRollbackSession() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (sessionId: string) => api.rollbackSession(sessionId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['actions'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['session-actions'] });
      toast.push({
        tone: 'ok',
        message: `Rolled back ${res.actions_rolled_back} action${res.actions_rolled_back === 1 ? '' : 's'}.`,
      });
    },
    onError: (err: Error) => toast.push({ tone: 'err', message: err.message }),
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: api.getPendingApprovals,
    refetchInterval: POLL_MS,
  });
}

export function usePendingEscalations() {
  return useQuery({
    queryKey: ['escalations', 'pending'],
    queryFn: api.getPendingEscalations,
    refetchInterval: POLL_MS,
  });
}

export function useApproveRequest(approverId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason?: string }) =>
      api.approveRequest(requestId, approverId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['actions'] });
      toast.push({ tone: 'ok', message: 'Approval recorded.' });
    },
    onError: (err: Error) => toast.push({ tone: 'err', message: err.message }),
  });
}

export function useRejectRequest(approverId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason?: string }) =>
      api.rejectRequest(requestId, approverId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['actions'] });
      toast.push({ tone: 'ok', message: 'Rejection recorded.' });
    },
    onError: (err: Error) => toast.push({ tone: 'err', message: err.message }),
  });
}

export function useProject() {
  return useQuery({ queryKey: ['project'], queryFn: api.getProject, refetchInterval: 60_000 });
}

export function useHubProjects() {
  return useQuery({ queryKey: ['hub'], queryFn: api.getHubProjects, refetchInterval: 10_000 });
}

export function useTeam() {
  return useQuery({ queryKey: ['team'], queryFn: api.getTeam, refetchInterval: 30_000 });
}

export function useAddTeamMember() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: api.addTeamMember,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      toast.push({ tone: 'ok', message: 'Team member added.' });
    },
    onError: (err: Error) => toast.push({ tone: 'err', message: err.message }),
  });
}

export function useRemoveTeamMember() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => api.removeTeamMember(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      toast.push({ tone: 'ok', message: 'Team member removed.' });
    },
    onError: (err: Error) => toast.push({ tone: 'err', message: err.message }),
  });
}

export function useApprovalRoutes() {
  return useQuery({ queryKey: ['approval-routes'], queryFn: api.getApprovalRoutes, refetchInterval: 30_000 });
}

export function useAddApprovalRoute() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: api.addApprovalRoute,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-routes'] });
      toast.push({ tone: 'ok', message: 'Approval route added.' });
    },
    onError: (err: Error) => toast.push({ tone: 'err', message: err.message }),
  });
}

export function useDeleteApprovalRoute() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => api.deleteApprovalRoute(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-routes'] });
      toast.push({ tone: 'ok', message: 'Approval route deleted.' });
    },
    onError: (err: Error) => toast.push({ tone: 'err', message: err.message }),
  });
}

export function useEscalationRules() {
  return useQuery({ queryKey: ['escalation-rules'], queryFn: api.getEscalationRules, refetchInterval: 30_000 });
}

export function useAddEscalationRule() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: api.addEscalationRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escalation-rules'] });
      toast.push({ tone: 'ok', message: 'Escalation rule added.' });
    },
    onError: (err: Error) => toast.push({ tone: 'err', message: err.message }),
  });
}

export function useDeleteEscalationRule() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => api.deleteEscalationRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escalation-rules'] });
      toast.push({ tone: 'ok', message: 'Escalation rule deleted.' });
    },
    onError: (err: Error) => toast.push({ tone: 'err', message: err.message }),
  });
}

export function useRemediationBlocks() {
  return useQuery({
    queryKey: ['remediation', 'blocks'],
    queryFn: api.getRemediationBlocks,
    refetchInterval: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Hub — cross-project view
// ---------------------------------------------------------------------------

export function useHubPeerStats(port: number, enabled: boolean = true) {
  return useQuery({
    queryKey: ['hub', 'peer-stats', port],
    queryFn: ({ signal }) => api.getPeerStats(port, signal),
    enabled,
    refetchInterval: 5_000,
    staleTime: 4_000,
    retry: false,
  });
}

export function useHubPause() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => api.hubPause(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hub'] }); toast.push({ tone: 'ok', message: 'Project paused.' }); },
    onError: (e: Error) => toast.push({ tone: 'err', message: e.message }),
  });
}

export function useHubResume() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => api.hubResume(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hub'] }); toast.push({ tone: 'ok', message: 'Project resumed.' }); },
    onError: (e: Error) => toast.push({ tone: 'err', message: e.message }),
  });
}

export function useHubStop() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => api.hubStop(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['hub'] });
      toast.push({ tone: 'ok', message: res.message ?? 'Project stopped.' });
    },
    onError: (e: Error) => toast.push({ tone: 'err', message: e.message }),
  });
}

export function useHubGc() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: () => api.hubGc(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['hub'] });
      toast.push({ tone: 'ok', message: `Garbage collected ${res.removed} stale entr${res.removed === 1 ? 'y' : 'ies'}.` });
    },
    onError: (e: Error) => toast.push({ tone: 'err', message: e.message }),
  });
}

export function useDecideEscalation(targetId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      requestId,
      decision,
      reason,
    }: {
      requestId: string;
      decision: 'proceed' | 'block';
      reason?: string;
    }) => api.decideEscalation(requestId, targetId, decision, reason),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['escalations'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['actions'] });
      toast.push({
        tone: 'ok',
        message: vars.decision === 'proceed' ? 'Allowed to proceed.' : 'Blocked.',
      });
    },
    onError: (err: Error) => toast.push({ tone: 'err', message: err.message }),
  });
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: api.getStats,
    refetchInterval: 10_000,
  });
}

export function useApproveAction() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => api.approveAction(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['actions'] });
      toast.push({ tone: 'ok', message: 'Action approved.' });
    },
    onError: (err: Error) => toast.push({ tone: 'err', message: err.message }),
  });
}

export function useRejectAction() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.rejectAction(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['actions'] });
      toast.push({ tone: 'ok', message: 'Action rejected.' });
    },
    onError: (err: Error) => toast.push({ tone: 'err', message: err.message }),
  });
}

export function useRollbackAction() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => api.rollbackAction(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['actions'] });
      toast.push({ tone: 'ok', message: 'Action rolled back.' });
    },
    onError: (err: Error) => toast.push({ tone: 'err', message: err.message }),
  });
}

// ─── Agent Monitor ────────────────────────────────────────────────────────────

const AGENT_POLL_MS = 3_000;

export function useAgentSessions(params?: { agent?: string; status?: string }) {
  return useQuery({
    queryKey: ['agent-sessions', params],
    queryFn: () => api.getAgentSessions(params),
    refetchInterval: AGENT_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useAgentSession(id: string | null | undefined) {
  return useQuery({
    queryKey: ['agent-session', id],
    queryFn: () => api.getAgentSession(id!),
    enabled: !!id,
    refetchInterval: AGENT_POLL_MS,
  });
}

export function useAgentRateLimits() {
  return useQuery({
    queryKey: ['agent-rate-limits'],
    queryFn: api.getAgentRateLimits,
    refetchInterval: AGENT_POLL_MS,
  });
}

export function useAgentPorts() {
  return useQuery({
    queryKey: ['agent-ports'],
    queryFn: api.getAgentPorts,
    refetchInterval: AGENT_POLL_MS,
  });
}

export function useAgentSnapshot() {
  return useQuery({
    queryKey: ['agent-snapshot'],
    queryFn: api.getAgentSnapshot,
    refetchInterval: AGENT_POLL_MS,
    refetchIntervalInBackground: false,
  });
}
