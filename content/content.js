/**
 * Content Script - Fixed Position ile Garantili Çalışma
 * Tema ve i18n desteği ile
 */

//console.log('🚀 Akıllı Metin Asistanı: Content script yüklendi');

let selectionButton = null;
let currentSelection = '';
let processingPopup = null;
let currentTheme = 'light';
let currentLocale = 'tr';

// ============================================================================
// I18N FUNCTIONS
// ============================================================================

// Çeviri cache'i
let translationsCache = {};

/**
 * Çeviri dosyasını yükle
 */
async function loadTranslations(locale) {
  try {
    const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
    const response = await fetch(url);
    const data = await response.json();
    translationsCache = data;
    console.log('Content - Çeviriler yüklendi:', locale);
  } catch (error) {
    console.error('Content - Çeviri yükleme hatası:', error);
  }
}

/**
 * Çeviri mesajını al
 */
function getMessage(key, substitutions) {
  try {
    if (translationsCache[key]) {
      let message = translationsCache[key].message;
      // Substitutions varsa uygula
      if (substitutions && Array.isArray(substitutions)) {
        substitutions.forEach((sub, index) => {
          // Chrome i18n format: $1, $2, $COUNT$ vb.
          const placeholder1 = `$${index + 1}`;
          const placeholderCount = '$COUNT$';
          message = message.replace(placeholder1, sub);
          message = message.replace(placeholderCount, sub);
        });
      }
      return message;
    }
    return key;
  } catch (error) {
    console.warn(`Translation key not found: ${key}`);
    return key;
  }
}

/**
 * Element içeriğini çevir
 */
function translateElement(element, key, substitutions) {
  const translation = getMessage(key, substitutions);
  if (translation && translation !== key) {
    element.textContent = translation;
  }
}

/**
 * Popup'taki tüm elementleri çevir
 */
function applyTranslationsToPopup(popup) {
  // data-i18n attribute'u olan elementleri çevir
  popup.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = getMessage(key);
    if (translation && translation !== key) {
      element.textContent = translation;
    }
  });

  // data-i18n-placeholder attribute'u olan elementleri çevir
  popup.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    const translation = getMessage(key);
    if (translation && translation !== key) {
      element.placeholder = translation;
    }
  });

  // data-i18n-title attribute'u olan elementleri çevir
  popup.querySelectorAll('[data-i18n-title]').forEach(element => {
    const key = element.getAttribute('data-i18n-title');
    const translation = getMessage(key);
    if (translation && translation !== key) {
      element.title = translation;
    }
  });

  // Karakter sayısını da güncelle (dil değiştiğinde)
  const selectedContent = popup.querySelector('#sta-selected-content');
  if (selectedContent) {
    const fullText = selectedContent.getAttribute('data-full-text');
    if (fullText) {
      updateCharacterCount(popup, fullText.length);
    }
  }

  console.log('Content - Popup çevirileri uygulandı');
}

/**
 * Karakter sayısını güncelle
 */
function updateCharacterCount(popup, charCount) {
  const charCountElement = popup.querySelector('#sta-char-count');
  if (charCountElement) {
    const charCountText = getMessage('processing_characters', [charCount.toString()]);
    const limitWarning = charCount > 5000 ? ' ' + getMessage('processing_limitExceeded') : '';
    charCountElement.textContent = `(${charCountText}${limitWarning})`;
  }
}

/**
 * UI dili değiştiğinde çıktı dilini senkronize et
 */
function syncOutputLanguageWithUILocale(locale) {
  if (!processingPopup) return;
  
  const languageSelect = processingPopup.querySelector('#sta-language');
  if (!languageSelect) return;
  
  // UI dilini çıktı diline eşle
  const localeToLanguageMap = {
    'tr': 'Türkçe',
    'en': 'English',
    'es': 'Español',
    'de': 'Deutsch',
    'fr': 'Français'
  };
  
  const targetLanguage = localeToLanguageMap[locale];
  if (targetLanguage) {
    languageSelect.value = targetLanguage;
    console.log('Content - Çıktı dili UI diline senkronize edildi:', locale, '->', targetLanguage);
  }
}

/**
 * Mevcut locale'i yükle
 */
async function loadCurrentLocale() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LOCALE' });
    if (response && response.success) {
      currentLocale = response.locale;
      await loadTranslations(currentLocale);
      console.log('Content - Locale ve çeviriler yüklendi:', currentLocale);
    }
  } catch (error) {
    console.error('loadCurrentLocale error:', error);
    // Fallback: Türkçe yükle
    currentLocale = 'tr';
    await loadTranslations('tr');
  }
}

// Sayfa yüklendiğinde locale'i yükle
(async function initContent() {
  await loadCurrentLocale();
  console.log('Content script hazır, çeviriler yüklendi');
})();

// Locale değişikliklerini dinle
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content - Mesaj alındı:', message.type, message);
  
  if (message.type === 'LOCALE_CHANGED') {
    console.log('Content - Locale değişti:', message.locale);
    currentLocale = message.locale;
    loadTranslations(currentLocale).then(async () => {
      console.log('Content - Yeni çeviriler yüklendi, popup güncelleniyor');
      console.log('Content - processingPopup var mı?', !!processingPopup);
      console.log('Content - translationsCache boyutu:', Object.keys(translationsCache).length);
      // Açık popup varsa çevirileri yeniden uygula
      if (processingPopup) {
        applyTranslationsToPopup(processingPopup);
        updateCharacterCount(processingPopup, currentSelection.length);
        // Aktif provider göstergesini de güncelle
        updateActiveProviderInContentPopup();
        
        // UI dili değiştiğinde çıktı dilini de senkronize et
        syncOutputLanguageWithUILocale(message.locale);
        
        // Prompt görüntüleme ekranı açıksa yenile (forceRefresh=true ile)
        const outputDiv = processingPopup.querySelector('#sta-output');
        if (outputDiv && outputDiv.getAttribute('data-prompt-open') === 'true') {
          console.log('Content - Prompt ekranı açık, yenileniyor...');
          await refreshPromptIfOpen(true);
        }
        
        console.log('Content - Açık popup çevirileri güncellendi');
      }
    });
  }
  
  // Tema değişikliği mesajını dinle
  if (message.type === 'THEME_CHANGED') {
    console.log('Content - Tema değişti:', message.theme);
    currentTheme = message.theme;
    
    // Açık popup varsa temayı uygula
    if (processingPopup) {
      if (message.theme === 'dark') {
        processingPopup.classList.add('sta-dark-theme');
      } else {
        processingPopup.classList.remove('sta-dark-theme');
      }
      console.log('Content - Açık popup\'a tema uygulandı:', message.theme);
    }
  }
});

