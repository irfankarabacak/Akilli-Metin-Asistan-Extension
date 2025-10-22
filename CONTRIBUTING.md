# Contributing to Smart Text Assistant

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## 🚀 Getting Started

### Prerequisites
- Google Chrome browser
- Basic knowledge of JavaScript, HTML, and CSS
- Familiarity with Chrome Extension APIs

### Development Setup
1. Fork the repository
2. Clone your fork: `git clone https://github.com/irfankarabacak/Akilli-Metin-Asistan-Extension.git`
3. Load the extension in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension directory

## 📝 How to Contribute

### Reporting Bugs
- Use the GitHub issue tracker
- Check if the issue already exists
- Provide detailed steps to reproduce
- Include browser version and extension version
- Add screenshots if applicable

### Suggesting Features
- Open a GitHub issue with the "enhancement" label
- Describe the feature and its benefits
- Explain use cases
- Consider implementation complexity

### Code Contributions

#### Coding Standards
- Use ES6+ JavaScript features
- Follow existing code style
- Add comments for complex logic
- Keep functions small and focused
- Use meaningful variable names

#### Commit Messages
Follow conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Maintenance tasks

Example: `feat: add Spanish language support`

#### Pull Request Process
1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Update documentation if needed
5. Submit PR with clear description
6. Wait for review and address feedback

## 🌍 Translations

### Adding a New Language

1. **Create locale folder:**
   ```
   _locales/[language_code]/
   ```

2. **Add messages.json:**
   - Copy from `_locales/en/messages.json`
   - Translate all strings
   - Keep placeholders intact

3. **Add prompts.json:**
   - Copy from `_locales/en/prompts.json`
   - Translate prompt templates
   - Maintain formatting

4. **Test thoroughly:**
   - Switch to new language
   - Test all features
   - Check for text overflow

### Translation Guidelines
- Use natural, conversational language
- Keep technical terms consistent
- Respect cultural differences
- Test on actual devices
- Maintain tone and style

## 🧪 Testing

### Manual Testing Checklist
- [ ] Text selection and button appearance
- [ ] All three actions (Improve, Convert, Summarize)
- [ ] Language switching
- [ ] Theme switching
- [ ] API provider switching
- [ ] History functionality
- [ ] Prompt customization
- [ ] Error handling

### Browser Testing
- Test on latest Chrome version
- Test on Chromium-based browsers (Edge, Brave)
- Check responsive design

## 📚 Documentation

### Code Documentation
- Add JSDoc comments for functions
- Explain complex algorithms
- Document API interactions
- Keep comments up-to-date

### User Documentation
- Update README.md for new features
- Add screenshots/GIFs for visual features
- Update CHANGELOG.md
- Keep language consistent

## 🎨 Design Guidelines

### UI/UX Principles
- Keep it simple and intuitive
- Maintain consistency
- Ensure accessibility (WCAG 2.1 AA)
- Test with different themes
- Consider mobile viewports

### CSS Standards
- Use CSS variables
- Follow BEM naming convention
- Keep specificity low
- Avoid !important
- Use flexbox/grid for layouts

## 🔒 Security

### Security Best Practices
- Never commit API keys
- Sanitize user inputs
- Use HTTPS for all requests
- Follow Chrome security guidelines
- Report security issues privately

## 📋 Code Review

### What We Look For
- Code quality and readability
- Test coverage
- Documentation
- Performance impact
- Security considerations
- Accessibility compliance

## 🤔 Questions?

- Open a GitHub Discussion
- Check existing issues
- Read the documentation
- Contact maintainers

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Smart Text Assistant! 🎉
