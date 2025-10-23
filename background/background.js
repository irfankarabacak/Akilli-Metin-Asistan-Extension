/**
 * Background Service Worker
 * 
 * Eklentinin arka plan mantığını yönetir:
 * - Content script ve popup'tan gelen mesajları dinler
 * - Prompt oluşturma ve AI çağrılarını koordine eder
 * - Ayarlar ve geçmiş yönetimini yapar
 * - i18n (çoklu dil) desteğini yönetir
 * 
 * NOT: Manifest V3 service worker'da importScripts sorunları nedeniyle
 * tüm modüller bu dosyaya inline olarak dahil edilmiştir.
 */

// ============================================================================
// I18N MANAGEMENT MODULE
// ============================================================================

/**
 * Mevcut locale'i al
 */
async function getCurrentLocale() {
  try {
    const result = await chrome.storage.local.get('language_preferences');
    if (result.language_preferences && result.language_preferences.uiLocale) {
      return result.language_preferences.uiLocale;
    }
    // Varsayılan: tarayıcı dili
    return chrome.i18n.getUILanguage().split('-')[0]; // 'en-US' -> 'en'
  } catch (error) {
    console.error('getCurrentLocale error:', error);
    return 'tr'; // Fallback
  }
}

/**
 * Locale'i değiştir
 */
