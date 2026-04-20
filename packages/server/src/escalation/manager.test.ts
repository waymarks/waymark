/**
 * Escalation Manager Tests — Phase 3
 *
 * Comprehensive test suite for escalation logic:
 * - Stale approval detection
 * - Escalation request creation
 * - Escalation decision submission
 * - Status tracking and decision aggregation
 * - Scheduler functionality
 * - Integration with approval system
 */

import { vi } from 'vitest';

// Mock better-sqlite3 to avoid native module binary incompatibility
vi.mock('better-sqlite3', () => {
  const dataStore: Map<string, any> = new Map();
  const mockDb = {
    prepare: vi.fn((sql: string) => {
      return {
        run: vi.fn((params: any) => {
          if (sql.includes('INSERT INTO')) {
            const key = `action_${params.action_id || params.request_id || params.escalation_request_id || Math.random()}`;
            dataStore.set(key, params);
          } else if (sql.includes('UPDATE')) {
            const id = params.action_id || params.request_id || params.escalation_request_id;
            const key = `action_${id}`;
            const existing = dataStore.get(key) || {};
            const updates: any = {};
            const setMatch = sql.match(/SET\s+(.*?)\s+WHERE/is);
            if (setMatch) {
              const setClauses = setMatch[1].split(',');
              setClauses.forEach((clause: string) => {
                const [col, val] = clause.split('=').map((s: string) => s.trim());
                if (val?.startsWith("'") && val?.endsWith("'")) {
                  updates[col] = val.slice(1, -1);
                } else if (val?.startsWith('@')) {
                  const paramName = val.slice(1);
                  updates[col] = params[paramName];
                }
              });
            }
            dataStore.set(key, { ...existing, ...updates });
          }
          return { changes: 1 };
        }),
        get: vi.fn((idOrParams: any) => {
          const id = typeof idOrParams === 'string' ? idOrParams : idOrParams?.action_id;
          return dataStore.get(`action_${id}`);
        }),
        all: vi.fn(() => Array.from(dataStore.values())),
      };
    }),
    exec: vi.fn(),
    close: vi.fn(),
  };
  return { default: vi.fn(() => mockDb) };
});

import {
  checkAndEscalateStaleApprovals,
  determineEscalationTargets,
  submitEscalationDecision,
  getEscalationStatus,
  canProceedWithRollbackAfterEscalation,
  getEscalationHistoryForSession,
  startEscalationScheduler,
  stopEscalationScheduler,
  isSchedulerRunning,
  EscalationCheckResult,
  EscalationStatusResult,
} from './manager';

import * as db from '../db/database';

vi.mock('../db/database');

