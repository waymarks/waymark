import { useEffect, useState } from 'react';
import { Icon } from './Icon';

interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

const DISMISS_STORAGE_KEY = (version: string) => `waymark_dismissed_version_${version}`;

function isDismissedInStorage(version: string): boolean {
  try {
    return localStorage.getItem(DISMISS_STORAGE_KEY(version)) === 'true';
  } catch {
    return false;
  }
}

function setDismissedInStorage(version: string): void {
  try {
    localStorage.setItem(DISMISS_STORAGE_KEY(version), 'true');
  } catch {
    // ignore (private browsing, storage full, etc.)
  }
}

export function VersionBanner() {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

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
        // Check if user already dismissed this specific version
        if (data.latestVersion && isDismissedInStorage(data.latestVersion)) {
          setDismissed(true);
        }
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
    if (versionInfo?.latestVersion) {
      setDismissedInStorage(versionInfo.latestVersion);
    }
    setDismissed(true);
  };

  const handleUpdateClick = () => {
    const command = 'npm install -g @way_marks/cli@latest';
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Clipboard API blocked (e.g. non-HTTPS) — still give some feedback
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
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
            {copied ? '✓ Copied!' : 'Update now'}
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
