// Authentication routes for TheReader
import express from 'express';
import rateLimit from 'express-rate-limit';
import { db } from './db.js';
import { users, userPreferences } from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import {
  hashPassword,
  comparePassword,
  generateToken,
  authenticateToken,
  getUserWithPreferences,
  createDefaultPreferences,
  encrypt
} from './auth.js';
import {
  validate,
  registerSchema,
  loginSchema,
  preferencesSchema,
  changePasswordSchema,
  updateProfileSchema,
  rateLimitConfig
} from './validation.js';

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit(rateLimitConfig.auth);

/**
 * POST /auth/register
 * Register a new user
 */
router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Check if user already exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return res.status(400).json({
        error: 'User with this email already exists',
        code: 'USER_EXISTS'
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const newUser = await db.insert(users).values({
      email,
      passwordHash,
      firstName: firstName || null,
      lastName: lastName || null,
      isActive: true,
      emailVerified: false,
    }).returning({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      createdAt: users.createdAt
    });

    const user = newUser[0];

    // Create default preferences
    await createDefaultPreferences(user.id);

    // Generate JWT token
    const token = generateToken(user.id);

    // Update last login
    await db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    // Set token in httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR'
    });
  }
});

/**
 * POST /auth/login
 * User login
 */
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const userResult = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!userResult.length) {
      return res.status(401).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const user = userResult[0];

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        error: 'Account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Generate JWT token
    const token = generateToken(user.id);

    // Update last login
    await db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    // Set token in httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        lastLoginAt: new Date()
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      code: 'LOGIN_ERROR'
    });
  }
});

/**
 * GET /auth/me
 * Get current user profile with preferences
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userWithPrefs = await getUserWithPreferences(req.user.id);

    if (!userWithPrefs) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Don't send sensitive data to client
    const { 
      passwordHash, 
      elevenlabsApiKey, 
      elevenlabsAgentId, 
      ...userProfile 
    } = userWithPrefs;

    // Add masked indicators for sensitive fields that exist
    if (userWithPrefs.elevenlabsApiKey) {
      userProfile.elevenlabsApiKey = '***masked***';
    }
    if (userWithPrefs.elevenlabsAgentId) {
      userProfile.elevenlabsAgentId = '***masked***';
    }

    res.json({
      user: userProfile
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to get user profile',
      code: 'PROFILE_ERROR'
    });
  }
});

/**
 * PUT /auth/profile
 * Update user profile
 */
router.put('/profile', authenticateToken, validate(updateProfileSchema), async (req, res) => {
  try {
    const { firstName, lastName } = req.body;

    const updatedUser = await db.update(users)
      .set({
        firstName: firstName || null,
        lastName: lastName || null,
        updatedAt: new Date()
      })
      .where(eq(users.id, req.user.id))
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        updatedAt: users.updatedAt
      });

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser[0]
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      code: 'UPDATE_PROFILE_ERROR'
    });
  }
});

/**
 * PUT /auth/password
 * Change password
 */
router.put('/password', authenticateToken, validate(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get current user with password hash
    const userResult = await db.select()
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    if (!userResult.length) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult[0];

    // Verify current password
    const isValidCurrentPassword = await comparePassword(currentPassword, user.passwordHash);
    if (!isValidCurrentPassword) {
      return res.status(400).json({
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await db.update(users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date()
      })
      .where(eq(users.id, req.user.id));

    res.json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Failed to change password',
      code: 'CHANGE_PASSWORD_ERROR'
    });
  }
});

/**
 * GET /auth/preferences
 * Get user preferences
 */
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const userWithPrefs = await getUserWithPreferences(req.user.id);

    if (!userWithPrefs) {
      return res.status(404).json({
        error: 'User preferences not found',
        code: 'PREFERENCES_NOT_FOUND'
      });
    }

    // Extract only preference fields
    const preferences = {
      elevenlabsApiKey: userWithPrefs.elevenlabsApiKey ? '***masked***' : null,
      elevenlabsVoiceId: userWithPrefs.elevenlabsVoiceId,
      elevenlabsAgentId: userWithPrefs.elevenlabsAgentId, // Return actual agent ID for frontend widget
      playbackSpeed: userWithPrefs.playbackSpeed,
      preferredLanguage: userWithPrefs.preferredLanguage,
      dyslexiaMode: userWithPrefs.dyslexiaMode,
      highContrast: userWithPrefs.highContrast,
      reducedMotion: userWithPrefs.reducedMotion,
      fontSize: userWithPrefs.fontSize,
      lineSpacing: userWithPrefs.lineSpacing,
    };

    res.json({ preferences });

  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({
      error: 'Failed to get preferences',
      code: 'PREFERENCES_ERROR'
    });
  }
});

