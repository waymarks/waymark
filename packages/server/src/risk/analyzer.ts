/**
 * Risk Assessment Engine — Phase 4A
 *
 * Evaluates rollback safety based on:
 * - Operation type risk (what tools were used)
 * - Scale risk (how many actions)
 * - Error pattern risk (what errors occurred)
 * - Time risk (how old are the actions)
 * - System state risk (current system load)
 *
 * Produces 0-10 risk score and safety level:
 * - NONE (0)
 * - LOW (1-2)
 * - MEDIUM (3-4)
 * - HIGH (5-7)
 * - CRITICAL (8+)
 */

export interface Action {
  action_id: string;
  session_id: string;
  tool_name: string;
  event_type: 'execution' | 'observation';
  status: 'pending' | 'success' | 'error' | 'rejected';
  created_at: string;
  error_message?: string;
  stdout?: string;
  stderr?: string;
  target?: string;
  approved_by?: string;
}

export interface Session {
  session_id: string;
  created_at: string;
  action_count: number;
  tool_names: string[];
  latest?: string;
  status?: string;
}

export interface SystemState {
  cpu_usage: number;        // 0-100
  memory_usage: number;     // 0-100
  load_average: number;     // typical 0-4
  active_users: number;
  request_rate: number;     // requests per second
}

export interface RiskFactor {
  category: string;         // operation_type, scale, error_pattern, time, system_state
  weight: number;           // 0-3, contribution to risk
  reason: string;           // Human-readable explanation
  sub_factors?: RiskFactor[];
}

export interface RiskAssessment {
  score: number;            // 0-10
  level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];    // Breakdown of contributing factors
  blocked_reason?: string;  // Why auto-blocked (if blocked)
  recommendations: string[];
  timestamp: string;
}

/**
 * Assess overall risk of a session rollback
 */
export function assessRisk(
  session: Session,
  actions: Action[],
  systemState?: SystemState
): RiskAssessment {
  const timestamp = new Date().toISOString();
  const factors: RiskFactor[] = [];

  // 1. Operation type risk
  const operationRisk = calculateOperationTypeRisk(actions);
  factors.push({
    category: 'operation_type',
    weight: operationRisk.weight,
    reason: operationRisk.reason,
    sub_factors: operationRisk.sub_factors,
  });

  // 2. Scale risk
  const scaleRisk = calculateScaleRisk(actions);
  factors.push({
    category: 'scale',
    weight: scaleRisk.weight,
    reason: scaleRisk.reason,
  });

  // 3. Error pattern risk
  const errorRisk = calculateErrorPatternRisk(actions);
  factors.push({
    category: 'error_pattern',
    weight: errorRisk.weight,
    reason: errorRisk.reason,
    sub_factors: errorRisk.sub_factors,
  });

  // 4. Time risk
  const timeRisk = calculateTimeRisk(session);
  factors.push({
    category: 'time',
    weight: timeRisk.weight,
    reason: timeRisk.reason,
  });

  // 5. System state risk
  const systemRisk = calculateSystemStateRisk(systemState);
  factors.push({
    category: 'system_state',
    weight: systemRisk.weight,
    reason: systemRisk.reason,
  });

  // Calculate overall score (average of weights)
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const score = Math.min(10, Math.round((totalWeight / 5) * 10) / 10);

  // Determine risk level
  const level = getRiskLevel(score);

  // Generate recommendations
  const recommendations = generateRecommendations(score, level, factors, actions);

  return {
    score,
    level,
    factors,
    recommendations,
    timestamp,
  };
}

/**
 * Calculate operation type risk
 * High-risk tools: write_file, delete_file, bash, api_call with mutations
 * Medium-risk: read operations that require consistency
 * Low-risk: information gathering, metadata operations
 */
