import { Controller, Get, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Controller('home')
export class HomeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('ticker')
  async getTicker(@Query('lang') lang = 'te') {
    // 1. Try unified devotional_ticker from Admin Console
    const mainTicker = await this.prisma.appSetting.findUnique({
      where: { key: 'devotional_ticker' },
    });

    if (mainTicker && mainTicker.value) {
      return { text: mainTicker.value };
    }

    // 2. Try language-specific setting
    const langTicker = await this.prisma.appSetting.findUnique({
      where: { key: `ticker_mantra_${lang}` },
    });

    if (langTicker && langTicker.value) {
      return { text: langTicker.value };
    }

    return { text: '🕉️ స్వామియే శరణం అయ్యప్ప — శ్రీ అయ్యప్ప స్వామి నిత్య పూజా విధానం, అష్టోత్తరం, హరివరాసనం మరియు సమగ్ర శబరిమల యాత్రా దర్శిని 🕉️' };
  }

  // Official Application Branding, Logo & Devotional Identity
  @Get('logo')
  async getHomeLogo() {
    // 1. Try finding dynamically configured logo & branding in app_settings table
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: 'app_home_logo' },
    });

    if (setting && setting.value) {
      try {
        const parsed = JSON.parse(setting.value);
        return {
          success: true,
          logoUrl: parsed.logoUrl || '/images/saranam-ayyappa-logo-1794898267923.png',
          title: parsed.title || 'Thathwamasi Ayyappa',
          heroTitle: parsed.heroTitle || 'Thathwamasi Ayyappa',
          heroGreetingTop: parsed.heroGreetingTop || 'Thathwamasi',
          heroGreetingMid: parsed.heroGreetingMid || 'Ayyappa',
          heroGreetingBot: parsed.heroGreetingBot || 'Swamy!',
          tagline: parsed.tagline || 'Connect.. Pray.. Serve..',
          description: parsed.description || 'A sacred digital sanctuary and comprehensive devotional guide for Lord Ayyappa devotees and Dharma Karthas worldwide.',
          primaryColor: parsed.primaryColor || '#06452E',
          secondaryColor: parsed.secondaryColor || '#CAA049',
          playStoreUrl: parsed.playStoreUrl || 'https://play.google.com/store/apps/details?id=com.saranamayyappa.app',
          appStoreUrl: parsed.appStoreUrl || 'https://apps.apple.com/app/saranam-ayyappa/id123456789',
          socialLinks: parsed.socialLinks || {
            youtube: 'https://www.youtube.com/@SaranamAyyappaOfficial',
            telegram: 'https://t.me/saranam_ayyappa_satsang',
            instagram: 'https://www.instagram.com/saranamayyappa_official',
            facebook: 'https://www.facebook.com/saranamayyappaportal',
            whatsapp: 'https://whatsapp.com/channel/saranamayyappa',
          },
          updatedAt: setting.updatedAt,
        };
      } catch {
        // Fall through to default
      }
    }

    // 2. Default production-approved devotional branding
    return {
      success: true,
      logoUrl: '/images/saranam-ayyappa-logo-1794898267923.png',
      title: 'Thathwamasi Ayyappa',
      heroTitle: 'Thathwamasi Ayyappa',
      heroGreetingTop: 'Thathwamasi',
      heroGreetingMid: 'Ayyappa',
      heroGreetingBot: 'Swamy!',
      tagline: 'Connect.. Pray.. Serve..',
      description: 'A sacred digital sanctuary and comprehensive devotional guide for Lord Ayyappa devotees and Dharma Karthas worldwide.',
      primaryColor: '#06452E',
      secondaryColor: '#CAA049',
      playStoreUrl: 'https://play.google.com/store/apps/details?id=com.saranamayyappa.app',
      appStoreUrl: 'https://apps.apple.com/app/saranam-ayyappa/id123456789',
      socialLinks: {
        youtube: 'https://www.youtube.com/@SaranamAyyappaOfficial',
        telegram: 'https://t.me/saranam_ayyappa_satsang',
        instagram: 'https://www.instagram.com/saranamayyappa_official',
        facebook: 'https://www.facebook.com/saranamayyappaportal',
        whatsapp: 'https://whatsapp.com/channel/saranamayyappa',
      },
      updatedAt: '2026-11-17T08:27:04.936Z',
    };
  }

  // Home Page 10 Devotional Services / Categories (Stored and fetched from DB)
  @Get('services')
  async getHomeServices(@Query('lang') lang = 'en') {
    return this.fetchOrSeedHomeServices(lang);
  }

  @Get('categories')
  async getHomeCategories(@Query('lang') lang = 'en') {
    return this.fetchOrSeedHomeServices(lang);
  }

  // 5 Bottom Navigation Tabs (Stored and fetched from DB)
  @Get('tabs')
  async getBottomTabs(@Query('lang') lang = 'en') {
    const targetLang = (lang || 'en').toLowerCase().trim();
    const settingKey = `home_bottom_tabs_${targetLang}`;

    // 1. Check if already stored in app_settings table in database
    const existing = await this.prisma.appSetting.findUnique({
      where: { key: settingKey },
    });

    if (existing && existing.value) {
      try {
        const parsed = JSON.parse(existing.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { success: true, count: parsed.length, data: parsed };
        }
      } catch {}
    }

    // 2. Default localized bottom tabs matching reference image
    const localizedTabs = BOTTOM_TABS_DICTIONARY[targetLang] || BOTTOM_TABS_DICTIONARY.en;

    // 3. Persist into MySQL app_settings so it exists permanently in database
    try {
      await this.prisma.appSetting.upsert({
        where: { key: settingKey },
        update: { value: JSON.stringify(localizedTabs) },
        create: {
          key: settingKey,
          value: JSON.stringify(localizedTabs),
          description: `Home 5 Bottom Navigation Tabs (${targetLang.toUpperCase()})`,
        },
      });
    } catch {}

    return {
      success: true,
      count: localizedTabs.length,
      data: localizedTabs,
    };
  }

  private async fetchOrSeedHomeServices(lang: string) {
    const targetLang = (lang || 'en').toLowerCase().trim();
    const settingKey = `home_services_${targetLang}`;

    // 1. Check if already stored in app_settings table in database
    const existing = await this.prisma.appSetting.findUnique({
      where: { key: settingKey },
    });

    if (existing && existing.value) {
      try {
        const parsed = JSON.parse(existing.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { success: true, count: parsed.length, data: parsed };
        }
      } catch {}
    }

    // 2. Default localized dictionary matching the approved 10 services grid
    const localizedServices = HOME_SERVICES_DICTIONARY[targetLang] || HOME_SERVICES_DICTIONARY.en;

    // 3. Persist into MySQL app_settings so it exists permanently in database
    try {
      await this.prisma.appSetting.upsert({
        where: { key: settingKey },
        update: { value: JSON.stringify(localizedServices) },
        create: {
          key: settingKey,
          value: JSON.stringify(localizedServices),
          description: `Home 10 Devotional Services Grid (${targetLang.toUpperCase()})`,
        },
      });
    } catch (e) {
      // Safe fallback if concurrent upsert
    }

    return {
      success: true,
      count: localizedServices.length,
      data: localizedServices,
    };
  }

  // Public Notification endpoints for website and mobile app
  @Get('notifications')
  async getPublicNotifications(@Query('audience') audience = 'ALL') {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: 'broadcast_notifications' }
    });

    let list: any[] = [];
    if (setting && setting.value) {
      try {
        list = JSON.parse(setting.value);
      } catch {
        list = [];
      }
    }

    if (audience !== 'ALL') {
      list = list.filter(n => n.targetAudience === 'ALL' || n.targetAudience === audience);
    }

    return {
      success: true,
      data: list,
      count: list.length
    };
  }

  // Public CMS endpoints for website and mobile app
  @Get('cms')
  async getAllCms(@Query('lang') lang = 'te') {
    return this.prisma.appSetting.findMany({
      where: {
        key: { in: ['about_us', 'terms_conditions', 'privacy_policy', 'refund_policy', 'sabarimala_guidelines'] }
      }
    });
  }

  @Get('cms/:key')
  async getCmsByKey(@Param('key') key: string, @Query('lang') lang = 'te') {
    // 1. Check for language-specific key first in DB (e.g. terms_conditions_te)
    const localizedSetting = await this.prisma.appSetting.findUnique({
      where: { key: `${key}_${lang}` }
    });
    if (localizedSetting) {
      return localizedSetting;
    }

    // 2. Check general key in DB
    const generalSetting = await this.prisma.appSetting.findUnique({
      where: { key }
    });
    if (generalSetting) {
      return generalSetting;
    }

    // 3. Fallback to multilingual default CMS dictionary
    const defaults = CMS_DEFAULTS[key]?.[lang] || CMS_DEFAULTS[key]?.['en'];
    if (defaults) {
      return {
        key: `${key}_${lang}`,
        value: defaults.content,
        description: defaults.title,
        updatedAt: new Date(),
      };
    }

    return null;
  }
}