async function setLocale(locale) {
  try {
    const result = await chrome.storage.local.get('language_preferences');
    const preferences = result.language_preferences || {
      uiLocale: locale,
      outputLocale: locale,
      autoSync: true
    };
    
    const oldLocale = preferences.uiLocale;
    preferences.uiLocale = locale;
    
    // autoSync aktifse output locale'i de güncelle
    if (preferences.autoSync) {
      preferences.outputLocale = locale;
    }
    
    await chrome.storage.local.set({ language_preferences: preferences });
    
    // Eski locale'in cache'ini temizle
    if (oldLocale && oldLocale !== locale) {
      const oldCacheKey = `i18n_prompts_${oldLocale}`;
      await chrome.storage.local.remove([oldCacheKey, `${oldCacheKey}_timestamp`]);
      console.log(`Eski cache temizlendi: ${oldCacheKey}`);
    }
    
    // Yeni locale'in cache'ini de temizle (fresh data için)
    const newCacheKey = `i18n_prompts_${locale}`;
    await chrome.storage.local.remove([newCacheKey, `${newCacheKey}_timestamp`]);
    console.log(`Yeni cache temizlendi: ${newCacheKey}`);
    
    // Tüm açık popup ve content script'lere bildir
    chrome.runtime.sendMessage({ type: 'LOCALE_CHANGED', locale });
    
    return { success: true };
  } catch (error) {
    console.error('setLocale error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Desteklenen locale'leri listele
 */
function getSupportedLocales() {
  return ['tr', 'en', 'es', 'de', 'fr'];
}

/**
 * Çeviri mesajını al (Chrome i18n API wrapper)
 */
function getMessage(key, substitutions) {
  try {
    return chrome.i18n.getMessage(key, substitutions) || key;
  } catch (error) {
    console.warn(`Translation key not found: ${key}`);
    return key;
  }
}

/**
 * Prompt şablonunu locale'e göre yükle
 */
async function getLocalizedPromptTemplate(templateId, locale) {
  try {
    console.log('getLocalizedPromptTemplate çağrıldı - templateId:', templateId, 'locale:', locale);
    // Önce cache'e bak
    const cacheKey = `i18n_prompts_${locale}`;
    const cached = await chrome.storage.local.get(cacheKey);
    
    if (cached[cacheKey]) {
      console.log('Cache\'den yüklendi:', cacheKey);
      const prompts = cached[cacheKey];
      if (prompts[templateId]) {
        return prompts[templateId];
      }
    }
    
    // Cache'de yoksa yükle
    const url = chrome.runtime.getURL(`_locales/${locale}/prompts.json`);
    console.log('Prompt dosyası yükleniyor:', url);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to load prompts for locale: ${locale}`);
    }
    
    const prompts = await response.json();
    console.log('Prompt dosyası yüklendi, template sayısı:', Object.keys(prompts).length);
    
    // Cache'e kaydet (1 saat)
    await chrome.storage.local.set({
      [cacheKey]: prompts,
      [`${cacheKey}_timestamp`]: Date.now()
    });
    
    return prompts[templateId];
  } catch (error) {
    console.warn(`Prompt template not found for locale ${locale}, falling back to Turkish`);
    
    // Fallback: Türkçe
    try {
      const url = chrome.runtime.getURL('_locales/tr/prompts.json');
      const response = await fetch(url);
      const prompts = await response.json();
      return prompts[templateId];
    } catch (fallbackError) {
      console.error('Failed to load fallback prompts:', fallbackError);
      return null;
    }
  }
}

/**
 * Output locale'i al
 */
async function getOutputLocale() {
  try {
    const result = await chrome.storage.local.get('language_preferences');
    if (result.language_preferences && result.language_preferences.outputLocale) {
      return result.language_preferences.outputLocale;
    }
    // Varsayılan: UI locale ile aynı
    return await getCurrentLocale();
  } catch (error) {
    console.error('getOutputLocale error:', error);
    return 'tr';
  }
}

/**
 * Output locale'i değiştir
 */
async function setOutputLocale(locale) {
  try {
    const result = await chrome.storage.local.get('language_preferences');
    const preferences = result.language_preferences || {
      uiLocale: await getCurrentLocale(),
      outputLocale: locale,
      autoSync: false
    };
    
    preferences.outputLocale = locale;
    
    await chrome.storage.local.set({ language_preferences: preferences });
    
    return { success: true };
  } catch (error) {
    console.error('setOutputLocale error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Dil adını locale'e göre al
 */
function getLanguageName(locale, targetLocale) {
  const names = {
    'tr': { 'tr': 'Türkçe', 'en': 'Turkish', 'es': 'Turco', 'de': 'Türkisch', 'fr': 'Turc' },
    'en': { 'tr': 'İngilizce', 'en': 'English', 'es': 'Inglés', 'de': 'Englisch', 'fr': 'Anglais' },
    'es': { 'tr': 'İspanyolca', 'en': 'Spanish', 'es': 'Español', 'de': 'Spanisch', 'fr': 'Espagnol' },
    'de': { 'tr': 'Almanca', 'en': 'German', 'es': 'Alemán', 'de': 'Deutsch', 'fr': 'Allemand' },
    'fr': { 'tr': 'Fransızca', 'en': 'French', 'es': 'Francés', 'de': 'Französisch', 'fr': 'Français' }
  };
  
  return names[locale]?.[targetLocale] || locale;
}

// Lazy loading için fonksiyonları sadece gerektiğinde yükle
const lazyLoaders = {
  aiEngine: null,
  prompts: null,
  storage: null
};

// Fonksiyonları lazy load et
function getAIEngine() {
  if (!lazyLoaders.aiEngine) {
    lazyLoaders.aiEngine = {
      callPollinations,
      callGroq,
      callOpenAI,
      callClaude,
      callGemini,
      callCohere,
      callCustomAPI,
      detectProviderFromAPIKey,
      sendToAI
    };
  }
  return lazyLoaders.aiEngine;
}

// ============================================================================
// STORAGE MODULE (storage.js inline)
// ============================================================================

/**
 * Dinamik şifreleme anahtarı oluşturur
 */
function generateEncryptionKey() {
  const baseKey = 'SmartTextAssistant2024';
  const timestamp = Date.now().toString();
  const randomPart = Math.random().toString(36).substring(2, 15);
  return baseKey + timestamp.slice(-8) + randomPart;
}

// Şifreleme anahtarı (basit XOR için) - Dinamik oluşturuluyor
const ENCRYPTION_KEY = generateEncryptionKey();

/**
 * Basit XOR şifreleme - UTF-8 güvenli
 */
function xorEncrypt(text) {
  try {
    // Önce UTF-8'e dönüştür
    const utf8Text = unescape(encodeURIComponent(text));
    let result = '';
    for (let i = 0; i < utf8Text.length; i++) {
      result += String.fromCharCode(
        utf8Text.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)
      );
    }
    return btoa(result);
  } catch (error) {
    //console.error('Şifreleme hatası:', error);
    // Fallback: Base64 encoding
    return btoa(unescape(encodeURIComponent(text)));
  }
}

/**
 * XOR şifre çözme
 */
function xorDecrypt(encoded) {
  try {
    const text = atob(encoded);
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(
        text.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)
      );
    }
    return result;
  } catch (error) {
    //console.error('Şifre çözme hatası:', error);
    return '';
  }
}

/**
 * API anahtarını şifreleyerek kaydeder
 */
async function saveAPIKey(provider, apiKey, customEndpoint = null, customModel = null) {
  try {
    const encrypted = xorEncrypt(apiKey);
    const storageKey = `api_key_${provider}`;
    
    const dataToSave = {
      [storageKey]: encrypted,
      [`${storageKey}_provider`]: provider
    };
    
    if (provider === 'custom' && customEndpoint) {
      dataToSave[`${storageKey}_endpoint`] = customEndpoint;
      dataToSave[`${storageKey}_model`] = customModel || '';
    }
    
    await chrome.storage.local.set(dataToSave);
  } catch (error) {
    //console.error('API anahtarı kaydetme hatası:', error);
    throw error;
  }
}

/**
 * API anahtarını şifresini çözerek getirir
 */
async function getAPIKey(provider) {
  try {
    const storageKey = `api_key_${provider}`;
    const result = await chrome.storage.local.get(storageKey);
    
    if (result[storageKey]) {
      return xorDecrypt(result[storageKey]);
    }
    return null;
  } catch (error) {
    //console.error('API anahtarı getirme hatası:', error);
    return null;
  }
}

// Kullanıcı tercihi: seçili (tercih edilen) sağlayıcıyı kaydet/getir
async function setSelectedProvider(provider) {
  try {
    if (!provider) {
      await chrome.storage.local.remove('selected_provider');
    } else {
      await chrome.storage.local.set({ selected_provider: provider });
    }
  } catch (error) {
    //console.error('Seçili sağlayıcı kaydetme hatası:', error);
    throw error;
  }
}

async function getSelectedProvider() {
  try {
    const result = await chrome.storage.local.get('selected_provider');
    return result.selected_provider || null;
  } catch (error) {
    //console.error('Seçili sağlayıcı getirme hatası:', error);
    return null;
  }
}

/**
 * API anahtar\u0131n\u0131 siler ve ili\u015fkili cache'i temizler
 */
async function deleteAPIKey(provider) {
  try {
    const storageKey = `api_key_${provider}`;
    // T\u00fcm ili\u015fkili keyleri sil
    await chrome.storage.local.remove([
      storageKey, 
      `${storageKey}_provider`,
      `${storageKey}_endpoint`,
      `${storageKey}_model`
    ]);
    //console.log(`API anahtar\u0131 silindi: ${provider}`);
    // NOT: chrome.runtime.reload() kald\u0131r\u0131ld\u0131 - content script context'lerini bozuyordu
    // Storage de\u011fi\u015fiklikleri otomatik olarak dinleniyor (chrome.storage.onChanged)
  } catch (error) {
    //console.error('API anahtar\u0131 silme hatas\u0131:', error);
    throw error;
  }
}

/**
 * Custom API endpoint bilgilerini getirir
 */
async function getCustomEndpoint(provider) {
  try {
    const storageKey = `api_key_${provider}`;
    const result = await chrome.storage.local.get([`${storageKey}_endpoint`, `${storageKey}_model`]);
    
    if (result[`${storageKey}_endpoint`]) {
      return {
        endpoint: result[`${storageKey}_endpoint`],
        model: result[`${storageKey}_model`] || ''
      };
    }
    return null;
  } catch (error) {
    //console.error('Custom endpoint getirme hatası:', error);
    return null;
  }
}

/**
 * Aktif API sağlayıcısını kontrol eder
 */
async function getActiveProvider() {
  try {
const providers = ['openai', 'claude', 'gemini', 'cohere', 'groq', 'custom'];
    // Kullanıcı tercih ettiği sağlayıcıyı öncele
    const selected = await getSelectedProvider();
    if (selected) {
      const selectedKey = await getAPIKey(selected);
      if (selectedKey) {
        return selected;
      }
    }
    
    for (const provider of providers) {
      const key = await getAPIKey(provider);
      if (key) {
        return provider;
      }
    }
    return null;
  } catch (error) {
    //console.error('Aktif sağlayıcı kontrolü hatası:', error);
    return null;
  }
}

/**
 * İşlem geçmişine yeni kayıt ekler (maksimum 20)
 */
async function saveToHistory(operation) {
  try {
    const result = await chrome.storage.local.get('history');
    let history = result.history || [];
    
    history.unshift({
      ...operation,
      timestamp: new Date().toISOString()
    });
    
    if (history.length > 20) {
      history = history.slice(0, 20);
    }
    
    await chrome.storage.local.set({ history });
  } catch (error) {
    //console.error('Geçmişe kaydetme hatası:', error);
  }
}

/**
 * İşlem geçmişini getirir
 */
async function getHistory() {
  try {
    const result = await chrome.storage.local.get('history');
    return result.history || [];
  } catch (error) {
    //console.error('Geçmiş getirme hatası:', error);
    return [];
  }
}

/**
 * Belirli bir geçmiş kaydını siler
 */
async function deleteHistoryItem(index) {
  try {
    const result = await chrome.storage.local.get('history');
    let history = result.history || [];
    
    if (index >= 0 && index < history.length) {
      history.splice(index, 1);
      await chrome.storage.local.set({ history });
    }
  } catch (error) {
    //console.error('Geçmiş kaydı silme hatası:', error);
  }
}

/**
 * Tüm geçmişi temizler
 */
async function clearHistory() {
  try {
    await chrome.storage.local.set({ history: [] });
  } catch (error) {
    //console.error('Geçmiş temizleme hatası:', error);
  }
}

/**
 * Genel ayarları kaydeder
 */
async function saveSettings(settings) {
  try {
    const currentSettings = await getSettings();
    const updatedSettings = { ...currentSettings, ...settings };
    await chrome.storage.local.set({ settings: updatedSettings });
  } catch (error) {
    //console.error('Ayarları kaydetme hatası:', error);
    throw error;
  }
}

/**
 * Genel ayarları getirir
 */
async function getSettings() {
  try {
    const result = await chrome.storage.local.get('settings');
    return result.settings || {
      theme: 'light',
      usePageTitle: true,
      defaultLanguage: 'Türkçe',
      defaultMainAction: 'improve',
      defaultProcessingStyle: 'faithful'
    };
  } catch (error) {
    //console.error('Ayarları getirme hatası:', error);
    return {
      theme: 'light',
      usePageTitle: true,
      defaultLanguage: 'Türkçe',
      defaultMainAction: 'improve',
      defaultProcessingStyle: 'faithful'
    };
  }
}

// ============================================================================
// PROMPTS MODULE (prompts.js inline)
// ============================================================================

// Şablon 1: "Metni İyileştir" + "Metne Sadık Kal"
const TEMPLATE_1 = `KRİTİK ÇIKTI KURALI: YANITIN SADECE VE SADECE İŞLENMİŞ METNİN KENDİSİNİ İÇERMELİDİR. Çıktı dili MUTLAKA {Hedef_Dil} olmalıdır. KULLANICININ METNİNDE YER ALMAYAN "Elbe...", "Tabii", "İşte", "Sonuç:", "Anladım:", "Düzeltilmiş hali:", "Niyet Analizi:" GİBİ HİÇBİR GİRİŞ CÜMLESİ, SELAMLAMA, YORUM VEYA AÇIKLAMA EKLEME. Yalnızca görevin çıktısını ver.

GÖREV (ROL: GÖRÜNMEZ EDİTÖR VE TERCÜMAN): Sen, bir metin işleme motorusun. Görevin, sağlanan {Seçilen_Metin}'i analiz etmek, metnin orijinal dilindeki dilbilgisi, yazım ve akıcılık hatalarını düzeltmek ve Orijinal anlamı %100 koruyarak bu düzeltilmiş metni {Hedef_Dil} diline çevirmektir. Çeviri, {Hedef_Dil} dilinde robotik değil, bir insanın yazdığı gibi doğal ve akıcı olmalıdır.

KESİN YASAK (Uydurma Bilgi): ASLA orijinal metinde veya {Sayfa_Başlığı} bağlamında bulunmayan spesifik teknoloji isimleri (örn: "Google Gemini"), şirket isimleri veya rakamlar UYDURMA. Görevin sadece metni düzeltmek ve çevirmektir, YENİ BİLGİ EKLEMEK DEĞİLDİR.

DEĞİŞKENLER:

BAĞLAM (Sayfa Başlığı): {Sayfa_Başlığı}

ÇIKTI DİLİ: {Hedef_Dil}

EK TALİMAT (Varsa uygula): {Ek_Talimatlar}

İŞLENECEK METİN: {Seçilen_Metin}`;

// Şablon 2: "Metni İyileştir" + "Yapay Zeka ile Geliştir"
const TEMPLATE_2 = `KRİTİK ÇIKTI KURALI: YANITIN SADECE VE SADECE İŞLENMİŞ METNİN KENDİSİNİ İÇERMELİDİR. Çıktı dili MUTLAKA {Hedef_Dil} olmalıdır. KULLANICININ METNİNDE YER ALMAYAN "Elbe...", "Tabii", "İşte", "Sonuç:", "Anladım:", "Geliştirilmiş hali:" GİBİ HİÇBİR GİRİŞ CÜMLESİ, SELAMLAMA, YORUM VEYA AÇIKLAMA EKLEME. Yalnızca görevin çıktısını ver.

GÖREV (ROL: USTA METİN YAZARI VE TERCÜMAN): Sen, usta bir metin yazarısın. Görevin, sağlanan {Seçilen_Metin}'i analiz etmek, tüm dilbilgisi hatalarını düzeltmek ve metnin ana fikrini koruyarak zayıf ifadeleri ("çok iyi" gibi) daha güçlü ve ikna edici kelimelerle ("olağanüstü" gibi) değiştirmektir. Cümle yapılarını daha profesyonel hale getirerek metni zenginleştir. Bu zenginleştirilmiş metni {Hedef_Dil} diline, o dilde bir uzman tarafından yazılmış gibi profesyonel ve akıcı bir üslupla çevir.

KESİN YASAK (Uydurma Bilgi): ASLA orijinal metinde veya {Sayfa_Başlığı} bağlamında bulunmayan spesifik teknoloji isimleri (örn: "Google Gemini", "Blockchain"), şirket isimleri, rakamlar (örn: "%50 daha hızlı") veya spesifik özellikler (örn: "titanyum kasa") UYDURMA. Zenginleştirme, kelime seçimi ve üslup ile yapılmalıdır, yeni bilgi ekleyerek değil.

DEĞİŞKENLER:

BAĞLAM (Sayfa Başlığı): {Sayfa_Başlığı}

ÇIKTI DİLİ: {Hedef_Dil}

EK TALİMAT (Varsa uygula): {Ek_Talimatlar}

İŞLENECEK METİN: {Seçilen_Metin}`;

// Şablon 3: "Prompt Haline Getir" + "Metne Sadık Kal"
const TEMPLATE_3 = `KRİTİK ÇIKTI KURALI: YANITIN SADECE VE SADECE İŞLENMİŞ METNİN KENDİSİNİ İÇERMELİDİR. Çıktı dili MUTLAKA {Hedef_Dil} olmalıdır. KULLANICININ METNİNDE YER ALMAYAN "Elbe...", "İşte", "Prompt:", "Rol:", "Görev:", "Bağlam:", "Niyet Analizi:", "Yeniden Yazım:" GİBİ HİÇBİR GİRİŞ CÜMLESİ, SELAMLAMA, YORUM VEYA AÇIKLAMA EKLEME. Yalnızca görevin çıktısını ver.

GÖREV (ROL: NİYET NETLEŞTİRİCİ VE TERCÜMAN): Sen, bir metin işleme motorusun. Görevin, sağlanan {Seçilen_Metin}'deki belirsiz niyeti analiz etmek ve bu niyeti, bir yapay zekaya yönelik doğrudan, net bir komut cümlesi veya kısa bir paragraf (Örn: "Bana ... hakkında bilgi ver", "... konusunu açıkla") olarak yeniden yazmaktır. SADECE metinde var olan bilgileri ve {Sayfa_Başlığı} bağlamını kullan. Son olarak, bu netleştirilmiş komutu {Hedef_Dil} diline çevir.

KESİN YASAK (Ekleme ve Uydurma Bilgi): ASLA yeni bir rol, ton, format, hedef kitle bilgisi gibi meta-bileşenler ekleme. ASLA "Google Gemini" gibi spesifik teknoloji isimleri UYDURMA. Görevin sadece komutu netleştirmek ve çevirmektir.

DEĞİŞKENLER:

BAĞLAM (Sayfa Başlığı): {Sayfa_Başlığı}

ÇIKTI DİLİ: {Hedef_Dil}

EK TALİMAT (Varsa uygula): {Ek_Talimatlar}

İŞLENECEK METİN: {Seçilen_Metin}`;

// Şablon 4: "Prompt Haline Getir" + "Yapay Zeka ile Geliştir"
const TEMPLATE_4 = `KRİTİK ÇIKTI KURALI: YANITIN SADECE VE SADECE AŞAĞIDAKİ GÖREVİ UYGULAYARAK OLUŞTURDUĞUN YENİ PROMPT METNİNİN KENDİSİNİ İÇERMELİDİR. Çıktı dili MUTLAKA {Hedef_Dil} olmalıdır.

KESİN YASAK: Çıktın ASLA bir açıklama, yorum, selamlama veya "İşte prompt:", "Talimat verelim:", "Rol:", "Görev:", "Analiz:", "Sentez:", "Yaratıcı Eklemler:", "Ton:", "Format:" GİBİ başlıklar veya giriş cümleleri içeremez. Çıktın, OLUŞTURDUĞUN PROMPT'UN KENDİSİ OLMALIDIR, o prompt'u anlatan bir metin değil.

GÖREV (ROL: PROMPT OLUŞTURUCU VE TERCÜMAN): Sen, uzman bir prompt oluşturucusun. Görevin, {Seçilen_Metin}'deki ham fikri analiz etmek; bu fikre mantıksal bir ROL, ÇIKTI FORMATI, TON ve HEDEF KİTLE türetmek; bu türetilmiş bileşenleri ASLA "Rol:", "Görev:" gibi başlıklar kullanmadan, ana görevle birlikte tek, akıcı bir komut paragrafı olarak sentezlemek; ve bu nihai komut metnini {Hedef_Dil} diline çevirmektir.

KESİN YASAK (Uydurma Bilgi): ASLA "Google Gemini", "OpenAI", "ChatGPT" gibi spesifik teknoloji, marka veya şirket isimleri, ölçülebilir rakamlar (örn: "%50") veya orijinal fikirle ilişkisi olmayan veriler UYDURMA. Zenginleştirme, SADECE rol, ton, format ve görev tanımıyla yapılmalıdır.

DEĞİŞKENLER:

BAĞLAM (Sayfa Başlığı): {Sayfa_Başlığı}

ÇIKTI DİLİ: {Hedef_Dil}

EK TALİMAT (Varsa uygula): {Ek_Talimatlar}

İŞLENECEK METİN: {Seçilen_Metin}`;

// Şablon 5: "Metin Özetle" + "Metne Sadık Kal"
const TEMPLATE_5 = `KRİTİK ÇIKTI KURALI: YANITIN SADECE VE SADECE İŞLENMİŞ METNİN KENDİSİNİ İÇERMELİDİR. Çıktı dili MUTLAKA {Hedef_Dil} olmalıdır. KULLANICININ METNİNDE YER ALMAYAN "Elbe...", "Tabii", "İşte", "Özet:", "Sonuç:", "Anladım:", "Ana noktalar:", "Analiz:" GİBİ HİÇBİR GİRİŞ CÜMLESİ, SELAMLAMA, YORUM VEYA AÇIKLAMA EKLEME. Yalnızca görevin çıktısını ver.

GÖREV (ROL: BİLGİ ÇIKARICI VE TERCÜMAN): Sen, bir metin işleme motorusun. Görevin, sağlanan {Seçilen_Metin}'i analiz etmek, metnin SADECE ana fikrini ve en kritik anahtar noktalarını belirlemektir. Çıktı, bu bilgileri yansıtan kısa, net bir paragraf VEYA maddeler (hangisi daha uygunsa) halinde olmalıdır. Son olarak, bu özeti {Hedef_Dil} diline çevir.

KESİN YASAK (Ekleme ve Uydurma Bilgi): ASLA metinde bulunmayan bir bilgiyi, yorumu veya çıkarımı ekleme. ASLA "Google Gemini" gibi spesifik teknoloji isimleri UYDURMA. Görevin sadece metinden bilgi çıkarmak ve çevirmektir.

DEĞİŞKENLER:

BAĞLAM (Sayfa Başlığı): {Sayfa_Başlığı}

ÇIKTI DİLİ: {Hedef_Dil}

EK TALİMAT (Varsa uygula): {Ek_Talimatlar}

İŞLENECEK METİN: {Seçilen_Metin}`;

// Şablon 6: "Metin Özetle" + "Yapay Zeka ile Geliştir"
const TEMPLATE_6 = `KRİTİK ÇIKTI KURALI: YANITIN SADECE VE SADECE İŞLENMİŞ METNİN KENDİSİNİ İÇERMELİDİR. Çıktı dili MUTLAKA {Hedef_Dil} olmalıdır. KULLANICININ METNİNDE YER ALMAYAN "Elbe...", "Tabii", "İşte", "Özet:", "Sonuç:", "Detaylı özet:", "Anladım:", "Sentez:" GİBİ HİÇBİR GİRİŞ CÜMLESİ, SELAMLAMA, YORUM VEYA AÇIKLAMA EKLEME. Yalnızca görevin çıktısını ver.

GÖREV (ROL: ÖZET SENTEZLEYİCİ VE TERCÜMAN): Sen, bilgiyi anlayıp onu daha iyi anlatan bir uzmancısın. Görevin, sağlanan {Seçilen_Metin}'i analiz etmek, metnin ana fikrini ve önemli noktalarını derinlemesine anlamak ve bu bilgileri kendi (yapay zeka) kelimelerinle, sıfırdan, akıcı ve bütünsel bir paragraf olarak yeniden yazmaktır (sentezlemektir). {Sayfa_Başlığı} bağlamını kullanarak metindeki eksik bağlamları zenginleştir. Bu zenginleştirilmiş özeti {Hedef_Dil} diline çevir.

KESİN YASAK (Uydurma Bilgi): ASLA orijinal metin veya bağlamla ilişkisi olmayan, ölçülebilir (rakam, isim, teknoloji, "Google Gemini" vb.) bir bilgiyi UYDURMA. Konu dışına çıkma.

DEĞİŞKENLER:

BAĞLAM (Sayfa Başlığı): {Sayfa_Başlığı}

ÇIKTI DİLİ: {Hedef_Dil}

EK TALİMAT (Varsa uygula): {Ek_Talimatlar}

İŞLENECEK METİN: {Seçilen_Metin}`;

/**
 * Karar tablosuna göre doğru şablonu seçer
 */
function selectTemplate(mainAction, processingStyle) {
  if (mainAction === 'improve' && processingStyle === 'faithful') {
    return TEMPLATE_1;
  } else if (mainAction === 'improve' && processingStyle === 'enhance') {
    return TEMPLATE_2;
  } else if (mainAction === 'toPrompt' && processingStyle === 'faithful') {
    return TEMPLATE_3;
  } else if (mainAction === 'toPrompt' && processingStyle === 'enhance') {
    return TEMPLATE_4;
  } else if (mainAction === 'summarize' && processingStyle === 'faithful') {
    return TEMPLATE_5;
  } else if (mainAction === 'summarize' && processingStyle === 'enhance') {
    return TEMPLATE_6;
  }
  return TEMPLATE_1;
}

/**
 * Dinamik prompt oluşturur - custom promptları ve i18n'i destekler
 */
async function getPromptTemplate(mainAction, processingStyle, selectedText, pageTitle, additionalInstructions = '', targetLanguage = 'Türkçe') {
  // Maksimum prompt uzunluğu - güvenli limit (çoğu AI modeli için)
  const MAX_PROMPT_LENGTH = 6000; // Güvenli limit
  
  // Custom promptları kontrol et
  try {
    const result = await chrome.storage.local.get('custom_prompts');
    const customPrompts = result.custom_prompts || {};
    
    // Template ID'sini belirle
    let templateId = '';
    if (mainAction === 'improve' && processingStyle === 'faithful') {
      templateId = 'template1';
    } else if (mainAction === 'improve' && processingStyle === 'enhance') {
      templateId = 'template2';
    } else if (mainAction === 'toPrompt' && processingStyle === 'faithful') {
      templateId = 'template3';
    } else if (mainAction === 'toPrompt' && processingStyle === 'enhance') {
      templateId = 'template4';
    } else if (mainAction === 'summarize' && processingStyle === 'faithful') {
      templateId = 'template5';
    } else if (mainAction === 'summarize' && processingStyle === 'enhance') {
      templateId = 'template6';
    }
    
    // Custom prompt varsa onu kullan, yoksa locale'e göre yükle
    let template;
    if (customPrompts[templateId]) {
      console.log('Background - Custom prompt kullanılıyor:', templateId);
      template = customPrompts[templateId];
    } else {
      // UI locale'i al ve ona göre prompt yükle
      const uiLocale = await getCurrentLocale();
      console.log('Background - UI Locale:', uiLocale, 'Template ID:', templateId);
      const promptTemplate = await getLocalizedPromptTemplate(templateId, uiLocale);
      console.log('Background - Prompt template yüklendi:', !!promptTemplate);
      template = promptTemplate ? promptTemplate.content : selectTemplate(mainAction, processingStyle);
    }
    
    // Şablonun temel uzunluğunu hesapla (seçili metin olmadan)
    const baseTemplate = template
      .replace(/{Seçilen_Metin}/g, '')
      .replace(/{Sayfa_Başlığı}/g, pageTitle || 'Belirtilmemiş')
      .replace(/{Ek_Talimatlar}/g, additionalInstructions || 'Yok')
      .replace(/{Hedef_Dil}/g, targetLanguage)
      .replace(/{Randomness}/g, '000000');
    
    const baseLength = baseTemplate.length;
    const maxTextLength = MAX_PROMPT_LENGTH - baseLength;
    
    // Seçili metni gerekirse kısalt - sadece ücretsiz AI için
    let finalText = selectedText;
    
    // Aktif provider kontrolü
    const activeProviderResult = await chrome.storage.local.get('selected_provider');
    const activeProvider = activeProviderResult.selected_provider;
    
    // Sadece ücretsiz Pollinations AI için limit uygula
    if (!activeProvider && selectedText.length > maxTextLength) {
      finalText = selectedText.substring(0, maxTextLength - 50) + '\n\n[Metin çok uzun olduğu için kısaltıldı]';
    }
    
    // Placeholder'ları değiştir
    const randomness = Math.floor(Math.random() * 1000000);
    template = template.replace(/{Seçilen_Metin}/g, finalText);
    template = template.replace(/{Sayfa_Başlığı}/g, pageTitle || 'Belirtilmemiş');
    template = template.replace(/{Ek_Talimatlar}/g, additionalInstructions || 'Yok');
    template = template.replace(/{Hedef_Dil}/g, targetLanguage);
    template = template.replace(/{Randomness}/g, randomness.toString());
    
    return template;
  } catch (error) {
    // Hata durumunda default template kullan
    //console.error('Custom prompt yükleme hatası, default kullanılıyor:', error);
    
    const MAX_PROMPT_LENGTH = 6000;
    let template = selectTemplate(mainAction, processingStyle);
    
    // Şablonun temel uzunluğunu hesapla
    const baseTemplate = template
      .replace(/{Seçilen_Metin}/g, '')
      .replace(/{Sayfa_Başlığı}/g, pageTitle || 'Belirtilmemiş')
      .replace(/{Ek_Talimatlar}/g, additionalInstructions || 'Yok')
      .replace(/{Hedef_Dil}/g, targetLanguage)
      .replace(/{Randomness}/g, '000000');
    
    const baseLength = baseTemplate.length;
    const maxTextLength = MAX_PROMPT_LENGTH - baseLength;
    
    // Seçili metni gerekirse kısalt - sadece ücretsiz AI için
    let finalText = selectedText;
    
    // Aktif provider kontrolü
    const activeProviderResult = await chrome.storage.local.get('selected_provider');
    const activeProvider = activeProviderResult.selected_provider;
    
    // Sadece ücretsiz Pollinations AI için limit uygula
    if (!activeProvider && selectedText.length > maxTextLength) {
      finalText = selectedText.substring(0, maxTextLength - 50) + '\n\n[Metin çok uzun olduğu için kısaltıldı]';
    }
    
    const randomness = Math.floor(Math.random() * 1000000);
    template = template.replace(/{Seçilen_Metin}/g, finalText);
    template = template.replace(/{Sayfa_Başlığı}/g, pageTitle || 'Belirtilmemiş');
    template = template.replace(/{Ek_Talimatlar}/g, additionalInstructions || 'Yok');
    template = template.replace(/{Hedef_Dil}/g, targetLanguage);
    template = template.replace(/{Randomness}/g, randomness.toString());
    return template;
  }
}

// ============================================================================
// AI ENGINE MODULE (ai-engine.js inline)
// ============================================================================
const POLLINATIONS_ENDPOINT = 'https://text.pollinations.ai';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_RETRIES = 2;
const RETRY_DELAY = 2000;

/**
 * Belirli bir süre bekler
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Pollinations AI API'sine istek gönderir (POST endpoint - güçlü model)
 */
async function callPollinations(prompt, retryCount = 0) {
  try {
    //console.log('Pollinations AI API \u00e7a\u011fr\u0131s\u0131 yap\u0131l\u0131yor (\u00fccretsiz - mistral)...');
    //console.log('Prompt uzunlu\u011fu:', prompt.length, 'karakter');
    
    // POST endpoint - mistral modeli daha az filtre uygular
    const url = `${POLLINATIONS_ENDPOINT}?model=mistral`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        seed: Date.now()
      })
    });
    

    if (!response.ok) {
      if (response.status === 503 && retryCount < MAX_RETRIES) {
        //console.log(`Servis yüklenemiyor, ${RETRY_DELAY/1000} saniye sonra tekrar deneniyor...`);
        await wait(RETRY_DELAY);
        return await callPollinations(prompt, retryCount + 1);
      }
      
      let errorDetail = '';
      try {
        const errorData = await response.text();
        errorDetail = errorData;
        //console.error('API hata detayı:', errorData);
      } catch (parseError) {
        errorDetail = response.statusText;
      }
      
      // Detaylı hata mesajları - Pollinations AI
      if (response.status === 429) {
        throw new Error('Pollinations AI çok fazla istek aldı. 30 saniye bekleyip tekrar deneyin. (Ücretsiz servis olduğu için yoğun olabilir)');
      } else if (response.status === 400) {
        throw new Error('Geçersiz istek. Metin çok uzun olabilir, daha kısa bir metin deneyin.');
      } else if (response.status === 500 || response.status === 502 || response.status === 503) {
        throw new Error('Pollinations AI servisi şu anda çalışmıyor. Bu ücretsiz bir servis olduğu için bazen kesintiler olabilir. 5-10 dakika sonra tekrar deneyin.');
      } else if (response.status === 504) {
        throw new Error('Pollinations AI yanıt vermedi (timeout). Servis yoğun olabilir, lütfen tekrar deneyin.');
      }
      
      throw new Error(`Pollinations AI hatası (${response.status}): ${errorDetail.substring(0, 100)}`);
    }

    // Response düz text olarak geliyor (JSON değil)
    const result = await response.text();
    //console.log('AI yanıtı alındı, uzunluk:', result.length);
    return result.trim();
    
  } catch (error) {
    //console.error('Pollinations AI API hatası:', error);
    
    // Network hataları
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('İnternet bağlantınızı kontrol edin. Pollinations AI\'ya erişilemiyor.');
    } else if (error.message.includes('timeout')) {
      throw new Error('İstek zaman aşımına uğradı. İnternet bağlantınız yavaş olabilir.');
    }
    
    throw new Error(`Pollinations AI çağrısı başarısız: ${error.message}`);
  }
}

/**
 * Groq AI API'sine istek gönderir (POST endpoint - güçlü)
 */
async function callGroq(prompt, apiKey, retryCount = 0) {
  try {
    
    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });
    

    if (!response.ok) {
      if (response.status === 503 && retryCount < MAX_RETRIES) {
        //console.log(`Servis yüklenemiyor, ${RETRY_DELAY/1000} saniye sonra tekrar deneniyor...`);
        await wait(RETRY_DELAY);
return await callGroq(prompt, apiKey, retryCount + 1);
      }
      
      let errorDetail = '';
      let errorData;
      try {
        errorData = await response.json();
        errorDetail = JSON.stringify(errorData);
        //console.error('API hata detayı:', errorData);
      } catch (parseError) {
        errorDetail = response.statusText;
        errorData = {};
      }
      
      // Detaylı hata mesajları - Groq
      if (response.status === 429) {
        const errorMsg = errorData.error?.message || '';
        if (errorMsg.includes('quota')) {
          throw new Error('Groq API kotanız doldu. Ücretsiz planda günlük limit var. Yarın tekrar deneyin veya ücretli plana geçin.');
        }
        throw new Error('Groq rate limit aşıldı. Ücretsiz planda dakikada 30 istek limiti var. 1 dakika bekleyip tekrar deneyin.');
      } else if (response.status === 401) {
        throw new Error('Groq API anahtarınız geçersiz. Groq Console\'dan (console.groq.com) yeni anahtar oluşturun.');
      } else if (response.status === 403) {
        throw new Error('Groq API erişim izniniz yok. API anahtarınızın aktif olduğundan emin olun.');
      } else if (response.status === 400) {
        const errorMsg = errorData.error?.message || '';
        if (errorMsg.includes('model')) {
          throw new Error('Seçilen Groq modeli kullanılamıyor. Farklı bir model deneyin.');
        } else if (errorMsg.includes('max_tokens')) {
          throw new Error('Metin çok uzun. Daha kısa bir metin seçip tekrar deneyin.');
        }
        throw new Error('Geçersiz istek. Lütfen metin uzunluğunu kontrol edin.');
      } else if (response.status === 500 || response.status === 502 || response.status === 503) {
        throw new Error('Groq servisleri şu anda çalışmıyor. 5-10 dakika sonra tekrar deneyin.');
      } else if (response.status === 504) {
        throw new Error('Groq yanıt vermedi (timeout). Lütfen tekrar deneyin.');
      }
      
      throw new Error(`Groq API hatası (${response.status}): ${errorDetail.substring(0, 100)}`);
    }

    const data = await response.json();
    const result = data.choices[0].message.content;
    //console.log('AI yanıtı alındı, uzunluk:', result.length);
    return result.trim();
    
  } catch (error) {
    //console.error('Groq AI API hatası:', error);
    throw new Error(`AI çağrısı başarısız: ${error.message}`);
  }
}

/**
 * OpenAI API'sine istek gönderir
 */
async function callOpenAI(prompt, apiKey) {
  try {
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // OpenAI's latest affordable model
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = {};
      }
      
      // Detaylı hata mesajları
      if (response.status === 429) {
        const errorMsg = errorData.error?.message || '';
        if (errorMsg.includes('quota')) {
          throw new Error('OpenAI API kotanız doldu. Ödeme planınızı kontrol edin veya yeni ay başını bekleyin.');
        } else if (errorMsg.includes('rate_limit')) {
          throw new Error('Çok fazla istek gönderdiniz. 20-30 saniye bekleyip tekrar deneyin.');
        }
        throw new Error('OpenAI rate limit aşıldı. Lütfen birkaç dakika bekleyip tekrar deneyin.');
      } else if (response.status === 401) {
        throw new Error('OpenAI API anahtarınız geçersiz. Ayarlar > API Ayarları bölümünden doğru anahtarı girin.');
      } else if (response.status === 403) {
        throw new Error('OpenAI API erişim izniniz yok. API anahtarınızın aktif olduğundan emin olun.');
      } else if (response.status === 400) {
        const errorMsg = errorData.error?.message || '';
        if (errorMsg.includes('model')) {
          throw new Error('Seçilen model kullanılamıyor. Farklı bir model deneyin.');
        } else if (errorMsg.includes('max_tokens')) {
          throw new Error('Metin çok uzun. Daha kısa bir metin seçip tekrar deneyin.');
        }
        throw new Error('Geçersiz istek. Lütfen metin uzunluğunu kontrol edin.');
      } else if (response.status === 500 || response.status === 502 || response.status === 503) {
        throw new Error('OpenAI servisleri şu anda çalışmıyor. 5-10 dakika sonra tekrar deneyin.');
      } else if (response.status === 504) {
        throw new Error('OpenAI yanıt vermedi (timeout). Lütfen tekrar deneyin.');
      }
      
      throw new Error(errorData.error?.message || `OpenAI API hatası (${response.status})`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    //console.error('OpenAI API hatası:', error);
    throw new Error(`OpenAI çağrısı başarısız: ${error.message}`);
  }
}

/**
 * Claude (Anthropic) API'sine istek gönderir
 */
async function callClaude(prompt, apiKey) {
  try {
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1000,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = {};
      }
      
      // Detaylı hata mesajları
      if (response.status === 429) {
        const errorMsg = errorData.error?.message || '';
        if (errorMsg.includes('quota')) {
          throw new Error('Claude API kotanız doldu. Anthropic hesabınızdan ödeme planınızı kontrol edin.');
        }
        throw new Error('Claude rate limit aşıldı. 1-2 dakika bekleyip tekrar deneyin.');
      } else if (response.status === 401) {
        throw new Error('Claude API anahtarınız geçersiz. Anthropic Console\'dan yeni anahtar oluşturun.');
      } else if (response.status === 403) {
        throw new Error('Claude API erişim izniniz yok. API anahtarınızın aktif olduğundan emin olun.');
      } else if (response.status === 400) {
        const errorMsg = errorData.error?.message || '';
        if (errorMsg.includes('max_tokens')) {
          throw new Error('Metin çok uzun. Daha kısa bir metin seçip tekrar deneyin.');
        }
        throw new Error('Geçersiz istek. Lütfen metin formatını kontrol edin.');
      } else if (response.status === 500 || response.status === 502 || response.status === 503) {
        throw new Error('Claude servisleri şu anda çalışmıyor. 5-10 dakika sonra tekrar deneyin.');
      } else if (response.status === 529) {
        throw new Error('Claude servisleri aşırı yüklü. Lütfen birkaç dakika sonra tekrar deneyin.');
      }
      
      throw new Error(errorData.error?.message || `Claude API hatası (${response.status})`);
    }

    const data = await response.json();
    return data.content[0].text.trim();
  } catch (error) {
    //console.error('Claude API hatası:', error);
    throw new Error(`Claude çağrısı başarısız: ${error.message}`);
  }
}

/**
 * Google Gemini API'sine istek gönderir - Fallback mekanizması ile
 */
async function callGemini(prompt, apiKey) {
  return await callGeminiWithFallback(prompt, apiKey);
}

/**
 * Gemini API çağrısı - En basit yaklaşım
 */
async function callGeminiWithFallback(prompt, apiKey) {
  //console.log('Gemini API - en basit test başlatılıyor...');
  
  try {
    // Sadece en temel model ile test
    const result = await callGeminiBasic(prompt, apiKey);
    //console.log('✅ Gemini başarılı!');
    return result;
  } catch (error) {
    //console.log('❌ Gemini hatası:', error.message);
    
    // Alternatif yaklaşım dene
    try {
      //console.log('🔄 Alternatif Gemini yaklaşımı deneniyor...');
      const result = await callGeminiAlternative(prompt, apiKey);
      //console.log('✅ Alternatif Gemini başarılı!');
      return result;
    } catch (altError) {
      //console.log('❌ Alternatif Gemini de başarısız:', altError.message);
      throw new Error(`Gemini API çalışmıyor: ${error.message}`);
    }
  }
}

/**
 * Alternatif Gemini API yaklaşımı - Fallback modelleri
 */
async function callGeminiAlternative(prompt, apiKey) {
  //console.log('🔄 Alternatif Gemini modelleri deneniyor...');
  
  // Mevcut modelleri sırayla dene
  const fallbackModels = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    'gemini-2.5-pro',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
  ];
  
  for (const model of fallbackModels) {
    try {
      //console.log(`🔄 ${model} modeli deneniyor...`);
      const result = await callGeminiWithModel(prompt, apiKey, model);
      //console.log(`✅ ${model} başarılı!`);
      return result;
    } catch (error) {
      //console.log(`❌ ${model} hatası:`, error.message);
      continue;
    }
  }
  
  throw new Error('Hiçbir Gemini modeli çalışmıyor');
}

/**
 * Belirli model ile Gemini çağrısı
 */
async function callGeminiWithModel(prompt, apiKey, model) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
  
  const body = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048
    }
  };


  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${model} hatası: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (data.candidates && data.candidates.length > 0) {
    const candidate = data.candidates[0];
    if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
      const text = candidate.content.parts[0].text;
      if (text) {
        return text.trim();
      }
    }
  }

  throw new Error(`${model} geçersiz yanıt formatı`);
}

/**
 * Gemini API - En basit çağrı
 */
async function callGeminiBasic(prompt, apiKey) {
  // API key format kontrolü
  //console.log('🔍 Gemini API key kontrol ediliyor...');
  //console.log('API key uzunluğu:', apiKey.length);
  //console.log('API key formatı kontrol ediliyor...');
  
  // API key formatı kontrol et
  if (!apiKey || apiKey.length < 20) {
    throw new Error('API key çok kısa veya boş. [Google AI Studio](https://aistudio.google.com/api-keys) adresinden yeni key alın.');
  }
  
  if (!apiKey.startsWith('AIza')) {
    //console.log('⚠️ API key AIza ile başlamıyor, yine de deneniyor...');
  }

  // Önce API key'i test et
  //console.log('🔍 API key test ediliyor...');
  try {
    const testUrl = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
    const testResponse = await fetch(testUrl);
    //console.log('API key test sonucu:', testResponse.status);
    
    if (!testResponse.ok) {
      const testError = await testResponse.text();
      //console.log('API key test hatası:', testError);
      throw new Error(`API key geçersiz (${testResponse.status}): ${testError}`);
    }
    
    const testData = await testResponse.json();
    //console.log('✅ API key geçerli, mevcut modeller:', testData.models?.length || 0);
  } catch (testError) {
    //console.log('❌ API key test başarısız:', testError.message);
    throw new Error(`API key test başarısız: ${testError.message}`);
  }

  // Ana API çağrısı - En yeni model ile
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const body = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048
    }
  };


  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  //console.log('📊 Gemini response status:', response.status);
  //console.log('📊 Gemini response headers:', Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    let errorText = '';
    let errorData;
    try {
      errorText = await response.text();
      errorData = JSON.parse(errorText);
    } catch (e) {
      errorData = {};
    }
    //console.log('❌ Gemini error response:', errorText);
    
    // Detaylı hata mesajları
    if (response.status === 400) {
      const errorMsg = errorData.error?.message || errorText;
      if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('invalid')) {
        throw new Error('Gemini API anahtarınız geçersiz. Google AI Studio\'dan (aistudio.google.com/api-keys) yeni anahtar oluşturun.');
      } else if (errorMsg.includes('SAFETY')) {
        throw new Error('İçerik güvenlik filtresi tarafından engellendi. Farklı bir metin deneyin.');
      } else if (errorMsg.includes('model')) {
        throw new Error('Seçilen Gemini modeli kullanılamıyor. Farklı bir model deneyin.');
      }
      throw new Error('Geçersiz istek. Lütfen metin formatını kontrol edin.');
    } else if (response.status === 403) {
      throw new Error('Gemini API erişim izniniz yok. Google AI Studio\'da API\'yi etkinleştirin ve faturalandırmayı aktif edin.');
    } else if (response.status === 429) {
      throw new Error('Gemini rate limit aşıldı. Ücretsiz planda dakikada 15 istek limiti var. 1 dakika bekleyip tekrar deneyin.');
    } else if (response.status === 500 || response.status === 502 || response.status === 503) {
      throw new Error('Gemini servisleri şu anda çalışmıyor. 5-10 dakika sonra tekrar deneyin.');
    } else if (response.status === 504) {
      throw new Error('Gemini yanıt vermedi (timeout). Lütfen tekrar deneyin.');
    }
    
    throw new Error(`Gemini API hatası (${response.status}): ${errorText.substring(0, 100)}`);
  }

  const data = await response.json();
  //console.log('✅ Gemini success response:', JSON.stringify(data, null, 2));

  // Response parsing
  if (data.candidates && data.candidates.length > 0) {
    const candidate = data.candidates[0];
    if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
      const text = candidate.content.parts[0].text;
      if (text) {
        return text.trim();
      }
    }
  }

  throw new Error('Gemini API geçersiz yanıt formatı');
}

/**
 * Cohere API'sine istek gönderir
 */
async function callCohere(prompt, apiKey) {
  try {
    
    const response = await fetch('https://api.cohere.com/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'command',
        message: prompt,
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = {};
      }
      
      // Detaylı hata mesajları
      if (response.status === 429) {
        throw new Error('Cohere rate limit aşıldı. Trial hesaplarda dakikada 5 istek limiti var. 1 dakika bekleyip tekrar deneyin.');
      } else if (response.status === 401) {
        throw new Error('Cohere API anahtarınız geçersiz. Cohere Dashboard\'dan yeni anahtar oluşturun.');
      } else if (response.status === 403) {
        throw new Error('Cohere API erişim izniniz yok. API anahtarınızın aktif olduğundan emin olun.');
      } else if (response.status === 400) {
        throw new Error('Geçersiz istek. Lütfen metin uzunluğunu kontrol edin.');
      } else if (response.status === 500 || response.status === 502 || response.status === 503) {
        throw new Error('Cohere servisleri şu anda çalışmıyor. 5-10 dakika sonra tekrar deneyin.');
      }
      
      throw new Error(errorData.message || `Cohere API hatası (${response.status})`);
    }

    const data = await response.json();
    // Cohere v1/chat endpoint returns 'text' field directly
    if (data.text) {
      return data.text.trim();
    }
    // Fallback for older format
    if (data.generations && data.generations[0]) {
      return data.generations[0].text.trim();
    }
    throw new Error('Cohere API geçersiz yanıt formatı');
  } catch (error) {
    //console.error('Cohere API hatası:', error);
    throw new Error(`Cohere çağrısı başarısız: ${error.message}`);
  }
}

/**
 * Özel (Custom) API'ye istek gönderir
 */
async function callCustomAPI(prompt, apiKey, endpoint, model = '') {
  try {
    
    const requestBody = {
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.7
    };
    
    if (model) {
      requestBody.model = model;
    }
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      let errorData;
      let errorText = '';
      try {
        errorText = await response.text();
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = {};
      }
      
      // Detaylı hata mesajları
      if (response.status === 429) {
        throw new Error('Özel API rate limit aşıldı. Lütfen birkaç dakika bekleyip tekrar deneyin.');
      } else if (response.status === 401) {
        throw new Error('Özel API anahtarınız geçersiz. Lütfen ayarlardan kontrol edin.');
      } else if (response.status === 403) {
        throw new Error('Özel API erişim izniniz yok. API anahtarınızı ve endpoint\'inizi kontrol edin.');
      } else if (response.status === 400) {
        throw new Error('Geçersiz istek. API endpoint formatını ve model adını kontrol edin.');
      } else if (response.status === 404) {
        throw new Error('API endpoint bulunamadı. Lütfen endpoint URL\'ini kontrol edin.');
      } else if (response.status === 500 || response.status === 502 || response.status === 503) {
        throw new Error('Özel API servisi şu anda çalışmıyor. Lütfen daha sonra tekrar deneyin.');
      }
      
      const errorMsg = errorData.error?.message || errorData.message || errorText.substring(0, 100);
      throw new Error(`Özel API hatası (${response.status}): ${errorMsg}`);
    }

    const data = await response.json();
    
    if (data.choices && data.choices[0]?.message?.content) {
      return data.choices[0].message.content.trim();
    } else if (data.content && data.content[0]?.text) {
      return data.content[0].text.trim();
    } else if (data.text) {
      return data.text.trim();
    } else if (data.response) {
      return data.response.trim();
    } else {
      throw new Error('Beklenmeyen API yanıt formatı');
    }
  } catch (error) {
    //console.error('Özel API hatası:', error);
    throw new Error(`Özel API çağrısı başarısız: ${error.message}`);
  }
}

/**
 * Akıllı API key algılama - API key'den hangi provider olduğunu tespit eder
 */
async function detectProviderFromAPIKey(apiKey) {
  if (!apiKey) return null;
  
  // API key formatlarına göre provider tespiti
  if (apiKey.startsWith('sk-') && apiKey.length > 40) {
    // OpenAI format
    return 'openai';
  } else if (apiKey.startsWith('gsk_') && apiKey.length > 30) {
    // Groq format
    return 'groq';
  } else if (apiKey.startsWith('sk-ant-') && apiKey.length > 30) {
    // Claude format
    return 'claude';
  } else if (apiKey.length === 39 && /^[A-Za-z0-9_-]+$/.test(apiKey)) {
    // Gemini format (39 karakter, alfanumerik)
    return 'gemini';
  } else if (apiKey.startsWith('cohere_') && apiKey.length > 30) {
    // Cohere format (daha spesifik)
    return 'cohere';
  }
  
  return null;
}


/**
 * Ana AI çağrı fonksiyonu - Hangi servisi kullanacağına karar verir
 */
async function sendToAI(prompt) {
  try {
    const activeProvider = await getActiveProvider();
    
    if (activeProvider) {
      const apiKey = await getAPIKey(activeProvider);
      
      // API key doğrulama
      const detectedProvider = await detectProviderFromAPIKey(apiKey);
      
      if (detectedProvider && detectedProvider !== activeProvider) {
        //console.log(`API key ${detectedProvider} provider'ına ait ama ${activeProvider} seçili. Doğru provider'a yönlendiriliyor...`);
        
        // Doğru provider'ı kullan
        if (detectedProvider === 'openai') {
          const result = await callOpenAI(prompt, apiKey);
          return { result, provider: 'OpenAI (Otomatik Algılandı)' };
        } else if (detectedProvider === 'claude') {
          const result = await callClaude(prompt, apiKey);
          return { result, provider: 'Claude (Otomatik Algılandı)' };
        } else if (detectedProvider === 'gemini') {
          const result = await callGeminiWithFallback(prompt, apiKey);
          return { result, provider: 'Google Gemini (Otomatik Algılandı)' };
        } else if (detectedProvider === 'cohere') {
          const result = await callCohere(prompt, apiKey);
          return { result, provider: 'Cohere (Otomatik Algılandı)' };
        } else if (detectedProvider === 'groq') {
          const result = await callGroq(prompt, apiKey);
          return { result, provider: 'Groq (Otomatik Algılandı)' };
        }
      }
      
      // Normal provider kullanımı
      if (activeProvider === 'openai') {
        const result = await callOpenAI(prompt, apiKey);
        return { result, provider: 'OpenAI' };
      } else if (activeProvider === 'claude') {
        const result = await callClaude(prompt, apiKey);
        return { result, provider: 'Claude' };
      } else if (activeProvider === 'gemini') {
        // Gemini için direkt çağrı - çalışmazsa hata ver
        const result = await callGeminiWithFallback(prompt, apiKey);
        return { result, provider: 'Google Gemini' };
      } else if (activeProvider === 'cohere') {
        const result = await callCohere(prompt, apiKey);
        return { result, provider: 'Cohere' };
      } else if (activeProvider === 'groq') {
        const result = await callGroq(prompt, apiKey);
        return { result, provider: 'Groq' };
      } else if (activeProvider === 'custom') {
        const customConfig = await getCustomEndpoint('custom');
        if (customConfig && customConfig.endpoint) {
          const result = await callCustomAPI(prompt, apiKey, customConfig.endpoint, customConfig.model);
          return { result, provider: 'Özel API' };
        }
      }
    }
    
// Varsay\u0131lan: Pollinations AI (tamamen \u00fccretsiz, API key gerektirmez)
    //console.log('Varsay\u0131lan AI kullan\u0131l\u0131yor: Pollinations AI (\u00fccretsiz)');
    const result = await callPollinations(prompt);
    return { result, provider: 'Pollinations AI (\u00dccretsiz)' };
  } catch (error) {
    //console.error('AI çağrısı sırasında hata:', error);
    throw error;
  }
}

// ============================================================================
// BACKGROUND LOGIC
// ============================================================================

/**
 * Mesaj dinleyicisi - Content script ve popup'tan gelen mesajları işler
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  //console.log('Mesaj alındı:', message.type);

  // PROCESS_TEXT: Metin işleme isteği
  if (message.type === 'PROCESS_TEXT') {
    handleProcessText(message.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Asenkron yanıt için

  // GET_SETTINGS: Ayarları getir
  } else if (message.type === 'GET_SETTINGS') {
    getSettings()
      .then(settings => sendResponse({ success: true, data: settings }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;

  // SAVE_SETTINGS: Ayarları kaydet
  } else if (message.type === 'SAVE_SETTINGS') {
    saveSettings(message.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;

  // GET_HISTORY: Geçmişi getir
  } else if (message.type === 'GET_HISTORY') {
    getHistory()
      .then(history => sendResponse({ success: true, data: history }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;

  // DELETE_HISTORY_ITEM: Belirli bir geçmiş kaydını sil
  } else if (message.type === 'DELETE_HISTORY_ITEM') {
    deleteHistoryItem(message.data.index)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;

  // CLEAR_HISTORY: Tüm geçmişi temizle
  } else if (message.type === 'CLEAR_HISTORY') {
    clearHistory()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;

  // SAVE_API_KEY: API anahtarını kaydet
  } else if (message.type === 'SAVE_API_KEY') {
    const { provider, apiKey, customEndpoint, customModel } = message.data;
    
    // API key doğrulama (yeniden aktif)
    (async () => {
      try {
        const detectedProvider = await detectProviderFromAPIKey(apiKey);
        if (detectedProvider && detectedProvider !== provider) {
          sendResponse({ 
            success: false, 
            error: `Bu API key ${detectedProvider} provider'ına ait. Lütfen doğru provider'ı seçin.` 
          });
          return;
        }
        
        await saveAPIKey(provider, apiKey, customEndpoint, customModel);
        
        // Kaydedilen sağlayıcıyı tercih olarak ayarla
        await setSelectedProvider(provider);
        const activeProvider = await getActiveProvider();
        chrome.runtime.sendMessage({ type: 'PROVIDER_CHANGED', activeProvider });
        sendResponse({ success: true, activeProvider });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;

  // DELETE_API_KEY: API anahtarını sil
  } else if (message.type === 'DELETE_API_KEY') {
    deleteAPIKey(message.data.provider)
      .then(async () => {
        // Eğer silinen sağlayıcı seçiliyse tercihi temizle
        const selected = await getSelectedProvider();
        if (selected === message.data.provider) {
          await setSelectedProvider(null);
        }
        const activeProvider = await getActiveProvider();
        chrome.runtime.sendMessage({ type: 'PROVIDER_CHANGED', activeProvider });
        sendResponse({ success: true, activeProvider });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;

  // GET_PROMPT_PREVIEW: Prompt şablonunu görüntüle (AI'a göndermeden)
  } else if (message.type === 'GET_PROMPT_PREVIEW') {
    (async () => {
      try {
        const {
          mainAction,
          processingStyle,
          selectedText,
          pageTitle,
          additionalInstructions,
          targetLanguage
        } = message.data;
        
        const prompt = await getPromptTemplate(
          mainAction,
          processingStyle,
          selectedText,
          pageTitle,
          additionalInstructions,
          targetLanguage
        );
        
        sendResponse({ success: true, data: { prompt } });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;

  // GET_ACTIVE_PROVIDER: Aktif API sağlayıcısını getir
  } else if (message.type === 'GET_ACTIVE_PROVIDER') {
    getActiveProvider()
      .then(activeProvider => sendResponse({ success: true, activeProvider }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;

  } else if (message.type === 'SET_SELECTED_PROVIDER') {
    (async () => {
      try {
        const { provider } = message.data;
        if (provider) {
          const key = await getAPIKey(provider);
          if (key) {
            await setSelectedProvider(provider);
          } else {
            await setSelectedProvider(null);
          }
        } else {
          await setSelectedProvider(null);
        }
        const activeProvider = await getActiveProvider();
        chrome.runtime.sendMessage({ type: 'PROVIDER_CHANGED', activeProvider });
        sendResponse({ success: true, activeProvider });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;

  } else if (message.type === 'GET_SELECTED_PROVIDER') {
    getSelectedProvider()
      .then(selectedProvider => sendResponse({ success: true, selectedProvider }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;

  // GET_MASKED_API_KEY: Maskeli API anahtarını getir (son 4 karakter)
  } else if (message.type === 'GET_MASKED_API_KEY') {
    (async () => {
      try {
        const { provider } = message.data;
        const apiKey = await getAPIKey(provider);
        if (apiKey && apiKey.length > 4) {
          const masked = '...' + apiKey.slice(-4);
          sendResponse({ success: true, maskedKey: masked });
        } else {
          sendResponse({ success: true, maskedKey: null });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;

  // GET_LOCALE: Mevcut locale'i getir
  } else if (message.type === 'GET_LOCALE') {
    getCurrentLocale()
      .then(locale => sendResponse({ success: true, locale }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;

  // SET_LOCALE: Locale'i değiştir
  } else if (message.type === 'SET_LOCALE') {
    setLocale(message.data.locale)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;

  // GET_OUTPUT_LOCALE: Output locale'i getir
  } else if (message.type === 'GET_OUTPUT_LOCALE') {
    getOutputLocale()
      .then(locale => sendResponse({ success: true, locale }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;

  // SET_OUTPUT_LOCALE: Output locale'i değiştir
  } else if (message.type === 'SET_OUTPUT_LOCALE') {
    setOutputLocale(message.data.locale)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;

  // GET_SUPPORTED_LOCALES: Desteklenen locale'leri listele
  } else if (message.type === 'GET_SUPPORTED_LOCALES') {
    const locales = getSupportedLocales();
    sendResponse({ success: true, locales });
    return true;

  // GET_LANGUAGE_NAME: Dil adını al
  } else if (message.type === 'GET_LANGUAGE_NAME') {
    const name = getLanguageName(message.data.locale, message.data.targetLocale);
    sendResponse({ success: true, name });
    return true;

  // OPEN_POPUP: Extension popup'ı aç
  } else if (message.type === 'OPEN_POPUP') {
    chrome.action.openPopup().catch(() => {
      // Popup açılamazsa yeni tab aç
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
    });
    sendResponse({ success: true });
    return true;
  }
});

// Storage değişikliklerini dinle ve aktif sağlayıcı değişimini yayınla
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  try {
    if (areaName !== 'local') return;
    const keys = Object.keys(changes);
    const hasApiKeyChange = keys.some(key => key.startsWith('api_key_'));
    const selectedChanged = keys.includes('selected_provider');
    if (!hasApiKeyChange && !selectedChanged) return;
    const activeProvider = await getActiveProvider();
    // Tüm context'lere yayınla (content, popup)
    chrome.runtime.sendMessage({ type: 'PROVIDER_CHANGED', activeProvider });
  } catch (e) {
    //console.error('PROVIDER_CHANGED yayınlama hatası:', e);
  }
});

/**
 * Extension yüklendiğinde veya güncellendiğinde çalışır
 * Migration ve ilk kurulum işlemlerini yapar
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    if (details.reason === 'install') {
      // İlk kurulum
      console.log('Extension ilk kez yüklendi');
      
      // Tarayıcı dilini al
      const browserLocale = chrome.i18n.getUILanguage().split('-')[0]; // 'en-US' -> 'en'
      const supportedLocales = getSupportedLocales();
      const defaultLocale = supportedLocales.includes(browserLocale) ? browserLocale : 'tr';
      
      // Varsayılan dil tercihlerini oluştur
      await chrome.storage.local.set({
        language_preferences: {
          uiLocale: defaultLocale,
          outputLocale: defaultLocale,
          autoSync: true
        }
      });
      
      console.log(`Varsayılan dil ayarlandı: ${defaultLocale}`);
      
    } else if (details.reason === 'update') {
      // Güncelleme
      const previousVersion = details.previousVersion;
      console.log(`Extension güncellendi: ${previousVersion} -> ${chrome.runtime.getManifest().version}`);
      
      // Versiyon 2.0.0'dan önceki kullanıcılar için migration
      if (previousVersion && previousVersion < '2.0.0') {
        console.log('v2.0.0 migration başlatılıyor...');
        
        // Dil tercihleri yoksa oluştur
        const result = await chrome.storage.local.get('language_preferences');
        if (!result.language_preferences) {
          const browserLocale = chrome.i18n.getUILanguage().split('-')[0];
          const supportedLocales = getSupportedLocales();
          const defaultLocale = supportedLocales.includes(browserLocale) ? browserLocale : 'tr';
          
          await chrome.storage.local.set({
            language_preferences: {
              uiLocale: defaultLocale,
              outputLocale: defaultLocale,
              autoSync: true
            }
          });
          
          console.log('Dil tercihleri oluşturuldu');
        }
      }
    }
  } catch (error) {
    console.error('onInstalled error:', error);
  }
});

/**
 * Metin işleme ana fonksiyonu
 * @param {object} data - İşlem parametreleri
 * @returns {Promise<object>} İşlem sonucu
 */
async function handleProcessText(data) {
  try {
    const {
      mainAction,        // 'improve' veya 'toPrompt'
      processingStyle,   // 'faithful' veya 'enhance'
      selectedText,
      pageTitle,
      additionalInstructions,
      targetLanguage
    } = data;

    //console.log('İşlem başlatılıyor:', { mainAction, processingStyle });

    // 1. Dinamik prompt oluştur (prompts.js modülü kullanarak)
    const prompt = await getPromptTemplate(
      mainAction,
      processingStyle,
      selectedText,
      pageTitle,
      additionalInstructions,
      targetLanguage
    );

    //console.log('Prompt oluşturuldu, AI çağrısı yapılıyor...');

    // 2. AI'a gönder (ai-engine.js modülü kullanarak)
    const aiResponse = await sendToAI(prompt);

    // 3. Geçmişe kaydet (TAM METNİNLERLE)
    await saveToHistory({
      mainAction,
      processingStyle,
      selectedText: selectedText,
      result: aiResponse.result,
      provider: aiResponse.provider,
      targetLanguage
    });

    //console.log('İşlem başarıyla tamamlandı');

    return {
      result: aiResponse.result,
      provider: aiResponse.provider,
      prompt: prompt // Opsiyonel: Kullanıcı görmek isterse
    };

  } catch (error) {
    //console.error('Metin işleme hatası:', error);
    throw error;
  }
}

/**
 * Eklenti yüklendiğinde varsayılan ayarları oluştur
 */
chrome.runtime.onInstalled.addListener(async () => {
  //console.log('Eklenti yüklendi, varsayılan ayarlar kontrol ediliyor...');
  
  try {
    const settings = await getSettings();
    if (!settings || Object.keys(settings).length === 0) {
      await saveSettings({
        theme: 'light',
        usePageTitle: true,
        defaultLanguage: 'Türkçe',
        defaultMainAction: 'improve',
        defaultProcessingStyle: 'faithful'
      });
      //console.log('Varsayılan ayarlar oluşturuldu');
    }
  } catch (error) {
    //console.error('Ayarlar oluşturma hatası:', error);
  }
});