describe('Escalation Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkAndEscalateStaleApprovals', () => {
    it('should detect stale approvals and create escalations', () => {
      const staleApprovals = [
        { approval_request_id: 'apr-1', session_id: 'sess-1' },
        { approval_request_id: 'apr-2', session_id: 'sess-2' },
      ];

      const rules = [
        {
          rule_id: 'rule-1',
          name: 'Default Rule',
          description: 'Escalate to all managers',
          timeout_hours: 2,
          escalation_targets: '["mgr-1", "mgr-2"]',
          created_at: new Date().toISOString(),
          created_by: 'admin',
          status: 'active',
        },
      ];

      (db.getStaleApprovals as vi.Mock).mockReturnValue(staleApprovals);
      (db.getAllEscalationRules as vi.Mock).mockReturnValue(rules);
      (db.createEscalationRequest as vi.Mock).mockReturnValue(undefined);

      const result = checkAndEscalateStaleApprovals();

      expect(result.hasStaleApprovals).toBe(true);
      expect(result.staleApprovals).toEqual(staleApprovals);
      expect(result.escalationsCreated).toHaveLength(2);
      expect(db.createEscalationRequest).toHaveBeenCalledTimes(2);
    });

    it('should handle no stale approvals', () => {
      (db.getStaleApprovals as vi.Mock).mockReturnValue([]);
      (db.getAllEscalationRules as vi.Mock).mockReturnValue([]);

      const result = checkAndEscalateStaleApprovals();

      expect(result.hasStaleApprovals).toBe(false);
      expect(result.escalationsCreated).toHaveLength(0);
    });

    it('should handle missing escalation rules gracefully', () => {
      const staleApprovals = [
        { approval_request_id: 'apr-1', session_id: 'sess-1' },
      ];

      (db.getStaleApprovals as vi.Mock).mockReturnValue(staleApprovals);
      (db.getAllEscalationRules as vi.Mock).mockReturnValue([]);

      const result = checkAndEscalateStaleApprovals();

      expect(result.escalationsCreated).toHaveLength(0);
      expect(db.createEscalationRequest).not.toHaveBeenCalled();
    });

    it('should set correct escalation deadline based on rule timeout', () => {
      const staleApprovals = [
        { approval_request_id: 'apr-1', session_id: 'sess-1' },
      ];

      const rules = [
        {
          rule_id: 'rule-1',
          name: 'Quick Escalation',
          description: 'Fast escalation',
          timeout_hours: 4,
          escalation_targets: '["mgr-1"]',
          created_at: new Date().toISOString(),
          created_by: 'admin',
          status: 'active',
        },
      ];

      (db.getStaleApprovals as vi.Mock).mockReturnValue(staleApprovals);
      (db.getAllEscalationRules as vi.Mock).mockReturnValue(rules);
      (db.createEscalationRequest as vi.Mock).mockReturnValue(undefined);

      checkAndEscalateStaleApprovals();

      const call = (db.createEscalationRequest as vi.Mock).mock.calls[0];
      expect(call).toHaveLength(5);
      // Verify deadline is roughly 4 hours from now
      const deadline = new Date(call[4]);
      const now = new Date();
      const diffHours = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeGreaterThan(3.9);
      expect(diffHours).toBeLessThan(4.1);
    });
  });

  describe('determineEscalationTargets', () => {
    it('should return targets from first active rule', () => {
      const rules = [
        {
          rule_id: 'rule-1',
          name: 'Default',
          description: '',
          timeout_hours: 2,
          escalation_targets: '["mgr-1", "mgr-2", "lead-1"]',
          created_at: new Date().toISOString(),
          created_by: 'admin',
          status: 'active',
        },
      ];

      (db.getAllEscalationRules as vi.Mock).mockReturnValue(rules);

      const targets = determineEscalationTargets('apr-1');

      expect(targets).toEqual(['mgr-1', 'mgr-2', 'lead-1']);
    });

    it('should return empty array if no rules exist', () => {
      (db.getAllEscalationRules as vi.Mock).mockReturnValue([]);

      const targets = determineEscalationTargets('apr-1');

      expect(targets).toEqual([]);
    });

    it('should handle multiple rules by using first one', () => {
      const rules = [
        {
          rule_id: 'rule-1',
          name: 'First',
          description: '',
          timeout_hours: 2,
          escalation_targets: '["mgr-1"]',
          created_at: new Date().toISOString(),
          created_by: 'admin',
          status: 'active',
        },
        {
          rule_id: 'rule-2',
          name: 'Second',
          description: '',
          timeout_hours: 2,
          escalation_targets: '["mgr-2"]',
          created_at: new Date().toISOString(),
          created_by: 'admin',
          status: 'active',
        },
      ];

      (db.getAllEscalationRules as vi.Mock).mockReturnValue(rules);

      const targets = determineEscalationTargets('apr-1');

      expect(targets).toEqual(['mgr-1']);
    });
  });

  describe('submitEscalationDecision', () => {
    const mockEscalation = {
      request_id: 'esc-1',
      approval_request_id: 'apr-1',
      session_id: 'sess-1',
      escalation_triggered_at: new Date().toISOString(),
      escalation_deadline: new Date(Date.now() + 7200000).toISOString(),
      escalation_targets: '["mgr-1", "mgr-2"]',
      status: 'pending',
      decided_at: null,
      decision: null,
    };

    it('should accept valid proceed decision', () => {
      (db.getEscalationRequest as vi.Mock).mockReturnValue(mockEscalation);
      (db.getEscalationDecisions as vi.Mock).mockReturnValue([]);
      (db.submitEscalationDecision as vi.Mock).mockReturnValue(undefined);

      const result = submitEscalationDecision('esc-1', 'mgr-1', 'proceed', 'looks good');

      expect(db.submitEscalationDecision).toHaveBeenCalledWith(
        expect.any(String),
        'esc-1',
        'mgr-1',
        'proceed',
        'looks good'
      );
      expect(result).toBeDefined();
    });

    it('should accept valid block decision', () => {
      (db.getEscalationRequest as vi.Mock).mockReturnValue(mockEscalation);
      (db.getEscalationDecisions as vi.Mock).mockReturnValue([]);
      (db.submitEscalationDecision as vi.Mock).mockReturnValue(undefined);

      const result = submitEscalationDecision('esc-1', 'mgr-1', 'block', 'needs review');

      expect(db.submitEscalationDecision).toHaveBeenCalled();
    });

    it('should reject decision from unauthorized target', () => {
      (db.getEscalationRequest as vi.Mock).mockReturnValue(mockEscalation);

      expect(() => {
        submitEscalationDecision('esc-1', 'unauthorized-user', 'proceed');
      }).toThrow('not authorized');
    });

    it('should reject duplicate decisions from same target', () => {
      (db.getEscalationRequest as vi.Mock).mockReturnValue(mockEscalation);
      (db.getEscalationDecisions as vi.Mock).mockReturnValue([
        { target_id: 'mgr-1', decision: 'proceed', reason: 'initial' },
      ]);

      expect(() => {
        submitEscalationDecision('esc-1', 'mgr-1', 'block', 'changed mind');
      }).toThrow('already made a decision');
    });

    it('should throw error for non-existent escalation', () => {
      (db.getEscalationRequest as vi.Mock).mockReturnValue(null);

      expect(() => {
        submitEscalationDecision('non-existent', 'mgr-1', 'proceed');
      }).toThrow('not found');
    });
  });

  describe('getEscalationStatus', () => {
    const mockEscalation = {
      request_id: 'esc-1',
      approval_request_id: 'apr-1',
      session_id: 'sess-1',
      escalation_triggered_at: new Date().toISOString(),
      escalation_deadline: new Date(Date.now() + 7200000).toISOString(),
      escalation_targets: '["mgr-1", "mgr-2"]',
      status: 'pending',
      decided_at: null,
      decision: null,
    };

    it('should return pending status with no decisions', () => {
      (db.getEscalationRequest as vi.Mock).mockReturnValue(mockEscalation);
      (db.getEscalationDecisions as vi.Mock).mockReturnValue([]);

      const status = getEscalationStatus('esc-1');

      expect(status.status).toBe('pending');
      expect(status.can_proceed).toBe(false);
      expect(status.decisions_received).toBe(0);
    });

    it('should return blocked status with any block decision', () => {
      (db.getEscalationRequest as vi.Mock).mockReturnValue(mockEscalation);
      (db.getEscalationDecisions as vi.Mock).mockReturnValue([
        { target_id: 'mgr-1', decision: 'block', reason: 'risky' },
        { target_id: 'mgr-2', decision: 'proceed', reason: null },
      ]);

      const status = getEscalationStatus('esc-1');

      expect(status.status).toBe('blocked');
      expect(status.can_proceed).toBe(false);
      expect(status.decisions_received).toBe(2);
    });

    it('should return proceeded status when all targets proceed', () => {
      (db.getEscalationRequest as vi.Mock).mockReturnValue(mockEscalation);
      (db.getEscalationDecisions as vi.Mock).mockReturnValue([
        { target_id: 'mgr-1', decision: 'proceed', reason: null },
        { target_id: 'mgr-2', decision: 'proceed', reason: 'approved' },
      ]);

      const status = getEscalationStatus('esc-1');

      expect(status.status).toBe('proceeded');
      expect(status.can_proceed).toBe(true);
      expect(status.decisions_received).toBe(2);
    });

    it('should return pending status with partial decisions', () => {
      (db.getEscalationRequest as vi.Mock).mockReturnValue(mockEscalation);
      (db.getEscalationDecisions as vi.Mock).mockReturnValue([
        { target_id: 'mgr-1', decision: 'proceed', reason: null },
      ]);

      const status = getEscalationStatus('esc-1');

      expect(status.status).toBe('pending');
      expect(status.can_proceed).toBe(false);
    });

    it('should throw error for non-existent escalation', () => {
      (db.getEscalationRequest as vi.Mock).mockReturnValue(null);

      expect(() => {
        getEscalationStatus('non-existent');
      }).toThrow('not found');
    });
  });

  describe('canProceedWithRollbackAfterEscalation', () => {
    it('should allow rollback if no escalation exists', () => {
      (db.getPendingEscalations as vi.Mock).mockReturnValue([]);

      const canProceed = canProceedWithRollbackAfterEscalation('apr-1');

      expect(canProceed).toBe(true);
    });

    it('should block rollback if escalation is blocked', () => {
      (db.getPendingEscalations as vi.Mock).mockReturnValue([
        { request_id: 'esc-1', approval_request_id: 'apr-1', session_id: 'sess-1' },
      ]);
      (db.getEscalationRequest as vi.Mock).mockReturnValue({
        request_id: 'esc-1',
        approval_request_id: 'apr-1',
        session_id: 'sess-1',
        escalation_targets: '["mgr-1"]',
      });
      (db.getEscalationDecisions as vi.Mock).mockReturnValue([
        { target_id: 'mgr-1', decision: 'block' },
      ]);

      const canProceed = canProceedWithRollbackAfterEscalation('apr-1');

      expect(canProceed).toBe(false);
    });

    it('should allow rollback if escalation is proceeded', () => {
      (db.getPendingEscalations as vi.Mock).mockReturnValue([
        { request_id: 'esc-1', approval_request_id: 'apr-1', session_id: 'sess-1' },
      ]);
      (db.getEscalationRequest as vi.Mock).mockReturnValue({
        request_id: 'esc-1',
        approval_request_id: 'apr-1',
        session_id: 'sess-1',
        escalation_targets: '["mgr-1", "mgr-2"]',
      });
      (db.getEscalationDecisions as vi.Mock).mockReturnValue([
        { target_id: 'mgr-1', decision: 'proceed' },
        { target_id: 'mgr-2', decision: 'proceed' },
      ]);

      const canProceed = canProceedWithRollbackAfterEscalation('apr-1');

      expect(canProceed).toBe(true);
    });

    it('should block rollback if escalation is still pending', () => {
      (db.getPendingEscalations as vi.Mock).mockReturnValue([
        { request_id: 'esc-1', approval_request_id: 'apr-1', session_id: 'sess-1' },
      ]);
      (db.getEscalationRequest as vi.Mock).mockReturnValue({
        request_id: 'esc-1',
        approval_request_id: 'apr-1',
        session_id: 'sess-1',
        escalation_targets: '["mgr-1", "mgr-2"]',
      });
      (db.getEscalationDecisions as vi.Mock).mockReturnValue([
        { target_id: 'mgr-1', decision: 'proceed' },
      ]);

      const canProceed = canProceedWithRollbackAfterEscalation('apr-1');

      expect(canProceed).toBe(false);
    });

    it('should handle errors gracefully and block rollback', () => {
      (db.getPendingEscalations as vi.Mock).mockReturnValue([
        { request_id: 'esc-1', approval_request_id: 'apr-1', session_id: 'sess-1' },
      ]);
      (db.getEscalationRequest as vi.Mock).mockImplementation(() => {
        throw new Error('DB error');
      });

      const canProceed = canProceedWithRollbackAfterEscalation('apr-1');

      expect(canProceed).toBe(false);
    });
  });

  describe('getEscalationHistoryForSession', () => {
    it('should return escalation history for session', () => {
      const history = [
        {
          request_id: 'esc-1',
          approval_request_id: 'apr-1',
          session_id: 'sess-1',
          escalation_triggered_at: new Date().toISOString(),
          escalation_deadline: new Date().toISOString(),
          escalation_targets: '["mgr-1"]',
          status: 'proceeded',
          decided_at: new Date().toISOString(),
          decision: 'proceed',
        },
      ];

      (db.getEscalationHistory as vi.Mock).mockReturnValue(history);

      const result = getEscalationHistoryForSession('sess-1');

      expect(result).toEqual(history);
      expect(db.getEscalationHistory).toHaveBeenCalledWith('sess-1');
    });

    it('should return empty array if no history', () => {
      (db.getEscalationHistory as vi.Mock).mockReturnValue([]);

      const result = getEscalationHistoryForSession('sess-1');

      expect(result).toEqual([]);
    });
  });

  describe('Escalation Scheduler', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      stopEscalationScheduler(); // Ensure scheduler is stopped before tests
    });

    afterEach(() => {
      vi.useRealTimers();
      stopEscalationScheduler();
    });

    it('should start scheduler when enabled', () => {
      (db.getStaleApprovals as vi.Mock).mockReturnValue([]);
      (db.getAllEscalationRules as vi.Mock).mockReturnValue([]);

      startEscalationScheduler({ interval_ms: 60000, enabled: true });

      expect(isSchedulerRunning()).toBe(true);
    });

    it('should not start scheduler when disabled', () => {
      startEscalationScheduler({ interval_ms: 60000, enabled: false });

      expect(isSchedulerRunning()).toBe(false);
    });

    it('should stop scheduler', () => {
      (db.getStaleApprovals as vi.Mock).mockReturnValue([]);
      (db.getAllEscalationRules as vi.Mock).mockReturnValue([]);

      startEscalationScheduler({ interval_ms: 60000, enabled: true });
      expect(isSchedulerRunning()).toBe(true);

      stopEscalationScheduler();
      expect(isSchedulerRunning()).toBe(false);
    });

    it('should check for stale approvals at regular intervals', () => {
      (db.getStaleApprovals as vi.Mock).mockReturnValue([]);
      (db.getAllEscalationRules as vi.Mock).mockReturnValue([]);

      startEscalationScheduler({ interval_ms: 60000, enabled: true });

      vi.advanceTimersByTime(60000);
      expect(db.getStaleApprovals).toHaveBeenCalled();

      vi.advanceTimersByTime(60000);
      expect(db.getStaleApprovals).toHaveBeenCalledTimes(2);

      stopEscalationScheduler();
    });

    it('should prevent multiple scheduler instances', () => {
      (db.getStaleApprovals as vi.Mock).mockReturnValue([]);
      (db.getAllEscalationRules as vi.Mock).mockReturnValue([]);

      startEscalationScheduler({ interval_ms: 60000, enabled: true });
      const firstRunStatus = isSchedulerRunning();

      startEscalationScheduler({ interval_ms: 60000, enabled: true });
      expect(isSchedulerRunning()).toBe(firstRunStatus);

      stopEscalationScheduler();
    });

    it('should handle scheduler errors gracefully', () => {
      (db.getStaleApprovals as vi.Mock).mockImplementation(() => {
        throw new Error('DB connection error');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();

      startEscalationScheduler({ interval_ms: 1000, enabled: true });
      vi.advanceTimersByTime(1000);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Escalation] Scheduler error'),
        expect.any(Error)
      );

      stopEscalationScheduler();
      consoleSpy.mockRestore();
    });
  });

  describe('Escalation Integration Scenarios', () => {
    it('should handle complete escalation flow: create -> decide -> allow rollback', () => {
      // Step 1: Create escalation request
      const staleApprovals = [
        { approval_request_id: 'apr-1', session_id: 'sess-1' },
      ];
      const rules = [
        {
          rule_id: 'rule-1',
          name: 'Default',
          description: '',
          timeout_hours: 2,
          escalation_targets: '["mgr-1", "mgr-2"]',
          created_at: new Date().toISOString(),
          created_by: 'admin',
          status: 'active',
        },
      ];

      (db.getStaleApprovals as vi.Mock).mockReturnValue(staleApprovals);
      (db.getAllEscalationRules as vi.Mock).mockReturnValue(rules);
      (db.createEscalationRequest as vi.Mock).mockReturnValue(undefined);

      const checkResult = checkAndEscalateStaleApprovals();
      expect(checkResult.escalationsCreated).toHaveLength(1);

      // Step 2: Managers make decisions
      const escalationId = checkResult.escalationsCreated[0];
      const mockEscalation = {
        request_id: escalationId,
        approval_request_id: 'apr-1',
        session_id: 'sess-1',
        escalation_triggered_at: new Date().toISOString(),
        escalation_deadline: new Date(Date.now() + 7200000).toISOString(),
        escalation_targets: '["mgr-1", "mgr-2"]',
        status: 'pending',
        decided_at: null,
        decision: null,
      };

      (db.getEscalationRequest as vi.Mock).mockReturnValue(mockEscalation);

      // Track decisions made during this test
      const decisions: { target_id: string; decision: string }[] = [];
      (db.getEscalationDecisions as vi.Mock).mockImplementation(() => {
        return decisions;
      });
      (db.submitEscalationDecision as vi.Mock).mockImplementation(
        (decision_id: string, escalation_request_id: string, target_id: string, decision: string, reason?: string) => {
          decisions.push({ target_id, decision });
        }
      );

      submitEscalationDecision(escalationId, 'mgr-1', 'proceed');
      submitEscalationDecision(escalationId, 'mgr-2', 'proceed');

      // Step 3: Check if rollback can proceed
      (db.getPendingEscalations as vi.Mock).mockReturnValue([
        { request_id: escalationId, approval_request_id: 'apr-1', session_id: 'sess-1' },
      ]);

      const status = getEscalationStatus(escalationId);
      expect(status.status).toBe('proceeded');

      const canProceed = canProceedWithRollbackAfterEscalation('apr-1');
      expect(canProceed).toBe(true);
    });

    it('should block rollback when escalation is blocked', () => {
      const escalationId = 'esc-1';
      const mockEscalation = {
        request_id: escalationId,
        approval_request_id: 'apr-1',
        session_id: 'sess-1',
        escalation_triggered_at: new Date().toISOString(),
        escalation_deadline: new Date(Date.now() + 7200000).toISOString(),
        escalation_targets: '["mgr-1", "mgr-2"]',
        status: 'pending',
        decided_at: null,
        decision: null,
      };

      (db.getEscalationRequest as vi.Mock).mockReturnValue(mockEscalation);
      (db.getEscalationDecisions as vi.Mock).mockReturnValue([
        { target_id: 'mgr-1', decision: 'block', reason: 'needs more review' },
      ]);

      const status = getEscalationStatus(escalationId);
      expect(status.status).toBe('blocked');

      (db.getPendingEscalations as vi.Mock).mockReturnValue([
        { request_id: escalationId, approval_request_id: 'apr-1', session_id: 'sess-1' },
      ]);

      const canProceed = canProceedWithRollbackAfterEscalation('apr-1');
      expect(canProceed).toBe(false);
    });
  });
});