const CMS_DEFAULTS: Record<string, Record<string, { title: string; content: string }>> = {
  terms_conditions: {
    te: {
      title: 'నిబంధనలు & షరతులు',
      content: 'శరణం అయ్యప్ప భక్తి పోర్టల్‌కు స్వాగతం. ఈ అప్లికేషన్‌ను ఉపయోగించడం ద్వారా, మీరు ఆలయ నిబంధనలు మరియు ఆధ్యాత్మిక ప్రవర్తనా నియమావళికి కట్టుబడి ఉండటానికి అంగీకరిస్తున్నారు. నిత్య పూజా విధానాలు, పంచాంగం, మరియు స్తోత్రాలు భక్తుల ఆధ్యాత్మిక జ్ఞానోదయం కోసం అందించబడ్డాయి. భక్తులు ఈ సేవలను పవిత్రంగా, భక్తిశ్రద్ధలతో వినియోగించాలి.',
    },
    kn: {
      title: 'ನಿಯಮಗಳು ಮತ್ತು ಷರತ್ತುಗಳು',
      content: 'ಶರಣಂ ಅಯ್ಯಪ್ಪ ಭಕ್ತಿ ಪೋರ್ಟಲ್‌ಗೆ ಸುಸ್ವಾಗತ. ಈ ಅಪ್ಲಿಕೇಶನ್ ಬಳಸುವ ಮೂಲಕ, ನೀವು ದೇವಾಲಯದ ನಿಯಮಗಳು ಮತ್ತು ಆಧ್ಯಾತ್ಮಿಕ ನಡತೆಯ ಸಂಹಿತೆಗೆ ಬದ್ಧರಾಗಿರಲು ಒಪ್ಪುತ್ತೀರಿ. ನಿತ್ಯ ಪೂಜೆ ವಿಧಾನಗಳು, ಪಂಚಾಂಗ ಮತ್ತು ಸ್ತೋತ್ರಗಳನ್ನು ಭಕ್ತರ ಆಧ್ಯಾತ್ಮಿಕ ಜ್ಞಾನೋದಯಕ್ಕಾಗಿ ಒದಗಿಸಲಾಗಿದೆ.',
    },
    en: {
      title: 'Terms & Conditions',
      content: 'Welcome to Saranam Ayyappa Devotional Portal. By using this application, you agree to comply with and be bound by all temple terms and spiritual code of conduct. All devotional hymns, Panchangam calculations, and pooja procedures are provided for spiritual enlightenment. Devotees must use the portal respectfully.',
    },
    ta: {
      title: 'விதிமுறைகள் மற்றும் நிபந்தனைகள்',
      content: 'சரணம் ஐயப்பா பக்தி போர்ட்டலுக்கு நல்வரவு. இந்த செயலியைப் பயன்படுத்துவதன் மூலம், ஆலய விதிமுறைகள் மற்றும் ஆன்மீக நடத்தை விதிகளைப் பின்பற்ற ஒப்புக்கொள்கிறீர்கள். தினசரி பூஜை முறைகள், பஞ்சாங்கம் மற்றும் துதிகள் பக்தர்களின் ஆன்மீக மேம்பாட்டிற்காக வழங்கப்படுகின்றன.',
    },
    hi: {
      title: 'नियम एवं शर्तें',
      content: 'शरणम् अय्यप्पा भक्ति पोर्टल में आपका स्वागत है। इस एप्लिकेशन का उपयोग करके, आप मंदिर के नियमों और आध्यात्मिक आचार संहिता का पालन करने के लिए सहमत होते हैं। दैनिक पूजा विधान, पंचांग और स्तोत्र भक्तों के आध्यात्मिक लाभ के लिए प्रदान किए गए हैं।',
    },
  },
  privacy_policy: {
    te: {
      title: 'గోప్యతా విధానం',
      content: 'మీ భక్తి గోప్యత మాకు అత్యంత పవిత్రమైనది. శరణం అయ్యప్ప యాప్ భక్తుల ప్రాథమిక వివరాలు (పేరు, మొబైల్ నంబర్ మరియు జన్మ నక్షత్రం) మాత్రమే నిత్య ఆధ్యాత్మిక రిమైండర్‌లు మరియు పూజా వివరాలను అందించడానికి సేకరిస్తుంది. మేము మీ భక్తి సమాచారాన్ని ఎటువంటి మూడవ పక్షాలకూ విక్రయించము లేదా పంచుకోము.',
    },
    kn: {
      title: 'ಗೌಪ್ಯತಾ ನೀತಿ',
      content: 'ನಿಮ್ಮ ಆಧ್ಯಾತ್ಮಿಕ ಗೌಪ್ಯತೆಯು ನಮಗೆ ಅತ್ಯಂತ ಪವಿತ್ರವಾಗಿದೆ. ಶರಣಂ ಅಯ್ಯಪ್ಪ ಕೇವಲ ಮೂಲ ಭಕ್ತರ ನೋಂದಣಿ ವಿವರಗಳನ್ನು (ಹೆಸರು, ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಮತ್ತು ಐಚ್ಛಿಕ ಜನ್ಮ ನಕ್ಷತ್ರ) ದೈನಂದಿನ ಆಧ್ಯಾತ್ಮಿಕ ಜ್ಞಾಪನೆಗಳಿಗಾಗಿ ಮಾತ್ರ ಸಂಗ್ರಹಿಸುತ್ತದೆ. ನಿಮ್ಮ ಭಕ್ತಿ ಡೇಟಾವನ್ನು ನಾವು ಯಾವುದೇ ಮೂರನೇ ವ್ಯಕ್ತಿಗಳೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳುವುದಿಲ್ಲ.',
    },
    en: {
      title: 'Privacy Policy',
      content: 'Your spiritual privacy is sacred to us. Saranam Ayyappa only collects basic devotee registration details (name, phone number, and optional devotional birth star) to personalize daily spiritual reminders. We never sell, lease, or monetize your devotional data with third parties.',
    },
    ta: {
      title: 'தனியுரிமைக் கொள்கை',
      content: 'உங்கள் ஆன்மீகத் தனியுரிமை எங்களுக்கு மிகவும் புனிதமானது. சரணம் ஐயப்பா செயலி அடிப்படை பக்தர் விவரங்களை (பெயர், கைபேசி எண் மற்றும் விருப்பப்படி ஜென்ம நட்சத்திரம்) மட்டுமே தினசரி ஆன்மீக நினைவூட்டல்களுக்காகச் சேகரிக்கிறது. உங்கள் தகவல்களை எந்த மூன்றாம் தரப்பினருடனும் பகிர்ந்து கொள்ள மாட்டோம்.',
    },
    hi: {
      title: 'गोपनीयता नीति',
      content: 'आपकी आध्यात्मिक गोपनीयता हमारे लिए अत्यंत पवित्र है। शरणम् अय्यप्पा केवल बुनियादी भक्त पंजीकरण विवरण (नाम, मोबाइल नंबर और वैकल्पिक जन्म नक्षत्र) दैनिक आध्यात्मिक अनुस्मारक के लिए एकत्र करता है। हम आपका डेटा कभी किसी तीसरे पक्ष के साथ साझा नहीं करते हैं।',
    },
  },
  about_us: {
    te: {
      title: 'శరణం అయ్యప్ప గురించి',
      content: 'శరణం అయ్యప్ప ప్రపంచవ్యాప్తంగా ఉన్న శ్రీ అయ్యప్ప స్వామి భక్తుల కోసం ప్రత్యేకంగా రూపొందించబడిన దివ్య ఆధ్యాత్మిక వేదిక. నిత్య పంచాంగం, హరివరాసనం ఆడియో, 18 పవిత్ర మెట్ల మార్గదర్శకం మరియు 5 భాషలలో సంపూర్ణ పూజా విధానాలను భక్తితో అందిస్తోంది.',
    },
    kn: {
      title: 'ಶರಣಂ ಅಯ್ಯಪ್ಪ ಬಗ್ಗೆ',
      content: 'ಶರಣಂ ಅಯ್ಯಪ್ಪ ಪ್ರಪಂಚದಾದ್ಯಂತವಿರುವ ಶ್ರೀ ಅಯ್ಯಪ್ಪ ಸ್ವಾಮಿ ಭಕ್ತರಿಗಾಗಿ ರಚಿಸಲಾದ ದಿವ್ಯ ಆಧ್ಯಾತ್ಮಿಕ ವೇದಿಕೆ. ನಿತ್ಯ ಪಂಚಾಂಗ, ಹರಿವರಾಸನಂ ಆಡಿಯೋ, 18 ಪವಿತ್ರ ಮೆಟ್ಟಿಲುಗಳ ಮಾರ್ಗದರ್ಶನ ಮತ್ತು 5 ಭಾಷೆಗಳಲ್ಲಿ ಪೂಜಾ ವಿಧಾನಗಳನ್ನು ಒದಗಿಸುತ್ತದೆ.',
    },
    en: {
      title: 'About Saranam Ayyappa',
      content: 'Saranam Ayyappa is a dedicated spiritual companion for Lord Ayyappa Swami devotees worldwide. Providing daily authentic Panchangam, Harivarasanam audio, 18 Holy Steps guidance, and sacred pooja procedures across 5 languages.',
    },
    ta: {
      title: 'சரணம் ஐயப்பா பற்றி',
      content: 'சரணம் ஐயப்பா என்பது உலகெங்கிலும் உள்ள ஐயப்ப பக்தர்களுக்கான பிரத்யேக ஆன்மீகத் தளம். தினசரி பஞ்சாங்கம், ஹரிவராசனம் ஆடியோ, 18 புனிதப் படிகள் வழிகாட்டுதல் மற்றும் 5 மொழிகளில் பூஜை முறைகளை வழங்குகிறது.',
    },
    hi: {
      title: 'शरणम् अय्यप्पा के बारे में',
      content: 'शरणम् अय्यप्पा दुनिया भर के भगवान अय्यप्पा स्वामी भक्तों के लिए समर्पित एक पावन आध्यात्मिक मंच है। दैनिक प्रामाणिक पंचांग, हरिवरासनम् ऑडियो, 18 पवित्र सीढ़ियों का मार्गदर्शन और 5 भाषाओं में संपूर्ण पूजा विधान उपलब्ध कराता है।',
    },
  },
};