// Tema Yükleme
async function loadTheme() {
  try {
    const result = await chrome.storage.local.get('theme');
    currentTheme = result.theme || 'light';
    console.log('Content script - Tema yüklendi:', currentTheme);
  } catch (error) {
    console.error('Tema yüklenirken hata:', error);
  }
}

// Tema Uygula (Sadece açık popup varsa)
function applyTheme(theme) {
  currentTheme = theme;

  // Açık popup varsa tema class'ını güncelle
  if (processingPopup) {
    if (theme === 'dark') {
      processingPopup.classList.add('sta-dark-theme');
    } else {
      processingPopup.classList.remove('sta-dark-theme');
    }
  }
}

// Storage değişikliklerini dinle
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.theme) {
    const newTheme = changes.theme.newValue || 'light';
    console.log('Content script - Tema değişti:', currentTheme, '->', newTheme);
    currentTheme = newTheme;
    // Açık popup varsa temayı uygula
    if (processingPopup) {
      console.log('Content script - Açık popup\'a tema uygulanıyor:', newTheme);
      if (newTheme === 'dark') {
        processingPopup.classList.add('sta-dark-theme');
      } else {
        processingPopup.classList.remove('sta-dark-theme');
      }
    } else {
      console.log('Content script - Açık popup yok, tema sadece değişkene kaydedildi');
    }
  }
});

// Sayfa yüklenince temayı yükle
loadTheme();

// Hemen başlat
document.addEventListener('mouseup', handleTextSelection, true);

function handleTextSelection(event) {
  // Kendi elementlerimize tıklandıysa ignore et
  const target = event.target;
  if (target.closest('.sta-popup') || target.closest('.sta-selection-btn') || target.id === 'sta-selection-btn') {
    return;
  }

  // Biraz bekle ki selection tamamlansın
  setTimeout(() => {
    const selectedText = window.getSelection().toString().trim();

    // Popup açıkken seçili metin varsa güncelle, yoksa popup'ı kapat
    if (processingPopup) {
      if (selectedText.length > 3) {
        currentSelection = selectedText;
        updateSelectedTextInPopup(selectedText);
      } else {
        // Seçili metin yok, popup'ı kapat
        processingPopup.remove();
        processingPopup = null;
      }
      return;
    }

    // Popup kapalıyken
    if (selectedText.length > 3) {
      // Yeni metin seçildi, buton göster
      currentSelection = selectedText;

      // Mouse pozisyonunu sakla
      const mouseX = event.clientX;
      const mouseY = event.clientY;

      // Butonu oluştur ve göster
      showButton(mouseX, mouseY);
    } else {
      // Seçili metin yok veya çok kısa, buton varsa kaldır
      if (selectionButton) {
        selectionButton.remove();
        selectionButton = null;
      }
    }
  }, 100);
}

function showButton(x, y) {
  // Önce eski butonu temizle
  if (selectionButton) {
    try {
      selectionButton.remove();
    } catch (e) { }
    selectionButton = null;
  }

  // Yeni buton oluştur
  const btn = document.createElement('div');
  btn.id = 'sta-selection-btn';
  btn.className = 'sta-selection-btn';
  btn.textContent = '✨';
  btn.setAttribute('title', 'Akıllı Metin Asistanı');
  btn.setAttribute('aria-label', 'Metin işleme için Akıllı Metin Asistanını aç');
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');

  // Seçili metnin alanını al
  const selection = window.getSelection();
  let buttonX = x + 5;
  let buttonY = y + 5; // Mouse'un hemen yanında

  // Eğer selection range varsa, seçili alanın yakınına yerleştir
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Seçili metnin alt-sağ köşesinin hemen yanına yerleştir
    buttonX = rect.right + 5;
    buttonY = rect.bottom + 5;

    // Ekran dışına taşma kontrolü
    if (buttonX + 40 > window.innerWidth) {
      buttonX = window.innerWidth - 50; // Sağdan 50px içeride
    }
    if (buttonY + 40 > window.innerHeight) {
      buttonY = rect.top - 45; // Seçili metnin üstüne koy (taşıyorsa)
    }
  }

  // FIXED POSITION kullan - viewport'a göre sabitlenecek
  btn.style.cssText = `
    all: initial !important;
    font-family: system-ui, -apple-system, sans-serif !important;
    position: fixed !important;
    left: ${buttonX}px !important;
    top: ${buttonY}px !important;
    z-index: 2147483647 !important;
    width: 40px !important;
    height: 40px !important;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
    color: white !important;
    border: 2px solid white !important;
    border-radius: 50% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    font-size: 20px !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
    transition: all 0.2s ease !important;
    user-select: none !important;
    pointer-events: auto !important;
  `;

  // Kapatma butonu ekle
  const closeBtn = document.createElement('div');
  closeBtn.className = 'sta-close-btn-selection';
  closeBtn.style.cssText = `
    position: absolute !important;
    top: -6px !important;
    right: -6px !important;
    width: 18px !important;
    height: 18px !important;
    background: #dc3545 !important;
    color: white !important;
    border-radius: 50% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 11px !important;
    font-weight: bold !important;
    cursor: pointer !important;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3) !important;
    z-index: 2147483648 !important;
    border: 1px solid white !important;
  `;
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('title', 'Kapat');

  // Kapatma butonuna tıklama eventi
  closeBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (selectionButton) {
      selectionButton.remove();
      selectionButton = null;
    }
  }, true);

  // Ana butona önce kapatma butonunu ekle
  btn.appendChild(closeBtn);

  // Hover efekti
  btn.addEventListener('mouseenter', function () {
    this.style.transform = 'scale(1.2) rotate(15deg)';
    this.style.boxShadow = '0 12px 30px rgba(102, 126, 234, 0.5)';
  });

  btn.addEventListener('mouseleave', function () {
    this.style.transform = 'scale(1) rotate(0deg)';
    this.style.boxShadow = '0 8px 20px rgba(0,0,0,0.4)';
  });

  // Click handler - kapatma butonuna tıklanmadıysa popup aç
  btn.addEventListener('click', async function (e) {
    // Eğer kapatma butonuna tıklandıysa, popup açma
    if (e.target.classList.contains('sta-close-btn-selection')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    await openPopup();
  }, true);

  // Keyboard navigation
  btn.addEventListener('keydown', async function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      await openPopup();
    } else if (e.key === 'Escape') {
      btn.remove();
      selectionButton = null;
    }
  });

  // DOM'a ekle
  document.body.appendChild(btn);
  selectionButton = btn;
}

