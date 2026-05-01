import * as fs from 'fs';
import * as path from 'path';

export async function cacheClean(): Promise<void> {
  const projectRoot = process.env.WAYMARK_PROJECT_ROOT || process.cwd();
  const cacheDir = path.join(projectRoot, '.waymark');
  
  const filesToClear = [
    'version-cache.json',
    'cli-version-cache.json', // Legacy cache file name
  ];
  
  let clearedCount = 0;
  
  for (const file of filesToClear) {
    const filePath = path.join(cacheDir, file);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`✓ Cleared: ${file}`);
        clearedCount++;
      }
    } catch (error) {
      console.error(`✗ Failed to clear ${file}:`, error instanceof Error ? error.message : String(error));
    }
  }
  
  if (clearedCount === 0) {
    console.log('ℹ No cache files found to clear.');
  } else {
    console.log(`\n✅ Cleared ${clearedCount} cache file(s). The next version check will fetch fresh data from npm.`);
  }
}
