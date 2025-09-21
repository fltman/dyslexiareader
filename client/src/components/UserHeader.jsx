import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import './UserHeader.css';

const UserHeader = () => {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  const displayName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.firstName
    ? user.firstName
    : user?.email || 'User';

  return (
    <header className="user-header">
      <div className="user-header-content">
        <img src="/logo.png" alt="The Magical Everything Reader" className="app-logo" />
        <div className="user-info">
          <span className="welcome-text">Welcome, {displayName}</span>
          <Link
            to="/"
            className="home-link home-icon"
            title="Home"
          >
            <span className="icon-home"></span>
          </Link>
          <Link
            to="/settings"
            className="settings-link"
            title="Settings"
          >
            ⚙
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
    </header>
  );
};

export default UserHeader;