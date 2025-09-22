import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LocalizationProvider } from './contexts/LocalizationContext';
import AuthView from './components/AuthView';
import UserHeader from './components/UserHeader';
import BooksView from './components/BooksView';
import AddBookView from './components/AddBookView';
import BookViewer from './components/BookViewer';
import Settings from './components/Settings';

// Protected route wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  return (
    <>
      <UserHeader />
      {children}
    </>
  );
};

// Main app routes
const AppRoutes = () => {
  return (
    <Router>
      <div className="App">
        <main>
          <Routes>
            <Route path="/" element={
              <ProtectedRoute>
                <BooksView />
              </ProtectedRoute>
            } />
            <Route path="/add-book" element={
              <ProtectedRoute>
                <AddBookView />
              </ProtectedRoute>
            } />
            <Route path="/book/:bookId" element={
              <ProtectedRoute>
                <BookViewer />
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

function App() {
  return (
    <LocalizationProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </LocalizationProvider>
  );
}

export default App
