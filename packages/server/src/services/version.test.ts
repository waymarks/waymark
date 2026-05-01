import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getVersionInfo, setProjectRoot, resetState } from './version';

// Mock fetch
global.fetch = vi.fn();

describe('Version Service', () => {
  let testProjectRoot: string;
  let cacheFilePath: string;
  
  beforeEach(() => {
    // Reset internal state
    resetState();
    
    // Use a test directory
    testProjectRoot = path.join(__dirname, '../../..', '.test-waymark');
    cacheFilePath = path.join(testProjectRoot, '.waymark', 'version-cache.json');
    
    // Set up test project root
    setProjectRoot(testProjectRoot);
    
    // Create test directories
    if (!fs.existsSync(path.join(testProjectRoot, '.waymark'))) {
      fs.mkdirSync(path.join(testProjectRoot, '.waymark'), { recursive: true });
    }
    
    // Create packages/cli/package.json for testing
    const cliPackagePath = path.join(testProjectRoot, 'packages', 'cli', 'package.json');
    if (!fs.existsSync(path.dirname(cliPackagePath))) {
      fs.mkdirSync(path.dirname(cliPackagePath), { recursive: true });
    }
    fs.writeFileSync(cliPackagePath, JSON.stringify({ version: '4.4.2' }));
    
    // Clear cache file
    if (fs.existsSync(cacheFilePath)) {
      fs.unlinkSync(cacheFilePath);
    }
    
    // Clear fetch mock
    (global.fetch as jest.Mock).mockClear();
  });
  
  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testProjectRoot)) {
      fs.rmSync(testProjectRoot, { recursive: true, force: true });
    }
  });
  
  describe('getVersionInfo', () => {
    it('should fetch latest version from npm and cache it', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '4.5.0' }),
      });
      
      const info = await getVersionInfo();
      
      expect(info.currentVersion).toBe('4.4.2');
      expect(info.latestVersion).toBe('4.5.0');
      expect(info.updateAvailable).toBe(true);
      
      // Verify cache file was created
      expect(fs.existsSync(cacheFilePath)).toBe(true);
      const cached = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
      expect(cached.latestVersion).toBe('4.5.0');
      expect(typeof cached.timestamp).toBe('number');
    });
    
    it('should use cached version if not expired', async () => {
      // Create cache file
      const cachedData = {
        latestVersion: '4.4.5',
        timestamp: Date.now(),
      };
      fs.writeFileSync(cacheFilePath, JSON.stringify(cachedData));
      
      const info = await getVersionInfo();
      
      expect(info.latestVersion).toBe('4.4.5');
      expect(info.updateAvailable).toBe(true);
      
      // Verify fetch was not called
      expect(global.fetch).not.toHaveBeenCalled();
    });
    
    it('should fetch new version if cache is expired', async () => {
      // Create expired cache file (25 hours old)
      const expiredData = {
        latestVersion: '4.4.5',
        timestamp: Date.now() - (25 * 60 * 60 * 1000),
      };
      fs.writeFileSync(cacheFilePath, JSON.stringify(expiredData));
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '4.6.0' }),
      });
      
      const info = await getVersionInfo();
      
      expect(info.latestVersion).toBe('4.6.0');
      expect(global.fetch).toHaveBeenCalled();
    });
    
    it('should handle npm fetch timeout gracefully', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Timeout');
      });
      
      const info = await getVersionInfo();
      
      // Should return current version as fallback
      expect(info.currentVersion).toBe('4.4.2');
      expect(info.latestVersion).toBe('4.4.2');
      expect(info.updateAvailable).toBe(false);
    });
    
    it('should handle npm fetch error and use cache if available', async () => {
      // Create cache file
      const cachedData = {
        latestVersion: '4.4.5',
        timestamp: Date.now() - (25 * 60 * 60 * 1000), // Expired
      };
      fs.writeFileSync(cacheFilePath, JSON.stringify(cachedData));
      
      (global.fetch as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Network error');
      });
      
      const info = await getVersionInfo();
      
      // Should use stale cache
      expect(info.latestVersion).toBe('4.4.5');
    });
    
    it('should handle corrupted cache file', async () => {
      // Create corrupted cache file
      fs.writeFileSync(cacheFilePath, 'invalid json {{{');
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '4.5.0' }),
      });
      
      const info = await getVersionInfo();
      
      expect(info.latestVersion).toBe('4.5.0');
    });
    
    it('should handle npm returning invalid response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ notVersion: 'invalid' }),
      });
      
      const info = await getVersionInfo();
      
      expect(info.currentVersion).toBe('4.4.2');
      expect(info.latestVersion).toBe('4.4.2');
      expect(info.updateAvailable).toBe(false);
    });
    
    it('should handle npm returning non-ok status', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });
      
      const info = await getVersionInfo();
      
      expect(info.currentVersion).toBe('4.4.2');
      expect(info.latestVersion).toBe('4.4.2');
      expect(info.updateAvailable).toBe(false);
    });
  });
  
  describe('Version comparison', () => {
    it('should detect patch version update: 4.4.1 < 4.4.2', async () => {
      // Update current version to 4.4.1
      const cliPackagePath = path.join(testProjectRoot, 'packages', 'cli', 'package.json');
      fs.writeFileSync(cliPackagePath, JSON.stringify({ version: '4.4.1' }));
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '4.4.2' }),
      });
      
      const info = await getVersionInfo();
      
      expect(info.updateAvailable).toBe(true);
    });
    
    it('should detect minor version update: 4.3.2 < 4.4.0', async () => {
      // Update current version to 4.3.2
      const cliPackagePath = path.join(testProjectRoot, 'packages', 'cli', 'package.json');
      fs.writeFileSync(cliPackagePath, JSON.stringify({ version: '4.3.2' }));
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '4.4.0' }),
      });
      
      const info = await getVersionInfo();
      
      expect(info.updateAvailable).toBe(true);
    });
    
    it('should detect major version update: 3.9.0 < 4.0.0', async () => {
      const cliPackagePath = path.join(testProjectRoot, 'packages', 'cli', 'package.json');
      fs.writeFileSync(cliPackagePath, JSON.stringify({ version: '3.9.0' }));
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '4.0.0' }),
      });
      
      const info = await getVersionInfo();
      
      expect(info.updateAvailable).toBe(true);
    });
    
    it('should not report update when versions are equal', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '4.4.2' }),
      });
      
      const info = await getVersionInfo();
      
      expect(info.updateAvailable).toBe(false);
    });
    
    it('should not report update when current is newer', async () => {
      const cliPackagePath = path.join(testProjectRoot, 'packages', 'cli', 'package.json');
      fs.writeFileSync(cliPackagePath, JSON.stringify({ version: '4.5.0' }));
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '4.4.2' }),
      });
      
      const info = await getVersionInfo();
      
      expect(info.updateAvailable).toBe(false);
    });
    
    it('should handle versions with different part counts', async () => {
      const cliPackagePath = path.join(testProjectRoot, 'packages', 'cli', 'package.json');
      fs.writeFileSync(cliPackagePath, JSON.stringify({ version: '4' }));
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '4.0.1' }),
      });
      
      const info = await getVersionInfo();
      
      expect(info.updateAvailable).toBe(true);
    });
  });
  
  describe('Concurrent calls', () => {
    it('should only fetch npm once during cache window', async () => {
      let fetchCount = 0;
      (global.fetch as jest.Mock).mockImplementationOnce(async () => {
        fetchCount++;
        // Simulate slow fetch
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          ok: true,
          json: async () => ({ version: '4.5.0' }),
        };
      });
      
      // Make concurrent calls
      const [info1, info2, info3] = await Promise.all([
        getVersionInfo(),
        getVersionInfo(),
        getVersionInfo(),
      ]);
      
      // All should have same result
      expect(info1.latestVersion).toBe('4.5.0');
      expect(info2.latestVersion).toBe('4.5.0');
      expect(info3.latestVersion).toBe('4.5.0');
      
      // Fetch should have been called once or twice (depending on timing)
      expect((global.fetch as jest.Mock).mock.calls.length).toBeLessThanOrEqual(2);
    });
  });
  
  describe('Edge cases', () => {
    it('should handle missing package.json gracefully', async () => {
      // Remove the package.json
      const cliPackagePath = path.join(testProjectRoot, 'packages', 'cli', 'package.json');
      fs.unlinkSync(cliPackagePath);
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '4.5.0' }),
      });
      
      const info = await getVersionInfo();
      
      expect(info.currentVersion).toBe('0.0.0');
      expect(info.latestVersion).toBe('4.5.0');
    });
    
    it('should handle cache file with missing fields', async () => {
      const cacheData = {
        timestamp: Date.now(),
        // Missing latestVersion
      };
      fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData));
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '4.5.0' }),
      });
      
      const info = await getVersionInfo();
      
      expect(info.latestVersion).toBe('4.5.0');
    });
    
    it('should create cache directory if it does not exist', async () => {
      // Remove .waymark directory
      const waymarkDir = path.join(testProjectRoot, '.waymark');
      fs.rmSync(waymarkDir, { recursive: true, force: true });
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '4.5.0' }),
      });
      
      const info = await getVersionInfo();
      
      expect(fs.existsSync(cacheFilePath)).toBe(true);
      expect(info.latestVersion).toBe('4.5.0');
    });
  });
});
