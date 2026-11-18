import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class MasterService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch 12 Rashis with localized names
   */
  async getRashis(lang = 'te') {
    const language = await this.prisma.language.findUnique({
      where: { code: lang },
    });
    const langId = language ? language.id : 1;

    const rashis = await this.prisma.rashi.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        translations: {
          where: { languageId: langId },
        },
      },
    });

    return rashis.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.translations[0]?.name || r.code,
      sortOrder: r.sortOrder,
    }));
  }

  /**
   * Fetch 27 Nakshatras with localized names
   */
  async getNakshatras(lang = 'te') {
    const language = await this.prisma.language.findUnique({
      where: { code: lang },
    });
    const langId = language ? language.id : 1;

    const nakshatras = await this.prisma.nakshatra.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        translations: {
          where: { languageId: langId },
        },
      },
    });

    return nakshatras.map((n) => ({
      id: n.id,
      code: n.code,
      name: n.translations[0]?.name || n.code,
      sortOrder: n.sortOrder,
    }));
  }

  /**
   * Fetch Deities from DB with server-side search and category filtering
   */
  async getDeities(query: {
    search?: string;
    category?: string;
    featured?: string;
    isActive?: string;
  }) {
    const where: any = {};

    // Active status filter
    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true' || query.isActive === '1';
    } else {
      where.isActive = true;
    }

    // Featured status filter (e.g. Choose Deity screen requests featured: true)
    if (query.featured !== undefined && (query.featured === 'true' || query.featured === '1')) {
      where.isFeatured = true;
    }

    // Category filter
    if (query.category && query.category !== 'all') {
      if (query.category === 'popular') {
        where.OR = [
          { category: 'popular' },
          { isFeatured: true }
        ];
      } else {
        where.category = query.category;
      }
    }

    // Server-side search filter across name, regional translations, slug and aliases
    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      const searchConditions = [
        { name: { contains: s } },
        { teluguName: { contains: s } },
        { tamilName: { contains: s } },
        { kannadaName: { contains: s } },
        { hindiName: { contains: s } },
        { slug: { contains: s } },
        { aliases: { contains: s } },
      ];

      if (where.OR) {
        where.AND = [
          { OR: where.OR },
          { OR: searchConditions }
        ];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    const deities = await this.prisma.deity.findMany({
      where,
      orderBy: [
        { isFeatured: 'desc' },
        { orderIndex: 'asc' },
        { id: 'asc' },
      ],
    });

    const READY_DEITY_SLUGS = new Set([
      'ayyappa',
      'shiva',
      'ganesha',
      'ganapathi',
      'murugan',
      'karthikeya',
    ]);

    return deities.map((d) => {
      const isReady = READY_DEITY_SLUGS.has(d.slug.toLowerCase());
      return {
        id: d.slug,
        dbId: d.id,
        slug: d.slug,
        name: d.name,
        teluguName: d.teluguName || undefined,
        tamilName: d.tamilName || undefined,
        kannadaName: d.kannadaName || undefined,
        hindiName: d.hindiName || undefined,
        description: d.description || undefined,
        category: d.category,
        imageUrl: d.imageUrl || undefined,
        imageName: d.imageName || undefined,
        isFeatured: d.isFeatured,
        orderIndex: d.orderIndex,
        aliases: d.aliases ? d.aliases.split(',').map((a) => a.trim().toLowerCase()) : [],
        isActive: d.isActive,
        isComingSoon: !isReady,
        isAvailable: isReady,
        status: isReady ? 'active' : 'coming_soon',
      };
    });
  }

  /**
   * Fetch States dynamically from MySQL database (with fallback if table not yet migrated)
   */
  async getStates(): Promise<{ id: number | string; name: string }[]> {
    try {
      const rows: any = await this.prisma.$queryRawUnsafe(
        'SELECT id, name FROM states WHERE is_active = 1 ORDER BY name ASC'
      );
      if (Array.isArray(rows) && rows.length > 0) {
        return rows.map((r: any) => ({ id: r.id, name: r.name }));
      }
    } catch {
      // Table may not yet be created in MySQL
    }

    // Default major states
    const defaultStates = [
      'Andhra Pradesh',
      'Telangana',
      'Kerala',
      'Tamil Nadu',
      'Karnataka',
      'Maharashtra',
      'Gujarat',
      'Odisha',
      'Delhi',
      'Uttar Pradesh',
    ];
    return defaultStates.map((name, idx) => ({ id: idx + 1, name }));
  }

  /**
   * Fetch Districts dynamically by state from MySQL database
   */
  async getDistricts(stateName?: string): Promise<{ id: number | string; name: string; stateName?: string }[]> {
    try {
      let query = 'SELECT id, name, state_name FROM districts WHERE is_active = 1';
      if (stateName && stateName.trim()) {
        const escaped = stateName.replace(/'/g, "''");
        query += ` AND state_name = '${escaped}'`;
      }
      query += ' ORDER BY name ASC';
      const rows: any = await this.prisma.$queryRawUnsafe(query);
      if (Array.isArray(rows) && rows.length > 0) {
        return rows.map((r: any) => ({ id: r.id, name: r.name, stateName: r.state_name }));
      }
    } catch {
      // Table may not yet be created in MySQL
    }

    const defaultDistricts: Record<string, string[]> = {
      'Andhra Pradesh': [
        'Visakhapatnam', 'Vijayawada (NTR)', 'Guntur', 'Tirupati', 'Kurnool',
        'Nellore', 'Kakinada', 'Rajahmundry', 'Anantapur', 'Kadapa', 'Eluru', 'Ongole', 'Srikakulam', 'Vizianagaram'
      ],
      'Telangana': [
        'Hyderabad', 'Warangal', 'Karimnagar', 'Nizamabad', 'Khammam',
        'Nalgonda', 'Mahabubnagar', 'Rangareddy', 'Medak', 'Adilabad', 'Siddipet', 'Suryapet'
      ],
      'Kerala': [
        'Pathanamthitta', 'Thiruvananthapuram', 'Kollam', 'Alappuzha', 'Kottayam',
        'Idukki', 'Ernakulam', 'Thrissur', 'Palakkad', 'Malappuram', 'Kozhikode'
      ],
      'Tamil Nadu': [
        'Chennai', 'Madurai', 'Coimbatore', 'Tiruchirappalli', 'Salem',
        'Tirunelveli', 'Kanchipuram', 'Thanjavur', 'Vellore'
      ],
      'Karnataka': [
        'Bengaluru Urban', 'Mysuru', 'Mangaluru (Dakshina Kannada)', 'Hubballi-Dharwad', 'Belagavi', 'Udupi'
      ],
    };

    const targetList = (stateName && defaultDistricts[stateName]) ? defaultDistricts[stateName] : (defaultDistricts['Andhra Pradesh'] || []);
    return targetList.map((name, idx) => ({ id: idx + 1, name, stateName }));
  }
}

