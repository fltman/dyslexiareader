import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// JWT secret - in production this should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d'; // Token expires in 7 days

// Generate JWT token
export const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// Hash password
export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

// Compare password with hash
export const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

// Middleware to verify JWT token
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    // Check for token in cookies as fallback
    const cookieToken = req.cookies?.token;
    if (!cookieToken) {
      return res.status(401).json({ error: 'Access token required' });
    }
    req.token = cookieToken;
  } else {
    req.token = token;
  }

  jwt.verify(req.token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.userId = user.userId;
    next();
  });
};

// Optional authentication - doesn't fail if no token
export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    const cookieToken = req.cookies?.token;
    if (!cookieToken) {
      return next(); // Continue without auth
    }
    req.token = cookieToken;
  } else {
    req.token = token;
  }

  jwt.verify(req.token, JWT_SECRET, (err, user) => {
    if (!err) {
      req.userId = user.userId;
    }
    next();
  });
};

// Validate email format
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate password strength
export const isValidPassword = (password) => {
  // At least 6 characters
  return password && password.length >= 6;
};