export function calculateOperationTypeRisk(
  actions: Action[]
): { weight: number; reason: string; sub_factors: RiskFactor[] } {
  const toolRisks: Record<string, number> = {
    // HIGH RISK (2.5 points) - data modification/deletion
    delete_file: 2.5,
    write_file: 2.0,
    bash: 2.0,
    api_call: 1.5, // Depends on mutation type

    // MEDIUM RISK (1.0-1.5 points) - consistency-dependent
    mkdir: 1.5,
    rmdir: 2.0,

    // LOW RISK (0 points) - read-only
    read_file: 0,
    find_files: 0,
    grep: 0,
  };

  const sub_factors: RiskFactor[] = [];
  let totalRisk = 0;
  let highRiskCount = 0;
  let deleteCount = 0;
  let writeCount = 0;
  let bashCount = 0;

  for (const action of actions) {
    const risk = toolRisks[action.tool_name] || 0.5; // Default medium for unknown
    totalRisk += risk;

    if (risk >= 2.0) highRiskCount++;
    if (action.tool_name === 'delete_file') deleteCount++;
    if (action.tool_name === 'write_file') writeCount++;
    if (action.tool_name === 'bash') bashCount++;

    sub_factors.push({
      category: action.tool_name,
      weight: risk,
      reason: `Tool: ${action.tool_name}`,
    });
  }

  const avgToolRisk = actions.length > 0 ? totalRisk / actions.length : 0;
  const weight = Math.min(3, avgToolRisk);

  let reason = `Average tool risk: ${avgToolRisk.toFixed(1)}/3.0`;
  if (deleteCount > 0) reason += ` (${deleteCount} delete operations)`;
  if (writeCount > 0) reason += ` (${writeCount} write operations)`;
  if (bashCount > 0) reason += ` (${bashCount} bash commands)`;
  if (highRiskCount > actions.length / 2) reason += ' - majority high-risk operations';

  return { weight, reason, sub_factors };
}

/**
 * Calculate scale risk based on number of actions
 * 1 file = 0 risk
 * 2-5 files = 0.5 risk
 * 6-20 files = 1.5 risk
 * 20+ files = 3 risk
 */
export function calculateScaleRisk(actions: Action[]): { weight: number; reason: string } {
  const count = actions.length;
  let weight = 0;

  if (count <= 1) {
    weight = 0;
  } else if (count <= 5) {
    weight = 0.5;
  } else if (count <= 20) {
    weight = 1.5;
  } else {
    weight = 3.0;
  }

  return {
    weight,
    reason: `${count} action(s) - ${
      count <= 1
        ? 'single operation'
        : count <= 5
          ? 'small batch'
          : count <= 20
            ? 'large batch'
            : 'very large batch'
    }`,
  };
}

/**
 * Calculate error pattern risk
 * No errors = 0
 * Transient errors (timeout, network) = 0.5
 * Permission errors = 1.5
 * Data errors (validation, format) = 2.0
 * System errors (crash, critical) = 3.0
 */
export function calculateErrorPatternRisk(
  actions: Action[]
): { weight: number; reason: string; sub_factors: RiskFactor[] } {
  const sub_factors: RiskFactor[] = [];
  const errorActions = actions.filter(a => a.status === 'error');

  if (errorActions.length === 0) {
    return {
      weight: 0,
      reason: 'No errors - all operations successful',
      sub_factors: [],
    };
  }

  let totalErrorRisk = 0;
  let transientCount = 0;
  let permissionCount = 0;
  let dataCount = 0;
  let systemCount = 0;

  for (const action of errorActions) {
    const errorMsg = (action.error_message || '').toLowerCase();
    let errorRisk = 0.5; // Default: transient

    if (
      errorMsg.includes('permission') ||
      errorMsg.includes('denied') ||
      errorMsg.includes('unauthorized')
    ) {
      errorRisk = 1.5;
      permissionCount++;
    } else if (
      errorMsg.includes('validation') ||
      errorMsg.includes('format') ||
      errorMsg.includes('invalid')
    ) {
      errorRisk = 2.0;
      dataCount++;
    } else if (
      errorMsg.includes('crash') ||
      errorMsg.includes('segfault') ||
      errorMsg.includes('fatal') ||
      errorMsg.includes('panic')
    ) {
      errorRisk = 3.0;
      systemCount++;
    } else if (errorMsg.includes('timeout') || errorMsg.includes('network')) {
      errorRisk = 0.5;
      transientCount++;
    }

    totalErrorRisk += errorRisk;
    sub_factors.push({
      category: `error_${action.action_id}`,
      weight: errorRisk,
      reason: `${action.tool_name}: ${action.error_message?.substring(0, 50) || 'unknown error'}`,
    });
  }

  const avgErrorRisk = totalErrorRisk / errorActions.length;
  const weight = Math.min(3, avgErrorRisk);

  let reason = `${errorActions.length} error(s) - average risk: ${avgErrorRisk.toFixed(1)}/3.0`;
  if (systemCount > 0) reason += ` (${systemCount} system errors)`;
  if (dataCount > 0) reason += ` (${dataCount} data errors)`;
  if (permissionCount > 0) reason += ` (${permissionCount} permission errors)`;
  if (transientCount > 0) reason += ` (${transientCount} transient errors)`;

  return { weight, reason, sub_factors };
}

