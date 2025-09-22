// Migration script for Replit deployment
// Run this script on Replit to update the database schema

import { db } from './db.js';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function migrate() {
  console.log('🚀 Starting database migration...');

  try {
    // Create users table if it doesn't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Users table created/verified');

    // Create user_preferences table if it doesn't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        elevenlabs_api_key TEXT,
        elevenlabs_voice_id TEXT,
        elevenlabs_agent_id TEXT,
        playback_speed DECIMAL(3,2) DEFAULT 1.0,
        preferred_language TEXT DEFAULT 'en',
        dyslexia_mode BOOLEAN DEFAULT true,
        high_contrast BOOLEAN DEFAULT false,
        reduced_motion BOOLEAN DEFAULT false,
        font_size TEXT DEFAULT 'medium',
        line_spacing TEXT DEFAULT 'normal',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ User preferences table created/verified');

    // Create languages table for storing available languages
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS languages (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Languages table created/verified');

    // Create translations table for storing localization strings
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS translations (
        id SERIAL PRIMARY KEY,
        language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(language_id, key)
      )
    `);
    console.log('✅ Translations table created/verified');

    // Add userId column to books table if it doesn't exist
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'books' AND column_name = 'user_id'
        ) THEN
          ALTER TABLE books ADD COLUMN user_id INTEGER;
        END IF;
      END $$;
    `);
    console.log('✅ Books table updated with user_id column');

    // Add isPublic column to books table if it doesn't exist
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'books' AND column_name = 'is_public'
        ) THEN
          ALTER TABLE books ADD COLUMN is_public BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);
    console.log('✅ Books table updated with is_public column');

    // Create a default demo user for existing books (optional)
    const demoUserEmail = 'demo@thereader.app';
    const demoPassword = 'demopassword';
    const demoPasswordHash = await bcrypt.hash(demoPassword, 10);

    const demoUserResult = await db.execute(sql`
      INSERT INTO users (email, password_hash, first_name, last_name)
      VALUES (${demoUserEmail}, ${demoPasswordHash}, 'Demo', 'User')
      ON CONFLICT (email) DO UPDATE SET password_hash = ${demoPasswordHash}, updated_at = NOW()
      RETURNING id
    `);

    let demoUserId;
    if (demoUserResult.rows && demoUserResult.rows.length > 0) {
      demoUserId = demoUserResult.rows[0].id;
      console.log(`✅ Demo user created/verified with ID: ${demoUserId}`);

      // Assign existing books without user_id to demo user
      await db.execute(sql`
        UPDATE books
        SET user_id = ${demoUserId}
        WHERE user_id IS NULL
      `);
      console.log('✅ Existing books assigned to demo user');

      // Create default preferences for demo user
      await db.execute(sql`
        INSERT INTO user_preferences (user_id)
        VALUES (${demoUserId})
        ON CONFLICT DO NOTHING
      `);
      console.log('✅ Demo user preferences created');
    }

    // Initialize default languages
    await db.execute(sql`
      INSERT INTO languages (code, name)
      VALUES ('en', 'English'), ('da', 'Dansk')
      ON CONFLICT (code) DO NOTHING
    `);
    console.log('✅ Default languages initialized');

    // Create indexes for performance
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_books_user_id ON books(user_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_translations_language_id ON translations(language_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_translations_key ON translations(key);
    `);
    console.log('✅ Indexes created');

    console.log('🎉 Migration completed successfully!');

    // Display migration summary
    const userCount = await db.execute(sql`SELECT COUNT(*) as count FROM users`);
    const bookCount = await db.execute(sql`SELECT COUNT(*) as count FROM books`);

    console.log('\n📊 Migration Summary:');
    console.log(`   - Total users: ${userCount.rows[0].count}`);
    console.log(`   - Total books: ${bookCount.rows[0].count}`);
    console.log('\n🔐 Next steps:');
    console.log('   1. Update environment variables for JWT_SECRET');
    console.log('   2. Restart the server');
    console.log('   3. Users can now register and login!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrate().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});