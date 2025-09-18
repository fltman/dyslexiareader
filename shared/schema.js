// TheReader database schema for Replit PostgreSQL integration
import { pgTable, serial, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const books = pgTable('books', {
  id: serial('id').primaryKey(),
  title: text('title'),
  author: text('author'),
  category: text('category'),
  cover: text('cover'),
  status: text('status').default('processing'),
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
export const booksRelations = relations(books, ({ many }) => ({
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
// export type Book = typeof books.$inferSelect;
// export type InsertBook = typeof books.$inferInsert;
// export type Page = typeof pages.$inferSelect;
// export type InsertPage = typeof pages.$inferInsert;
// export type ScanningSession = typeof scanningSessions.$inferSelect;
// export type InsertScanningSession = typeof scanningSessions.$inferInsert;
// export type TextBlock = typeof textBlocks.$inferSelect;
// export type InsertTextBlock = typeof textBlocks.$inferInsert;