// Authentication utilities and middleware for TheReader
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { users, userPreferences } from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = 12;

// Encryption for sensitive data (like user's ElevenLabs API keys)
const ENCRYPTION_KEY = process.env.DATABASE_ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

if (!ENCRYPTION_KEY) {
  throw new Error('DATABASE_ENCRYPTION_KEY environment variable is required for encrypting sensitive data');
}

// Ensure we have a 32-byte key for AES-256
const keyBuffer = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

/**
 * Hash password using bcrypt
 */
export const hashPassword = async (password) => {
  return await bcrypt.hash(password, BCRYPT_ROUNDS);
};

/**
 * Compare password with hash
 */
export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generate JWT token
 */
export const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Verify JWT token
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * Encrypt sensitive data (like API keys)
 */
export const encrypt = (text) => {
  if (!text) return null;

  try {
    const iv = crypto.randomBytes(12); // 12 bytes for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
};

/**
 * Decrypt sensitive data
 */
export const decrypt = (encryptedData) => {
  if (!encryptedData || !encryptedData.encrypted) return null;

  try {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
};

/**
 * Authentication middleware
 */
export const authenticateToken = async (req, res, next) => {
  console.log('Auth middleware called for:', req.path);
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    // Check for token in cookies as fallback
    const cookieToken = req.cookies?.token;
    console.log('No auth header, checking cookies:', !!cookieToken);
    if (!cookieToken) {
      console.log('No token found, returning 401');
      return res.status(401).json({
        error: 'Access token required',
        code: 'TOKEN_REQUIRED'
      });
    }
    token = cookieToken;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({
      error: 'Invalid or expired token',
      code: 'TOKEN_INVALID'
    });
  }

  try {
    // Get user from database
    const user = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
      emailVerified: users.emailVerified,
    }).from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);

    if (!user.length || !user[0].isActive) {
      return res.status(403).json({
        error: 'User not found or inactive',
        code: 'USER_INACTIVE'
      });
    }

    // Attach user to request
    req.user = user[0];
    req.userId = user[0].id;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Optional authentication middleware (for public endpoints that can benefit from user context)
 */
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    const cookieToken = req.cookies?.token;
    if (!cookieToken) {
      req.user = null;
      return next();
    }
    token = cookieToken;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    req.user = null;
    return next();
  }

  try {
    const user = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
      emailVerified: users.emailVerified,
    }).from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);

    if (user.length && user[0].isActive) {
      req.user = user[0];
      req.userId = user[0].id;
    } else {
      req.user = null;
    }
  } catch (error) {
    console.error('Optional auth error:', error);
    req.user = null;
  }

  next();
};

/**
 * Get user with preferences
 */
export const getUserWithPreferences = async (userId) => {
  try {
    const result = await db.select({
      // User fields
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      // Preferences fields
      elevenlabsApiKey: userPreferences.elevenlabsApiKey,
      elevenlabsVoiceId: userPreferences.elevenlabsVoiceId,
      elevenlabsAgentId: userPreferences.elevenlabsAgentId,
      playbackSpeed: userPreferences.playbackSpeed,
      preferredLanguage: userPreferences.preferredLanguage,
      dyslexiaMode: userPreferences.dyslexiaMode,
      highContrast: userPreferences.highContrast,
      reducedMotion: userPreferences.reducedMotion,
      fontSize: userPreferences.fontSize,
      lineSpacing: userPreferences.lineSpacing,
    })
    .from(users)
    .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
    .where(eq(users.id, userId))
    .limit(1);

    if (!result.length) return null;

    const user = result[0];

    // Decrypt ElevenLabs API key if present
    if (user.elevenlabsApiKey) {
      try {
        const decryptedKey = decrypt(JSON.parse(user.elevenlabsApiKey));
        user.elevenlabsApiKey = decryptedKey;
      } catch (error) {
        console.error('Error decrypting API key:', error);
        user.elevenlabsApiKey = null;
      }
    }

    // Decrypt ElevenLabs Agent ID if present
    if (user.elevenlabsAgentId) {
      try {
        const decryptedAgentId = decrypt(JSON.parse(user.elevenlabsAgentId));
        user.elevenlabsAgentId = decryptedAgentId;
      } catch (error) {
        console.error('Error decrypting Agent ID:', error);
        user.elevenlabsAgentId = null;
      }
    }

    return user;
  } catch (error) {
    console.error('Error getting user with preferences:', error);
    return null;
  }
};

/**
 * Create default user preferences
 */
export const createDefaultPreferences = async (userId) => {
  try {
    await db.insert(userPreferences).values({
      userId,
      playbackSpeed: '1.0',
      preferredLanguage: 'en',
      dyslexiaMode: true,
      highContrast: false,
      reducedMotion: false,
      fontSize: 'medium',
      lineSpacing: 'normal',
    });
  } catch (error) {
    console.error('Error creating default preferences:', error);
    throw error;
  }
};