/**
 * Calculate time risk based on how old actions are
 * <5 minutes = 0
 * 5-60 minutes = 0.5
 * 1-6 hours = 1.5
 * 6-24 hours = 2.0
 * 24+ hours = 3.0
 */
export function calculateTimeRisk(session: Session): { weight: number; reason: string } {
  const createdAt = new Date(session.created_at);
  const now = new Date();
  const ageMs = now.getTime() - createdAt.getTime();
  const ageMinutes = ageMs / (1000 * 60);
  const ageHours = ageMinutes / 60;
  const ageDays = ageHours / 24;

  let weight = 0;
  let ageStr = '';

  if (ageMinutes < 5) {
    weight = 0;
    ageStr = `${Math.round(ageMinutes)}m ago - very fresh`;
  } else if (ageMinutes < 60) {
    weight = 0.5;
    ageStr = `${Math.round(ageMinutes)}m ago - recent`;
  } else if (ageHours < 6) {
    weight = 1.5;
    ageStr = `${Math.round(ageHours)}h ago - older`;
  } else if (ageHours < 24) {
    weight = 2.0;
    ageStr = `${Math.round(ageHours)}h ago - very old`;
  } else {
    weight = 3.0;
    ageStr = `${Math.round(ageDays)}d ago - ancient`;
  }

  return {
    weight,
    reason: ageStr,
  };
}

/**
 * Calculate system state risk
 * Low load (cpu <50%, memory <50%) = 0
 * Moderate (cpu 50-75%, memory 50-75%) = 1.0
 * High (cpu 75-90%, memory 75-90%) = 2.0
 * Critical (cpu >90%, memory >90%) = 3.0
 */
export function calculateSystemStateRisk(systemState?: SystemState): { weight: number; reason: string } {
  // Default: assume moderate load if no system state provided
  if (!systemState) {
    return {
      weight: 1.0,
      reason: 'System state unknown - assuming moderate load',
    };
  }

  const avgLoad = (systemState.cpu_usage + systemState.memory_usage) / 2;
  let weight = 0;
  let description = '';

  if (avgLoad < 50) {
    weight = 0;
    description = `Idle system (CPU: ${systemState.cpu_usage}%, Memory: ${systemState.memory_usage}%)`;
  } else if (avgLoad < 75) {
    weight = 1.0;
    description = `Moderate load (CPU: ${systemState.cpu_usage}%, Memory: ${systemState.memory_usage}%)`;
  } else if (avgLoad < 90) {
    weight = 2.0;
    description = `High load (CPU: ${systemState.cpu_usage}%, Memory: ${systemState.memory_usage}%)`;
  } else {
    weight = 3.0;
    description = `Critical load (CPU: ${systemState.cpu_usage}%, Memory: ${systemState.memory_usage}%)`;
  }

  if (systemState.active_users > 50) {
    description += ` - ${systemState.active_users} active users`;
  }

  if (systemState.request_rate > 1000) {
    weight = Math.min(3, weight + 0.5);
    description += ` - high request rate (${systemState.request_rate} req/s)`;
  }

  return {
    weight,
    reason: description,
  };
}

