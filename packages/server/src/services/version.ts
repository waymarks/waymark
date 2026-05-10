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
let currentVersionOverride: string | null = null;

export function setProjectRoot(root: string): void {
  projectRoot = root;
}

/** For testing only — override the version returned by getCurrentVersion(). */
export function setCurrentVersionForTest(version: string | null): void {
  currentVersionOverride = version;
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

function isWaymarkPackageJson(packageJson: { version?: string; name?: string }): boolean {
  if (!packageJson.name) return false;
  return packageJson.name.includes('way_marks') || packageJson.name.includes('waymark');
}

function getCurrentVersion(): string {
  if (currentVersionOverride !== null) {
    return currentVersionOverride;
  }

  // Search these paths in order; accept the first file that (a) exists and
  // (b) belongs to a waymark package (name contains "way_marks" or "waymark").
  //
  // Candidate 1 — compiled global/local npm install:
  //   __dirname = .../node_modules/@way_marks/server/dist/services/
  //   Two levels up → .../node_modules/@way_marks/server/package.json ✓
  //
  // Candidate 2 — ts-node inside monorepo (src/ not dist/):
  //   __dirname = packages/server/src/services/
  //   Three levels up → packages/server → no cli there
  //   So explicitly check sibling packages/cli.
  //
  // Candidate 3 — monorepo dev with compiled output (dist/):
  //   projectRoot = waymark checkout root → packages/cli/package.json ✓
  const candidates = [
    path.join(__dirname, '..', '..', 'package.json'),                            // compiled install
    path.join(__dirname, '..', '..', '..', 'packages', 'cli', 'package.json'),  // ts-node monorepo
    path.join(projectRoot, 'packages', 'cli', 'package.json'),                  // monorepo dev
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const content = fs.readFileSync(candidate, 'utf-8');
      const packageJson = JSON.parse(content) as { version?: string; name?: string };
      if (packageJson.version && isWaymarkPackageJson(packageJson)) {
        return packageJson.version;
      }
    } catch {
      // try next candidate
    }
  }

  return '0.0.0';
}

let lastFetchPromise: Promise<string | null> | null = null;
let lastFetchTime: number = 0;

export function resetState(): void {
  lastFetchPromise = null;
  lastFetchTime = 0;
  currentVersionOverride = null;
}

export async function getVersionInfo(): Promise<VersionInfo> {
  const currentVersion = getCurrentVersion();
  
  // Check cache first
  const cache = readCacheFile();
  if (cache && isCacheValid(cache)) {
    // Smart cache invalidation: if current version is newer than cached latest,
    // the cache is stale (e.g., new version was released and installed)
    const currentIsNewer = compareVersions(cache.latestVersion, currentVersion);
    if (currentIsNewer) {
      // Cache is stale, invalidate it and fetch fresh data
      // This prevents showing "update available" when user already has the latest
    } else {
      // Cache is good
      return {
        currentVersion,
        latestVersion: cache.latestVersion,
        updateAvailable: compareVersions(currentVersion, cache.latestVersion),
      };
    }
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