async function openPopup() {
  // Çevirilerin yüklendiğinden emin ol
  if (Object.keys(translationsCache).length === 0) {
    console.log('Content - Çeviriler henüz yüklenmemiş, yükleniyor...');
    await loadCurrentLocale();
  }

  // Butonu kaldır
  if (selectionButton) {
    selectionButton.remove();
    selectionButton = null;
  }

  // Eski popup varsa kaldır
  if (processingPopup) {
    processingPopup.remove();
  }

  // Yeni popup oluştur
  const popup = document.createElement('div');
  popup.id = 'sta-processing-popup';
  popup.className = `sta-popup${currentTheme === 'dark' ? ' sta-dark-theme' : ''}`;

  console.log('Content - Çeviri cache durumu:', Object.keys(translationsCache).length, 'anahtar');

  // Basit HTML oluştur - çevirileri sonra uygulayacağız
  popup.innerHTML = `
    <div class="sta-popup-header" id="sta-drag-handle" style="cursor: grab; user-select: none;">
      <span class="sta-popup-title" data-i18n="processing_title">🤖 İşleniyor</span>
      <button class="sta-close-btn" id="sta-close">✕</button>
    </div>
    
    <!-- Global Aktif Provider Göstergesi -->
    <div id="sta-active-provider" style="
      margin: 12px 16px 8px 16px;
      background: rgba(102, 126, 234, 0.95);
      color: white;
      padding: 8px 16px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 700;
      box-shadow: 0 3px 10px rgba(102, 126, 234, 0.4);
      user-select: none;
      border: 2px solid rgba(255, 255, 255, 0.3);
      backdrop-filter: blur(8px);
      text-align: center;
    " data-i18n="processing_loading">🤖 Yükleniyor</div>
    
    <div class="sta-selected-text" id="sta-selected-text">
      <div class="sta-selected-label">
        <span data-i18n="processing_selectedText">📝 Seçili Metin</span> <span id="sta-char-count"></span>
        <button class="sta-expand-btn" id="sta-expand-text" data-i18n="processing_expandAll">Tümünü Göster</button>
      </div>
      <div class="sta-selected-content" id="sta-selected-content" data-full-text="${currentSelection.replace(/"/g, '&quot;')}">${currentSelection.length > 150 ? currentSelection.substring(0, 150) + '...' : currentSelection}</div>
    </div>
    
    <div class="sta-popup-output" id="sta-output">
      <div class="sta-loading" data-i18n="processing_ready">Yapay zeka hazır</div>
    </div>
    
    <div class="sta-popup-controls">
      <div class="sta-action-buttons">
        <button class="sta-btn sta-btn-primary active" data-action="improve" data-i18n="action_improve">Metni İyileştir</button>
        <button class="sta-btn sta-btn-primary" data-action="toPrompt" data-i18n="action_toPrompt">Prompt Haline Getir</button>
        <button class="sta-btn sta-btn-primary" data-action="summarize" data-i18n="action_summarize">Özetle</button>
      </div>
      
      <div class="sta-style-toggle">
        <label data-i18n="style_label">İşleme Stili</label>
        <div class="sta-toggle-group">
          <button class="sta-toggle-btn active" data-style="faithful" data-i18n="style_faithful">Metne Sadık Kal</button>
          <button class="sta-toggle-btn" data-style="enhance" data-i18n="style_enhance">Yapay Zeka ile Geliştir</button>
        </div>
      </div>
      
      <select class="sta-select" id="sta-language">
        <option value="Türkçe" data-i18n="language_turkish">Türkçe</option>
        <option value="English" data-i18n="language_english">English</option>
        <option value="Español" data-i18n="language_spanish">Español</option>
        <option value="Deutsch" data-i18n="language_german">Deutsch</option>
        <option value="Français" data-i18n="language_french">Français</option>
      </select>
      
      <textarea class="sta-textarea" id="sta-instructions" data-i18n-placeholder="placeholder_instructions" placeholder="Ek talimatlar (opsiyonel)"></textarea>
      
      <div class="sta-button-row">
        <button class="sta-btn sta-btn-secondary" id="sta-process" data-i18n="button_process">İşle</button>
        <button class="sta-btn sta-btn-icon" id="sta-view-prompt" data-i18n-title="button_viewPrompt" title="Prompt'u Görüntüle">👁️</button>
      </div>
    </div>
  `;

  // Popup'ı DOM'a ekle
  document.body.appendChild(popup);
  processingPopup = popup;

  // Çevirileri uygula - cache'i kontrol et
  console.log('Content - Çeviri uygulanıyor, cache:', Object.keys(translationsCache).length);
  if (Object.keys(translationsCache).length > 0) {
    applyTranslationsToPopup(popup);
  } else {
    console.warn('Content - Çeviri cache boş! Yeniden yükleniyor...');
    await loadCurrentLocale();
    applyTranslationsToPopup(popup);
  }

  // Aktif provider'ı güncelle (çeviriler yüklendikten sonra)
  await updateActiveProviderInContentPopup();

  // Karakter sayısını güncelle
  updateCharacterCount(popup, currentSelection.length);

  // Çıktı dilini UI diline senkronize et
  syncOutputLanguageWithUILocale(currentLocale);

  // Event listeners
  popup.querySelector('#sta-close').onclick = () => {
    popup.remove();
    processingPopup = null;
  };

  const actionBtns = popup.querySelectorAll('[data-action]');
  actionBtns.forEach(btn => {
    btn.onclick = () => {
      actionBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Eğer prompt düzenleme ekranı açıksa otomatik güncelle
      refreshPromptIfOpen();
    };
  });

  const styleBtns = popup.querySelectorAll('[data-style]');
  styleBtns.forEach(btn => {
    btn.onclick = () => {
      styleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Eğer prompt düzenleme ekranı açıksa otomatik güncelle
      refreshPromptIfOpen();
    };
  });

  popup.querySelector('#sta-process').onclick = processText;
  popup.querySelector('#sta-view-prompt').onclick = viewPrompt;

  // Seçili metin expand/collapse
  let isExpanded = false;
  popup.querySelector('#sta-expand-text').onclick = () => {
    const content = popup.querySelector('#sta-selected-content');
    const btn = popup.querySelector('#sta-expand-text');
    const fullText = content.getAttribute('data-full-text');

    if (!isExpanded) {
      content.textContent = fullText;
      content.style.maxHeight = '300px';
      btn.textContent = '👁️ Küçült';
      isExpanded = true;
    } else {
      content.textContent = fullText.length > 150 ? fullText.substring(0, 150) + '...' : fullText;
      content.style.maxHeight = '100px';
      btn.textContent = '👁️ Tümünü Gör';
      isExpanded = false;
    }
  };


  // Sürüklenebilir yap
  makeDraggable(popup);
}

