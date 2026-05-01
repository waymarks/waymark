import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import { run } from './status';
import * as versionCheck from '../utils/version-check';

vi.mock('fs');
vi.mock('../utils/version-check');

describe('status command', () => {
  const mockFs = fs as any;
  const mockVersionCheck = versionCheck as any;
  
  let consoleSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.cwd = vi.fn().mockReturnValue('/home/user/myproject') as any;
    
    global.fetch = vi.fn();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('initialization check', () => {
    it('should show error message when waymark is not initialized', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('Waymark not initialized in this directory.');
      expect(consoleSpy).toHaveBeenCalledWith('Run: npx @way_marks/cli init');
    });

    it('should show error when config is corrupt', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Invalid JSON');
      });

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('Waymark config is corrupt. Re-run: npx @way_marks/cli init');
    });
  });

  describe('status display', () => {
    beforeEach(() => {
      const config = {
        port: 3001,
        projectRoot: '/home/user/myproject',
        projectName: 'my-project',
        startedAt: '2024-01-15T10:30:00Z',
      };
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config));
      
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: null,
        updateAvailable: false,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ count: 0 }),
      });
    });

    it('should display project info when running', async () => {
      await run();

      expect(consoleSpy).toHaveBeenCalledWith('Waymark — Project Status');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Project:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('my-project'));
      expect(consoleSpy).toHaveBeenCalledWith('Server:     running ✅');
    });

    it('should show server not running when fetch fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('Server:     not running ❌');
      expect(consoleSpy).toHaveBeenCalledWith('Start with: npx @way_marks/cli start');
    });

    it('should display pending actions count', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ count: 3 }),
      });

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('Pending:    3 actions');
    });

    it('should not show pending count when server not running', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      await run();

      const calls = consoleSpy.mock.calls.map((c: any) => c[0]);
      const pendingCall = calls.find((c: any) => typeof c === 'string' && c.includes('Pending'));
      expect(pendingCall).toBeUndefined();
    });
  });

  describe('version display', () => {
    beforeEach(() => {
      const config = {
        port: 3001,
        projectRoot: '/home/user/myproject',
        projectName: 'my-project',
        startedAt: '2024-01-15T10:30:00Z',
      };
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ count: 0 }),
      });
    });

    it('should display current version when no update available', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.2',
        updateAvailable: false,
      });

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('Version:    4.4.2');
      
      const calls = consoleSpy.mock.calls.map((c: any) => c[0]);
      const updateWarning = calls.find((c: any) => typeof c === 'string' && c.includes('⚠️'));
      expect(updateWarning).toBeUndefined();
    });

    it('should display update notification when newer version available', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('Version:    4.4.2');
      expect(consoleSpy).toHaveBeenCalledWith('⚠️  New version 4.4.3 available!');
      expect(consoleSpy).toHaveBeenCalledWith('Update:     npm install -g @way_marks/cli@latest');
    });

    it('should not crash when version check fails', async () => {
      mockVersionCheck.checkVersion.mockRejectedValue(new Error('Network error'));

      await expect(run()).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('Server:     running ✅');
    });

    it('should handle null latest version gracefully', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: null,
        updateAvailable: false,
      });

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('Version:    4.4.2');
      
      const calls = consoleSpy.mock.calls.map((c: any) => c[0]);
      const updateWarning = calls.find((c: any) => typeof c === 'string' && c.includes('⚠️'));
      expect(updateWarning).toBeUndefined();
    });
  });

  describe('output formatting', () => {
    beforeEach(() => {
      const config = {
        port: 3001,
        projectRoot: '/home/user/myproject',
        projectName: 'my-project',
        startedAt: '2024-01-15T10:30:00Z',
      };
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config));

      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: null,
        updateAvailable: false,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ count: 0 }),
      });
    });

    it('should have separator line before version info', async () => {
      await run();

      const calls = consoleSpy.mock.calls.map((c: any) => c[0]);
      const versionIndex = calls.findIndex((c: any) => typeof c === 'string' && c.includes('Version:'));
      const prevCall = calls[versionIndex - 1];
      
      expect(typeof prevCall).toBe('string');
      expect(prevCall).toMatch(/^─+$/);
    });

    it('should display all required info sections', async () => {
      await run();

      const calls = consoleSpy.mock.calls.map((c: any) => c[0]);
      const callStr = calls.join('\n');
      
      expect(callStr).toContain('Waymark — Project Status');
      expect(callStr).toContain('Project:');
      expect(callStr).toContain('Root:');
      expect(callStr).toContain('Database:');
      expect(callStr).toContain('Port:');
      expect(callStr).toContain('Dashboard:');
      expect(callStr).toContain('MCP key:');
      expect(callStr).toContain('Server:');
      expect(callStr).toContain('Version:');
    });
  });
});
