import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  // Books table
  db.run(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      author TEXT,
      category TEXT,
      cover TEXT,
      status TEXT DEFAULT 'processing',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Pages table
  db.run(`
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER,
      page_number INTEGER,
      image_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
    )
  `);

  // Scanning sessions table (for QR code sessions)
  db.run(`
    CREATE TABLE IF NOT EXISTS scanning_sessions (
      id TEXT PRIMARY KEY,
      book_id INTEGER,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
    )
  `);

  // Text blocks table (for OCR processing)
  db.run(`
    CREATE TABLE IF NOT EXISTS text_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER,
      x INTEGER,
      y INTEGER,
      width INTEGER,
      height INTEGER,
      ocr_text TEXT,
      confidence REAL,
      status TEXT DEFAULT 'pending',
      audio_url TEXT,
      alignment_data TEXT,
      normalized_alignment_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (page_id) REFERENCES pages (id) ON DELETE CASCADE
    )
  `);
});

// Database helper functions
export const dbHelpers = {
  // Get all books
  getAllBooks: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM books ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Get book by ID
  getBookById: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM books WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  // Create new book
  createBook: (title = null, author = null, category = null) => {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO books (title, author, category) VALUES (?, ?, ?)',
        [title, author, category],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },

  // Update book
  updateBook: (id, data) => {
    const fields = Object.keys(data).map(key => `${key} = ?`).join(', ');
    const values = Object.values(data);
    values.push(id);

    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE books SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values,
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  },

  // Get pages for a book
  getBookPages: (bookId) => {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM pages WHERE book_id = ? ORDER BY page_number ASC',
        [bookId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },

  // Add page to book
  addPage: (bookId, pageNumber, imagePath) => {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO pages (book_id, page_number, image_path) VALUES (?, ?, ?)',
        [bookId, pageNumber, imagePath],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },

  // Create scanning session
  createScanningSession: (sessionId, bookId) => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO scanning_sessions (id, book_id, expires_at) VALUES (?, ?, ?)',
        [sessionId, bookId, expiresAt.toISOString()],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },

  // Get scanning session
  getScanningSession: (sessionId) => {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM scanning_sessions WHERE id = ? AND status = "active" AND expires_at > CURRENT_TIMESTAMP',
        [sessionId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  },

  // Close scanning session
  closeScanningSession: (sessionId) => {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE scanning_sessions SET status = "completed" WHERE id = ?',
        [sessionId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  },

  // Clean up empty books (no pages and status = processing)
  cleanupEmptyBooks: () => {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM books WHERE status = "processing" AND id NOT IN (SELECT DISTINCT book_id FROM pages)',
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  },

  // Text block operations
  getTextBlocks: (pageId) => {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM text_blocks WHERE page_id = ? ORDER BY y ASC, x ASC',
        [pageId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },

  createTextBlock: (pageId, x, y, width, height) => {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO text_blocks (page_id, x, y, width, height) VALUES (?, ?, ?, ?, ?)',
        [pageId, x, y, width, height],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },

  updateTextBlock: (id, ocrText, confidence) => {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE text_blocks SET ocr_text = ?, confidence = ?, status = "completed", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [ocrText, confidence, id],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  },

  setTextBlockProcessing: (id) => {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE text_blocks SET status = "processing", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }
};

export default db;