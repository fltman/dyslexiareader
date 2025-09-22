import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import PasswordRequirements from './PasswordRequirements';
import './Login.css';
import './PasswordRequirements.css';

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
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [passwordFocused, setPasswordFocused] = useState(false);

  const { register } = useAuth();

  // Password validation logic
  const validatePassword = (password) => {
    return {
      length: password.length >= 8,
      lowercase: /[a-z]/.test(password),
      uppercase: /[A-Z]/.test(password),
      number: /\d/.test(password),
      special: /[@$!%*?&]/.test(password),
      validChars: /^[A-Za-z\d@$!%*?&]*$/.test(password)
    };
  };

  const isPasswordValid = (password) => {
    const validation = validatePassword(password);
    // Only check the requirements shown in the checklist
    return validation.length && validation.lowercase && validation.uppercase && validation.number && validation.special;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Mark field as touched
    setTouched(prev => ({
      ...prev,
      [name]: true
    }));

    // Clear field-specific errors when user starts typing
    if (fieldErrors[name]) {
      setFieldErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }

    // Clear general error when user makes changes
    if (error) {
      setError('');
    }
  };

  // Check if passwords match (for real-time feedback)
  const passwordsMatch = formData.password && formData.confirmPassword && formData.password === formData.confirmPassword;
  const showPasswordMismatch = touched.confirmPassword && formData.confirmPassword && !passwordsMatch;

  // Determine field validation states
  const getFieldValidationState = (fieldName) => {
    if (fieldErrors[fieldName]) return 'invalid';
    if (!touched[fieldName]) return 'neutral';
    
    switch (fieldName) {
      case 'email':
        return formData.email.includes('@') && formData.email.includes('.') ? 'valid' : 'neutral';
      case 'password':
        return isPasswordValid(formData.password) ? 'valid' : 'neutral';
      case 'confirmPassword':
        return passwordsMatch ? 'valid' : 'neutral';
      case 'firstName':
        if (formData.firstName && formData.firstName.trim().length > 0 && formData.firstName.trim().length < 2) return 'invalid';
        return !formData.firstName || formData.firstName.trim().length >= 2 ? 'valid' : 'neutral';
      case 'lastName':
        if (formData.lastName && formData.lastName.trim().length > 0 && formData.lastName.trim().length < 2) return 'invalid';
        return !formData.lastName || formData.lastName.trim().length >= 2 ? 'valid' : 'neutral';
      default:
        return 'neutral';
    }
  };

  // Check if form is valid for submission
  const isFormValid = () => {
    return (
      formData.email.trim() &&
      isPasswordValid(formData.password) &&
      formData.password === formData.confirmPassword &&
      (!formData.firstName || formData.firstName.trim().length >= 2) &&
      (!formData.lastName || formData.lastName.trim().length >= 2)
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isLoading || !isFormValid()) {
      return;
    }

    setError('');
    setFieldErrors({});
    setIsLoading(true);

    const result = await register(
      formData.email,
      formData.password,
      formData.firstName,
      formData.lastName
    );

    if (!result.success) {
      // Handle different types of errors
      if (result.code === 'VALIDATION_ERROR' && result.details) {
        // Map server validation errors to specific fields
        const newFieldErrors = {};
        result.details.forEach(detail => {
          newFieldErrors[detail.field] = detail.message;
        });
        setFieldErrors(newFieldErrors);
      } else if (result.code === 'USER_EXISTS') {
        setFieldErrors({ email: 'An account with this email already exists. Try logging in instead.' });
      } else if (result.code === 'RATE_LIMIT_EXCEEDED') {
        setError('Too many registration attempts. Please wait a few minutes and try again.');
      } else {
        setError(result.error || 'Registration failed. Please try again.');
      }
    }

    setIsLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo-container">
          <img src="/logo_500px.png" alt="The Magical Everything Reader" className="login-logo" />
          <div className="pulsating-orb"></div>
        </div>
        <h1>Create Account</h1>
        <p className="login-subtitle">Join for a personalized dyslexia-friendly reading experience</p>

        {error && (
          <div className={`error-banner ${error.includes('Too many') ? 'rate-limit' : ''}`} role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-row">
            <div className={`form-group ${getFieldValidationState('firstName') === 'invalid' ? 'field-invalid' : getFieldValidationState('firstName') === 'valid' ? 'field-valid' : ''}`}>
              <label htmlFor="firstName">First Name</label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                disabled={isLoading}
                autoComplete="given-name"
                aria-invalid={getFieldValidationState('firstName') === 'invalid' || undefined}
                aria-describedby={fieldErrors.firstName ? 'firstName-error' : undefined}
              />
              {fieldErrors.firstName && (
                <span id="firstName-error" className="field-error" role="alert">
                  {fieldErrors.firstName}
                </span>
              )}
              {!fieldErrors.firstName && getFieldValidationState('firstName') === 'invalid' && (
                <span className="field-error" role="alert">
                  First name must be at least 2 characters
                </span>
              )}
            </div>

            <div className={`form-group ${getFieldValidationState('lastName') === 'invalid' ? 'field-invalid' : getFieldValidationState('lastName') === 'valid' ? 'field-valid' : ''}`}>
              <label htmlFor="lastName">Last Name</label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                disabled={isLoading}
                autoComplete="family-name"
                aria-invalid={getFieldValidationState('lastName') === 'invalid' || undefined}
                aria-describedby={fieldErrors.lastName ? 'lastName-error' : undefined}
              />
              {fieldErrors.lastName && (
                <span id="lastName-error" className="field-error" role="alert">
                  {fieldErrors.lastName}
                </span>
              )}
              {!fieldErrors.lastName && getFieldValidationState('lastName') === 'invalid' && (
                <span className="field-error" role="alert">
                  Last name must be at least 2 characters
                </span>
              )}
            </div>
          </div>

          <div className={`form-group ${getFieldValidationState('email') === 'invalid' ? 'field-invalid' : getFieldValidationState('email') === 'valid' ? 'field-valid' : ''}`}>
            <label htmlFor="email">Email *</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              disabled={isLoading}
              autoComplete="email"
              aria-invalid={getFieldValidationState('email') === 'invalid' || undefined}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            />
            {fieldErrors.email && (
              <span id="email-error" className="field-error" role="alert">
                {fieldErrors.email}
              </span>
            )}
          </div>

          <div className={`form-group ${getFieldValidationState('password') === 'invalid' ? 'field-invalid' : getFieldValidationState('password') === 'valid' ? 'field-valid' : ''}`}>
            <label htmlFor="password">Password *</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              required
              disabled={isLoading}
              autoComplete="new-password"
              minLength="8"
              aria-invalid={getFieldValidationState('password') === 'invalid' || undefined}
              aria-describedby={fieldErrors.password ? 'password-error' : 'password-requirements'}
            />
            {fieldErrors.password && (
              <span id="password-error" className="field-error" role="alert">
                {fieldErrors.password}
              </span>
            )}
            <PasswordRequirements 
              password={formData.password} 
              showRequirements={passwordFocused || formData.password.length > 0}
            />
          </div>

          <div className={`form-group ${getFieldValidationState('confirmPassword') === 'invalid' || showPasswordMismatch ? 'field-invalid' : getFieldValidationState('confirmPassword') === 'valid' ? 'field-valid' : ''}`}>
            <label htmlFor="confirmPassword">Confirm Password *</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              required
              disabled={isLoading}
              autoComplete="new-password"
              aria-invalid={getFieldValidationState('confirmPassword') === 'invalid' || showPasswordMismatch || undefined}
              aria-describedby={fieldErrors.confirmPassword ? 'confirmPassword-error' : showPasswordMismatch ? 'password-mismatch' : undefined}
            />
            {fieldErrors.confirmPassword && (
              <span id="confirmPassword-error" className="field-error" role="alert">
                {fieldErrors.confirmPassword}
              </span>
            )}
            {showPasswordMismatch && (
              <span id="password-mismatch" className="field-error" role="alert">
                Passwords do not match
              </span>
            )}
          </div>

          <button
            type="submit"
            className="login-button primary"
            disabled={isLoading || !isFormValid()}
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="login-switch">
          Already have an account?{' '}
          <button
            onClick={onSwitchToLogin}
            className="switch-button"
            disabled={isLoading}
          >
            Sign in here
          </button>
        </p>
      </div>
    </div>
  );
};

export default Register;