/**
 * PUT /auth/preferences
 * Update user preferences
 */
router.put('/preferences', authenticateToken, validate(preferencesSchema), async (req, res) => {
  try {
    const preferences = req.body;

    // Encrypt ElevenLabs API key if provided
    if (preferences.elevenlabsApiKey) {
      const encryptedKey = encrypt(preferences.elevenlabsApiKey);
      if (!encryptedKey) {
        return res.status(500).json({
          error: 'Failed to encrypt API key. Please try again.',
          code: 'ENCRYPTION_ERROR'
        });
      }
      preferences.elevenlabsApiKey = JSON.stringify(encryptedKey);
    }

    // Encrypt ElevenLabs Agent ID if provided
    if (preferences.elevenlabsAgentId) {
      const encryptedAgentId = encrypt(preferences.elevenlabsAgentId);
      if (!encryptedAgentId) {
        return res.status(500).json({
          error: 'Failed to encrypt Agent ID. Please try again.',
          code: 'ENCRYPTION_ERROR'
        });
      }
      preferences.elevenlabsAgentId = JSON.stringify(encryptedAgentId);
    }

    // Check if preferences exist
    const existingPrefs = await db.select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, req.user.id))
      .limit(1);

    if (existingPrefs.length === 0) {
      // Create new preferences
      await db.insert(userPreferences).values({
        userId: req.user.id,
        ...preferences,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } else {
      // Update existing preferences
      await db.update(userPreferences)
        .set({
          ...preferences,
          updatedAt: new Date()
        })
        .where(eq(userPreferences.userId, req.user.id));
    }

    // Get updated preferences (without encrypted data for response)
    const updatedUserWithPrefs = await getUserWithPreferences(req.user.id);

    const responsePreferences = {
      elevenlabsApiKey: updatedUserWithPrefs.elevenlabsApiKey ? '***masked***' : null,
      elevenlabsVoiceId: updatedUserWithPrefs.elevenlabsVoiceId,
      elevenlabsAgentId: updatedUserWithPrefs.elevenlabsAgentId ? '***masked***' : null,
      playbackSpeed: updatedUserWithPrefs.playbackSpeed,
      preferredLanguage: updatedUserWithPrefs.preferredLanguage,
      dyslexiaMode: updatedUserWithPrefs.dyslexiaMode,
      highContrast: updatedUserWithPrefs.highContrast,
      reducedMotion: updatedUserWithPrefs.reducedMotion,
      fontSize: updatedUserWithPrefs.fontSize,
      lineSpacing: updatedUserWithPrefs.lineSpacing,
    };

    res.json({
      message: 'Preferences updated successfully',
      preferences: responsePreferences
    });

  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      error: 'Failed to update preferences',
      code: 'UPDATE_PREFERENCES_ERROR'
    });
  }
});

/**
 * POST /auth/logout
 * User logout (client-side token removal, but we can log the event)
 * Note: Does not require authentication so expired tokens can still log out
 */
router.post('/logout', async (req, res) => {
  try {
    // Clear the token cookie
    res.clearCookie('token');
    
    // In a more advanced implementation, you might maintain a token blacklist
    // For now, we just acknowledge the logout
    res.json({
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
});

/**
 * DELETE /auth/account
 * Delete user account (soft delete - deactivate)
 */
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    // Soft delete - deactivate the account
    await db.update(users)
      .set({
        isActive: false,
        updatedAt: new Date()
      })
      .where(eq(users.id, req.user.id));

    res.json({
      message: 'Account deactivated successfully'
    });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      error: 'Failed to delete account',
      code: 'DELETE_ACCOUNT_ERROR'
    });
  }
});

export default router;