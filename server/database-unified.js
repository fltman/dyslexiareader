import sqlite3 from 'sqlite3';
import pkg from 'pg';
const { Pool } = pkg;
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const USE_POSTGRES = isProduction || process.env.USE_POSTGRES === 'true';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://username:password@server.postgres.database.azure.com:5432/database?sslmode=require';

let db = null;
let pool = null;

// Initialize database connection
if (USE_POSTGRES) {
    pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });
    console.log('Using PostgreSQL database');
} else {
    const dbPath = join(__dirname, '..', 'database.sqlite');
    db = new sqlite3.Database(dbPath);
    console.log('Using SQLite database');
}

export async function initializeDatabase() {
    if (USE_POSTGRES) {
        return initializePostgreSQL();
    } else {
        return initializeSQLite();
    }
}

function initializeSQLite() {
    return new Promise((resolve, reject) => {
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

            // Scanning sessions table
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

            // Text blocks table
            db.run(`
                CREATE TABLE IF NOT EXISTS text_blocks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    page_id INTEGER NOT NULL,
                    x INTEGER NOT NULL,
                    y INTEGER NOT NULL,
                    width INTEGER NOT NULL,
                    height INTEGER NOT NULL,
                    ocr_text TEXT,
                    status TEXT DEFAULT 'pending',
                    audio_url TEXT,
                    alignment_data TEXT,
                    normalized_alignment_data TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (page_id) REFERENCES pages (id) ON DELETE CASCADE
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

async function initializePostgreSQL() {
    try {
        // Books table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS books (
                id SERIAL PRIMARY KEY,
                title TEXT,
                author TEXT,
                category TEXT,
                cover TEXT,
                status TEXT DEFAULT 'processing',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Pages table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pages (
                id SERIAL PRIMARY KEY,
                book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
                page_number INTEGER,
                image_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Scanning sessions table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS scanning_sessions (
                id TEXT PRIMARY KEY,
                book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP
            )
        `);

        // Text blocks table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS text_blocks (
                id SERIAL PRIMARY KEY,
                page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
                x INTEGER NOT NULL,
                y INTEGER NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                ocr_text TEXT,
                status TEXT DEFAULT 'pending',
                audio_url TEXT,
                alignment_data TEXT,
                normalized_alignment_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('PostgreSQL database initialized successfully');
    } catch (error) {
        console.error('Error initializing PostgreSQL database:', error);
        throw error;
    }
}

export async function runQuery(sql, params = []) {
    if (USE_POSTGRES) {
        // Convert SQLite placeholders (?) to PostgreSQL placeholders ($1, $2, etc.)
        let pgSql = sql;
        let paramIndex = 1;
        pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);

        const result = await pool.query(pgSql, params);
        return result.rows;
    } else {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

export async function runStatement(sql, params = []) {
    if (USE_POSTGRES) {
        // Convert SQLite placeholders (?) to PostgreSQL placeholders ($1, $2, etc.)
        let pgSql = sql;
        let paramIndex = 1;
        pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);

        // Handle INSERT statements to return the ID
        if (pgSql.toUpperCase().includes('INSERT')) {
            pgSql = pgSql + ' RETURNING id';
            const result = await pool.query(pgSql, params);
            return {
                lastInsertRowid: result.rows[0]?.id,
                changes: result.rowCount
            };
        } else {
            const result = await pool.query(pgSql, params);
            return {
                lastInsertRowid: null,
                changes: result.rowCount
            };
        }
    } else {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({
                    lastInsertRowid: this.lastID,
                    changes: this.changes
                });
            });
        });
    }
}

export function getDatabase() {
    return USE_POSTGRES ? pool : db;
}

export { USE_POSTGRES };