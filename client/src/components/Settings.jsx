import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Settings.css';

const Settings = () => {
  const { user } = useAuth();
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
    elevenlabsAgentId: ''
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

  const handleNameSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          firstName: nameForm.firstName.trim(),
          lastName: nameForm.lastName.trim()
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('Name updated successfully!');
        // Update the auth context would happen automatically on next load
      } else {
        setError(data.error || 'Failed to update name');
      }
    } catch (error) {
      setError('Failed to update name');
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
          <h2>Personal Information</h2>
          <form onSubmit={handleNameSubmit} className="name-form">
            <div className="form-group">
              <label htmlFor="firstName">First Name</label>
              <input
                type="text"
                id="firstName"
                value={nameForm.firstName}
                onChange={(e) => setNameForm(prev => ({
                  ...prev,
                  firstName: e.target.value
                }))}
                disabled={isLoading}
                placeholder="Enter your first name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="lastName">Last Name</label>
              <input
                type="text"
                id="lastName"
                value={nameForm.lastName}
                onChange={(e) => setNameForm(prev => ({
                  ...prev,
                  lastName: e.target.value
                }))}
                disabled={isLoading}
                placeholder="Enter your last name"
              />
            </div>

            <div className="form-group">
              <label>Email:</label>
              <span className="readonly-field">{user?.email}</span>
            </div>

            <button
              type="submit"
              className="settings-button primary"
              disabled={isLoading}
            >
              {isLoading ? 'Updating...' : 'Update Name'}
            </button>
          </form>
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


            <button
              type="submit"
              className="settings-button primary"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save ElevenLabs Settings'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default Settings;