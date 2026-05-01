import { useEffect, useState } from 'react';
import { Icon } from './Icon';

interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

export function VersionBanner() {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const fetchVersionInfo = async () => {
      try {
        const res = await fetch('/api/version');
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = (await res.json()) as VersionInfo;
        setVersionInfo(data);
      } catch (error) {
        // Fail gracefully - don't show banner on error
        console.debug('Failed to fetch version info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchVersionInfo();
  }, []);

  // Don't show if: still loading, dismissed, no update available, or fetch failed
  if (loading || dismissed || !versionInfo?.updateAvailable) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
  };

  const handleUpdateClick = () => {
    // Copy update command to clipboard
    const command = 'npm install -g @way_marks/cli@latest';
    navigator.clipboard.writeText(command).then(() => {
      // Optional: could show a toast here
      console.log('Update command copied to clipboard');
    });
  };

  return (
    <div className="version-banner">
      <div className="version-banner-content">
        <Icon name="info" size={16} className="version-banner-icon" />
        <div className="version-banner-text">
          New version {versionInfo.latestVersion} available!
          {' '}
          <button 
            className="version-banner-action" 
            onClick={handleUpdateClick}
            title="Copy update command to clipboard"
          >
            Update now
          </button>
        </div>
      </div>
      <button 
        className="version-banner-close" 
        onClick={handleDismiss}
        aria-label="Dismiss version banner"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
