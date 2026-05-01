import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { checkVersion, shouldSkipVersionCheck, printUpdateBanner, runVersionCheckAsync } from './version-check';

vi.mock('fs');

describe('version-check', () => {
  const mockFs = fs as any;
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    process.env.HOME = '/home/testuser';
    delete process.env.WAYMARK_SKIP_VERSION_CHECK;
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('getCurrentVersion', () => {
    it('should read version from package.json', async () => {
      const packageJson = { version: '4.4.2' };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(packageJson));

      const result = await checkVersion();
      expect(result.current).toBe('4.4.2');
    });

    it('should return unknown if package.json cannot be read', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      mockFs.existsSync.mockReturnValue(false);

      const result = await checkVersion();
      expect(result.current).toBe('unknown');
    });
  });

  describe('version comparison', () => {
    it('should detect newer version as available', async () => {
      const packageJson = { version: '4.4.2' };
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(packageJson));

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '4.4.3' }),
        } as Response)
      );

      const result = await checkVersion();
      expect(result.updateAvailable).toBe(true);
      expect(result.latest).toBe('4.4.3');
    });

    it('should detect same version as not available', async () => {
      const packageJson = { version: '4.4.2' };
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(packageJson));

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '4.4.2' }),
        } as Response)
      );

      const result = await checkVersion();
      expect(result.updateAvailable).toBe(false);
      expect(result.latest).toBe('4.4.2');
    });

    it('should detect older version as not available', async () => {
      const packageJson = { version: '4.4.3' };
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(packageJson));

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '4.4.2' }),
        } as Response)
      );

      const result = await checkVersion();
      expect(result.updateAvailable).toBe(false);
    });

    it('should handle major version updates', async () => {
      const packageJson = { version: '4.4.2' };
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(packageJson));

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '5.0.0' }),
        } as Response)
      );

      const result = await checkVersion();
      expect(result.updateAvailable).toBe(true);
    });

    it('should handle minor version updates', async () => {
      const packageJson = { version: '4.4.2' };
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(packageJson));

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '4.5.0' }),
        } as Response)
      );

      const result = await checkVersion();
      expect(result.updateAvailable).toBe(true);
    });
  });

  describe('fetch error handling', () => {
    it('should handle fetch timeout gracefully', async () => {
      const packageJson = { version: '4.4.2' };
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(packageJson));

      global.fetch = vi.fn(() =>
        Promise.reject(new Error('Timeout'))
      );

      const result = await checkVersion();
      expect(result.current).toBe('4.4.2');
      expect(result.latest).toBeNull();
      expect(result.updateAvailable).toBe(false);
    });

    it('should handle fetch response error', async () => {
      const packageJson = { version: '4.4.2' };
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(packageJson));

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
        } as Response)
      );

      const result = await checkVersion();
      expect(result.current).toBe('4.4.2');
      expect(result.latest).toBeNull();
    });
  });

  describe('caching', () => {
    it('should use cache when available and not expired', async () => {
      const packageJson = { version: '4.4.2' };
      const cacheEntry = {
        current: '4.4.2',
        latest: '4.4.3',
        checkedAt: Date.now() - 1000,
      };

      mockFs.existsSync.mockImplementation((filePath: any) => {
        return typeof filePath === 'string' && filePath.includes('cli-version-cache.json');
      });

      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('cli-version-cache.json')) {
          return JSON.stringify(cacheEntry);
        }
        return JSON.stringify(packageJson);
      });

      global.fetch = vi.fn();

      const result = await checkVersion();
      expect(result.current).toBe('4.4.2');
      expect(result.latest).toBe('4.4.3');
      expect(result.updateAvailable).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should ignore cache when expired', async () => {
      const packageJson = { version: '4.4.2' };
      const expiredCache = {
        current: '4.4.2',
        latest: '4.4.2',
        checkedAt: Date.now() - 25 * 60 * 60 * 1000,
      };

      let callCount = 0;
      mockFs.existsSync.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('cli-version-cache.json')) {
          callCount++;
          return callCount === 1;
        }
        return true;
      });

      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('cli-version-cache.json')) {
          return JSON.stringify(expiredCache);
        }
        return JSON.stringify(packageJson);
      });

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '4.5.0' }),
        } as Response)
      );

      const result = await checkVersion();
      expect(result.latest).toBe('4.5.0');
      expect(result.updateAvailable).toBe(true);
    });
  });

  describe('shouldSkipVersionCheck', () => {
    it('should skip if WAYMARK_SKIP_VERSION_CHECK=1', () => {
      process.env.WAYMARK_SKIP_VERSION_CHECK = '1';
      mockFs.existsSync.mockReturnValue(false);
      
      expect(shouldSkipVersionCheck()).toBe(true);
    });

    it('should not skip if WAYMARK_SKIP_VERSION_CHECK is not set', () => {
      delete process.env.WAYMARK_SKIP_VERSION_CHECK;
      mockFs.existsSync.mockReturnValue(false);
      
      expect(shouldSkipVersionCheck()).toBe(false);
    });

    it('should skip if ~/.waymark/config.json has skipVersionCheck=true', () => {
      delete process.env.WAYMARK_SKIP_VERSION_CHECK;
      
      mockFs.existsSync.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('/.waymark/config.json')) {
          return true;
        }
        return false;
      });
      
      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('/.waymark/config.json')) {
          return JSON.stringify({ skipVersionCheck: true });
        }
        return '{}';
      });
      
      expect(shouldSkipVersionCheck()).toBe(true);
    });

    it('should skip if .waymarkrc has skipVersionCheck=true', () => {
      delete process.env.WAYMARK_SKIP_VERSION_CHECK;
      
      mockFs.existsSync.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('/.waymark/config.json')) {
          return false;
        }
        if (typeof filePath === 'string' && filePath.includes('.waymarkrc')) {
          return true;
        }
        return false;
      });
      
      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('.waymarkrc')) {
          return JSON.stringify({ skipVersionCheck: true });
        }
        return '{}';
      });
      
      expect(shouldSkipVersionCheck()).toBe(true);
    });

    it('should handle malformed config files gracefully', () => {
      delete process.env.WAYMARK_SKIP_VERSION_CHECK;
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });
      
      expect(shouldSkipVersionCheck()).toBe(false);
    });
  });

  describe('printUpdateBanner', () => {
    it('should print banner to stderr', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      printUpdateBanner('4.4.2', '4.4.3');
      
      expect(consoleSpy).toHaveBeenCalledWith('⚠️  Waymark 4.4.2 → 4.4.3 available! Run: npx @way_marks/cli update');
      
      consoleSpy.mockRestore();
    });
  });

  describe('runVersionCheckAsync', () => {
    it('should print banner if update available', async () => {
      const packageJson = { version: '4.4.2' };
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(packageJson));
      
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '4.4.3' }),
        } as Response)
      );
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await runVersionCheckAsync(1000);
      
      expect(consoleSpy).toHaveBeenCalledWith('⚠️  Waymark 4.4.2 → 4.4.3 available! Run: npx @way_marks/cli update');
      
      consoleSpy.mockRestore();
    });

    it('should not print banner if no update available', async () => {
      const packageJson = { version: '4.4.2' };
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(packageJson));
      
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '4.4.2' }),
        } as Response)
      );
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await runVersionCheckAsync(1000);
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should not check version if WAYMARK_SKIP_VERSION_CHECK=1', async () => {
      process.env.WAYMARK_SKIP_VERSION_CHECK = '1';
      mockFs.existsSync.mockReturnValue(false);
      
      global.fetch = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await runVersionCheckAsync(1000);
      
      expect(global.fetch).not.toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should handle fetch errors gracefully', async () => {
      const packageJson = { version: '4.4.2' };
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(packageJson));
      
      global.fetch = vi.fn(() =>
        Promise.reject(new Error('Network error'))
      );
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await runVersionCheckAsync(1000);
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should not block command execution', async () => {
      const packageJson = { version: '4.4.2' };
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(packageJson));
      
      let resolveFetch: any;
      global.fetch = vi.fn(() =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
      );
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const checkPromise = runVersionCheckAsync(100);
      
      await new Promise((resolve) => setTimeout(resolve, 10));
      
      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ version: '4.4.3' }),
      });
      
      await checkPromise;
      
      consoleSpy.mockRestore();
    });
  });
});
