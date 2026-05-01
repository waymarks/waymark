import { execSync } from 'child_process';
import { checkVersion } from '../utils/version-check';

export async function run(): Promise<void> {
  try {
    const versionInfo = await checkVersion();

    if (!versionInfo.updateAvailable || !versionInfo.latest) {
      console.log(`✓ Already on latest version ${versionInfo.current}`);
      return;
    }

    console.log(`Update available: ${versionInfo.current} → ${versionInfo.latest}`);
    console.log('Installing @way_marks/cli@latest...');

    try {
      execSync('npm install -g @way_marks/cli@latest', {
        stdio: 'inherit',
        timeout: 300000, // 5 minutes
      });

      console.log('');
      console.log('✓ Update complete!');
      console.log('');
      console.log('To start using the updated version:');
      console.log('  • Restart your terminal, or');
      console.log('  • Run: source ~/.bashrc  (on Linux/macOS)');
      console.log('  • Run: refreshenv        (on Windows PowerShell)');
    } catch (err) {
      console.error('');
      console.error('✗ npm install failed');
      if (err instanceof Error) {
        console.error(`  Error: ${err.message}`);
      }
      console.error('');
      console.error('Try these troubleshooting steps:');
      console.error('  1. Check npm is installed and working:');
      console.error('     npm --version');
      console.error('  2. Try installing again:');
      console.error('     npm install -g @way_marks/cli@latest');
      console.error('  3. Check npm permissions:');
      console.error('     npm config get prefix');
      process.exit(1);
    }
  } catch (err) {
    console.error('✗ Version check failed');
    if (err instanceof Error) {
      console.error(`  Error: ${err.message}`);
    }
    console.error('');
    console.error('Unable to check for updates. This may be a network issue.');
    console.error('You can manually update with:');
    console.error('  npm install -g @way_marks/cli@latest');
    process.exit(1);
  }
}
