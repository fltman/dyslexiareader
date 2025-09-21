import { useState } from 'react';
import Login from './Login';
import Register from './Register';

const AuthView = () => {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="auth-view">
      {isLogin ? (
        <Login onSwitchToRegister={() => setIsLogin(false)} />
      ) : (
        <Register onSwitchToLogin={() => setIsLogin(true)} />
      )}
    </div>
  );
};

export default AuthView;