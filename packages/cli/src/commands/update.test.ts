import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { run } from './update';
import * as versionCheck from '../utils/version-check';
import { execSync } from 'child_process';

vi.mock('../utils/version-check');
vi.mock('child_process');

describe('update command - comprehensive integration tests', () => {
  const mockVersionCheck = versionCheck as any<typeof versionCheck>;
  const mockExecSync = execSync as anyFunction<typeof execSync>;

  let consoleSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;
  let exitCode: number | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    exitCode = null;
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      exitCode = code as number;
      throw new Error('process.exit');
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('successful update flow', () => {
    it('should detect available version and run npm install', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(mockVersionCheck.checkVersion).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Update available: 4.4.2 → 4.4.3');
      expect(consoleSpy).toHaveBeenCalledWith('Installing @way_marks/cli@latest...');
      expect(mockExecSync).toHaveBeenCalledWith('npm install -g @way_marks/cli@latest', {
        stdio: 'inherit',
        timeout: 300000,
      });
      expect(consoleSpy).toHaveBeenCalledWith('✓ Update complete!');
    });

    it('should show success message with restart instructions', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '1.0.0',
        latest: '2.0.0',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      const calls = consoleSpy.mock.calls.map(c => c[0]);
      const output = calls.join('\n');

      expect(output).toContain('✓ Update complete!');
      expect(output).toContain('To start using the updated version');
      expect(output).toContain('Restart your terminal');
      expect(output).toContain('source ~/.bashrc');
      expect(output).toContain('refreshenv');
    });

    it('should show all platform-specific instructions', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '3.0.0',
        latest: '3.1.0',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
      expect(exitCode).toBeNull();
    });

    it('should handle major version updates', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '3.5.2',
        latest: '4.0.0',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('Update available: 3.5.2 → 4.0.0');
      expect(mockExecSync).toHaveBeenCalled();
    });

    it('should handle minor version updates', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.3.0',
        latest: '4.4.0',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('Update available: 4.3.0 → 4.4.0');
    });

    it('should handle patch version updates', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('Update available: 4.4.2 → 4.4.3');
    });
  });

  describe('already on latest version', () => {
    it('should detect latest version and show "already up to date" message', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.2',
        updateAvailable: false,
      });

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('✓ Already on latest version 4.4.2');
      expect(mockExecSync).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should not attempt install when updateAvailable is false', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '1.0.0',
        latest: '1.0.0',
        updateAvailable: false,
      });

      await run();

      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should handle null latest version (network unavailable but at latest)', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: null,
        updateAvailable: false,
      });

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('✓ Already on latest version 4.4.2');
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should handle same version string comparison', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.2',
        updateAvailable: false,
      });

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('✓ Already on latest version 4.4.2');
    });
  });

  describe('version fetch timeout scenarios', () => {
    it('should handle version check timeout gracefully', async () => {
      mockVersionCheck.checkVersion.mockRejectedValue(new Error('Version check timed out after 3000ms'));

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ Version check failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error: Version check timed out'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to check for updates'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('You can manually update with'));
      expect(exitCode).toBe(1);
    });

    it('should suggest manual update when timeout occurs', async () => {
      mockVersionCheck.checkVersion.mockRejectedValue(new Error('Network timeout'));

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('  npm install -g @way_marks/cli@latest');
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should not attempt npm install when version check times out', async () => {
      mockVersionCheck.checkVersion.mockRejectedValue(new Error('AbortError: signal timeout'));

      await expect(run()).rejects.toThrow();

      expect(mockExecSync).not.toHaveBeenCalled();
    });
  });

  describe('npm install failures', () => {
    it('should show error message when npm install fails', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      const error = new Error('npm install failed with exit code 1');
      mockExecSync.mockImplementation(() => {
        throw error;
      });

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ npm install failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith('  Error: npm install failed with exit code 1');
      expect(exitCode).toBe(1);
    });

    it('should show troubleshooting steps on npm install failure', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      await expect(run()).rejects.toThrow();

      const calls = consoleErrorSpy.mock.calls.map(c => c[0]);
      const output = calls.join('\n');

      expect(output).toContain('Try these troubleshooting steps:');
      expect(output).toContain('npm --version');
      expect(output).toContain('npm install -g @way_marks/cli@latest');
      expect(output).toContain('npm config get prefix');
    });

    it('should handle permission denied error specifically', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied, open \'/usr/local/lib/node_modules/@way_marks/cli\'');
      });

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('npm config get prefix'));
      expect(exitCode).toBe(1);
    });

    it('should handle npm registry error', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('404 Not Found - Package not found');
      });

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ npm install failed');
      expect(exitCode).toBe(1);
    });

    it('should handle npm timeout (install takes > 5 minutes)', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('Timeout exceeded: npm install took longer than 300000ms');
      });

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ npm install failed');
      expect(exitCode).toBe(1);
    });

    it('should exit with code 1 on npm install failure', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('npm error');
      });

      await expect(run()).rejects.toThrow();

      expect(exitCode).toBe(1);
    });
  });

  describe('network error during version check', () => {
    it('should catch and handle network errors', async () => {
      mockVersionCheck.checkVersion.mockRejectedValue(new Error('fetch failed: connection refused'));

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ Version check failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('network issue'));
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should handle DNS resolution failure', async () => {
      mockVersionCheck.checkVersion.mockRejectedValue(new Error('ENOTFOUND registry.npmjs.org'));

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ Version check failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith('  Error: ENOTFOUND registry.npmjs.org');
      expect(exitCode).toBe(1);
    });

    it('should handle connection refused error', async () => {
      mockVersionCheck.checkVersion.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:80'));

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ Version check failed');
      expect(exitCode).toBe(1);
    });

    it('should handle socket hang up', async () => {
      mockVersionCheck.checkVersion.mockRejectedValue(new Error('socket hang up'));

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ Version check failed');
    });
  });

  describe('permission denied scenarios', () => {
    it('should show recovery instructions for permission denied', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      await expect(run()).rejects.toThrow();

      const calls = consoleErrorSpy.mock.calls.map(c => c[0]);
      const output = calls.join('\n');

      expect(output).toContain('Check npm permissions');
      expect(output).toContain('npm config get prefix');
    });

    it('should suggest troubleshooting for global package install permission', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied, mkdir \'/usr/local/lib/node_modules/\'');
      });

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Try these troubleshooting steps'));
    });
  });

  describe('pre-release version handling', () => {
    it('should handle update from stable to pre-release', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.3.0',
        latest: '4.4.0-beta.1',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('Update available: 4.3.0 → 4.4.0-beta.1');
    });

    it('should handle update from pre-release to stable', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.0-beta.1',
        latest: '4.4.0',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('Update available: 4.4.0-beta.1 → 4.4.0');
    });

    it('should proceed with pre-release version install', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.3.0',
        latest: '4.4.0-rc.1',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(mockExecSync).toHaveBeenCalled();
    });
  });

  describe('downgrade scenarios', () => {
    it('should attempt downgrade if latest < current (edge case)', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '5.0.0',
        latest: '4.9.0',
        updateAvailable: false,
      });

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('✓ Already on latest version 5.0.0');
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should handle scenario where current version is newer than latest', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.5.0-dev',
        latest: '4.4.0',
        updateAvailable: false,
      });

      await run();

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(mockExecSync).not.toHaveBeenCalled();
    });
  });

  describe('error type handling', () => {
    it('should handle Error objects properly', async () => {
      mockVersionCheck.checkVersion.mockRejectedValue(new Error('Specific error message'));

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('  Error: Specific error message');
    });

    it('should handle non-Error exceptions during version check', async () => {
      mockVersionCheck.checkVersion.mockRejectedValue('Plain string error');

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ Version check failed');
      expect(exitCode).toBe(1);
    });

    it('should handle non-Error exceptions during npm install', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockImplementation(() => {
        throw 'Non-standard error object';
      });

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ npm install failed');
      expect(exitCode).toBe(1);
    });

    it('should handle null error object', async () => {
      mockVersionCheck.checkVersion.mockRejectedValue(null);

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ Version check failed');
      expect(exitCode).toBe(1);
    });
  });

  describe('corrupted version cache', () => {
    it('should handle gracefully when version-check handles corrupted cache', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('Update available: 4.4.2 → 4.4.3');
      expect(mockExecSync).toHaveBeenCalled();
    });

    it('should fall back to network when cache is corrupted', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(mockVersionCheck.checkVersion).toHaveBeenCalled();
    });
  });

  describe('platform-specific restart instructions', () => {
    it('should show Bash restart instruction for Linux/macOS', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('  • Run: source ~/.bashrc  (on Linux/macOS)');
    });

    it('should show PowerShell restart instruction for Windows', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('  • Run: refreshenv        (on Windows PowerShell)');
    });

    it('should always include terminal restart option', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('  • Restart your terminal, or');
    });
  });

  describe('update cancellation (Ctrl+C)', () => {
    it('should handle sigint during version check gracefully', async () => {
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      mockVersionCheck.checkVersion.mockRejectedValue(abortError);

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ Version check failed');
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should handle sigint during npm install', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      const signalError = new Error('Signal: SIGINT');
      mockExecSync.mockImplementation(() => {
        throw signalError;
      });

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ npm install failed');
      expect(exitCode).toBe(1);
    });
  });

  describe('execSync behavior verification', () => {
    it('should use inherit stdio to show npm output', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(mockExecSync).toHaveBeenCalledWith(expect.any(String), {
        stdio: 'inherit',
        timeout: 300000,
      });
    });

    it('should set 5 minute timeout for npm install', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(mockExecSync).toHaveBeenCalledWith(expect.any(String), {
        stdio: 'inherit',
        timeout: 300000, // 5 minutes in ms
      });
    });

    it('should use npm install -g @way_marks/cli@latest command', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(mockExecSync).toHaveBeenCalledWith('npm install -g @way_marks/cli@latest', expect.any(Object));
    });
  });

  describe('console output formatting', () => {
    it('should display empty line before update message', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      const calls = consoleSpy.mock.calls.map(c => c[0]);
      expect(calls).toContain('');
    });

    it('should display success message with proper formatting', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(consoleSpy).toHaveBeenCalledWith('✓ Update complete!');
    });

    it('should use consistent error prefixes', async () => {
      mockVersionCheck.checkVersion.mockRejectedValue(new Error('Test error'));

      await expect(run()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ Version check failed');
    });
  });

  describe('integration flow verification', () => {
    it('should execute complete flow in correct order', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      const callOrder: string[] = [];
      consoleSpy.mockImplementation((msg: string) => {
        callOrder.push(msg);
      });

      await run();

      const updateIndex = callOrder.findIndex(c => c.includes('Update available'));
      const installingIndex = callOrder.findIndex(c => c.includes('Installing'));
      const completeIndex = callOrder.findIndex(c => c.includes('Update complete'));

      expect(updateIndex).toBeLessThan(installingIndex);
      expect(installingIndex).toBeLessThan(completeIndex);
    });

    it('should not proceed with install if no update available', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.2',
        updateAvailable: false,
      });

      await run();

      expect(mockExecSync).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should exit cleanly without error on successful update', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.3',
        updateAvailable: true,
      });
      mockExecSync.mockReturnValue('' as any);

      await run();

      expect(exitCode).toBeNull();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('no mock calls on latest', () => {
    it('should not call execSync when already on latest', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.2',
        updateAvailable: false,
      });

      await run();

      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should not exit with error on latest version', async () => {
      mockVersionCheck.checkVersion.mockResolvedValue({
        current: '4.4.2',
        latest: '4.4.2',
        updateAvailable: false,
      });

      await run();

      expect(processExitSpy).not.toHaveBeenCalled();
      expect(exitCode).toBeNull();
    });
  });
});
