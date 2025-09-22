import { createContext, useContext, useState, useEffect } from 'react';

// Dynamic translations loaded from API
const translations = {};
const availableLanguages = [];

// Map language names to codes
const languageCodeMap = {};

const LocalizationContext = createContext();

export const useLocalization = () => {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error('useLocalization must be used within a LocalizationProvider');
  }
  return context;
};

export const LocalizationProvider = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState('English');
  const [isLoading, setIsLoading] = useState(true);

  // Function to load translations for a specific language
  const loadTranslationsForLanguage = async (languageName) => {
    // Initialize languageCode as null to avoid temporal dead zone issues
    let languageCode = null;
    
    // Try to get language code from the map first
    if (languageCodeMap[languageName]) {
      languageCode = languageCodeMap[languageName];
    } else {
      // Check if languageName is actually a language code like 'en' or 'da'
      const languageByCode = availableLanguages.find(l => l.code === languageName);
      if (languageByCode) {
        languageCode = languageName;
        console.log(`🔄 Treating '${languageName}' as language code, mapped to '${languageByCode.name}'`);
      } else {
        console.warn(`No code found for language: ${languageName}`);
        return;
      }
    }

    const response = await fetch(`/api/localization/translations/${languageCode}`);
    if (response.ok) {
      const data = await response.json();
      
      // Always store translations under the correct language name, not the code
      const actualLanguageName = availableLanguages.find(l => l.code === languageCode)?.name || languageName;
      translations[actualLanguageName] = data.translations;
      console.log(`✅ Loaded translations for ${actualLanguageName} (code: ${languageCode})`);
    } else {
      throw new Error(`Failed to load translations for ${languageName}`);
    }
  };

  // Fallback translations if API fails
  const loadFallbackTranslations = async () => {
    translations['English'] = {
      app: {
        name: "The Magical Everything Reader",
        tagline: "The ultimate reader for people with dyslexia"
      },
      auth: {
        signIn: "Sign In",
        email: "Email",
        password: "Password"
      },
      common: {
        loading: "Loading...",
        error: "An error occurred"
      }
    };

    if (!availableLanguages.some(l => l.name === 'English')) {
      availableLanguages.push({ code: 'en', name: 'English', is_active: true });
      languageCodeMap['English'] = 'en';
    }
  };

  // Load available languages and translations on mount
  useEffect(() => {
    const initializeLocalization = async () => {
      try {
        // First, load available languages
        const languagesResponse = await fetch('/api/localization/languages');
        if (languagesResponse.ok) {
          const languagesData = await languagesResponse.json();

          // Clear existing data
          availableLanguages.length = 0;
          Object.keys(languageCodeMap).forEach(key => delete languageCodeMap[key]);

          // Populate available languages
          languagesData.languages.forEach(lang => {
            availableLanguages.push(lang);
            languageCodeMap[lang.name] = lang.code;
          });

          console.log('✅ Loaded available languages:', availableLanguages.map(l => l.name));
        }

        // Determine which language to use
        let targetLanguage = 'English';

        // Try to get from user preferences first
        const token = localStorage.getItem('token');
        if (token) {
          const response = await fetch('/api/auth/preferences', {
            headers: {
              'Authorization': `Bearer ${token}`
            },
            credentials: 'include'
          });

          if (response.ok) {
            const data = await response.json();
            if (data.preferences?.preferredLanguage) {
              targetLanguage = data.preferences.preferredLanguage;
            }
          }
        }

        // Fallback to localStorage
        if (targetLanguage === 'English') {
          const savedLanguage = localStorage.getItem('language');
          if (savedLanguage && availableLanguages.some(l => l.name === savedLanguage)) {
            targetLanguage = savedLanguage;
          } else {
            // Fallback to browser language
            const browserLanguageCode = navigator.language.split('-')[0];
            const browserLanguage = availableLanguages.find(l => l.code === browserLanguageCode);
            if (browserLanguage) {
              targetLanguage = browserLanguage.name;
            }
          }
        }

        // Load translations for the target language
        await loadTranslationsForLanguage(targetLanguage);
        setCurrentLanguage(targetLanguage);

      } catch (error) {
        console.error('Error initializing localization:', error);
        // Fallback to English with default translations
        await loadFallbackTranslations();
        setCurrentLanguage('English');
      } finally {
        setIsLoading(false);
      }
    };

    initializeLocalization();
  }, []);

  // Save language preference
  const changeLanguage = async (newLanguage) => {
    try {
      // Load translations if not already cached
      if (!translations[newLanguage]) {
        console.log(`Loading translations for ${newLanguage}...`);
        await loadTranslationsForLanguage(newLanguage);
      }

      setCurrentLanguage(newLanguage);
      localStorage.setItem('language', newLanguage);

      // Save to user preferences if logged in
      const token = localStorage.getItem('token');
      if (token) {
        await fetch('/api/auth/preferences', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include',
          body: JSON.stringify({ preferredLanguage: newLanguage })
        });
      }
    } catch (error) {
      console.error('Error changing language:', error);
    }
  };

  // Translation function with interpolation support
  const t = (key, params = {}) => {
    const keys = key.split('.');
    let value = translations[currentLanguage];

    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        // Fallback to English if key not found
        value = translations['English'];
        for (const fallbackKey of keys) {
          if (value && typeof value === 'object') {
            value = value[fallbackKey];
          } else {
            console.warn(`Translation key "${key}" not found in ${currentLanguage} or English`);
            return key;
          }
        }
        break;
      }
    }

    if (typeof value !== 'string') {
      console.warn(`Translation key "${key}" is not a string`);
      return key;
    }

    // Handle interpolation (e.g., "Hello {{name}}" with params = {name: "John"})
    return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
      return params[paramKey] !== undefined ? params[paramKey] : match;
    });
  };

  // Get available languages
  const getAvailableLanguages = () => {
    return availableLanguages.map(lang => ({
      code: lang.code,
      name: lang.name
    }));
  };

  // Add new language dynamically
  const addLanguage = (languageName, translationData) => {
    translations[languageName] = translationData;

    // Add to available languages if not already present
    if (!availableLanguages.some(l => l.name === languageName)) {
      const languageCode = languageName.toLowerCase().replace(/\s+/g, '_');
      languageCodeMap[languageName] = languageCode;
      availableLanguages.push({
        code: languageCode,
        name: languageName,
        is_active: true
      });
    }
  };

  const value = {
    currentLanguage,
    changeLanguage,
    t,
    getAvailableLanguages,
    addLanguage,
    isLoading
  };

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
};