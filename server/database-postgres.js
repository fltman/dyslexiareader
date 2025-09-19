import pkg from 'pg';
const { Pool } = pkg;

const isProduction = process.env.NODE_ENV === 'production';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://username:password@server.postgres.database.azure.com:5432/database?sslmode=require';

let pool;

if (isProduction || process.env.USE_POSTGRES) {
    pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });
}

export async function initializeDatabase() {
    if (!pool) {
        console.log('Using SQLite database for development');
        return;
    }

    console.log('Initializing PostgreSQL database...');

    try {
        // Create books table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS books (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                category TEXT,
                cover TEXT,
                status TEXT DEFAULT 'processing',
                agent_id TEXT,
                knowledge_base_id TEXT,
                full_text TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create scan_sessions table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS scan_sessions (
                id TEXT PRIMARY KEY,
                book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create pages table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pages (
                id SERIAL PRIMARY KEY,
                book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
                image_path TEXT NOT NULL,
                page_number INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create text_blocks table
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
    if (!pool) {
        throw new Error('PostgreSQL not available');
    }

    try {
        const result = await pool.query(sql, params);
        return result.rows;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

export async function runStatement(sql, params = []) {
    if (!pool) {
        throw new Error('PostgreSQL not available');
    }

    try {
        const result = await pool.query(sql, params);
        return {
            lastInsertRowid: result.rows[0]?.id,
            changes: result.rowCount
        };
    } catch (error) {
        console.error('Database statement error:', error);
        throw error;
    }
}

export { pool };