const HOME_SERVICES_DICTIONARY: Record<string, Array<{ id: string; key: string; title: string; icon: string; displayOrder: number }>> = {
  en: [
    { id: 'pooja-vidhanam', key: 'poojaVidhanam', title: 'Pooja\nVidhanam', icon: 'pooja-vidhanam', displayOrder: 1 },
    { id: 'astothrams', key: 'astothrams', title: 'Astothrams', icon: 'astothrams', displayOrder: 2 },
    { id: 'slokas', key: 'slokas', title: 'Slokas', icon: 'slokas', displayOrder: 3 },
    { id: 'bhajans', key: 'bhajans', title: 'Bhajans', icon: 'bhajans', displayOrder: 4 },
    { id: 'harathis', key: 'harathis', title: 'Harathis\n& Songs', icon: 'harathis', displayOrder: 5 },
    { id: 'live-streams', key: 'liveStreams', title: 'Live\nStreams', icon: 'live-streams', displayOrder: 6 },
    { id: 'panchangam', key: 'panchangam', title: 'Panchangam', icon: 'panchangam', displayOrder: 7 },
    { id: 'temples', key: 'temples', title: 'Temples\nin India', icon: 'temples', displayOrder: 8 },
    { id: 'donations', key: 'donations', title: 'Donations', icon: 'donations', displayOrder: 9 },
    { id: 'food-donation', key: 'foodDonation', title: 'Food\nDonation', icon: 'food-donation', displayOrder: 10 },
  ],
  te: [
    { id: 'pooja-vidhanam', key: 'poojaVidhanam', title: 'పూజా\nవిధానం', icon: 'pooja-vidhanam', displayOrder: 1 },
    { id: 'astothrams', key: 'astothrams', title: 'అష్టోత్తరాలు', icon: 'astothrams', displayOrder: 2 },
    { id: 'slokas', key: 'slokas', title: 'శ్లోకాలు', icon: 'slokas', displayOrder: 3 },
    { id: 'bhajans', key: 'bhajans', title: 'భజనలు', icon: 'bhajans', displayOrder: 4 },
    { id: 'harathis', key: 'harathis', title: 'హారతులు\n& పాటలు', icon: 'harathis', displayOrder: 5 },
    { id: 'live-streams', key: 'liveStreams', title: 'ప్రత్యక్ష\nప్రసారం', icon: 'live-streams', displayOrder: 6 },
    { id: 'panchangam', key: 'panchangam', title: 'పంచాంగం', icon: 'panchangam', displayOrder: 7 },
    { id: 'temples', key: 'temples', title: 'భారతీయ\nఆలయాలు', icon: 'temples', displayOrder: 8 },
    { id: 'donations', key: 'donations', title: 'విరాళాలు', icon: 'donations', displayOrder: 9 },
    { id: 'food-donation', key: 'foodDonation', title: 'అన్నదానం', icon: 'food-donation', displayOrder: 10 },
  ],
  kn: [
    { id: 'pooja-vidhanam', key: 'poojaVidhanam', title: 'ಪೂಜಾ\nವಿಧಾನ', icon: 'pooja-vidhanam', displayOrder: 1 },
    { id: 'astothrams', key: 'astothrams', title: 'ಅಷ್ಟೋತ್ತರಗಳು', icon: 'astothrams', displayOrder: 2 },
    { id: 'slokas', key: 'slokas', title: 'ಶ್ಲೋಕಗಳು', icon: 'slokas', displayOrder: 3 },
    { id: 'bhajans', key: 'bhajans', title: 'ಭಜನೆಗಳು', icon: 'bhajans', displayOrder: 4 },
    { id: 'harathis', key: 'harathis', title: 'ಆರತಿಗಳು\n& ಹಾಡುಗಳು', icon: 'harathis', displayOrder: 5 },
    { id: 'live-streams', key: 'liveStreams', title: 'ನೇರ\nಪ್ರಸಾರ', icon: 'live-streams', displayOrder: 6 },
    { id: 'panchangam', key: 'panchangam', title: 'ಪಂಚಾಂಗ', icon: 'panchangam', displayOrder: 7 },
    { id: 'temples', key: 'temples', title: 'ಭಾರತದ\nದೇವಾಲಯಗಳು', icon: 'temples', displayOrder: 8 },
    { id: 'donations', key: 'donations', title: 'ದೇಣಿಗೆಗಳು', icon: 'donations', displayOrder: 9 },
    { id: 'food-donation', key: 'foodDonation', title: 'ಅನ್ನದಾನ', icon: 'food-donation', displayOrder: 10 },
  ],
  ta: [
    { id: 'pooja-vidhanam', key: 'poojaVidhanam', title: 'பூஜை\nமுறைகள்', icon: 'pooja-vidhanam', displayOrder: 1 },
    { id: 'astothrams', key: 'astothrams', title: 'அஷ்டோத்திர\nங்கள்', icon: 'astothrams', displayOrder: 2 },
    { id: 'slokas', key: 'slokas', title: 'ஸ்லோகங்கள்', icon: 'slokas', displayOrder: 3 },
    { id: 'bhajans', key: 'bhajans', title: 'பஜனைகள்', icon: 'bhajans', displayOrder: 4 },
    { id: 'harathis', key: 'harathis', title: 'ஆரத்திகள்\n& பாடல்கள்', icon: 'harathis', displayOrder: 5 },
    { id: 'live-streams', key: 'liveStreams', title: 'நேரலை\nதரிசனம்', icon: 'live-streams', displayOrder: 6 },
    { id: 'panchangam', key: 'panchangam', title: 'பஞ்சாங்கம்', icon: 'panchangam', displayOrder: 7 },
    { id: 'temples', key: 'temples', title: 'இந்திய\nஆலயங்கள்', icon: 'temples', displayOrder: 8 },
    { id: 'donations', key: 'donations', title: 'நன்கொடைகள்', icon: 'donations', displayOrder: 9 },
    { id: 'food-donation', key: 'foodDonation', title: 'அன்னதானம்', icon: 'food-donation', displayOrder: 10 },
  ],
  hi: [
    { id: 'pooja-vidhanam', key: 'poojaVidhanam', title: 'पूजा\nविधान', icon: 'pooja-vidhanam', displayOrder: 1 },
    { id: 'astothrams', key: 'astothrams', title: 'अष्टोत्तर', icon: 'astothrams', displayOrder: 2 },
    { id: 'slokas', key: 'slokas', title: 'श्लोक', icon: 'slokas', displayOrder: 3 },
    { id: 'bhajans', key: 'bhajans', title: 'भजन', icon: 'bhajans', displayOrder: 4 },
    { id: 'harathis', key: 'harathis', title: 'आरती\nएवं गीत', icon: 'harathis', displayOrder: 5 },
    { id: 'live-streams', key: 'liveStreams', title: 'लाइव\nदर्शन', icon: 'live-streams', displayOrder: 6 },
    { id: 'panchangam', key: 'panchangam', title: 'पंचांग', icon: 'panchangam', displayOrder: 7 },
    { id: 'temples', key: 'temples', title: 'भारत के\nमंदिर', icon: 'temples', displayOrder: 8 },
    { id: 'donations', key: 'donations', title: 'दान', icon: 'donations', displayOrder: 9 },
    { id: 'food-donation', key: 'foodDonation', title: 'अन्नदान', icon: 'food-donation', displayOrder: 10 },
  ],
  ml: [
    { id: 'pooja-vidhanam', key: 'poojaVidhanam', title: 'പൂജാ\nവിധാനം', icon: 'pooja-vidhanam', displayOrder: 1 },
    { id: 'astothrams', key: 'astothrams', title: 'അഷ്ടോത്തര\nങ്ങൾ', icon: 'astothrams', displayOrder: 2 },
    { id: 'slokas', key: 'slokas', title: 'ശ്ലോകങ്ങൾ', icon: 'slokas', displayOrder: 3 },
    { id: 'bhajans', key: 'bhajans', title: 'ഭജനകൾ', icon: 'bhajans', displayOrder: 4 },
    { id: 'harathis', key: 'harathis', title: 'ആരതികൾ\n& പാട്ടുകൾ', icon: 'harathis', displayOrder: 5 },
    { id: 'live-streams', key: 'liveStreams', title: 'ലൈവ്\nദർശനം', icon: 'live-streams', displayOrder: 6 },
    { id: 'panchangam', key: 'panchangam', title: 'പഞ്ചാംഗം', icon: 'panchangam', displayOrder: 7 },
    { id: 'temples', key: 'temples', title: 'ഭാരതത്തിലെ\nക്ഷേത്രങ്ങൾ', icon: 'temples', displayOrder: 8 },
    { id: 'donations', key: 'donations', title: 'സംഭാവനകൾ', icon: 'donations', displayOrder: 9 },
    { id: 'food-donation', key: 'foodDonation', title: 'അന്നദാനം', icon: 'food-donation', displayOrder: 10 },
  ],
};

