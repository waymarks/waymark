// Shapes mirrored from packages/server/src/db/database.ts

export interface ActionRow {
  id: number;
  action_id: string;
  session_id: string;
  tool_name: string;
  target_path: string | null;
  input_payload: string;
  before_snapshot: string | null;
  after_snapshot: string | null;
  status: string;
  error_message: string | null;
  stdout: string | null;
  stderr: string | null;
  rolled_back: number;
  rolled_back_at: string | null;
  created_at: string;
  decision: string;
  policy_reason: string | null;
  matched_rule: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  event_type: string;
  observation_context: string | null;
  request_source: string;
  source?: string;
  rollback_group?: string;
  is_reversible?: number;
  revert_action_id?: string;
  // The action_views drawer references this; server may not return it yet — optional.
  intent?: string;
}

export interface SessionRow {
  session_id: string;
  user_id: string | null;
  project_id: string | null;
  created_at: string;
  rolled_back_at: string | null;
  status: string;
}

// /api/sessions response — aggregate over action_log, not the sessions table
export interface SessionSummary {
  session_id: string;
  action_count: number;
  latest: string;
}

export interface ApprovalRequest {
  request_id: string;
  session_id: string;
  route_id: string;
  triggered_by: string;
  triggered_at: string;
  status: string; // pending, approved, rejected, mixed
  completed_at: string | null;
  approver_ids: string; // JSON string of array
  approved_count: number;
  rejected_count: number;
  approval_details: string | null;
}

export interface EscalationRequest {
  request_id: string;
  approval_request_id: string;
  session_id: string;
  escalation_triggered_at: string | null;
  escalation_deadline: string;
  escalation_targets: string; // JSON string of array
  status: string; // pending, decided
  decided_at: string | null;
  decision: string | null;
}

export interface SessionActionsResponse {
  session_id: string;
  action_count: number;
  actions: ActionRow[];
}

export interface SessionRollbackResponse {
  success: boolean;
  message: string;
  actions_rolled_back: number;
  files_restored: string[];
}

export interface ApiError {
  error: string;
}

export interface PolicyConfig {
  version?: string;
  port?: number;
  policies?: {
    allowedPaths?: string[];
    blockedPaths?: string[];
    requireApproval?: string[];
    blockedCommands?: string[];
    maxBashOutputBytes?: number;
  };
}

export interface HubProject {
  id: string;
  projectRoot: string;
  projectName: string;
  port: number;
  mcp_pid?: number;
  api_pid?: number;
  status: string;
  startedAt?: string;
  hostname?: string;
  user?: string;
}

export interface ProjectInfo {
  projectName: string | null;
  port: number;
  projectRoot: string;
}

export interface TeamMember {
  member_id: string;
  name: string;
  email: string;
  slack_id: string | null;
  role: string;
  added_at: string;
  added_by: string | null;
  status: string;
}

export interface ApprovalRoute {
  route_id: string;
  name: string;
  description: string | null;
  condition_type: string;
  condition_json: string | null;
  required_approvers: number;
  approver_ids: string; // JSON array
  created_at: string;
  created_by: string | null;
  status: string;
}

export interface EscalationRule {
  rule_id: string;
  name: string;
  description: string | null;
  timeout_hours: number;
  escalation_targets: string; // JSON array
  created_at: string;
  created_by: string | null;
  status: string;
}

export interface RemediationBlocksResponse {
  blocks: unknown[];
  total: number;
  message?: string;
}

export interface SummaryStats {
  totalActions: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  todayCount: number;
  thisWeekCount: number;
  thisMonthCount: number;
  topTools: Array<{ tool: string; count: number }>;
  topPaths: Array<{ path: string; count: number }>;
}