/**
 * Determine risk level from score
 */
export function getRiskLevel(
  score: number
): 'none' | 'low' | 'medium' | 'high' | 'critical' {
  if (score < 1) return 'none';
  if (score < 3) return 'low';
  if (score < 5) return 'medium';
  if (score < 8) return 'high';
  return 'critical';
}

/**
 * Generate recommendations based on risk assessment
 */
export function generateRecommendations(
  score: number,
  level: string,
  factors: RiskFactor[],
  actions: Action[]
): string[] {
  const recommendations: string[] = [];

  // Score-based recommendations
  if (score < 2) {
    recommendations.push('Low risk: Safe to proceed with rollback');
  } else if (score < 4) {
    recommendations.push('Moderate risk: Recommend approval from team lead');
  } else if (score < 7) {
    recommendations.push('High risk: Requires escalation to manager');
    recommendations.push('Consider partial rollback of safe operations only');
  } else {
    recommendations.push('Critical risk: Requires executive approval');
    recommendations.push('Recommend staged rollback with verification');
    recommendations.push('Consider manual remediation instead of full rollback');
  }

  // Factor-specific recommendations
  const operationFactor = factors.find(f => f.category === 'operation_type');
  if (operationFactor && operationFactor.weight > 1.5) {
    recommendations.push('Identify safe read-only operations for selective rollback');
  }

  const scaleFactor = factors.find(f => f.category === 'scale');
  if (scaleFactor && scaleFactor.weight > 1.5) {
    recommendations.push('Consider staged rollback due to large action count');
  }

  const errorFactor = factors.find(f => f.category === 'error_pattern');
  if (errorFactor && errorFactor.weight > 1.5) {
    recommendations.push('Multiple errors detected: review each error before rollback');
  }

  const timeFactor = factors.find(f => f.category === 'time');
  if (timeFactor && timeFactor.weight > 1.5) {
    recommendations.push('Operations are old: ensure no dependencies have changed');
  }

  const systemFactor = factors.find(f => f.category === 'system_state');
  if (systemFactor && systemFactor.weight > 1.5) {
    recommendations.push('System under high load: consider scheduling rollback during off-peak');
  }

  // Check for specific patterns
  const deleteCount = actions.filter(a => a.tool_name === 'delete_file').length;
  if (deleteCount > 0) {
    recommendations.push(`${deleteCount} delete operation(s): verify backups before proceeding`);
  }

  const writeCount = actions.filter(a => a.tool_name === 'write_file').length;
  if (writeCount > 5) {
    recommendations.push('Multiple write operations: consider data consistency checks');
  }

  return recommendations;
}

/**
 * Check if risk assessment should auto-block rollback
 * Auto-block threshold: configurable, default 7.0
 */
export function shouldAutoBlock(score: number, threshold: number = 7.0): boolean {
  return score >= threshold;
}

/**
 * Get human-readable risk summary
 */
export function getRiskSummary(assessment: RiskAssessment): string {
  const score = assessment.score.toFixed(1);
  const level = assessment.level.toUpperCase();

  let summary = `Risk Level: ${level} (${score}/10)\n`;
  summary += '\nRisk Factors:\n';

  for (const factor of assessment.factors) {
    summary += `  • ${factor.category}: ${factor.weight.toFixed(1)}/3.0 - ${factor.reason}\n`;
  }

  if (assessment.blocked_reason) {
    summary += `\n⚠️ AUTO-BLOCKED: ${assessment.blocked_reason}\n`;
  }

  if (assessment.recommendations.length > 0) {
    summary += '\nRecommendations:\n';
    for (const rec of assessment.recommendations) {
      summary += `  → ${rec}\n`;
    }
  }

  return summary;
}

export default {
  assessRisk,
  calculateOperationTypeRisk,
  calculateScaleRisk,
  calculateErrorPatternRisk,
  calculateTimeRisk,
  calculateSystemStateRisk,
  getRiskLevel,
  generateRecommendations,
  shouldAutoBlock,
  getRiskSummary,
};