// Content popup için aktif provider güncelleme
async function updateActiveProviderInContentPopup() {
  if (!processingPopup) return;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_PROVIDER' });
    if (response && response.success) {
      const providerDisplay = processingPopup.querySelector('#sta-active-provider');
      if (providerDisplay) {
        const providerName = getProviderDisplayNameContent(response.activeProvider);
        const activeLabel = getMessage('processing_activeProvider') || 'Active';
        providerDisplay.textContent = `🤖 ${activeLabel}: ${providerName}`;
      }
    }
  } catch (error) {
    //console.error('Aktif provider güncelleme hatası:', error);
  }
}

// Provider display name helper (content için)
function getProviderDisplayNameContent(provider) {
  if (!provider) return 'Varsayılan AI';

  const names = {
    'groq': 'Groq',
    'openai': 'OpenAI',
    'claude': 'Claude',
    'gemini': 'Gemini',
    'cohere': 'Cohere',
    'custom': 'Özel API'
  };
  return names[provider] || provider;
}

// Storage değişikliklerini dinle (API silme durumunda güncelleme)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    // Herhangi bir api_key değişikliği varsa, content popup'ı güncelle
    const apiKeyChanged = Object.keys(changes).some(key => key.startsWith('api_key_'));
    if (apiKeyChanged && processingPopup) {
      updateActiveProviderInContentPopup();
    }
  }
});

// Background'dan gelen aktif sağlayıcı değişimi mesajını dinle
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'PROVIDER_CHANGED') {
    if (processingPopup) {
      updateActiveProviderInContentPopup();
    }
  }
});

// Ayarlar değişikliklerini dinle (sayfa başlığı ayarı için)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.settings) {
    // Sayfa başlığı ayarı değişti, açık prompt varsa yenile
    if (processingPopup) {
      const outputDiv = document.querySelector('#sta-output');
      if (outputDiv && outputDiv.getAttribute('data-prompt-open') === 'true') {
        // Prompt açıksa yenile
        refreshPromptIfOpen();
      }
    }
  }
});

// Popup açıkken seçili metni güncelle
function updateSelectedTextInPopup(newText) {
  if (!processingPopup) return;

  // Prompt ekranı açıksa, kapat ve normal ekrana dön
  const outputDiv = processingPopup.querySelector('#sta-output');
  if (outputDiv && outputDiv.getAttribute('data-prompt-open') === 'true') {
    outputDiv.innerHTML = '<div class="sta-loading">🤖 Yapay zeka hazır</div>';
    outputDiv.removeAttribute('data-prompt-open');
    outputDiv.removeAttribute('data-current-action');
    outputDiv.removeAttribute('data-current-style');
  }

  const selectedContent = processingPopup.querySelector('#sta-selected-content');
  const expandBtn = processingPopup.querySelector('#sta-expand-text');

  if (selectedContent) {
    // Karakter sayısını güncelle
    updateCharacterCount(processingPopup, newText.length);
    
    // Yeni metni güncelle
    selectedContent.setAttribute('data-full-text', newText);

    // Kısa veya uzun metne göre gösterim
    if (newText.length > 150) {
      selectedContent.textContent = newText.substring(0, 150) + '...';
    } else {
      selectedContent.textContent = newText;
    }

    // Expand durumunu sıfırla
    selectedContent.style.maxHeight = '100px';
    if (expandBtn) {
      expandBtn.textContent = '👁️ Tümünü Gör';
    }

    // Görsel feedback (yumuşak fade animasyonu)
    selectedContent.style.opacity = '0.3';
    selectedContent.style.transition = 'opacity 0.4s ease';
    setTimeout(() => {
      selectedContent.style.opacity = '1';
    }, 50);
  }
}

