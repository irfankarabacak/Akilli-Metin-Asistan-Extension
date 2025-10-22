# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2024-01-XX

### Added

#### 🌍 Multi-Language Support (i18n)
- **5 Language Support**: Turkish (TR), English (EN), Spanish (ES), German (DE), French (FR)
- **UI Language Selection**: Choose your preferred interface language from settings
- **Output Language Control**: Select the target language for AI-generated content
- **Auto-Sync Option**: Automatically sync UI and output languages
- **Localized Prompt Templates**: All 6 prompt templates available in all supported languages
- **Fallback Mechanism**: Graceful fallback to Turkish if translation is missing
- **Browser Language Detection**: Automatically detects and sets browser language on first install

#### 🎨 Modern CSS Design System
- **CSS Variables**: 70+ design tokens for colors, typography, spacing, shadows, and transitions
- **Consistent Theming**: Unified color palette across light and dark themes
- **WCAG 2.1 AA Compliance**: Improved contrast ratios for better accessibility
- **Enhanced Dark Theme**: Optimized colors and shadows for dark mode
- **Typography System**: Standardized font sizes, weights, and line heights
- **Spacing System**: Consistent spacing scale throughout the UI
- **Modern Shadows**: Refined shadow system for depth and hierarchy
- **Smooth Transitions**: Optimized animation performance

#### 🔧 Technical Improvements
- **Prompt Template Caching**: Improved performance with template caching
- **Migration System**: Automatic migration for existing users upgrading to v2.0.0
- **Language Preferences Storage**: Persistent language settings across sessions
- **Enhanced Error Handling**: Better error messages for i18n operations

### Changed
- **Manifest Version**: Updated to 2.0.0
- **Default Locale**: Set to Turkish (tr) with multi-language support
- **UI Components**: All text elements now use i18n keys
- **Popup Interface**: Redesigned with language selector and modern styling
- **Content Script**: Updated with localized messages and improved UX
- **Background Service**: Enhanced with i18n management functions

### Improved
- **Performance**: Faster load times with template caching
- **Accessibility**: Better contrast ratios and ARIA labels
- **User Experience**: Smoother animations and transitions
- **Code Quality**: Modular i18n system with clear separation of concerns
- **Maintainability**: Centralized translation management

### Fixed
- CSS variable consistency across themes
- Dark theme color contrast issues
- Responsive design on mobile devices
- Button and control styling edge cases

### Technical Details

#### New Functions
- `getCurrentLocale()`: Get current UI locale
- `setLocale(locale)`: Change UI locale
- `getOutputLocale()`: Get output language preference
- `setOutputLocale(locale)`: Change output language
- `getLocalizedPromptTemplate(templateId, locale)`: Load localized prompt templates
- `getSupportedLocales()`: List all supported languages
- `getLanguageName(locale, targetLocale)`: Get language name in target locale

#### File Structure
```
_locales/
├── tr/
│   ├── messages.json (100+ translation keys)
│   └── prompts.json (6 prompt templates)
├── en/
│   ├── messages.json
│   └── prompts.json
├── es/
│   ├── messages.json
│   └── prompts.json
├── de/
│   ├── messages.json
│   └── prompts.json
└── fr/
    ├── messages.json
    └── prompts.json
```

### Breaking Changes
None. This is a backward-compatible update. Existing users will be automatically migrated to the new version with their preferred language set based on browser locale.

### Migration Notes
- First-time users: Language will be auto-detected from browser settings
- Existing users: Default language will be set based on browser locale
- All existing settings and API keys will be preserved
- Custom prompt templates will be maintained

---

## [1.0.0] - 2024-XX-XX

### Initial Release
- Basic text processing functionality
- Support for multiple AI providers (Pollinations, Groq, OpenAI, Claude, Gemini, Cohere)
- 6 prompt templates for different use cases
- Light and dark theme support
- Processing history
- Custom prompt editing
- Turkish language interface
