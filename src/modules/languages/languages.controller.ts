import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const LANGUAGE_METADATA: Record<string, { native: string; english: string; continueText: string }> = {
  te: { native: 'తెలుగు', english: 'Telugu', continueText: 'కొనసాగించండి' },
  kn: { native: 'ಕನ್ನಡ', english: 'Kannada', continueText: 'ముందువರಿಸಿ' },
  en: { native: 'English', english: 'English', continueText: 'Continue' },
  ta: { native: 'தமிழ்', english: 'Tamil', continueText: 'தொடరவும்' },
  hi: { native: 'हिन्दी', english: 'Hindi', continueText: 'जारी रखें' },
};

@Controller('languages')
export class LanguagesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getLanguages() {
    const langs = await this.prisma.language.findMany({
      orderBy: { id: 'asc' },
    });

    return langs.map((l) => {
      const meta = LANGUAGE_METADATA[l.code] || {
        native: l.name,
        english: l.name,
        continueText: 'Continue',
      };

      return {
        id: l.id,
        code: l.code,
        name: l.name,
        nativeName: meta.native,
        englishName: meta.english,
        displayName: `${meta.native} — ${meta.english}`,
        continueText: meta.continueText,
      };
    });
  }
}