// Popup'ı sürüklenebilir yap
function makeDraggable(element) {
  const handle = element.querySelector('#sta-drag-handle');
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;

  handle.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  function dragStart(e) {
    // Close button'a tıklanırsa ignore et
    if (e.target.closest('.sta-close-btn')) return;

    // Popup'un mevcut pozisyonunu al
    const rect = element.getBoundingClientRect();
    initialX = e.clientX - rect.left;
    initialY = e.clientY - rect.top;

    isDragging = true;
    handle.style.cursor = 'grabbing';
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();

      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      // Sadece minimum sınır kontrol et (2. monitöre geçebilsin)
      // Y ekseninde negatif değer olabilir (yukarı taşma)
      currentY = Math.max(-50, currentY); // En az 50px header görünsün

      // X ekseni serbestte bırak (2. monitör için)
      // Sadece ekran dışına tamamen kaymasını engelle

      element.style.left = currentX + 'px';
      element.style.top = currentY + 'px';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    }
  }

  function dragEnd() {
    isDragging = false;
    handle.style.cursor = 'grab';
  }
}

// Prompt'ı görüntüle ve düzenle (toggle)
async function viewPrompt() {
  const outputDiv = document.querySelector('#sta-output');

  // Eğer prompt ekranı açıksa, kapat (normal ekrana dön)
  if (outputDiv.getAttribute('data-prompt-open') === 'true') {
    outputDiv.innerHTML = '<div class="sta-loading">🤖 Yapay zeka hazır</div>';
    outputDiv.removeAttribute('data-prompt-open');
    outputDiv.removeAttribute('data-current-action');
    outputDiv.removeAttribute('data-current-style');
    return;
  }

  // Prompt kapalıysa, aç
  const mainAction = document.querySelector('[data-action].active').dataset.action;
  const processingStyle = document.querySelector('[data-style].active').dataset.style;
  const targetLanguage = document.querySelector('#sta-language').value;
  const additionalInstructions = document.querySelector('#sta-instructions').value;

  // usePageTitle ayarını kontrol et
  let pageTitle = null;
  try {
    const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (settingsResponse.success && settingsResponse.data.usePageTitle) {
      pageTitle = document.title;
    }
  } catch (error) {
    //console.error('Ayarlar alınamadı, sayfa başlığı kullanılıyor:', error);
    pageTitle = document.title; // Hata durumunda varsayılan
  }

  // Background'dan prompt şablonunu al
  try {
    chrome.runtime.sendMessage({
      type: 'GET_PROMPT_PREVIEW',
      data: {
        mainAction,
        processingStyle,
        selectedText: currentSelection,
        pageTitle,
        additionalInstructions,
        targetLanguage
      }
    }).then(response => {
      if (response && response.success) {
        showEditablePrompt(response.data.prompt, mainAction, processingStyle);
      } else {
        // Inline hata gösterimi
        const outputDiv = document.querySelector('#sta-output');
        const errorMsg = response?.error || 'Bilinmeyen hata';
        outputDiv.innerHTML = `
          <div style="
            padding: 24px;
            text-align: center;
            background: linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%);
            border-radius: 12px;
            border: 2px solid #ffc9c9;
            animation: fadeInUp 0.3s ease-out;
          ">
            <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
            <h3 style="margin: 0 0 8px 0; color: #dc3545; font-size: 16px; font-weight: 600;">İşlem Başarısız</h3>
            <p style="color: #721c24; margin: 0; font-size: 14px; line-height: 1.5;">${errorMsg}</p>
          </div>
        `;
        // Hata mesajını 10 saniye sonra tamamen temizle
        setTimeout(() => {
          outputDiv.innerHTML = '<div class="sta-loading">🤖 Yapay zeka hazır</div>';
          outputDiv.removeAttribute('style');
        }, 10000);
      }
    }).catch(error => {
      //console.error('Extension context hatası:', error);
      const outputDiv = document.querySelector('#sta-output');
      outputDiv.innerHTML = '<div style="color: #dc3545; padding: 20px; text-align: center;">⚠️ Eklenti yeniden yüklendi.<br><br><strong>Lütfen sayfayı yenileyin (F5)</strong></div>';
    });
  } catch (error) {
    //console.error('Runtime hatası:', error);
    const outputDiv = document.querySelector('#sta-output');
    outputDiv.innerHTML = '<div style="color: #dc3545; padding: 20px; text-align: center;">⚠️ Eklenti bağlantısı koptu.<br><br><strong>Lütfen sayfayı yenileyin (F5)</strong></div>';
  }
}

// Düzenlenebilir prompt göster
function showEditablePrompt(promptText, mainAction, processingStyle) {
  const outputDiv = document.querySelector('#sta-output');

  outputDiv.innerHTML = '';

  // Prompt düzenleme ekranının açık olduğunu işaretle
  outputDiv.setAttribute('data-prompt-open', 'true');
  outputDiv.setAttribute('data-current-action', mainAction);
  outputDiv.setAttribute('data-current-style', processingStyle);

  // Header
  const header = document.createElement('div');
  header.className = 'sta-prompt-header';
  header.textContent = '📜 Gönderilecek Prompt';
  outputDiv.appendChild(header);

  // Düzenlenebilir textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'sta-prompt-editor';
  textarea.value = promptText;
  textarea.readOnly = true;
  outputDiv.appendChild(textarea);

  // Buton container
  const btnContainer = document.createElement('div');
  btnContainer.className = 'sta-prompt-buttons';

  // Düzenle butonu
  const editBtn = document.createElement('button');
  editBtn.className = 'sta-prompt-btn sta-edit-btn';
  editBtn.textContent = '✏️ Düzenle';
  editBtn.onclick = () => {
    textarea.readOnly = false;
    textarea.focus();
    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
    resetBtn.style.display = 'inline-block';
  };
  btnContainer.appendChild(editBtn);

  // Kaydet butonu
  const saveBtn = document.createElement('button');
  saveBtn.className = 'sta-prompt-btn sta-save-btn';
  saveBtn.textContent = '💾 Kaydet';
  saveBtn.style.display = 'none';
  saveBtn.onclick = () => showSaveModal(textarea.value, mainAction, processingStyle, editBtn, saveBtn, resetBtn, textarea);
  btnContainer.appendChild(saveBtn);

  // Varsayılana Dön butonu
  const resetBtn = document.createElement('button');
  resetBtn.className = 'sta-prompt-btn sta-reset-btn';
  resetBtn.textContent = '🔄 Varsayılana Dön';
  resetBtn.style.display = 'none';
  resetBtn.onclick = () => resetToDefault(mainAction, processingStyle, textarea, editBtn, saveBtn, resetBtn);
  btnContainer.appendChild(resetBtn);

  // Kopyala butonu
  const copyBtn = document.createElement('button');
  copyBtn.className = 'sta-prompt-btn sta-copy-btn';
  copyBtn.textContent = '📋 Kopyala';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(textarea.value);
    copyBtn.textContent = '✓ Kopyalandı!';
    setTimeout(() => copyBtn.textContent = '📋 Kopyala', 2000);
  };
  btnContainer.appendChild(copyBtn);

  outputDiv.appendChild(btnContainer);
}

