import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TemplesService {
  constructor(private readonly prisma: PrismaService) {}

  private transformTemple(t: any, lang = 'en') {
    let localNames: Record<string, string> = {};
    try {
      if (t.localNamesJson) localNames = JSON.parse(t.localNamesJson);
    } catch {}

    let speciality: string[] = [];
    try {
      if (t.specialityJson) speciality = JSON.parse(t.specialityJson);
    } catch {}

    let timings: any = undefined;
    try {
      if (t.timingsJson) timings = JSON.parse(t.timingsJson);
    } catch {}

    let contact: any = undefined;
    try {
      if (t.contactJson) contact = JSON.parse(t.contactJson);
    } catch {}

    const localizedName = (localNames && localNames[lang]) || t.name;

    return {
      id: t.slug,
      dbId: t.id,
      name: localizedName,
      originalName: t.name,
      localNames,
      deityId: t.deityId,
      deityName: t.deityName || undefined,
      city: t.city,
      district: t.district || undefined,
      state: t.state,
      country: t.country,
      address: t.address || undefined,
      pincode: t.pincode || undefined,
      latitude: t.latitude ?? undefined,
      longitude: t.longitude ?? undefined,
      thumbnailUrl: t.thumbnailUrl || undefined,
      heroImageUrl: t.heroImageUrl || undefined,
      about: t.about,
      history: t.history || undefined,
      speciality: speciality.length > 0 ? speciality : undefined,
      timings,
      contact,
      liveStreamId: t.liveStreamId || undefined,
      hasLiveDarshan: !!t.hasLiveDarshan,
      cropIndex: t.cropIndex ?? 0,
      isActive: t.isActive,
    };
  }

  async getTemples(query: { lang?: string; q?: string; deity?: string }) {
    const where: any = { isActive: true };

    if (query.deity && query.deity !== 'all') {
      where.deityId = query.deity.toLowerCase();
    }

    if (query.q && query.q.trim()) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q } },
        { city: { contains: q } },
        { state: { contains: q } },
        { deityName: { contains: q } },
        { district: { contains: q } },
        { localNamesJson: { contains: q } },
      ];
    }

    const temples = await this.prisma.temple.findMany({
      where,
      orderBy: [{ cropIndex: 'asc' }, { id: 'asc' }],
    });

    return temples.map((t) => this.transformTemple(t, query.lang || 'en'));
  }

  async getTempleById(idOrSlug: string, lang = 'en') {
    const numericId = parseInt(idOrSlug, 10);
    const temple = await this.prisma.temple.findFirst({
      where: {
        OR: [
          { slug: idOrSlug },
          ...(!isNaN(numericId) ? [{ id: numericId }] : []),
        ],
        isActive: true,
      },
    });

    if (!temple) {
      throw new NotFoundException(`Temple not found for identifier: ${idOrSlug}`);
    }

    return this.transformTemple(temple, lang);
  }
}
