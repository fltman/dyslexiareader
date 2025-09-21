// TheReader database schema for Replit PostgreSQL integration
import { pgTable, serial, text, integer, timestamp, jsonb, boolean, decimal } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  isActive: boolean('is_active').default(true),
  emailVerified: boolean('email_verified').default(false),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// User preferences table for ElevenLabs and other settings
export const userPreferences = pgTable('user_preferences', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  elevenlabsApiKey: text('elevenlabs_api_key'), // User's own API key (encrypted)
  elevenlabsVoiceId: text('elevenlabs_voice_id'),
  elevenlabsAgentId: text('elevenlabs_agent_id'),
  playbackSpeed: decimal('playback_speed', { precision: 3, scale: 2 }).default('1.0'),
  preferredLanguage: text('preferred_language').default('en'),
  dyslexiaMode: boolean('dyslexia_mode').default(true),
  highContrast: boolean('high_contrast').default(false),
  reducedMotion: boolean('reduced_motion').default(false),
  fontSize: text('font_size').default('medium'), // 'small', 'medium', 'large', 'xl'
  lineSpacing: text('line_spacing').default('normal'), // 'tight', 'normal', 'relaxed'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const books = pgTable('books', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: text('title'),
  author: text('author'),
  category: text('category'), // Keep for backward compatibility
  categories: jsonb('categories'), // Array of category strings
  keywords: jsonb('keywords'), // Array of {label, emoji, group} objects
  cover: text('cover'),
  status: text('status').default('processing'),
  fullText: text('full_text'),
  agentId: text('agent_id'),
  knowledgeBaseId: text('knowledge_base_id'),
  isPublic: boolean('is_public').default(false), // For sharing books
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const pages = pgTable('pages', {
  id: serial('id').primaryKey(),
  bookId: integer('book_id').references(() => books.id, { onDelete: 'cascade' }),
  pageNumber: integer('page_number'),
  imagePath: text('image_path'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const scanningSessions = pgTable('scanning_sessions', {
  id: text('id').primaryKey(),
  bookId: integer('book_id').references(() => books.id, { onDelete: 'cascade' }),
  status: text('status').default('active'),
  processingStep: text('processing_step'),
  stepsCompleted: integer('steps_completed').default(0),
  totalSteps: integer('total_steps'),
  processingDetails: text('processing_details'),
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at'),
});

export const textBlocks = pgTable('text_blocks', {
  id: serial('id').primaryKey(),
  pageId: integer('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  ocrText: text('ocr_text'),
  status: text('status').default('pending'),
  audioUrl: text('audio_url'),
  alignmentData: text('alignment_data'),
  normalizedAlignmentData: text('normalized_alignment_data'),
  confidence: integer('confidence'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  books: many(books),
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId],
  }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

export const booksRelations = relations(books, ({ many, one }) => ({
  user: one(users, {
    fields: [books.userId],
    references: [users.id],
  }),
  pages: many(pages),
  scanningSessions: many(scanningSessions),
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
  book: one(books, {
    fields: [pages.bookId],
    references: [books.id],
  }),
  textBlocks: many(textBlocks),
}));

export const sessionsRelations = relations(scanningSessions, ({ one }) => ({
  book: one(books, {
    fields: [scanningSessions.bookId],
    references: [books.id],
  }),
}));

export const textBlocksRelations = relations(textBlocks, ({ one }) => ({
  page: one(pages, {
    fields: [textBlocks.pageId],
    references: [pages.id],
  }),
}));

// Export types (commented out for JavaScript compatibility)
// export type User = typeof users.$inferSelect;
// export type InsertUser = typeof users.$inferInsert;
// export type UserPreferences = typeof userPreferences.$inferSelect;
// export type InsertUserPreferences = typeof userPreferences.$inferInsert;
// export type Book = typeof books.$inferSelect;
// export type InsertBook = typeof books.$inferInsert;
// export type Page = typeof pages.$inferSelect;
// export type InsertPage = typeof pages.$inferInsert;
// export type ScanningSession = typeof scanningSessions.$inferSelect;
// export type InsertScanningSession = typeof scanningSessions.$inferInsert;
// export type TextBlock = typeof textBlocks.$inferSelect;
// export type InsertTextBlock = typeof textBlocks.$inferInsert;