// Prompt düzenleme ekranını otomatik yenile (stil/fonksiyon değiştiyse)
async function refreshPromptIfOpen(forceRefresh = false) {
  const outputDiv = document.querySelector('#sta-output');
  if (!outputDiv || outputDiv.getAttribute('data-prompt-open') !== 'true') {
    return; // Prompt ekranı açık değil
  }

  // Mevcut seçimleri al
  const mainAction = document.querySelector('[data-action].active').dataset.action;
  const processingStyle = document.querySelector('[data-style].active').dataset.style;

  // Eğer değişiklik yoksa ve zorla yenileme yoksa çık
  const currentAction = outputDiv.getAttribute('data-current-action');
  const currentStyle = outputDiv.getAttribute('data-current-style');
  if (!forceRefresh && currentAction === mainAction && currentStyle === processingStyle) {
    return; // Değişiklik yok
  }

  // Yeni prompt'u getir
  const targetLanguage = document.querySelector('#sta-language').value;
  const additionalInstructions = document.querySelector('#sta-instructions').value;

  // usePageTitle ayarını kontrol et
  let pageTitle = null;
  try {
    const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (settingsResponse.success && settingsResponse.data.usePageTitle) {
      pageTitle = document.title;
    }
  } catch (error) {
    //console.error('Ayarlar alınamadı, sayfa başlığı kullanılıyor:', error);
    pageTitle = document.title; // Hata durumunda varsayılan
  }

  chrome.runtime.sendMessage({
    type: 'GET_PROMPT_PREVIEW',
    data: {
      mainAction,
      processingStyle,
      selectedText: currentSelection,
      pageTitle,
      additionalInstructions,
      targetLanguage
    }
  }).then(response => {
    if (response && response.success) {
      // Prompt düzenleme ekranını güncelle
      showEditablePrompt(response.data.prompt, mainAction, processingStyle);
    }
  }).catch(error => {
    //console.error('Prompt yenileme hatası:', error);
  });
}

