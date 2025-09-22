// Migration script to populate database with translations from JSON files
import { db } from './db.js';
import { sql } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrateTranslations() {
  console.log('🌍 Starting translations migration...');

  try {
    // Read JSON translation files
    const enPath = join(__dirname, '../client/src/locales/en.json');
    const daPath = join(__dirname, '../client/src/locales/da.json');

    let enTranslations, daTranslations;

    try {
      enTranslations = JSON.parse(await readFile(enPath, 'utf-8'));
      console.log('✅ English translations loaded');
    } catch (error) {
      console.log('⚠️ English translations file not found, using defaults');
      enTranslations = getDefaultEnglishTranslations();
    }

    try {
      daTranslations = JSON.parse(await readFile(daPath, 'utf-8'));
      console.log('✅ Danish translations loaded');
    } catch (error) {
      console.log('⚠️ Danish translations file not found, using defaults');
      daTranslations = getDefaultDanishTranslations();
    }

    // Get language IDs
    const languages = await db.execute(sql`
      SELECT id, code FROM languages WHERE code IN ('en', 'da')
    `);

    const languageMap = {};
    languages.rows.forEach(lang => {
      languageMap[lang.code] = lang.id;
    });

    console.log('Language IDs:', languageMap);

    // Function to flatten nested objects into dot notation keys
    function flattenObject(obj, prefix = '') {
      const flattened = {};

      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const newKey = prefix ? `${prefix}.${key}` : key;

          if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            Object.assign(flattened, flattenObject(obj[key], newKey));
          } else {
            flattened[newKey] = obj[key];
          }
        }
      }

      return flattened;
    }

    // Flatten the translation objects
    const flatEnTranslations = flattenObject(enTranslations);
    const flatDaTranslations = flattenObject(daTranslations);

    console.log(`Found ${Object.keys(flatEnTranslations).length} English translations`);
    console.log(`Found ${Object.keys(flatDaTranslations).length} Danish translations`);

    // Clear existing translations
    await db.execute(sql`DELETE FROM translations`);
    console.log('✅ Cleared existing translations');

    // Insert English translations
    if (languageMap.en) {
      for (const [key, value] of Object.entries(flatEnTranslations)) {
        await db.execute(sql`
          INSERT INTO translations (language_id, key, value)
          VALUES (${languageMap.en}, ${key}, ${value})
          ON CONFLICT (language_id, key) DO UPDATE SET
            value = ${value},
            updated_at = NOW()
        `);
      }
      console.log(`✅ Inserted ${Object.keys(flatEnTranslations).length} English translations`);
    }

    // Insert Danish translations
    if (languageMap.da) {
      for (const [key, value] of Object.entries(flatDaTranslations)) {
        await db.execute(sql`
          INSERT INTO translations (language_id, key, value)
          VALUES (${languageMap.da}, ${key}, ${value})
          ON CONFLICT (language_id, key) DO UPDATE SET
            value = ${value},
            updated_at = NOW()
        `);
      }
      console.log(`✅ Inserted ${Object.keys(flatDaTranslations).length} Danish translations`);
    }

    // Verify the migration
    const totalTranslations = await db.execute(sql`
      SELECT COUNT(*) as count FROM translations
    `);
    console.log(`✅ Total translations in database: ${totalTranslations.rows[0].count}`);

    console.log('🎉 Translation migration completed successfully!');

  } catch (error) {
    console.error('❌ Translation migration failed:', error);
    process.exit(1);
  }
}

// Default translations if JSON files are not found
function getDefaultEnglishTranslations() {
  return {
    app: {
      name: "The Magical Everything Reader",
      tagline: "The ultimate reader for people with dyslexia"
    },
    auth: {
      signIn: "Sign In",
      signInSubtitle: "Access your dyslexia-friendly reading experience",
      email: "Email",
      password: "Password",
      signingIn: "Signing in...",
      noAccount: "Don't have an account?",
      createAccount: "Create one here"
    },
    common: {
      cancel: "Cancel",
      delete: "Delete",
      done: "Done",
      user: "User",
      home: "Home",
      settings: "Settings",
      later: "Later"
    }
  };
}

function getDefaultDanishTranslations() {
  return {
    app: {
      name: "Den Magiske Alletings Læser",
      tagline: "Den ultimative læser til mennesker med ordblindhed"
    },
    auth: {
      signIn: "Log ind",
      signInSubtitle: "Få adgang til din ordblindhedsvenlige læseoplevelse",
      email: "Email",
      password: "Adgangskode",
      signingIn: "Logger ind...",
      noAccount: "Har du ikke en konto?",
      createAccount: "Opret en her"
    },
    common: {
      cancel: "Annuller",
      delete: "Slet",
      done: "Færdig",
      user: "Bruger",
      home: "Hjem",
      settings: "Indstillinger",
      later: "Senere"
    }
  };
}

// Run the migration
migrateTranslations().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});