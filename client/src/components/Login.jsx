import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

const Login = ({ onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();

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

  const handleDemoLogin = async () => {
    setError('');
    setIsLoading(true);

    const result = await login('demo@thereader.app', 'demopassword');

    if (!result.success) {
      setError('Demo login failed. Please try manual login.');
    }

    setIsLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Welcome to TheReader</h1>
        <p className="login-subtitle">Sign in to access your dyslexia-friendly reading experience</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
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
            <label htmlFor="password">Password</label>
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
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-divider">
          <span>or</span>
        </div>

        <button
          onClick={handleDemoLogin}
          className="login-button demo"
          disabled={isLoading}
        >
          Try Demo Account
        </button>

        <p className="login-switch">
          Don't have an account?{' '}
          <button
            onClick={onSwitchToRegister}
            className="switch-button"
            disabled={isLoading}
          >
            Create one here
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;