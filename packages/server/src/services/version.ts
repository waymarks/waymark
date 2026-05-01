import * as fs from 'fs';
import * as path from 'path';

export interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const NPM_TIMEOUT_MS = 5000; // 5 seconds
const CACHE_FILE_NAME = 'version-cache.json';

let projectRoot = process.env.WAYMARK_PROJECT_ROOT || process.cwd();

export function setProjectRoot(root: string): void {
  projectRoot = root;
}

function getCachePath(): string {
  return path.join(projectRoot, '.waymark', CACHE_FILE_NAME);
}

function readCacheFile(): { latestVersion: string; timestamp: number } | null {
  const cachePath = getCachePath();
  
  try {
    if (!fs.existsSync(cachePath)) {
      return null;
    }
    
    const content = fs.readFileSync(cachePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Validate cache structure
    if (!data.latestVersion || typeof data.timestamp !== 'number') {
      return null;
    }
    
    return data;
  } catch (error) {
    // Ignore any read/parse errors
    return null;
  }
}

function writeCacheFile(latestVersion: string): void {
  const cachePath = getCachePath();
  const cacheDir = path.dirname(cachePath);
  
  try {
    // Ensure directory exists
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    const data = {
      latestVersion,
      timestamp: Date.now(),
    };
    
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    // Silently ignore write errors
  }
}

function isCacheValid(cache: { latestVersion: string; timestamp: number }): boolean {
  const age = Date.now() - cache.timestamp;
  return age < CACHE_TTL_MS;
}

function compareVersions(current: string, latest: string): boolean {
  try {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);
    
    // Pad with zeros if needed
    const maxLength = Math.max(currentParts.length, latestParts.length);
    while (currentParts.length < maxLength) currentParts.push(0);
    while (latestParts.length < maxLength) latestParts.push(0);
    
    // Compare parts
    for (let i = 0; i < maxLength; i++) {
      if (latestParts[i] > currentParts[i]) {
        return true;
      }
      if (latestParts[i] < currentParts[i]) {
        return false;
      }
    }
    
    return false; // Versions are equal
  } catch (error) {
    // If comparison fails, assume no update
    return false;
  }
}

async function fetchLatestVersionFromNpm(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), NPM_TIMEOUT_MS);
    
    const response = await fetch('https://registry.npmjs.org/@way_marks/cli/latest', {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return null;
    }
    
    const data = (await response.json()) as { version: string };
    
    if (!data.version || typeof data.version !== 'string') {
      return null;
    }
    
    return data.version;
  } catch (error) {
    // Ignore any fetch errors (timeout, network, etc.)
    return null;
  }
}

function getCurrentVersion(): string {
  try {
    const cliPackageJsonPath = path.join(projectRoot, 'packages', 'cli', 'package.json');
    
    if (!fs.existsSync(cliPackageJsonPath)) {
      return '0.0.0';
    }
    
    const content = fs.readFileSync(cliPackageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content) as { version: string };
    
    return packageJson.version || '0.0.0';
  } catch (error) {
    return '0.0.0';
  }
}

let lastFetchPromise: Promise<string | null> | null = null;
let lastFetchTime: number = 0;

export function resetState(): void {
  lastFetchPromise = null;
  lastFetchTime = 0;
}

export async function getVersionInfo(): Promise<VersionInfo> {
  const currentVersion = getCurrentVersion();
  
  // Check cache first
  const cache = readCacheFile();
  if (cache && isCacheValid(cache)) {
    return {
      currentVersion,
      latestVersion: cache.latestVersion,
      updateAvailable: compareVersions(currentVersion, cache.latestVersion),
    };
  }
  
  // Prevent multiple concurrent fetches within a short window
  const now = Date.now();
  const timeSinceLastFetch = now - lastFetchTime;
  
  if (lastFetchPromise && timeSinceLastFetch < 1000) {
    // Return the pending fetch result
    const latestVersion = await lastFetchPromise;
    if (latestVersion) {
      writeCacheFile(latestVersion);
      return {
        currentVersion,
        latestVersion,
        updateAvailable: compareVersions(currentVersion, latestVersion),
      };
    }
  }
  
  // Fetch from npm
  lastFetchTime = now;
  lastFetchPromise = fetchLatestVersionFromNpm();
  
  const latestVersion = await lastFetchPromise;
  
  if (latestVersion) {
    // Successfully fetched, cache it
    writeCacheFile(latestVersion);
    return {
      currentVersion,
      latestVersion,
      updateAvailable: compareVersions(currentVersion, latestVersion),
    };
  }
  
  // Fetch failed, try to use existing cache
  if (cache) {
    return {
      currentVersion,
      latestVersion: cache.latestVersion,
      updateAvailable: compareVersions(currentVersion, cache.latestVersion),
    };
  }
  
  // No cache available, return current version as fallback
  return {
    currentVersion,
    latestVersion: currentVersion,
    updateAvailable: false,
  };
}
