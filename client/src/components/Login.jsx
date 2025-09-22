import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import './Login.css';

const Login = ({ onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();
  const { t } = useLocalization();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await login(email, password);

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
        <h1>{t('auth.signIn')}</h1>
        <p className="login-subtitle">{t('auth.signInSubtitle')}</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">{t('auth.email')}</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t('auth.password')}</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="login-button primary"
            disabled={isLoading}
          >
            {isLoading ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </form>

        <p className="login-switch">
          {t('auth.noAccount')}{' '}
          <button
            onClick={onSwitchToRegister}
            className="switch-button"
            disabled={isLoading}
          >
            {t('auth.createAccount')}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;