import React from 'react';
import './PasswordRequirements.css';

const PasswordRequirements = ({ password, showRequirements = true, id = 'password-requirements' }) => {
  const requirements = [
    {
      id: 'length',
      label: 'At least 8 characters',
      test: (pwd) => pwd.length >= 8
    },
    {
      id: 'lowercase',
      label: 'One lowercase letter',
      test: (pwd) => /[a-z]/.test(pwd)
    },
    {
      id: 'uppercase', 
      label: 'One uppercase letter',
      test: (pwd) => /[A-Z]/.test(pwd)
    },
    {
      id: 'number',
      label: 'One number',
      test: (pwd) => /\d/.test(pwd)
    },
    {
      id: 'special',
      label: 'One special character (@$!%*?&)',
      test: (pwd) => /[@$!%*?&]/.test(pwd)
    }
  ];

  const getRequirementStatus = (requirement) => {
    return requirement.test(password || '');
  };

  const allRequirementsMet = requirements.every(req => getRequirementStatus(req));

  if (!showRequirements) {
    return null;
  }

  return (
    <div id={id} className="password-requirements" role="status" aria-live="polite">
      <div className="requirements-header">
        <span className="requirements-title">Password Requirements:</span>
        {allRequirementsMet && (
          <span className="all-met" aria-label="All requirements met">
            ✅ All requirements met
          </span>
        )}
      </div>
      <ul className="requirements-list" aria-label="Password requirements checklist">
        {requirements.map((requirement) => {
          const isMet = getRequirementStatus(requirement);
          return (
            <li 
              key={requirement.id} 
              className={`requirement-item ${isMet ? 'met' : 'unmet'}`}
              aria-label={`${requirement.label} - ${isMet ? 'satisfied' : 'not satisfied'}`}
            >
              <span className="requirement-icon" aria-hidden="true">
                {isMet ? '✅' : '❌'}
              </span>
              <span className="requirement-text">{requirement.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PasswordRequirements;