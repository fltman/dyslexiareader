import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { Link } from 'react-router-dom';
import './UserHeader.css';

const UserHeader = () => {
  const { user, logout } = useAuth();
  const { t, isLoading: localizationLoading } = useLocalization();
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [hasElevenLabsSettings, setHasElevenLabsSettings] = useState(true);

  const handleLogout = async () => {
    await logout();
  };

  // Show minimal header while translations are loading
  if (localizationLoading) {
    return (
      <header className="user-header">
        <div className="user-header-content">
          <Link to="/" className="logo-link">
            <img src="/logo.png" alt="The Magical Everything Reader" className="app-logo" />
          </Link>
          <div className="user-info">
            <span className="welcome-text">Loading...</span>
          </div>
        </div>
      </header>
    );
  }

  const displayName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.firstName
    ? user.firstName
    : user?.email || t('common.user');

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
        <Link to="/" className="logo-link" title={t('common.home')}>
          <img src="/logo.png" alt={t('app.name')} className="app-logo" />
        </Link>
        <div className="user-info">
          <span className="welcome-text">{t('userHeader.welcome', { name: displayName })}</span>
          <Link
            to="/settings"
            className={`settings-link ${!hasElevenLabsSettings ? 'settings-warning' : ''}`}
            title={t('common.settings')}
          >
            ⚙
            {!hasElevenLabsSettings && <span className="settings-indicator"></span>}
          </Link>
          <button
            onClick={handleLogout}
            className="logout-button"
            title={t('userHeader.signOut')}
          >
            ⇥
          </button>
        </div>
      </div>

      {showSettingsDialog && (
        <div className="settings-dialog-overlay" onClick={() => setShowSettingsDialog(false)}>
          <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="settings-dialog-header">
              <h3>{t('userHeader.elevenLabsRequired')}</h3>
              <button
                className="dialog-close"
                onClick={() => setShowSettingsDialog(false)}
              >
                ×
              </button>
            </div>
            <div className="settings-dialog-body">
              <p>{t('userHeader.ttsSetupRequired')}</p>
              <ul>
                <li>{t('userHeader.elevenLabsApiKey')}</li>
                <li>{t('userHeader.voiceId')}</li>
              </ul>
              <p>{t('userHeader.visitSettings')}</p>
            </div>
            <div className="settings-dialog-footer">
              <button
                className="dialog-button secondary"
                onClick={() => setShowSettingsDialog(false)}
              >
                {t('common.later')}
              </button>
              <Link
                to="/settings"
                className="dialog-button primary"
                onClick={() => setShowSettingsDialog(false)}
              >
                {t('userHeader.goToSettings')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default UserHeader;