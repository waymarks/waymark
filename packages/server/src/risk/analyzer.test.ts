/**
 * Risk Assessment Engine Tests — Phase 4A
 *
 * Test suite covering:
 * - Operation type risk calculation
 * - Scale risk calculation
 * - Error pattern risk calculation
 * - Time risk calculation
 * - System state risk calculation
 * - Overall risk assessment
 * - Risk level determination
 * - Recommendation generation
 */

import {
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
  Action,
  Session,
  SystemState,
  RiskAssessment,
} from './analyzer';

describe('Risk Assessment Engine', () => {
  // Helper functions to create test data
  function createAction(
    toolName: string,
    status: 'success' | 'error' = 'success',
    errorMessage?: string
  ): Action {
    return {
      action_id: `action-${Date.now()}`,
      session_id: 'sess-test',
      tool_name: toolName,
      event_type: 'execution',
      status,
      created_at: new Date().toISOString(),
      error_message: errorMessage,
    };
  }

  function createSession(actionCount: number, minutesOld: number = 0): Session {
    const now = new Date();
    const createdTime = new Date(now.getTime() - minutesOld * 60 * 1000);

    return {
      session_id: 'sess-test',
      created_at: createdTime.toISOString(),
      action_count: actionCount,
      tool_names: [],
    };
  }

  describe('Operation Type Risk', () => {
    it('should return low risk for read-only operations', () => {
      const actions = [createAction('read_file'), createAction('grep'), createAction('find_files')];

      const risk = calculateOperationTypeRisk(actions);

      expect(risk.weight).toBeLessThan(0.5);
      expect(risk.reason).toContain('read');
    });

    it('should return medium risk for write operations', () => {
      const actions = [createAction('write_file'), createAction('write_file')];

      const risk = calculateOperationTypeRisk(actions);

      expect(risk.weight).toBeGreaterThanOrEqual(1.0);
      expect(risk.weight).toBeLessThan(2.0);
    });

    it('should return high risk for delete operations', () => {
      const actions = [createAction('delete_file')];

      const risk = calculateOperationTypeRisk(actions);

      expect(risk.weight).toBeGreaterThanOrEqual(2.0);
      expect(risk.reason).toContain('delete');
    });

    it('should return high risk for bash commands', () => {
      const actions = [createAction('bash')];

      const risk = calculateOperationTypeRisk(actions);

      expect(risk.weight).toBeGreaterThanOrEqual(1.5);
    });

    it('should average risk for mixed operations', () => {
      const actions = [
        createAction('read_file'),
        createAction('write_file'),
        createAction('delete_file'),
      ];

      const risk = calculateOperationTypeRisk(actions);

      // Average of 0, 2.0, 2.5 = 1.5
      expect(risk.weight).toBeGreaterThan(1.0);
      expect(risk.weight).toBeLessThan(2.0);
    });

    it('should handle empty action list', () => {
      const risk = calculateOperationTypeRisk([]);

      expect(risk.weight).toBe(0);
    });
  });

  describe('Scale Risk', () => {
    it('should return no risk for single action', () => {
      const actions = [createAction('write_file')];

      const risk = calculateScaleRisk(actions);

      expect(risk.weight).toBe(0);
      expect(risk.reason).toContain('single operation');
    });

    it('should return low risk for 2-5 actions', () => {
      const actions = [
        createAction('write_file'),
        createAction('write_file'),
        createAction('write_file'),
      ];

      const risk = calculateScaleRisk(actions);

      expect(risk.weight).toBe(0.5);
      expect(risk.reason).toContain('small batch');
    });

    it('should return medium risk for 6-20 actions', () => {
      const actions = Array(10).fill(null).map(() => createAction('write_file'));

      const risk = calculateScaleRisk(actions);

      expect(risk.weight).toBe(1.5);
      expect(risk.reason).toContain('large batch');
    });

    it('should return high risk for 20+ actions', () => {
      const actions = Array(25).fill(null).map(() => createAction('write_file'));

      const risk = calculateScaleRisk(actions);

      expect(risk.weight).toBe(3.0);
      expect(risk.reason).toContain('very large batch');
    });
  });

  describe('Error Pattern Risk', () => {
    it('should return no risk when no errors', () => {
      const actions = [
        createAction('write_file', 'success'),
        createAction('read_file', 'success'),
      ];

      const risk = calculateErrorPatternRisk(actions);

      expect(risk.weight).toBe(0);
      expect(risk.reason).toContain('No errors');
    });

    it('should return low risk for transient errors', () => {
      const actions = [
        createAction('bash', 'error', 'Connection timeout'),
        createAction('bash', 'error', 'Network unreachable'),
      ];

      const risk = calculateErrorPatternRisk(actions);

      expect(risk.weight).toBeGreaterThan(0);
      expect(risk.weight).toBeLessThan(1.0);
    });

    it('should return medium risk for permission errors', () => {
      const actions = [createAction('write_file', 'error', 'Permission denied')];

      const risk = calculateErrorPatternRisk(actions);

      expect(risk.weight).toBeGreaterThanOrEqual(1.5);
    });

    it('should return medium-high risk for data validation errors', () => {
      const actions = [createAction('write_file', 'error', 'Invalid JSON format')];

      const risk = calculateErrorPatternRisk(actions);

      expect(risk.weight).toBe(2.0);
    });

    it('should return critical risk for system errors', () => {
      const actions = [createAction('bash', 'error', 'Segmentation fault')];

      const risk = calculateErrorPatternRisk(actions);

      expect(risk.weight).toBe(3.0);
      expect(risk.reason).toContain('system errors');
    });

    it('should handle mixed error types', () => {
      const actions = [
        createAction('bash', 'error', 'Timeout'),
        createAction('write_file', 'error', 'Permission denied'),
        createAction('bash', 'error', 'Segmentation fault'),
      ];

      const risk = calculateErrorPatternRisk(actions);

      // Average of 0.5, 1.5, 3.0 = 1.67
      expect(risk.weight).toBeGreaterThan(1.0);
      expect(risk.weight).toBeLessThan(2.5);
    });
  });

  describe('Time Risk', () => {
    it('should return no risk for very recent actions (<5 minutes)', () => {
      const session = createSession(1, 2);

      const risk = calculateTimeRisk(session);

      expect(risk.weight).toBe(0);
      expect(risk.reason).toContain('very fresh');
    });

    it('should return low risk for recent actions (5-60 minutes)', () => {
      const session = createSession(1, 30);

      const risk = calculateTimeRisk(session);

      expect(risk.weight).toBe(0.5);
      expect(risk.reason).toContain('recent');
    });

    it('should return medium risk for older actions (1-6 hours)', () => {
      const session = createSession(1, 180); // 3 hours

      const risk = calculateTimeRisk(session);

      expect(risk.weight).toBe(1.5);
      expect(risk.reason).toContain('older');
    });

    it('should return high risk for very old actions (6-24 hours)', () => {
      const session = createSession(1, 12 * 60); // 12 hours

      const risk = calculateTimeRisk(session);

      expect(risk.weight).toBe(2.0);
      expect(risk.reason).toContain('very old');
    });

    it('should return critical risk for ancient actions (24+ hours)', () => {
      const session = createSession(1, 48 * 60); // 48 hours

      const risk = calculateTimeRisk(session);

      expect(risk.weight).toBe(3.0);
      expect(risk.reason).toContain('ancient');
    });
  });

  describe('System State Risk', () => {
    it('should return no risk for idle system', () => {
      const systemState: SystemState = {
        cpu_usage: 10,
        memory_usage: 20,
        load_average: 0.5,
        active_users: 5,
        request_rate: 100,
      };

      const risk = calculateSystemStateRisk(systemState);

      expect(risk.weight).toBe(0);
      expect(risk.reason).toContain('Idle');
    });

    it('should return medium risk for moderate load', () => {
      const systemState: SystemState = {
        cpu_usage: 60,
        memory_usage: 55,
        load_average: 2.0,
        active_users: 20,
        request_rate: 500,
      };

      const risk = calculateSystemStateRisk(systemState);

      expect(risk.weight).toBe(1.0);
      expect(risk.reason).toContain('Moderate');
    });

    it('should return high risk for high load', () => {
      const systemState: SystemState = {
        cpu_usage: 80,
        memory_usage: 75,
        load_average: 3.0,
        active_users: 50,
        request_rate: 1500,
      };

      const risk = calculateSystemStateRisk(systemState);

      expect(risk.weight).toBeGreaterThanOrEqual(2.0);
      expect(risk.reason).toContain('High');
    });

    it('should return critical risk for critical load', () => {
      const systemState: SystemState = {
        cpu_usage: 95,
        memory_usage: 92,
        load_average: 8.0,
        active_users: 200,
        request_rate: 5000,
      };

      const risk = calculateSystemStateRisk(systemState);

      expect(risk.weight).toBe(3.0);
      expect(risk.reason).toContain('Critical');
    });

    it('should handle missing system state gracefully', () => {
      const risk = calculateSystemStateRisk(undefined);

      expect(risk.weight).toBe(1.0);
      expect(risk.reason).toContain('unknown');
    });

    it('should increase weight for very high request rate', () => {
      const systemState: SystemState = {
        cpu_usage: 40,
        memory_usage: 40,
        load_average: 1.0,
        active_users: 10,
        request_rate: 2000, // Very high
      };

      const risk = calculateSystemStateRisk(systemState);

      expect(risk.weight).toBeGreaterThan(1.0);
    });
  });

  describe('Overall Risk Assessment', () => {
    it('should calculate low risk for safe operations', () => {
      const actions = [
        createAction('read_file'),
        createAction('grep'),
      ];
      const session = createSession(2, 2); // Very recent, 2 actions

      const assessment = assessRisk(session, actions);

      expect(assessment.score).toBeLessThan(2);
      expect(assessment.level).toBe('low');
      expect(assessment.factors.length).toBe(5);
    });

    it('should calculate medium risk for moderate operations', () => {
      const actions = Array(10).fill(null).map(() => createAction('write_file'));
      const session = createSession(10, 60); // 1 hour old

      const assessment = assessRisk(session, actions);

      expect(assessment.score).toBeGreaterThan(2);
      expect(assessment.score).toBeLessThan(6);
      expect(assessment.level).toBe('high');
    });

    it('should calculate high risk for risky operations', () => {
      const actions = [
        createAction('delete_file'),
        createAction('bash'),
        createAction('write_file'),
      ];
      const session = createSession(3, 240); // 4 hours old

      const assessment = assessRisk(session, actions);

      expect(assessment.score).toBeGreaterThan(4);
      expect(assessment.score).toBeLessThan(8);
      expect(assessment.level).toBe('high');
    });

    it('should calculate critical risk for very risky operations', () => {
      const actions = Array(30).fill(null).map(() => createAction('delete_file'));
      const session = createSession(30, 1440); // 1 day old
      const systemState: SystemState = {
        cpu_usage: 85,
        memory_usage: 80,
        load_average: 5.0,
        active_users: 100,
        request_rate: 2000,
      };

      const assessment = assessRisk(session, actions, systemState);

      expect(assessment.score).toBeGreaterThanOrEqual(8);
      expect(assessment.level).toBe('critical');
    });

    it('should include all risk factors', () => {
      const actions = [createAction('write_file')];
      const session = createSession(1, 30);

      const assessment = assessRisk(session, actions);

      const factorCategories = assessment.factors.map(f => f.category);
      expect(factorCategories).toContain('operation_type');
      expect(factorCategories).toContain('scale');
      expect(factorCategories).toContain('error_pattern');
      expect(factorCategories).toContain('time');
      expect(factorCategories).toContain('system_state');
    });

    it('should include timestamp', () => {
      const actions = [createAction('read_file')];
      const session = createSession(1, 0);

      const assessment = assessRisk(session, actions);

      expect(assessment.timestamp).toBeTruthy();
      expect(new Date(assessment.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should generate recommendations', () => {
      const actions = Array(20).fill(null).map(() => createAction('delete_file'));
      const session = createSession(20, 0);

      const assessment = assessRisk(session, actions);

      expect(assessment.recommendations.length).toBeGreaterThan(0);
      expect(assessment.recommendations[0]).toBeTruthy();
    });
  });

  describe('Risk Level Determination', () => {
    it('should classify 0 as none', () => {
      expect(getRiskLevel(0)).toBe('none');
    });

    it('should classify 1-2 as low', () => {
      expect(getRiskLevel(1)).toBe('low');
      expect(getRiskLevel(2)).toBe('low');
    });

    it('should classify 3-4 as medium', () => {
      expect(getRiskLevel(3)).toBe('medium');
      expect(getRiskLevel(4)).toBe('medium');
    });

    it('should classify 5-7 as high', () => {
      expect(getRiskLevel(5)).toBe('high');
      expect(getRiskLevel(6.5)).toBe('high');
      expect(getRiskLevel(7)).toBe('high');
    });

    it('should classify 8+ as critical', () => {
      expect(getRiskLevel(8)).toBe('critical');
      expect(getRiskLevel(10)).toBe('critical');
    });
  });

  describe('Recommendation Generation', () => {
    it('should recommend safe approval for low risk', () => {
      const factors = [
        { category: 'operation_type', weight: 0, reason: 'read-only' },
      ];

      const recommendations = generateRecommendations(1.0, 'low', factors as any, []);

      expect(recommendations.some(r => r.includes('Safe to proceed'))).toBe(true);
    });

    it('should recommend escalation for high risk', () => {
      const factors = [
        { category: 'operation_type', weight: 2.5, reason: 'delete operations' },
      ];

      const recommendations = generateRecommendations(6.0, 'high', factors as any, []);

      expect(recommendations.some(r => r.includes('escalation') || r.includes('manager'))).toBe(true);
    });

    it('should recommend partial rollback for large scale', () => {
      const actions = Array(25).fill(null).map(() => createAction('write_file'));
      const factors = [
        { category: 'scale', weight: 3, reason: '25 actions' },
      ];

      const recommendations = generateRecommendations(5.0, 'high', factors as any, actions);

      expect(recommendations.some(r => r.includes('partial') || r.includes('selective'))).toBe(true);
    });

    it('should recommend review for multiple errors', () => {
      const actions = [
        createAction('bash', 'error', 'Error 1'),
        createAction('bash', 'error', 'Error 2'),
      ];
      const factors = [
        { category: 'error_pattern', weight: 1.5, reason: 'multiple errors' },
      ];

      const recommendations = generateRecommendations(4.0, 'medium', factors as any, actions);

      expect(recommendations.some(r => r.includes('review'))).toBe(true);
    });

    it('should warn about old operations', () => {
      const factors = [
        { category: 'time', weight: 3, reason: '48 hours old' },
      ];

      const recommendations = generateRecommendations(5.0, 'high', factors as any, []);

      expect(recommendations.some(r => r.includes('old') || r.includes('dependencies'))).toBe(true);
    });

    it('should warn about system load', () => {
      const factors = [
        { category: 'system_state', weight: 3, reason: 'critical load' },
      ];

      const recommendations = generateRecommendations(5.0, 'high', factors as any, []);

      expect(recommendations.some(r => r.includes('load') || r.includes('off-peak'))).toBe(true);
    });
  });

  describe('Auto-Block Logic', () => {
    it('should not block below threshold', () => {
      expect(shouldAutoBlock(5.0, 7.0)).toBe(false);
      expect(shouldAutoBlock(6.9, 7.0)).toBe(false);
    });

    it('should block at threshold', () => {
      expect(shouldAutoBlock(7.0, 7.0)).toBe(true);
      expect(shouldAutoBlock(8.0, 7.0)).toBe(true);
    });

    it('should use custom threshold', () => {
      expect(shouldAutoBlock(6.0, 6.0)).toBe(true);
      expect(shouldAutoBlock(5.9, 6.0)).toBe(false);
    });

    it('should use default threshold of 7.0', () => {
      expect(shouldAutoBlock(7.0)).toBe(true);
      expect(shouldAutoBlock(6.9)).toBe(false);
    });
  });

  describe('Risk Summary', () => {
    it('should include score and level', () => {
      const actions = [createAction('write_file')];
      const session = createSession(1, 30);
      const assessment = assessRisk(session, actions);

      const summary = getRiskSummary(assessment);

      expect(summary).toContain('Risk Level');
      expect(summary).toContain('/10');
    });

    it('should include all factors', () => {
      const actions = [createAction('delete_file')];
      const session = createSession(1, 60);
      const assessment = assessRisk(session, actions);

      const summary = getRiskSummary(assessment);

      expect(summary).toContain('operation_type');
      expect(summary).toContain('scale');
      expect(summary).toContain('error_pattern');
      expect(summary).toContain('time');
      expect(summary).toContain('system_state');
    });

    it('should include recommendations', () => {
      const actions = Array(25).fill(null).map(() => createAction('delete_file'));
      const session = createSession(25, 0);
      const assessment = assessRisk(session, actions);

      const summary = getRiskSummary(assessment);

      expect(summary).toContain('Recommendations');
      expect(summary).toContain('→');
    });
  });

  describe('Integration Scenarios', () => {
    it('should assess safe database read script as low risk', () => {
      const actions = [
        createAction('read_file', 'success'), // Open script
        createAction('bash', 'success'), // Run script
      ];
      const session = createSession(2, 5);

      const assessment = assessRisk(session, actions);

      expect(assessment.score).toBeLessThan(3);
      expect(assessment.level).toBe('low');
    });

    it('should assess production data deletion as critical risk', () => {
      const actions = Array(15).fill(null).map(() => createAction('delete_file', 'success'));
      const session = createSession(15, 1440); // 1 day old
      const systemState: SystemState = {
        cpu_usage: 75,
        memory_usage: 70,
        load_average: 3.0,
        active_users: 150,
        request_rate: 1500,
      };

      const assessment = assessRisk(session, actions, systemState);

      expect(assessment.score).toBeGreaterThan(7);
      expect(assessment.level).toBe('critical');
    });

    it('should assess failed migration with errors as high risk', () => {
      const actions = [
        createAction('bash', 'success'), // Setup
        createAction('bash', 'error', 'Database validation error'),
        createAction('write_file', 'error', 'Schema migration failed'),
      ];
      const session = createSession(3, 60);

      const assessment = assessRisk(session, actions);

      expect(assessment.score).toBeGreaterThan(4);
      expect(assessment.level).toBe('high');
    });
  });
});
