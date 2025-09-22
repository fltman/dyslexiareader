import { createContext, useContext, useState, useEffect } from 'react';

// Import language files
import enTranslations from '../locales/en.json';
import daTranslations from '../locales/da.json';

const translations = {
  en: enTranslations,
  da: daTranslations
};

const LocalizationContext = createContext();

export const useLocalization = () => {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error('useLocalization must be used within a LocalizationProvider');
  }
  return context;
};

export const LocalizationProvider = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState('en');
  const [isLoading, setIsLoading] = useState(true);

  // Load language preference on mount
  useEffect(() => {
    const loadLanguagePreference = async () => {
      try {
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
            if (data.preferences?.language) {
              setCurrentLanguage(data.preferences.language);
              setIsLoading(false);
              return;
            }
          }
        }

        // Fallback to localStorage
        const savedLanguage = localStorage.getItem('language');
        if (savedLanguage && translations[savedLanguage]) {
          setCurrentLanguage(savedLanguage);
        } else {
          // Fallback to browser language
          const browserLanguage = navigator.language.split('-')[0];
          if (translations[browserLanguage]) {
            setCurrentLanguage(browserLanguage);
          }
        }
      } catch (error) {
        console.error('Error loading language preference:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLanguagePreference();
  }, []);

  // Save language preference
  const changeLanguage = async (newLanguage) => {
    if (!translations[newLanguage]) {
      console.error(`Language ${newLanguage} not supported`);
      return;
    }

    setCurrentLanguage(newLanguage);
    localStorage.setItem('language', newLanguage);

    // Save to user preferences if logged in
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await fetch('/api/auth/preferences', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include',
          body: JSON.stringify({ language: newLanguage })
        });
      }
    } catch (error) {
      console.error('Error saving language preference:', error);
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
        value = translations.en;
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
    return Object.keys(translations).map(code => ({
      code,
      name: t(`languages.${code}`)
    }));
  };

  const value = {
    currentLanguage,
    changeLanguage,
    t,
    getAvailableLanguages,
    isLoading
  };

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
};