async function processText() {
  const mainAction = document.querySelector('[data-action].active').dataset.action;
  const processingStyle = document.querySelector('[data-style].active').dataset.style;
  const targetLanguage = document.querySelector('#sta-language').value;
  const additionalInstructions = document.querySelector('#sta-instructions').value;

  const outputDiv = document.querySelector('#sta-output');

  // Metin uzunluk kontrolü - sadece ücretsiz AI için
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_PROVIDER' });
    const activeProvider = response?.activeProvider;

    // Sadece ücretsiz Pollinations AI için limit uygula
    if (!activeProvider && currentSelection.length > 5000) {
      outputDiv.innerHTML = `
        <div style="padding: 20px; text-align: center; line-height: 1.6;">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <h3 style="margin: 0 0 12px 0; color: #ff6b35;">Metin Çok Uzun</h3>
          <p style="color: #495057; margin-bottom: 16px;">
            Seçili metin <strong>${currentSelection.length}</strong> karakter uzunluğunda.<br>
            Ücretsiz AI için maksimum <strong>5000</strong> karakter kabul ediliyor.
          </p>
          <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin-bottom: 12px; text-align: left;">
            <strong style="color: #1976d2;">🚀 Çözüm:</strong><br>
            <small style="color: #495057;">
              • API anahtarı ekleyerek sınırsız metin işleyin<br>
              • <a href="https://makersuite.google.com/app/apikey" target="_blank" style="color: #667eea;">Google Gemini (Ücretsiz)</a><br>
              • <a href="https://console.groq.com/keys" target="_blank" style="color: #667eea;">Groq (Ücretsiz)</a>
            </small>
          </div>
          <div style="background: #fff3cd; padding: 12px; border-radius: 8px; margin-bottom: 12px; text-align: left;">
            <strong style="color: #856404;">💡 Alternatif:</strong><br>
            <small style="color: #495057;">
              • Metni 5000 karakterden kısa tutun<br>
              • Sadece önemli kısımları seçin
            </small>
          </div>
          <div style="text-align: center; margin-top: 16px;">
            <button onclick="chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }); this.parentElement.parentElement.innerHTML='<div class=\\"sta-loading\\">🔑 API ayarları açılıyor...</div>'" 
                    style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 12px 24px; border-radius: 10px; cursor: pointer; font-weight: 600;">
              🔑 API Anahtarı Ekle
            </button>
          </div>
        </div>
      `;
      return;
    }
  } catch (error) {
    // Hata durumunda devam et
  }

  outputDiv.innerHTML = '<div class="sta-loading">🤖 Yapay zeka çalışıyor...</div>';

  // usePageTitle ayarını kontrol et
  let pageTitle = null;
  try {
    const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (settingsResponse.success && settingsResponse.data.usePageTitle) {
      pageTitle = document.title;
    }
  } catch (error) {
    //console.error('Ayarlar alınamadı, sayfa başlığı kullanılıyor:', error);
    pageTitle = document.title; // Hata durumunda varsayılan
  }

  try {
    // Extension context kontrolü
    if (!chrome.runtime?.id) {
      throw new Error('Eklenti yeniden yüklendi. Sayfayı yenileyin (F5).');
    }

    const response = await chrome.runtime.sendMessage({
      type: 'PROCESS_TEXT',
      data: {
        mainAction,
        processingStyle,
        selectedText: currentSelection,
        pageTitle,
        additionalInstructions,
        targetLanguage
      }
    });

    if (response && response.success) {
      // Sonucu temizle - başındaki/sonundaki gereksiz etiketleri kaldır
      let cleanedResult = response.data.result.trim();

      // Tüm olası etiketleri kaldır (başta ve tekrarlı)
      cleanedResult = cleanedResult
        .replace(/^(Düzeltilmiş|Geliştirilmiş|Yeniden düzenlenmiş|Sonuç|Metin|Prompt|Cevap|Yanıt)(\s*:)?\s*/gi, '')
        .replace(/^(Here is|Here's|Elbette|Tabii ki|Tabii|Tabıı|Hayır|Evet|İşte|Bunu yapabilirim).*?[:.]\s*/gi, '')
        .replace(/^["-]+\s*/g, '') // Baştaki tırnak/çizgi
        .replace(/\s*["-]+$/g, '') // Sondaki tırnak/çizgi
        .replace(/^```[a-z]*\s*/gi, '') // Baştaki code block
        .replace(/\s*```$/gi, '') // Sondaki code block
        .replace(/^\*\*.*?\*\*\s*/gi, '') // Baştaki bold işaretleri
        .trim();

      // Sonuç container'ı oluştur
      outputDiv.innerHTML = '';

      const resultText = document.createElement('div');
      resultText.className = 'sta-result-text';
      resultText.textContent = cleanedResult;
      outputDiv.appendChild(resultText);

      // Buton container'ı
      const btnContainer = document.createElement('div');
      btnContainer.className = 'sta-button-container';

      // Kopyala butonu
      const copyBtn = document.createElement('button');
      copyBtn.textContent = '📋 Kopyala';
      copyBtn.className = 'sta-copy-btn';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(cleanedResult);
        copyBtn.textContent = '✓ Kopyalandı!';
        copyBtn.style.background = '#28a745';
        setTimeout(() => {
          copyBtn.textContent = '📋 Kopyala';
          copyBtn.style.background = '';
        }, 2000);
      };
      btnContainer.appendChild(copyBtn);

      // Yeniden İşle butonu
      const retryBtn = document.createElement('button');
      retryBtn.textContent = '🔄 Yeniden İşle';
      retryBtn.className = 'sta-retry-btn';
      retryBtn.onclick = () => processText();
      btnContainer.appendChild(retryBtn);

      outputDiv.appendChild(btnContainer);
    } else {
      const errorMsg = response?.error || 'Bilinmeyen hata';

      // API anahtarı hatası ise özel gösterim
      if (errorMsg.includes('API Anahtarı Gerekli') || errorMsg.includes('🔑')) {
        outputDiv.innerHTML = `
          <div style="padding: 20px; text-align: center; line-height: 1.6;">
            <div style="font-size: 48px; margin-bottom: 16px;">🔑</div>
            <h3 style="margin: 0 0 12px 0; color: #667eea;">API Anahtarı Gerekli</h3>
            <p style="color: #495057; margin-bottom: 16px;">Ücretsiz AI kullanmak için bir API anahtarı ekleyin:</p>
            
            <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin-bottom: 12px; text-align: left;">
              <strong style="color: #1976d2;">🌟 ÖNERİLEN: Google Gemini (ÜCRETSIZ)</strong><br>
              <small style="color: #495057;">1. <a href="https://makersuite.google.com/app/apikey" target="_blank" style="color: #667eea;">API Key al</a><br>
              2. Eklenti simgesine tıkla<br>
              3. "API Ayarları" > Gemini seç > Kaydet</small>
            </div>
            
            <button id="sta-open-settings" class="sta-open-settings-btn" 
                    style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 12px 24px; border-radius: 10px; cursor: pointer; font-weight: 600;">
              ⚙️ API Ayarlarını Aç
            </button>
          </div>
        `;

        // Event listener ekle
        setTimeout(() => {
          const settingsBtn = outputDiv.querySelector('#sta-open-settings');
          if (settingsBtn) {
            settingsBtn.onclick = () => {
              // Extension popup'ı aç
              chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
            };
          }
        }, 100);
      } else {
        // Metin uzunluğu hatası kontrolü
        if (errorMsg.includes('exceeds maximum length') || errorMsg.includes('Input text exceeds')) {
          outputDiv.innerHTML = `
            <div style="padding: 20px; text-align: center; line-height: 1.6;">
              <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
              <h3 style="margin: 0 0 12px 0; color: #ff6b35;">Metin Çok Uzun</h3>
              <p style="color: #495057; margin-bottom: 16px;">
                Seçili metin AI modelinin limitini aşıyor.<br>
                Lütfen metni daha kısa parçalara bölün.
              </p>
              <div style="background: #fff3cd; padding: 12px; border-radius: 8px; margin-bottom: 12px; text-align: left;">
                <strong style="color: #856404;">💡 Çözüm Önerileri:</strong><br>
                <small style="color: #495057;">
                  • Metni 5000 karakterden kısa tutun<br>
                  • Sadece önemli kısımları seçin<br>
                  • Metni parçalara bölerek işleyin
                </small>
              </div>
            </div>
          `;
        } else {
          outputDiv.innerHTML = `
            <div style="
              padding: 24px;
              text-align: center;
              background: linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%);
              border-radius: 12px;
              border: 2px solid #ffc9c9;
              animation: fadeInUp 0.3s ease-out;
            ">
              <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
              <h3 style="margin: 0 0 8px 0; color: #dc3545; font-size: 16px; font-weight: 600;">İşlem Başarısız</h3>
              <p style="color: #721c24; margin: 0; font-size: 14px; line-height: 1.5;">${errorMsg}</p>
            </div>
          `;
        }
      }
    }
  } catch (error) {
    //console.error('Process text hatası:', error);
    if (error.message.includes('Extension context invalidated')) {
      outputDiv.innerHTML = '<div style="color: #dc3545; padding: 20px; text-align: center;">⚠️ Eklenti yeniden yüklendi.<br><br><strong>Lütfen sayfayı yenileyin (F5)</strong></div>';
    } else {
      outputDiv.innerHTML = `
        <div style="
          padding: 24px;
          text-align: center;
          background: linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%);
          border-radius: 12px;
          border: 2px solid #ffc9c9;
          animation: fadeInUp 0.3s ease-out;
        ">
          <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
          <h3 style="margin: 0 0 8px 0; color: #dc3545; font-size: 16px; font-weight: 600;">İşlem Başarısız</h3>
          <p style="color: #721c24; margin: 0; font-size: 14px; line-height: 1.5;">${error.message}</p>
        </div>
      `;
      // Hata mesajını 10 saniye sonra tamamen temizle
      setTimeout(() => {
        outputDiv.innerHTML = '<div class="sta-loading">🤖 Yapay zeka hazır</div>';
        outputDiv.removeAttribute('style'); // Tüm style'ları kaldır
      }, 10000);
    }
  }
}

// Kaydetme modalı göster
function showSaveModal(promptText, mainAction, processingStyle, editBtn, saveBtn, resetBtn, textarea) {
  const modal = document.createElement('div');
  modal.className = 'sta-modal';
  modal.innerHTML = `
    <div class="sta-modal-content">
      <h3>💾 Prompt Kaydet</h3>
      <p>Düzenlenen prompt nasıl kaydedilsin?</p>
      <div class="sta-modal-buttons">
        <button class="sta-modal-btn sta-temp-btn" id="sta-save-temp">🕒 Bir Kerelik</button>
        <button class="sta-modal-btn sta-perm-btn" id="sta-save-perm">💾 Kalıcı</button>
        <button class="sta-modal-btn sta-cancel-btn" id="sta-save-cancel">❌ İptal</button>
      </div>
      <small>Bir kerelik: Sadece bu seferlik kullanılır<br>Kalıcı: Ayarlara kaydedilir</small>
    </div>
  `;

  document.body.appendChild(modal);

  // Bir kerelik kaydet
  modal.querySelector('#sta-save-temp').onclick = () => {
    // Prompt'ı geçici olarak sakla (güvenli)
    window.tempPrompt = promptText;
    textarea.readOnly = true;
    editBtn.style.display = 'inline-block';
    saveBtn.style.display = 'none';
    resetBtn.style.display = 'none';
    modal.remove();
    showNotification('✓ Prompt bir kerelik olarak kaydedildi!', 'success');
  };

  // Kalıcı kaydet
  modal.querySelector('#sta-save-perm').onclick = () => {
    savePromptPermanently(promptText, mainAction, processingStyle);
    textarea.readOnly = true;
    editBtn.style.display = 'inline-block';
    saveBtn.style.display = 'none';
    resetBtn.style.display = 'none';
    modal.remove();
  };

  // İptal
  modal.querySelector('#sta-save-cancel').onclick = () => {
    modal.remove();
  };
}

// Prompt'ı kalıcı kaydet
function savePromptPermanently(promptText, mainAction, processingStyle) {
  const templateId = `template${mainAction === 'improve' ? (processingStyle === 'faithful' ? '1' : '2') : (processingStyle === 'faithful' ? '3' : '4')}`;

  chrome.storage.local.get('custom_prompts', (result) => {
    const customPrompts = result.custom_prompts || {};
    customPrompts[templateId] = promptText;

    chrome.storage.local.set({ custom_prompts: customPrompts }, () => {
      // Ayarlar pop'a bildirim gönder (sync için)
      chrome.runtime.sendMessage({
        type: 'PROMPT_UPDATED',
        data: { templateId, promptText }
      });
      showNotification('✓ Prompt kalıcı olarak kaydedildi! Ayarlar menüsü de güncellendi.', 'success');
    });
  });
}

// Varsayılana dön
async function resetToDefault(mainAction, processingStyle, textarea, editBtn, saveBtn, resetBtn) {
  if (!confirm('Prompt varsayılan haline dönsün mü?')) return;

  const templateId = `template${mainAction === 'improve' ? (processingStyle === 'faithful' ? '1' : '2') : (processingStyle === 'faithful' ? '3' : '4')}`;

  // usePageTitle ayarını kontrol et
  let pageTitle = null;
  try {
    const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (settingsResponse.success && settingsResponse.data.usePageTitle) {
      pageTitle = document.title;
    }
  } catch (error) {
    //console.error('Ayarlar alınamadı, sayfa başlığı kullanılıyor:', error);
    pageTitle = document.title; // Hata durumunda varsayılan
  }

  // Storage'dan sil
  chrome.storage.local.get('custom_prompts', (result) => {
    const customPrompts = result.custom_prompts || {};
    delete customPrompts[templateId];

    chrome.storage.local.set({ custom_prompts: customPrompts }, () => {
      // Varsayılan prompt'ı getir
      chrome.runtime.sendMessage({
        type: 'GET_PROMPT_PREVIEW',
        data: {
          mainAction,
          processingStyle,
          selectedText: currentSelection,
          pageTitle,
          additionalInstructions: '',
          targetLanguage: document.querySelector('#sta-language').value
        }
      }).then(response => {
        if (response && response.success) {
          textarea.value = response.data.prompt;
          textarea.readOnly = true;
          editBtn.style.display = 'inline-block';
          saveBtn.style.display = 'none';
          resetBtn.style.display = 'none';

          // Ayarlar popup'a bildirim gönder
          chrome.runtime.sendMessage({
            type: 'PROMPT_RESET',
            data: { templateId }
          });

          showNotification('✓ Prompt varsayılan haline döndürüldü! Ayarlar menüsü de güncellendi.', 'success');
        }
      });
    });
  });
}

// Bildirim gösterme fonksiyonu
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 2147483647;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    max-width: 300px;
    word-wrap: break-word;
  `;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

//console.log('🎉 Content script hazır!');
