import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import './UserHeader.css';

const UserHeader = () => {
  const { user, logout } = useAuth();
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [hasElevenLabsSettings, setHasElevenLabsSettings] = useState(true);

  const handleLogout = async () => {
    await logout();
  };

  const displayName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.firstName
    ? user.firstName
    : user?.email || 'User';

  useEffect(() => {
    const checkElevenLabsSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = {};
        
        // Add Authorization header if token exists
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch('/api/auth/preferences', {
          headers,
          credentials: 'include' // Include cookies as fallback
        });

        if (response.ok) {
          const data = await response.json();
          const prefs = data.preferences || {};
          const hasSettings = prefs.elevenlabsApiKey && prefs.elevenlabsVoiceId;
          setHasElevenLabsSettings(hasSettings);

          // Show dialog automatically if settings are missing
          if (!hasSettings) {
            setShowSettingsDialog(true);
          }
        } else if (response.status === 401 || response.status === 403) {
          // Authentication failed - trigger logout to clear invalid state
          console.warn('Authentication failed in UserHeader, logging out');
          logout();
        }
      } catch (error) {
        console.error('Error checking ElevenLabs settings:', error);
        setHasElevenLabsSettings(false);
      }
    };

    if (user) {
      checkElevenLabsSettings();
    }
  }, [user, logout]);

  return (
    <header className="user-header">
      <div className="user-header-content">
        <Link to="/" className="logo-link" title="Home">
          <img src="/logo_300px.png" alt="The Magical Everything Reader" className="app-logo" />
        </Link>
        <div className="user-info">
          <span className="welcome-text">Welcome, {displayName}</span>
          <Link
            to="/settings"
            className={`settings-link ${!hasElevenLabsSettings ? 'settings-warning' : ''}`}
            title="Settings"
          >
            ⚙
            {!hasElevenLabsSettings && <span className="settings-indicator"></span>}
          </Link>
          <button
            onClick={handleLogout}
            className="logout-button"
            title="Sign out"
          >
            ⇥
          </button>
        </div>
      </div>

      {showSettingsDialog && (
        <div className="settings-dialog-overlay" onClick={() => setShowSettingsDialog(false)}>
          <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="settings-dialog-header">
              <h3>ElevenLabs Settings Required</h3>
              <button
                className="dialog-close"
                onClick={() => setShowSettingsDialog(false)}
              >
                ×
              </button>
            </div>
            <div className="settings-dialog-body">
              <p>To use the text-to-speech features, you need to configure your ElevenLabs settings:</p>
              <ul>
                <li>ElevenLabs API Key</li>
                <li>Voice ID</li>
              </ul>
              <p>Please visit the Settings page to configure these options.</p>
            </div>
            <div className="settings-dialog-footer">
              <button
                className="dialog-button secondary"
                onClick={() => setShowSettingsDialog(false)}
              >
                Later
              </button>
              <Link
                to="/settings"
                className="dialog-button primary"
                onClick={() => setShowSettingsDialog(false)}
              >
                Go to Settings
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default UserHeader;