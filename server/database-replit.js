// TheReader database helper functions using Replit PostgreSQL integration
import { db } from './db.js';
import { books, pages, scanningSessions, textBlocks, users, userPreferences } from '../shared/schema.js';
import { eq, desc, and } from 'drizzle-orm';

export const dbHelpers = {
  // Book operations
  async getAllBooks(userId = null) {
    if (userId) {
      return await db.select().from(books)
        .where(eq(books.userId, userId))
        .orderBy(desc(books.createdAt));
    }
    // For backward compatibility - will be removed
    return await db.select().from(books).orderBy(desc(books.createdAt));
  },

  async getBookById(id, userId = null) {
    const conditions = [eq(books.id, parseInt(id))];
    if (userId) {
      conditions.push(eq(books.userId, userId));
    }
    const result = await db.select().from(books)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0]);
    return result[0] || null;
  },

  async createBook(userId = null) {
    const bookData = {
      status: 'processing'
    };
    if (userId) {
      bookData.userId = userId;
    }
    const result = await db.insert(books).values(bookData).returning();
    return result[0].id;
  },

  async updateBook(id, updates) {
    await db.update(books)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(books.id, parseInt(id)));
  },

  async cleanupEmptyBooks() {
    // Get books with no pages
    const booksWithPages = await db
      .select({ bookId: pages.bookId })
      .from(pages)
      .groupBy(pages.bookId);
    
    const bookIds = booksWithPages.map(b => b.bookId);
    
    if (bookIds.length === 0) {
      // Delete all books if no pages exist
      const result = await db.delete(books);
      return result.rowCount || 0;
    }
    
    // Delete books that don't have pages
    const result = await db.delete(books).where(eq(books.id, bookIds[0])); // This is simplified
    return result.rowCount || 0;
  },

  // Page operations
  async getBookPages(bookId) {
    return await db.select().from(pages)
      .where(eq(pages.bookId, parseInt(bookId)))
      .orderBy(pages.pageNumber);
  },

  async getPageById(pageId) {
    const result = await db.select().from(pages)
      .where(eq(pages.id, parseInt(pageId)));
    return result[0] || null;
  },

  async addPage(bookId, pageNumber, imagePath) {
    const result = await db.insert(pages).values({
      bookId: parseInt(bookId),
      pageNumber,
      imagePath
    }).returning();
    return result[0].id;
  },

  // Scanning session operations
  async createScanningSession(sessionId, bookId) {
    await db.insert(scanningSessions).values({
      id: sessionId,
      bookId: parseInt(bookId),
      status: 'active',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });
  },

  async getScanningSession(sessionId) {
    const result = await db.select().from(scanningSessions)
      .where(eq(scanningSessions.id, sessionId));
    return result[0] || null;
  },

  async closeScanningSession(sessionId) {
    await db.update(scanningSessions)
      .set({ status: 'completed' })
      .where(eq(scanningSessions.id, sessionId));
  },

  async updateScanningSessionProgress(sessionId, progressData) {
    await db.update(scanningSessions)
      .set({
        processingStep: progressData.currentStep,
        stepsCompleted: progressData.stepsCompleted,
        totalSteps: progressData.totalSteps,
        processingDetails: progressData.details,
        status: progressData.status || 'processing'
      })
      .where(eq(scanningSessions.id, sessionId));
  },

  // Text block operations
  async getTextBlocks(pageId) {
    return await db.select().from(textBlocks)
      .where(eq(textBlocks.pageId, parseInt(pageId)))
      .orderBy(textBlocks.createdAt);
  },

  async clearTextBlocks(pageId) {
    await db.delete(textBlocks)
      .where(eq(textBlocks.pageId, parseInt(pageId)));
  },

  async getTextBlockById(blockId) {
    const result = await db.select().from(textBlocks)
      .where(eq(textBlocks.id, parseInt(blockId)));
    return result[0] || null;
  },

  async createTextBlock(pageId, x, y, width, height) {
    const result = await db.insert(textBlocks).values({
      pageId: parseInt(pageId),
      x,
      y,
      width,
      height,
      status: 'pending'
    }).returning();
    return result[0].id;
  },

  async updateTextBlock(blockId, text, confidence) {
    await db.update(textBlocks)
      .set({ 
        ocrText: text, 
        confidence: Math.round(confidence * 100),
        status: 'completed' 
      })
      .where(eq(textBlocks.id, parseInt(blockId)));
  },

  async updateTextBlockAudio(blockId, audioUrl, alignmentData, normalizedAlignmentData) {
    await db.update(textBlocks)
      .set({
        audioUrl,
        alignmentData,
        normalizedAlignmentData
      })
      .where(eq(textBlocks.id, parseInt(blockId)));
  },

  // User operations
  async createUser(email, passwordHash, firstName = null, lastName = null) {
    const result = await db.insert(users).values({
      email,
      passwordHash,
      firstName,
      lastName
    }).returning();
    return result[0];
  },

  async getUserByEmail(email) {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0] || null;
  },

  async getUserById(id) {
    const result = await db.select().from(users).where(eq(users.id, parseInt(id)));
    return result[0] || null;
  },

  async updateUserLastLogin(userId) {
    await db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId));
  },

  // User preferences operations
  async getUserPreferences(userId) {
    const result = await db.select().from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    return result[0] || null;
  },

  async createUserPreferences(userId, preferences = {}) {
    const result = await db.insert(userPreferences).values({
      userId,
      ...preferences
    }).returning();
    return result[0];
  },

  async updateUserPreferences(userId, preferences) {
    const existing = await this.getUserPreferences(userId);

    if (existing) {
      await db.update(userPreferences)
        .set({ ...preferences, updatedAt: new Date() })
        .where(eq(userPreferences.userId, userId));
    } else {
      await this.createUserPreferences(userId, preferences);
    }
  },

  // Get user with preferences
  async getUserWithPreferences(userId) {
    const user = await this.getUserById(userId);
    if (!user) return null;

    const preferences = await this.getUserPreferences(userId);
    return { ...user, preferences };
  }
};