import * as fs from 'fs';
import * as path from 'path';

interface VersionCacheEntry {
  current: string;
  latest: string;
  checkedAt: number;
}

interface VersionCheckResult {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  error?: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCacheFilePath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(homeDir, '.waymark', 'cli-version-cache.json');
}

function readCache(): VersionCacheEntry | null {
  try {
    const cacheFile = getCacheFilePath();
    if (!fs.existsSync(cacheFile)) return null;
    
    const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as VersionCacheEntry;
    const age = Date.now() - data.checkedAt;
    
    if (age > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(data: VersionCacheEntry): void {
  try {
    const cacheDir = path.dirname(getCacheFilePath());
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(getCacheFilePath(), JSON.stringify(data), 'utf8');
  } catch {
    // Silently fail if we can't write cache
  }
}

function getCurrentVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version: string };
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const res = await fetch('https://registry.npmjs.org/@way_marks/cli/latest', {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) return null;
    
    const data = await res.json() as { version?: string };
    return data.version || null;
  } catch {
    return null;
  }
}

function compareVersions(current: string, latest: string): boolean {
  try {
    const parseCurrent = current.split('.').map(Number);
    const parseLatest = latest.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
      const curr = parseCurrent[i] || 0;
      const latestVal = parseLatest[i] || 0;
      
      if (latestVal > curr) return true;
      if (curr > latestVal) return false;
    }
    return false;
  } catch {
    return false;
  }
}

export async function checkVersion(): Promise<VersionCheckResult> {
  const current = getCurrentVersion();
  
  // Try to use cache first
  const cached = readCache();
  if (cached && cached.current === current) {
    return {
      current: cached.current,
      latest: cached.latest,
      updateAvailable: compareVersions(cached.current, cached.latest || ''),
    };
  }
  
  // Fetch latest version
  const latest = await fetchLatestVersion();
  
  // Write to cache
  if (latest) {
    writeCache({
      current,
      latest,
      checkedAt: Date.now(),
    });
  }
  
  return {
    current,
    latest,
    updateAvailable: latest ? compareVersions(current, latest) : false,
  };
}

export function shouldSkipVersionCheck(): boolean {
  // Check environment variable
  if (process.env.WAYMARK_SKIP_VERSION_CHECK === '1') {
    return true;
  }
  
  // Check ~/.waymark/config.json
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const configPath = path.join(homeDir, '.waymark', 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { skipVersionCheck?: boolean };
      if (config.skipVersionCheck === true) {
        return true;
      }
    }
  } catch {
    // Ignore errors reading config
  }
  
  // Check .waymarkrc in cwd
  try {
    const rcPath = path.join(process.cwd(), '.waymarkrc');
    if (fs.existsSync(rcPath)) {
      const config = JSON.parse(fs.readFileSync(rcPath, 'utf8')) as { skipVersionCheck?: boolean };
      if (config.skipVersionCheck === true) {
        return true;
      }
    }
  } catch {
    // Ignore errors reading .waymarkrc
  }
  
  return false;
}

export function printUpdateBanner(current: string, latest: string): void {
  const banner = `⚠️  Waymark ${current} → ${latest} available! Run: npx @way_marks/cli update`;
  console.error(banner);
}

export async function runVersionCheckAsync(timeoutMs: number = 1000): Promise<void> {
  if (shouldSkipVersionCheck()) {
    return;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    // Create a promise that checks the version
    const checkPromise = checkVersion().finally(() => clearTimeout(timeoutId));
    
    const result = await checkPromise;
    
    if (result.updateAvailable && result.latest) {
      printUpdateBanner(result.current, result.latest);
    }
  } catch {
    // Silently fail on any error (including timeout)
  }
}