const BOTTOM_TABS_DICTIONARY: Record<string, Array<{ key: string; label: string; icon: string; order: number }>> = {
  en: [
    { key: 'home', label: 'Home', icon: 'home', order: 1 },
    { key: 'services', label: 'Services', icon: 'services', order: 2 },
    { key: 'temples', label: 'Temples', icon: 'temples', order: 3 },
    { key: 'panchangam', label: 'Panchangam', icon: 'panchangam', order: 4 },
    { key: 'profile', label: 'Profile', icon: 'profile', order: 5 },
  ],
  te: [
    { key: 'home', label: 'Home', icon: 'home', order: 1 },
    { key: 'services', label: 'Services', icon: 'services', order: 2 },
    { key: 'temples', label: 'Temples', icon: 'temples', order: 3 },
    { key: 'panchangam', label: 'Panchangam', icon: 'panchangam', order: 4 },
    { key: 'profile', label: 'Profile', icon: 'profile', order: 5 },
  ],
  kn: [
    { key: 'home', label: 'Home', icon: 'home', order: 1 },
    { key: 'services', label: 'Services', icon: 'services', order: 2 },
    { key: 'temples', label: 'Temples', icon: 'temples', order: 3 },
    { key: 'panchangam', label: 'Panchangam', icon: 'panchangam', order: 4 },
    { key: 'profile', label: 'Profile', icon: 'profile', order: 5 },
  ],
  ta: [
    { key: 'home', label: 'Home', icon: 'home', order: 1 },
    { key: 'services', label: 'Services', icon: 'services', order: 2 },
    { key: 'temples', label: 'Temples', icon: 'temples', order: 3 },
    { key: 'panchangam', label: 'Panchangam', icon: 'panchangam', order: 4 },
    { key: 'profile', label: 'Profile', icon: 'profile', order: 5 },
  ],
  hi: [
    { key: 'home', label: 'Home', icon: 'home', order: 1 },
    { key: 'services', label: 'Services', icon: 'services', order: 2 },
    { key: 'temples', label: 'Temples', icon: 'temples', order: 3 },
    { key: 'panchangam', label: 'Panchangam', icon: 'panchangam', order: 4 },
    { key: 'profile', label: 'Profile', icon: 'profile', order: 5 },
  ],
  ml: [
    { key: 'home', label: 'Home', icon: 'home', order: 1 },
    { key: 'services', label: 'Services', icon: 'services', order: 2 },
    { key: 'temples', label: 'Temples', icon: 'temples', order: 3 },
    { key: 'panchangam', label: 'Panchangam', icon: 'panchangam', order: 4 },
    { key: 'profile', label: 'Profile', icon: 'profile', order: 5 },
  ],
};
