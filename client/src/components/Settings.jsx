import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import './Settings.css';

const Settings = () => {
  const { user, logout } = useAuth();
  const { t, currentLanguage, changeLanguage, getAvailableLanguages } = useLocalization();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Name form state
  const [nameForm, setNameForm] = useState({
    firstName: '',
    lastName: ''
  });

  // ElevenLabs preferences state
  const [preferences, setPreferences] = useState({
    elevenlabsApiKey: '',
    elevenlabsVoiceId: '',
    elevenlabsAgentId: '',
    language: currentLanguage
  });

  // Load user preferences on mount and initialize name form
  useEffect(() => {
    loadPreferences();
    // Initialize name form with current user data
    if (user) {
      setNameForm({
        firstName: user.firstName || '',
        lastName: user.lastName || ''
      });
    }
  }, [user]);

  const loadPreferences = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/auth/preferences', {
        headers,
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        if (data.preferences) {
          const processedPreferences = { ...data.preferences };

          // Ensure playbackSpeed is properly formatted for the select element
          if (processedPreferences.playbackSpeed !== undefined && processedPreferences.playbackSpeed !== null) {
            // Convert to number first, then format with one decimal place
            const speed = parseFloat(processedPreferences.playbackSpeed);
            processedPreferences.playbackSpeed = speed.toFixed(1);
          }

          setPreferences(prev => ({
            ...prev,
            ...processedPreferences,
            language: processedPreferences.preferredLanguage || currentLanguage
          }));
        }
      } else if (response.status === 401 || response.status === 403) {
        console.warn('Authentication failed in Settings, logging out');
        logout();
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
      setError(t('settings.messages.passwordsNoMatch'));
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setError(t('settings.messages.passwordTooShort'));
      return;
    }

    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/auth/password', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(t('settings.messages.passwordUpdated'));
        setPasswordForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      } else if (response.status === 401 || response.status === 403) {
        console.warn('Authentication failed in Settings password change, logging out');
        logout();
        return;
      } else {
        setError(data.error || t('settings.messages.updateFailed'));
      }
    } catch (error) {
      setError(t('settings.messages.updateFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleNameSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          firstName: nameForm.firstName.trim(),
          lastName: nameForm.lastName.trim()
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(t('settings.messages.nameUpdated'));
        // Update the auth context would happen automatically on next load
      } else if (response.status === 401 || response.status === 403) {
        console.warn('Authentication failed in Settings profile update, logging out');
        logout();
        return;
      } else {
        setError(data.error || t('settings.messages.updateFailed'));
      }
    } catch (error) {
      setError(t('settings.messages.updateFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLanguageChange = async (newLanguage) => {
    setPreferences(prev => ({
      ...prev,
      language: newLanguage
    }));

    // Update the localization context
    await changeLanguage(newLanguage);
  };

  const handlePreferencesSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json'
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Create preferences object, excluding masked API key
      const preferencesToSave = { ...preferences };

      // Don't send API key if it's the masked placeholder
      if (preferencesToSave.elevenlabsApiKey === '***masked***') {
        delete preferencesToSave.elevenlabsApiKey;
      }

      // Don't send Agent ID if it's the masked placeholder
      if (preferencesToSave.elevenlabsAgentId === '***masked***') {
        delete preferencesToSave.elevenlabsAgentId;
      }

      // Map language to preferredLanguage for database
      if (preferencesToSave.language) {
        preferencesToSave.preferredLanguage = preferencesToSave.language;
        delete preferencesToSave.language;
      }

      const response = await fetch('/api/auth/preferences', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(preferencesToSave)
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(t('settings.messages.preferencesUpdated'));
      } else if (response.status === 401 || response.status === 403) {
        console.warn('Authentication failed in Settings preferences update, logging out');
        logout();
        return;
      } else {
        setError(data.error || t('settings.messages.updateFailed'));
      }
    } catch (error) {
      setError(t('settings.messages.updateFailed'));
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
        <h1>{t('settings.title')}</h1>
        <p className="settings-subtitle">{t('settings.subtitle')}</p>
      </div>

      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}

      <div className="settings-content">
        {/* Account Section */}
        <section className="settings-section">
          <h2>{t('settings.personalInfo')}</h2>
          <form onSubmit={handleNameSubmit} className="name-form">
            <div className="form-group">
              <label htmlFor="firstName">{t('auth.firstName')}</label>
              <input
                type="text"
                id="firstName"
                value={nameForm.firstName}
                onChange={(e) => setNameForm(prev => ({
                  ...prev,
                  firstName: e.target.value
                }))}
                disabled={isLoading}
                placeholder={t('auth.firstName')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="lastName">{t('auth.lastName')}</label>
              <input
                type="text"
                id="lastName"
                value={nameForm.lastName}
                onChange={(e) => setNameForm(prev => ({
                  ...prev,
                  lastName: e.target.value
                }))}
                disabled={isLoading}
                placeholder={t('auth.lastName')}
              />
            </div>

            <div className="form-group">
              <label>{t('auth.email')}:</label>
              <span className="readonly-field">{user?.email}</span>
            </div>

            <button
              type="submit"
              className="settings-button primary"
              disabled={isLoading}
            >
              {isLoading ? t('settings.updating') : t('settings.updateName')}
            </button>
          </form>
        </section>

        {/* Language Preference Section */}
        <section className="settings-section">
          <h2>{t('settings.language')}</h2>
          <div className="form-group">
            <label htmlFor="language">{t('settings.selectLanguage')}</label>
            <select
              id="language"
              value={preferences.language || currentLanguage}
              onChange={(e) => handleLanguageChange(e.target.value)}
              disabled={isLoading}
            >
              {getAvailableLanguages().map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Password Change Section */}
        <section className="settings-section">
          <h2>{t('settings.changePassword')}</h2>
          <form onSubmit={handlePasswordSubmit} className="password-form">
            <div className="form-group">
              <label htmlFor="currentPassword">{t('settings.currentPassword')}</label>
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
              <label htmlFor="newPassword">{t('settings.newPassword')}</label>
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
              <label htmlFor="confirmPassword">{t('settings.confirmNewPassword')}</label>
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
              {isLoading ? t('settings.updating') : t('settings.changePassword')}
            </button>
          </form>
        </section>

        {/* ElevenLabs Settings Section */}
        <section className="settings-section">
          <h2>{t('settings.elevenlabs.title')}</h2>
          <form onSubmit={handlePreferencesSubmit} className="preferences-form">
            <div className="form-group">
              <label htmlFor="elevenlabsApiKey">{t('settings.elevenlabs.apiKey')}</label>
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
                {t('settings.elevenlabs.apiKeyHelp')}
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="elevenlabsVoiceId">{t('settings.elevenlabs.voiceId')}</label>
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
                {t('settings.elevenlabs.voiceIdHelp')}
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="elevenlabsAgentId">{t('settings.elevenlabs.agentId')}</label>
              <input
                type="text"
                id="elevenlabsAgentId"
                value={preferences.elevenlabsAgentId || ''}
                onChange={(e) => setPreferences(prev => ({
                  ...prev,
                  elevenlabsAgentId: e.target.value
                }))}
                placeholder={t('settings.elevenlabs.agentId')}
                disabled={isLoading}
              />
              <small className="form-help">
                {t('settings.elevenlabs.agentIdHelp')}
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="playbackSpeed">{t('settings.elevenlabs.playbackSpeed')}</label>
              <select
                id="playbackSpeed"
                value={preferences.playbackSpeed ? parseFloat(preferences.playbackSpeed).toFixed(1) : '1.0'}
                onChange={(e) => setPreferences(prev => ({
                  ...prev,
                  playbackSpeed: e.target.value
                }))}
                disabled={isLoading}
              >
                <option value="0.5">{t('settings.elevenlabs.speeds.slower')}</option>
                <option value="0.75">0.75x</option>
                <option value="1.0">{t('settings.elevenlabs.speeds.normal')}</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="2.0">{t('settings.elevenlabs.speeds.faster')}</option>
              </select>
              <small className="form-help">
                {t('settings.elevenlabs.playbackSpeedHelp')}
              </small>
            </div>

            <button
              type="submit"
              className="settings-button primary"
              disabled={isLoading}
            >
              {isLoading ? t('settings.saving') : t('settings.elevenlabs.saveSettings')}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default Settings;