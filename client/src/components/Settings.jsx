import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Settings.css';

const Settings = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // ElevenLabs preferences state
  const [preferences, setPreferences] = useState({
    elevenlabsApiKey: '',
    elevenlabsVoiceId: '',
    elevenlabsAgentId: '',
    playbackSpeed: 1.0,
    preferredLanguage: 'en',
    dyslexiaMode: true,
    highContrast: false,
    reducedMotion: false,
    fontSize: 'medium',
    lineSpacing: 'normal'
  });

  // Load user preferences on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const response = await fetch('/api/user/preferences', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        if (data.preferences) {
          setPreferences(prev => ({
            ...prev,
            ...data.preferences
          }));
        }
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setError('New password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/user/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('Password updated successfully!');
        setPasswordForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      } else {
        setError(data.error || 'Failed to update password');
      }
    } catch (error) {
      setError('Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreferencesSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(preferences)
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('Preferences updated successfully!');
      } else {
        setError(data.error || 'Failed to update preferences');
      }
    } catch (error) {
      setError('Failed to update preferences');
    } finally {
      setIsLoading(false);
    }
  };

  const displayName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.firstName
    ? user.firstName
    : user?.email || 'User';

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>Settings</h1>
        <p className="settings-subtitle">Manage your account and reading preferences</p>
      </div>

      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}

      <div className="settings-content">
        {/* Account Section */}
        <section className="settings-section">
          <h2>Account Information</h2>
          <div className="account-info">
            <div className="info-item">
              <label>Name:</label>
              <span>{displayName}</span>
            </div>
            <div className="info-item">
              <label>Email:</label>
              <span>{user?.email}</span>
            </div>
          </div>
        </section>

        {/* Password Change Section */}
        <section className="settings-section">
          <h2>Change Password</h2>
          <form onSubmit={handlePasswordSubmit} className="password-form">
            <div className="form-group">
              <label htmlFor="currentPassword">Current Password</label>
              <input
                type="password"
                id="currentPassword"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm(prev => ({
                  ...prev,
                  currentPassword: e.target.value
                }))}
                required
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm(prev => ({
                  ...prev,
                  newPassword: e.target.value
                }))}
                required
                disabled={isLoading}
                minLength={6}
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm(prev => ({
                  ...prev,
                  confirmPassword: e.target.value
                }))}
                required
                disabled={isLoading}
                minLength={6}
              />
            </div>

            <button
              type="submit"
              className="settings-button primary"
              disabled={isLoading}
            >
              {isLoading ? 'Updating...' : 'Change Password'}
            </button>
          </form>
        </section>

        {/* ElevenLabs Settings Section */}
        <section className="settings-section">
          <h2>ElevenLabs Text-to-Speech Settings</h2>
          <form onSubmit={handlePreferencesSubmit} className="preferences-form">
            <div className="form-group">
              <label htmlFor="elevenlabsApiKey">ElevenLabs API Key</label>
              <input
                type="password"
                id="elevenlabsApiKey"
                value={preferences.elevenlabsApiKey || ''}
                onChange={(e) => setPreferences(prev => ({
                  ...prev,
                  elevenlabsApiKey: e.target.value
                }))}
                placeholder="sk-..."
                disabled={isLoading}
              />
              <small className="form-help">
                Your ElevenLabs API key for text-to-speech functionality
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="elevenlabsVoiceId">Voice ID</label>
              <input
                type="text"
                id="elevenlabsVoiceId"
                value={preferences.elevenlabsVoiceId || ''}
                onChange={(e) => setPreferences(prev => ({
                  ...prev,
                  elevenlabsVoiceId: e.target.value
                }))}
                placeholder="e.g. EXAVITQu4vr4xnSDxMaL"
                disabled={isLoading}
              />
              <small className="form-help">
                The voice ID to use for speech synthesis
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="elevenlabsAgentId">Agent ID (Optional)</label>
              <input
                type="text"
                id="elevenlabsAgentId"
                value={preferences.elevenlabsAgentId || ''}
                onChange={(e) => setPreferences(prev => ({
                  ...prev,
                  elevenlabsAgentId: e.target.value
                }))}
                placeholder="Agent ID for conversational AI"
                disabled={isLoading}
              />
              <small className="form-help">
                Optional: Agent ID for conversational AI features
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="playbackSpeed">Playback Speed</label>
              <input
                type="range"
                id="playbackSpeed"
                min="0.5"
                max="2.0"
                step="0.1"
                value={preferences.playbackSpeed || 1.0}
                onChange={(e) => setPreferences(prev => ({
                  ...prev,
                  playbackSpeed: parseFloat(e.target.value)
                }))}
                disabled={isLoading}
              />
              <span className="range-value">{preferences.playbackSpeed}x</span>
            </div>

            <div className="form-group">
              <label htmlFor="preferredLanguage">Preferred Language</label>
              <select
                id="preferredLanguage"
                value={preferences.preferredLanguage || 'en'}
                onChange={(e) => setPreferences(prev => ({
                  ...prev,
                  preferredLanguage: e.target.value
                }))}
                disabled={isLoading}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="it">Italian</option>
                <option value="pt">Portuguese</option>
              </select>
            </div>

            <button
              type="submit"
              className="settings-button primary"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save ElevenLabs Settings'}
            </button>
          </form>
        </section>

        {/* Accessibility Settings Section */}
        <section className="settings-section">
          <h2>Accessibility Preferences</h2>
          <form onSubmit={handlePreferencesSubmit} className="preferences-form">
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={preferences.dyslexiaMode}
                  onChange={(e) => setPreferences(prev => ({
                    ...prev,
                    dyslexiaMode: e.target.checked
                  }))}
                  disabled={isLoading}
                />
                <span>Dyslexia-friendly mode</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={preferences.highContrast}
                  onChange={(e) => setPreferences(prev => ({
                    ...prev,
                    highContrast: e.target.checked
                  }))}
                  disabled={isLoading}
                />
                <span>High contrast mode</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={preferences.reducedMotion}
                  onChange={(e) => setPreferences(prev => ({
                    ...prev,
                    reducedMotion: e.target.checked
                  }))}
                  disabled={isLoading}
                />
                <span>Reduced motion</span>
              </label>
            </div>

            <div className="form-group">
              <label htmlFor="fontSize">Font Size</label>
              <select
                id="fontSize"
                value={preferences.fontSize || 'medium'}
                onChange={(e) => setPreferences(prev => ({
                  ...prev,
                  fontSize: e.target.value
                }))}
                disabled={isLoading}
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="extra-large">Extra Large</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="lineSpacing">Line Spacing</label>
              <select
                id="lineSpacing"
                value={preferences.lineSpacing || 'normal'}
                onChange={(e) => setPreferences(prev => ({
                  ...prev,
                  lineSpacing: e.target.value
                }))}
                disabled={isLoading}
              >
                <option value="tight">Tight</option>
                <option value="normal">Normal</option>
                <option value="relaxed">Relaxed</option>
                <option value="loose">Loose</option>
              </select>
            </div>

            <button
              type="submit"
              className="settings-button primary"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Accessibility Settings'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default Settings;