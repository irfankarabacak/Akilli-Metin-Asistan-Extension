# 🤖 Smart Text Assistant

> AI-powered Chrome extension to enhance, convert, and summarize selected text with multi-language support

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://chrome.google.com/webstore)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://github.com/irfankarabacak/Akilli-Metin-Asistan-Extension)
[![Version](https://img.shields.io/badge/Version-2.0.0-success?style=for-the-badge)](https://github.com/irfankarabacak/Akilli-Metin-Asistan-Extension)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

---

## ✨ Features

### 🎯 Core Functionality
- **📝 Text Enhancement** - Improve grammar, style, and flow
- **💡 Prompt Conversion** - Transform text into AI-optimized prompts
- **📊 Summarization** - Condense long texts into key points
- **🎨 Custom Instructions** - Add specific requirements to any operation

### 🌍 Multi-Language Support
**5 Languages Available:**
- 🇹🇷 Turkish (Türkçe)
- 🇺🇸 English
- 🇪🇸 Spanish (Español)
- 🇩🇪 German (Deutsch)
- 🇫🇷 French (Français)

**Language Features:**
- Separate UI and output language selection
- Automatic language synchronization
- Localized prompt templates for each language
- Browser language auto-detection

### 🎨 Modern Design
- **🌙 Dark/Light Theme** - Seamless theme switching
- **🎭 Smooth Animations** - Polished user experience
- **📱 Responsive Design** - Works on all screen sizes

### ⚡ Performance
- **Fast Processing** - Optimized AI calls with retry logic
- **Template Caching** - Instant prompt loading
- **History Tracking** - Last 20 operations saved
- **Error Handling** - Comprehensive error messages

---

## 🚀 Quick Start

### Installation

#### From Chrome Web Store (Recommended)
1. Visit [Chrome Web Store](#) (link coming soon)
2. Click "Add to Chrome"
3. Start using immediately!

#### Manual Installation
```bash
# Clone the repository
git clone https://github.com/irfankarabacak/Akilli-Metin-Asistan-Extension.git

# Navigate to chrome://extensions/
# Enable "Developer mode"
# Click "Load unpacked" and select the extension folder
```

### Basic Usage

1. **Select Text** - Highlight any text on a webpage
2. **Click ✨ Button** - The floating button appears automatically
3. **Choose Action** - Improve, Convert to Prompt, or Summarize
4. **Select Language** - Choose your desired output language
5. **Get Results** - AI processes your text instantly

---

## 🔑 AI Providers

### 🆓 Free Options
| Provider | Speed | Quality | Limits |
|----------|-------|---------|--------|
| **Pollinations AI** | ⚡⚡⚡ | ⭐⭐⭐ | None (Default) |
| **Groq** | ⚡⚡⚡ | ⭐⭐⭐⭐ | 30 req/min |
| **Google Gemini** | ⚡⚡ | ⭐⭐⭐⭐ | 15 req/min |

### 💰 Premium Options
| Provider | Models | Get API Key |
|----------|--------|-------------|
| **OpenAI** | GPT-4o-mini, GPT-4 | [Get Key](https://platform.openai.com/api-keys) |
| **Claude** | Claude 3.5 Haiku | [Get Key](https://console.anthropic.com/) |
| **Cohere** | Command | [Get Key](https://dashboard.cohere.com/) |

### 🔧 Custom API
- Use your own OpenAI-compatible endpoint
- Full control over model and parameters
- Perfect for self-hosted solutions

---

## 📖 Documentation

### Configuration

#### Setting Up AI Provider
1. Click extension icon in Chrome toolbar
2. Go to **API Settings** tab
3. Select your preferred provider
4. Enter API key (if required)
5. Test connection

#### Language Settings
1. Open extension popup
2. Go to **General** tab
3. Select **UI Language** for interface
4. Choose **Output Language** for AI responses
5. Enable auto-sync if desired

#### Customizing Prompts
1. Navigate to **Prompts** tab
2. Select a template to edit
3. Modify the prompt text
4. Save changes
5. Reset to default anytime

### Advanced Features

#### Processing Styles
- **Stay Faithful** - Minimal changes, preserve original meaning
- **Enhance with AI** - More creative improvements

#### History Management
- View last 20 operations
- Copy results with one click
- Clear history anytime

---

## 🔒 Privacy & Security

- ✅ **Encrypted Storage** - API keys are encrypted locally
- ✅ **No Tracking** - Zero analytics or data collection
- ✅ **HTTPS Only** - All API calls use secure connections
- ✅ **Minimal Permissions** - Only `activeTab` and `storage`
- ✅ **Open Source** - Full transparency

---

## 🛠️ Development

### Tech Stack
- **Vanilla JavaScript** - No frameworks, pure ES6+
- **Chrome Extension API** - Manifest V3
- **CSS Variables** - 70+ design tokens
- **i18n API** - Built-in localization

### Project Structure
```
smart-text-assistant/
├── _locales/          # Translations (5 languages)
│   ├── tr/           # Turkish
│   ├── en/           # English
│   ├── es/           # Spanish
│   ├── de/           # German
│   └── fr/           # French
├── background/        # Service worker
├── content/          # Content scripts
├── popup/            # Extension popup
├── icons/            # Extension icons
└── manifest.json     # Extension manifest
```

### Building from Source
```bash
# Clone repository
git clone https://github.com/irfankarabacak/Akilli-Metin-Asistan-Extension.git
cd Akilli-Metin-Asistan-Extension

# No build step required - pure JavaScript!
# Load directly in Chrome as unpacked extension
```

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Reporting Issues
- 🐛 [Report a bug](https://github.com/irfankarabacak/Akilli-Metin-Asistan-Extension/issues)
- 💡 [Request a feature](https://github.com/irfankarabacak/Akilli-Metin-Asistan-Extension/issues)
- 📖 [Improve documentation](https://github.com/irfankarabacak/Akilli-Metin-Asistan-Extension/issues)

### Pull Requests
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Translation
Help us add more languages! Check out the [Translation Guide](CONTRIBUTING.md#translations).

---

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **AI Providers** - Pollinations, Groq, OpenAI, Anthropic, Google, Cohere
- **Icons** - Custom designed for this extension
- **Community** - Thanks to all contributors and users!

---

## 📧 Contact

**Developer:** İrfan Karabacak

[![GitHub](https://img.shields.io/badge/GitHub-Profile-181717?style=for-the-badge&logo=github)](https://github.com/irfankarabacak)
[![Issues](https://img.shields.io/badge/Issues-Report-EA4335?style=for-the-badge&logo=github&logoColor=white)](https://github.com/irfankarabacak/Akilli-Metin-Asistan-Extension/issues)

---

<div align="center">

### ⭐ Star this project if you find it useful!

[![GitHub stars](https://img.shields.io/github/stars/irfankarabacak/Akilli-Metin-Asistan-Extension?style=social)](https://github.com/irfankarabacak/Akilli-Metin-Asistan-Extension)
[![GitHub forks](https://img.shields.io/github/forks/irfankarabacak/Akilli-Metin-Asistan-Extension?style=social)](https://github.com/irfankarabacak/Akilli-Metin-Asistan-Extension/fork)

**Made with ❤️ and ☕**

</div>
