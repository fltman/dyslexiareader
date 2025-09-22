import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import './Login.css';

const Register = ({ onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const { register } = useAuth();
  const { t } = useLocalization();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }

    // Password validation to match backend requirements
    if (formData.password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (!passwordPattern.test(formData.password)) {
      setError(t('auth.passwordRequirements'));
      return;
    }

    setIsLoading(true);

    const result = await register(
      formData.email,
      formData.password,
      formData.firstName,
      formData.lastName
    );

    if (!result.success) {
      setError(result.error);
    }

    setIsLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo-container">
          <img src="/logo.png" alt={t('app.name')} className="login-logo" />
          <div className="pulsating-orb"></div>
        </div>
        <h1>{t('auth.createAccount')}</h1>
        <p className="login-subtitle">{t('auth.createAccountSubtitle')}</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="firstName">{t('auth.firstName')}</label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                disabled={isLoading}
                autoComplete="given-name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="lastName">{t('auth.lastName')}</label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                disabled={isLoading}
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email">{t('auth.emailRequired')}</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              disabled={isLoading}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t('auth.passwordRequired')}</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              required
              disabled={isLoading}
              autoComplete="new-password"
              minLength="8"
            />
            <small className="form-hint">{t('auth.passwordHint')}</small>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">{t('auth.confirmPasswordRequired')}</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              required
              disabled={isLoading}
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className="login-button primary"
            disabled={isLoading}
          >
            {isLoading ? t('auth.creatingAccount') : t('auth.createAccount')}
          </button>
        </form>

        <p className="login-switch">
          {t('auth.alreadyHaveAccount')}{' '}
          <button
            onClick={onSwitchToLogin}
            className="switch-button"
            disabled={isLoading}
          >
            {t('auth.signInHere')}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Register;